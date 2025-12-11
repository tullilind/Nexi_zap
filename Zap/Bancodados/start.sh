#!/bin/bash

echo ""
echo " ===== INICIANDO SISTEMA NEXI ====="
echo ""

# Abrir interface
echo "Abrindo interface na porta 30003..."
xdg-open http://localhost:30003 >/dev/null 2>&1 &

echo ""
echo "Iniciando API (apis.js)..."
echo ""

node apis.js
