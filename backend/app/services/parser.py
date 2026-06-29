"""
Парсер XLS-файлов расписания МГУ филиал Душанбе.

Структура файла (enf.xls / gf.xls):
  - 6 листов = 6 курсов
  - Каждый лист: 26 строк x 14 столбцов
  - 3 блока по группе на лист (строки 0-9, 10-17, 18-25)
  - Строки блока: [0]=название_факультета, [1]=заголовок_факультета,
                  [2]=название_группы, [3]=дни недели, [4]=даты,
                  [5-9]=пары I-V
  - Столбцы: 0=номер_пары, 1+2=пн_предмет+аудитория,
             3+4=вт, 5+6=ср, 7+8=чт, 9+10=пт, 11+12=сб, 13=вс
"""

import re
import os
import asyncio
import time as _time
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import httpx
import xlrd

from app.core.config import settings

logger = logging.getLogger(__name__)

# Маппинг колонки к дню недели
COL_TO_DAY = {
    1: "понедельник",
    3: "вторник",
    5: "среда",
    7: "четверг",
    9: "пятница",
    11: "суббота",
    13: "воскресенье",
}

# Файлы по факультетам
FACULTY_FILES = {
    "ЕНФ": "enf.xls",
    "ГФ": "gf.xls",
}

# Структура каждого блока: (начальная_строка, смещение_к_группе, смещение_к_дням, смещение_к_датам, смещение_к_парам)
# Блок 0: сначала 2 строки шапки (университет + заголовок), потом группа
# Блоки 1 и 2: сразу название группы
BLOCKS = [
    {"start": 0,  "group_offset": 2, "days_offset": 3, "dates_offset": 4, "pairs_offset": 5, "header_offset": 1},
    {"start": 10, "group_offset": 0, "days_offset": 1, "dates_offset": 2, "pairs_offset": 3, "header_offset": None},
    {"start": 18, "group_offset": 0, "days_offset": 1, "dates_offset": 2, "pairs_offset": 3, "header_offset": None},
]

# Номера пар
PAIR_NUMBERS = ["I", "II", "III", "IV", "V"]


def parse_subject_cell(cell_value: str) -> dict:
    """
    Разбирает строку вида:
    'Дифференциальные уравнения (Агеев О.Н.) [//ЭКЗАМЕН]'
    → {'subject': '...', 'teacher': '...', 'lesson_type': '...'}
    """
    val = str(cell_value).strip()
    if not val:
        return {}

    teacher = None
    lesson_type = None
    subject = val

    # Извлекаем тип занятия из [...] или [//...]
    type_match = re.search(r'\[(?://)?([^\]]+)\]', val)
    if type_match:
        raw_type = type_match.group(1).strip()
        # Если это не число — это тип занятия
        if not re.match(r'^\d+$', raw_type):
            lesson_type = raw_type
        subject = val[:type_match.start()].strip()

    # Извлекаем преподавателя из (...)
    teacher_match = re.search(r'\(([^)]+)\)', subject)
    if teacher_match:
        teacher = teacher_match.group(1).strip()
        subject = subject[:teacher_match.start()].strip()

    # Очищаем от лишних символов
    subject = re.sub(r'\s+', ' ', subject).strip(' .,')

    return {
        "subject": subject,
        "teacher": teacher,
        "lesson_type": lesson_type,
    }


def parse_room(cell_value) -> Optional[str]:
    """Нормализует номер аудитории (может быть float или строка)."""
    if not cell_value or str(cell_value).strip() in ('', '0.0'):
        return None
    val = str(cell_value).strip()
    # Убираем .0 у числовых значений
    if re.match(r'^\d+\.0$', val):
        val = val[:-2]
    # Убираем задвоенные значения: "107 107" → "107"
    parts = val.split()
    if len(parts) >= 2 and len(parts) % 2 == 0:
        half = len(parts) // 2
        if parts[:half] == parts[half:]:
            val = " ".join(parts[:half])
    return val


