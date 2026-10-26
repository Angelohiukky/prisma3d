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
    filtroPrazo: 'todos',
    termoBuscaKanban: '',
    termoBuscaClientes: ''
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
    quitarPagamento
};
