@echo off
title Starting Desktop Buddy...
cd /d "%~dp0"

if not exist "node_modules\electron\" (
    echo ========================================================
    echo   First time setup: Installing components...
    echo   (This takes about 20-30 seconds, please wait...)
    echo ========================================================
    echo.
    call npm install
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit