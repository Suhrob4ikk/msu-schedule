from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date, Boolean,
    ForeignKey, UniqueConstraint, Enum as SAEnum, Index
)
from sqlalchemy.orm import relationship
import enum
from app.database import Base


class FacultyEnum(str, enum.Enum):
    ENF = "ЕНФ"
    GF = "ГФ"


class DayEnum(str, enum.Enum):
    MONDAY = "понедельник"
    TUESDAY = "вторник"
    WEDNESDAY = "среда"
    THURSDAY = "четверг"
    FRIDAY = "пятница"
    SATURDAY = "суббота"
    SUNDAY = "воскресенье"


class PairNum(str, enum.Enum):
    I = "I"
    II = "II"
    III = "III"
    IV = "IV"
    V = "V"


# Время начала и конца пар (стандарт МГУ)
PAIR_TIMES = {
    "I":   ("08:00", "09:30"),
    "II":  ("09:45", "11:15"),
    "III": ("11:30", "13:00"),
    "IV":  ("14:00", "15:30"),
    "V":   ("15:45", "17:15"),
}


class Faculty(Base):
    __tablename__ = "faculties"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    code = Column(String(10), unique=True, nullable=False)  # ЕНФ / ГФ
    xls_file = Column(String(50), nullable=False)           # enf.xls / gf.xls
    groups = relationship("Group", back_populates="faculty")


class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True)
    faculty_id = Column(Integer, ForeignKey("faculties.id"), nullable=False)
    name = Column(String(200), nullable=False)    # ПРИКЛАДНАЯ МАТЕМАТИКА И ИНФОРМАТИКА
    year = Column(Integer, nullable=False)         # курс 1-6
    sheet_index = Column(Integer, nullable=False)  # индекс листа в XLS
    block_index = Column(Integer, nullable=False)  # блок на листе (0,1,2)
    faculty = relationship("Faculty", back_populates="groups")
    lessons = relationship("Lesson", back_populates="group", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("faculty_id", "name", "year"),)


class Teacher(Base):
    __tablename__ = "teachers"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), unique=True, nullable=False)
    lessons = relationship("Lesson", back_populates="teacher")


class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)  # "105", "лабФИЗ", "302 302"
    lessons = relationship("Lesson", back_populates="room")


class WeekSchedule(Base):
    """Запись о каждом скачанном расписании (для отслеживания изменений)."""
    __tablename__ = "week_schedules"
    id = Column(Integer, primary_key=True)
    week_number = Column(Integer, nullable=False)
    week_start = Column(Date, nullable=False)
    faculty_code = Column(String(10), nullable=False)
    downloaded_at = Column(DateTime, default=datetime.utcnow)
    file_last_modified = Column(String(50))
    is_latest = Column(Boolean, default=True, nullable=False)  # Флаг текущей версии
    lessons = relationship("Lesson", back_populates="week_schedule", cascade="all, delete-orphan")

    __table_args__ = (
        # Ускоряет поиск актуального расписания факультета (самый частый запрос)
        Index("ix_week_faculty_latest", "faculty_code", "is_latest"),
    )


class Lesson(Base):
    __tablename__ = "lessons"
    id = Column(Integer, primary_key=True)
    week_schedule_id = Column(Integer, ForeignKey("week_schedules.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    subject = Column(String(300), nullable=False)
    lesson_type = Column(String(50))                 # ЗАЧЕТ, ЭКЗАМЕН, ЛЕКЦИЯ, etc.
    day_of_week = Column(String(20), nullable=False)  # понедельник, вторник...
    lesson_date = Column(Date, nullable=True)         # конкретная дата из XLS
    pair_number = Column(String(5), nullable=False)   # I, II, III, IV, V
    week_schedule = relationship("WeekSchedule", back_populates="lessons")
    group = relationship("Group", back_populates="lessons")
    teacher = relationship("Teacher", back_populates="lessons")
    room = relationship("Room", back_populates="lessons")

    __table_args__ = (
        UniqueConstraint("week_schedule_id", "group_id", "day_of_week", "pair_number"),
        # Основные индексы — ускоряют все запросы расписания по группе/учителю/кабинету
        Index("ix_lesson_week_group", "week_schedule_id", "group_id"),
        Index("ix_lesson_teacher", "teacher_id"),
        Index("ix_lesson_room", "room_id"),
    )


class ScheduleChange(Base):
    """История изменений расписания между неделями."""
    __tablename__ = "schedule_changes"
    id = Column(Integer, primary_key=True)
    detected_at = Column(DateTime, default=datetime.utcnow)
    faculty_code = Column(String(10), nullable=False)
    change_type = Column(String(20), nullable=False)   # added / removed / changed
    group_name = Column(String(200))
    day_of_week = Column(String(20))
    pair_number = Column(String(5))
    old_value = Column(Text)
    new_value = Column(Text)


class UserSubscription(Base):
    """Подписка пользователя на группу для уведомлений."""
    __tablename__ = "user_subscriptions"
    id = Column(Integer, primary_key=True)
    session_id = Column(String(100), unique=True, nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    push_endpoint = Column(Text)     # Web Push endpoint
    push_keys = Column(Text)         # JSON с keys
    created_at = Column(DateTime, default=datetime.utcnow)


class LessonNote(Base):
    """Личные заметки студента к паре."""
    __tablename__ = "lesson_notes"
    id = Column(Integer, primary_key=True)
    session_id = Column(String(100), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    day_of_week = Column(String(20), nullable=False)
    pair_number = Column(String(5), nullable=False)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AttendanceRecord(Base):
    """Счётчик посещаемости."""
    __tablename__ = "attendance_records"
    id = Column(Integer, primary_key=True)
    session_id = Column(String(100), nullable=False)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    attended = Column(Boolean, nullable=False)
    marked_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("session_id", "lesson_id"),)


class UserRegistration(Base):
    """Регистрация пользователя: имя + группа."""
    __tablename__ = "user_registrations"
    id = Column(Integer, primary_key=True)
    device_id = Column(String(100), unique=True, nullable=False)  # уникальный ID устройства
    name = Column(String(200), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    registered_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    group = relationship("Group")


class SyncLog(Base):
    """Журнал синхронизации."""
    __tablename__ = "sync_logs"
    id = Column(Integer, primary_key=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime)
    faculty_code = Column(String(10))
    status = Column(String(20))   # success / error / no_change
    message = Column(Text)
    changes_count = Column(Integer, default=0)
