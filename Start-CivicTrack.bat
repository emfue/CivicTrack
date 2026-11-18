@echo off
setlocal
cd /d "%~dp0"
echo CivicTrack local launcher
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-CivicTrack.ps1"
set "CIVIC_EXIT=%ERRORLEVEL%"
echo.
if not "%CIVIC_EXIT%"=="0" echo Startup did not complete. Read the message above and any opened log windows.
echo Press any key to close this launcher window.
pause >nul
exit /b %CIVIC_EXIT%
