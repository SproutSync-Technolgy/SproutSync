# Shared dependency checks. Inspection never installs packages or changes services.
function Get-NodeDependencyReport([string]$RepoRoot) {
    $output = & node (Join-Path $RepoRoot 'scripts/check-node-dependencies.mjs')
    if (-not $output) { throw 'Node dependency inspection failed. Check Node.js and package-lock.json.' }
    return ($output | ConvertFrom-Json)
}

function Get-PythonDependencyReport([string]$RepoRoot, [string]$Python) {
    $output = & $Python -B (Join-Path $RepoRoot 'scripts/check_python_dependencies.py')
    if (-not $output) { throw 'Python dependency inspection failed. Check the virtual environment.' }
    return ($output | ConvertFrom-Json)
}

function Write-DependencyReport([string]$Label, $Report) {
    Write-Host "`n$Label"
    foreach ($package in $Report.packages) {
        $version = if ($package.installed) { $package.installed } else { 'not installed' }
        Write-Host "[$($package.status)] $($package.name) - $version (required: $($package.expected))"
    }
    foreach ($problem in $Report.problems) { Write-Host "[ACTION] $problem" }
}

function Initialize-DevelopmentDependencies([string]$RepoRoot, [string]$Backend) {
    $frontend = Get-NodeDependencyReport $RepoRoot
    if (-not $frontend.lockValid) {
        Write-DependencyReport 'JavaScript dependencies' $frontend
        throw 'Fix the package manifest/lockfile before installing.'
    }
    if (-not $frontend.ready) {
        Write-DependencyReport 'JavaScript packages needing attention' ([pscustomobject]@{ packages = @($frontend.packages | Where-Object status -ne 'OK'); problems = $frontend.problems })
        Write-Host '[INSTALL] Installing locked JavaScript dependencies...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check network access and retry start.bat.' }
        if (-not (Get-NodeDependencyReport $RepoRoot).ready) { throw 'JavaScript dependencies are still incomplete after installation.' }
    } else { Write-Host "[OK] JavaScript dependencies ready ($($frontend.packages.Count) packages). Installation skipped." }

    if ($Backend -eq 'Docker') { return }
    $python = Join-Path $RepoRoot 'backend/api/.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        $command = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { $null }
        if (-not $command) { throw 'Install Python 3.12+ and reopen the terminal. start.bat creates the environment and installs packages automatically.' }
        [string[]]$versionArgs = if ($command -eq 'py') { @('-3') } else { @() }
        & $command @versionArgs -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.12+ is required. Install a supported Python version and retry.' }
        Write-Host '[INSTALL] Creating the Python virtual environment...'
        & $command @versionArgs -m venv (Join-Path $RepoRoot 'backend/api/.venv')
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python virtual environment.' }
    }
    $backendReport = Get-PythonDependencyReport $RepoRoot $python
    if (-not $backendReport.ready) {
        Write-DependencyReport 'Python packages needing attention' ([pscustomobject]@{ packages = @($backendReport.packages | Where-Object status -ne 'OK'); problems = $backendReport.problems })
        if ($backendReport.repair.Count -gt 0) {
            $repairArguments = @($backendReport.repair)
            & $python -m pip install --force-reinstall --no-deps @repairArguments
            if ($LASTEXITCODE -ne 0) { throw 'Repairing damaged Python packages failed.' }
        }
        Write-Host '[INSTALL] Installing required Python packages...'
        & $python -m pip install -r (Join-Path $RepoRoot 'requirements.txt')
        if ($LASTEXITCODE -ne 0) { throw 'Python package installation failed. Check network access and retry start.bat.' }
        if (-not (Get-PythonDependencyReport $RepoRoot $python).ready) { throw 'Python dependencies are still incomplete. Run verify.bat for details.' }
    } else { Write-Host "[OK] Python dependencies ready ($($backendReport.packages.Count) packages). Installation skipped." }
}
