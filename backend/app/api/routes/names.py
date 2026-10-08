"""Опрос «полное имя преподавателя» — ответы студентов (services/full_names.py).

Список утверждённых имён и открытых вариантов — /api/schedule/full-names
(он в кэше готовых ответов). Здесь только то, что пишет в базу или зависит
от устройства: ответ и «что ответили другие» после своего ответа."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import full_names as fn

router = APIRouter(prefix="/names", tags=["names"])


class VoteBody(BaseModel):
    device_id: str
    teacher: str
    variant_id: Optional[int] = None
    dunno: bool = False
    proposal: Optional[str] = None


@router.post("/vote")
def vote(body: VoteBody, db: Session = Depends(get_db)):
    if len(body.device_id) > 100 or len(body.teacher) > 200:
        raise HTTPException(400, "Слишком длинно")
    try:
        return fn.vote(db, body.device_id, body.teacher.strip(), body.variant_id,
                       body.dunno, body.proposal)
    except fn.VoteError as e:
        raise HTTPException(400, str(e))


@router.get("/results")
def results(device_id: str, teacher: str, db: Session = Depends(get_db)):
    """Голоса показываем только тому, кто сам уже ответил — иначе первый
    неверный ответ стали бы повторять, не заглядывая в журнал."""
    r = fn.results(db, teacher.strip(), device_id)
    if not r["answered"]:
        for v in r["variants"]:
            v.pop("votes", None)
    return r
