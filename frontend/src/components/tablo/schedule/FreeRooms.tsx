"use client";
/**
 * «Свободные аудитории сейчас» — для текущей (или ближайшей) пары, со статусом
 * «весь день» / «до 14:00». Статусы считаются из пяти пар дня, как во вкладке
 * «Аудитории» приложения (lib/tablo/rooms.ts): «до» — начало следующего занятия.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, DAYS_ORDER } from "@/lib/api";
import { buildDay, displayRoom, nowKey, nowSlot, PAIRS, roomStatus, type RoomSlot } from "@/lib/tablo/rooms";

const DAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export default function FreeRooms({ now, limit = 4, className = "" }: { now: Date | null; limit?: number; className?: string }) {
  const slot = useMemo(() => (now ? nowSlot(now) : null), [now]);
  const key = slot ? nowKey(slot) : null;
  const [data, setData] = useState<{ key: string; byPair: Record<string, RoomSlot[]> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!slot || !key) return;
    let alive = true;
    const day = DAYS_ORDER[slot.dayIndex];
    Promise.all(PAIRS.map(p => api.getFreeRooms(day, p, slot.weekStart).catch(() => null)))
      .then(list => {
        if (!alive) return;
        if (list.every(x => !x)) { setFailed(true); return; }
        const byPair: Record<string, RoomSlot[]> = {};
        PAIRS.forEach((p, i) => { byPair[p] = list[i] ?? []; });
        setFailed(false);
        setData({ key, byPair });
      });
    return () => { alive = false; };
    // slot пересчитывается каждые 30 с, а запрашивать нужно только на границах пар
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const rooms = useMemo(() => {
    if (!data || !slot) return null;
    const idx = PAIRS.indexOf(slot.pair);
    const days = buildDay(data.byPair);
    return { total: days.length, free: days.filter(d => !d.occupants[idx]?.length).map(d => ({ room: d.room, st: roomStatus(d, idx) })) };
  }, [data, slot]);

  if (failed || !slot) return null;
  const title = slot.kind === "nearest"
    ? `Свободные аудитории · ${DAY_SHORT[slot.dayIndex]}, ${slot.pair} пара`
    : "Свободные аудитории сейчас";

  return (
    <section className={`t-card t-free ${className}`} aria-label={title}>
      <div className="t-free-head">
        <h3>{title}</h3>
        {rooms && (
          <Link href="/rooms" className="t-free-all">
            {rooms.free.length} из {rooms.total}
          </Link>
        )}
      </div>
      {!rooms ? (
        <div className="t-free-grid">{Array.from({ length: Math.min(limit, 4) }, (_, i) => <span key={i} className="t-free-chip t-skel" />)}</div>
      ) : rooms.free.length === 0 ? (
        <p className="text-[15px] text-[var(--text-2)]">Свободных нет</p>
      ) : (
        <div className="t-free-grid">
          {rooms.free.slice(0, limit).map(r => (
            <Link key={r.room} href={`/rooms?day=${encodeURIComponent(DAYS_ORDER[slot.dayIndex])}&pair=${slot.pair}&room=${encodeURIComponent(r.room)}`} className="t-free-chip">
              <b>{displayRoom(r.room)}</b>
              <span>{r.st.until ? `до ${r.st.until}` : "весь день"}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