def parse_date(date_str: str) -> Optional[date]:
    """Парсит строку '22 июня 2026г.' в объект date."""
    MONTHS = {
        'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
        'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
        'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
    }
    m = re.match(r'(\d+)\s+(\S+)\s+(\d{4})', date_str.strip())
    if not m:
        return None
    day, month_name, year = int(m.group(1)), m.group(2).lower(), int(m.group(3))
    month = MONTHS.get(month_name)
    if not month:
        return None
    return date(year, month, day)


def parse_week_number(header: str) -> Optional[int]:
    """Извлекает номер недели из 'РАСПИСАНИЕ ЗАНЯТИЙ ЕНФ (весна: 21-я неделя)'."""
    m = re.search(r'(\d+)-я неделя', header)
    return int(m.group(1)) if m else None


def parse_xls_file(file_path: str, faculty_code: str) -> dict:
    """
    Главная функция парсинга XLS.
    Возвращает структурированный словарь со всеми данными расписания.
    """
    logger.info(f"Парсим {file_path} (факультет {faculty_code})")

    wb = xlrd.open_workbook(file_path, encoding_override='cp1251')
    result = {
        "faculty_code": faculty_code,
        "week_number": None,
        "week_start": None,
        "groups": [],  # список групп с их занятиями
    }

    for sheet_idx in range(wb.nsheets):
        sheet = wb.sheets()[sheet_idx]
        year = sheet_idx + 1  # курс (1-6)

        # Разбираем каждый из 3 блоков групп на листе
        for block_num, block in enumerate(BLOCKS):
            block_start = block["start"]

            def get_cell(offset, col, bs=block_start):
                r = bs + offset
                if r < sheet.nrows and col < sheet.ncols:
                    return str(sheet.cell(r, col).value).strip()
                return ""

            # Название группы
            group_name_raw = get_cell(block["group_offset"], 0)
            if not group_name_raw:
                continue

            # Разбираем "ПРИКЛАДНАЯ МАТЕМАТИКА И ИНФОРМАТИКА,     1 курс"
            group_match = re.match(r'^(.+?),\s*(\d+)\s+курс', group_name_raw, re.IGNORECASE)
            if group_match:
                group_name = group_match.group(1).strip()
                parsed_year = int(group_match.group(2))
            else:
                group_name = group_name_raw
                parsed_year = year

            # Заголовок для извлечения номера недели (только в блоке 0)
            if block["header_offset"] is not None:
                header_text = get_cell(block["header_offset"], 0)
                if result["week_number"] is None:
                    result["week_number"] = parse_week_number(header_text)

            # Даты по дням для конкретных уроков
            day_dates = {}
            for col, day in COL_TO_DAY.items():
                date_str = get_cell(block["dates_offset"], col)
                if date_str:
                    day_dates[day] = parse_date(date_str)

            # Первая дата = начало недели
            if result["week_start"] is None and day_dates:
                result["week_start"] = day_dates.get("понедельник")

            # Собираем занятия для группы
            lessons = []
            pair_start_offset = block["pairs_offset"]

            for pair_offset, pair_num in enumerate(PAIR_NUMBERS):
                pair_row = block_start + pair_start_offset + pair_offset
                if pair_row >= sheet.nrows:
                    break

                for day_col, day_name in COL_TO_DAY.items():
                    if day_col >= sheet.ncols:
                        continue

                    subject_cell = str(sheet.cell(pair_row, day_col).value).strip()
                    room_col = day_col + 1
                    room_cell = sheet.cell(pair_row, room_col).value if room_col < sheet.ncols else ""

                    if not subject_cell or subject_cell in ('0.0', '0'):
                        continue

                    parsed = parse_subject_cell(subject_cell)
                    if not parsed.get("subject"):
                        continue

                    room = parse_room(room_cell)
                    lesson_date = day_dates.get(day_name)

                    lessons.append({
                        "pair_number": pair_num,
                        "day_of_week": day_name,
                        "lesson_date": lesson_date,
                        "subject": parsed["subject"],
                        "teacher": parsed.get("teacher"),
                        "lesson_type": parsed.get("lesson_type"),
                        "room": room,
                    })

            if lessons or group_name:
                result["groups"].append({
                    "name": group_name,
                    "year": parsed_year,
                    "sheet_index": sheet_idx,
                    "block_index": block_num,
                    "lessons": lessons,
                })

    logger.info(
        f"Спарсено групп: {len(result['groups'])}, "
        f"неделя: {result['week_number']}, "
        f"дата: {result['week_start']}"
    )
    return result


