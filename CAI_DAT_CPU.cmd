@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -CpuOnly
set "ASV_EXIT=%ERRORLEVEL%"
if not "%ASV_EXIT%"=="0" (
  echo.
  echo Cai dat chua hoan tat. Xem NHAT_KY_CAI_DAT.txt.
)
pause
exit /b %ASV_EXIT%
