from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
# Postgres (Neon): бесплатный тариф ограничивает число соединений, а при
# нагрузке в 20–30 студентов хватает горстки. Neon усыпляет базу после ~5 минут
# простоя и обрывает соединения — pool_pre_ping проверяет соединение перед
# использованием, pool_recycle не держит старые дольше 5 минут.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=not _is_sqlite,
    **({"pool_size": 5, "max_overflow": 5, "pool_recycle": 300} if not _is_sqlite else
       {"connect_args": {"check_same_thread": False}}),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
