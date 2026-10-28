# SproutSync Development Environment Startup
$ErrorActionPreference = "Stop"

Write-Host "==> Checking .env configuration..." -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example." -ForegroundColor Green
}

Write-Host "==> Ensuring brand assets are synced..." -ForegroundColor Cyan
if (-not (Test-Path "frontend/dashboard/src/assets/logo.png") -or -not (Test-Path "frontend/dashboard/src/assets/chamber-model.png")) {
    if (Test-Path "scripts/copy-assets.bat") {
        & cmd.exe /c scripts\copy-assets.bat
    }
}

Write-Host "==> Installing frontend workspace dependencies..." -ForegroundColor Cyan
npm.cmd install

Write-Host "==> Starting Docker containers (Postgres, Mosquitto, API)..." -ForegroundColor Cyan
docker compose up --build -d

Write-Host "==> Starting Vite dashboard dev server..." -ForegroundColor Cyan
npm.cmd run dev
