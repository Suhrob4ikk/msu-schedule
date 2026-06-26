"""Главный файл FastAPI приложения."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine
from app.models import Base
from app.api.routes import schedule, export, user, admin
from app.services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


CANONICAL_ROOMS = [
    "стадион", "лабхим", "лабфиз", "лабгеол",
    "100", "104", "105", "107", "108", "208",
    "301", "302", "401", "402", "403", "404",
    "601", "602", "603",
    "701", "702", "703", "704",
    "801", "802",
]


def seed_rooms():
    """Добавляет канонические аудитории в БД и чистит мусорные записи."""
    from app.database import SessionLocal
    from app.models import Room
    from sqlalchemy import func

    db = SessionLocal()
    try:
        # Получаем id аудиторий у которых есть хотя бы один урок — одним запросом
        rooms_with_lessons = {
            row[0] for row in
            db.query(Room.id).join(Room.lessons).distinct().all()
        }

        # Удаляем мусорные записи без уроков, которых нет в каноническом списке
        non_canonical = (
            db.query(Room)
            .filter(Room.name.notin_(CANONICAL_ROOMS))
            .all()
        )
        for r in non_canonical:
            if r.id not in rooms_with_lessons:
                db.delete(r)

        # Переименовываем "302 302" → "302" если такое есть
        bad_room = db.query(Room).filter_by(name="302 302").first()
        if bad_room:
            exists_302 = db.query(Room).filter_by(name="302").first()
            if not exists_302:
                bad_room.name = "302"
            else:
                db.delete(bad_room)

        db.flush()

        # Добавляем недостающие канонические аудитории одним запросом
        existing_names = {r.name for r in db.query(Room.name).all()}
        new_rooms = [
            Room(name=name)
            for name in CANONICAL_ROOMS
            if name not in existing_names
        ]
        if new_rooms:
            db.add_all(new_rooms)

        db.commit()
        logger.info(f"Аудитории засеяны: {len(CANONICAL_ROOMS)} штук")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Инициализация БД...")
    Base.metadata.create_all(bind=engine)
    logger.info("Таблицы созданы.")

    seed_rooms()

    start_scheduler()

    try:
        from app.services.sync import sync_all
        logger.info("Первоначальная синхронизация расписания...")
        await sync_all()
    except Exception as e:
        logger.warning(f"Первоначальная синхронизация не удалась: {e}")

    yield

    stop_scheduler()


app = FastAPI(
    title="МГУ Душанбе — Расписание занятий",
    description="API для доступа к расписанию МГУ филиал Душанбе (msu.tj)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # allow_origins=["*"] + allow_credentials=True — невалидная комбинация по спецификации CORS.
    # Браузеры отклоняют credentialed-запросы к wildcard origin.
    # Поскольку мы не используем cookies, credentials=False — корректное решение.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(schedule.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(user.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "МГУ Душанбе — API расписания занятий", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
