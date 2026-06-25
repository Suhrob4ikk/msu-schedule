@echo off
chcp 65001 > nul
echo ============================================
echo   МГУ Душанбе — Расписание занятий
echo ============================================
echo.

echo [1/2] Запуск бэкенда FastAPI (порт 8001)...
start "MSU Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001"

timeout /t 5 /nobreak > nul

echo [2/2] Запуск фронтенда Next.js (порт 3000)...
start "MSU Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 8 /nobreak > nul

echo.
echo ============================================
echo   Приложение запущено!
echo.
echo   Веб-приложение: http://localhost:3000
echo   API Docs:       http://localhost:8001/docs
echo ============================================
echo.

start http://localhost:3000
