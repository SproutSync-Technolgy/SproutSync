# Start from any working directory; stop at the first failed command.
$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
foreach ($command in @('node', 'npm.cmd', 'docker')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Missing $command. Install the prerequisites in SETUP.md and reopen the terminal."
    }
}
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    throw 'Created .env. Fill the five required Supabase/database values using SETUP.md, then run start.bat again.'
}
Write-Host 'Installing locked frontend dependencies...'
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. See SETUP.md.' }
& npm.cmd run check:setup -- --docker
if ($LASTEXITCODE -ne 0) { throw 'Fix the configuration errors above before starting.' }
& docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop / Docker Engine with Linux containers, then retry.' }
Write-Host 'Building API, applying migrations, and waiting for health...'
& docker compose up --build --wait --wait-timeout 120 api
if ($LASTEXITCODE -ne 0) { throw 'API startup failed. Run docker compose logs --tail 100 api and follow SETUP.md.' }
Write-Host 'API ready at http://localhost:8000/docs. Starting http://localhost:5173 ...'
& npm.cmd run dev
if ($LASTEXITCODE -ne 0) { throw 'Dashboard startup failed. See the error above and SETUP.md.' }
