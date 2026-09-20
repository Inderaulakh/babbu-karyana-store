@echo off
cd /d "%~dp0"
echo Babbu Karyana Store start ho raha hai...
if not exist node_modules (
  echo Packages install ho rahe hain, 1-2 minute lag sakte hain...
  call npm install
)
echo.
echo Browser mein ye kholo: http://localhost:3000
echo Band karne ke liye is window mein Ctrl+C dabaao.
echo.
call npm start
pause
