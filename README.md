# 📲 Nexi Zap

> Sistema profissional de automação e integração com WhatsApp, desenvolvido em **Node.js**, com **PM2**, interface web própria e arquitetura preparada para produção.

---

## 🏢 Empresa Criadora

**AR Solus**

## 👨‍💻 Criador

**João Vitor Tulli Ribeiro**

---

## 📌 Visão Geral

O **Nexi Zap** é um sistema voltado para **automação de mensagens via WhatsApp**, gerenciamento de sessões, envio de mensagens automáticas e integração com outros sistemas (APIs).

O projeto é dividido em **dois serviços principais**:

* ⚙️ **Backend Node.js** – responsável pela lógica, automações e integrações
* 🖥️ **Interface Web (HTML)** – painel de controle acessado pelo navegador

Ambos os serviços rodam de forma persistente utilizando **PM2**.

---

## 🧱 Tecnologias Utilizadas

* **Node.js 20 (LTS)**
* **Express.js**
* **PM2** (gerenciador de processos)
* **WhatsApp Web API**
* **HTML / CSS / JavaScript** (interface)
* **SQLite / Arquivos locais** (dados e mídias)

---

## 📂 Estrutura do Projeto

```
Zap/
├── apis.js                 # Backend principal (WhatsApp / API)
├── Bancodados/
│   └── interface/          # Interface Web (HTML)
│       ├── login.html
│       ├── dashboard.html
│       ├── configuracoes.html
│       └── interface-server.js
├── uploads/                # Arquivos enviados
├── media/                  # Mídias do WhatsApp
├── node_modules/
├── package.json
├── install.sh
└── README.md
```

---

## ⚙️ Instalação (Debian Linux)

### 1️⃣ Atualizar o sistema

```bash
sudo apt update -y && sudo apt upgrade -y
```

### 2️⃣ Instalar Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3️⃣ Instalar PM2

```bash
sudo npm install -g pm2
```

---

## ▶️ Backend (WhatsApp / API)

### 📌 Executar manualmente (teste)

```bash
node apis.js
```

### 🚀 Executar em produção com PM2

```bash
pm2 start apis.js --name nexi-zap
pm2 save
```

---

## 🖥️ Interface Web (HTML)

A interface web é servida por um **servidor Node.js estático**, rodando na porta **40005**.

### 📌 Arquivo do servidor da interface

`Bancodados/interface/interface-server.js`

### ▶️ Executar manualmente

```bash
node interface-server.js
```

Acessar no navegador:

```
http://IP_DA_VPS:40005
```

### 🚀 Executar com PM2

```bash
pm2 start interface-server.js --name nexi-interface
pm2 save
```

---

## 🔁 Inicialização Automática no Boot

```bash
pm2 startup systemd
# execute o comando sudo que o PM2 mostrar
pm2 save
```

---

## 🔍 Comandos Úteis PM2

```bash
pm2 list
pm2 logs nexi-zap
pm2 logs nexi-interface
pm2 restart nexi-zap
pm2 restart nexi-interface
```

---

## 🔐 Segurança

* Controle de sessão do WhatsApp
* Separação entre backend e interface
* Processos isolados via PM2
* Portas dedicadas

---

## 📜 Licença

Este projeto está licenciado sob a **MIT License**.

Consulte o arquivo `LICENSE` para mais informações.

---

## 🚀 Status do Projeto

✅ Backend WhatsApp funcional
✅ Interface Web ativa
✅ PM2 configurado
✅ Porta dedicada para interface (40005)

🔜 Próximos passos:

* Proxy reverso com Nginx
* HTTPS
* Controle de usuários
* Integração total com outros sistemas

---

💡 *AR Solus — Automação inteligente que funciona no mundo real.*
