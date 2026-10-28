# Bootstrap a clean, isolated Python environment; never change the developer's venv.
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'development-dependencies.ps1')
$scratchRoot = Join-Path $repoRoot ('.tools/first-run-' + [guid]::NewGuid().ToString())
$apiRoot = Join-Path $scratchRoot 'backend/api'
New-Item -ItemType Directory -Force -Path $apiRoot, (Join-Path $scratchRoot 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'backend/api/app') -Destination $apiRoot -Recurse
Copy-Item -LiteralPath (Join-Path $repoRoot 'backend/api/pyproject.toml') -Destination $apiRoot
Copy-Item -LiteralPath (Join-Path $repoRoot 'requirements.txt') -Destination $scratchRoot
Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts/check_python_dependencies.py') -Destination (Join-Path $scratchRoot 'scripts')
# JavaScript first-install and reuse are covered independently by the real launcher
# and inventory tests. Keep this integration check focused on Python bootstrap.
function Get-NodeDependencyReport([string]$RepoRoot) { return [pscustomobject]@{ ready = $true; lockValid = $true; packages = @(); problems = @() } }
Push-Location -LiteralPath $scratchRoot
try {
    Initialize-DevelopmentDependencies -RepoRoot $scratchRoot -Backend Native
    $python = Join-Path $scratchRoot 'backend/api/.venv/Scripts/python.exe'
    if (-not (Get-PythonDependencyReport $scratchRoot $python).ready) { throw 'First-run installation did not produce a complete Python environment.' }
    $configPath = Join-Path $scratchRoot 'backend/api/.venv/pyvenv.cfg'
    $before = (Get-Item -LiteralPath $configPath).LastWriteTimeUtc.Ticks
    $repeat = Initialize-DevelopmentDependencies -RepoRoot $scratchRoot -Backend Native 6>&1 | Out-String
    if ($repeat -match '\[INSTALL\]') { throw 'Second run unexpectedly installed packages.' }
    if ((Get-Item -LiteralPath $configPath).LastWriteTimeUtc.Ticks -ne $before) { throw 'Second run recreated the virtual environment.' }
    Write-Host $repeat
    Write-Host 'First-run smoke passed: venv creation, requirements installation, and second-run reuse.'
} finally {
    Pop-Location
    # Verify the absolute target before recursively removing only this test directory.
    $resolvedScratch = [IO.Path]::GetFullPath($scratchRoot)
    $allowedScratch = [IO.Path]::GetFullPath((Join-Path $repoRoot '.tools')) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedScratch.StartsWith($allowedScratch, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove a test directory outside .tools.' }
    Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
}
