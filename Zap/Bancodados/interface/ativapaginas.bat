@echo off
:: Configura a codificação para exibir acentos
chcp 65001 >nul
title NEXI CRM - Servidor HTTPS (Porta 30004)
color 0B

cls
echo ======================================================
echo           NEXI CRM - SERVIDOR SEGURO (HTTPS)
echo ======================================================
echo.
echo  [INFO] Verificando ambiente...

:: Verifica se o Node.js está instalado
call node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERRO CRITICO] O Node.js nao foi encontrado!
    echo  Para rodar este servidor, instale o Node.js em: https://nodejs.org/
    echo.
    pause
    exit
)

echo  [OK] Node.js detectado.
echo.
echo  ------------------------------------------------------
echo   INICIANDO EM: https://localhost:30004/login.html
echo  ------------------------------------------------------
echo.
echo  [ATENCAO - LEIA ISTO]:
echo  1. O navegador abrira automaticamente.
echo  2. Se aparecer "Sua conexao nao e particular":
echo     Clique em "Avancado" -> "Ir para localhost (nao seguro)".
echo.
echo  Carregando modulos...

:: Inicia o servidor na porta 30004 com HTTPS e abre login.html
:: --startPath "login.html": Força abrir direto no login
call npx browser-sync start --server --https --port 30004 --files "**/*" --no-notify --startPath "login.html"

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERRO] Nao foi possivel iniciar na porta 30004.
    pause
)