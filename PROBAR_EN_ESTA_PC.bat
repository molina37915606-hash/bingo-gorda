@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 18 o superior.
  pause
  exit /b 1
)
echo Iniciando BINGO DE LA GORDA ALFA...
echo Admin principal: http://localhost:3210/admin
echo Jugadores:       http://localhost:3210/jugador
echo Demo:            http://localhost:3210/demo
node server.js
pause
