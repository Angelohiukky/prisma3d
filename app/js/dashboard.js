import { 
    auth, 
    db, 
    COLS,
    collection, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    serverTimestamp 
} from './firebase-config.js';
import { protegerPagina, encerrarSessao } from './seguranca.js';

// Estado global em memória da aplicação
window.PrismaState = {
    viewAtual: 'home',
    pedidos: [],
    clientes: [],
    insumos: [],
    notas: [],
    orcamentos: [],
    filtroPrazo: 'todos',
    termoBuscaKanban: '',
    termoBuscaClientes: '',
    filtroCategoriaNota: 'todas',
    termoBuscaNotas: '',
    filtroStatusOrcamento: 'todos',
    orcamentoAtualCalculado: null
};

// ==========================================================================
// INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    protegerPagina((user) => {
        // Inicializa avatar e nome do usuário
        const avatar = document.getElementById('user-avatar');
        if (avatar && user.email) {
            avatar.textContent = user.email.charAt(0).toUpperCase();
        }

        // Logout
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                encerrarSessao();
            });
        }

        // Inicia escutas em tempo real com o Firestore
        iniciarRealtimeListeners();

        // Carrega a view inicial
        navegarPara('home');
    });
});

// ==========================================================================
// ESCUTAS EM TEMPO REAL (FIRESTORE)
// ==========================================================================
function iniciarRealtimeListeners() {
    // Escuta Pedidos 3D
    onSnapshot(collection(db, COLS.PEDIDOS), (snapshot) => {
        window.PrismaState.pedidos = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderizarViewAtual();
    }, (error) => {
        console.error("Erro ao escutar pedidos:", error);
        mostrarToast("Erro de sincronização com o banco", "error");
    });

    // Escuta Clientes
    onSnapshot(collection(db, COLS.CLIENTES), (snapshot) => {
        window.PrismaState.clientes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        atualizarSelectsClientes();
        renderizarViewAtual();
    });

    // Escuta Insumos / Filamentos
    onSnapshot(collection(db, COLS.INSUMOS), (snapshot) => {
        window.PrismaState.insumos = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        atualizarSelectsMateriais();
        renderizarViewAtual();
    });

    // Escuta Mural de Notas & Informações
    onSnapshot(collection(db, COLS.NOTAS), (snapshot) => {
        window.PrismaState.notas = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderizarViewAtual();
    }, (error) => {
        console.error("Erro ao escutar notas do mural:", error);
        mostrarToast("Erro de sincronização do mural de notas", "error");
    });

    // Escuta Orçamentos 3D
    onSnapshot(collection(db, COLS.ORCAMENTOS), (snapshot) => {
        window.PrismaState.orcamentos = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderizarViewAtual();
    }, (error) => {
        console.error("Erro ao escutar orçamentos:", error);
    });
}

