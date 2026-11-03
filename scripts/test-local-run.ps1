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
    $originalState = Get-DevelopmentState (Get-DevelopmentStatePath $repoRoot)
    $repeatOutput = (& .\start.bat 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $repeatOutput -notmatch 'Existing healthy session reused') { throw 'Repeated start.bat did not reuse the healthy session.' }
    $reusedState = Get-DevelopmentState (Get-DevelopmentStatePath $repoRoot)
    if ($originalState.session_id -ne $reusedState.session_id -or $originalState.api.process_id -ne $reusedState.api.process_id -or $originalState.dashboard.process_id -ne $reusedState.dashboard.process_id) { throw 'Repeated start replaced the existing session or processes.' }
    & .\stop.bat
    if ($LASTEXITCODE -ne 0) { throw 'stop.bat failed.' }
    if (-not $launcher.WaitForExit(10000)) { throw 'The launch terminal did not exit after stop.bat.' }
    $launcher.Refresh()
    if ((Test-LocalPort 8000) -or (Test-LocalPort 5173)) { throw 'A local service was left running after stop.bat.' }
    if ($launcher.ExitCode -ne 0) { throw "start.bat exited with $($launcher.ExitCode) after shutdown." }
    & .\stop.bat
    if ($LASTEXITCODE -ne 0) { throw 'Repeated stop.bat should succeed.' }
    $conflictListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 8000)
    $conflictListener.Start()
    try {
        $conflictOutput = (& .\start.bat 2>&1 | Out-String)
        if ($LASTEXITCODE -eq 0 -or $conflictOutput -notmatch 'could not be verified') { throw 'An unmanaged occupied port was incorrectly treated as a ready session.' }
        if (-not $conflictListener.Server.IsBound) { throw 'The unrelated listener was stopped.' }
    } finally { $conflictListener.Stop() }
    Write-Host 'Local-run smoke passed: dependencies reused, API/dashboard HTTP 200, repeated start reused the same processes, stop/repeated stop worked, and unrelated port conflicts were preserved.'
} finally {
    if (Test-Path -LiteralPath (Get-DevelopmentStatePath $repoRoot)) { Stop-DevelopmentSession -RepoRoot $repoRoot }
    if ($launcher -and -not $launcher.HasExited) { Stop-Process -InputObject $launcher -ErrorAction SilentlyContinue }
    if ($null -eq $savedMqttEnabled) { Remove-Item Env:MQTT_ENABLED -ErrorAction SilentlyContinue }
    else { $env:MQTT_ENABLED = $savedMqttEnabled }
}
