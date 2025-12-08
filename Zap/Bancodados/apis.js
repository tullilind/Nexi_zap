const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const multer = require('multer');
const xlsx = require('xlsx');
const axios = require('axios');

const app = express();
const PORT = 30003;

// --- VARIÁVEIS GLOBAIS ---
let whatsappStatus = 'INICIANDO';
let qrCodeImage = null;
let clientReady = false;
let nomeDoBotCache = 'NEXI BOT';

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/media', express.static('media'));

// --- CONFIGURAÇÃO DE DIRETÓRIOS ---
const dbFolder = path.join(__dirname, 'bancodados');
const backupFolder = path.join(dbFolder, 'backups');
const uploadsFolder = path.join(__dirname, 'uploads');
const mediaFolder = path.join(__dirname, 'media');
const profilePicsFolder = path.join(mediaFolder, 'profile_pics');

if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder);
if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder);
if (!fs.existsSync(uploadsFolder)) fs.mkdirSync(uploadsFolder);
if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder);
if (!fs.existsSync(profilePicsFolder)) fs.mkdirSync(profilePicsFolder);

// --- CONFIGURAÇÃO DO UPLOAD (MULTER) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsFolder);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalNameSanitized = file.originalname.replace(/\s+/g, '_');
        cb(null, uniqueSuffix + '-' + originalNameSanitized);
    }
});
const upload = multer({ storage: storage });

// --- CONEXÃO COM O BANCO DE DADOS ---
const dbPath = path.join(dbFolder, 'sistema_zap.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Erro ao conectar no banco:', err.message);
    else console.log('📦 Banco de dados conectado em:', dbPath);
});

