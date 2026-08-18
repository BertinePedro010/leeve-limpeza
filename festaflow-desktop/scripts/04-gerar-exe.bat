@echo off
setlocal
cd /d "%~dp0.."
echo Gerando instalador executavel do FestaFlow...
call npm run dist
if errorlevel 1 exit /b %errorlevel%
echo Instalador gerado na pasta release.
pause
