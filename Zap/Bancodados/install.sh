#!/bin/bash

echo ""
echo " ===== SISTEMA NEXI - LINUX INSTALLER ====="
echo ""

# 1. Verificar Node
if ! command -v node &> /dev/null
then
    echo "[ERRO] Node.js não está instalado!"
    echo "Instale com:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "Depois:        sudo apt install -y nodejs"
    exit 1
fi

# 2. Instalar dependências
echo "Instalando dependências NPM..."
npm install

if [ $? -ne 0 ]; then
    echo "[ERRO] Falha ao instalar bibliotecas npm!"
    exit 1
fi

echo ""
echo " ----- INSTALAÇÃO CONCLUÍDA! -----"
echo " Use:  ./start.sh"
echo ""