// --- CRIAÇÃO DAS TABELAS ---
db.serialize(() => {
    // Usuários
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        nome TEXT, 
        usuario TEXT UNIQUE, 
        senha TEXT
    )`);
    
    // Configurações
    db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        chave TEXT UNIQUE, 
        valor TEXT
    )`);
    db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('nome_bot', 'NEXI BOT')`);

    // Auto Respostas
    db.run(`CREATE TABLE IF NOT EXISTS auto_respostas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        gatilho TEXT, 
        resposta TEXT, 
        ativo INTEGER DEFAULT 1, 
        tipo_media TEXT DEFAULT 'texto', 
        caminho_media TEXT
    )`);

    // Histórico de Mensagens com status de leitura
    db.run(`CREATE TABLE IF NOT EXISTS historico_mensagens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remetente TEXT,
        destinatario TEXT,
        mensagem TEXT,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        tipo TEXT,
        tipo_arquivo TEXT,
        caminho_arquivo TEXT,
        nome_arquivo TEXT,
        tamanho_arquivo INTEGER,
        mimetype TEXT,
        lida INTEGER DEFAULT 0,
        arquivada INTEGER DEFAULT 0,
        deletada INTEGER DEFAULT 0,
        id_mensagem_whatsapp TEXT
    )`);
    
    // Contatos com foto local
    db.run(`CREATE TABLE IF NOT EXISTS contatos (
        numero TEXT PRIMARY KEY,
        nome TEXT,
        url_foto TEXT,
        caminho_foto_local TEXT,
        ultima_interacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        bloqueado INTEGER DEFAULT 0,
        categoria_id INTEGER,
        notas TEXT,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id)
    )`);

    // Categorias de Conversas
    db.run(`CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT UNIQUE,
        cor TEXT,
        icone TEXT,
        ordem INTEGER DEFAULT 0
    )`);

    // Inserir categorias padrão
    db.run(`INSERT OR IGNORE INTO categorias (id, nome, cor, icone, ordem) VALUES 
        (1, 'Clientes', '#4CAF50', '👥', 1),
        (2, 'Prospects', '#FF9800', '🎯', 2),
        (3, 'Suporte', '#2196F3', '🛠️', 3),
        (4, 'Favoritos', '#F44336', '⭐', 4),
        (5, 'Arquivados', '#9E9E9E', '📦', 5)
    `);

    // Respostas Rápidas
    db.run(`CREATE TABLE IF NOT EXISTS respostas_rapidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        texto TEXT,
        atalho TEXT
    )`);

    // Campanhas Melhoradas com variáveis
    db.run(`CREATE TABLE IF NOT EXISTS campanhas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        nome_arquivo TEXT,
        mensagem_base TEXT,
        coluna_numero TEXT,
        variaveis_disponiveis TEXT,
        variaveis_mapeamento TEXT,
        total_numeros INTEGER,
        enviados INTEGER DEFAULT 0,
        erros INTEGER DEFAULT 0,
        status TEXT DEFAULT 'AGENDADO',
        data_agendamento DATETIME,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        intervalo_min INTEGER DEFAULT 5000,
        intervalo_max INTEGER DEFAULT 15000,
        tipo_media TEXT,
        caminho_media TEXT
    )`);

    // Log de Envios da Campanha
    db.run(`CREATE TABLE IF NOT EXISTS campanhas_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campanha_id INTEGER,
        numero TEXT,
        mensagem_enviada TEXT,
        status TEXT,
        erro TEXT,
        data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campanha_id) REFERENCES campanhas(id)
    )`);

    // Mensagens Fixadas
    db.run(`CREATE TABLE IF NOT EXISTS mensagens_fixadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_contato TEXT,
        mensagem_id INTEGER,
        data_fixacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mensagem_id) REFERENCES historico_mensagens(id)
    )`);

    // Estatísticas
    db.run(`CREATE TABLE IF NOT EXISTS estatisticas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        valor INTEGER,
        data DATE DEFAULT (date('now'))
    )`);
});

// --- FUNÇÕES AUXILIARES ---
const sleep = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1) + min)));

function atualizarNomeBot() {
    db.get("SELECT valor FROM configuracoes WHERE chave='nome_bot'", (err, row) => {
        if(row) nomeDoBotCache = row.valor;
    });
}
atualizarNomeBot();

function limparMensagensAntigas() {
    db.run(`DELETE FROM historico_mensagens WHERE data_hora < datetime('now', '-15 days') AND arquivada = 0 AND deletada = 1`, function(err) {
        if(!err && this.changes > 0) console.log(`🗑️ ${this.changes} mensagens antigas removidas.`);
    });
}
setInterval(limparMensagensAntigas, 1000 * 60 * 60 * 24);

// Salvar foto de perfil localmente
async function salvarFotoPerfil(numero, urlFoto) {
    if (!urlFoto) return null;
    
    try {
        const nomeArquivo = `${numero}.jpg`;
        const caminhoLocal = path.join(profilePicsFolder, nomeArquivo);
        
        if (fs.existsSync(caminhoLocal)) {
            return `/media/profile_pics/${nomeArquivo}`;
        }
        
        // Download da foto de perfil
        const response = await axios.get(urlFoto, { responseType: 'arraybuffer' });
        fs.writeFileSync(caminhoLocal, response.data);
        
        return `/media/profile_pics/${nomeArquivo}`;
    } catch (e) {
        console.error('Erro ao salvar foto perfil:', e);
        return null;
    }
}

// Salvar mídia recebida
async function salvarMidia(msg, mediaData) {
    try {
        const timestamp = Date.now();
        const extensao = mediaData.mimetype.split('/')[1].split(';')[0];
        const nomeArquivo = `${timestamp}_${msg.from.replace('@c.us', '')}.${extensao}`;
        const caminhoCompleto = path.join(mediaFolder, nomeArquivo);
        
        const buffer = Buffer.from(mediaData.data, 'base64');
        fs.writeFileSync(caminhoCompleto, buffer);
        
        return {
            caminho: `/media/${nomeArquivo}`,
            nome: nomeArquivo,
            tamanho: buffer.length,
            mimetype: mediaData.mimetype
        };
    } catch (e) {
        console.error('Erro ao salvar mídia:', e);
        return null;
    }
}

// Determinar tipo de arquivo
function getTipoArquivo(mimetype) {
    if (!mimetype) return 'arquivo';
    
    if (mimetype.includes('image')) return 'imagem';
    if (mimetype.includes('video')) return 'video';
    if (mimetype.includes('audio')) return 'audio';
    if (mimetype.includes('pdf')) return 'pdf';
    if (mimetype.includes('document') || mimetype.includes('word')) return 'documento';
    if (mimetype.includes('spreadsheet') || mimetype.includes('excel')) return 'planilha';
    
    return 'arquivo';
}

// Substituir variáveis na mensagem
function substituirVariaveis(mensagem, dados, mapeamento) {
    let mensagemFinal = mensagem;
    
    if (mapeamento) {
        const map = JSON.parse(mapeamento);
        Object.keys(map).forEach(variavel => {
            const coluna = map[variavel];
            const valor = dados[coluna] || '';
            mensagemFinal = mensagemFinal.replace(new RegExp(`{${variavel}}`, 'g'), valor);
        });
    }
    
    return mensagemFinal;
}

// ========================================================
// CLIENTE WHATSAPP
// ========================================================

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }
});

client.on('qr', (qr) => {
    console.log('📱 QR Code gerado! Aguardando leitura...');
    qrCodeImage = qr;
    whatsappStatus = 'AGUARDANDO_QR';
    qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado!');
    whatsappStatus = 'CONECTADO';
    qrCodeImage = null;
    clientReady = true;
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Desconectado:', reason);
    whatsappStatus = 'DESCONECTADO';
    clientReady = false;
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

client.on('message', async msg => {
    if (msg.from.includes('@g.us') || msg.isStatus) return;

    const texto = msg.body || '[Mídia sem legenda]';
    const numeroCliente = msg.from.replace('@c.us', '');
    
    let nomeContato = numeroCliente;
    let urlFoto = null;
    let caminhoFotoLocal = null;

    try {
        const contact = await msg.getContact();
        nomeContato = contact.name || contact.pushname || numeroCliente;
        urlFoto = await contact.getProfilePicUrl().catch(() => null);
        
        if (urlFoto) {
            caminhoFotoLocal = await salvarFotoPerfil(numeroCliente, urlFoto);
        }
    } catch(e) {
        console.error('Erro ao obter contato:', e);
    }

    // Salva/Atualiza Contato
    db.run(`INSERT INTO contatos (numero, nome, url_foto, caminho_foto_local, ultima_interacao) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(numero) DO UPDATE SET 
                nome=excluded.nome, 
                url_foto=excluded.url_foto, 
                caminho_foto_local=excluded.caminho_foto_local,
                ultima_interacao=CURRENT_TIMESTAMP`, 
            [numeroCliente, nomeContato, urlFoto, caminhoFotoLocal]);

    // Processa mídia se houver
    let tipoMsg = 'texto';
    let dadosMidia = null;
    
    if (msg.hasMedia) {
        try {
            console.log(`📎 Baixando mídia de ${numeroCliente}...`);
            const media = await msg.downloadMedia();
            
            if (media) {
                dadosMidia = await salvarMidia(msg, media);
                tipoMsg = getTipoArquivo(media.mimetype);
                console.log(`✅ Mídia salva: ${dadosMidia?.nome}`);
            }
        } catch (e) {
            console.error('Erro ao baixar mídia:', e);
            tipoMsg = 'midia_erro';
        }
    }

    // Salva Mensagem no Histórico (nova mensagem não lida)
    db.run(`INSERT INTO historico_mensagens 
            (remetente, destinatario, mensagem, tipo, tipo_arquivo, caminho_arquivo, nome_arquivo, tamanho_arquivo, mimetype, lida, id_mensagem_whatsapp) 
            VALUES (?, 'BOT', ?, 'RECEBIDA', ?, ?, ?, ?, ?, 0, ?)`, 
           [numeroCliente, texto, tipoMsg, 
            dadosMidia?.caminho, dadosMidia?.nome, dadosMidia?.tamanho, dadosMidia?.mimetype, msg.id._serialized]);

    console.log(`📩 De ${numeroCliente}: ${texto} ${msg.hasMedia ? '[COM MÍDIA]' : ''}`);

    // Atualizar estatísticas
    db.run(`INSERT INTO estatisticas (tipo, valor) VALUES ('mensagens_recebidas', 1)`);

    // Auto-Resposta
    db.all(`SELECT * FROM auto_respostas WHERE ativo = 1`, [], async (err, rows) => {
        if (err) return;
        const regra = rows.find(r => texto.toLowerCase().includes(r.gatilho.toLowerCase()));
        
        if (regra) {
            const chat = await msg.getChat();
            if (regra.tipo_media === 'audio') chat.sendStateRecording();
            else chat.sendStateTyping();

            setTimeout(async () => {
                try {
                    const respostaFinal = regra.resposta ? `${regra.resposta}\n\n🤖 *${nomeDoBotCache}*` : "";

                    if (regra.caminho_media && fs.existsSync(regra.caminho_media)) {
                        const media = MessageMedia.fromFilePath(regra.caminho_media);
                        if (regra.tipo_media === 'audio') {
                            await client.sendMessage(msg.from, media, { sendAudioAsVoice: true });
                            if (respostaFinal) await client.sendMessage(msg.from, respostaFinal);
                        } else {
                            await client.sendMessage(msg.from, media, { caption: respostaFinal });
                        }
                    } else {
                        await client.sendMessage(msg.from, respostaFinal);
                    }
                    
                    db.run(`INSERT INTO historico_mensagens (remetente, destinatario, mensagem, tipo, tipo_arquivo, lida) VALUES ('BOT', ?, ?, 'ENVIADA', 'texto', 1)`, 
                           [numeroCliente, `[Auto] ${regra.gatilho}`]);

                    db.run(`INSERT INTO estatisticas (tipo, valor) VALUES ('mensagens_enviadas', 1)`);

                } catch (error) { 
                    console.error("Erro ao enviar auto-resposta:", error.message); 
                }
            }, 2000);
        }
    });
});

client.initialize();

// ========================================================
// AGENDADOR DE CAMPANHAS MELHORADO
// ========================================================
setInterval(() => {
    if (!clientReady) return;

    const sql = `SELECT * FROM campanhas WHERE status = 'AGENDADO' AND data_agendamento <= datetime('now', 'localtime')`;
    
    db.all(sql, [], (err, rows) => {
        if (err || rows.length === 0) return;

        rows.forEach(campanha => {
            console.log(`🚀 Iniciando campanha agendada: ${campanha.nome || campanha.id}`);
            db.run(`UPDATE campanhas SET status = 'PROCESSANDO' WHERE id = ?`, [campanha.id]);
            
            const caminhoArquivo = path.join(uploadsFolder, campanha.nome_arquivo);
            if (fs.existsSync(caminhoArquivo)) {
                processarCampanha(campanha);
            } else {
                db.run(`UPDATE campanhas SET status = 'ERRO_ARQUIVO' WHERE id = ?`, [campanha.id]);
            }
        });
    });
}, 60000);

async function processarCampanha(campanha) {
    const caminhoArquivo = path.join(uploadsFolder, campanha.nome_arquivo);
    let dados = [];
    
    try {
        const workbook = xlsx.readFile(caminhoArquivo);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        dados = xlsx.utils.sheet_to_json(sheet);
        
    } catch (e) {
        console.error("Erro ao ler arquivo campanha:", e);
        db.run(`UPDATE campanhas SET status = 'ERRO_LEITURA' WHERE id = ?`, [campanha.id]);
        return;
    }

    let enviados = 0, erros = 0;
    const colunaNumero = campanha.coluna_numero;
    const intervalMin = campanha.intervalo_min || 5000;
    const intervalMax = campanha.intervalo_max || 15000;

    for (const linha of dados) {
        if (!clientReady) {
            console.log("Bot desconectou durante campanha. Pausando.");
            db.run(`UPDATE campanhas SET status = 'PAUSADO' WHERE id = ?`, [campanha.id]);
            break; 
        }

        try {
            let numBruto = linha[colunaNumero];
            if (!numBruto) continue;

            let num = String(numBruto).replace(/\D/g, '');
            if (num.length >= 10 && !num.startsWith('55')) num = '55' + num;
            
            // Substituir variáveis
            const mensagemPersonalizada = substituirVariaveis(
                campanha.mensagem_base, 
                linha, 
                campanha.variaveis_mapeamento
            );
            const msgFinal = `${mensagemPersonalizada}\n\n🤖 *${nomeDoBotCache}*`;

            // Enviar com mídia se configurado
            if (campanha.caminho_media && fs.existsSync(campanha.caminho_media)) {
                const media = MessageMedia.fromFilePath(campanha.caminho_media);
                await client.sendMessage(num + '@c.us', media, { caption: msgFinal });
            } else {
                await client.sendMessage(num + '@c.us', msgFinal);
            }
            
            enviados++;
            
            db.run(`INSERT INTO historico_mensagens (remetente, destinatario, mensagem, tipo, lida) VALUES ('BOT', ?, ?, 'ENVIADA', 1)`, [num, msgFinal]);
            db.run(`INSERT INTO campanhas_log (campanha_id, numero, mensagem_enviada, status) VALUES (?, ?, ?, 'SUCESSO')`, 
                   [campanha.id, num, msgFinal]);
            
            console.log(`✅ Campanha ${campanha.id}: Enviado para ${num}`);
            
        } catch (e) {
            console.error(`❌ Campanha ${campanha.id}: Erro ao enviar`);
            erros++;
            
            db.run(`INSERT INTO campanhas_log (campanha_id, numero, status, erro) VALUES (?, ?, 'ERRO', ?)`, 
                   [campanha.id, linha[colunaNumero], e.message]);
        }
        
        db.run(`UPDATE campanhas SET enviados = ?, erros = ? WHERE id = ?`, [enviados, erros, campanha.id]);
        
        await sleep(intervalMin, intervalMax); 
    }
    
    db.run(`UPDATE campanhas SET status = 'CONCLUIDO' WHERE id = ?`, [campanha.id]);
    db.run(`INSERT INTO estatisticas (tipo, valor) VALUES ('campanhas_concluidas', 1)`);
    console.log(`🏁 Campanha ${campanha.id} concluída. Enviados: ${enviados}, Erros: ${erros}`);
}

// ========================================================
// APIs DE CHAT E CONTATOS MELHORADAS
// ========================================================

// Listar Contatos com foto, categoria e status
app.get('/api/chat/contatos', (req, res) => {
    const { categoria, busca, bloqueados } = req.query;
    
    let sql = `SELECT 
                c.numero, c.nome, c.url_foto, c.caminho_foto_local, 
                c.ultima_interacao, c.bloqueado, c.categoria_id, c.notas,
                cat.nome as categoria_nome, cat.cor as categoria_cor,
                COUNT(CASE WHEN h.lida = 0 AND h.tipo = 'RECEBIDA' THEN 1 END) as nao_lidas
              FROM contatos c
              LEFT JOIN categorias cat ON c.categoria_id = cat.id
              LEFT JOIN historico_mensagens h ON c.numero = h.remetente
              WHERE 1=1`;
    
    const params = [];
    
    if (categoria) {
        sql += ` AND c.categoria_id = ?`;
        params.push(categoria);
    }
    
    if (busca) {
        sql += ` AND (c.nome LIKE ? OR c.numero LIKE ?)`;
        params.push(`%${busca}%`, `%${busca}%`);
    }
    
    if (bloqueados === 'false') {
        sql += ` AND c.bloqueado = 0`;
    }
    
    sql += ` GROUP BY c.numero ORDER BY c.ultima_interacao DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

