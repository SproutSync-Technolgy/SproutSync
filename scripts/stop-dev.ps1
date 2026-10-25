# SproutSync Development Environment Teardown
$ErrorActionPreference = "Stop"

Write-Host "==> Stopping Docker containers (Postgres, Mosquitto, API)..." -ForegroundColor Cyan
docker compose down
Write-Host "==> Containers stopped. Named database volume persists." -ForegroundColor Green