// ==========================================================================
// ROTEAMENTO DE VIEWS (SPA)
// ==========================================================================
async function navegarPara(viewName) {
    window.PrismaState.viewAtual = viewName;

    // Atualiza classes ativas na sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-view') === viewName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Fecha sidebar no mobile caso esteja aberta
    fecharSidebarMobile();

    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 50vh; color: var(--text-muted); gap: 10px;">
            <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: var(--primary);"></i>
            <span>Carregando módulo...</span>
        </div>
    `;

    try {
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error(`Não foi possível carregar a tela ${viewName}`);
        const html = await response.text();
        mainView.innerHTML = html;

        // Renderiza dados do módulo carregado
        renderizarViewAtual();
    } catch (err) {
        console.error(err);
        mainView.innerHTML = `
            <div style="padding: 2rem; color: #f87171;">
                <h3><i class="fa-solid fa-triangle-exclamation"></i> Erro ao carregar tela</h3>
                <p>${err.message}</p>
            </div>
        `;
    }
}

function renderizarViewAtual() {
    switch (window.PrismaState.viewAtual) {
        case 'home':
            renderizarHome();
            break;
        case 'producao':
            renderizarProducao();
            break;
        case 'clientes':
            renderizarClientes();
            break;
        case 'insumos':
            renderizarInsumos();
            break;
        case 'financeiro':
            renderizarFinanceiro();
            break;
        case 'mural':
            renderizarMural();
            break;
        case 'orcamentos':
            renderizarOrcamentos();
            break;
    }
}

// ==========================================================================
// RENDERIZAÇÃO: HOME (VISÃO GERAL)
// ==========================================================================
function renderizarHome() {
    const pedidos = window.PrismaState.pedidos;
    const insumos = window.PrismaState.insumos;

    const pedidosAtivos = pedidos.filter(p => p.status !== 'entregue');
    
    // Total de horas na fila
    const horasNaFila = pedidosAtivos.reduce((acc, p) => acc + (parseFloat(p.tempo_horas) || 0), 0);

    // Faturamento e Custos
    let totalPago = 0;
    let totalPendente = 0;
    let totalCustoInsumos = 0;

    pedidos.forEach(p => {
        const valor = parseFloat(p.valor_cobrado) || 0;
        const sinal = parseFloat(p.valor_sinal) || 0;
        const custo = parseFloat(p.custo_material) || 0;

        if (p.status_pagamento === 'pago_total') {
            totalPago += valor;
        } else if (p.status_pagamento === 'sinal_pago') {
            totalPago += sinal;
            totalPendente += (valor - sinal);
        } else {
            totalPendente += valor;
        }
        totalCustoInsumos += custo;
    });

    const lucroReal = totalPago - totalCustoInsumos;

    // Atualiza contadores
    const elProducao = document.getElementById('stat-em-producao');
    if (elProducao) elProducao.textContent = pedidosAtivos.length;

    const elHoras = document.getElementById('stat-horas-fila');
    if (elHoras) elHoras.textContent = `${horasNaFila.toFixed(1)}h`;

    const elFat = document.getElementById('stat-faturamento');
    if (elFat) elFat.textContent = formatarMoeda(totalPago);

    const elPendSub = document.getElementById('stat-pendente-sub');
    if (elPendSub) elPendSub.textContent = `${formatarMoeda(totalPendente)} a receber`;

    const elLucro = document.getElementById('stat-lucro-liquido');
    if (elLucro) elLucro.textContent = formatarMoeda(lucroReal);

    // Alertas de Prazos (Atrasados ou Próximas 48h)
    renderizarAlertasPrazos(pedidosAtivos);

    // Tabela Fila Prioritária
    renderizarFilaPrioritaria(pedidosAtivos);

    // Notas Fixadas da Oficina
    renderizarNotasFixadasHome();
}

function renderizarNotasFixadasHome() {
    const container = document.getElementById('home-notas-fixadas');
    if (!container) return;

    const notas = window.PrismaState.notas || [];
    // Prioriza as fixadas; se não houver fixadas, exibe as 3 mais recentes
    let notasDestaque = notas.filter(n => n.fixada);
    if (notasDestaque.length === 0) {
        notasDestaque = [...notas].sort((a, b) => {
            const dataA = a.updated_at?.seconds || a.created_at?.seconds || 0;
            const dataB = b.updated_at?.seconds || b.created_at?.seconds || 0;
            return dataB - dataA;
        }).slice(0, 3);
    }

    if (notasDestaque.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.9rem; grid-column: 1 / -1;">
                <i class="fa-solid fa-note-sticky" style="color: var(--primary); font-size: 1.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.7;"></i>
                Nenhuma anotação registrada ainda. Registre lembretes e parâmetros no Mural de Notas.
            </div>
        `;
        return;
    }

    container.innerHTML = notasDestaque.map(nota => {
        const catInfo = obterInfoCategoria(nota.categoria);
        const corClasse = `mural-card-${nota.cor || 'padrao'}`;
        const isPinned = nota.fixada ? 'is-pinned' : '';
        const dataFormatada = formatarDataTimestamp(nota.updated_at || nota.created_at);

        return `
            <div class="mural-card ${corClasse} ${isPinned}" style="padding: 1.1rem; gap: 0.6rem;">
                <div class="mural-card-header">
                    <span class="mural-categoria-badge" style="font-size: 0.68rem;">
                        <i class="${catInfo.icone}" style="color: ${catInfo.cor};"></i> ${escapeHtml(catInfo.label)}
                    </span>
                    ${nota.fixada ? '<span style="color: #f59e0b; font-size: 0.75rem;" title="Nota Fixada"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
                </div>
                <h4 class="mural-card-titulo" style="font-size: 0.95rem;">${escapeHtml(nota.titulo)}</h4>
                <div class="mural-card-body" style="font-size: 0.82rem; max-height: 120px;">${escapeHtml(nota.conteudo)}</div>
                <div class="mural-card-footer" style="padding-top: 0.5rem;">
                    <span class="mural-card-data" style="font-size: 0.7rem;">
                        <i class="fa-regular fa-clock"></i> ${dataFormatada}
                    </span>
                    <button class="btn-secondary" onclick="window.PrismaApp.abrirModalEditarNota('${nota.id}')" style="font-size: 0.72rem; padding: 3px 8px;">
                        Editar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarAlertasPrazos(pedidosAtivos) {
    const container = document.getElementById('lista-alertas-prazos');
    if (!container) return;

    const pedidosComAlerta = pedidosAtivos.map(p => {
        const prazo = p.prazo_ajustado || p.prazo_prometido;
        const dias = calcularDiferencaDias(prazo);
        return { ...p, dias, prazoFinal: prazo };
    }).filter(p => p.dias <= 2); // 2 dias ou atrasado (< 0)

    if (pedidosComAlerta.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">
                <i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 1.8rem; margin-bottom: 0.5rem; display: block;"></i>
                Todas as encomendas ativas estão rigorosamente dentro do prazo!
            </div>
        `;
        return;
    }

    container.innerHTML = pedidosComAlerta.map(p => {
        const isAtrasado = p.dias < 0;
        const badgeCor = isAtrasado ? '#ef4444' : '#f59e0b';
        const badgeTexto = isAtrasado 
            ? `ATRASADO HÁ ${Math.abs(p.dias)} DIA(S)` 
            : (p.dias === 0 ? 'VENCE HOJE!' : 'VENCE AMANHÃ!');

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25); border-left: 3px solid ${badgeCor}; padding: 12px 16px; border-radius: var(--radius-sm); margin-bottom: 8px;">
                <div>
                    <strong style="color: white; font-size: 0.92rem;">${escapeHtml(p.titulo)}</strong>
                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 3px;">
                        Cliente: <span style="color: var(--primary);">${escapeHtml(p.cliente_nome || 'N/A')}</span> · 
                        Etapa: <em>${formatarEtapa(p.status)}</em>
                        ${p.motivo_ajuste ? ` · <span style="color: #f59e0b;">Motivo: ${escapeHtml(p.motivo_ajuste)}</span>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <span style="background: rgba(${isAtrasado ? '239, 68, 68' : '245, 158, 11'}, 0.15); color: ${badgeCor}; font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; display: inline-block;">
                        ${badgeTexto}
                    </span>
                    <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 4px;">Entrega: ${formatarData(p.prazoFinal)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarFilaPrioritaria(pedidosAtivos) {
    const tbody = document.getElementById('tabela-fila-prioritaria');
    if (!tbody) return;

    if (pedidosAtivos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma encomenda na fila de produção.</td></tr>`;
        return;
    }

    // Ordena pelo prazo mais próximo
    const ordenados = [...pedidosAtivos].sort((a, b) => {
        const da = new Date(a.prazo_ajustado || a.prazo_prometido);
        const db = new Date(b.prazo_ajustado || b.prazo_prometido);
        return da - db;
    });

    tbody.innerHTML = ordenados.slice(0, 5).map(p => {
        const prazoFinal = p.prazo_ajustado || p.prazo_prometido;
        const dias = calcularDiferencaDias(prazoFinal);
        const badgeClasse = dias < 0 ? 'badge-prazo-atrasado' : (dias <= 2 ? 'badge-prazo-alerta' : 'badge-prazo-ok');
        const badgeTexto = dias < 0 ? `${Math.abs(dias)}d atrasado` : (dias === 0 ? 'Hoje' : `${formatarData(prazoFinal)}`);

        return `
            <tr>
                <td><strong>${escapeHtml(p.titulo)}</strong></td>
                <td><span style="color: var(--primary);">${escapeHtml(p.cliente_nome || 'N/A')}</span></td>
                <td><span style="font-size: 0.8rem; background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px;">${formatarEtapa(p.status)}</span></td>
                <td><span class="badge-prazo ${badgeClasse}">${badgeTexto}</span></td>
                <td>${p.tempo_horas ? `${p.tempo_horas}h` : '-'}</td>
                <td><strong style="color: white;">${formatarMoeda(p.valor_cobrado)}</strong></td>
                <td style="text-align: right;">
                    <button class="btn-icon" title="Editar Pedido" onclick="window.PrismaApp.abrirModalEditarPedido('${p.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon" title="Avançar Etapa" onclick="window.PrismaApp.avancarProximaEtapa('${p.id}', '${p.status}')">
                        <i class="fa-solid fa-forward-step" style="color: var(--primary);"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================================
// RENDERIZAÇÃO: PRODUÇÃO & PRAZOS (KANBAN)
// ==========================================================================
function renderizarProducao() {
    const etapas = ['orcamento', 'fila', 'imprimindo', 'pos', 'pronto', 'entregue'];
    const contadores = {};
    etapas.forEach(e => contadores[e] = 0);

    // Limpa colunas
    etapas.forEach(e => {
        const col = document.getElementById(`col-${e}`);
        if (col) col.innerHTML = '';
    });

    let pedidosFiltrados = [...window.PrismaState.pedidos];

    // Filtro por texto
    const busca = window.PrismaState.termoBuscaKanban.toLowerCase();
    if (busca) {
        pedidosFiltrados = pedidosFiltrados.filter(p => 
            (p.titulo && p.titulo.toLowerCase().includes(busca)) ||
            (p.cliente_nome && p.cliente_nome.toLowerCase().includes(busca)) ||
            (p.material_nome && p.material_nome.toLowerCase().includes(busca))
        );
    }

    // Filtro por prazo
    const filtroPrazo = window.PrismaState.filtroPrazo;
    if (filtroPrazo === 'urgente') {
        pedidosFiltrados = pedidosFiltrados.filter(p => {
            const dias = calcularDiferencaDias(p.prazo_ajustado || p.prazo_prometido);
            return dias >= 0 && dias <= 2 && p.status !== 'entregue';
        });
    } else if (filtroPrazo === 'atrasado') {
        pedidosFiltrados = pedidosFiltrados.filter(p => {
            const dias = calcularDiferencaDias(p.prazo_ajustado || p.prazo_prometido);
            return dias < 0 && p.status !== 'entregue';
        });
    }

    pedidosFiltrados.forEach(p => {
        const status = p.status || 'fila';
        if (contadores[status] !== undefined) {
            contadores[status]++;
        }

        const col = document.getElementById(`col-${status}`);
        if (!col) return;

        const prazoFinal = p.prazo_ajustado || p.prazo_prometido;
        const dias = calcularDiferencaDias(prazoFinal);
        const isEntregue = status === 'entregue';

        let badgeClasse = 'badge-prazo-ok';
        let badgeTexto = `Entrega: ${formatarData(prazoFinal)}`;

        if (!isEntregue) {
            if (dias < 0) {
                badgeClasse = 'badge-prazo-atrasado';
                badgeTexto = `Atrasado ${Math.abs(dias)}d (${formatarData(prazoFinal)})`;
            } else if (dias <= 2) {
                badgeClasse = 'badge-prazo-alerta';
                badgeTexto = dias === 0 ? 'Vence HOJE!' : `Vence Amanhã (${formatarData(prazoFinal)})`;
            }
        } else {
            badgeClasse = 'badge-prazo-ok';
            badgeTexto = `Concluído`;
        }

        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
            <div class="order-card-title">${escapeHtml(p.titulo)}</div>
            <div class="order-card-client">
                <i class="fa-solid fa-user"></i> ${escapeHtml(p.cliente_nome || 'Cliente não definido')}
            </div>

            <div class="badge-prazo ${badgeClasse}">
                <i class="fa-solid fa-clock"></i> ${badgeTexto}
            </div>

            ${p.prazo_ajustado && p.motivo_ajuste ? `
                <div class="order-motivo-ajuste">
                    <i class="fa-solid fa-arrows-rotate"></i> <strong>Prazo Revisado:</strong> ${escapeHtml(p.motivo_ajuste)}
                </div>
            ` : ''}

            <div class="order-specs">
                <div class="order-spec-item" title="Material">
                    <i class="fa-solid fa-spool"></i> ${escapeHtml(p.material_nome || 'PLA')}
                </div>
                <div class="order-spec-item" title="Peso em Gramas">
                    <i class="fa-solid fa-weight-hanging"></i> ${p.peso_gramas || 0}g
                </div>
                <div class="order-spec-item" title="Tempo de Máquina">
                    <i class="fa-solid fa-stopwatch"></i> ${p.tempo_horas ? `${p.tempo_horas}h` : '-'}
                </div>
                <div class="order-spec-item" title="Custo Insumos">
                    <i class="fa-solid fa-coins"></i> ${formatarMoeda(p.custo_material || 0)}
                </div>
            </div>

            <div class="order-card-footer">
                <span class="order-price">${formatarMoeda(p.valor_cobrado || 0)}</span>
                <div class="order-actions">
                    <button class="btn-icon" title="Editar" onclick="window.PrismaApp.abrirModalEditarPedido('${p.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${!isEntregue ? `
                        <button class="btn-icon" title="Avançar Próxima Etapa" onclick="window.PrismaApp.avancarProximaEtapa('${p.id}', '${status}')">
                            <i class="fa-solid fa-circle-arrow-right" style="color: var(--primary);"></i>
                        </button>
                    ` : ''}
                    <button class="btn-icon" title="Excluir" onclick="window.PrismaApp.excluirPedido('${p.id}')" style="color: #f87171;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        col.appendChild(card);
    });

    // Atualiza contadores dos headers das colunas
    etapas.forEach(e => {
        const elCount = document.getElementById(`count-${e}`);
        if (elCount) elCount.textContent = contadores[e] || 0;
    });
}

function filtrarKanban() {
    const input = document.getElementById('busca-producao');
    if (input) {
        window.PrismaState.termoBuscaKanban = input.value;
        renderizarProducao();
    }
}

function setFiltroPrazo(tipo) {
    window.PrismaState.filtroPrazo = tipo;
    ['todos', 'urgente', 'atrasado'].forEach(id => {
        const btn = document.getElementById(`filtro-${id}`);
        if (btn) {
            if (id === tipo) {
                btn.style.borderColor = 'var(--primary)';
                btn.style.color = 'var(--primary)';
            } else {
                btn.style.borderColor = 'var(--border)';
                btn.style.color = 'var(--text-main)';
            }
        }
    });
    renderizarProducao();
}

async function avancarProximaEtapa(pedidoId, statusAtual) {
    const ordem = ['orcamento', 'fila', 'imprimindo', 'pos', 'pronto', 'entregue'];
    const idx = ordem.indexOf(statusAtual);
    if (idx >= 0 && idx < ordem.length - 1) {
        const proximo = ordem[idx + 1];
        try {
            await updateDoc(doc(db, COLS.PEDIDOS, pedidoId), {
                status: proximo,
                updated_at: serverTimestamp()
            });
            mostrarToast(`Pedido avançou para: ${formatarEtapa(proximo)}`, "success");
        } catch (err) {
            console.error(err);
            mostrarToast("Erro ao avançar etapa.", "error");
        }
    }
}

// ==========================================================================
// RENDERIZAÇÃO: CLIENTES & FRETE (CRM)
// ==========================================================================
function renderizarClientes() {
    const tbody = document.getElementById('tabela-clientes');
    if (!tbody) return;

    let clientes = [...window.PrismaState.clientes];
    const busca = window.PrismaState.termoBuscaClientes.toLowerCase();

    if (busca) {
        clientes = clientes.filter(c => 
            (c.nome && c.nome.toLowerCase().includes(busca)) ||
            (c.whatsapp && c.whatsapp.includes(busca)) ||
            (c.cidade_uf && c.cidade_uf.toLowerCase().includes(busca)) ||
            (c.cpf_cnpj && c.cpf_cnpj.includes(busca))
        );
    }

    if (clientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum cliente encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = clientes.map(c => {
        // Calcula pedidos do cliente
        const pedidosCliente = window.PrismaState.pedidos.filter(p => p.cliente_id === c.id);
        const totalGasto = pedidosCliente.reduce((acc, p) => acc + (parseFloat(p.valor_cobrado) || 0), 0);
        
        // Link WhatsApp direto
        const numLimpo = (c.whatsapp || '').replace(/\D/g, '');
        const waLink = numLimpo.length >= 10 ? `https://wa.me/55${numLimpo}?text=Ol%C3%A1%20${encodeURIComponent(c.nome)}%2C%20daqui%20%C3%A9%20da%20Prisma%203D!` : '#';

        return `
            <tr>
                <td>
                    <strong style="color: white; font-size: 0.95rem;">${escapeHtml(c.nome)}</strong>
                    ${c.email ? `<div style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(c.email)}</div>` : ''}
                </td>
                <td><span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(c.cpf_cnpj || '-')}</span></td>
                <td>
                    <a href="${waLink}" target="_blank" class="btn-secondary" style="font-size: 0.78rem; padding: 5px 10px; color: #25d366; border-color: rgba(37, 211, 102, 0.3);">
                        <i class="fa-brands fa-whatsapp"></i> ${escapeHtml(c.whatsapp)}
                    </a>
                </td>
                <td>
                    <div style="font-size: 0.82rem;">${escapeHtml(c.cidade_uf || '-')}</div>
                    <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(c.logradouro || '')} ${escapeHtml(c.numero || '')}</div>
                </td>
                <td><span class="kanban-count">${pedidosCliente.length}</span></td>
                <td><strong style="color: var(--primary);">${formatarMoeda(totalGasto)}</strong></td>
                <td style="text-align: right;">
                    <button class="btn-icon" title="Editar Cliente" onclick="window.PrismaApp.abrirModalEditarCliente('${c.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon" title="Excluir" onclick="window.PrismaApp.excluirCliente('${c.id}')" style="color: #f87171;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarClientes() {
    const input = document.getElementById('busca-clientes');
    if (input) {
        window.PrismaState.termoBuscaClientes = input.value;
        renderizarClientes();
    }
}

// ==========================================================================
// RENDERIZAÇÃO: INSUMOS & FILAMENTOS 3D
// ==========================================================================
function renderizarInsumos() {
    const tbody = document.getElementById('tabela-insumos');
    if (!tbody) return;

    const insumos = window.PrismaState.insumos;
    if (insumos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma bobina ou insumo cadastrado ainda.</td></tr>`;
        return;
    }

    tbody.innerHTML = insumos.map(ins => {
        const custoGrama = (parseFloat(ins.custo_bobina) || 0) / (parseFloat(ins.peso_total_gramas) || 1000);
        const estoque = parseFloat(ins.estoque_gramas) || 0;
        
        let statusBadge = '<span style="color: #34d399; font-size: 0.75rem;"><i class="fa-solid fa-circle-check"></i> Em estoque</span>';
        if (estoque <= 100) {
            statusBadge = '<span style="color: #ef4444; font-size: 0.75rem;"><i class="fa-solid fa-triangle-exclamation"></i> Baixo estoque</span>';
        }

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 14px; height: 14px; border-radius: 50%; background: ${escapeHtml(ins.cor_hex || '#06b6d4')}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span>
                        <strong>${escapeHtml(ins.tipo)}</strong>
                    </div>
                </td>
                <td>${escapeHtml(ins.cor)} <span style="font-size: 0.75rem; color: var(--text-dim);">(${escapeHtml(ins.marca)})</span></td>
                <td>${formatarMoeda(ins.custo_bobina)}</td>
                <td><strong style="color: var(--primary);">${formatarMoeda(custoGrama)} / g</strong></td>
                <td><strong>${estoque}g</strong> restantes</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    <button class="btn-icon" title="Editar Material" onclick="window.PrismaApp.abrirModalEditarInsumo('${ins.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon" title="Excluir" onclick="window.PrismaApp.excluirInsumo('${ins.id}')" style="color: #f87171;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Preenche select da calculadora de fatiador
    const selectCalc = document.getElementById('calc-material');
    if (selectCalc) {
        selectCalc.innerHTML = '<option value="">Selecione o material...</option>' + 
            insumos.map(ins => {
                const custoGrama = (parseFloat(ins.custo_bobina) || 0) / (parseFloat(ins.peso_total_gramas) || 1000);
                return `<option value="${custoGrama}">${escapeHtml(ins.tipo)} - ${escapeHtml(ins.cor)} (${formatarMoeda(custoGrama)}/g)</option>`;
            }).join('');
    }
}

function calcularCustoPeca() {
    const custoGrama = parseFloat(document.getElementById('calc-material')?.value) || 0;
    const peso = parseFloat(document.getElementById('calc-peso')?.value) || 0;
    const tempo = parseFloat(document.getElementById('calc-tempo')?.value) || 0;
    const margem = parseFloat(document.getElementById('calc-margem')?.value) || 3;

    // Custo de filamento
    const custoMaterial = peso * custoGrama;
    // Custo estimado de eletricidade e desgaste (R$ 1,20 por hora de máquina)
    const custoEnergia = tempo * 1.20;
    const custoTotal = custoMaterial + custoEnergia;
    const precoSugerido = custoTotal * margem;

    const elCusto = document.getElementById('calc-resultado-custo');
    if (elCusto) elCusto.textContent = formatarMoeda(custoMaterial);

    const elEnergia = document.getElementById('calc-resultado-energia');
    if (elEnergia) elEnergia.textContent = formatarMoeda(custoEnergia);

    const elSugerido = document.getElementById('calc-resultado-sugerido');
    if (elSugerido) elSugerido.textContent = formatarMoeda(precoSugerido);
}

// ==========================================================================
// RENDERIZAÇÃO: FINANCEIRO & LUCRO REAL
// ==========================================================================
function renderizarFinanceiro() {
    const tbody = document.getElementById('tabela-financeiro');
    if (!tbody) return;

    const pedidos = window.PrismaState.pedidos;

    let totalPago = 0;
    let totalPendente = 0;
    let totalCustoInsumos = 0;

    pedidos.forEach(p => {
        const valor = parseFloat(p.valor_cobrado) || 0;
        const sinal = parseFloat(p.valor_sinal) || 0;
        const custo = parseFloat(p.custo_material) || 0;

        if (p.status_pagamento === 'pago_total') {
            totalPago += valor;
        } else if (p.status_pagamento === 'sinal_pago') {
            totalPago += sinal;
            totalPendente += (valor - sinal);
        } else {
            totalPendente += valor;
        }
        totalCustoInsumos += custo;
    });

    const lucroTotal = totalPago - totalCustoInsumos;

    const elRecebido = document.getElementById('fin-total-recebido');
    if (elRecebido) elRecebido.textContent = formatarMoeda(totalPago);

    const elPendente = document.getElementById('fin-total-pendente');
    if (elPendente) elPendente.textContent = formatarMoeda(totalPendente);

    const elCusto = document.getElementById('fin-total-custo');
    if (elCusto) elCusto.textContent = formatarMoeda(totalCustoInsumos);

    const elLucro = document.getElementById('fin-total-lucro');
    if (elLucro) elLucro.textContent = formatarMoeda(lucroTotal);

    if (pedidos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum lançamento financeiro registrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = pedidos.map(p => {
        const valor = parseFloat(p.valor_cobrado) || 0;
        const custo = parseFloat(p.custo_material) || 0;
        const lucroPeca = valor - custo;

        let badgePagamento = '';
        if (p.status_pagamento === 'pago_total') {
            badgePagamento = '<span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;"><i class="fa-solid fa-check"></i> 100% Quitado</span>';
        } else if (p.status_pagamento === 'sinal_pago') {
            badgePagamento = `<span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;"><i class="fa-solid fa-clock"></i> Sinal ${formatarMoeda(p.valor_sinal)}</span>`;
        } else {
            badgePagamento = '<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;"><i class="fa-solid fa-circle-exclamation"></i> Pendente</span>';
        }

        return `
            <tr>
                <td><strong>${escapeHtml(p.titulo)}</strong></td>
                <td><span style="color: var(--primary);">${escapeHtml(p.cliente_nome || 'N/A')}</span></td>
                <td><strong style="color: white;">${formatarMoeda(valor)}</strong></td>
                <td style="color: #f87171;">${formatarMoeda(custo)}</td>
                <td><strong style="color: #c084fc;">${formatarMoeda(lucroPeca)}</strong></td>
                <td>${badgePagamento}</td>
                <td style="text-align: right;">
                    ${p.status_pagamento !== 'pago_total' ? `
                        <button class="btn-cta" style="font-size: 0.72rem; padding: 5px 10px;" onclick="window.PrismaApp.quitarPagamento('${p.id}')">
                            <i class="fa-solid fa-check"></i> Quitar
                        </button>
                    ` : '<span style="color: var(--text-dim); font-size: 0.78rem;">Quitado</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

async function quitarPagamento(pedidoId) {
    try {
        await updateDoc(doc(db, COLS.PEDIDOS, pedidoId), {
            status_pagamento: 'pago_total',
            updated_at: serverTimestamp()
        });
        mostrarToast("Pagamento quitado com sucesso!", "success");
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao quitar pagamento.", "error");
    }
}

// ==========================================================================
// MODAL: PEDIDO 3D (CRIAR / EDITAR / CUSTOS)
// ==========================================================================
function abrirModalNovoPedido() {
    document.getElementById('form-pedido').reset();
    document.getElementById('pedido-id').value = '';
    document.getElementById('modal-pedido-titulo').innerHTML = '<i class="fa-solid fa-cube" style="color: var(--primary);"></i> Novo Pedido 3D';
    document.getElementById('pedido-custo-calculado').textContent = 'R$ 0,00';
    
    // Sugere data de entrega em 3 dias
    const d = new Date();
    d.setDate(d.getDate() + 3);
    document.getElementById('pedido-prazo').value = d.toISOString().split('T')[0];

    atualizarSelectsClientes();
    atualizarSelectsMateriais();
    abrirModal('modal-pedido');
}

function abrirModalEditarPedido(pedidoId) {
    const p = window.PrismaState.pedidos.find(x => x.id === pedidoId);
    if (!p) return;

    atualizarSelectsClientes();
    atualizarSelectsMateriais();

    document.getElementById('pedido-id').value = p.id;
    document.getElementById('pedido-titulo').value = p.titulo || '';
    document.getElementById('pedido-cliente').value = p.cliente_id || '';
    document.getElementById('pedido-material').value = p.material_id || '';
    document.getElementById('pedido-peso').value = p.peso_gramas || '';
    document.getElementById('pedido-tempo').value = p.tempo_horas || '';
    document.getElementById('pedido-status').value = p.status || 'fila';
    document.getElementById('pedido-prazo').value = p.prazo_prometido || '';
    document.getElementById('pedido-prazo-ajustado').value = p.prazo_ajustado || '';
    document.getElementById('pedido-motivo-ajuste').value = p.motivo_ajuste || '';
    document.getElementById('pedido-valor').value = p.valor_cobrado || '';
    document.getElementById('pedido-sinal').value = p.valor_sinal || 0;
    document.getElementById('pedido-status-pagamento').value = p.status_pagamento || 'pendente';
    document.getElementById('pedido-obs').value = p.observacoes || '';

    atualizarCalculoCustoModal();
    document.getElementById('modal-pedido-titulo').innerHTML = '<i class="fa-solid fa-pen" style="color: var(--primary);"></i> Editar Pedido 3D';
    abrirModal('modal-pedido');
}

function atualizarCalculoCustoModal() {
    const matId = document.getElementById('pedido-material').value;
    const peso = parseFloat(document.getElementById('pedido-peso').value) || 0;
    const mat = window.PrismaState.insumos.find(i => i.id === matId);

    if (mat && peso > 0) {
        const custoGrama = (parseFloat(mat.custo_bobina) || 0) / (parseFloat(mat.peso_total_gramas) || 1000);
        const totalCusto = peso * custoGrama;
        document.getElementById('pedido-custo-calculado').textContent = formatarMoeda(totalCusto);
    } else {
        document.getElementById('pedido-custo-calculado').textContent = 'R$ 0,00';
    }
}

async function salvarPedido(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-pedido');
    btn.disabled = true;

    try {
        const id = document.getElementById('pedido-id').value;
        const clienteId = document.getElementById('pedido-cliente').value;
        const materialId = document.getElementById('pedido-material').value;

        const cliente = window.PrismaState.clientes.find(c => c.id === clienteId);
        const material = window.PrismaState.insumos.find(m => m.id === materialId);

        const peso = parseFloat(document.getElementById('pedido-peso').value) || 0;
        let custoMaterial = 0;
        if (material && peso > 0) {
            const custoGrama = (parseFloat(material.custo_bobina) || 0) / (parseFloat(material.peso_total_gramas) || 1000);
            custoMaterial = peso * custoGrama;
        }

        const data = {
            titulo: document.getElementById('pedido-titulo').value.trim(),
            cliente_id: clienteId,
            cliente_nome: cliente ? cliente.nome : '',
            material_id: materialId,
            material_nome: material ? `${material.tipo} (${material.cor})` : '',
            peso_gramas: peso,
            tempo_horas: parseFloat(document.getElementById('pedido-tempo').value) || 0,
            custo_material: custoMaterial,
            status: document.getElementById('pedido-status').value,
            prazo_prometido: document.getElementById('pedido-prazo').value,
            prazo_ajustado: document.getElementById('pedido-prazo-ajustado').value || null,
            motivo_ajuste: document.getElementById('pedido-motivo-ajuste').value.trim() || null,
            valor_cobrado: parseFloat(document.getElementById('pedido-valor').value) || 0,
            valor_sinal: parseFloat(document.getElementById('pedido-sinal').value) || 0,
            status_pagamento: document.getElementById('pedido-status-pagamento').value,
            observacoes: document.getElementById('pedido-obs').value.trim(),
            updated_at: serverTimestamp()
        };

        if (id) {
            await updateDoc(doc(db, COLS.PEDIDOS, id), data);
            mostrarToast("Pedido 3D atualizado com sucesso!", "success");
        } else {
            data.created_at = serverTimestamp();
            await addDoc(collection(db, COLS.PEDIDOS), data);
            mostrarToast("Novo Pedido 3D registrado na oficina!", "success");
        }

        fecharModal('modal-pedido');
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar pedido 3D.", "error");
    } finally {
        btn.disabled = false;
    }
}

async function excluirPedido(id) {
    if (confirm("Tem certeza que deseja excluir esta encomenda?")) {
        try {
            await deleteDoc(doc(db, COLS.PEDIDOS, id));
            mostrarToast("Pedido excluído.", "success");
        } catch (err) {
            console.error(err);
            mostrarToast("Erro ao excluir pedido.", "error");
        }
    }
}

// ==========================================================================
// MODAL: CLIENTE (CRIAR / EDITAR)
// ==========================================================================
function abrirModalNovoCliente() {
    document.getElementById('form-cliente').reset();
    document.getElementById('cliente-id').value = '';
    document.getElementById('modal-cliente-titulo').innerHTML = '<i class="fa-solid fa-user-plus" style="color: var(--primary);"></i> Cadastro de Cliente';
    abrirModal('modal-cliente');
}

function abrirModalEditarCliente(clienteId) {
    const c = window.PrismaState.clientes.find(x => x.id === clienteId);
    if (!c) return;

    document.getElementById('cliente-id').value = c.id;
    document.getElementById('cliente-nome').value = c.nome || '';
    document.getElementById('cliente-whatsapp').value = c.whatsapp || '';
    document.getElementById('cliente-cpf').value = c.cpf_cnpj || '';
    document.getElementById('cliente-email').value = c.email || '';
    document.getElementById('cliente-cep').value = c.cep || '';
    document.getElementById('cliente-cidade-uf').value = c.cidade_uf || '';
    document.getElementById('cliente-logradouro').value = c.logradouro || '';
    document.getElementById('cliente-numero').value = c.numero || '';
    document.getElementById('cliente-obs').value = c.observacoes || '';

    document.getElementById('modal-cliente-titulo').innerHTML = '<i class="fa-solid fa-pen" style="color: var(--primary);"></i> Editar Cliente';
    abrirModal('modal-cliente');
}

async function salvarCliente(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-cliente');
    btn.disabled = true;

    try {
        const id = document.getElementById('cliente-id').value;
        const data = {
            nome: document.getElementById('cliente-nome').value.trim(),
            whatsapp: document.getElementById('cliente-whatsapp').value.trim(),
            cpf_cnpj: document.getElementById('cliente-cpf').value.trim(),
            email: document.getElementById('cliente-email').value.trim(),
            cep: document.getElementById('cliente-cep').value.trim(),
            cidade_uf: document.getElementById('cliente-cidade-uf').value.trim(),
            logradouro: document.getElementById('cliente-logradouro').value.trim(),
            numero: document.getElementById('cliente-numero').value.trim(),
            observacoes: document.getElementById('cliente-obs').value.trim(),
            updated_at: serverTimestamp()
        };

        if (id) {
            await updateDoc(doc(db, COLS.CLIENTES, id), data);
            mostrarToast("Cliente atualizado!", "success");
        } else {
            data.created_at = serverTimestamp();
            await addDoc(collection(db, COLS.CLIENTES), data);
            mostrarToast("Cliente cadastrado com sucesso!", "success");
        }

        fecharModal('modal-cliente');
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar cliente.", "error");
    } finally {
        btn.disabled = false;
    }
}

async function excluirCliente(id) {
    if (confirm("Tem certeza que deseja excluir este cliente?")) {
        try {
            await deleteDoc(doc(db, COLS.CLIENTES, id));
            mostrarToast("Cliente excluído.", "success");
        } catch (err) {
            console.error(err);
            mostrarToast("Erro ao excluir cliente.", "error");
        }
    }
}

async function buscarCep(cep) {
    const limpo = (cep || '').replace(/\D/g, '');
    if (limpo.length === 8) {
        try {
            const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
            const data = await res.json();
            if (!data.erro) {
                const log = document.getElementById('cliente-logradouro');
                const cid = document.getElementById('cliente-cidade-uf');
                if (log) log.value = `${data.logradouro} - ${data.bairro}`;
                if (cid) cid.value = `${data.localidade} / ${data.uf}`;
                mostrarToast("Endereço preenchido automaticamente!", "success");
            }
        } catch (err) {
            console.log("ViaCEP erro:", err);
        }
    }
}

// ==========================================================================
// MODAL: INSUMOS (CRIAR / EDITAR)
// ==========================================================================
function abrirModalNovoInsumo() {
    document.getElementById('form-insumo').reset();
    document.getElementById('insumo-id').value = '';
    document.getElementById('insumo-peso-total').value = '1000';
    document.getElementById('insumo-custo-grama-calc').textContent = 'R$ 0,00 / g';
    document.getElementById('modal-insumo-titulo').innerHTML = '<i class="fa-solid fa-spool" style="color: var(--primary);"></i> Cadastrar Material / Bobina';
    abrirModal('modal-insumo');
}

function abrirModalEditarInsumo(insumoId) {
    const ins = window.PrismaState.insumos.find(x => x.id === insumoId);
    if (!ins) return;

    document.getElementById('insumo-id').value = ins.id;
    document.getElementById('insumo-tipo').value = ins.tipo || 'PLA';
    document.getElementById('insumo-marca').value = ins.marca || '';
    document.getElementById('insumo-cor').value = ins.cor || '';
    document.getElementById('insumo-cor-hex').value = ins.cor_hex || '#06b6d4';
    document.getElementById('insumo-peso-total').value = ins.peso_total_gramas || 1000;
    document.getElementById('insumo-custo').value = ins.custo_bobina || '';
    document.getElementById('insumo-estoque').value = ins.estoque_gramas || '';

    calcularCustoGramaModal();
    document.getElementById('modal-insumo-titulo').innerHTML = '<i class="fa-solid fa-pen" style="color: var(--primary);"></i> Editar Material';
    abrirModal('modal-insumo');
}

function calcularCustoGramaModal() {
    const peso = parseFloat(document.getElementById('insumo-peso-total').value) || 1000;
    const custo = parseFloat(document.getElementById('insumo-custo').value) || 0;
    const custoGrama = custo / peso;
    document.getElementById('insumo-custo-grama-calc').textContent = `${formatarMoeda(custoGrama)} / g`;
}

async function salvarInsumo(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-insumo');
    btn.disabled = true;

    try {
        const id = document.getElementById('insumo-id').value;
        const data = {
            tipo: document.getElementById('insumo-tipo').value,
            marca: document.getElementById('insumo-marca').value.trim(),
            cor: document.getElementById('insumo-cor').value.trim(),
            cor_hex: document.getElementById('insumo-cor-hex').value,
            peso_total_gramas: parseFloat(document.getElementById('insumo-peso-total').value) || 1000,
            custo_bobina: parseFloat(document.getElementById('insumo-custo').value) || 0,
            estoque_gramas: parseFloat(document.getElementById('insumo-estoque').value) || 0,
            updated_at: serverTimestamp()
        };

        if (id) {
            await updateDoc(doc(db, COLS.INSUMOS, id), data);
            mostrarToast("Material atualizado!", "success");
        } else {
            data.created_at = serverTimestamp();
            await addDoc(collection(db, COLS.INSUMOS), data);
            mostrarToast("Nova bobina registrada no estoque!", "success");
        }

        fecharModal('modal-insumo');
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar material.", "error");
    } finally {
        btn.disabled = false;
    }
}

async function excluirInsumo(id) {
    if (confirm("Deseja realmente excluir este insumo?")) {
        try {
            await deleteDoc(doc(db, COLS.INSUMOS, id));
            mostrarToast("Insumo excluído.", "success");
        } catch (err) {
            console.error(err);
            mostrarToast("Erro ao excluir insumo.", "error");
        }
    }
}

// ==========================================================================
// RENDERIZAÇÃO E OPERAÇÕES: MURAL DE NOTAS & INFORMAÇÕES
// ==========================================================================
function renderizarMural() {
    const grid = document.getElementById('grid-mural-notas');
    if (!grid) return;

    const notas = window.PrismaState.notas || [];
    const catFiltro = window.PrismaState.filtroCategoriaNota || 'todas';
    const termo = (window.PrismaState.termoBuscaNotas || '').toLowerCase();

    // Atualiza contadores de notas
    const elTotal = document.getElementById('mural-total-notas');
    const elFixadas = document.getElementById('mural-total-fixadas');
    if (elTotal) elTotal.textContent = notas.length;
    if (elFixadas) elFixadas.textContent = notas.filter(n => n.fixada).length;

    // Filtra notas por categoria e busca textual
    let notasFiltradas = notas.filter(n => {
        if (catFiltro === 'fixadas' && !n.fixada) return false;
        if (catFiltro !== 'todas' && catFiltro !== 'fixadas' && n.categoria !== catFiltro) return false;

        if (termo) {
            const titulo = (n.titulo || '').toLowerCase();
            const conteudo = (n.conteudo || '').toLowerCase();
            const tags = (n.tags || '').toLowerCase();
            const cat = (n.categoria || '').toLowerCase();
            return titulo.includes(termo) || conteudo.includes(termo) || tags.includes(termo) || cat.includes(termo);
        }

        return true;
    });

    // Ordenação: primeiro fixadas, depois por updated_at / created_at mais recente
    notasFiltradas.sort((a, b) => {
        if (a.fixada !== b.fixada) {
            return a.fixada ? -1 : 1;
        }
        const dataA = a.updated_at?.seconds || a.created_at?.seconds || 0;
        const dataB = b.updated_at?.seconds || b.created_at?.seconds || 0;
        return dataB - dataA;
    });

    if (notasFiltradas.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1.5rem; background: var(--card-bg); border: 1px dashed var(--border); border-radius: var(--radius-lg);">
                <i class="fa-solid fa-note-sticky" style="color: var(--primary); font-size: 2.2rem; margin-bottom: 0.75rem; display: block; opacity: 0.8;"></i>
                <h4 style="color: white; font-size: 1.1rem; margin-bottom: 0.35rem;">Nenhuma nota encontrada</h4>
                <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 440px; margin: 0 auto 1.25rem;">
                    ${termo || catFiltro !== 'todas' 
                        ? 'Nenhuma anotação corresponde ao filtro ou busca selecionada.' 
                        : 'Utilize o mural para registrar parâmetros de impressão, testes de filamentos, manutenções periódicas e lembretes da oficina.'}
                </p>
                <button class="btn-cta" onclick="window.PrismaApp.abrirModalNovaNota()">
                    <i class="fa-solid fa-plus"></i> Criar Primeira Nota
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = notasFiltradas.map(nota => {
        const catInfo = obterInfoCategoria(nota.categoria);
        const corClasse = `mural-card-${nota.cor || 'padrao'}`;
        const isPinned = nota.fixada ? 'is-pinned' : '';
        const dataFormatada = formatarDataTimestamp(nota.updated_at || nota.created_at);
        const tags = nota.tags ? nota.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

        return `
            <div class="mural-card ${corClasse} ${isPinned}">
                <div class="mural-card-header">
                    <span class="mural-categoria-badge">
                        <i class="${catInfo.icone}" style="color: ${catInfo.cor};"></i> ${escapeHtml(catInfo.label)}
                    </span>
                    <button 
                        class="mural-pin-btn ${nota.fixada ? 'active' : ''}" 
                        title="${nota.fixada ? 'Desafixar nota do topo' : 'Fixar nota no topo'}"
                        onclick="window.PrismaApp.toggleFixarNota('${nota.id}')"
                    >
                        <i class="fa-solid fa-thumbtack"></i>
                    </button>
                </div>

                <h4 class="mural-card-titulo">${escapeHtml(nota.titulo)}</h4>

                <div class="mural-card-body">${escapeHtml(nota.conteudo)}</div>

                ${tags.length > 0 ? `
                    <div class="mural-tags-container">
                        ${tags.map(t => `<span class="mural-tag"><i class="fa-solid fa-tag" style="font-size: 0.65rem; opacity: 0.7;"></i> ${escapeHtml(t)}</span>`).join('')}
                    </div>
                ` : ''}

                <div class="mural-card-footer">
                    <span class="mural-card-data">
                        <i class="fa-regular fa-clock"></i> ${dataFormatada}
                    </span>
                    <div class="mural-card-actions">
                        <button title="Editar Nota" onclick="window.PrismaApp.abrirModalEditarNota('${nota.id}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete" title="Excluir Nota" onclick="window.PrismaApp.excluirNota('${nota.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function obterInfoCategoria(cat) {
    const map = {
        'parametros': { label: 'Parâmetros 3D', icone: 'fa-solid fa-sliders', cor: '#06b6d4' },
        'manutencao': { label: 'Manutenção', icone: 'fa-solid fa-wrench', cor: '#f59e0b' },
        'ideias': { label: 'Ideias & Novos Projetos', icone: 'fa-solid fa-lightbulb', cor: '#a855f7' },
        'urgente': { label: 'Urgente / Alerta', icone: 'fa-solid fa-triangle-exclamation', cor: '#ef4444' },
        'geral': { label: 'Geral', icone: 'fa-solid fa-comment-dots', cor: '#94a3b8' }
    };
    return map[cat] || { label: 'Nota', icone: 'fa-solid fa-note-sticky', cor: '#06b6d4' };
}

function formatarDataTimestamp(timestamp) {
    if (!timestamp) return 'Hoje';
    let date;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }
    if (isNaN(date.getTime())) return 'Hoje';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function filtrarNotasPorCategoria(cat) {
    window.PrismaState.filtroCategoriaNota = cat;
    document.querySelectorAll('.mural-pill-filtro').forEach(btn => {
        if (btn.getAttribute('data-cat') === cat) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderizarMural();
}

function filtrarNotasPorBusca(termo) {
    window.PrismaState.termoBuscaNotas = (termo || '').toLowerCase().trim();
    renderizarMural();
}

function abrirModalNovaNota() {
    const form = document.getElementById('form-nota');
    if (form) form.reset();
    document.getElementById('nota-id').value = '';
    document.getElementById('modal-nota-titulo').innerHTML = '<i class="fa-solid fa-note-sticky" style="color: var(--primary);"></i> Nova Nota no Mural';
    document.getElementById('nota-cor').value = 'ciano';
    document.getElementById('nota-categoria').value = 'geral';
    document.getElementById('nota-fixada').checked = false;
    abrirModal('modal-nota');
}

function abrirModalEditarNota(id) {
    const nota = window.PrismaState.notas.find(n => n.id === id);
    if (!nota) return;

    document.getElementById('nota-id').value = nota.id;
    document.getElementById('modal-nota-titulo').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> Editar Nota do Mural';
    document.getElementById('nota-titulo').value = nota.titulo || '';
    document.getElementById('nota-categoria').value = nota.categoria || 'geral';
    document.getElementById('nota-cor').value = nota.cor || 'padrao';
    document.getElementById('nota-fixada').checked = !!nota.fixada;
    document.getElementById('nota-conteudo').value = nota.conteudo || '';
    document.getElementById('nota-tags').value = nota.tags || '';

    abrirModal('modal-nota');
}

async function salvarNota(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-nota');
    btn.disabled = true;

    try {
        const id = document.getElementById('nota-id').value;
        const data = {
            titulo: document.getElementById('nota-titulo').value.trim(),
            categoria: document.getElementById('nota-categoria').value,
            cor: document.getElementById('nota-cor').value,
            fixada: document.getElementById('nota-fixada').checked,
            conteudo: document.getElementById('nota-conteudo').value.trim(),
            tags: document.getElementById('nota-tags').value.trim(),
            updated_at: serverTimestamp()
        };

        if (id) {
            await updateDoc(doc(db, COLS.NOTAS, id), data);
            mostrarToast("Nota atualizada com sucesso!", "success");
        } else {
            data.created_at = serverTimestamp();
            await addDoc(collection(db, COLS.NOTAS), data);
            mostrarToast("Nova nota adicionada ao mural!", "success");
        }

        fecharModal('modal-nota');
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar nota.", "error");
    } finally {
        btn.disabled = false;
    }
}

async function excluirNota(id) {
    if (confirm("Tem certeza que deseja excluir esta nota do mural?")) {
        try {
            await deleteDoc(doc(db, COLS.NOTAS, id));
            mostrarToast("Nota removida do mural.", "success");
        } catch (err) {
            console.error(err);
            mostrarToast("Erro ao excluir nota.", "error");
        }
    }
}

async function toggleFixarNota(id) {
    const nota = window.PrismaState.notas.find(n => n.id === id);
    if (!nota) return;

    try {
        const novoStatus = !nota.fixada;
        await updateDoc(doc(db, COLS.NOTAS, id), {
            fixada: novoStatus,
            updated_at: serverTimestamp()
        });
        mostrarToast(novoStatus ? "Nota fixada no topo do mural!" : "Nota desafixada.", "success");
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao alterar fixação da nota.", "error");
    }
}

// ==========================================================================
// CONFIGURAÇÕES DE CUSTOS DA OFICINA (BASE DE CÁLCULO)
// ==========================================================================
const CONFIG_OFICINA_DEFAULT = {
    tarifaEnergiaKwh: 0.95,
    potenciaWatts: 180,
    depreciacaoHora: 2.50,
    maoObraHora: 30.00,
    margemPadrao: 2.5
};

function obterConfigOficina() {
    try {
        const salvo = localStorage.getItem('prisma_config_oficina');
        if (salvo) return { ...CONFIG_OFICINA_DEFAULT, ...JSON.parse(salvo) };
    } catch (e) {
        console.error("Erro ao carregar configurações da oficina:", e);
    }
    return { ...CONFIG_OFICINA_DEFAULT };
}

function abrirConfigOficina() {
    const cfg = obterConfigOficina();
    const elTarifa = document.getElementById('cfg-tarifa-energia');
    const elPotencia = document.getElementById('cfg-potencia-watts');
    const elDeprec = document.getElementById('cfg-depreciacao-hora');
    const elMaoObra = document.getElementById('cfg-mao-obra-hora');
    const elMargem = document.getElementById('cfg-margem-padrao');

    if (elTarifa) elTarifa.value = cfg.tarifaEnergiaKwh;
    if (elPotencia) elPotencia.value = cfg.potenciaWatts;
    if (elDeprec) elDeprec.value = cfg.depreciacaoHora;
    if (elMaoObra) elMaoObra.value = cfg.maoObraHora;
    if (elMargem) elMargem.value = cfg.margemPadrao;

    abrirModal('modal-config-oficina');
}

function salvarConfigOficina(e) {
    e.preventDefault();
    const cfg = {
        tarifaEnergiaKwh: parseFloat(document.getElementById('cfg-tarifa-energia').value) || CONFIG_OFICINA_DEFAULT.tarifaEnergiaKwh,
        potenciaWatts: parseFloat(document.getElementById('cfg-potencia-watts').value) || CONFIG_OFICINA_DEFAULT.potenciaWatts,
        depreciacaoHora: parseFloat(document.getElementById('cfg-depreciacao-hora').value) || CONFIG_OFICINA_DEFAULT.depreciacaoHora,
        maoObraHora: parseFloat(document.getElementById('cfg-mao-obra-hora').value) || CONFIG_OFICINA_DEFAULT.maoObraHora,
        margemPadrao: parseFloat(document.getElementById('cfg-margem-padrao').value) || CONFIG_OFICINA_DEFAULT.margemPadrao
    };
    try {
        localStorage.setItem('prisma_config_oficina', JSON.stringify(cfg));
        mostrarToast("Parâmetros da oficina salvos!", "success");
        fecharModal('modal-config-oficina');
        if (window.PrismaState.viewAtual === 'orcamentos') {
            recalcularOrcamento();
        }
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar parâmetros.", "error");
    }
}

// ==========================================================================
// RENDERIZAÇÃO & OPERAÇÕES: CALCULADORA DE ORÇAMENTOS 3D
// ==========================================================================
function renderizarOrcamentos() {
    popularSelectsOrcamento();
    recalcularOrcamento();
    renderizarTabelaOrcamentos();
}

function popularSelectsOrcamento() {
    // Select de Clientes
    const selectCliente = document.getElementById('orc-cliente-select');
    if (selectCliente) {
        const atual = selectCliente.value;
        selectCliente.innerHTML = '<option value="">-- Selecione ou digite ao lado --</option>' + 
            window.PrismaState.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} (${escapeHtml(c.whatsapp || '')})</option>`).join('');
        if (atual) selectCliente.value = atual;
    }

    // Select de Materiais / Insumos
    const selectMaterial = document.getElementById('orc-material-select');
    if (selectMaterial) {
        const atual = selectMaterial.value;
        selectMaterial.innerHTML = '<option value="">Selecione o filamento...</option>' + 
            window.PrismaState.insumos.map(m => {
                const custoGrama = (parseFloat(m.custo_bobina) || 0) / (parseFloat(m.peso_total_gramas) || 1000);
                return `<option value="${m.id}">${escapeHtml(m.tipo)} - ${escapeHtml(m.cor)} (${formatarMoeda(custoGrama)}/g)</option>`;
            }).join('');
        if (atual) {
            selectMaterial.value = atual;
        } else if (window.PrismaState.insumos.length > 0) {
            selectMaterial.selectedIndex = 1;
        }
    }
}

function selecionarClienteOrcamento(clienteId) {
    if (!clienteId) return;
    const cliente = window.PrismaState.clientes.find(c => c.id === clienteId);
    if (!cliente) return;

    const elNome = document.getElementById('orc-cliente-nome');
    const elWhats = document.getElementById('orc-cliente-whatsapp');
    if (elNome) elNome.value = cliente.nome || '';
    if (elWhats) elWhats.value = cliente.whatsapp || '';

    recalcularOrcamento();
}

function atualizarMargemOrcamento(valor) {
    const campoManual = document.getElementById('orc-campo-valor-manual');
    if (campoManual) {
        campoManual.style.display = valor === 'manual' ? 'block' : 'none';
    }
    recalcularOrcamento();
}

function recalcularOrcamento() {
    const cfg = obterConfigOficina();

    // Valores de entrada
    const materialId = document.getElementById('orc-material-select')?.value;
    const pesoGramas = parseFloat(document.getElementById('orc-peso')?.value) || 0;
    const tempoHoras = parseFloat(document.getElementById('orc-tempo')?.value) || 0;
    const taxaRisco = parseFloat(document.getElementById('orc-risco')?.value) || 0;
    const margemOpt = document.getElementById('orc-margem-multiplicador')?.value || '2.5';
    const valorManual = parseFloat(document.getElementById('orc-valor-manual')?.value) || 0;

    const clienteNome = document.getElementById('orc-cliente-nome')?.value.trim() || 'Cliente';
    const clienteWhats = document.getElementById('orc-cliente-whatsapp')?.value.trim() || '';
    const tituloProjeto = document.getElementById('orc-titulo')?.value.trim() || 'Peça Sob Encomenda';
    const prazoPrometido = document.getElementById('orc-prazo-dias')?.value.trim() || '3 a 5 dias úteis';

    // Extras
    let extrasTotal = 0;
    const listaExtrasDesc = [];
    if (document.getElementById('orc-extra-suporte')?.checked) {
        extrasTotal += 15.00;
        listaExtrasDesc.push('Remoção de Suportes / Limpeza');
    }
    if (document.getElementById('orc-extra-lixamento')?.checked) {
        extrasTotal += 35.00;
        listaExtrasDesc.push('Lixamento & Primer / Acabamento');
    }
    if (document.getElementById('orc-extra-inserts')?.checked) {
        extrasTotal += 12.00;
        listaExtrasDesc.push('Inserts Metálicos / Ímãs');
    }
    if (document.getElementById('orc-extra-embalagem')?.checked) {
        extrasTotal += 10.00;
        listaExtrasDesc.push('Embalagem Especial Reforçada');
    }

    // Material
    const materialObj = window.PrismaState.insumos.find(m => m.id === materialId);
    let custoGrama = 0.11;
    let materialNome = 'PLA Padrão';
    if (materialObj) {
        custoGrama = (parseFloat(materialObj.custo_bobina) || 0) / (parseFloat(materialObj.peso_total_gramas) || 1000);
        materialNome = `${materialObj.tipo} - ${materialObj.cor}`;
    }

    const custoMaterial = pesoGramas * custoGrama;
    const consumoKwh = (cfg.potenciaWatts / 1000) * tempoHoras;
    const custoEnergia = consumoKwh * cfg.tarifaEnergiaKwh;
    const custoDesgaste = tempoHoras * cfg.depreciacaoHora;

    const subtotalDireto = custoMaterial + custoEnergia + custoDesgaste + extrasTotal;
    const custoRisco = subtotalDireto * taxaRisco;
    const custoTotalProducao = subtotalDireto + custoRisco;

    let precoFinal = 0;
    let margemBadge = `${margemOpt}x Margem`;
    if (margemOpt === 'manual') {
        precoFinal = valorManual > 0 ? valorManual : custoTotalProducao;
        margemBadge = 'Preço Personalizado';
    } else {
        const mult = parseFloat(margemOpt) || 2.5;
        precoFinal = custoTotalProducao * mult;
    }

    const lucroLiquido = Math.max(0, precoFinal - custoTotalProducao);
    const sinal50 = precoFinal * 0.5;

    // Atualiza DOM
    const elResMaterial = document.getElementById('orc-resumo-material');
    if (elResMaterial) elResMaterial.textContent = formatarMoeda(custoMaterial);

    const elResEnergia = document.getElementById('orc-resumo-energia');
    if (elResEnergia) elResEnergia.textContent = formatarMoeda(custoEnergia);

    const elResDesgaste = document.getElementById('orc-resumo-desgaste');
    if (elResDesgaste) elResDesgaste.textContent = formatarMoeda(custoDesgaste);

    const elResRisco = document.getElementById('orc-resumo-risco');
    if (elResRisco) elResRisco.textContent = formatarMoeda(custoRisco);

    const elResExtras = document.getElementById('orc-resumo-extras');
    if (elResExtras) elResExtras.textContent = formatarMoeda(extrasTotal);

    const elResCustoTotal = document.getElementById('orc-resumo-custo-total');
    if (elResCustoTotal) elResCustoTotal.textContent = formatarMoeda(custoTotalProducao);

    const elResPrecoFinal = document.getElementById('orc-resumo-preco-final');
    if (elResPrecoFinal) elResPrecoFinal.textContent = formatarMoeda(precoFinal);

    const elResLucro = document.getElementById('orc-resumo-lucro-liquido');
    if (elResLucro) elResLucro.textContent = `${formatarMoeda(lucroLiquido)} (${custoTotalProducao > 0 ? ((lucroLiquido / custoTotalProducao) * 100).toFixed(0) : 0}%)`;

    const elResSinal = document.getElementById('orc-resumo-sinal-50');
    if (elResSinal) elResSinal.textContent = formatarMoeda(sinal50);

    const elBadge = document.getElementById('orc-badge-margem');
    if (elBadge) elBadge.textContent = margemBadge;

    // Mensagem WhatsApp formatada
    const msgWhatsapp = `🖨️ *ORÇAMENTO PRISMA 3D STUDIO*

Olá *${clienteNome}*, segue a proposta comercial para o seu projeto:

📦 *Projeto / Peça:* ${tituloProjeto}
🧵 *Material Escolhido:* ${materialNome}
⏳ *Prazo de Produção:* ${prazoPrometido}
${listaExtrasDesc.length > 0 ? `🛠️ *Serviços Inclusos:* ${listaExtrasDesc.join(', ')}\n` : ''}
💰 *Valor Total do Pedido:* ${formatarMoeda(precoFinal)}
💳 *Condição Facilitada:* 50% de Entrada (${formatarMoeda(sinal50)}) via PIX e 50% na Retirada/Envio
📅 *Validade desta proposta:* 7 dias corridos

Ficou com alguma dúvida ou gostaria de ajustar algum detalhe? Podemos iniciar a impressão do seu projeto!`;

    const elPreview = document.getElementById('orc-preview-whatsapp');
    if (elPreview) elPreview.value = msgWhatsapp;

    // Salva cálculo ativo no estado
    window.PrismaState.orcamentoAtualCalculado = {
        cliente_id: document.getElementById('orc-cliente-select')?.value || null,
        cliente_nome: clienteNome,
        cliente_whatsapp: clienteWhats,
        titulo: tituloProjeto,
        material_id: materialId || null,
        material_nome: materialNome,
        peso_gramas: pesoGramas,
        tempo_horas: tempoHoras,
        taxa_risco: taxaRisco,
        extras_total: extrasTotal,
        extras_desc: listaExtrasDesc,
        margem_opt: margemOpt,
        prazo_prometido: prazoPrometido,
        custo_material: custoMaterial,
        custo_energia: custoEnergia,
        custo_desgaste: custoDesgaste,
        custo_risco: custoRisco,
        custo_total: custoTotalProducao,
        preco_final: precoFinal,
        lucro_liquido: lucroLiquido,
        sinal_sugerido: sinal50,
        mensagem_whatsapp: msgWhatsapp
    };
}

function copiarTextoProposta() {
    const elPreview = document.getElementById('orc-preview-whatsapp');
    if (!elPreview || !elPreview.value) return;

    navigator.clipboard.writeText(elPreview.value).then(() => {
        mostrarToast("Proposta copiada para a área de transferência!", "success");
    }).catch(() => {
        elPreview.select();
        document.execCommand('copy');
        mostrarToast("Proposta copiada!", "success");
    });
}

function enviarPropostaWhatsAppDireto() {
    const orc = window.PrismaState.orcamentoAtualCalculado;
    if (!orc) return;

    let num = (orc.cliente_whatsapp || '').replace(/\D/g, '');
    if (!num) {
        mostrarToast("Por favor, preencha o WhatsApp do cliente para abrir o chat.", "error");
        return;
    }
    if (!num.startsWith('55') && num.length <= 11) {
        num = '55' + num;
    }

    const url = `https://wa.me/${num}?text=${encodeURIComponent(orc.mensagem_whatsapp)}`;
    window.open(url, '_blank');
}

async function salvarOrcamento() {
    const orc = window.PrismaState.orcamentoAtualCalculado;
    if (!orc || !orc.titulo) {
        mostrarToast("Preencha ao menos o nome do projeto para salvar.", "error");
        return;
    }

    try {
        const data = {
            ...orc,
            status: 'pendente',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };

        await addDoc(collection(db, COLS.ORCAMENTOS), data);
        mostrarToast("Orçamento salvo com sucesso no histórico!", "success");
    } catch (err) {
        console.error("Erro ao salvar orçamento:", err);
        mostrarToast("Erro ao salvar orçamento no banco.", "error");
    }
}

function converterOrcamentoEmPedido(orcId) {
    let orc = window.PrismaState.orcamentoAtualCalculado;
    if (orcId) {
        orc = window.PrismaState.orcamentos.find(o => o.id === orcId) || orc;
    }

    if (!orc) {
        mostrarToast("Nenhum cálculo selecionado.", "error");
        return;
    }

    // Abre o modal de pedido pré-preenchido
    abrirModalNovoPedido();

    // Preenche com os dados calculados do orçamento
    const elTitulo = document.getElementById('pedido-titulo');
    if (elTitulo) elTitulo.value = orc.titulo || '';

    const elCliente = document.getElementById('pedido-cliente');
    if (elCliente && orc.cliente_id) elCliente.value = orc.cliente_id;

    const elMaterial = document.getElementById('pedido-material');
    if (elMaterial && orc.material_id) elMaterial.value = orc.material_id;

    const elPeso = document.getElementById('pedido-peso');
    if (elPeso) elPeso.value = orc.peso_gramas || '';

    const elTempo = document.getElementById('pedido-tempo');
    if (elTempo) elTempo.value = orc.tempo_horas || '';

    const elValor = document.getElementById('pedido-valor');
    if (elValor) elValor.value = (orc.preco_final || 0).toFixed(2);

    const elSinal = document.getElementById('pedido-sinal');
    if (elSinal) elSinal.value = (orc.sinal_sugerido || 0).toFixed(2);

    const elStatus = document.getElementById('pedido-status');
    if (elStatus) elStatus.value = 'orcamento';

    const elObs = document.getElementById('pedido-obs');
    if (elObs) {
        elObs.value = `Orçamento gerado pelo Studio. Material: ${orc.material_nome || ''}. Prazo est.: ${orc.prazo_prometido || ''}. Custo prod.: ${formatarMoeda(orc.custo_total)}.`;
    }

    atualizarCalculoCustoModal();

    if (orcId) {
        alterarStatusOrcamento(orcId, 'aprovado');
    }

    mostrarToast("Dados do orçamento transferidos para o novo pedido!", "success");
}

async function alterarStatusOrcamento(id, novoStatus) {
    try {
        await updateDoc(doc(db, COLS.ORCAMENTOS, id), {
            status: novoStatus,
            updated_at: serverTimestamp()
        });
        const msg = novoStatus === 'aprovado' ? "Orçamento marcado como Aprovado!" : (novoStatus === 'recusado' ? "Orçamento marcado como Recusado." : "Status atualizado.");
        mostrarToast(msg, "success");
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao alterar status.", "error");
    }
}

async function excluirOrcamento(id) {
    if (confirm("Deseja realmente excluir este orçamento do histórico?")) {
        try {
            await deleteDoc(doc(db, COLS.ORCAMENTOS, id));
            mostrarToast("Orçamento excluído.", "success");
        } catch (err) {
            console.error(err);
            mostrarToast("Erro ao excluir orçamento.", "error");
        }
    }
}

function carregarOrcamentoNaCalculadora(id) {
    const orc = window.PrismaState.orcamentos.find(o => o.id === id);
    if (!orc) return;

    if (orc.cliente_id) {
        const elSelect = document.getElementById('orc-cliente-select');
        if (elSelect) elSelect.value = orc.cliente_id;
    }
    const elNome = document.getElementById('orc-cliente-nome');
    if (elNome) elNome.value = orc.cliente_nome || '';

    const elWhats = document.getElementById('orc-cliente-whatsapp');
    if (elWhats) elWhats.value = orc.cliente_whatsapp || '';

    const elTitulo = document.getElementById('orc-titulo');
    if (elTitulo) elTitulo.value = orc.titulo || '';

    const elMat = document.getElementById('orc-material-select');
    if (elMat && orc.material_id) elMat.value = orc.material_id;

    const elPeso = document.getElementById('orc-peso');
    if (elPeso) elPeso.value = orc.peso_gramas || 100;

    const elTempo = document.getElementById('orc-tempo');
    if (elTempo) elTempo.value = orc.tempo_horas || 5;

    const elRisco = document.getElementById('orc-risco');
    if (elRisco) elRisco.value = orc.taxa_risco !== undefined ? orc.taxa_risco.toFixed(2) : '0.10';

    const elMargem = document.getElementById('orc-margem-multiplicador');
    if (elMargem) {
        elMargem.value = orc.margem_opt || '2.5';
        atualizarMargemOrcamento(elMargem.value);
    }

    const elPrazo = document.getElementById('orc-prazo-dias');
    if (elPrazo) elPrazo.value = orc.prazo_prometido || '3 a 5 dias úteis';

    recalcularOrcamento();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    mostrarToast("Orçamento carregado no simulador!", "success");
}

function limparCalculadoraOrcamento() {
    const elSelect = document.getElementById('orc-cliente-select');
    if (elSelect) elSelect.value = '';

    const elNome = document.getElementById('orc-cliente-nome');
    if (elNome) elNome.value = '';

    const elWhats = document.getElementById('orc-cliente-whatsapp');
    if (elWhats) elWhats.value = '';

    const elTitulo = document.getElementById('orc-titulo');
    if (elTitulo) elTitulo.value = '';

    const elPeso = document.getElementById('orc-peso');
    if (elPeso) elPeso.value = '100';

    const elTempo = document.getElementById('orc-tempo');
    if (elTempo) elTempo.value = '5.0';

    const chks = ['orc-extra-suporte', 'orc-extra-lixamento', 'orc-extra-inserts', 'orc-extra-embalagem'];
    chks.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });

    const elMargem = document.getElementById('orc-margem-multiplicador');
    if (elMargem) {
        elMargem.value = '2.5';
        atualizarMargemOrcamento('2.5');
    }

    recalcularOrcamento();
    mostrarToast("Simulador reiniciado.", "success");
}

function filtrarOrcamentosPorStatus(status) {
    window.PrismaState.filtroStatusOrcamento = status;
    document.querySelectorAll('[data-status-orc]').forEach(btn => {
        if (btn.getAttribute('data-status-orc') === status) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderizarTabelaOrcamentos();
}

function renderizarTabelaOrcamentos() {
    const tbody = document.getElementById('tabela-orcamentos');
    if (!tbody) return;

    const orcamentos = window.PrismaState.orcamentos || [];
    const filtro = window.PrismaState.filtroStatusOrcamento || 'todos';

    // Contadores
    const elTodos = document.getElementById('orc-cont-todos');
    const elPend = document.getElementById('orc-cont-pendentes');
    const elAprov = document.getElementById('orc-cont-aprovados');
    const elRecus = document.getElementById('orc-cont-recusados');

    if (elTodos) elTodos.textContent = orcamentos.length;
    if (elPend) elPend.textContent = orcamentos.filter(o => o.status === 'pendente').length;
    if (elAprov) elAprov.textContent = orcamentos.filter(o => o.status === 'aprovado').length;
    if (elRecus) elRecus.textContent = orcamentos.filter(o => o.status === 'recusado').length;

    let lista = orcamentos;
    if (filtro !== 'todos') {
        lista = orcamentos.filter(o => o.status === filtro);
    }

    lista.sort((a, b) => {
        const dataA = a.created_at?.seconds || 0;
        const dataB = b.created_at?.seconds || 0;
        return dataB - dataA;
    });

    if (lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
                    Nenhum orçamento encontrado nesta categoria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lista.map(o => {
        const dataStr = formatarDataTimestamp(o.created_at);
        const statusMap = {
            'pendente': { label: 'Em Aberto', cor: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
            'aprovado': { label: 'Aprovado', cor: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
            'recusado': { label: 'Recusado', cor: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' }
        };
        const st = statusMap[o.status] || statusMap.pendente;

        return `
            <tr>
                <td style="font-size: 0.8rem; color: var(--text-dim);">${dataStr}</td>
                <td>
                    <strong style="color: #ffffff; font-size: 0.9rem;">${escapeHtml(o.titulo)}</strong>
                    <div style="font-size: 0.74rem; color: var(--text-dim);">Prazo: ${escapeHtml(o.prazo_prometido || '-')}</div>
                </td>
                <td>
                    <div style="font-weight: 500; color: #cbd5e1;">${escapeHtml(o.cliente_nome || '-')}</div>
                    ${o.cliente_whatsapp ? `<span style="font-size: 0.74rem; color: #10b981;"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(o.cliente_whatsapp)}</span>` : ''}
                </td>
                <td>
                    <span style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(o.material_nome || '-')}</span>
                    <div style="font-size: 0.74rem; color: var(--text-dim);">${o.peso_gramas || 0}g · ${o.tempo_horas || 0}h</div>
                </td>
                <td style="color: #fca5a5; font-size: 0.88rem;">${formatarMoeda(o.custo_total)}</td>
                <td style="color: var(--primary); font-weight: 700; font-size: 0.95rem;">${formatarMoeda(o.preco_final)}</td>
                <td style="color: #10b981; font-weight: 600; font-size: 0.88rem;">${formatarMoeda(o.lucro_liquido)}</td>
                <td>
                    <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; color: ${st.cor}; background: ${st.bg};">
                        ${st.label}
                    </span>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button class="btn-icon" title="Carregar no Simulador" onclick="window.PrismaApp.carregarOrcamentoNaCalculadora('${o.id}')">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                        ${o.status === 'pendente' ? `
                            <button class="btn-icon" style="color: #10b981;" title="Aprovar e Criar Pedido" onclick="window.PrismaApp.converterOrcamentoEmPedido('${o.id}')">
                                <i class="fa-solid fa-check"></i>
                            </button>
                            <button class="btn-icon" style="color: #ef4444;" title="Marcar como Recusado" onclick="window.PrismaApp.alterarStatusOrcamento('${o.id}', 'recusado')">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        ` : ''}
                        <button class="btn-icon" style="color: #f87171;" title="Excluir" onclick="window.PrismaApp.excluirOrcamento('${o.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================================
// HELPERS, DROPDOWNS E FORMATAÇÃO
// ==========================================================================
function atualizarSelectsClientes() {
    const select = document.getElementById('pedido-cliente');
    if (!select) return;
    const atual = select.value;
    select.innerHTML = '<option value="">Selecione o cliente...</option>' + 
        window.PrismaState.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} (${escapeHtml(c.whatsapp || '')})</option>`).join('');
    if (atual) select.value = atual;
}

function atualizarSelectsMateriais() {
    const select = document.getElementById('pedido-material');
    if (!select) return;
    const atual = select.value;
    select.innerHTML = '<option value="">Selecione o material...</option>' + 
        window.PrismaState.insumos.map(m => {
            const custoGrama = (parseFloat(m.custo_bobina) || 0) / (parseFloat(m.peso_total_gramas) || 1000);
            return `<option value="${m.id}">${escapeHtml(m.tipo)} - ${escapeHtml(m.cor)} (${formatarMoeda(custoGrama)}/g)</option>`;
        }).join('');
    if (atual) select.value = atual;
}

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
}

function fecharSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}

function mostrarToast(mensagem, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `
        <i class="fa-solid fa-${tipo === 'success' ? 'check' : 'circle-exclamation'}"></i>
        <span>${escapeHtml(mensagem)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3500);
}

function calcularDiferencaDias(dataIso) {
    if (!dataIso) return 999;
    const partes = dataIso.split('-');
    if (partes.length !== 3) return 999;
    const target = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diffTime = target - hoje;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatarData(dataIso) {
    if (!dataIso) return '-';
    const partes = dataIso.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataIso;
}

function formatarMoeda(val) {
    const num = parseFloat(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarEtapa(status) {
    const map = {
        'orcamento': '1. Orçamento / STL',
        'fila': '2. Na Fila',
        'imprimindo': '3. Imprimindo',
        'pos': '4. Acabamento',
        'pronto': '5. Pronto / Envio',
        'entregue': '6. Concluído'
    };
    return map[status] || status;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

// Exporta funções para o escopo global `window.PrismaApp`
window.PrismaApp = {
    navegarPara,
    toggleSidebar,
    fecharModal,
    abrirModalNovoPedido,
    abrirModalEditarPedido,
    salvarPedido,
    excluirPedido,
    avancarProximaEtapa,
    filtrarKanban,
    setFiltroPrazo,
    atualizarCalculoCustoModal,
    abrirModalNovoCliente,
    abrirModalEditarCliente,
    salvarCliente,
    excluirCliente,
    filtrarClientes,
    buscarCep,
    abrirModalNovoInsumo,
    abrirModalEditarInsumo,
    salvarInsumo,
    excluirInsumo,
    calcularCustoGramaModal,
    calcularCustoPeca,
    quitarPagamento,
    abrirModalNovaNota,
    abrirModalEditarNota,
    salvarNota,
    excluirNota,
    toggleFixarNota,
    filtrarNotasPorCategoria,
    filtrarNotasPorBusca,
    abrirConfigOficina,
    salvarConfigOficina,
    selecionarClienteOrcamento,
    atualizarMargemOrcamento,
    recalcularOrcamento,
    copiarTextoProposta,
    enviarPropostaWhatsAppDireto,
    salvarOrcamento,
    converterOrcamentoEmPedido,
    alterarStatusOrcamento,
    excluirOrcamento,
    carregarOrcamentoNaCalculadora,
    limparCalculadoraOrcamento,
    filtrarOrcamentosPorStatus
};
