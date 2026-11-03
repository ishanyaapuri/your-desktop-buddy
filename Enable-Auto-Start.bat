@echo off
powershell "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\Hirono.lnk'); $s.TargetPath='%~dp0Start-Hirono.bat'; $s.WorkingDirectory='%~dp0'; $s.Save()"
echo.
echo ========================================================
echo  SUCCESS! Hirono will now start every time your laptop boots!
echo ========================================================
echo.
pause