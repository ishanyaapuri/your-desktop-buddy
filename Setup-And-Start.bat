@echo off
setlocal enabledelayedexpansion
title Setting up Desktop Buddy...
cd /d "%~dp0"

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo  ERROR: Node.js is not installed on this computer!
    echo ========================================================
    echo.
    echo Please download and install Node.js (LTS version) first:
    echo https://nodejs.org/
    echo.
    pause
    exit /b
)

:: 2. Install dependencies if not already installed
if not exist "node_modules\" (
    echo.
    echo ========================================================
    echo  Installing required components (this only happens once)...
    echo ========================================================
    echo.
    call npm install
)

:: 3. Launch cleanly
echo Launching your Desktop Buddy...
start "" /b cmd /c "npm start"
exit