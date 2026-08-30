"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "@/components/Header";
import WeekBar from "@/components/WeekBar";
import GroupSelector from "@/components/GroupSelector";
import { SkeletonRooms } from "@/components/Skeletons";
import { api, Group, Lesson, DAYS_ORDER, PAIR_TIMES, PAIR_NUMBERS, shortGroupName } from "@/lib/api";

const DAY_SHORT: Record<string, string> = {
  понедельник: "Пн", вторник: "Вт", среда: "Ср",
  четверг: "Чт", пятница: "Пт", суббота: "Сб",
};

const DAYS = DAYS_ORDER.filter(d => d !== "воскресенье");

/** Ключ занятого слота: «вторник|III» */
const slotKey = (day: string, pair: string) => `${day}|${pair}`;

function busySlots(lessons: Lesson[]): Set<string> {
  return new Set(lessons.map(l => slotKey(l.day_of_week, l.pair_number)));
}

export default function ComparePage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroup, setMyGroup] = useState<Group | null>(null);
  const [otherGroup, setOtherGroup] = useState<Group | null>(null);
  const [myLessons, setMyLessons] = useState<Lesson[]>([]);
  const [otherLessons, setOtherLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  // Пусто на старте (совпадает с SSR), реальную неделю выставит WeekBar (#418)
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  // Список недель не пришёл (нет сети, база ещё пуста после деплоя) — без
  // этого сигнала страница ждала бы selectedWeekStart вечно и, как только
  // человек выбирал группу, показывала бы «На этой неделе занятий нет» —
  // неправду про каникулы вместо правды про отсутствие связи.
  const [weeksUnknown, setWeeksUnknown] = useState(false);
  // Список групп не загрузился — иначе человек с уже выбранной в кабинете
  // группой видел бы «Сначала укажи свою группу в кабинете», хотя дело в сети.
  const [groupsError, setGroupsError] = useState(false);
  // Для одной из групп не нашлось той же недели, что у другой (у ЕНФ и ГФ
  // архивы синхронизируются раздельно, наборы недель могут разойтись) —
  // сравнивать в этом случае нечего: показать разные недели как одну было
  // бы тихой ошибкой, а не отсутствием общих окон.
  const [weekMismatch, setWeekMismatch] = useState(false);

  const loadGroups = useCallback(() => {
    setGroupsError(false);
    const saved = localStorage.getItem("selected_group_id");
    api.getGroups()
      .then(gs => {
        setGroups(gs);
        if (saved) setMyGroup(gs.find(g => g.id === Number(saved)) ?? null);
      })
      .catch(() => setGroupsError(true));
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // Расписание обеих групп на выбранную неделю
  useEffect(() => {
    if (!myGroup || !otherGroup || (!selectedWeekStart && !weeksUnknown)) return;
    let cancelled = false;
    setLoading(true);
    setWeekMismatch(false);
    (async () => {
      try {
        // week_id у каждой группы свой (он привязан к факультету), поэтому
        // ищем неделю отдельно для каждой по её week_start.
        const weekIdFor = async (g: Group) => {
          const wks = await api.getGroupWeeks(g.id);
          return wks.find(w => w.week_start === selectedWeekStart)?.id;
        };
        const [myWeek, otherWeek] = await Promise.all([weekIdFor(myGroup), weekIdFor(otherGroup)]);
        // Неделя была указана явно, но нашлась только у одной из групп —
        // без week_id бэкенд подставит для другой группы ЕЁ текущую неделю,
        // и сравнение молча сведёт разные недели. Честнее не сравнивать.
        if (selectedWeekStart && (myWeek == null) !== (otherWeek == null)) {
          if (cancelled) return;
          setMyLessons([]);
          setOtherLessons([]);
          setWeekMismatch(true);
          return;
        }
        const [mine, theirs] = await Promise.all([
          api.getGroupSchedule(myGroup.id, undefined, myWeek),
          api.getGroupSchedule(otherGroup.id, undefined, otherWeek),
        ]);
        if (cancelled) return;
        setMyLessons(mine);
        setOtherLessons(theirs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [myGroup, otherGroup, selectedWeekStart, weeksUnknown]);

  const mineBusy = useMemo(() => busySlots(myLessons), [myLessons]);
  const theirsBusy = useMemo(() => busySlots(otherLessons), [otherLessons]);

  // Считаем только слоты в учебных днях: если у ОБЕИХ групп в этот день нет
  // ни одной пары, день выходной — «свободен» там не значит «можно встретиться».
  const activeDays = useMemo(
    () => DAYS.filter(d => PAIR_NUMBERS.some(p => mineBusy.has(slotKey(d, p)) || theirsBusy.has(slotKey(d, p)))),
    [mineBusy, theirsBusy],
  );

  const commonFree = useMemo(() => {
    let n = 0;
    for (const d of activeDays) {
      for (const p of PAIR_NUMBERS) {
        if (!mineBusy.has(slotKey(d, p)) && !theirsBusy.has(slotKey(d, p))) n++;
      }
    }
    return n;
  }, [activeDays, mineBusy, theirsBusy]);

  const ready = myGroup && otherGroup && !loading;

  return (
    <div className="min-h-screen">
      <Header />
      <WeekBar onWeekChange={setSelectedWeekStart} selectedWeekStart={selectedWeekStart} onUnavailable={() => setWeeksUnknown(true)} />
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">

        <div className="card mb-4 lg:mb-5">
          <h1 className="font-bold text-lg lg:text-2xl mb-1">Сравнить с другой группой</h1>
          <p className="text-sm text-[var(--muted)] mb-3">
            {myGroup
              ? <>Когда у тебя ({shortGroupName(myGroup.name)} · {myGroup.year} курс) и у выбранной группы одновременно нет пар.</>
              : groupsError
                ? "Не удалось загрузить группы — нет связи с сервером."
                : "Сначала укажи свою группу в кабинете."}
          </p>
          {myGroup && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
                С кем сравнить
              </p>
              <GroupSelector groups={groups} value={otherGroup} onChange={setOtherGroup} collapsible />
            </>
          )}
        </div>

        {myGroup && otherGroup && loading && <SkeletonRooms />}

        {ready && weekMismatch && (
          <div className="text-center py-16 text-[var(--muted)]">
            <p>Эта неделя есть в расписании не у обеих групп</p>
            <p className="text-xs mt-1">Выберите другую неделю — часто подходит «Эта неделя»</p>
          </div>
        )}

        {ready && !weekMismatch && activeDays.length === 0 && (
          <div className="text-center py-16 text-[var(--muted)]">
            <p>На этой неделе занятий нет ни у одной из групп</p>
            <p className="text-xs mt-1">Сессия или каникулы — сравнивать нечего</p>
          </div>
        )}

        {ready && !weekMismatch && activeDays.length > 0 && (
          <div className="card">
            <p className="text-sm mb-3">
              Общих свободных пар: <b style={{ color: "var(--primary)" }}>{commonFree}</b>
            </p>
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full min-w-[420px] border-separate" style={{ borderSpacing: "3px" }}>
                <thead>
                  <tr>
                    <th className="w-12" />
                    {PAIR_NUMBERS.map(p => (
                      <th key={p} className="text-center pb-1">
                        <div className="text-xs font-bold">{p}</div>
                        <div className="text-[10px] font-normal text-[var(--muted)]">{PAIR_TIMES[p][0]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map(day => (
                    <tr key={day}>
                      <td className="text-sm font-semibold pr-2 whitespace-nowrap">{DAY_SHORT[day]}</td>
                      {PAIR_NUMBERS.map(p => {
                        const mine = mineBusy.has(slotKey(day, p));
                        const theirs = theirsBusy.has(slotKey(day, p));
                        const bothFree = !mine && !theirs;
                        // Заняты обе / только одна / никто — три состояния,
                        // чтобы было видно не только «когда можно», но и почему нельзя
                        const cls = bothFree
                          ? "bg-green-200 dark:bg-green-900/60 border-green-300 dark:border-green-800"
                          : mine && theirs
                            ? "bg-[var(--tag-bg)] border-[var(--border)]"
                            : "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800";
                        const title = bothFree
                          ? "Оба свободны"
                          : mine && theirs
                            ? "Пары у обеих групп"
                            : mine ? "Пара у тебя" : "Пара у них";
                        return (
                          <td key={p} className="p-0">
                            <div className={`w-full aspect-square rounded-md border ${cls}`} title={title} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-green-200 dark:bg-green-900/60 border border-green-300 dark:border-green-800 inline-block" />
                оба свободны
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 inline-block" />
                пара у одной группы
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[var(--tag-bg)] border border-[var(--border)] inline-block" />
                пары у обеих
              </span>
            </div>
          </div>
        )}

        {myGroup && !otherGroup && (
          <div className="text-center py-16 text-[var(--muted)]">
            <p>Выбери группу выше</p>
            <p className="text-xs mt-1">Покажем, когда вы оба свободны</p>
          </div>
        )}

        {!myGroup && groupsError && (
          <div className="text-center py-16 text-[var(--muted)]">
            <p>Нет связи с сервером</p>
            <button
              onClick={loadGroups}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: "var(--primary)" }}
            >
              Повторить
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
