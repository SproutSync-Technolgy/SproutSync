# Read-only dependency/configuration inventory. No installs, builds, migrations, or service starts.
param(
    [ValidateSet('Native', 'Docker')][string]$Backend = 'Native',
    [switch]$Online
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
. (Join-Path $PSScriptRoot 'development-dependencies.ps1')
$ready = $true
$frontend = $null
Write-Host 'SproutSync dependency verification (read-only)'
try {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $version = & node --version
        & node -e 'const [major, minor] = process.versions.node.split(String.fromCharCode(46)).map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'
        if ($LASTEXITCODE -eq 0) { Write-Host "[OK] Node.js $version (required: 22.12+)" }
        else { Write-Host "[WRONG VERSION] Node.js $version - install 22.12+"; $ready = $false }
        $frontend = Get-NodeDependencyReport $repoRoot
        Write-DependencyReport 'JavaScript libraries (including required transitive packages)' $frontend
        if (-not $frontend.ready) { $ready = $false }
    } else { Write-Host '[MISSING] Node.js 22.12+ - install Node.js and reopen the terminal.'; $ready = $false }
    if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
        $npmVersion = & npm.cmd --version
        if ($LASTEXITCODE -eq 0) { Write-Host "[OK] npm $npmVersion" }
        else { Write-Host '[BROKEN] npm - repair the Node.js installation.'; $ready = $false }
    } else { Write-Host '[MISSING] npm - install Node.js and reopen the terminal.'; $ready = $false }
    if ($Backend -eq 'Native') {
        $python = Join-Path $repoRoot 'backend/api/.venv/Scripts/python.exe'
        if (Test-Path -LiteralPath $python) {
            $pythonVersion = & $python --version
            Write-Host "[INFO] Virtual environment: $pythonVersion (required: Python 3.12+)"
            $backendReport = Get-PythonDependencyReport $repoRoot $python
            Write-DependencyReport 'Python libraries (including required transitive packages)' $backendReport
            if (-not $backendReport.ready) { $ready = $false }
        } else { Write-Host '[MISSING] Python virtual environment/packages - start.bat creates and installs them using Python 3.12+.'; $ready = $false }
        Write-Host '[OPTIONAL] Docker is not required for native local development.'
    } else {
        if (Get-Command docker -ErrorAction SilentlyContinue) {
            & docker version --format '{{.Server.Version}}'
            if ($LASTEXITCODE -eq 0) { Write-Host '[OK] Docker engine' }
            else { Write-Host '[MISSING] Running Docker engine - start Docker Desktop.'; $ready = $false }
        } else { Write-Host '[MISSING] Docker - install Docker Desktop or use native mode.'; $ready = $false }
        Write-Host '[OPTIONAL] Native Python packages are not required for the Docker backend; its image installs API requirements.'
    }
    if (Test-Path -LiteralPath '.env') {
        if ($frontend -and $frontend.ready) {
            [string[]]$setupArgs = if ($Backend -eq 'Docker') { @('--docker') } else { @() }
            & node scripts/check-setup.mjs @setupArgs
            if ($LASTEXITCODE -ne 0) { $ready = $false }
        } else { Write-Host '[INFO] .env exists; value validation needs the JavaScript dependencies.' }
    } else { Write-Host '[MISSING] .env - start.bat creates a template; fill the five values from SETUP.md.'; $ready = $false }
    if ($Online -and $Backend -eq 'Native' -and $ready) {
        & $python -m app.check_setup
        if ($LASTEXITCODE -ne 0) { $ready = $false }
    }
    if ($ready) { Write-Host 'READY: required dependencies and local configuration are present. start.bat will reuse them.'; exit 0 }
    Write-Host 'ACTION NEEDED: fix missing system tools/configuration, then run start.bat to install missing project packages.'
    exit 1
} catch { Write-Host "Verification failed: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
