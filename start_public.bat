@echo off
echo ==========================================
echo   UTM Move - Public Server Launcher
echo ==========================================

echo [1/3] Building Frontend...
cd Frontend
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo Error building frontend!
    pause
    exit /b
)
cd ..

echo [2/3] Initializing Database...
cd Backend
call npm install
node importSchedule.js
if %errorlevel% neq 0 (
    echo Error initializing database!
    pause
    exit /b
)

echo [3/3] Starting Server...
echo.
echo The app is running on Port 3000.
echo On this computer: http://localhost:3000
echo From other devices: http://YOUR_PC_IP_ADDRESS:3000
echo.
echo (Press Ctrl+C to stop)
echo.

node server.js
pause
