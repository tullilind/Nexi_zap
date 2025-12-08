/**
 * COMPONENTE DE MENU LATERAL REUTILIZÁVEL - NEXI CRM
 * * Instruções de uso:
 * 1. Crie uma <div id="sidebar-container"></div> no local onde o menu deve aparecer no HTML.
 * 2. Importe este script: <script src="bancodados/api_base/menu.js"></script>
 * 3. O script cuidará do resto (Renderização, Auth Check, Active State, Logout).
 */

document.addEventListener("DOMContentLoaded", () => {
    renderizarMenu();
});

function renderizarMenu() {
    const container = document.getElementById("sidebar-container");
    if (!container) return; // Se não houver container, não faz nada

    // 1. Verificar Autenticação
    const userDataString = localStorage.getItem("user_data");
    if (!userDataString) {
        window.location.href = "index.html";
        return;
    }
    const user = JSON.parse(userDataString);
    const userName = user.nome || "Usuário";
    const userInitials = userName.substring(0, 2).toUpperCase();

    // 2. Identificar Página Atual para marcar o botão "Ativo"
    const path = window.location.pathname;
    const page = path.split("/").pop(); // Pega o nome do arquivo (ex: dashboard.html)

    // Função auxiliar para gerar classes de link ativo/inativo
    const getLinkClasses = (linkPage) => {
        const baseClasses = "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group cursor-pointer";
        const activeClasses = "bg-blue-50 text-primary font-bold shadow-sm border border-blue-100";
        const inactiveClasses = "text-slate-600 hover:bg-slate-50 hover:text-primary font-medium";

        // Verifica se é a página atual
        return page === linkPage ? `${baseClasses} ${activeClasses}` : `${baseClasses} ${inactiveClasses}`;
    };

    // 3. Injetar Estilos CSS Específicos do Menu
    const style = document.createElement('style');
    style.innerHTML = `
        .glass-sidebar {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border-right: 1px solid #e2e8f0;
        }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
    `;
    document.head.appendChild(style);

    // 4. HTML do Menu
    const html = `
        <aside class="glass-sidebar w-full h-full flex flex-col justify-between relative bg-white">
            
            <div class="h-16 bg-slate-50 flex items-center gap-3 px-5 border-b border-slate-200 shrink-0">
                <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold shadow-sm">N</div>
                <span class="font-bold text-slate-700 text-lg tracking-tight">NEXI CRM</span>
            </div>

            <nav class="p-4 space-y-1 flex-1 overflow-y-auto custom-scroll">
                
                <p class="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2">Principal</p>
                
                <a href="dashboard.html" class="${getLinkClasses('dashboard.html')}">
                    <span class="material-symbols-rounded group-hover:scale-110 transition-transform">dashboard</span> 
                    <span>Dashboard</span>
                </a>

                <a href="web.zap.ar.html" class="${getLinkClasses('web.zap.ar.html')}">
                    <span class="material-symbols-rounded group-hover:scale-110 transition-transform">chat</span> 
                    <div class="flex-1 flex items-center justify-between">
                        <span>Chat & Atend.</span>
                    </div>
                </a>

                <a href="mensagens_automaticas.html" class="${getLinkClasses('mensagens_automaticas.html')}">
                    <span class="material-symbols-rounded group-hover:scale-110 transition-transform">smart_toy</span> 
                    <span>Bot Automático</span>
                </a>
                
                <p class="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-4">Ferramentas</p>
                
                <a href="agendamento.html" class="${getLinkClasses('agendamento.html')}">
                    <span class="material-symbols-rounded group-hover:scale-110 transition-transform">rocket_launch</span> 
                    <span>Campanhas</span>
                </a>

                <a href="configuracoes.html" class="${getLinkClasses('configuracoes.html')}">
                    <span class="material-symbols-rounded group-hover:scale-110 transition-transform">settings</span> 
                    <span>Configurações</span>
                </a>

            </nav>

            <div class="p-4 border-t border-slate-200 bg-slate-50">
                <div class="flex items-center gap-3 mb-3 px-2">
                    <div class="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-primary font-bold shadow-sm overflow-hidden">
                        ${userInitials}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-slate-800 truncate">${userName}</p>
                        <p class="text-xs text-green-600 font-medium flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online
                        </p>
                    </div>
                </div>
                <button id="btn-logout-global" class="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <span class="material-symbols-rounded text-sm">logout</span> Sair do Sistema
                </button>
            </div>
        </aside>
    `;

    // 5. Inserir no DOM
    container.innerHTML = html;

    // 6. Adicionar Evento de Logout
    document.getElementById('btn-logout-global').addEventListener('click', () => {
        if(confirm("Deseja realmente sair?")) {
            localStorage.removeItem('user_data');
            window.location.href = 'index.html';
        }
    });
}