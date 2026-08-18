@echo off
setlocal
cd /d "%~dp0.."
echo Iniciando FestaFlow em modo desenvolvimento...
call npm run dev
