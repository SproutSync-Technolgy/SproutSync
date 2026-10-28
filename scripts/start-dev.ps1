# First run prepares project packages; subsequent runs inspect and reuse them.
param(
    [ValidateSet('Auto', 'Docker', 'Native')][string]$Backend = 'Native',
    [switch]$Check,
    [switch]$InstallOnly
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
. (Join-Path $PSScriptRoot 'native-api.ps1')
. (Join-Path $PSScriptRoot 'development-dependencies.ps1')
$startupLock = $null
try {
    if ($Backend -eq 'Auto') {
        $Backend = if (Get-Command docker -ErrorAction SilentlyContinue) { 'Docker' } else { 'Native' }
    }
    if ($Check) {
        & (Join-Path $PSScriptRoot 'verify-dev.ps1') -Backend $Backend
        exit $LASTEXITCODE
    }
    foreach ($command in @('node', 'npm.cmd')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Missing $command. Install Node.js 22.12+ and reopen the terminal." }
    }
    & node -e 'const [major, minor] = process.versions.node.split(String.fromCharCode(46)).map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.12+ is required. Upgrade Node.js and reopen the terminal.' }
    if ($Backend -eq 'Docker' -and -not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is missing. Install/start Docker Desktop, or use start.bat (native mode).' }
    if (-not $InstallOnly -and ((Test-LocalPort 5173) -or (Test-LocalPort 8000))) { throw 'A local service is already using port 5173 or 8000. Run stop.bat, or stop the older session with Ctrl+C.' }
    Write-Host "Backend mode: $Backend"
    New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot '.tools') | Out-Null
    try { $startupLock = [IO.File]::Open((Join-Path $repoRoot '.tools/development-start.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::Write, [IO.FileShare]::None) }
    catch { throw 'Another startup is already preparing or running this checkout. Run stop.bat or wait for it to finish.' }
    Initialize-DevelopmentDependencies -RepoRoot $repoRoot -Backend $Backend
    if ($InstallOnly) { Write-Host 'Project dependencies are ready. No migrations or services started.'; exit 0 }
    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        throw 'Created .env. Fill the five required Supabase/database values in SETUP.md, then run start.bat again. Installed packages will be reused.'
    }
    [string[]]$setupArgs = if ($Backend -eq 'Docker') { @('--docker') } else { @() }
    & node scripts/check-setup.mjs @setupArgs
    if ($LASTEXITCODE -ne 0) { throw 'Fix the configuration errors above before starting.' }
    if ($Backend -eq 'Docker') {
        & docker info --format '{{.ServerVersion}}'
        if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, or use start.bat in native mode.' }
        $contextFiles = @('backend/api/Dockerfile', 'backend/api/pyproject.toml', 'backend/api/alembic.ini', 'backend/api/docker-entrypoint.sh')
        $contextFiles += @(Get-ChildItem -LiteralPath 'backend/api/app', 'backend/api/migrations' -File -Recurse | Where-Object { $_.Extension -in '.py', '.sql', '.mako' } | ForEach-Object { $_.FullName.Substring($repoRoot.Length + 1) })
        $hashInput = ($contextFiles | Sort-Object | ForEach-Object { $_ + ':' + (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join '|'
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashInput))) } finally { $hasher.Dispose() }
        $stamp = Join-Path $repoRoot '.tools/docker-api-build.sha256'
        $image = & docker compose images -q api
        $previous = if (Test-Path -LiteralPath $stamp) { [IO.File]::ReadAllText($stamp) } else { '' }
        if (-not $image -or $previous -ne $hash) {
            Write-Host '[INSTALL] Building the API image for this source version...'
            & docker compose build api
            if ($LASTEXITCODE -ne 0) { throw 'Docker API build failed.' }
            New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot '.tools') | Out-Null
            [IO.File]::WriteAllText($stamp, $hash)
        } else { Write-Host '[OK] API image is current. Build skipped.' }
        Start-DevelopmentSession -RepoRoot $repoRoot -Backend Docker
        exit 0
    }
    $python = Join-Path $repoRoot 'backend/api/.venv/Scripts/python.exe'
    & $python -m app.check_setup
    if ($LASTEXITCODE -ne 0) { throw 'Database check failed. Check .env and network access; run verify.bat for dependency status.' }
    Write-Host 'Applying pending database migrations...'
    & $python -m alembic -c backend/api/alembic.ini upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Fix the error above before starting the API.' }
    Start-NativeDevelopment -RepoRoot $repoRoot -Python $python
    exit 0
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($startupLock) { $startupLock.Dispose() }
}
