@echo off
cd /d "%~dp0"
echo ========================================================
echo   Setting up Hirono Desktop Companion...
echo ========================================================
echo.
if not exist "node_modules\" (
    echo [1/2] Installing required components (takes ~20 seconds)...
    call npm install
)
echo [2/2] Launching Hirono!
start "" npm start
exit