async def download_xls(faculty_code: str) -> tuple[str, Optional[str]]:
    """
    Скачивает XLS-файл расписания.
    Возвращает (путь_к_файлу, last_modified_header).
    """
    filename = FACULTY_FILES[faculty_code]
    url = f"{settings.XLS_BASE_URL}/{filename}"
    save_path = os.path.join(settings.DATA_DIR, filename)

    os.makedirs(settings.DATA_DIR, exist_ok=True)

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://msu.tj/ru/timetable",
        })
        response.raise_for_status()

        with open(save_path, "wb") as f:
            f.write(response.content)

        last_modified = response.headers.get("Last-Modified")
        logger.info(f"Скачан {filename}: {len(response.content)} байт, Last-Modified: {last_modified}")
        return save_path, last_modified


async def get_remote_last_modified(faculty_code: str) -> Optional[str]:
    """HEAD-запрос для проверки даты изменения файла без скачивания."""
    filename = FACULTY_FILES[faculty_code]
    url = f"{settings.XLS_BASE_URL}/{filename}"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.head(url)
            return response.headers.get("Last-Modified")
    except Exception as e:
        logger.warning(f"HEAD запрос не удался для {url}: {e}")
        return None


# ── HTML-скрапинг реальных ФИО преподавателей ───────────────────────────────

# ВАЖНО: msu.tj закрыл HTML-страницы расписания анти-бот защитой Hostia
# (отдаёт HTTP 416 + JS-челлендж на каждый запрос), поэтому автоматический
# скрапинг ФИО больше не работает — он возвращал 0 записей, но при этом делал
# ~450 бесполезных HTTP-запросов на каждую синхронизацию. Скрапинг отключён.
#
# Реальные ФИО для кодов кафедр/предметов, которые университет вписал в Excel
# вместо фамилии преподавателя. Настоящие имена взяты со страниц расписания msu.tj.
#
# КАК ДОБАВИТЬ НОВОЕ ИСПРАВЛЕНИЕ:
#   ключ = (предмет.lower(), 'код_как_в_файле')   значение = 'Фамилия И.О.'
# Например: ("физика", "кафедра физики"): "Иванов А.Б.".
# Применяется при синхронизации (привязка пары к реальному преподавателю)
# и сразу при выдаче расписания (подмена подписи на карточке).
TEACHER_NAME_OVERRIDES: dict = {
    ("информатика", "ИТУ"): "Джумаев Э.Х.",
    ("иностранный язык", "английский"): "Фазилова Ш.К.",
}

# Включать только если msu.tj снимет анти-бот защиту со страниц расписания.
SCRAPE_HTML_TEACHERS: bool = False


def override_teacher_name(subject: Optional[str], teacher: Optional[str]) -> Optional[str]:
    """Настоящее ФИО для кода кафедры/предмета из TEACHER_NAME_OVERRIDES, иначе None."""
    if not subject or not teacher:
        return None
    return TEACHER_NAME_OVERRIDES.get((subject.strip().lower(), teacher.strip()))

_HTML_TEACHER_CACHE: dict = {}
_HTML_TEACHER_CACHE_TS: float = 0.0
_HTML_TEACHER_TTL: float = 3600.0  # 1 час

_DAYS_RU = {"понедельник", "вторник", "среда", "четверг", "пятница", "суббота"}
_PAIR_NUM = {"1": "I", "2": "II", "3": "III", "4": "IV", "5": "V"}


