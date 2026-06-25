from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


class TeacherSchema(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class RoomSchema(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class GroupSchema(BaseModel):
    id: int
    name: str
    year: int
    faculty_code: Optional[str] = None

    class Config:
        from_attributes = True


class LessonSchema(BaseModel):
    id: int
    subject: str
    lesson_type: Optional[str]
    day_of_week: str
    lesson_date: Optional[date]
    pair_number: str
    pair_time_start: Optional[str] = None
    pair_time_end: Optional[str] = None
    teacher: Optional[TeacherSchema]
    room: Optional[RoomSchema]
    group: Optional[GroupSchema]

    class Config:
        from_attributes = True


class WeekScheduleSchema(BaseModel):
    id: int
    week_number: Optional[int]
    week_start: Optional[date]
    faculty_code: str
    downloaded_at: datetime
    file_last_modified: Optional[str]

    class Config:
        from_attributes = True


class ScheduleChangeSchema(BaseModel):
    id: int
    detected_at: datetime
    faculty_code: str
    change_type: str
    group_name: Optional[str]
    day_of_week: Optional[str]
    pair_number: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]

    class Config:
        from_attributes = True


class LessonNoteCreate(BaseModel):
    group_id: int
    day_of_week: str
    pair_number: str
    note: str


class LessonNoteSchema(BaseModel):
    id: int
    group_id: int
    day_of_week: str
    pair_number: str
    note: str
    created_at: datetime

    class Config:
        from_attributes = True


class AttendanceCreate(BaseModel):
    lesson_id: int
    attended: bool


class AttendanceSchema(BaseModel):
    id: int
    lesson_id: int
    attended: bool
    marked_at: datetime

    class Config:
        from_attributes = True


class SyncLogSchema(BaseModel):
    id: int
    started_at: datetime
    finished_at: Optional[datetime]
    faculty_code: Optional[str]
    status: Optional[str]
    message: Optional[str]
    changes_count: Optional[int]

    class Config:
        from_attributes = True


class TodayScheduleItem(BaseModel):
    """Элемент расписания 'что сейчас идёт' / 'следующая пара'."""
    pair_number: str
    pair_time_start: str
    pair_time_end: str
    subject: str
    lesson_type: Optional[str]
    teacher: Optional[str]
    room: Optional[str]
    group_name: str
    is_current: bool = False
    is_next: bool = False
    minutes_until: Optional[int] = None


class RoomAvailabilityItem(BaseModel):
    room_name: str
    is_free: bool
    occupied_by: Optional[str] = None
    free_until: Optional[str] = None


class StatsSchema(BaseModel):
    faculty_code: str
    group_name: str
    year: int
    total_lessons_week: int
    lessons_by_day: dict
    most_loaded_day: Optional[str]
    unique_teachers: int
    unique_subjects: int
