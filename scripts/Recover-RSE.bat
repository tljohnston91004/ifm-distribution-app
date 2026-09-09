@echo off
REM Recover RSE after deleting database files or a stuck Node lock.
REM Run this from your RSE app folder (where Start RSE.bat lives).

echo.
echo === RSE recovery ===
echo.

echo [1/3] Stopping any Node processes still holding the database...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
  echo   No Node processes found — OK.
) else (
  echo   Node stopped.
)

echo.
echo [2/3] Recreating empty RSE database schema...
call npm run db:push
if errorlevel 1 (
  echo.
  echo FAILED: npm run db:push — open this folder in a terminal and check the error above.
  pause
  exit /b 1
)

echo.
echo [3/3] Done. Double-click Start RSE.bat to launch RSE on http://127.0.0.1:3000
echo.
echo IFM should run on http://127.0.0.1:3001 — not 3000.
echo.
pause