def _parse_html_timetable(html: str, course: int, result: dict) -> None:
    """Парсит HTML-страницу msu.tj и добавляет найденные ФИО в result."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return

    soup = BeautifulSoup(html, "html.parser")
    current_day: Optional[str] = None

    for tag in soup.find_all(True):
        if not tag.name:
            continue

        # Определяем день по заголовочным тегам
        if tag.name in ("h2", "h3", "h4", "b", "strong"):
            text = tag.get_text().strip().lower()
            if text in _DAYS_RU:
                current_day = text

        # Разбираем таблицу расписания
        elif tag.name == "table" and current_day:
            for row in tag.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) < 5:
                    continue
                pair_text = cells[0].get_text(separator=" ").strip()
                subject = cells[1].get_text().strip()
                teacher = cells[2].get_text().strip()

                m = re.match(r"(\d)", pair_text)
                if not m:
                    continue
                pair_num = _PAIR_NUM.get(m.group(1))

                # Сохраняем только настоящие ФИО (содержат инициалы вида А.Б.)
                if pair_num and subject and teacher and re.search(r"[А-ЯЁ]\.[А-ЯЁ]", teacher):
                    key = (course, current_day, pair_num, subject.lower())
                    if key not in result:
                        result[key] = teacher


async def scrape_html_teacher_map() -> dict:
    """
    Обходит HTML-страницы расписания msu.tj и собирает маппинг:
      (курс, день_недели, номер_пары, предмет_lower) → ФИО_преподавателя

    Кешируется на 1 час. Вызывается во время синхронизации, чтобы заменить
    коды кафедр (ИТУ, английский…) реальными ФИО из HTML.

    ОТКЛЮЧЕНО: msu.tj закрыл страницы расписания анти-бот защитой (HTTP 416),
    поэтому сетевой скрапинг не работает. Возвращаем только ручную карту
    TEACHER_NAME_OVERRIDES. Сетевые запросы включаются флагом SCRAPE_HTML_TEACHERS.
    """
    global _HTML_TEACHER_CACHE, _HTML_TEACHER_CACHE_TS

    if not SCRAPE_HTML_TEACHERS:
        return {}

    if _HTML_TEACHER_CACHE and (_time.time() - _HTML_TEACHER_CACHE_TS) < _HTML_TEACHER_TTL:
        return _HTML_TEACHER_CACHE

    try:
        from bs4 import BeautifulSoup  # noqa: F401 – проверяем доступность
    except ImportError:
        logger.warning("beautifulsoup4 не установлен — HTML-скрапинг преподавателей отключён")
        return {}

    result: dict = {}
    seen_hashes: set = set()
    sem = asyncio.Semaphore(12)

    async def fetch_one(client: httpx.AsyncClient, fac: int, dir_: int, course: int) -> None:
        url = (
            f"https://msu.tj/ru/timetable"
            f"?faculty={fac}&direction={dir_}&course={course}&day=all"
        )
        async with sem:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    return
                html = r.text
                # Страница без расписания — пропускаем
                if "ДИСЦИПЛИНА" not in html:
                    return
                page_hash = hash(html[100:700])
                if page_hash in seen_hashes:
                    return
                seen_hashes.add(page_hash)
                _parse_html_timetable(html, course, result)
            except Exception as e:
                logger.debug(f"HTML scrape {url}: {e}")

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(8.0),
        follow_redirects=True,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MSU-Schedule/2.0)",
            "Accept-Language": "ru-RU,ru;q=0.9",
        },
    ) as client:
        tasks = [
            fetch_one(client, fac, dir_, course)
            for fac in range(1, 6)    # пробуем faculty ID 1-5
            for dir_ in range(1, 16)  # пробуем direction ID 1-15
            for course in range(1, 7) # курсы 1-6
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

    _HTML_TEACHER_CACHE = result
    _HTML_TEACHER_CACHE_TS = _time.time()
    logger.info(
        f"HTML-скрапинг завершён: {len(result)} записей преподавателей "
        f"с {len(seen_hashes)} страниц msu.tj"
    )
    return result
