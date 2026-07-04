@echo off
echo Iniciando Minha Colecao...

:: Detect npm location
set NPM=npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\npm.cmd" (
        set NPM="C:\Program Files\nodejs\npm.cmd"
    )
)

echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
call %NPM% run dev
