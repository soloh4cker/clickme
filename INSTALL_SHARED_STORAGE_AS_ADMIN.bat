@echo off
setlocal

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Windows administrator permission...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo Installing shared Aven no-rent storage...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0shared-service\Install-SharedStorage.ps1"
set "RESULT=%errorlevel%"
echo.
if not "%RESULT%"=="0" (
    echo Installation did not complete successfully.
) else (
    echo Installation finished.
)
echo.
pause
exit /b %RESULT%
