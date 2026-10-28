# Start from any working directory; stop at the first failed command.
param(
    [ValidateSet('Auto', 'Docker', 'Native')]
    [string]$Backend = 'Auto',
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
. (Join-Path $PSScriptRoot 'native-api.ps1')
foreach ($command in @('node', 'npm.cmd')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Missing $command. Install the prerequisites in SETUP.md and reopen the terminal."
    }
}
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    throw 'Created .env. Fill the five required Supabase/database values using SETUP.md, then run start.bat again.'
}

$dockerAvailable = [bool](Get-Command docker -ErrorAction SilentlyContinue)
if ($Backend -eq 'Auto') {
    if ($dockerAvailable) { $Backend = 'Docker' } else { $Backend = 'Native' }
}
Write-Host "Backend mode: $Backend"
$python = Join-Path $repoRoot 'backend/api/.venv/Scripts/python.exe'
if ($Backend -eq 'Docker' -and -not $dockerAvailable) {
    throw 'Docker is not installed/on PATH. Use start.bat -Backend Native, or install Docker Desktop and reopen the terminal.'
}
if ($Backend -eq 'Native' -and -not (Test-Path -LiteralPath $python)) {
    throw 'Create the Python environment first: py -3.12 -m venv backend/api/.venv. Then run backend/api/.venv/Scripts/python.exe -m pip install -r requirements.txt'
}


if (-not $Check) {
    if (Test-LocalPort 5173) {
        throw 'Port 5173 is already in use. Stop the existing dashboard with Ctrl+C before starting another session.'
    }
    if ($Backend -eq 'Native' -and (Test-LocalPort 8000)) {
        throw 'Port 8000 is already in use. Stop the existing API/container before starting the native backend.'
    }
    Write-Host 'Installing locked frontend dependencies...'
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. See SETUP.md.' }
}

if ($Backend -eq 'Docker') {
    & npm.cmd run check:setup -- --docker
    if ($LASTEXITCODE -ne 0) { throw 'Fix the configuration errors above before starting.' }
    & docker info --format '{{.ServerVersion}}'
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, or use start.bat -Backend Native.' }
    if ($Check) { Write-Host 'Docker setup checks passed. No migrations or services started.'; return }
    Write-Host 'Building API, applying migrations, and waiting for health...'
    & docker compose up --build --wait --wait-timeout 120 api
    if ($LASTEXITCODE -ne 0) { throw 'API startup failed. Run docker compose logs --tail 100 api and follow SETUP.md.' }
    Write-Host 'API ready at http://localhost:8000/docs. Starting http://localhost:5173 ...'
    & npm.cmd run dev
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard startup failed. See the error above and SETUP.md.' }
    return
}

& npm.cmd run check:setup
if ($LASTEXITCODE -ne 0) { throw 'Fix the configuration errors above before starting.' }
& $python -m app.check_setup
if ($LASTEXITCODE -ne 0) { throw 'Native API prerequisite check failed. Check .env, database/network access, and the requirements.txt installation.' }
if ($Check) { Write-Host 'Native setup checks passed. No migrations or services started.'; return }

Write-Host 'Applying database migrations...'
& $python -m alembic -c backend/api/alembic.ini upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Fix the error above before starting the API.' }

Start-NativeDevelopment -RepoRoot $repoRoot -Python $python
