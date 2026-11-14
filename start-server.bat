@echo off
title PackHub Modpack Server
echo ========================================================
echo   Starting PackHub Self-Hosted Modpack Manager...
echo ========================================================
cd /d "%~dp0"

:: Start the server with --open flag so it opens the exact bound port in your browser
node server/index.js --open
pause
