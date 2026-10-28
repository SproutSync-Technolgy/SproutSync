# Native/Docker lifecycle. Only processes registered by this checkout are stopped.
function Test-LocalPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        if (-not $client.ConnectAsync('127.0.0.1', $Port).Wait(500)) { return $false }
        return $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}
function Get-DevelopmentStatePath([string]$RepoRoot, [int]$ApiPort = 8000) {
    $name = if ($ApiPort -eq 8000) { 'dev-session.json' } else { "dev-session-$ApiPort.json" }
    return Join-Path ([IO.Path]::GetFullPath($RepoRoot)) ".tools/$name"
}
function Get-DevelopmentState([string]$StatePath) {
    if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        try {
            $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
            if ($null -eq $state) { throw 'Session reservation is not ready yet.' }
            return $state
        }
        catch { Start-Sleep -Milliseconds 100 }
    }
    throw 'Cannot read the local session record. Check .tools/dev-session.json before stopping processes.'
}
function Get-ProcessRecord($Process) {
    return @{ process_id = $Process.Id; started_at = $Process.StartTime.ToUniversalTime().Ticks.ToString() }
}
function Get-RecordedProcess($Record) {
    if ($null -eq $Record) { return $null }
    $process = Get-Process -Id ([int]$Record.process_id) -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$Record.started_at) { return $process }
    return $null
}
function Stop-RecordedProcess($Record) {
    $process = Get-RecordedProcess $Record
    if ($process) {
        Stop-Process -InputObject $process -ErrorAction SilentlyContinue
        if (-not $process.WaitForExit(5000)) { throw "Process $($process.Id) did not stop." }
    }
}
function Test-StopRequested([string]$StatePath, [string]$SessionId) {
    $marker = "$StatePath.stop"
    return (Test-Path -LiteralPath $marker) -and ([IO.File]::ReadAllText($marker) -eq $SessionId)
}
function Stop-DevelopmentSession([string]$RepoRoot, [int]$ApiPort = 8000) {
    $statePath = Get-DevelopmentStatePath $RepoRoot $ApiPort
    $state = Get-DevelopmentState $statePath
    if (-not $state) {
        Write-Host 'No managed local session is running. Older sessions can be stopped with Ctrl+C in their launch terminal.'
        return
    }
    if ([IO.Path]::GetFullPath($state.repo_root) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw 'Session record belongs to a different checkout. No processes were stopped.' }
    [IO.File]::WriteAllText("$statePath.stop", [string]$state.session_id)
    Stop-RecordedProcess $state.dashboard
    Stop-RecordedProcess $state.api
    if ($state.backend -eq 'Docker') {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is unavailable. The dashboard was stopped; start Docker and retry stop.bat for the API.' }
        Push-Location -LiteralPath $RepoRoot
        try {
            & docker compose stop api
            if ($LASTEXITCODE -ne 0) { throw 'Could not stop the Docker API. Start Docker and retry stop.bat.' }
        } finally { Pop-Location }
    }
    if (-not (Get-RecordedProcess $state.launcher)) {
        Remove-Item -LiteralPath $statePath -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath "$statePath.stop" -ErrorAction SilentlyContinue
    }
    Write-Host 'Local dashboard and API stopped. Database data is preserved.'
}
function Start-DevelopmentSession {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [ValidateSet('Native', 'Docker')][string]$Backend = 'Native',
        [string]$Python,
        [ValidateRange(1, 65535)][int]$ApiPort = 8000,
        [scriptblock]$DashboardAction
    )
    $ErrorActionPreference = 'Stop'
    $RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
    if (Test-LocalPort $ApiPort) { throw "Port $ApiPort is already in use. Run stop.bat, or stop the older API/container first." }
    if (-not $DashboardAction -and (Test-LocalPort 5173)) { throw 'Port 5173 is already in use. Run stop.bat before starting another dashboard.' }
    $logRoot = Join-Path $RepoRoot '.tools'
    New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
    $statePath = Get-DevelopmentStatePath $RepoRoot $ApiPort
    $oldState = Get-DevelopmentState $statePath
    if ($oldState) {
        if ((Get-RecordedProcess $oldState.launcher) -or (Get-RecordedProcess $oldState.api) -or (Get-RecordedProcess $oldState.dashboard)) { throw 'This checkout already has a local session. Run stop.bat first.' }
        Remove-Item -LiteralPath $statePath
        Remove-Item -LiteralPath "$statePath.stop" -ErrorAction SilentlyContinue
    }
    $sessionId = [guid]::NewGuid().ToString()
    $state = @{ session_id = $sessionId; repo_root = $RepoRoot; backend = $Backend; launcher = Get-ProcessRecord (Get-Process -Id $PID); api = $null; dashboard = $null }
    $reservation = [IO.File]::Open($statePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $reservation.Dispose()
    [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 4))
    $apiProcess = $null
    $dashboardProcess = $null
    $logStem = if ($ApiPort -eq 8000) { 'dev-api' } else { "dev-api-$ApiPort" }
    $stderrLog = Join-Path $logRoot "$logStem.stderr.log"
    try {
        if (Test-StopRequested $statePath $sessionId) { return }
        if ($Backend -eq 'Native') {
            Write-Host 'Starting the native Python API...'
            $apiProcess = Start-Process -FilePath $Python -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend/api', '--host', '127.0.0.1', '--port', [string]$ApiPort) -WorkingDirectory $RepoRoot -RedirectStandardOutput (Join-Path $logRoot "$logStem.stdout.log") -RedirectStandardError $stderrLog -WindowStyle Hidden -PassThru
            $state.api = Get-ProcessRecord $apiProcess
            [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 4))
        } else {
            & docker compose up --wait --wait-timeout 120 api
            if ($LASTEXITCODE -ne 0) { throw 'Docker API startup failed. Check docker compose logs --tail 100 api.' }
        }
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-StopRequested $statePath $sessionId) { return }
            if ($apiProcess -and $apiProcess.HasExited) { throw "Native API exited. Read $stderrLog" }
            try {
                $health = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/v1/health" -TimeoutSec 2
                if ($health.status -eq 'ok' -and $health.service -eq 'sproutsync-api') { $ready = $true; break }
            } catch { }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw "API did not become healthy. Check $stderrLog or Docker logs." }
        if (Test-StopRequested $statePath $sessionId) { return }
        Write-Host "API ready at http://localhost:$ApiPort/docs."
        if ($DashboardAction) { & $DashboardAction; return }
        $nodePath = (Get-Command node -ErrorAction Stop).Source
        $vitePath = Join-Path $RepoRoot 'node_modules/vite/bin/vite.js'
        $dashboardProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $vitePath + '"'), '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory (Join-Path $RepoRoot 'frontend/dashboard') -RedirectStandardOutput (Join-Path $logRoot 'dev-dashboard.stdout.log') -RedirectStandardError (Join-Path $logRoot 'dev-dashboard.stderr.log') -WindowStyle Hidden -PassThru
        $state.dashboard = Get-ProcessRecord $dashboardProcess
        [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 4))
        $dashboardReady = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            if (Test-StopRequested $statePath $sessionId) { return }
            if ($dashboardProcess.HasExited) { throw 'Dashboard exited. Read .tools/dev-dashboard.stderr.log.' }
            try {
                $page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173' -TimeoutSec 2
                if ($page.StatusCode -eq 200) { $dashboardReady = $true; break }
            } catch { }
            Start-Sleep -Milliseconds 250
        }
        if (-not $dashboardReady) { throw 'Dashboard did not become ready. Read .tools/dev-dashboard.stderr.log.' }
        Write-Host 'SproutSync is running at http://localhost:5173'
        Write-Host 'Run stop.bat in another terminal, or press Ctrl+C here, to stop both services.'
        Write-Host 'Service logs are in .tools/dev-api.*.log and .tools/dev-dashboard.*.log.'
        while (-not (Test-StopRequested $statePath $sessionId)) {
            if ($apiProcess -and $apiProcess.HasExited) { throw "API stopped unexpectedly. Read $stderrLog" }
            if ($dashboardProcess.HasExited) { throw 'Dashboard stopped unexpectedly. Read .tools/dev-dashboard.stderr.log.' }
            Start-Sleep -Milliseconds 250
        }
    } finally {
        Stop-RecordedProcess $state.dashboard
        Stop-RecordedProcess $state.api
        $dockerStopped = $true
        if ($Backend -eq 'Docker') {
            & docker compose stop api
            if ($LASTEXITCODE -ne 0) { $dockerStopped = $false; Write-Warning 'Docker API could not be stopped. Retry stop.bat when Docker is available.' }
        }
        $saved = Get-DevelopmentState $statePath
        if ($dockerStopped -and $saved -and $saved.session_id -eq $sessionId) {
            Remove-Item -LiteralPath $statePath -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath "$statePath.stop" -ErrorAction SilentlyContinue
        }
        Write-Host 'Local services stopped.'
    }
}
function Start-NativeDevelopment {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$Python,
        [ValidateRange(1, 65535)][int]$ApiPort = 8000,
        [scriptblock]$DashboardAction
    )
    Start-DevelopmentSession -RepoRoot $RepoRoot -Backend Native -Python $Python -ApiPort $ApiPort -DashboardAction $DashboardAction
}