// Conversa específica com mensagens não lidas
app.get('/api/chat/mensagens/:numero', (req, res) => {
    const numero = req.params.numero;
    const sql = `SELECT 
                    h.id, h.remetente, h.destinatario, h.mensagem, h.data_hora,
                    h.tipo, h.tipo_arquivo, h.caminho_arquivo, h.nome_arquivo,
                    h.tamanho_arquivo, h.mimetype, h.lida, h.arquivada, h.deletada,
                    mf.id as fixada
                FROM historico_mensagens h
                LEFT JOIN mensagens_fixadas mf ON h.id = mf.mensagem_id AND mf.numero_contato = ?
                WHERE (h.remetente = ? OR h.destinatario = ?) AND h.deletada = 0
                ORDER BY h.data_hora ASC`;
    
    db.all(sql, [numero, numero, numero], (err, rows) => {
        if (err) {
            return res.status(500).json({ erro: true, mensagem: err.message });
        }
        res.json({ erro: false, dados: rows });
    });
});

// Marcar mensagens como lidas
app.post('/api/chat/marcar-lidas/:numero', (req, res) => {
    const numero = req.params.numero;
    
    db.run(`UPDATE historico_mensagens 
            SET lida = 1 
            WHERE remetente = ? AND tipo = 'RECEBIDA' AND lida = 0`, 
           [numero], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: `${this.changes} mensagens marcadas como lidas` });
    });
});

