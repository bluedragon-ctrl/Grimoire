@echo off
setlocal

cd /d "%~dp0"

echo === checking node ===
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found on PATH. Install Node 20+ from https://nodejs.org and re-run.
  pause
  exit /b 1
)
node --version
npm --version

echo.
echo === npm install ===
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo === npm test ===
call npm test
set TEST_EXIT=%errorlevel%

echo.
if %TEST_EXIT% equ 0 (
  echo Tests passed. Run ^"npm run dev^" to start the UI.
) else (
  echo Tests failed with exit code %TEST_EXIT%.
)

pause
exit /b %TEST_EXIT%
