@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
  ) else (
    echo Node.js not found on PATH. Install Node 18+ from https://nodejs.org.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo node_modules missing — running npm install first...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Vite dev server... (Ctrl+C to stop)
call npm run dev
