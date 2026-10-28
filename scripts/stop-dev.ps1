# SproutSync Development Environment Teardown
$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot

Write-Host "==> Stopping Docker containers (Postgres, Mosquitto, API)..." -ForegroundColor Cyan
docker compose down
if ($LASTEXITCODE -ne 0) { throw 'Docker shutdown failed. Check Docker Engine/Desktop and SETUP.md.' }
Write-Host "==> Containers stopped. Named database volume persists." -ForegroundColor Green
