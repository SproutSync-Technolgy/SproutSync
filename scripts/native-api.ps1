# Native API lifecycle shared by the launcher and local smoke checks.
function Test-LocalPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        if (-not $client.ConnectAsync('127.0.0.1', $Port).Wait(500)) { return $false }
        return $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}


function Start-NativeDevelopment {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$Python,
        [ValidateRange(1, 65535)][int]$ApiPort = 8000,
        [scriptblock]$DashboardAction = {
            & npm.cmd run dev
            if ($LASTEXITCODE -ne 0) { throw 'Dashboard stopped with an error. See the output above.' }
        }
    )
    $ErrorActionPreference = 'Stop'
    if (Test-LocalPort $ApiPort) { throw "Port $ApiPort is already in use. Stop the existing API before starting another native process." }
    $logRoot = Join-Path $repoRoot '.tools'
    New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
    $logStem = if ($ApiPort -eq 8000) { 'dev-api' } else { "dev-api-$ApiPort" }
    $stdoutLog = Join-Path $logRoot "$logStem.stdout.log"
    $stderrLog = Join-Path $logRoot "$logStem.stderr.log"
    $apiProcess = $null
    try {
        Write-Host 'Starting the native Python API...'
        $startOptions = @{
            FilePath = $python
            ArgumentList = @('-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend/api', '--host', '127.0.0.1', '--port', [string]$ApiPort)
            WorkingDirectory = $repoRoot
            RedirectStandardOutput = $stdoutLog
            RedirectStandardError = $stderrLog
            WindowStyle = 'Hidden'
            PassThru = $true
        }
        $apiProcess = Start-Process @startOptions
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if ($apiProcess.HasExited) { throw "Native API exited. Read $stderrLog" }
            try {
                $health = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/v1/health" -TimeoutSec 2
                if ($health.status -eq 'ok' -and $health.service -eq 'sproutsync-api') { $ready = $true; break }
            } catch { }
            Start-Sleep -Milliseconds 500
        }
        if (-not $ready) { throw "Native API did not become healthy. Read $stderrLog" }
        Write-Host "API ready at http://localhost:$ApiPort/docs. Starting http://localhost:5173 ..."
        Write-Host "API logs: $stderrLog"
        Write-Host 'Press Ctrl+C in this terminal to stop the dashboard and native API. Restart this launcher after API code changes.'
        & $DashboardAction
    } finally {
        if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
            Stop-Process -InputObject $apiProcess -ErrorAction SilentlyContinue
            if ($apiProcess.WaitForExit(5000)) { Write-Host 'Native API stopped.' }
            else { Write-Warning 'The native API did not stop within 5 seconds.' }
        }
    }
}
