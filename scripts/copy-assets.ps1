# Copy prototype brand assets to docs/assets and sync to frontend/dashboard/src/assets
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$docsAssets = Join-Path $repoRoot "docs\assets"
$srcAssets = Join-Path $repoRoot "frontend\dashboard\src\assets"
$protoImports = Join-Path $repoRoot "docs\prototype\src\imports"

if (-not (Test-Path $docsAssets)) {
    New-Item -ItemType Directory -Path $docsAssets -Force | Out-Null
}
if (-not (Test-Path $srcAssets)) {
    New-Item -ItemType Directory -Path $srcAssets -Force | Out-Null
}

Write-Host "[INFO] Copying assets to docs\assets..." -ForegroundColor Cyan
Copy-Item (Join-Path $protoImports "image-5.png") (Join-Path $docsAssets "logo.png") -Force
Copy-Item (Join-Path $protoImports "image-8.png") (Join-Path $docsAssets "chamber-model.png") -Force
Copy-Item (Join-Path $protoImports "image-9.png") (Join-Path $docsAssets "chamber-views.png") -Force

Write-Host "[INFO] Syncing assets to frontend\dashboard\src\assets..." -ForegroundColor Cyan
Copy-Item (Join-Path $docsAssets "logo.png") (Join-Path $srcAssets "logo.png") -Force
Copy-Item (Join-Path $docsAssets "chamber-model.png") (Join-Path $srcAssets "chamber-model.png") -Force
Copy-Item (Join-Path $docsAssets "chamber-views.png") (Join-Path $srcAssets "chamber-views.png") -Force

Write-Host "[SUCCESS] Assets copied successfully to docs/assets and frontend/dashboard/src/assets!" -ForegroundColor Green
