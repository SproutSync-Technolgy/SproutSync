@echo off
setlocal
cd /d "%~dp0\.."

echo [INFO] Ensuring asset directories exist...
if not exist "docs\assets" mkdir "docs\assets"
if not exist "frontend\dashboard\src\assets" mkdir "frontend\dashboard\src\assets"

:: If prototype source folder exists, copy into docs\assets
if exist "docs\prototype\src\imports\image-5.png" (
    echo [INFO] Importing prototype brand assets to docs\assets...
    copy /y "docs\prototype\src\imports\image-5.png" "docs\assets\logo.png" >nul
    copy /y "docs\prototype\src\imports\image-8.png" "docs\assets\chamber-model.png" >nul
    copy /y "docs\prototype\src\imports\image-9.png" "docs\assets\chamber-views.png" >nul
)

:: Sync from docs\assets to frontend\dashboard\src\assets
if exist "docs\assets\logo.png" (
    echo [INFO] Syncing assets to frontend\dashboard\src\assets...
    copy /y "docs\assets\logo.png" "frontend\dashboard\src\assets\logo.png" >nul
    copy /y "docs\assets\chamber-model.png" "frontend\dashboard\src\assets\chamber-model.png" >nul
    copy /y "docs\assets\chamber-views.png" "frontend\dashboard\src\assets\chamber-views.png" >nul
    echo [SUCCESS] Assets synced successfully to docs\assets and frontend\dashboard\src\assets.
) else (
    echo [WARN] Brand assets not found in docs\assets or docs\prototype.
)
