@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 18 o superior.
  pause
  exit /b 1
)
echo Abriendo prueba local de V10.3...
node server.js
pause
