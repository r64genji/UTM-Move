@echo off
echo ==========================================
echo   UTM Move - Development Server (Fast)
echo ==========================================
echo.
echo This script starts BOTH servers with hot-reload:
echo - Frontend: Vite dev server with HMR (instant updates)
echo - Backend: nodemon (auto-restart on file changes)
echo.
echo Frontend changes: Instant (no refresh needed)
echo Backend changes: Auto-restart (~1 second)
echo.

:: Check if nodemon is installed globally
where nodemon >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing nodemon globally for backend hot-reload...
    call npm install -g nodemon
)

echo Starting Backend with nodemon...
start "UTM Backend" cmd /k "cd /d %~dp0Backend && nodemon server.js"

echo Starting Frontend dev server...
start "UTM Frontend" cmd /k "cd /d %~dp0Frontend && npm run dev"

echo.
echo ==========================================
echo   Servers Starting...
echo ==========================================
echo.
echo Frontend (Vite):  http://localhost:5173
echo Backend (API):    http://localhost:3000
echo.
echo Both servers have HOT-RELOAD enabled!
echo - Edit frontend files: Changes appear instantly
echo - Edit backend files: Server auto-restarts
echo.
echo Close this window to stop watching.
echo Close the terminal windows to stop the servers.
pause
