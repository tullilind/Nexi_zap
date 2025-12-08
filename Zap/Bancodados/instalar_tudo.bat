@echo off
title SISTEMA NEXI - ARTIFICIAL RIBEIRO (Corrigido)
mode con: cols=100 lines=30
color 02

:: ==========================================
::   1. VERIFICACAO DE ARQUIVOS CRITICOS
:: ==========================================
if exist apis.js goto :LOGO

cls
color 0C
echo.
echo [ERRO CRITICO] O arquivo 'apis.js' nao foi encontrado!
echo.
echo Este arquivo .bat deve estar NA MESMA PASTA que o 'apis.js'.
echo.
pause
exit

:LOGO
:: ==========================================
::        2. ANIMACAO ARTIFICIAL RIBEIRO
:: ==========================================
cls
echo.
echo.
echo       :::     :::::::::: ::::::::: 
echo     :+: :+:   :+:        :+:    :+:
echo    +:+   +:+  +:+        +:+    +:+
echo   +#++:++#++: +#++:++#   +#++:++#: 
echo   +#+     +#+ +#+        +#+    +#+
echo   #+#     #+# #+#        #+#    #+#
echo   ###     ### ########## ###    ###
echo.
echo   ARTIFICIAL RIBEIRO - TECHNOLOGY
echo.
echo   ============================================
echo      CRIADOR: JOAO VITOR - SISTEMA NEXI
echo   ============================================
echo.
timeout /t 1 >nul

:: ==========================================
::   3. VERIFICACAO INTELIGENTE
:: ==========================================

:: Verifica Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERRO] Node.js nao encontrado. Instale em nodejs.org
    pause
    exit
)

:: Verifica se precisa instalar
if exist node_modules (
    goto :RODAR_SISTEMA
)

:: ==========================================
::    4. MODO INSTALACAO COMPLETA
:: ==========================================
color 0B
echo   [ ! ] Primeira vez detectada ou bibliotecas faltando.
echo   [... ] Iniciando instalacao automatica...
echo.

if not exist package.json (
    call npm init -y >nul
)

echo   Baixando TODAS as bibliotecas necessarias...
echo   Aguarde (pode levar 2-3 minutos)...
echo.

:: LISTA COMPLETA COM AXIOS
call npm install express sqlite3 cors body-parser whatsapp-web.js qrcode-terminal multer xlsx axios

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO] Falha na instalacao. Verifique:
    echo   - Conexao com internet
    echo   - Permissoes de administrador
    echo   - Antivirus nao bloqueando
    echo.
    pause
    exit
)

echo.
echo   [ OK ] Instalacao Concluida!
timeout /t 2 >nul

:RODAR_SISTEMA
:: ==========================================
::        5. INICIAR O SISTEMA
:: ==========================================
cls
color 0A
echo.
echo.
echo       :::     :::::::::: ::::::::: 
echo     :+: :+:   :+:        :+:    :+:
echo    +:+   +:+  +:+        +:+    +:+
echo   +#++:++#++: +#++:++#   +#++:++#: 
echo   +#+     +#+ +#+        +#+    +#+
echo   #+#     #+# #+#        #+#    #+#
echo   ###     ### ########## ###    ###
echo.
echo ==================================================
echo    SISTEMA ONLINE - AGUARDANDO CONEXAO
echo ==================================================
echo.
echo    [1] Abrindo Interface no Navegador...
start http://localhost:30003
timeout /t 2 >nul
echo    [2] Iniciando API e Robo (apis.js)...
echo.
echo    ------------------------------------------
echo    LOGS DO SISTEMA:
echo    ------------------------------------------
echo.

node apis.js

:: Se o Node parar com erro, mostra mensagem
if %errorlevel% neq 0 (
    color 0E
    echo.
    echo ================================================
    echo   [!] O sistema parou com erro
    echo ================================================
    echo.
)

pause