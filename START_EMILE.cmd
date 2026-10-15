@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0index.html" (
  echo Please extract the complete ZIP folder before launching.
  pause
  exit /b 1
)
start "" "%~dp0index.html"
exit /b