// Buscar contato completo
app.get('/api/chat/contato/:numero', (req, res) => {
    const numero = req.params.numero;
    const sql = `SELECT 
                    c.*, 
                    cat.nome as categoria_nome, 
                    cat.cor as categoria_cor,
                    COUNT(CASE WHEN h.lida = 0 AND h.tipo = 'RECEBIDA' THEN 1 END) as nao_lidas
                FROM contatos c
                LEFT JOIN categorias cat ON c.categoria_id = cat.id
                LEFT JOIN historico_mensagens h ON c.numero = h.remetente
                WHERE c.numero = ?
                GROUP BY c.numero`;
    
    db.get(sql, [numero], (err, row) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        if (!row) return res.status(404).json({ erro: true, mensagem: 'Contato não encontrado' });
        res.json({ erro: false, dados: row });
    });
});

// Atualizar categoria do contato
app.put('/api/chat/contato/:numero/categoria', (req, res) => {
    const numero = req.params.numero;
    const { categoria_id } = req.body;
    
    db.run(`UPDATE contatos SET categoria_id = ? WHERE numero = ?`, 
           [categoria_id, numero], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Categoria atualizada' });
    });
});

// Bloquear/Desbloquear contato
app.put('/api/chat/contato/:numero/bloquear', (req, res) => {
    const numero = req.params.numero;
    const { bloqueado } = req.body;
    
    db.run(`UPDATE contatos SET bloqueado = ? WHERE numero = ?`, 
           [bloqueado ? 1 : 0, numero], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: bloqueado ? 'Contato bloqueado' : 'Contato desbloqueado' });
    });
});

// Atualizar notas do contato
app.put('/api/chat/contato/:numero/notas', (req, res) => {
    const numero = req.params.numero;
    const { notas } = req.body;
    
    db.run(`UPDATE contatos SET notas = ? WHERE numero = ?`, 
           [notas, numero], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Notas atualizadas' });
    });
});

// Envio Manual com mídias
app.post('/api/chat/enviar', upload.single('arquivo'), async (req, res) => {
    const { numero, mensagem } = req.body;
    
    if (!clientReady) return res.status(500).json({ erro: true, mensagem: "Bot Offline" });

    // Verificar se contato está bloqueado
    const contato = await new Promise((resolve) => {
        db.get(`SELECT bloqueado FROM contatos WHERE numero = ?`, [numero.replace(/\D/g, '')], (err, row) => {
            resolve(row);
        });
    });

    if (contato && contato.bloqueado) {
        return res.status(403).json({ erro: true, mensagem: "Contato bloqueado" });
    }

    try {
        let numFormatado = numero.replace(/\D/g, '');
        if (numFormatado.length >= 10 && !numFormatado.startsWith('55')) numFormatado = '55' + numFormatado;
        const idZap = numFormatado + '@c.us';

        let tipoArq = 'texto';
        let caminhoArq = null;
        let nomeArq = null;
        let tamanhoArq = null;
        let mimetypeArq = null;
        let msgFinal = mensagem || "";

        if (req.file) {
            caminhoArq = `/uploads/${req.file.filename}`;
            nomeArq = req.file.filename;
            tamanhoArq = req.file.size;
            mimetypeArq = req.file.mimetype;
            
            const media = MessageMedia.fromFilePath(req.file.path);
            tipoArq = getTipoArquivo(req.file.mimetype);

            await client.sendMessage(idZap, media, { caption: msgFinal });
        } else {
            await client.sendMessage(idZap, msgFinal);
        }

        db.run(`INSERT INTO historico_mensagens 
                (remetente, destinatario, mensagem, tipo, tipo_arquivo, caminho_arquivo, nome_arquivo, tamanho_arquivo, mimetype, lida) 
                VALUES ('BOT', ?, ?, 'ENVIADA', ?, ?, ?, ?, ?, 1)`,
            [numFormatado, msgFinal, tipoArq, caminhoArq, nomeArq, tamanhoArq, mimetypeArq]);

        db.run(`UPDATE contatos SET ultima_interacao = CURRENT_TIMESTAMP WHERE numero = ?`, [numFormatado]);
        db.run(`INSERT INTO estatisticas (tipo, valor) VALUES ('mensagens_enviadas', 1)`);

        res.json({ erro: false, mensagem: "Enviado!" });

    } catch (e) {
        console.error('Erro ao enviar:', e);
        res.status(500).json({ erro: true, mensagem: e.message });
    }
});

// Arquivar mensagem
app.put('/api/chat/mensagem/:id/arquivar', (req, res) => {
    const { id } = req.params;
    const { arquivada } = req.body;
    
    db.run(`UPDATE historico_mensagens SET arquivada = ? WHERE id = ?`, 
           [arquivada ? 1 : 0, id], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Status atualizado' });
    });
});

// Deletar mensagem
app.delete('/api/chat/mensagem/:id', (req, res) => {
    const { id } = req.params;
    
    db.run(`UPDATE historico_mensagens SET deletada = 1 WHERE id = ?`, 
           [id], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Mensagem deletada' });
    });
});

// Fixar mensagem
app.post('/api/chat/mensagem/:id/fixar', (req, res) => {
    const { id } = req.params;
    const { numero_contato } = req.body;
    
    db.run(`INSERT INTO mensagens_fixadas (numero_contato, mensagem_id) VALUES (?, ?)`, 
           [numero_contato, id], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Mensagem fixada', id: this.lastID });
    });
});

// Desfixar mensagem
app.delete('/api/chat/mensagem/:id/fixar', (req, res) => {
    const { id } = req.params;
    
    db.run(`DELETE FROM mensagens_fixadas WHERE mensagem_id = ?`, 
           [id], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Mensagem desfixada' });
    });
});

