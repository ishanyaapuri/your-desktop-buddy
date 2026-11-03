@echo off
title Resetting Hirono Position...
cd /d "%~dp0"
node -e "const fs = require('fs'), path = require('path'), p = path.join(process.env.APPDATA, 'companion', 'companion-config.json'); if (fs.existsSync(p)) { try { const d = JSON.parse(fs.readFileSync(p)); delete d.petPosition; fs.writeFileSync(p, JSON.stringify(d, null, 2)); console.log('Hirono position reset to bottom-right!'); } catch(e){} }"
echo.
echo Hirono position has been reset to the bottom-right of your screen!
echo Launching Hirono...
start "" /b npm start
exit