@echo off
setlocal enabledelayedexpansion
title SproutSync Launcher

cd /d "%~dp0"

echo ===================================================
echo               SproutSync Launcher
echo ===================================================
echo.

:: 1. Verify .env exists
if not exist ".env" (
    echo [INFO] .env not found. Creating from .env.example...
    copy ".env.example" ".env" >nul
    echo [WARN] Created default .env. Please ensure your credentials are set.
)

:: 2. Ensure brand assets are synced from docs\assets to frontend\dashboard\src\assets
if not exist "frontend\dashboard\src\assets\logo.png" goto :sync_assets
if not exist "frontend\dashboard\src\assets\chamber-model.png" goto :sync_assets
goto :check_deps

:sync_assets
echo [INFO] Syncing brand assets to frontend dashboard...
if not exist "frontend\dashboard\src\assets" mkdir "frontend\dashboard\src\assets"
if exist "docs\assets\logo.png" (
    copy /y "docs\assets\logo.png" "frontend\dashboard\src\assets\logo.png" >nul
    copy /y "docs\assets\chamber-model.png" "frontend\dashboard\src\assets\chamber-model.png" >nul
    copy /y "docs\assets\chamber-views.png" "frontend\dashboard\src\assets\chamber-views.png" >nul
) else if exist "scripts\copy-assets.bat" (
    call "%~dp0scripts\copy-assets.bat"
)

:check_deps
:: 3. Verify frontend dependencies (node_modules + @tailwindcss/vite + lucide-react)
if not exist "node_modules" (
    echo [INFO] Installing frontend workspace dependencies...
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else if not exist "node_modules\@tailwindcss\vite" (
    echo [INFO] Installing Tailwind CSS v4 Vite plugin (@tailwindcss/vite)...
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    if exist "frontend\dashboard\node_modules\.vite" (
        echo [INFO] Clearing stale Vite bundle cache...
        rd /s /q "frontend\dashboard\node_modules\.vite" 2>nul
    )
) else if not exist "node_modules\@supabase\supabase-js" (
    echo [INFO] Updating frontend dependencies for @supabase/supabase-js...
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else if not exist "node_modules\lucide-react" (
    echo [INFO] Updating frontend dependencies for lucide-react and motion...
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: 4. Start Docker backend services
echo [INFO] Starting Backend Services (FastAPI, Postgres, Mosquitto)...
docker compose up --build -d
if errorlevel 1 (
    echo.
    echo [WARN] Docker compose could not start containers.
    echo Ensure Docker Desktop is running if you need backend API and database.
    echo.
    choice /c YN /m "Do you want to continue launching the Frontend Dashboard anyway"
    if errorlevel 2 (
        echo Exiting...
        pause
        exit /b 1
    )
) else (
    echo [INFO] Checking backend API readiness at http://localhost:8000/api/v1/health...
    powershell -NoProfile -Command "for ($i=0; $i -lt 10; $i++) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/v1/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } } catch {} Start-Sleep -Seconds 1 }; exit 1" >nul 2>nul
    if errorlevel 1 (
        echo [WARN] Backend API did not respond to /api/v1/health in 10s.
        echo Verify your .env has valid POSTGRES_PASSWORD and DATABASE_URL.
    ) else (
        echo [SUCCESS] Backend is healthy at http://localhost:8000
    )
)

echo.
echo [INFO] Launching Frontend Dashboard on http://localhost:5173...
echo [TIP]  If teammates see stale UI or old code, run: git pull ^&^& npm install ^&^& npx vite --force
echo.

:: Open browser in 2 seconds once Vite spins up
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5173"

:: Start Vite dev server in foreground (keeps window open for logs)
call npm.cmd run dev

:: Teardown prompt when Vite server is exited with Ctrl+C
echo.
echo [INFO] Frontend server stopped.
echo Run stop.bat to shut down backend Docker containers.
pause
