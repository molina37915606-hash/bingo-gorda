@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 18 o superior.
  pause
  exit /b 1
)
echo Abriendo BINGO DE LA GORDA 2.0...
echo Administrador: http://localhost:3210/admin
echo Jugadores:     http://localhost:3210/jugador
node server.js
pause
