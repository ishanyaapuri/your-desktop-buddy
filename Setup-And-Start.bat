@echo off
title Desktop Buddy Setup
cd /d "%~dp0"

echo.
echo ========================================================
echo   Setting up Your Desktop Buddy...
echo ========================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js was not found!
    echo Please install Node.js from https://nodejs.org/ first.
    echo.
    pause
    exit /b
)

:: 2. Check if Electron is ACTUALLY installed inside node_modules
if not exist "node_modules\electron\" (
    echo Downloading and installing components...
    echo (This takes about 20-30 seconds, please wait...)
    echo.
    call npm install
    if not exist "node_modules\electron\" (
        echo.
        echo Installation failed! Please check your internet connection.
        pause
        exit /b
    )
)

:: 3. Launch cleanly
echo Launching your Desktop Buddy...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit