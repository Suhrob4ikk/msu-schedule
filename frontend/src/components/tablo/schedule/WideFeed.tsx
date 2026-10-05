"use client";
/**
 * Вид «Лента» на широком экране (макет 1): слева день раскрытой пары
 * («Сегодня», как в приложении, стоит на месте при прокрутке), справа
 * остальные дни компактными карточками — в две колонки от 1280 px, в одну
 * на 1024–1279 — и «Свободные аудитории».
 */
import { gapLabel, isoOf, isPast, diffDays, type Block, type DayData, type Focus } from "@/lib/tablo/schedule";
import { BREAK_MAX_MIN } from "@/lib/api";
import { CompactRow, DayBody, dayDate, daySub, dayName, pairsCount } from "./parts";
import FreeRooms from "./FreeRooms";

export default function WideFeed({ days, now, focus, dimPast, selectedKey, onOpen, twoColumns }: {
  days: DayData[];
  now: Date | null;
  focus: Focus | null;
  dimPast: boolean;
  selectedKey: string | null;
  onOpen: (b: Block, el: HTMLElement) => void;
  twoColumns: boolean;
}) {
  const shown = days.filter(d => d.dayIndex < 6 || d.blocks.length);
  const todayIso = now ? isoOf(now) : null;
  // Левый день: день раскрытой пары; без неё — сегодня, иначе первый день с парами.
  const left = (focus && shown.find(d => d.date === focus.block.date))
    ?? shown.find(d => d.date === todayIso)
    ?? shown.find(d => d.blocks.length)
    ?? shown[0];
  const rest = shown.filter(d => d !== left);
  const rel = now ? diffDays(isoOf(now), left.date) : null;
  const leftTitle = rel === 0 ? "Сегодня" : rel === 1 ? "Завтра" : dayName(left);
  const done = !!now && left.date === todayIso && left.blocks.length > 0 && left.blocks[left.blocks.length - 1].endAt <= now.getTime();

  // Подсветка: первая пара после левого дня.
  // Только когда слева сегодня: тогда это «что будет после сегодняшних пар».
  const nextKey = rel === 0 ? rest.flatMap(d => d.blocks).find(b => b.date > left.date)?.key ?? null : null;
  const remaining = now && dimPast
    ? rest.reduce((n, d) => n + d.blocks.filter(b => !isPast(b, now)).reduce((s, b) => s + b.lessons.length, 0), 0)
    : rest.reduce((n, d) => n + d.pairCount, 0);

  return (
    <div className={`t-wfeed ${twoColumns ? "t-wfeed-xl" : ""}`}>
      <section className="t-wfeed-left" aria-label={leftTitle}>
        <div className="t-wtitle">
          <h2 className={rel === 0 ? "t-ink" : ""}>{leftTitle}</h2>
          <span>
            {[
              rel !== 0 && rel !== 1 ? dayDate(left.date) : null,
              left.blocks.length ? pairsCount(left.pairCount) : "пар нет",
              left.blocks.length ? `${left.blocks[0].start}–${left.blocks[left.blocks.length - 1].end}` : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </div>
        {left.blocks.length ? (
          <DayBody day={left} now={now} focus={focus && focus.block.date === left.date ? focus : null}
            dimPast={dimPast} selectedKey={selectedKey} onOpen={onOpen} doneLine={done} />
        ) : (
          <div className="t-card t-emptyday">Пар нет</div>
        )}
      </section>

      <section className="t-wfeed-right" aria-label="Неделя">
        <div className="t-wtitle">
          <h2>Неделя</h2>
          <span>{dimPast ? `ещё ${pairsCount(remaining)}` : pairsCount(remaining)}</span>
        </div>
        <div className="t-wcols">
          {rest.map(d => (
            <article key={d.date} className="t-wday" aria-label={dayName(d)}>
              <header className={d.date === todayIso ? "t-today" : ""}>
                <h3>{dayName(d)}</h3>
                <span>{daySub(d, now).replace(/^(\d+) ([а-я]{3})[а-я]*/, "$1 $2")}</span>
              </header>
              {d.blocks.map((b, i) => {
                const prev = d.blocks[i - 1];
                const gapMin = prev ? Math.round((b.startAt - prev.endAt) / 60_000) : 0;
                return (
                  <div key={b.key}>
                    {prev && gapMin > BREAK_MAX_MIN && <div className="t-gap t-gap-c">{gapLabel(prev, b)}</div>}
                    <CompactRow block={b} past={dimPast && !!now && isPast(b, now)} next={b.key === nextKey}
                      selected={selectedKey === b.key} onOpen={onOpen} />
                  </div>
                );
              })}
            </article>
          ))}
          <FreeRooms now={now} limit={4} className="t-wday-free" />
        </div>
      </section>
    </div>
  );
}

