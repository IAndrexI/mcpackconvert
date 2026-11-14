@echo off
title PackHub Modpack Server
echo ========================================================
echo   Starting PackHub Self-Hosted Modpack Manager...
echo ========================================================
cd /d "%~dp0"

:: Open web browser after a short delay
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080"

:: Run the server
node server/index.js
pause
