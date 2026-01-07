@echo off
echo Starting UTM Move App...

cd Backend
start "UTM Move Backend" cmd /k "npm start"
cd ..

cd Frontend
start "UTM Move Frontend" cmd /k "npm run dev"
cd ..

echo App started!
