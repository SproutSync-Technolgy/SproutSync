# SproutSync Development Environment Startup
$ErrorActionPreference = "Stop"

Write-Host "==> Checking .env configuration..." -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example." -ForegroundColor Green
}

Write-Host "==> Installing frontend workspace dependencies..." -ForegroundColor Cyan
npm.cmd ci

Write-Host "==> Starting Docker containers (Postgres, Mosquitto, API)..." -ForegroundColor Cyan
docker compose up --build -d

Write-Host "==> Starting Vite dashboard dev server..." -ForegroundColor Cyan
npm.cmd run dev