// Buscar mensagens não lidas (contador geral)
app.get('/api/chat/nao-lidas', (req, res) => {
    const sql = `SELECT 
                    c.numero, c.nome, c.caminho_foto_local,
                    COUNT(*) as total
                FROM historico_mensagens h
                JOIN contatos c ON h.remetente = c.numero
                WHERE h.lida = 0 AND h.tipo = 'RECEBIDA' AND c.bloqueado = 0
                GROUP BY c.numero
                ORDER BY MAX(h.data_hora) DESC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        
        const totalGeral = rows.reduce((sum, row) => sum + row.total, 0);
        
        res.json({ 
            erro: false, 
            total: totalGeral,
            contatos: rows 
        });
    });
});

// ========================================================
// APIs DE CATEGORIAS
// ========================================================

// Listar categorias
app.get('/api/categorias', (req, res) => {
    db.all(`SELECT 
                c.*, 
                COUNT(DISTINCT co.numero) as total_contatos
            FROM categorias c
            LEFT JOIN contatos co ON c.id = co.categoria_id
            GROUP BY c.id
            ORDER BY c.ordem ASC`, 
    [], (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

// Criar categoria
app.post('/api/categorias', (req, res) => {
    const { nome, cor, icone, ordem } = req.body;
    
    db.run(`INSERT INTO categorias (nome, cor, icone, ordem) VALUES (?, ?, ?, ?)`, 
           [nome, cor, icone, ordem || 0], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, id: this.lastID, mensagem: 'Categoria criada' });
    });
});

// Atualizar categoria
app.put('/api/categorias/:id', (req, res) => {
    const { id } = req.params;
    const { nome, cor, icone, ordem } = req.body;
    
    db.run(`UPDATE categorias SET nome = ?, cor = ?, icone = ?, ordem = ? WHERE id = ?`, 
           [nome, cor, icone, ordem, id], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Categoria atualizada' });
    });
});

// Deletar categoria
app.delete('/api/categorias/:id', (req, res) => {
    const { id } = req.params;
    
    // Não permitir deletar categorias padrão
    if (id <= 5) {
        return res.status(400).json({ erro: true, mensagem: 'Não é possível deletar categorias padrão' });
    }
    
    db.run(`UPDATE contatos SET categoria_id = NULL WHERE categoria_id = ?`, [id], () => {
        db.run(`DELETE FROM categorias WHERE id = ?`, [id], function(err) {
            if (err) return res.status(500).json({ erro: true, mensagem: err.message });
            res.json({ erro: false, mensagem: 'Categoria deletada' });
        });
    });
});

// ========================================================
// API DE RESPOSTAS RÁPIDAS MELHORADA
// ========================================================

app.get('/api/respostas-rapidas', (req, res) => {
    db.all("SELECT * FROM respostas_rapidas ORDER BY titulo ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

app.post('/api/respostas-rapidas', (req, res) => {
    const { titulo, texto, atalho } = req.body;
    
    db.run("INSERT INTO respostas_rapidas (titulo, texto, atalho) VALUES (?, ?, ?)", 
           [titulo, texto, atalho], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, id: this.lastID, mensagem: 'Resposta rápida criada' });
    });
});

app.put('/api/respostas-rapidas/:id', (req, res) => {
    const { id } = req.params;
    const { titulo, texto, atalho } = req.body;
    
    db.run("UPDATE respostas_rapidas SET titulo = ?, texto = ?, atalho = ? WHERE id = ?", 
           [titulo, texto, atalho, id], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Resposta rápida atualizada' });
    });
});

app.delete('/api/respostas-rapidas/:id', (req, res) => {
    db.run("DELETE FROM respostas_rapidas WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Resposta rápida deletada' });
    });
});

// ========================================================
// API DE CAMPANHAS MELHORADA
// ========================================================

// Analisar arquivo e retornar colunas disponíveis
app.post('/api/campanhas/analisar-arquivo', upload.single('arquivo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ erro: true, mensagem: "Arquivo não enviado" });
    }

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const dados = xlsx.utils.sheet_to_json(sheet);
        
        if (dados.length === 0) {
            return res.status(400).json({ erro: true, mensagem: "Arquivo vazio" });
        }

        // Pegar as colunas do primeiro registro
        const colunas = Object.keys(dados[0]);
        const preview = dados.slice(0, 3); // Preview de 3 linhas
        
        res.json({
            erro: false,
            nome_arquivo: req.file.filename,
            colunas: colunas,
            total_linhas: dados.length,
            preview: preview
        });

    } catch (e) {
        console.error('Erro ao analisar arquivo:', e);
        res.status(500).json({ erro: true, mensagem: e.message });
    }
});

// Criar campanha com variáveis
app.post('/api/campanhas/criar', upload.single('media'), (req, res) => {
    const { 
        nome, 
        nome_arquivo, 
        mensagem, 
        coluna_numero, 
        variaveis_mapeamento,
        data_agendamento,
        intervalo_min,
        intervalo_max
    } = req.body;
    
    if (!nome_arquivo) {
        return res.status(400).json({ erro: true, mensagem: "Arquivo não encontrado. Faça upload primeiro." });
    }

    let tipoMedia = null;
    let caminhoMedia = null;
    
    if (req.file) {
        caminhoMedia = req.file.path;
        tipoMedia = getTipoArquivo(req.file.mimetype);
    }

    // Contar total de números
    let total = 0;
    try {
        const caminhoArquivo = path.join(uploadsFolder, nome_arquivo);
        const workbook = xlsx.readFile(caminhoArquivo);
        const dados = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        total = dados.length;
    } catch(e) {
        console.error('Erro ao contar registros:', e);
    }

    const agendamento = data_agendamento || new Date().toISOString().slice(0, 19).replace('T', ' ');

    db.run(`INSERT INTO campanhas (
                nome, nome_arquivo, mensagem_base, coluna_numero, 
                variaveis_mapeamento, total_numeros, status, data_agendamento,
                intervalo_min, intervalo_max, tipo_media, caminho_media
            ) VALUES (?, ?, ?, ?, ?, ?, 'AGENDADO', ?, ?, ?, ?, ?)`,
        [nome, nome_arquivo, mensagem, coluna_numero, variaveis_mapeamento, 
         total, agendamento, intervalo_min || 5000, intervalo_max || 15000,
         tipoMedia, caminhoMedia],
        function(err) {
            if (err) return res.status(500).json({ erro: true, mensagem: err.message });
            res.json({ erro: false, mensagem: "Campanha criada!", id: this.lastID });
        }
    );
});

// Listar campanhas
app.get('/api/campanhas', (req, res) => {
    db.all(`SELECT 
                c.*,
                (c.enviados * 100.0 / NULLIF(c.total_numeros, 0)) as percentual
            FROM campanhas c 
            ORDER BY c.id DESC`, 
    [], (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

// Buscar campanha específica
app.get('/api/campanhas/:id', (req, res) => {
    const { id } = req.params;
    
    db.get(`SELECT * FROM campanhas WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        if (!row) return res.status(404).json({ erro: true, mensagem: 'Campanha não encontrada' });
        res.json({ erro: false, dados: row });
    });
});

