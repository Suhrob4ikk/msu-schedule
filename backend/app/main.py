"""Главный файл FastAPI приложения."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine
from app.models import Base
from app.api.routes import schedule, export, user, admin, dev
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

        # Нормализуем задвоенные имена: "107 107" → "107", "302 302" → "302" и т.д.
        all_rooms = db.query(Room).all()
        for room in all_rooms:
            parts = room.name.split()
            if len(parts) >= 2 and len(parts) % 2 == 0 and parts[:len(parts)//2] == parts[len(parts)//2:]:
                canonical = " ".join(parts[:len(parts)//2])
                existing = db.query(Room).filter(Room.name == canonical, Room.id != room.id).first()
                if existing:
                    # Переносим уроки и удаляем дубль
                    from app.models import Lesson
                    db.query(Lesson).filter(Lesson.room_id == room.id).update({"room_id": existing.id})
                    db.delete(room)
                else:
                    room.name = canonical

        db.flush()

        # Объединяем дубли по регистру: «лабФИЗ» и «лабфиз» → «лабфиз».
        # Канонической считаем запись в нижнем регистре; уроки переносим, дубль удаляем.
        from app.models import Lesson
        by_lower: dict[str, list] = {}
        for r in db.query(Room).all():
            by_lower.setdefault(r.name.lower(), []).append(r)
        for lname, grp in by_lower.items():
            if len(grp) == 1 and grp[0].name == lname:
                continue
            canonical = next((r for r in grp if r.name == lname), None)
            others = [r for r in grp if r is not canonical]
            if canonical is None:
                canonical = others.pop(0)
            for r in others:
                db.query(Lesson).filter(Lesson.room_id == r.id).update({"room_id": canonical.id})
                db.delete(r)
            db.flush()  # удаляем дубли ДО переименования — иначе конфликт UNIQUE
            if canonical.name != lname:
                canonical.name = lname

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


def load_teacher_overrides():
    """Сидит таблицу замен ФИО значениями по умолчанию (если пусто) и
    загружает все замены в активную карту в памяти."""
    from app.database import SessionLocal
    from app.models import TeacherOverride
    from app.services.parser import TEACHER_NAME_OVERRIDES, set_active_overrides

    db = SessionLocal()
    try:
        if db.query(TeacherOverride).count() == 0:
            for (subject, code), real in TEACHER_NAME_OVERRIDES.items():
                db.add(TeacherOverride(subject=subject, code=code, real_name=real))
            db.commit()
        rows = db.query(TeacherOverride).all()
        set_active_overrides([(r.subject, r.code, r.real_name) for r in rows])
        logger.info(f"Замены ФИО загружены: {len(rows)}")
    except Exception as e:
        logger.warning(f"Не удалось загрузить замены ФИО: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Инициализация БД...")
    Base.metadata.create_all(bind=engine)
    # create_all не добавляет индексы к уже существующим таблицам — создаём вручную.
    # CREATE INDEX IF NOT EXISTS работает и в SQLite, и в PostgreSQL.
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_lesson_week_day_pair "
                "ON lessons (week_schedule_id, day_of_week, pair_number)"
            ))
        logger.info("Индекс ix_lesson_week_day_pair готов.")
    except Exception as e:
        logger.warning(f"Не удалось создать индекс ix_lesson_week_day_pair: {e}")
    # create_all не добавляет колонки к существующим таблицам — добавляем вручную.
    # week_start в истории изменений нужен, чтобы показывать точную дату («Пн, 08.09»).
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE schedule_changes ADD COLUMN IF NOT EXISTS week_start DATE"
            ))
        logger.info("Колонка schedule_changes.week_start готова.")
    except Exception as e:
        logger.warning(f"Не удалось добавить колонку week_start: {e}")
    logger.info("Таблицы созданы.")

    seed_rooms()
    load_teacher_overrides()

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
app.include_router(dev.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "МГУ Душанбе — API расписания занятий", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
