@echo off
echo ============================================
echo   Minha Colecao - Instalacao Automatica
echo ============================================
echo.

:: Try to find npm - check common locations
set NPM=npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\npm.cmd" (
        set NPM="C:\Program Files\nodejs\npm.cmd"
    ) else if exist "C:\Program Files (x86)\nodejs\npm.cmd" (
        set NPM="C:\Program Files (x86)\nodejs\npm.cmd"
    ) else (
        echo [ERRO] Node.js / npm nao encontrado!
        echo.
        echo Por favor instala Node.js LTS em:
        echo   https://nodejs.org
        echo.
        echo Apos instalar, executa este script novamente.
        pause
        exit /b 1
    )
)

echo [OK] npm encontrado.
echo.
echo [1/4] A instalar dependencias raiz...
call %NPM% install

echo.
echo [2/4] A instalar dependencias do backend...
cd backend
call %NPM% install
cd ..

echo.
echo [3/4] A instalar dependencias do frontend...
cd frontend
call %NPM% install
cd ..

echo.
echo [4/4] A verificar ficheiro .env...
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env"
    echo.
    echo [ATENCAO] Ficheiro backend\.env criado.
    echo          Abre-o e adiciona a tua ANTHROPIC_API_KEY!
) else (
    echo [OK] backend\.env ja existe.
)

echo.
echo ============================================
echo   Instalacao concluida com sucesso!
echo ============================================
echo.
echo Proximo passo: abre backend\.env e adiciona a tua ANTHROPIC_API_KEY
echo Depois executa iniciar.bat ou "npm run dev"
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
pause
