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
    # Больше не используется: частота проверок теперь задаётся таблицей в
    # services/scheduler.py. Поле оставлено, потому что переменная может быть
    # задана на Render — без поля настройки отвергли бы её и сервер не запустился бы.
    CHECK_INTERVAL_HOURS: int = 2
    DATA_DIR: str = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
    DEBUG: bool = True
    # Секретный ключ для admin-эндпоинтов. Передаётся в заголовке X-Admin-Secret.
    # Если не задан — admin-эндпоинты недоступны.
    ADMIN_SECRET: str = ""
    # Пароль скрытой панели разработчика (/dev). ТОЛЬКО из переменной окружения.
    # Если пусто — панель полностью отключена (все /api/dev/* отвечают 404).
    DEV_PANEL_PASSWORD: str = ""
    # Email-уведомления при регистрации (Resend API)
    RESEND_API_KEY: str = ""  # ключ из resend.com/api-keys
    NOTIFY_EMAIL: str = "davlatovsurob@gmail.com"
    # Web Push (VAPID)
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:davlatovsuhrob1234@gmail.com"
    # Токен для GitHub API (только чтение msu-schedule-mobile) — без него
    # анонимный лимит 60 запросов/час общий на весь IP хостинга и делится
    # с чужими проектами, легко истощается. Если пусто — запросы идут
    # анонимно (работает, но менее надёжно).
    GITHUB_API_TOKEN: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

# Neon, Render и другие хостинги отдают адрес как «postgres://…» или
# «postgresql://…» — SQLAlchemy по такому адресу ищет старый драйвер psycopg2,
# а в проекте стоит psycopg 3. Дописываем имя драйвера сами, чтобы адрес из
# панели хостинга можно было вставить как есть.
for _prefix in ("postgres://", "postgresql://"):
    if settings.DATABASE_URL.startswith(_prefix):
        settings.DATABASE_URL = "postgresql+psycopg://" + settings.DATABASE_URL[len(_prefix):]
        break