// Log da campanha
app.get('/api/campanhas/:id/log', (req, res) => {
    const { id } = req.params;
    
    db.all(`SELECT * FROM campanhas_log WHERE campanha_id = ? ORDER BY data_envio DESC LIMIT 100`, 
           [id], 
           (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

// Pausar campanha
app.put('/api/campanhas/:id/pausar', (req, res) => {
    const { id } = req.params;
    
    db.run(`UPDATE campanhas SET status = 'PAUSADO' WHERE id = ? AND status = 'PROCESSANDO'`, 
           [id], 
           function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Campanha pausada' });
    });
});

// Deletar campanha
app.delete('/api/campanhas/:id', (req, res) => {
    const { id } = req.params;
    
    db.get(`SELECT nome_arquivo, caminho_media FROM campanhas WHERE id = ?`, [id], (err, row) => {
        if (row) {
            // Deletar arquivos
            try {
                if (row.nome_arquivo) {
                    const caminho = path.join(uploadsFolder, row.nome_arquivo);
                    if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
                }
                if (row.caminho_media && fs.existsSync(row.caminho_media)) {
                    fs.unlinkSync(row.caminho_media);
                }
            } catch(e) {
                console.error('Erro ao deletar arquivos:', e);
            }
        }
        
        // Deletar logs
        db.run(`DELETE FROM campanhas_log WHERE campanha_id = ?`, [id], () => {
            db.run(`DELETE FROM campanhas WHERE id = ?`, [id], (err) => {
                if (err) return res.status(500).json({ erro: true, mensagem: err.message });
                res.json({ erro: false, mensagem: 'Campanha deletada' });
            });
        });
    });
});

// ========================================================
// API DE ESTATÍSTICAS
// ========================================================

app.get('/api/estatisticas/dashboard', (req, res) => {
    const hoje = new Date().toISOString().split('T')[0];
    
    const queries = {
        mensagensHoje: `SELECT COUNT(*) as total FROM historico_mensagens WHERE DATE(data_hora) = ?`,
        mensagensEnviadas: `SELECT COUNT(*) as total FROM historico_mensagens WHERE tipo = 'ENVIADA'`,
        mensagensRecebidas: `SELECT COUNT(*) as total FROM historico_mensagens WHERE tipo = 'RECEBIDA'`,
        contatosAtivos: `SELECT COUNT(*) as total FROM contatos WHERE bloqueado = 0`,
        contatosBloqueados: `SELECT COUNT(*) as total FROM contatos WHERE bloqueado = 1`,
        campanhasAtivas: `SELECT COUNT(*) as total FROM campanhas WHERE status IN ('AGENDADO', 'PROCESSANDO')`,
        campanhasConcluidas: `SELECT COUNT(*) as total FROM campanhas WHERE status = 'CONCLUIDO'`,
        naoLidas: `SELECT COUNT(*) as total FROM historico_mensagens WHERE lida = 0 AND tipo = 'RECEBIDA'`
    };
    
    const resultados = {};
    let contador = 0;
    const totalQueries = Object.keys(queries).length;
    
    Object.keys(queries).forEach(key => {
        const params = key === 'mensagensHoje' ? [hoje] : [];
        db.get(queries[key], params, (err, row) => {
            resultados[key] = row ? row.total : 0;
            contador++;
            
            if (contador === totalQueries) {
                res.json({ erro: false, dados: resultados });
            }
        });
    });
});

// Estatísticas por período
app.get('/api/estatisticas/periodo', (req, res) => {
    const { dias = 7 } = req.query;
    
    const sql = `SELECT 
                    DATE(data_hora) as data,
                    COUNT(CASE WHEN tipo = 'ENVIADA' THEN 1 END) as enviadas,
                    COUNT(CASE WHEN tipo = 'RECEBIDA' THEN 1 END) as recebidas
                FROM historico_mensagens
                WHERE data_hora >= datetime('now', '-${dias} days')
                GROUP BY DATE(data_hora)
                ORDER BY data ASC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

// ========================================================
// ROTAS DE WHATSAPP
// ========================================================

app.get('/api/whatsapp/historico', (req, res) => {
    const { limit = 100, tipo, dataInicio, dataFim } = req.query;
    
    let sql = `SELECT 
                    h.id, h.remetente, h.destinatario, h.mensagem, h.data_hora,
                    h.tipo, h.tipo_arquivo, h.caminho_arquivo, h.nome_arquivo,
                    h.tamanho_arquivo, h.mimetype, h.lida, h.arquivada,
                    c.nome as nome_contato, c.caminho_foto_local
                FROM historico_mensagens h
                LEFT JOIN contatos c ON h.remetente = c.numero OR h.destinatario = c.numero
                WHERE h.deletada = 0`;
    
    const params = [];
    
    if (tipo) {
        sql += ` AND h.tipo = ?`;
        params.push(tipo);
    }
    
    if (dataInicio) {
        sql += ` AND DATE(h.data_hora) >= ?`;
        params.push(dataInicio);
    }
    
    if (dataFim) {
        sql += ` AND DATE(h.data_hora) <= ?`;
        params.push(dataFim);
    }
    
    sql += ` ORDER BY h.data_hora DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows || [] });
    });
});

app.post('/api/whatsapp/enviar', upload.single('arquivo'), async (req, res) => {
    const { numero, mensagem } = req.body;
    
    if (!clientReady) return res.status(500).json({ erro: true, mensagem: "Bot Offline" });

    try {
        let numFormatado = numero.replace(/\D/g, '');
        if (numFormatado.length >= 10 && !numFormatado.startsWith('55')) numFormatado = '55' + numFormatado;
        const idZap = numFormatado + '@c.us';

        let tipoArq = 'texto';
        let caminhoArq = null;
        let nomeArq = null;
        let tamanhoArq = null;
        let mimetypeArq = null;
        let msgFinal = mensagem || "";

        if (req.file) {
            caminhoArq = `/uploads/${req.file.filename}`;
            nomeArq = req.file.filename;
            tamanhoArq = req.file.size;
            mimetypeArq = req.file.mimetype;
            
            const media = MessageMedia.fromFilePath(req.file.path);
            tipoArq = getTipoArquivo(req.file.mimetype);

            await client.sendMessage(idZap, media, { caption: msgFinal });
        } else {
            await client.sendMessage(idZap, msgFinal);
        }

        db.run(`INSERT INTO historico_mensagens 
                (remetente, destinatario, mensagem, tipo, tipo_arquivo, caminho_arquivo, nome_arquivo, tamanho_arquivo, mimetype, lida) 
                VALUES ('BOT', ?, ?, 'ENVIADA', ?, ?, ?, ?, ?, 1)`,
            [numFormatado, msgFinal, tipoArq, caminhoArq, nomeArq, tamanhoArq, mimetypeArq]);

        db.run(`UPDATE contatos SET ultima_interacao = CURRENT_TIMESTAMP WHERE numero = ?`, [numFormatado]);

        res.json({ erro: false, mensagem: "Enviado com sucesso!" });

    } catch (e) {
        console.error('Erro ao enviar:', e);
        res.status(500).json({ erro: true, mensagem: e.message });
    }
});

