#!/bin/bash

set -e

APP_NAME="sistema-nexi"
APP_FILE="apis.js"
APP_PORT="30003"

echo "================================================="
echo "  SISTEMA NEXI - ARTIFICIAL RIBEIRO"
echo "================================================="
echo

# -------------------------------
# 1. Verificações básicas
# -------------------------------
if [ "$(id -u)" -ne 0 ]; then
  echo "[ERRO] Execute como root (use sudo)."
  exit 1
fi

if [ ! -f "$APP_FILE" ]; then
  echo "[ERRO] Arquivo $APP_FILE não encontrado."
  echo "Execute este script dentro da pasta do sistema."
  exit 1
fi

# -------------------------------
# 2. Atualizar sistema
# -------------------------------
echo "[INFO] Atualizando sistema..."
apt update -y >/dev/null

# -------------------------------
# 3. Instalar dependências base
# -------------------------------
echo "[INFO] Instalando dependências básicas..."
apt install -y curl sudo ca-certificates >/dev/null

# -------------------------------
# 4. Instalar Node.js LTS (20)
# -------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "[INFO] Instalando Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt install -y nodejs >/dev/null
else
  echo "[OK] Node.js já instalado: $(node -v)"
fi

# -------------------------------
# 5. Instalar PM2
# -------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[INFO] Instalando PM2..."
  npm install -g pm2 >/dev/null
else
  echo "[OK] PM2 já instalado: $(pm2 -v)"
fi

# -------------------------------
# 6. Instalar dependências Node
# -------------------------------
echo "[INFO] Instalando dependências do projeto..."

if [ ! -f "package.json" ]; then
  npm init -y >/dev/null
fi

npm install express sqlite3 cors body-parser whatsapp-web.js qrcode-terminal multer xlsx axios >/dev/null

# -------------------------------
# 7. Subir aplicação com PM2
# -------------------------------
echo "[INFO] Iniciando sistema com PM2..."

pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start "$APP_FILE" --name "$APP_NAME"

# -------------------------------
# 8. Ativar PM2 no boot
# -------------------------------
echo "[INFO] Configurando PM2 para iniciar com o sistema..."
pm2 startup systemd -u root --hp /root >/dev/null
pm2 save >/dev/null

# -------------------------------
# 9. Resultado final
# -------------------------------
echo
echo "================================================="
echo "  SISTEMA INSTALADO E EM EXECUÇÃO"
echo "================================================="
echo
echo "Nome no PM2 : $APP_NAME"
echo "Porta       : $APP_PORT"
echo
echo "Comandos úteis:"
echo "  pm2 status"
echo "  pm2 logs $APP_NAME"
echo "  pm2 restart $APP_NAME"
echo "  pm2 stop $APP_NAME"
echo
echo "Sistema sobe automaticamente após reboot."
echo "================================================="
