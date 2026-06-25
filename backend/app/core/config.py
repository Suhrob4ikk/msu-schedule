import os
from pydantic_settings import BaseSettings

# Путь к SQLite БД (используется когда PostgreSQL недоступен)
_DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "data", "msu_schedule.db"
)


class Settings(BaseSettings):
    DATABASE_URL: str = f"sqlite:///{os.path.abspath(_DEFAULT_DB_PATH)}"
    XLS_BASE_URL: str = "https://msu.tj/file/timetable"
    TIMETABLE_PAGE_URL: str = "https://msu.tj/ru/timetable"
    CHECK_INTERVAL_HOURS: int = 2
    DATA_DIR: str = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
    DEBUG: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