app.get('/api/media/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const caminhoArquivo = path.join(mediaFolder, filename);
    
    if (fs.existsSync(caminhoArquivo)) {
        res.download(caminhoArquivo);
    } else {
        res.status(404).json({ erro: true, mensagem: "Arquivo não encontrado" });
    }
});

// ========================================================
// API DE BACKUPS
// ========================================================

app.post('/api/backups', (req, res) => {
    try {
        const arq = `backup_${Date.now()}.db`;
        fs.copyFile(dbPath, path.join(backupFolder, arq), () => {
            res.json({ erro: false, arquivo: arq, mensagem: 'Backup criado com sucesso' });
        });
    } catch(e) {
        res.status(500).json({ erro: true, mensagem: e.message });
    }
});

app.get('/api/backups', (req, res) => {
    fs.readdir(backupFolder, (err, files) => {
        const backups = files ? files.filter(f => f.endsWith('.db')).map(f => ({
            nome: f,
            tamanho: fs.statSync(path.join(backupFolder, f)).size,
            data: fs.statSync(path.join(backupFolder, f)).mtime
        })) : [];
        
        res.json({ erro: false, dados: backups });
    });
});

app.get('/api/backups/download/:arquivo', (req, res) => {
    const arquivo = req.params.arquivo;
    const caminho = path.join(backupFolder, arquivo);
    
    if (fs.existsSync(caminho)) {
        res.download(caminho);
    } else {
        res.status(404).json({ erro: true, mensagem: "Arquivo não encontrado" });
    }
});

app.post('/api/backups/restore', upload.single('backup'), (req, res) => {
    if (!req.file) return res.status(400).json({ erro: true, mensagem: "Envie um arquivo .db" });
    
    try {
        db.close(); 
        fs.copyFileSync(req.file.path, dbPath);
        res.json({ erro: false, mensagem: "Backup Restaurado! O sistema será reiniciado em 3 segundos." });
        setTimeout(() => process.exit(0), 3000); 
    } catch(e) {
        res.status(500).json({ erro: true, mensagem: "Erro ao restaurar: " + e.message });
    }
});

app.delete('/api/backups/:arquivo', (req, res) => {
    const arquivo = req.params.arquivo;
    const caminho = path.join(backupFolder, arquivo);
    
    if (fs.existsSync(caminho)) {
        fs.unlinkSync(caminho);
        res.json({ erro: false, mensagem: 'Backup deletado' });
    } else {
        res.status(404).json({ erro: true, mensagem: "Arquivo não encontrado" });
    }
});

// ========================================================
// ROTAS DE GESTÃO
// ========================================================

// Auto Respostas CRUD
app.get('/api/mensagens', (req, res) => {
    db.all(`SELECT * FROM auto_respostas ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

app.post('/api/mensagens', upload.single('arquivo'), (req, res) => {
    const { gatilho, resposta } = req.body;
    let tipo = 'texto', caminho = null;
    
    if (req.file) {
        caminho = req.file.path;
        if (req.file.mimetype.includes('image')) tipo = 'imagem';
        else if (req.file.mimetype.includes('audio')) tipo = 'audio';
        else if (req.file.mimetype.includes('video')) tipo = 'video';
        else tipo = 'documento';
    }
    
    db.run(`INSERT INTO auto_respostas (gatilho, resposta, tipo_media, caminho_media) VALUES (?, ?, ?, ?)`, 
        [gatilho.toLowerCase(), resposta, tipo, caminho], 
        function(err) {
            if (err) return res.status(500).json({ erro: true, mensagem: err.message });
            res.json({ erro: false, id: this.lastID, mensagem: "Auto-resposta criada" });
        }
    );
});

app.put('/api/mensagens/:id', upload.single('arquivo'), (req, res) => {
    const { id } = req.params;
    const { gatilho, resposta, ativo } = req.body;
    
    let tipo = null, caminho = null;
    
    if (req.file) {
        caminho = req.file.path;
        if (req.file.mimetype.includes('image')) tipo = 'imagem';
        else if (req.file.mimetype.includes('audio')) tipo = 'audio';
        else if (req.file.mimetype.includes('video')) tipo = 'video';
        else tipo = 'documento';
        
        db.run(`UPDATE auto_respostas SET gatilho = ?, resposta = ?, ativo = ?, tipo_media = ?, caminho_media = ? WHERE id = ?`, 
            [gatilho.toLowerCase(), resposta, ativo, tipo, caminho, id], 
            function(err) {
                if (err) return res.status(500).json({ erro: true, mensagem: err.message });
                res.json({ erro: false, mensagem: "Auto-resposta atualizada" });
            }
        );
    } else {
        db.run(`UPDATE auto_respostas SET gatilho = ?, resposta = ?, ativo = ? WHERE id = ?`, 
            [gatilho.toLowerCase(), resposta, ativo, id], 
            function(err) {
                if (err) return res.status(500).json({ erro: true, mensagem: err.message });
                res.json({ erro: false, mensagem: "Auto-resposta atualizada" });
            }
        );
    }
});

app.delete('/api/mensagens/:id', (req, res) => {
    db.get(`SELECT caminho_media FROM auto_respostas WHERE id = ?`, [req.params.id], (err, row) => {
        if (row && row.caminho_media) { 
            try { fs.unlinkSync(row.caminho_media) } catch(e) {} 
        }
        db.run(`DELETE FROM auto_respostas WHERE id = ?`, req.params.id, (err) => {
            if (err) return res.status(500).json({ erro: true, mensagem: err.message });
            res.json({ erro: false, mensagem: "Auto-resposta deletada" });
        });
    });
});

// Status e QR Code
app.get('/api/whatsapp/qr', (req, res) => {
    if (clientReady) return res.json({ erro: false, status: 'CONECTADO', qr: null });
    if (qrCodeImage) return res.json({ erro: false, status: 'AGUARDANDO_LEITURA', qr: qrCodeImage });
    res.json({ erro: false, status: whatsappStatus, qr: null });
});

app.get('/api/whatsapp/status', (req, res) => {
    res.json({ 
        erro: false, 
        status: whatsappStatus,
        clientReady: clientReady,
        timestamp: new Date().toISOString()
    });
});

// Configuração Nome Bot
app.get('/api/config/nome', (req, res) => {
    db.get(`SELECT valor FROM configuracoes WHERE chave='nome_bot'`, (err, row) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, nome: row ? row.valor : 'Bot' });
    });
});

app.post('/api/config/nome', (req, res) => {
    const nome = req.body.nome;
    
    db.run(`INSERT INTO configuracoes (chave, valor) VALUES ('nome_bot', ?) 
            ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`, 
           [nome], 
           (err) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        atualizarNomeBot();
        res.json({ erro: false, mensagem: 'Nome do bot atualizado' });
    });
});

// Usuários
app.post('/api/usuarios/login', (req, res) => {
    db.get(`SELECT * FROM usuarios WHERE usuario=? AND senha=?`, 
           [req.body.usuario, req.body.senha], 
           (err, row) => {
        if (row) {
            res.json({ erro: false, user: row });
        } else {
            res.status(401).json({ erro: true, mensagem: "Credenciais inválidas" });
        }
    });
});

app.post('/api/usuarios/cadastro', (req, res) => {
    const { nome, usuario, senha } = req.body;
    
    db.run(`INSERT INTO usuarios (nome, usuario, senha) VALUES (?, ?, ?)`, 
           [nome, usuario, senha], 
           function(err) {
        if (err) {
            return res.status(400).json({ erro: true, mensagem: "Usuário já existe ou dados inválidos" });
        }
        res.json({ erro: false, mensagem: "Usuário criado com sucesso", id: this.lastID });
    });
});

app.get('/api/usuarios', (req, res) => {
    db.all(`SELECT id, nome, usuario FROM usuarios`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, dados: rows });
    });
});

app.delete('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    
    db.run(`DELETE FROM usuarios WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ erro: true, mensagem: err.message });
        res.json({ erro: false, mensagem: 'Usuário deletado' });
    });
});

