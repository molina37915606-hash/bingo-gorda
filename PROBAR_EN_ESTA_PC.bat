@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 18 o superior.
  pause
  exit /b 1
)
echo Abriendo Bingo de la Gorda - Version Beta...
node server.js
pause
