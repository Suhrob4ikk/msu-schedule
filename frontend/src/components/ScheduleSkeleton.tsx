/**
 * Заглушка на время загрузки расписания.
 *
 * Повторяет разметку таймлайна, поэтому переход «заглушка → настоящие пары»
 * не дёргает страницу. Ощущается быстрее крутящегося спиннера: видно форму
 * того, что грузится, а не абстрактное колесо.
 */
export default function ScheduleSkeleton({ rows = 4 }: { rows?: number }) {
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