// ========================================================
// ROTA DE SAÚDE DO SISTEMA
// ========================================================

app.get('/api/health', (req, res) => {
    res.json({
        erro: false,
        sistema: 'NEXI CRM 2.0',
        versao: '2.0.0',
        status: 'online',
        whatsapp: {
            status: whatsappStatus,
            conectado: clientReady
        },
        timestamp: new Date().toISOString()
    });
});

// ========================================================
// TRATAMENTO DE ERROS GLOBAL
// ========================================================

app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    res.status(500).json({ 
        erro: true, 
        mensagem: 'Erro interno do servidor',
        detalhes: err.message 
    });
});

// ========================================================
// INICIALIZAÇÃO DO SERVIDOR
// ========================================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║         🚀 NEXI CRM 2.0 - SISTEMA COMPLETO           ║
╠═══════════════════════════════════════════════════════╣
║  📡 Porta: ${PORT}                                     ║
║  💾 Banco: ${dbPath}                                   ║
╠═══════════════════════════════════════════════════════╣
║  ✅ Sistema de Mensagens com Mídia                    ║
║  ✅ Categorias de Conversas                          ║
║  ✅ Mensagens Não Lidas / Fixadas                    ║
║  ✅ Bloqueio de Contatos                             ║
║  ✅ Campanhas com Variáveis Dinâmicas                ║
║  ✅ Análise de Excel/CSV                             ║
║  ✅ Fotos de Perfil Locais                           ║
║  ✅ Estatísticas e Dashboard                         ║
║  ✅ Backup e Restauração                             ║
║  ✅ Auto-Respostas com Mídia                         ║
║  ✅ Respostas Rápidas                                ║
╠═══════════════════════════════════════════════════════╣
║  📸 Fotos: /media/profile_pics/                      ║
║  📎 Mídias: /media/                                   ║
║  📤 Uploads: /uploads/                                ║
║  💾 Backups: /bancodados/backups/                    ║
╠═══════════════════════════════════════════════════════╣
║  🌐 Acesse: http://localhost:${PORT}                  ║
╚═══════════════════════════════════════════════════════╝
    `);
    
    console.log('\n📋 APIs Disponíveis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 Autenticação:');
    console.log('   POST   /api/usuarios/login');
    console.log('   POST   /api/usuarios/cadastro');
    console.log('   GET    /api/usuarios');
    console.log('');
    console.log('💬 Chat e Mensagens:');
    console.log('   GET    /api/chat/contatos');
    console.log('   GET    /api/chat/mensagens/:numero');
    console.log('   GET    /api/chat/contato/:numero');
    console.log('   GET    /api/chat/nao-lidas');
    console.log('   POST   /api/chat/enviar');
    console.log('   POST   /api/chat/marcar-lidas/:numero');
    console.log('   PUT    /api/chat/contato/:numero/categoria');
    console.log('   PUT    /api/chat/contato/:numero/bloquear');
    console.log('   PUT    /api/chat/contato/:numero/notas');
    console.log('   PUT    /api/chat/mensagem/:id/arquivar');
    console.log('   POST   /api/chat/mensagem/:id/fixar');
    console.log('   DELETE /api/chat/mensagem/:id');
    console.log('   DELETE /api/chat/mensagem/:id/fixar');
    console.log('');
    console.log('📁 Categorias:');
    console.log('   GET    /api/categorias');
    console.log('   POST   /api/categorias');
    console.log('   PUT    /api/categorias/:id');
    console.log('   DELETE /api/categorias/:id');
    console.log('');
    console.log('📢 Campanhas:');
    console.log('   POST   /api/campanhas/analisar-arquivo');
    console.log('   POST   /api/campanhas/criar');
    console.log('   GET    /api/campanhas');
    console.log('   GET    /api/campanhas/:id');
    console.log('   GET    /api/campanhas/:id/log');
    console.log('   PUT    /api/campanhas/:id/pausar');
    console.log('   DELETE /api/campanhas/:id');
    console.log('');
    console.log('⚡ Respostas Rápidas:');
    console.log('   GET    /api/respostas-rapidas');
    console.log('   POST   /api/respostas-rapidas');
    console.log('   PUT    /api/respostas-rapidas/:id');
    console.log('   DELETE /api/respostas-rapidas/:id');
    console.log('');
    console.log('🤖 Auto-Respostas:');
    console.log('   GET    /api/mensagens');
    console.log('   POST   /api/mensagens');
    console.log('   PUT    /api/mensagens/:id');
    console.log('   DELETE /api/mensagens/:id');
    console.log('');
    console.log('📊 Estatísticas:');
    console.log('   GET    /api/estatisticas/dashboard');
    console.log('   GET    /api/estatisticas/periodo');
    console.log('');
    console.log('📱 WhatsApp:');
    console.log('   GET    /api/whatsapp/status');
    console.log('   GET    /api/whatsapp/qr');
    console.log('   GET    /api/whatsapp/historico');
    console.log('   POST   /api/whatsapp/enviar');
    console.log('');
    console.log('💾 Backups:');
    console.log('   GET    /api/backups');
    console.log('   POST   /api/backups');
    console.log('   GET    /api/backups/download/:arquivo');
    console.log('   POST   /api/backups/restore');
    console.log('   DELETE /api/backups/:arquivo');
    console.log('');
    console.log('⚙️  Configurações:');
    console.log('   GET    /api/config/nome');
    console.log('   POST   /api/config/nome');
    console.log('   GET    /api/health');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});