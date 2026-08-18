@echo off
setlocal
cd /d "%~dp0.."
echo Criando banco SQLite com Prisma...
call npm run db:push
if errorlevel 1 exit /b %errorlevel%
echo Inserindo dados iniciais...
call npm run db:seed
if errorlevel 1 exit /b %errorlevel%
echo Banco criado e populado com sucesso.
pause
