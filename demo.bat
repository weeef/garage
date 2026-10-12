@echo off
rem Garage Log demo for screen recordings (OBS etc.).
rem Opens the real app with sample data in a separate folder; your own data is never touched.
setlocal
cd /d "%~dp0"
title Garage Log demo

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is needed: https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\.bin\electron.cmd" (
  echo First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo.
echo  GARAGE LOG DEMO
echo  ---------------
echo  1. Point OBS at the "Garage Log" window (Window Capture) and start recording.
echo  2. Click the app window and press SPACE to start the guided tour (under 2 minutes).
echo.
echo     SPACE  start the tour
echo     R      reset the sample data for another take
echo     F11    full screen
echo.
echo  Close the app window to finish.
echo.
call "node_modules\.bin\electron.cmd" scripts\demo\desktop.js
