# Exercise the public batch entry points with real local services, then leave them stopped.
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
. (Join-Path $PSScriptRoot 'native-api.ps1')
if ((Test-LocalPort 8000) -or (Test-LocalPort 5173)) { throw 'Stop the existing local session before running this smoke check.' }
$savedMqttEnabled = $env:MQTT_ENABLED
$launcher = $null
try {
    # Hardware traffic is not needed for testing process/dependency lifecycle.
    $env:MQTT_ENABLED = 'false'
    $launcher = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', 'start.bat') -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $repoRoot '.tools/local-run-test.stdout.log') -RedirectStandardError (Join-Path $repoRoot '.tools/local-run-test.stderr.log') -WindowStyle Hidden -PassThru
    # Keep the process handle open so Windows PowerShell retains its exit code.
    $null = $launcher.Handle
    $ready = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        if ($launcher.HasExited) { throw 'start.bat exited early. Read .tools/local-run-test.*.log.' }
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/v1/health' -TimeoutSec 2
            $dashboard = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173' -TimeoutSec 2
            if ($health.status -eq 'ok' -and $dashboard.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Local services did not become ready. Read .tools/local-run-test.*.log.' }
    $output = Get-Content -LiteralPath '.tools/local-run-test.stdout.log' -Raw
    if ($output -match '\[INSTALL\]') { throw 'Complete dependencies unexpectedly triggered installation during normal startup.' }
    & .\stop.bat
    if ($LASTEXITCODE -ne 0) { throw 'stop.bat failed.' }
    if (-not $launcher.WaitForExit(10000)) { throw 'The launch terminal did not exit after stop.bat.' }
    $launcher.Refresh()
    if ((Test-LocalPort 8000) -or (Test-LocalPort 5173)) { throw 'A local service was left running after stop.bat.' }
    if ($launcher.ExitCode -ne 0) { throw "start.bat exited with $($launcher.ExitCode) after shutdown." }
    & .\stop.bat
    if ($LASTEXITCODE -ne 0) { throw 'Repeated stop.bat should succeed.' }
    Write-Host 'Local-run smoke passed: start.bat reused dependencies, API/dashboard returned HTTP 200, stop.bat stopped both, and repeated stop was safe.'
} finally {
    if (Test-Path -LiteralPath (Get-DevelopmentStatePath $repoRoot)) { Stop-DevelopmentSession -RepoRoot $repoRoot }
    if ($launcher -and -not $launcher.HasExited) { Stop-Process -InputObject $launcher -ErrorAction SilentlyContinue }
    if ($null -eq $savedMqttEnabled) { Remove-Item Env:MQTT_ENABLED -ErrorAction SilentlyContinue }
    else { $env:MQTT_ENABLED = $savedMqttEnabled }
}
