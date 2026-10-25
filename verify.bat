@echo off
setlocal
title SproutSync Verification

cd /d "%~dp0"

echo ===================================================
echo             SproutSync Verification
echo ===================================================
echo.

:: 1. Sync assets if needed
if not exist "frontend\dashboard\src\assets\logo.png" (
    echo [INFO] Syncing assets...
    call "%~dp0scripts\copy-assets.bat"
)

:: 2. Typecheck
echo [1/3] Running TypeScript typecheck...
call npm.cmd run typecheck
if errorlevel 1 (
    echo.
    echo [ERROR] Typecheck failed!
    pause
    exit /b 1
)
echo [PASS] TypeScript typecheck passed cleanly.
echo.

:: 3. Build bundle
echo [2/3] Building frontend production bundle...
call npm.cmd run build
if errorlevel 1 (
    echo.
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)
echo [PASS] Production build succeeded.
echo.

:: 4. Repository structure verification
echo [3/3] Verifying repository standards...
node scripts/verify-repository.mjs
if errorlevel 1 (
    echo.
    echo [ERROR] Repository verification script failed!
    pause
    exit /b 1
)
echo.
echo ===================================================
echo       [SUCCESS] All Verifications Passed!
echo ===================================================
echo.
pause
