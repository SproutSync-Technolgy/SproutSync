$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolRoot = Join-Path $repoRoot '.tools'
$downloadRoot = Join-Path $toolRoot 'downloads'
New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
$jdkRoot = Join-Path $toolRoot 'java'
if (-not (Test-Path $jdkRoot)) {
    Write-Output 'Downloading the Temurin Java 17 build toolchain...'
    $release = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $package = $release[0].binary.package
    $archive = Join-Path $downloadRoot 'jdk17.zip'
    Invoke-WebRequest -UseBasicParsing -Uri $package.link -OutFile $archive
    if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.checksum) { throw 'JDK checksum mismatch' }
    Expand-Archive -LiteralPath $archive -DestinationPath $jdkRoot
}
$env:JAVA_HOME = (Get-ChildItem -LiteralPath $jdkRoot -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $toolRoot 'android-sdk'
$sdkManager = Join-Path $env:ANDROID_HOME 'cmdline-tools\cmdline-tools\bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
    Write-Output 'Downloading Android command-line build tools...'
    $archive = Join-Path $downloadRoot 'android-tools.zip'
    Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $env:ANDROID_HOME 'cmdline-tools')
}
Write-Output 'Android build tools downloaded. Run sdkmanager to install platform and build packages.'
Write-Output "Java directory: $env:JAVA_HOME"
Write-Output "Android directory: $env:ANDROID_HOME"
