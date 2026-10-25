@echo off
title SproutSync Shutdown
cd /d "%~dp0"

echo ===================================================
echo               SproutSync Shutdown
echo ===================================================
echo.
echo [INFO] Stopping Docker containers...
docker compose down
echo.
echo [SUCCESS] Backend services stopped.
timeout /t 3 >nul
