"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { shouldAskCourseCheck, COURSE_CHECK_DISMISSED_KEY } from "@/lib/features";

/**
 * Одноразовая подсказка после начала учебного года: «проверь курс».
 *
 * Нужна потому, что группа — это связка «направление + курс», и 1 сентября
 * в сохранённой группе оказываются пары нового набора. Без подсказки студент
 * увидит чужое расписание и решит, что приложение врёт.
 */
export default function CourseCheckBanner() {
  // Показываем только после монтирования: решение зависит от localStorage
  // и текущей даты, на сервере их знать нельзя (иначе hydration #418).
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setVisible(shouldAskCourseCheck());
  }, []);

  const dismiss = () => {
    localStorage.setItem(COURSE_CHECK_DISMISSED_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="card mb-4 lg:mb-5 anim-rise" style={{ borderLeft: "3px solid var(--primary)" }}>
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 shrink-0 mt-0.5 text-[var(--primary)]"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm lg:text-base">Начался новый учебный год</p>
          <p className="text-xs lg:text-sm mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
            Проверьте, что выбран нужный курс — он не переключается сам. Если в прошлом
            году вы были на первом курсе, теперь нужен второй.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => router.push("/profile")}
              className="btn-primary px-3 py-2 text-sm"
            >
              Проверить группу
            </button>
            <button
              onClick={dismiss}
              className="px-3 py-2 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
              style={{ color: "var(--muted)" }}
            >
              Курс верный
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
