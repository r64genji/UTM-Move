@echo off
echo Updating route geometries...
cd /d "%~dp0"
node scripts\update_geometries.js %*
echo.
pause
