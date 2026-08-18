@echo off
setlocal
cd /d "%~dp0.."
echo Instalando dependencias raiz...
call npm install
if errorlevel 1 exit /b %errorlevel%
echo Instalando backend e frontend...
call npm run install:all
if errorlevel 1 exit /b %errorlevel%
echo Instalacao concluida.
pause
