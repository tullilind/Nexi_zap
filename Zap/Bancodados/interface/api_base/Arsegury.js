/**
 * ARSEGURY.JS - Módulo de Segurança Client-Side NEXI
 * Proteção contra inspeção, cópia e curiosos.
 * Versão: 1.0.0
 */

const Arsegury = {
    config: {
        disableRightClick: true,
        disableF12: true,
        disableCopy: true,
        disableSave: true,
        detectDevTools: true
    },

    init: function() {
        console.log("%c 🛡️ Arsegury Security Active ", "background: #2563eb; color: #fff; border-radius: 4px; padding: 4px; font-weight: bold;");
        
        if (this.config.disableRightClick) this.blockContextMenu();
        if (this.config.disableF12) this.blockShortcuts();
        if (this.config.disableCopy) this.blockSelection();
        if (this.config.detectDevTools) this.trapDebugger();
        
        this.preventDrag();
    },

    // 1. Bloqueia Botão Direito
    blockContextMenu: function() {
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showWarning("Botão direito desativado por segurança.");
        });
    },

    // 2. Bloqueia Atalhos de Teclado (F12, Ctrl+U, Ctrl+S, etc)
    blockShortcuts: function() {
        document.addEventListener('keydown', (e) => {
            // F12
            if (e.key === 'F12' || e.keyCode === 123) {
                e.preventDefault();
                this.showWarning("Acesso ao console bloqueado.");
                return false;
            }

            // Combinações com CTRL ou COMMAND (Mac)
            if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                
                // U (Source), S (Save), P (Print), C (Copy) - se bloqueio de cópia estiver ativo
                if (['u', 's', 'p'].includes(key) || (this.config.disableCopy && key === 'c')) {
                    e.preventDefault();
                    return false;
                }

                // Shift + I, J, C (Inspector Tools)
                if (e.shiftKey && ['i', 'j', 'c'].includes(key)) {
                    e.preventDefault();
                    return false;
                }
            }
        });
    },

    // 3. Bloqueia Seleção de Texto e Arrastar Imagens
    blockSelection: function() {
        // CSS via JS para desativar seleção
        const style = document.createElement('style');
        style.innerHTML = `
            body { 
                -webkit-user-select: none; 
                -moz-user-select: none; 
                -ms-user-select: none; 
                user-select: none; 
            }
            input, textarea { 
                -webkit-user-select: text !important; 
                -moz-user-select: text !important; 
                -ms-user-select: text !important; 
                user-select: text !important; 
            }
        `;
        document.head.appendChild(style);

        // Limpa clipboard se tentar copiar
        document.addEventListener('copy', (e) => {
            e.clipboardData.setData('text/plain', 'Conteúdo protegido pelo sistema NEXI.');
            e.preventDefault();
            this.showWarning("Cópia não permitida.");
        });
    },

    preventDrag: function() {
        document.addEventListener('dragstart', (e) => e.preventDefault());
    },

    // 4. "Armadilha" para quem abrir o DevTools
    // Se o usuário conseguir abrir o console, isso causará um breakpoint infinito
    trapDebugger: function() {
        setInterval(() => {
            const start = performance.now();
            debugger; // O navegador para aqui se o DevTools estiver aberto
            const end = performance.now();
            
            // Se demorou muito entre start e end, significa que o debugger parou a execução
            if (end - start > 100) {
                document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:red;font-family:sans-serif;text-align:center;"><h1>⚠️ ALERTA DE SEGURANÇA ⚠️<br>O uso de ferramentas de desenvolvedor é proibido.</h1></div>';
                window.location.reload(); // Força reload para fechar a conexão
            }
        }, 1000);
    },

    // 5. Feedback Visual (Toast Nativo)
    showWarning: function(msg) {
        // Verifica se já existe um container de toast na página (do nosso sistema anterior)
        const existingToast = typeof showToast === 'function';
        
        if (existingToast) {
            showToast(`🛡️ Arsegury: ${msg}`, 'error');
        } else {
            alert(`🛡️ Segurança NEXI: ${msg}`);
        }
    }
};

// Inicia automaticamente ao carregar
document.addEventListener("DOMContentLoaded", () => {
    Arsegury.init();
});