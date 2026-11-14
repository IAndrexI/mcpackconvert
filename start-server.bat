@echo off
title PackHub Modpack Server
echo Starting PackHub Self-Hosted Modpack Manager...
cd /d "%~dp0"
node server/index.js
pause
