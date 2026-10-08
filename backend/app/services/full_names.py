"""Полные имена преподавателей: опрос студентов и решения владельца.

Как устроено (решения владельца, 8 окт 2026):
- в расписании имя остаётся «Джумаев Э.Х.», полное «Джумаев Эраж Хакназарович»
  раскрывается кнопкой — если владелец его утвердил (TeacherFullName);
- пока не утвердил — студентов групп, у которых преподаватель ведёт пары на этой
  неделе, спрашивают: выбрать вариант, предложить своё или «не знаю»;
- своё имя обязано начинаться на буквы инициалов (для «Э.Х.» — на «Э» и «Х»),
  окончания не проверяем; другим оно видно только после одобрения владельцем;
- итог утверждает только владелец (панель разработчика), сам ничего не утверждается;
- раз в день в 13:00 владельцу письмо со всем, что ждёт проверки.

Что базе приходится делать часто, лежит в кэше: список утверждённых имён и
открытых вариантов отдаёт /api/schedule/full-names (кэш готовых ответов).
База трогается только при ответе студента и в панели.
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Lesson, Teacher, WeekSchedule, UserRegistration,
    TeacherFullName, TeacherNameVariant, TeacherNameVote,
)

logger = logging.getLogger(__name__)

MAX_PROPOSALS_PER_DAY = 10
_NAME_RE = re.compile(r"^(.*?)\s+((?:[А-ЯЁ][а-яё]?\.\s*)+)$")


# ── имена ─────────────────────────────────────────────────────────────────
def split_short(short: str) -> tuple[str, list[str]]:
    """«Одинабеков Дж.М.» → («Одинабеков», ["Дж", "М"]); «Шодиев М.» → («Шодиев», ["М"])."""
    m = _NAME_RE.match((short or "").strip())
    if not m:
        return (short or "").strip(), []
    return m.group(1), re.findall(r"[А-ЯЁ][а-яё]?", m.group(2))


def full_display(short: str, full_name: str) -> str:
    """«Джумаев Э.Х.» + «Эраж Хакназарович» → «Джумаев Эраж Хакназарович»."""
    return f"{split_short(short)[0]} {full_name}"


def tidy(text: str) -> str:
    """Пробелы в порядок, каждое слово с заглавной: «эраж  хакназарович» → «Эраж Хакназарович»."""
    words = re.sub(r"\s+", " ", (text or "").strip()).split(" ")
    return " ".join("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")) for w in words if w)


def norm(text: str) -> str:
    return re.sub(r"[\s\-]+", " ", (text or "").lower().replace("ё", "е")).strip()


def check_proposal(short: str, text: str) -> tuple[Optional[str], Optional[str]]:
    """(«Имя Отчество» в порядке, None) или (None, текст ошибки для студента)."""
    value = tidy(text)
    if not value:
        return None, "Впишите имя и отчество"
    if len(value) > 60:
        return None, "Слишком длинно"
    if re.search(r"[^А-Яа-яЁё\- ]", value):
        return None, "Только русские буквы"
    _, initials = split_short(short)
    words = value.split(" ")
    if not initials:
        return value, None
    if len(words) < len(initials):
        return None, "Впишите имя и отчество" if len(initials) > 1 else "Впишите имя"
    for i, ini in enumerate(initials):
        if not norm(words[i]).startswith(norm(ini)):
            what = "Имя" if i == 0 else "Отчество"
            return None, f"{what} должно начинаться на «{ini}» — как в «{'.'.join(initials)}.»"
    return value, None


def _levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _close(x: str, y: str) -> Optional[str]:
    """Насколько похожи два слова: same / short (одно — начало другого) / typo / None."""
    if x == y:
        return "same"
    if min(len(x), len(y)) >= 3 and (x.startswith(y) or y.startswith(x)):
        return "short"
    if _levenshtein(x, y) <= 2:
        return "typo"
    return None


def similarity(a: str, b: str) -> Optional[str]:
    """Чем вариант похож на другой — для владельца перед «Разрешить». None — не похож."""
    wa, wb = norm(a).split(" "), norm(b).split(" ")
    if wa == wb:
        return "то же самое"
    first = _close(wa[0], wb[0])
    second = _close(wa[1], wb[1]) if len(wa) > 1 and len(wb) > 1 else "same"
    if first and second:
        parts = []
        if first != "same":
            parts.append("имя пишется иначе")
        if second == "short":
            parts.append("отчество короче или длиннее")
        elif second == "typo":
            parts.append("отчество пишется иначе")
        if len(wa) != len(wb):
            parts.append("у одного нет отчества")
        return "очень похож: " + ", ".join(parts) if parts else "то же самое"
    if first == "same":
        return "то же имя, другое отчество"
    if second == "same":
        return "то же отчество, другое имя"
    return None


# ── кто ведёт пары у группы ───────────────────────────────────────────────
def _week_ids(db: Session, monday) -> list[int]:
    ids = []
    for fcode in ["ЕНФ", "ГФ"]:
        w = (
            db.query(WeekSchedule)
            .filter(WeekSchedule.faculty_code == fcode, WeekSchedule.week_start == monday)
            .order_by(WeekSchedule.downloaded_at.desc())
            .first()
        )
        if w:
            ids.append(w.id)
    return ids


def persons(lesson: Lesson) -> list[str]:
    """Настоящие ФИО пары по отдельности («Балхова С.Я., Собко В.И.» → два человека)."""
    from app.api.routes.schedule import is_real_teacher_name
    from app.services.parser import override_teacher_name
    if not lesson.teacher:
        return []
    name = override_teacher_name(lesson.subject, lesson.teacher.name) or lesson.teacher.name
    return [p.strip() for p in name.split(",") if p.strip() and is_real_teacher_name(p.strip())]


def group_teachers(db: Session, group_id: int, weeks: int = 1) -> set[str]:
    """Кто ведёт пары у группы на этой неделе (weeks=2 — и на следующей)."""
    from app.api.routes.schedule import dushanbe_today
    today = dushanbe_today()
    monday = today - timedelta(days=today.weekday())
    ids = []
    for k in range(weeks):
        ids += _week_ids(db, monday + timedelta(days=7 * k))
    if not ids:
        return set()
    out: set[str] = set()
    for l in db.query(Lesson).filter(Lesson.week_schedule_id.in_(ids), Lesson.group_id == group_id).all():
        out.update(persons(l))
    return out


def all_current_teachers(db: Session) -> dict[str, set]:
    """Все преподаватели этой и следующей недели → группы, у которых они ведут."""
    from app.api.routes.schedule import dushanbe_today
    today = dushanbe_today()
    monday = today - timedelta(days=today.weekday())
    ids = _week_ids(db, monday) + _week_ids(db, monday + timedelta(days=7))
    out: dict[str, set] = {}
    if not ids:
        return out
    for l in db.query(Lesson).filter(Lesson.week_schedule_id.in_(ids)).all():
        for p in persons(l):
            g = out.setdefault(p, set())
            if l.group:
                g.add(f"{l.group.year} курс · {l.group.name}")
    return out


# ── публичные данные (кэшируются) ─────────────────────────────────────────
def public_data(db: Session) -> dict:
    final = {r.teacher: full_display(r.teacher, r.full_name) for r in db.query(TeacherFullName).all()}
    variants: dict[str, list] = {}
    for v in (db.query(TeacherNameVariant)
              .filter(TeacherNameVariant.status == "open")
              .order_by(TeacherNameVariant.id).all()):
        if v.teacher not in final:
            variants.setdefault(v.teacher, []).append({"id": v.id, "name": v.full_name})
    return {"names": final, "variants": variants}


def _clear_cache() -> None:
    from app.api.routes.schedule import clear_free_rooms_cache
    clear_free_rooms_cache()


# ── ответ студента ────────────────────────────────────────────────────────
class VoteError(Exception):
    pass


def results(db: Session, teacher: str, device_id: str) -> dict:
    """Что видит студент после ответа: голоса за открытые варианты и свой ответ."""
    vote = db.query(TeacherNameVote).filter_by(teacher=teacher, device_id=device_id).first()
    counts: dict[int, int] = {}
    for v in db.query(TeacherNameVote).filter(TeacherNameVote.teacher == teacher,
                                              TeacherNameVote.variant_id.isnot(None)).all():
        counts[v.variant_id] = counts.get(v.variant_id, 0) + 1
    opens = (db.query(TeacherNameVariant)
             .filter_by(teacher=teacher, status="open").order_by(TeacherNameVariant.id).all())
    mine = None
    pending = None
    if vote and vote.variant_id:
        var = db.get(TeacherNameVariant, vote.variant_id)
        if var and var.status == "open":
            mine = var.id
        elif var and var.status == "pending":
            pending = var.full_name
    final = db.get(TeacherFullName, teacher)
    return {
        "teacher": teacher,
        "answered": vote is not None,
        "dunno": bool(vote and vote.variant_id is None),
        "mine": mine,
        "pending": pending,
        "final": full_display(teacher, final.full_name) if final else None,
        "variants": [{"id": v.id, "name": v.full_name, "votes": counts.get(v.id, 0)} for v in opens],
    }


def vote(db: Session, device_id: str, teacher: str, variant_id: Optional[int] = None,
         dunno: bool = False, proposal: Optional[str] = None) -> dict:
    reg = db.query(UserRegistration).filter_by(device_id=device_id).first()
    if not reg or not reg.group_id:
        raise VoteError("Сначала выберите группу в Кабинете")
    if teacher not in group_teachers(db, reg.group_id, weeks=2):
        raise VoteError("У вашей группы этот преподаватель сейчас не ведёт пары")
    if db.get(TeacherFullName, teacher):
        raise VoteError("Полное имя уже известно")

    target_id: Optional[int] = None
    if proposal is not None:
        value, err = check_proposal(teacher, proposal)
        if err:
            raise VoteError(err)
        # То же самое, что уже есть (с точностью до регистра и «ё»), — голос туда
        same = next((v for v in db.query(TeacherNameVariant).filter_by(teacher=teacher).all()
                     if norm(v.full_name) == norm(value)), None)
        if same and same.status == "rejected":
            raise VoteError("Этот вариант уже проверяли — он не подошёл")
        if same:
            target_id = same.id
        else:
            day_ago = datetime.utcnow() - timedelta(days=1)
            mine_today = (db.query(TeacherNameVariant)
                          .filter(TeacherNameVariant.proposed_by == device_id,
                                  TeacherNameVariant.created_at > day_ago).count())
            if mine_today >= MAX_PROPOSALS_PER_DAY:
                raise VoteError("Слишком много предложений за день — попробуйте завтра")
            var = TeacherNameVariant(teacher=teacher, full_name=value, status="pending",
                                     source="student", proposed_by=device_id)
            db.add(var)
            db.flush()
            target_id = var.id
    elif not dunno:
        var = db.get(TeacherNameVariant, variant_id) if variant_id else None
        if not var or var.teacher != teacher or var.status != "open":
            raise VoteError("Такого варианта нет")
        target_id = var.id

    row = db.query(TeacherNameVote).filter_by(teacher=teacher, device_id=device_id).first()
    if row:
        row.variant_id = target_id
        row.updated_at = datetime.utcnow()
    else:
        db.add(TeacherNameVote(teacher=teacher, device_id=device_id, variant_id=target_id))
    db.commit()
    return results(db, teacher, device_id)


# ── владелец ──────────────────────────────────────────────────────────────
def admin_overview(db: Session) -> dict:
    final = {r.teacher: r.full_name for r in db.query(TeacherFullName).all()}
    variants = db.query(TeacherNameVariant).order_by(TeacherNameVariant.id).all()
    counts: dict[int, int] = {}
    dunno: dict[str, int] = {}
    for v in db.query(TeacherNameVote).all():
        if v.variant_id:
            counts[v.variant_id] = counts.get(v.variant_id, 0) + 1
        else:
            dunno[v.teacher] = dunno.get(v.teacher, 0) + 1
    current = all_current_teachers(db)

    by_teacher: dict[str, list] = {}
    for v in variants:
        by_teacher.setdefault(v.teacher, []).append(v)

    def brief(v):
        return {"id": v.id, "name": v.full_name, "status": v.status, "source": v.source,
                "votes": counts.get(v.id, 0)}

    pending = []
    # Варианты про одного преподавателя — рядом, внутри — по времени
    for v in sorted(variants, key=lambda v: (v.teacher, v.id)):
        if v.status != "pending":
            continue
        others = []
        for o in by_teacher.get(v.teacher, []):
            if o.id == v.id or o.status == "rejected":
                continue
            others.append({**brief(o), "similar": similarity(v.full_name, o.full_name)})
        if v.teacher in final:
            others.insert(0, {"id": None, "name": final[v.teacher], "status": "final", "source": "",
                              "votes": 0, "similar": similarity(v.full_name, final[v.teacher])})
        pending.append({
            **brief(v),
            "teacher": v.teacher,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "groups": sorted(current.get(v.teacher, [])),
            "others": others,
        })

    teachers = []
    for t in sorted(set(current) | set(by_teacher) | set(final)):
        teachers.append({
            "teacher": t,
            "final": final.get(t),
            "current": t in current,
            "groups": sorted(current.get(t, [])),
            "variants": [brief(v) for v in by_teacher.get(t, []) if v.status != "rejected"],
            "dunno": dunno.get(t, 0),
        })
    return {"pending": pending, "teachers": teachers}


def set_variant_status(db: Session, variant_id: int, status: str) -> None:
    v = db.get(TeacherNameVariant, variant_id)
    if not v:
        raise VoteError("Вариант не найден")
    v.status = status
    if status == "rejected":
        # Голоса за отклонённый — снимаем: эти студенты смогут ответить заново
        db.query(TeacherNameVote).filter_by(variant_id=v.id).delete()
    db.commit()
    _clear_cache()


def merge_variant(db: Session, variant_id: int, into_id: int) -> None:
    v, into = db.get(TeacherNameVariant, variant_id), db.get(TeacherNameVariant, into_id)
    if not v or not into or v.teacher != into.teacher or v.id == into.id:
        raise VoteError("Варианты не найдены")
    db.query(TeacherNameVote).filter_by(variant_id=v.id).update({"variant_id": into.id})
    db.delete(v)
    db.commit()
    _clear_cache()


def set_final(db: Session, teacher: str, full_name: Optional[str]) -> None:
    row = db.get(TeacherFullName, teacher)
    if not full_name:
        if row:
            db.delete(row)
    else:
        value = tidy(full_name)
        if row:
            row.full_name = value
            row.approved_at = datetime.utcnow()
        else:
            db.add(TeacherFullName(teacher=teacher, full_name=value))
    db.commit()
    _clear_cache()


# ── засев и письмо-сводка ─────────────────────────────────────────────────
def seed(db: Session) -> None:
    """Имена с msu.tj — один раз, в пустые таблицы."""
    from app.services.full_names_seed import FINAL, VARIANTS
    if db.query(TeacherFullName).count() or db.query(TeacherNameVariant).count():
        return
    for t, name in FINAL.items():
        db.add(TeacherFullName(teacher=t, full_name=name))
    for t, names in VARIANTS.items():
        for name in names:
            db.add(TeacherNameVariant(teacher=t, full_name=name, status="open", source="msu.tj"))
    db.commit()
    logger.info(f"Полные имена засеяны: {len(FINAL)} утверждённых, {len(VARIANTS)} с вариантами")


def send_digest(db: Session) -> int:
    """Письмо владельцу: новые варианты на проверке, которых ещё не было в письмах."""
    from app.services.email import send_owner_email
    import html as _html
    fresh = (db.query(TeacherNameVariant)
             .filter(TeacherNameVariant.status == "pending", TeacherNameVariant.notified_at.is_(None))
             .order_by(TeacherNameVariant.teacher).all())
    if not fresh:
        return 0
    total_pending = db.query(TeacherNameVariant).filter_by(status="pending").count()
    lines = [f"{v.teacher} → «{v.full_name}»" for v in fresh]
    body = "".join(f"<li>{_html.escape(l)}</li>" for l in lines)
    n = len(fresh)
    ok = send_owner_email(
        subject=f"МГУ Расписание: на проверке {n} {'новый вариант' if n == 1 else 'новых варианта' if n < 5 else 'новых вариантов'} имени",
        html=(f"<p>Студенты предложили полные имена преподавателей:</p><ul>{body}</ul>"
              f"<p>Всего ждёт проверки: {total_pending}. Проверить: панель разработчика → «Полные имена».</p>"),
        text="Студенты предложили полные имена преподавателей:\n" + "\n".join(lines)
             + f"\n\nВсего ждёт проверки: {total_pending}. Панель разработчика → «Полные имена».",
    )
    if ok:
        now = datetime.utcnow()
        for v in fresh:
            v.notified_at = now
        db.commit()
    return n if ok else 0
