"use client";
/**
 * Подробности аудитории (макеты auditorii-1/3): номер, пара, статус, кто
 * занимает (группа и преподаватели — ссылки), «День аудитории» из пяти пар.
 * На широком экране стоит справа от плиток, на узком — внутри шторки (bare).
 */
import Link from "next/link";
import Icon from "../Icon";
import { TypeBadge } from "../schedule/parts";
import { PAIR_TIMES } from "@/lib/api";
import {
  displayRoom, PAIRS, roomStatus, statusText,
  type Occupant, type RoomDay,
} from "@/lib/tablo/rooms";

export interface Links {
  group: (o: Occupant) => string | null;
  teacher: (name: string) => string | null;
}

function Teachers({ names, links }: { names: string | null; links: Links }) {
  if (!names) return null;
  const list = names.split(/,\s*/).filter(Boolean);
  return (
    <p className="t-rd-teachers">
      {list.map((n, i) => {
        const href = links.teacher(n);
        return (
          <span key={n}>
            {i > 0 && ", "}
            {href ? <Link href={href}>{n}</Link> : n}
          </span>
        );
      })}
    </p>
  );
}

export default function RoomDetails({
  day, pairIdx, links, onPair, onClose, bare = false,
}: {
  day: RoomDay;
  pairIdx: number;
  links: Links;
  onPair: (idx: number) => void;
  onClose?: () => void;
  /** Без шапки — её рисует шторка. */
  bare?: boolean;
}) {
  const pair = PAIRS[pairIdx];
  const st = roomStatus(day, pairIdx);
  const occ = day.occupants[pairIdx];
  const name = displayRoom(day.room);
  const when = `${pair} пара · ${PAIR_TIMES[pair][0]}–${PAIR_TIMES[pair][1]}`;

  return (
    <div className="t-rd">
      {!bare && (
        <div className="t-rd-head">
          <div className="min-w-0">
            <p className="t-over">Аудитория</p>
            <h2 className={`t-rd-name ${name.length > 5 ? "t-rd-name-long" : ""}`}>{name}</h2>
          </div>
          {onClose && (
            <button type="button" className="t-icon-btn" onClick={onClose} aria-label="Закрыть подробности">
              <Icon name="close" size={22} />
            </button>
          )}
        </div>
      )}
      <p className="t-rd-when">{when}</p>

      <div className={`t-rd-status ${st.free ? "t-rd-free" : "t-rd-busy"}`}>
        <i aria-hidden="true" />
        {statusText(st)}
      </div>

      {occ.map((o, i) => {
        const href = links.group(o);
        const title = o.course != null && o.program ? `${o.course} курс · ${o.program}` : o.group;
        return (
          <div key={i} className="t-rd-card">
            <h3>
              {href ? (
                <Link href={href}>{title}<Icon name="chevronRight" size={18} /></Link>
              ) : title}
            </h3>
            <p className="t-rd-subj">{o.subject}</p>
            <TypeBadge type={o.type} />
            <Teachers names={o.teacher} links={links} />
          </div>
        );
      })}

      <p className="t-over t-rd-over">День аудитории</p>
      <div className="t-rd-days" role="group" aria-label="Пары этого дня">
        {PAIRS.map((p, i) => {
          const busy = day.occupants[i].length > 0;
          return (
            <button key={p} type="button" aria-pressed={i === pairIdx} onClick={() => onPair(i)}
              className={`t-rd-day ${busy ? "t-rd-busy" : "t-rd-free"} ${i === pairIdx ? "t-rd-day-on" : ""}`}>
              <b>{p}</b>
              <span>{busy ? "занята" : "свободна"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
