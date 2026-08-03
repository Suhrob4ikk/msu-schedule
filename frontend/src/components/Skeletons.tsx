/**
 * Заглушки на время загрузки — все в одном месте.
 *
 * Вместо крутящегося колеса показываем форму того, что грузится: страница не
 * дёргается при подстановке настоящих данных и ощущается быстрее при той же
 * скорости сети. Бегущий блик задаётся классом .skeleton в globals.css
 * (и выключается при «уменьшить движение» в настройках системы).
 */

/** Расписание дня: повторяет разметку таймлайна (рельса + карточки). */
export function ScheduleSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Загружаем расписание">
      <div className="skeleton h-4 w-40 mb-3" />
      <div className="tl-rail">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="tl-row relative mb-2 lg:mb-2.5">
            <span className="tl-time" style={{ top: 19 }} aria-hidden="true">
              <span className="skeleton block h-2.5 w-9 ml-auto mb-1" />
              <span className="skeleton block h-2.5 w-9 ml-auto" />
            </span>
            <span className="tl-dot" data-state="future" style={{ top: 19 }} aria-hidden="true" />
            <div className="card">
              <div className="skeleton h-5 w-20 mb-2.5" />
              <div className="skeleton h-4 mb-2" style={{ width: i % 2 ? "62%" : "78%" }} />
              <div className="skeleton h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Список-меню: строки разной длины (преподаватели, группы). */
export function SkeletonRows({ rows = 8, label = "Загружаем список" }: { rows?: number; label?: string }) {
  // Длины намеренно неровные — ровная «лестница» читается как элемент дизайна,
  // а не как заглушка.
  const widths = ["78%", "62%", "85%", "55%", "72%", "68%", "90%", "60%"];
  return (
    <div aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-3 lg:px-4 py-3 lg:py-2.5 mb-1">
          <div className="skeleton h-3.5" style={{ width: widths[i % widths.length] }} />
        </div>
      ))}
    </div>
  );
}

/** Карточки в столбик: изменения расписания, занятые аудитории. */
export function SkeletonCards({ rows = 5, label = "Загружаем данные" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="skeleton h-5 w-16" />
            <div className="skeleton h-3 w-12" />
            <div className="skeleton h-3 w-20 ml-auto" />
          </div>
          <div className="skeleton h-3.5" style={{ width: i % 2 ? "58%" : "72%" }} />
        </div>
      ))}
    </div>
  );
}

/** Чипы аудиторий: две колонки «свободные» и «занятые». */
export function SkeletonRooms() {
  const chips = [46, 38, 52, 42, 60, 36, 48, 44, 40, 56];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6" aria-busy="true" aria-label="Загружаем аудитории">
      <div>
        <div className="skeleton h-5 w-36 mb-2.5" />
        <div className="flex flex-wrap gap-1.5">
          {chips.map((w, i) => (
            <span key={i} className="skeleton h-7" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div>
        <div className="skeleton h-5 w-32 mb-2.5" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: "var(--card-2)" }}>
              <div className="skeleton h-3.5 w-16 mb-1.5" />
              <div className="skeleton h-3" style={{ width: i % 2 ? "48%" : "64%" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
