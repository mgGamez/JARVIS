@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.5 or newer from https://nodejs.org/ then try again.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
node --use-env-proxy --env-file-if-exists=.env scripts/launch.js
if errorlevel 1 pause
