# Real local API lifecycle checks; no npm install or database migrations.
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$python = Join-Path $repoRoot 'backend/api/.venv/Scripts/python.exe'
. (Join-Path $PSScriptRoot 'native-api.ps1')
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = $listener.LocalEndpoint.Port
$listener.Stop()

$savedDatabaseUrl = $env:DATABASE_URL
$savedMqttEnabled = $env:MQTT_ENABLED
try {
    # Keep the real hosted database out of this smoke check entirely.
    $env:DATABASE_URL = 'sqlite+pysqlite:///:memory:'
    $env:MQTT_ENABLED = 'false'
    Start-NativeDevelopment -RepoRoot $repoRoot -Python $python -ApiPort $testPort -DashboardAction {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/v1/health" -TimeoutSec 3
        if ($health.status -ne 'ok') { throw 'Expected a healthy native API.' }
        $authStatus = 0
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$testPort/api/v1/auth/me" -TimeoutSec 3 | Out-Null
        } catch {
            if ($null -ne $_.Exception.Response) { $authStatus = [int]$_.Exception.Response.StatusCode }
        }
        if ($authStatus -ne 401) { throw 'Expected an unauthenticated API request to return 401.' }
    }
    if (Test-LocalPort $testPort) { throw 'Native API was left running after the dashboard finished.' }

    $caughtExpectedFailure = $false
    try {
        Start-NativeDevelopment -RepoRoot $repoRoot -Python $python -ApiPort $testPort -DashboardAction {
            throw 'Simulated dashboard startup failure'
        }
    } catch {
        if ($_.Exception.Message -ne 'Simulated dashboard startup failure') { throw }
        $caughtExpectedFailure = $true
    }
    if (-not $caughtExpectedFailure) { throw 'Dashboard startup failure was not propagated.' }
    if (Test-LocalPort $testPort) { throw 'Native API was left running after a dashboard failure.' }
    Start-NativeDevelopment -RepoRoot $repoRoot -Python $python -ApiPort $testPort -DashboardAction {
        Stop-DevelopmentSession -RepoRoot $repoRoot -ApiPort $testPort
        if (Test-LocalPort $testPort) { throw 'Stop command left the native API running.' }
    }
    if (Test-Path -LiteralPath (Get-DevelopmentStatePath $repoRoot $testPort)) { throw 'Session record remained after shutdown.' }
    Stop-DevelopmentSession -RepoRoot $repoRoot -ApiPort $testPort
    $self = Get-Process -Id $PID
    $stale = @{ process_id = $PID; started_at = '0' }
    Stop-RecordedProcess $stale
    if ($self.HasExited) { throw 'A stale PID record stopped an unrelated process.' }
    Write-Host 'Native launcher smoke passed: API health, auth 401, cleanup, explicit stop, repeated stop, and stale PID protection.'
} finally {
    if ($null -eq $savedDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
    else { $env:DATABASE_URL = $savedDatabaseUrl }
    if ($null -eq $savedMqttEnabled) { Remove-Item Env:MQTT_ENABLED -ErrorAction SilentlyContinue }
    else { $env:MQTT_ENABLED = $savedMqttEnabled }
}
