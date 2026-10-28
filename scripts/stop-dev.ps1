param()
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot

. (Join-Path $PSScriptRoot 'native-api.ps1')
try { Stop-DevelopmentSession -RepoRoot $repoRoot }
catch { Write-Host "Stop failed: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
