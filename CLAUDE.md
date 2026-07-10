# МГУ Душанбе — Расписание занятий

Приложение с расписанием занятий филиала МГУ им. Ломоносова в Душанбе. Данные берутся
с официального сайта **msu.tj**. Три части: backend (API), web (сайт), mobile (Android).

Язык общения с пользователем — **русский**. Пользователь — владелец проекта (не всегда
технический): объясняй простыми словами, фиксируй сам, не проси подтверждений на мелочи.

---

## Три части и где они лежат

| Часть | Папка | Технологии | Прод | Деплой |
|---|---|---|---|---|
| **Backend** | `C:\Users\Suhrob\Desktop\msu-schedule\backend\` | FastAPI / Python / SQLAlchemy | https://msu-schedule-backend-production.up.railway.app | `git push` в main → Railway авто |
| **Web** | `C:\Users\Suhrob\Desktop\msu-schedule\frontend\` | Next.js 16 / React / TS / Tailwind | https://frontend-ten-nu-80.vercel.app | `git push` в main → Vercel авто |
| **Mobile** | `C:\Users\Suhrob\Desktop\msu-schedule-mobile\` | React Native / Expo | APK напрямую (не в сторах) | сборка APK вручную (см. ниже) |

**Backend и web — один git-репозиторий** (`msu-schedule`, GitHub `Suhrob4ikk/msu-schedule`, ветка `main`).
**Mobile — отдельный git-репозиторий** (`msu-schedule-mobile`).

Источник истины по данным — **msu.tj**. Если приложение показывает не то, что на msu.tj — это баг.

---

## Как течёт информация

```
msu.tj (файлы enf.xls, gf.xls)  →  backend скачивает и парсит  →  база (PostgreSQL на Railway)
                                                                          ↓  REST API /api/*
                                                          web (Vercel) и mobile (APK) просто рисуют ответ API
```

- Бэкенд качает XLS с `https://msu.tj/file/timetable/{enf,gf}.xls`, парсит, кладёт в БД.
- Синхронизация автоматически каждые 2 часа (`app/services/scheduler.py`), плюс при старте.
- Web и mobile **не парсят ничего сами** — только запрашивают API. Поэтому большинство
  «ошибок данных» чинятся в бэкенде (parser/sync), а не во фронтах.
- **Важно:** HTML-страницы расписания на msu.tj закрыты анти-ботом (Hostia, отдаёт HTTP 416).
  Автоматически их скрапить нельзя. Файлы XLS — можно (они не за анти-ботом).

---

## Backend — ключевые файлы (`backend/app/`)

- `main.py` — запуск приложения, lifespan (создание таблиц, индекс `ix_lesson_week_day_pair`,
  `seed_rooms()` — чистка/дедуп аудиторий, `load_teacher_overrides()`, первичная синхронизация),
  CORS, подключение роутеров.
- `core/config.py` — настройки из переменных окружения (см. таблицу ниже).
- `models.py` — таблицы: Faculty, Group, Teacher, Room, WeekSchedule, Lesson, ScheduleChange,
  UserSubscription, LessonNote, AttendanceRecord, UserRegistration, SyncLog, ExamNotificationLog,
  **TeacherOverride** (ручные замены ФИО).
- `services/parser.py` — парсинг XLS (`parse_xls_file`, `parse_subject_cell`, `parse_room`),
  карта замен ФИО (`TEACHER_NAME_OVERRIDES`, `override_teacher_name`, `set_active_overrides`).
- `services/sync.py` — цикл синхронизации (скачать → распарсить → сохранить → найти изменения →
  сбросить кэш аудиторий → push-уведомления).
- `services/scheduler.py` — периодическая синхронизация.
- `services/push.py` — web-push (VAPID), `send_push(...)`, напоминания о зачётах.
- `api/routes/schedule.py` — основные эндпоинты: `/api/schedule/groups`, `/group/{id}`,
  `/teachers`, `/teacher/{id}`, `/free-rooms`, `/now`, `/stats/{id}`, `/changes`, `/weeks-all`.
  Здесь же `enrich_lesson` (применяет override ФИО), кэш свободных аудиторий.
- `api/routes/user.py` — регистрация, подписки, web-push (`/api/user/*`).
- `api/routes/admin.py` — ручная синхронизация по заголовку `X-Admin-Secret` (`/api/admin/sync`).
- `api/routes/dev.py` — **скрытая панель разработчика** `/api/dev/*` (см. ниже).
- `api/routes/export.py` — экспорт в .ics (Google Calendar).

База: **SQLite и на Railway тоже** (выяснено 10.07.2026: information_schema недоступна, т.е. это не PostgreSQL; файл живёт на volume — данные переживают деплой). Миграции колонок делать через SQLAlchemy inspector (см. lifespan в main.py), «ADD COLUMN IF NOT EXISTS» в SQLite не работает.

### Переменные окружения backend (задаются на **Railway → Variables**)
`DATABASE_URL`, `ADMIN_SECRET`, `RESEND_API_KEY` (email через resend.com), `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` (web-push), **`DEV_PANEL_PASSWORD`** (пароль панели /dev). Дефолты в
`config.py` пустые/локальные — секреты только в окружении, в коде их быть не должно
(`.env` в .gitignore).

---

## Web — ключевые файлы (`frontend/src/`)

- `app/page.tsx` — главный экран (расписание).
- `app/teachers/page.tsx` — преподаватели (список по неделе + расписание конкретного).
- `app/rooms/page.tsx` — свободные аудитории.
- `app/changes/page.tsx` — история изменений.
- `app/profile/page.tsx` — «Мой кабинет» (имя/группа, тема, уведомления, кнопка «Режим разработчика»).
- `app/dev/page.tsx` + `app/dev/layout.tsx` — скрытая панель разработчика (вход по паролю).
- `app/layout.tsx` — корневой layout. **Внимание:** `<BottomNav/>` и `<InstallPrompt/>`
  рендерятся глобально на всех страницах (на /dev они скрыты по `pathname`). `<Header/>`
  подключается в каждой странице отдельно.
- `components/` — Header, BottomNav, LessonCard, WeekBar, ThemeToggle, GroupSelector,
  NotificationToggle, InstallPrompt, ServiceWorkerRegister.
- `lib/api.ts` — клиент API (`api.getGroups()` и т.д.), `shortGroupName`, `PAIR_TIMES`, `DAYS_ORDER`.
- `lib/push.ts` — web-push (`subscribePush`, `getPushStatus`).
- `public/manifest.json` — PWA (имя «МГУ Расписание»).

### ⚠️ Главная ловушка web (hydration #418)
Все страницы — `"use client"`, но Next.js всё равно делает SSR. Если читать `localStorage`
или `new Date()` прямо в инициализаторе `useState`, первый клиентский рендер разойдётся с
сервером → ошибка React #418 в консоли. **Правильно:** инициализировать нейтральным значением
(пустая строка / null / "all"), а реальное ставить в `useEffect` после монтирования. Тема —
через флаг `mounted`. При правке любой страницы проверяй этот паттерн.

Проверка: `cd frontend && npm run build` (должно быть 0 ошибок). Локальный прод: `npx next start`.

---

## Mobile — ключевые файлы (`msu-schedule-mobile/`)

- `app/index.tsx` — расписание, `app/teachers.tsx`, `app/rooms.tsx`, `app/profile.tsx`,
  `app/changes.tsx`, `app/onboarding.tsx`, `app/_layout.tsx` (нижние табы).
- `src/api.ts` — клиент API (тот же бэкенд), `clearApiCache()`.
- `src/theme.ts` — тема (светлая/тёмная).
- `src/SyncContext.tsx` — состояние синхронизации + `triggerSync()` (ручное обновление).
- `src/syncService.ts` — полная офлайн-синхронизация (кэш в AsyncStorage).
- `src/examNotifications.ts` — локальные уведомления о зачётах (`NOTIF_PREF_KEY` — флаг вкл/выкл).
- `src/GroupSelector.tsx`.
- `android/` — gradle-проект (**в .gitignore**, генерируется `expo prebuild`; правки версии
  в `android/app/build.gradle` живут только локально).
- `app.json` — конфиг Expo, имя приложения «МГУ Расписание».

### Как собрать APK (Android SDK уже есть на машине)
```bash
cd "C:/Users/Suhrob/Desktop/msu-schedule-mobile/android"
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"   # JDK 21 от Android Studio
export ANDROID_HOME="C:/Android/SDK"
export PATH="$JAVA_HOME/bin:$PATH"
./gradlew assembleRelease --no-daemon                            # arm64 для телефонов (~39 МБ)
# для эмулятора (x86_64) добавь: -PreactNativeArchitectures=arm64-v8a,x86_64
```
APK появится в `android/app/build/outputs/apk/release/app-release.apk`. Release подписывается
debug-ключом (`android/app/debug.keystore`) — встаёт поверх предыдущей версии как обновление.
Готовый файл клади на рабочий стол как `МГУ Расписание vX.Y.Z.apk`.
Версия: `android/app/build.gradle` (versionCode/versionName) + текст в `app/profile.tsx`.

### Эмулятор для визуальной проверки
AVD `Medium_Phone_API_36.0` (x86_64). Запуск:
`C:/Android/SDK/emulator/emulator.exe -avd Medium_Phone_API_36.0 -gpu swiftshader_indirect`.
Установка/скрин: `adb -e install -r <apk>`, `adb -e exec-out screencap -p > out.png`,
тапы `adb -e shell input tap X Y` (экран 1080×2400). На эмуляторе нужен APK с x86_64.

---

## Что важно знать про данные

- Сейчас **2 факультета** (ЕНФ, ГФ), **6 направлений** (ПМиИ, ХФММ, Геология, ГМУ, МО, Лингвистика),
  **курсы 1–4**, итого **24 группы**. Пары хранятся понедельно (есть архив прошлых недель).
- Конец семестра ⇒ пар может быть очень мало (это нормально, не баг).
- **Коды кафедр вместо ФИО:** в Excel иногда стоит «ИТУ», «английский» вместо фамилии. Парсер
  теперь берёт скобку с инициалами (формат `Предмет (код) (Фамилия И.О.)`), а остатки правятся
  через таблицу `teacher_overrides` (редактор в панели /dev, применяется сразу без редеплоя).
- Аудитории нормализованы в нижний регистр (чтобы «лабФИЗ» и «лабфиз» были одной).
- `/free-rooms` кэшируется (сбрасывается при синхронизации).

---

## Скрытая панель разработчика `/dev`

- Web: `https://frontend-ten-nu-80.vercel.app/dev` (или кнопка «Режим разработчика» внизу профиля).
- Включается переменной `DEV_PANEL_PASSWORD` на Railway. Если не задана — панель полностью
  выключена (всё отдаёт 404). Бэкенд: `app/api/routes/dev.py`, фронт: `app/dev/page.tsx`.
- Безопасность: пароль только из env (timing-safe сравнение), HMAC-токен на 24ч в sessionStorage,
  любая ошибка авторизации → **404** (не обнаружить), блок на 15 мин после 5 неверных попыток.
- Разделы: счётчики/синхронизация/группы без пар, ручные действия (синк / очистка кэша /
  пересборка аудиторий), редактор замен ФИО, производительность, пользователи/push, сырые данные.

---

## Деплой и проверка

- **Web + backend:** `git push origin main` → Vercel и Railway выкатывают сами (~1–2 мин).
  Перед пушем: `cd frontend && npm run build` (0 ошибок). Прод-проверка — открыть сайт,
  пройти страницы, консоль должна быть без ошибок (особенно #418), данные сверить с msu.tj.
- **Mobile:** собрать APK (см. выше), проверить на эмуляторе, положить на рабочий стол.
- Деплой в продакшн затрагивает живых пользователей — на это лучше спросить пользователя.

---

## Стиль кода и конвенции

- **Язык:** комментарии в коде и весь текст интерфейса — на **русском**.
- **Backend:** роутеры в `api/routes/`, бизнес-логика в `services/`, модели в `models.py`.
  Эндпоинты возвращают чистые dict/Pydantic-схемы.
- **Web:** каждая страница — `"use client"` и сама подключает `<Header/>`. Цвета **только** через
  CSS-переменные (`var(--primary)`, `var(--foreground)`, `var(--muted)`, `var(--card)`, `var(--border)`)
  + Tailwind-классы. Тёмная тема — класс `dark` на `<html>` (скрипт в `layout.tsx` ставит до рендера).
  Никаких захардкоженных цветов, иначе сломается тёмная тема.
- **Mobile:** экраны в `app/`, общая логика в `src/`. Цвета — через `useTheme()` (объект `C`,
  напр. `C.primary`, `C.fg`, `C.muted`, `C.card`). Иконки — `@expo/vector-icons` (Ionicons).
- **Тексты дней/пар/групп** должны совпадать на всех платформах.

## Частые задачи (как делать правильно)

- **Исправить ФИО преподавателя** (вместо кода кафедры): панель `/dev` → «Замены ФИО», или прямо
  в таблице `teacher_overrides`. Применяется сразу, без редеплоя. ФИО берём с msu.tj (открыть
  страницу расписания в обычном браузере — там есть колонка «Преподаватель»).
- **Данные не совпадают с msu.tj:** чинить в `services/parser.py` (разбор XLS) или `sync.py`,
  **не** во фронтах. Сверять с файлом `https://msu.tj/file/timetable/{enf,gf}.xls`.
- **Добавить/изменить эндпоинт:** `api/routes/schedule.py` + клиент в `lib/api.ts` (web) и
  `src/api.ts` (mobile).
- **Поднять версию мобайла:** `android/app/build.gradle` (`versionCode` +1, `versionName`) +
  текст версии в `app/profile.tsx`.
- **Перед деплоем web:** `cd frontend && npm run build` (0 ошибок) и проверка консоли на #418.

## Менять синхронно в нескольких местах
`shortGroupName` (короткие имена групп), `PAIR_TIMES` (время пар I–V), список дней недели —
продублированы в **backend**, **web (`lib/api.ts`)** и **mobile (`src/api.ts`)**. Меняешь в одном
месте — поменяй во всех трёх.

## Заблокировано до сентября 2026
Флаг `FEATURES_LOCKED = true` (в web `page.tsx`/`profile.tsx` и в mobile) прячет функции
**«Посещаемость»** и **«Заметки к парам»** до начала учебного года. Снять — поменять флаг на `false`.

## Память проекта
Подробности прошлых сессий и решений — в файлах памяти
`C:\Users\Suhrob\.claude\projects\C--Users-Suhrob-Desktop-msu-schedule\memory\` (индекс `MEMORY.md`).
