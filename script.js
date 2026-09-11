/* =========================================
   1. INICIALIZAÇÃO E NUVEM (SUPABASE)
========================================= */
const supabaseUrl = 'https://ccvlaywiyvrixduvbccj.supabase.co';
const supabaseKey = 'sb_publishable_CB2fioqF__O8x_Vt4MBVsg_axk7Ui2J';
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

const CONFIG = { CODIGO_SOCIOS: 'B17021103', SESSION_KEY: 'betao_sess' };
let db = { socios: [], os: [], mecanicos: [], catalogo_pecas: [], catalogo_servicos: [] };
let session = null; let loginMode = 'login';
let stateOS = { editId: null, type: 'os', servicos: [], pecas: [], fotoBase64: null };

let faturamentoChartInstance = null; let ticketChartInstance = null;

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
function getTodayString() { const tzoffset = (new Date()).getTimezoneOffset() * 60000; return new Date(Date.now() - tzoffset).toISOString().split('T')[0]; }
function parseBRDateToISO(brDateStr) { if (!brDateStr) return ''; const parts = brDateStr.split('/'); if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; return brDateStr; }
function toast(msg, err = false) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.className = 'toast show ' + (err ? 'err' : ''); setTimeout(() => t.classList.remove('show'), 3000); }

const animateValue = (elementId, start, end, duration) => {
    const obj = document.getElementById(elementId);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = progress * (2 - progress);
        const currentVal = (easeOut * (end - start) + start);
        obj.textContent = fmt(currentVal);
        if (progress < 1) { window.requestAnimationFrame(step); }
    };
    window.requestAnimationFrame(step);
};

/* DOWNLOAD BLINDADO: UM ERRO NÃO DERRUBA O SISTEMA */
async function carregarDados() {
    if (!supabaseClient) return;
    // Carrega cada tabela isoladamente: um erro numa não derruba as outras.
    const tabelas = ['socios', 'mecanicos', 'os', 'catalogo_pecas', 'catalogo_servicos'];
    for (const t of tabelas) {
        try {
            const { data, error } = await supabaseClient.from(t).select('*');
            if (error) { console.error("Erro ao ler tabela '" + t + "':", error.message); continue; }
            if (data) db[t] = data;
        } catch (e) {
            console.error("Falha ao carregar tabela '" + t + "':", e);
        }
    }
    if (session) renderizarTelas();
}

function renderizarTelas() {
    if (session && session.role === 'socio') {
        try { renderDashboard(); } catch (e) { console.error(e); }
        try { renderOrcamentos(); } catch (e) { console.error(e); }
        try { renderOSKanban(); } catch (e) { console.error(e); }
        try { renderMecanicos(); } catch (e) { console.error(e); }
        try { renderRelatorios(); } catch (e) { console.error(e); }
        try { renderCatalogo(); } catch (e) { console.error(e); }
    } else if (session) {
        try { renderPainelMecanico(); } catch (e) { console.error(e); }
    }
}

if (supabaseClient) {
    supabaseClient.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'socios' }, () => carregarDados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'os' }, () => carregarDados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mecanicos' }, () => carregarDados())
        .subscribe();
}

/* =========================================
   3. AUTH E ACESSO
========================================= */
function switchTab(mode) {
    loginMode = mode; document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('form-login').classList.remove('hidden'); document.getElementById('form-register').classList.add('hidden');
    const labelEmail = document.getElementById('label-email'); const inputEmail = document.getElementById('l-email');
    if (mode === 'login') { document.getElementById('tab-login').classList.add('active'); document.getElementById('login-title').textContent = "Acesso Proprietário"; labelEmail.textContent = "E-mail do Sócio"; inputEmail.placeholder = "seu@email.com"; inputEmail.value = ""; }
    else if (mode === 'mecanico') { document.getElementById('tab-mec').classList.add('active'); document.getElementById('login-title').textContent = "Painel do Colaborador"; labelEmail.textContent = "Nome do Mecânico"; inputEmail.placeholder = "Ex: Patrik..."; inputEmail.value = ""; }
    else { document.getElementById('tab-reg').classList.add('active'); document.getElementById('form-login').classList.add('hidden'); document.getElementById('form-register').classList.remove('hidden'); }
}

async function doLogin() {
    const userInp = document.getElementById('l-email').value.trim(); const senhaInp = document.getElementById('l-senha').value; const lembrar = document.getElementById('l-lembrar').checked;
    if (loginMode === 'login') {
        const r1 = await supabaseClient.from('socios').select('*'); if (r1.error) { console.error("Supabase socios:", r1.error); return toast("Erro de conexão: " + r1.error.message, true); } db.socios = r1.data || [];
        const u = db.socios.find(s => (s.email.toLowerCase() === userInp.toLowerCase() || s.nome.toLowerCase() === userInp.toLowerCase()) && s.senha === senhaInp);
        if (!u) return toast("Sócio não encontrado ou senha incorreta!", true); session = { id: u.id, nome: u.nome, role: 'socio' };
    } else if (loginMode === 'mecanico') {
        const r2 = await supabaseClient.from('mecanicos').select('*'); if (r2.error) { console.error("Supabase mecanicos:", r2.error); return toast("Erro de conexão: " + r2.error.message, true); } db.mecanicos = r2.data || [];
        const m = db.mecanicos.find(m => m.nome.toLowerCase() === userInp.toLowerCase() && m.senha === senhaInp);
        if (!m) return toast("Mecânico não encontrado ou senha incorreta!", true); session = { id: m.id, nome: m.nome, role: 'mecanico' };
    }
    if (lembrar) localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session)); else sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
    initApp();
}

function doRegister() {
    const nome = document.getElementById('r-nome').value.trim(); const email = document.getElementById('r-email').value.trim();
    const codigo = document.getElementById('r-codigo').value.trim(); const senha = document.getElementById('r-senha').value; const confirma = document.getElementById('r-confirma').value;
    if (codigo !== CONFIG.CODIGO_SOCIOS) return toast("Código da empresa inválido!", true); if (senha !== confirma) return toast("As senhas não conferem!", true); if (!nome || !email) return toast("Preencha todos os campos!", true);
    supabaseClient.from('socios').insert([{ id: Date.now().toString(), nome, email, senha }]).then(async ({ error }) => {
        if (error) { console.error("Registro:", error); return toast("Erro ao registrar: " + error.message, true); } await carregarDados(); toast("Conta criada! Faça login."); switchTab('login');
    });
}

function initApp() {
    document.getElementById('auth-screen').style.display = 'none'; document.getElementById('app-container').style.display = 'flex';
    document.getElementById('sb-uname').textContent = session.nome; document.getElementById('sb-avatar').textContent = session.nome.substring(0, 2).toUpperCase();
    const nav = document.getElementById('main-nav');

    if (session.role === 'socio') {
        document.getElementById('sb-role-display').textContent = "Sócio Proprietário";
        nav.innerHTML = `
            <div class="mobile-actions-nav" style="display:none; flex-direction:column; gap:10px; padding: 0 1rem 1rem 1rem; border-bottom: 1px solid var(--border); margin-bottom: 1rem;">
                <button class="btn btn-primary" onclick="openDocModal('orcamento')" style="background:var(--blue); width: 100%;">+ Novo Orçamento</button>
                <button class="btn btn-primary" onclick="openDocModal('os')" style="width: 100%;">+ Nova OS</button>
            </div>
            <button class="nav-item active" data-page="dashboard">Dashboard BI</button><button class="nav-item" data-page="orcamentos">Orçamentos</button><button class="nav-item" data-page="os">Gestão Ágil (OS)</button><button class="nav-item" data-page="mecanicos">Equipe</button><button class="nav-item" data-page="catalogo">Catálogo</button><button class="nav-item" data-page="relatorios">Relatórios</button>`;

        document.getElementById('page-dashboard').classList.add('active'); document.getElementById('page-mec-dashboard').classList.remove('active');
        if (document.getElementById('desktop-actions-box')) document.getElementById('desktop-actions-box').style.display = 'flex';
        if (document.getElementById('btn-nova-os')) document.getElementById('btn-nova-os').style.display = 'block';
        if (document.getElementById('btn-novo-orcamento')) document.getElementById('btn-novo-orcamento').style.display = 'block';
    } else {
        document.getElementById('sb-role-display').textContent = "Colaborador";
        nav.innerHTML = `
            <div style="padding: 0 1rem 1rem 1rem; border-bottom: 1px solid var(--border); margin-bottom: 1rem;">
                <button class="btn btn-primary" onclick="openDocModal('orcamento')" style="background:var(--blue); width: 100%;">+ Solicitar Peças / Orçamento</button>
            </div>
            <button class="nav-item active" data-page="mec-dashboard">Meu Painel</button>`;

        document.getElementById('page-dashboard').classList.remove('active'); document.getElementById('page-mec-dashboard').classList.add('active');
        if (document.getElementById('desktop-actions-box')) document.getElementById('desktop-actions-box').style.display = 'none';
    }
    configurarCliquesNav(); renderizarTelas();
}

/* =========================================
   4. AUTOCOMPLETE DE PLACAS
========================================= */
function mostrarSugestoesPlaca(valor) {
    const input = valor.toUpperCase().trim(); const suggestionsBox = document.getElementById('placa-suggestions');
    if (!suggestionsBox) return;
    if (input.length < 2) { suggestionsBox.classList.add('hidden'); return; }

    // Na nova arquitetura, TUDO está na db.os
    const veiculosMap = new Map();
    db.os.sort((a, b) => Number(b.id) - Number(a.id)).forEach(doc => {
        if (doc.placa && doc.placa.trim() !== '') {
            const p = doc.placa.toUpperCase().trim();
            if (!veiculosMap.has(p)) veiculosMap.set(p, doc.cliente || 'Desconhecido');
        }
    });

    const matches = []; veiculosMap.forEach((cliente, placa) => { if (placa.includes(input)) matches.push({ placa, cliente }); });
    if (matches.length > 0) { suggestionsBox.innerHTML = matches.map(m => `<div class="autocomplete-item" onclick="selecionarPlaca('${m.placa}')"><strong>${m.placa}</strong><span class="autocomplete-client">${m.cliente}</span></div>`).join(''); suggestionsBox.classList.remove('hidden'); }
    else { suggestionsBox.classList.add('hidden'); }
}
function selecionarPlaca(placa) { document.getElementById('d-placa').value = placa; document.getElementById('placa-suggestions').classList.add('hidden'); buscarPlaca(placa); }
document.addEventListener('click', function (e) { const box = document.getElementById('placa-suggestions'); const inp = document.getElementById('d-placa'); if (box && !box.contains(e.target) && e.target !== inp) box.classList.add('hidden'); });

function buscarPlaca(placaInput) {
    if (!placaInput || placaInput.length < 7) return;
    const placa = placaInput.toUpperCase().trim(); document.getElementById('d-placa').value = placa;
    const match = db.os.sort((a, b) => Number(b.id) - Number(a.id)).find(doc => doc.placa && doc.placa.toUpperCase().trim() === placa);
    if (match) { ['cliente', 'veiculo', 'modelo', 'motor', 'km'].forEach(f => { const el = document.getElementById('d-' + f); if (el) el.value = match[f] || ''; }); toast("🚗 Dados recuperados!"); }
}

/* =========================================
   5. DASHBOARD BI E GRÁFICOS (BLINDADOS)
========================================= */
function filterDashboard() { renderDashboard(); } function filterToday() { const t = getTodayString(); document.getElementById('d-data-inicio').value = t; document.getElementById('d-data-fim').value = t; renderDashboard(); } function clearDashboardFilter() { document.getElementById('d-data-inicio').value = ''; document.getElementById('d-data-fim').value = ''; renderDashboard(); }
function getTrendHTML(currVal, prevVal) {
    if (prevVal === 0) return currVal > 0 ? `<span class="trend-up">↑ +100%</span>` : `<span class="trend-neutral">- 0%</span>`;
    const diff = ((currVal - prevVal) / prevVal) * 100;
    if (diff > 0) return `<span class="trend-up">↑ +${diff.toFixed(1)}%</span>`;
    if (diff < 0) return `<span class="trend-down">↓ ${Math.abs(diff).toFixed(1)}%</span>`;
    return `<span class="trend-neutral">- 0%</span>`;
}

function renderDashboard() {
    try {
        const dIni = document.getElementById('d-data-inicio') ? document.getElementById('d-data-inicio').value : '';
        const dFim = document.getElementById('d-data-fim') ? document.getElementById('d-data-fim').value : '';
        let curIni = dIni, curFim = dFim;
        if (!dIni && !dFim) { const now = new Date(); curIni = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; curFim = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]; }

        // Apenas OS finalizadas entram no balanço
        const currList = db.os.filter(o => { const iso = o.dataISO || parseBRDateToISO(o.data); return iso >= curIni && iso <= curFim && o.status === 'finalizada'; });

        const faturamentoTotal = currList.reduce((a, o) => a + (Number(o.total) || 0), 0);
        const lucroTotal = currList.reduce((a, o) => a + (Number(o.lucro) || 0), 0);
        const comissaoTotal = currList.reduce((a, o) => a + (Number(o.comissao) || 0), 0);
        const ticketMedio = currList.length > 0 ? (faturamentoTotal / currList.length) : 0;

        const d1 = new Date(curIni); const d2 = new Date(curFim); const diffTime = Math.abs(d2 - d1); const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const prevFimDate = new Date(d1); prevFimDate.setDate(prevFimDate.getDate() - 1); const prevFim = prevFimDate.toISOString().split('T')[0];
        const prevIniDate = new Date(prevFimDate); prevIniDate.setDate(prevIniDate.getDate() - diffDays + 1); const prevIni = prevIniDate.toISOString().split('T')[0];
        const prevList = db.os.filter(o => { const iso = o.dataISO || parseBRDateToISO(o.data); return iso >= prevIni && iso <= prevFim && o.status === 'finalizada'; });

        const pFat = prevList.reduce((a, o) => a + (Number(o.total) || 0), 0); const pLucro = prevList.reduce((a, o) => a + (Number(o.lucro) || 0), 0); const pCom = prevList.reduce((a, o) => a + (Number(o.comissao) || 0), 0); const pTicket = prevList.length > 0 ? (pFat / prevList.length) : 0;

        animateValue('d-fat', 0, faturamentoTotal, 1000); animateValue('d-lucro', 0, lucroTotal, 1000); animateValue('d-comissao', 0, comissaoTotal, 1000); animateValue('d-ticket', 0, ticketMedio, 1000);

        if (document.getElementById('d-fat-trend')) document.getElementById('d-fat-trend').innerHTML = getTrendHTML(faturamentoTotal, pFat);
        if (document.getElementById('d-lucro-trend')) document.getElementById('d-lucro-trend').innerHTML = getTrendHTML(lucroTotal, pLucro);
        if (document.getElementById('d-comissao-trend')) document.getElementById('d-comissao-trend').innerHTML = getTrendHTML(comissaoTotal, pCom);
        if (document.getElementById('d-ticket-trend')) document.getElementById('d-ticket-trend').innerHTML = getTrendHTML(ticketMedio, pTicket);

        if (document.getElementById('d-tbody')) {
            document.getElementById('d-tbody').innerHTML = currList.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 8).map(o => `<tr><td>#${o.id}</td><td>${o.veiculo}</td><td>${fmt(o.total)}</td><td>${getStatusBadge(o.status)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">Nenhuma OS finalizada no período.</td></tr>';
        }

        try {
            const dataByDate = {}; currList.forEach(o => { const date = o.data; if (!dataByDate[date]) dataByDate[date] = { fat: 0, custo: 0, comissao: 0, count: 0 }; dataByDate[date].fat += (Number(o.total) || 0); dataByDate[date].custo += (Number(o.custoPecas) || 0); dataByDate[date].comissao += (Number(o.comissao) || 0); dataByDate[date].count += 1; });
            const sortedDates = Object.keys(dataByDate).sort((a, b) => parseBRDateToISO(a).localeCompare(parseBRDateToISO(b)));
            const arrayFat = sortedDates.map(d => dataByDate[d].fat); const arrayCusto = sortedDates.map(d => dataByDate[d].custo); const arrayComissao = sortedDates.map(d => dataByDate[d].comissao); const arrayTicket = sortedDates.map(d => dataByDate[d].fat / dataByDate[d].count);

            renderFaturamentoChart(sortedDates, arrayFat, arrayCusto, arrayComissao); renderTicketChart(sortedDates, arrayTicket);
        } catch (err) { console.log("Gráficos ignorados."); }
    } catch (err) {
        console.error("Erro renderDashboard:", err);
    }
}

function renderFaturamentoChart(labels, fat, custo, comissao) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('faturamentoChart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (faturamentoChartInstance) faturamentoChartInstance.destroy();
    faturamentoChartInstance = new Chart(ctx, { type: 'line', data: { labels: labels.length ? labels : ['Sem Dados'], datasets: [{ type: 'line', label: 'Faturamento', data: fat.length ? fat : [0], borderColor: '#e8a020', backgroundColor: 'rgba(232, 160, 32, 0.1)', borderWidth: 3, fill: true, tension: 0.4 }, { type: 'bar', label: 'Custos', data: custo.length ? custo : [0], backgroundColor: 'rgba(239, 68, 68, 0.7)' }, { type: 'bar', label: 'Comissões', data: comissao.length ? comissao : [0], backgroundColor: 'rgba(168, 85, 247, 0.7)' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.raw) } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#999', callback: v => v >= 1000 ? 'R$ ' + (v / 1000).toFixed(1) + 'k' : 'R$ ' + v } }, x: { grid: { display: false }, ticks: { color: '#999' } } } } });
}

function renderTicketChart(labels, ticket) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('ticketChart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ticketChartInstance) ticketChartInstance.destroy();
    ticketChartInstance = new Chart(ctx, { type: 'line', data: { labels: labels.length ? labels : ['Sem Dados'], datasets: [{ label: 'Ticket Médio', data: ticket.length ? ticket : [0], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 3, fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#999' } }, x: { grid: { display: false } } } } });
}

/* =========================================
   6. ORÇAMENTOS E KANBAN DE OS
========================================= */
function getStatusBadge(s) {
    if (!s) s = 'aberta';
    const upper = s.toUpperCase();
    if (s === 'finalizada') return `<span style="color:var(--success); font-weight:bold; background:rgba(34,197,94,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🟢 ${upper}</span>`;
    if (s === 'em_andamento') return `<span style="color:var(--gold); font-weight:bold; background:rgba(232,160,32,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🟡 ${upper}</span>`;
    if (s === 'orcamento') return `<span style="color:var(--gold); font-weight:bold; background:rgba(232,160,32,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🟡 ORÇAMENTO PENDENTE</span>`;
    if (s === 'rejeitado') return `<span style="color:var(--danger); font-weight:bold; background:rgba(239,68,68,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🔴 ${upper}</span>`;
    return `<span style="color:var(--blue); font-weight:bold; background:rgba(59,130,246,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🔵 ${upper}</span>`;
}

function renderOrcamentos() {
    const el = document.getElementById('orc-tbody'); if (!el) return;
    // O Orçamento agora mora dentro da tabela OS
    const orcs = db.os.filter(o => o.status === 'orcamento' || o.status === 'rejeitado');
    el.innerHTML = orcs.sort((a, b) => Number(b.id) - Number(a.id)).map(o => `<tr><td>#${o.id}</td><td>${o.data}</td><td>${o.veiculo}</td><td>${o.cliente}</td><td>${fmt(o.total)}</td><td>${getStatusBadge(o.status)}</td><td><button class="btn btn-secondary btn-sm" onclick="openDocModal('orcamento','${o.id}')">✏️ Abrir</button></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhum Orçamento.</td></tr>';
}

function renderOSKanban() {
    const cardsAberta = document.getElementById('cards-aberta'); if (!cardsAberta) return;

    // Apenas OS reais entram aqui
    const abertas = db.os.filter(o => o.status === 'aberta').sort((a, b) => Number(b.id) - Number(a.id));
    const andamento = db.os.filter(o => o.status === 'em_andamento').sort((a, b) => Number(b.id) - Number(a.id));
    const finalizadas = db.os.filter(o => o.status === 'finalizada').sort((a, b) => Number(b.id) - Number(a.id));

    if (document.getElementById('count-aberta')) document.getElementById('count-aberta').textContent = abertas.length;
    if (document.getElementById('count-andamento')) document.getElementById('count-andamento').textContent = andamento.length;
    if (document.getElementById('count-finalizada')) document.getElementById('count-finalizada').textContent = finalizadas.length;

    const buildCard = (o) => `
        <div class="kanban-card" id="kcard-${o.id}" draggable="true" ondragstart="drag(event)">
            <div class="kc-header"><span class="kc-id">#${o.id}</span><span class="kc-val">${fmt(o.total)}</span></div>
            <div class="kc-veiculo">${o.veiculo}</div>
            <div class="kc-cliente">👤 ${o.cliente || 'Sem Nome'} | 🚗 ${o.placa || 'Sem Placa'}</div>
            <div class="kc-footer"><span class="kc-date">${o.data}</span><button class="btn btn-secondary btn-sm" onclick="openDocModal('os','${o.id}')">✏️ Abrir</button></div>
        </div>
    `;
    cardsAberta.innerHTML = abertas.map(buildCard).join('');
    if (document.getElementById('cards-andamento')) document.getElementById('cards-andamento').innerHTML = andamento.map(buildCard).join('');
    if (document.getElementById('cards-finalizada')) document.getElementById('cards-finalizada').innerHTML = finalizadas.map(buildCard).join('');
}

function drag(ev) { ev.dataTransfer.setData("text", ev.target.id); }
function allowDrop(ev) { ev.preventDefault(); }
async function drop(ev) {
    ev.preventDefault();
    const data = ev.dataTransfer.getData("text");
    const cardElement = document.getElementById(data);
    const targetColumn = ev.target.closest('.kanban-column');
    if (cardElement && targetColumn) {
        targetColumn.querySelector('.kanban-cards').appendChild(cardElement);
        const newStatus = targetColumn.getAttribute('data-status');
        const osId = data.replace('kcard-', '');
        const osIndex = db.os.findIndex(o => o.id == osId);
        if (osIndex !== -1) {
            db.os[osIndex].status = newStatus;
            renderOSKanban();
            const { error } = await supabaseClient.from('os').update({ status: newStatus }).eq('id', osId);
            if (error) toast("Erro ao atualizar status", true); else toast("Status atualizado!");
        }
    }
}

/* =========================================
   7. MODAIS E SALVAMENTO GERAL (BLINDADO)
========================================= */
function openDocModal(type, editId = null) {
    stateOS.type = type; stateOS.editId = editId;
    if (document.getElementById('mdoc-title')) document.getElementById('mdoc-title').textContent = type === 'os' ? 'Ordem de Serviço' : 'Orçamento';

    if (document.getElementById('btn-convert-os')) {
        document.getElementById('btn-convert-os').style.display = (type === 'orcamento' && editId && session.role === 'socio') ? 'block' : 'none';
    }
    if (document.getElementById('btn-print-doc')) document.getElementById('btn-print-doc').style.display = editId ? 'block' : 'none';

    const statusSelect = document.getElementById('d-status');
    if (statusSelect) {
        if (type === 'os') statusSelect.innerHTML = `<option value="aberta">🔵 Aberta</option><option value="em_andamento">🟡 Andamento</option><option value="finalizada">🟢 Finalizada</option>`;
        else statusSelect.innerHTML = `<option value="orcamento">🟡 Pendente (Orçamento)</option><option value="rejeitado">🔴 Rejeitado</option>`;
    }

    if (editId) {
        const doc = db.os.find(x => x.id == editId);
        ['cliente', 'veiculo', 'modelo', 'placa', 'km', 'motor', 'status'].forEach(f => { const el = document.getElementById('d-' + f); if (el) el.value = doc[f] || ''; });
        stateOS.servicos = JSON.parse(JSON.stringify(doc.servicos || [])); stateOS.pecas = JSON.parse(JSON.stringify(doc.pecas || []));
    } else {
        ['cliente', 'veiculo', 'modelo', 'placa', 'km', 'motor'].forEach(f => { const el = document.getElementById('d-' + f); if (el) el.value = ''; });
        if (statusSelect) statusSelect.value = type === 'os' ? 'aberta' : 'orcamento';
        stateOS.servicos = []; stateOS.pecas = []; stateOS.fotoBase64 = null;
        if (document.getElementById('d-foto-preview')) document.getElementById('d-foto-preview').style.display = 'none';
    }
    renderChecklistServicos(); renderChecklistPecas(); updateTotals();
    if (document.getElementById('modal-doc')) document.getElementById('modal-doc').style.display = 'flex';
}

function renderChecklistServicos() { const el = document.getElementById('checklist-servicos'); if (!el) return; el.innerHTML = db.catalogo_servicos.map(cs => { const ativo = stateOS.servicos.find(s => s.catalogoId === cs.id); return `<button type="button" class="checklist-btn ${ativo ? 'checklist-btn-active' : ''}" onclick="toggleServico('${cs.id}', '${cs.nome.replace(/'/g, "\\'")}')"><span class="check-icon">${ativo ? '✓' : '+'}</span>${cs.nome}</button>`; }).join(''); renderServicosAtivos(); }
function toggleServico(catalogoId, nome) { const idx = stateOS.servicos.findIndex(s => s.catalogoId === catalogoId); if (idx >= 0) stateOS.servicos.splice(idx, 1); else stateOS.servicos.push({ id: Date.now().toString(), catalogoId, descricao: nome.toUpperCase(), mecanicoId: (session.role === 'mecanico' ? session.id : ''), qtd: 1, valor: 0 }); renderChecklistServicos(); updateTotals(); }
function renderServicosAtivos() { const el = document.getElementById('servicos-ativos'); if (!el) return; el.innerHTML = stateOS.servicos.length ? `<div class="ativo-header-row"><span>Serviço</span><span>Mecânico</span><span>Qtd</span><span>R$ Unit.</span><span></span></div>` + stateOS.servicos.map(s => `<div class="ativo-row"><span class="ativo-nome">${s.descricao}</span><select onchange="updS('${s.id}','mecanicoId',this.value)"><option value="">Loja</option>${db.mecanicos.map(m => `<option value="${m.id}" ${s.mecanicoId == m.id ? 'selected' : ''}>${m.nome}</option>`).join('')}</select><input type="number" value="${s.qtd}" oninput="updS('${s.id}','qtd',this.value)"><input type="number" value="${s.valor}" oninput="updS('${s.id}','valor',this.value)"><button class="btn btn-danger btn-sm" onclick="removeServico('${s.id}')">✕</button></div>`).join('') : '<p style="color:var(--text-dim); font-size:12px;">Vazio</p>'; }
function removeServico(id) { stateOS.servicos = stateOS.servicos.filter(s => s.id !== id); renderChecklistServicos(); updateTotals(); }

function renderChecklistPecas() { const el = document.getElementById('checklist-pecas'); if (!el) return; el.innerHTML = db.catalogo_pecas.map(cp => { const ativa = stateOS.pecas.find(p => p.catalogoId === cp.id); return `<button type="button" class="checklist-btn ${ativa ? 'checklist-btn-active' : ''}" onclick="togglePeca('${cp.id}', '${cp.nome.replace(/'/g, "\\'")}')"><span class="check-icon">${ativa ? '✓' : '+'}</span>${cp.nome}</button>`; }).join(''); renderPecasAtivas(); }
function togglePeca(catalogoId, nome) { const idx = stateOS.pecas.findIndex(p => p.catalogoId === catalogoId); if (idx >= 0) stateOS.pecas.splice(idx, 1); else stateOS.pecas.push({ id: Date.now().toString(), catalogoId, nome: nome.toUpperCase(), qtd: 1, custo: 0, venda: 0 }); renderChecklistPecas(); updateTotals(); }
function renderPecasAtivas() { const el = document.getElementById('pecas-ativas'); if (!el) return; el.innerHTML = stateOS.pecas.length ? `<div class="ativo-header-row" style="grid-template-columns: 2fr 0.6fr 1fr 1fr auto;"><span>Peça</span><span>Qtd</span><span>Custo</span><span>Venda</span><span></span></div>` + stateOS.pecas.map(p => `<div class="ativo-row" style="grid-template-columns: 2fr 0.6fr 1fr 1fr auto;"><span class="ativo-nome">${p.nome}</span><input type="number" value="${p.qtd}" oninput="updP('${p.id}','qtd',this.value)"><input type="number" value="${p.custo}" oninput="updP('${p.id}','custo',this.value)"><input type="number" value="${p.venda}" oninput="updP('${p.id}','venda',this.value)"><button class="btn btn-danger btn-sm" onclick="removePeca('${p.id}')">✕</button></div>`).join('') : '<p style="color:var(--text-dim); font-size:12px;">Vazio</p>'; }
function removePeca(id) { stateOS.pecas = stateOS.pecas.filter(p => p.id !== id); renderChecklistPecas(); updateTotals(); }

function updS(id, f, v) { const s = stateOS.servicos.find(x => x.id == id); if (s) s[f] = (f === 'valor' || f === 'qtd') ? Number(v) : v; updateTotals(); }
function updP(id, f, v) { const p = stateOS.pecas.find(x => x.id == id); if (p) p[f] = (f === 'nome') ? v.toUpperCase() : Number(v); updateTotals(); }
function updateTotals() { const mo = stateOS.servicos.reduce((a, s) => a + (Number(s.valor) * Number(s.qtd)), 0); const pe = stateOS.pecas.reduce((a, p) => a + (Number(p.venda) * Number(p.qtd)), 0); if (document.getElementById('res-total')) document.getElementById('res-total').textContent = fmt(mo + pe); if (document.getElementById('sub-mo')) document.getElementById('sub-mo').textContent = fmt(mo); if (document.getElementById('sub-pecas')) document.getElementById('sub-pecas').textContent = fmt(pe); }

async function saveDoc() {
    try {
        let tMO = 0, tCom = 0; stateOS.servicos.forEach(s => { const v = Number(s.valor) * Number(s.qtd); tMO += v; const m = db.mecanicos.find(x => x.id == s.mecanicoId); s.mecanicoNome = m ? m.nome : ''; s.comissaoVal = m ? (v * Number(m.comissao) / 100) : 0; tCom += s.comissaoVal; });
        const cP = stateOS.pecas.reduce((a, p) => a + (Number(p.custo) * Number(p.qtd)), 0); const rP = stateOS.pecas.reduce((a, p) => a + (Number(p.venda) * Number(p.qtd)), 0); const tot = tMO + rP;

        let id = stateOS.editId;
        if (!id) {
            let maxId = 0;
            if (db.os.length > 0) maxId = Math.max(...db.os.map(o => Number(o.id) || 0));
            id = (maxId + 1).toString(); // Gera ID Sequencial a prova de falhas
        }

        let docRef = db.os.find(o => o.id == id);
        let dataRegistro = new Date().toLocaleDateString('pt-BR');
        let dataISORegistro = new Date().toISOString().split('T')[0];

        if (stateOS.editId && docRef) {
            dataRegistro = docRef.data || dataRegistro;
            dataISORegistro = docRef.dataISO || dataISORegistro;
        }

        const statusDoc = document.getElementById('d-status') ? document.getElementById('d-status').value : (stateOS.type === 'os' ? 'aberta' : 'orcamento');

        // Formatação final Caixa Alta antes de ir pro banco
        const clienteU = document.getElementById('d-cliente').value.trim().toUpperCase();
        const veiculoU = document.getElementById('d-veiculo').value.trim().toUpperCase();
        const modeloU = document.getElementById('d-modelo').value.trim().toUpperCase();
        const placaU = document.getElementById('d-placa').value.trim().toUpperCase();
        const motorU = document.getElementById('d-motor').value.trim().toUpperCase();

        stateOS.servicos.forEach(s => s.descricao = s.descricao.toUpperCase());
        stateOS.pecas.forEach(p => p.nome = p.nome.toUpperCase());

        const data = { id, cliente: clienteU, veiculo: veiculoU, modelo: modeloU, placa: placaU, km: document.getElementById('d-km').value, motor: motorU, status: statusDoc, servicos: stateOS.servicos, pecas: stateOS.pecas, maoObra: tMO, custoPecas: cP, receitaPecas: rP, total: tot, lucro: tot - tCom - cP, comissao: tCom, data: dataRegistro, dataISO: dataISORegistro };

        // TUDO VAI PARA A TABELA OS AGORA
        const { error } = await supabaseClient.from('os').upsert([data]);
        if (error) { console.error("Erro banco:", error); return toast("Erro no banco. ID fora de alcance.", true); }

        if (document.getElementById('modal-doc')) document.getElementById('modal-doc').style.display = 'none';
        await carregarDados();
        toast(stateOS.type === 'os' ? "OS Gravada!" : "Orçamento Salvo!");
    } catch (e) {
        console.error("Erro ao salvar:", e); toast("Erro interno ao salvar.", true);
    }
}

async function convertOrcamentoToOS() {
    if (!confirm("Aprovar Orçamento e gerar uma OS?")) return;
    try {
        const { error } = await supabaseClient.from('os').update({ status: 'aberta' }).eq('id', stateOS.editId);
        if (error) { console.error(error); return toast("Erro no banco", true); }
        if (document.getElementById('modal-doc')) document.getElementById('modal-doc').style.display = 'none';
        await carregarDados(); toast("OS Gerada com Sucesso!");
    } catch (e) { console.error(e); toast("Erro ao converter.", true); }
}

function generatePDF() {
    const doc = db.os.find(x => x.id == stateOS.editId); if (!doc) return;
    if (document.getElementById('print-type')) document.getElementById('print-type').textContent = stateOS.type === 'os' ? 'Ordem de Serviço' : 'Orçamento';
    if (document.getElementById('print-id')) document.getElementById('print-id').textContent = doc.id; if (document.getElementById('print-date')) document.getElementById('print-date').textContent = doc.data; if (document.getElementById('print-status')) document.getElementById('print-status').textContent = doc.status.toUpperCase();
    ['cliente', 'veiculo', 'modelo', 'placa', 'km', 'motor'].forEach(f => { const el = document.getElementById('print-' + f); if (el) el.textContent = doc[f] || 'Não informado'; });
    if (document.getElementById('print-servicos')) document.getElementById('print-servicos').innerHTML = doc.servicos.map(s => `<tr><td>${s.descricao}</td><td>${s.qtd}</td><td>${fmt(s.valor)}</td><td>${fmt(s.valor * s.qtd)}</td></tr>`).join('');
    if (document.getElementById('print-pecas')) document.getElementById('print-pecas').innerHTML = doc.pecas.map(p => `<tr><td>${p.nome}</td><td>${p.qtd}</td><td>${fmt(p.venda)}</td><td>${fmt(p.venda * p.qtd)}</td></tr>`).join('');
    if (document.getElementById('print-sub-mo')) document.getElementById('print-sub-mo').textContent = fmt(doc.maoObra); if (document.getElementById('print-sub-pe')) document.getElementById('print-sub-pe').textContent = fmt(doc.receitaPecas); if (document.getElementById('print-total')) document.getElementById('print-total').textContent = fmt(doc.total);
    window.print();
}

/* =========================================
   8. OUTRAS PÁGINAS E EXTRAS
========================================= */
function renderPainelMecanico() {
    const dIni = document.getElementById('m-data-inicio') ? document.getElementById('m-data-inicio').value : ''; const dFim = document.getElementById('m-data-fim') ? document.getElementById('m-data-fim').value : ''; let totalMO = 0, totalComissao = 0, qtd = 0; const html = []; db.os.filter(o => o.status === 'finalizada').forEach(o => { const iso = o.dataISO || parseBRDateToISO(o.data); if ((!dIni || iso >= dIni) && (!dFim || iso <= dFim)) { o.servicos.forEach(s => { if (s.mecanicoId == session.id) { totalMO += (Number(s.valor) * Number(s.qtd)); totalComissao += (Number(s.comissaoVal) || 0); qtd++; html.push(`<tr><td>${o.data}</td><td>${o.veiculo}</td><td>${s.descricao}</td><td style="color:var(--success); font-weight:bold;">${fmt(s.comissaoVal)}</td></tr>`); } }); } }); const elCom = document.getElementById('mec-total-comissao'); if (elCom) elCom.textContent = fmt(totalComissao); const elMo = document.getElementById('mec-total-mo'); if (elMo) elMo.textContent = fmt(totalMO); const elQtd = document.getElementById('mec-qtd-trabalhos'); if (elQtd) elQtd.textContent = qtd; const elBody = document.getElementById('mec-tbody'); if (elBody) elBody.innerHTML = html.join('') || '<tr><td colspan="4" style="text-align:center;">Nenhum serviço.</td></tr>';

    // Lista os orçamentos que este mecânico solicitou
    const orcHtml = [];
    db.os.filter(o => o.status === 'orcamento' || o.status === 'rejeitado').forEach(o => {
        const isMine = o.servicos.some(s => s.mecanicoId == session.id);
        if (isMine) { orcHtml.push(`<tr><td>${o.data}</td><td>${o.veiculo} / ${o.placa}</td><td>${getStatusBadge(o.status)}</td></tr>`); }
    });
    const elOrc = document.getElementById('mec-orc-tbody');
    if (elOrc) elOrc.innerHTML = orcHtml.join('') || '<tr><td colspan="3" style="text-align:center;">Nenhuma solicitação.</td></tr>';
}

let mecEditId = null; function openMecModal(editId = null) { mecEditId = editId; if (editId) { const m = db.mecanicos.find(x => x.id === editId); document.getElementById('m-nome').value = m.nome; document.getElementById('m-com').value = m.comissao; document.getElementById('m-senha').value = m.senha; document.getElementById('modal-mec-title').textContent = 'Editar Mecânico'; } else { document.getElementById('m-nome').value = ''; document.getElementById('m-com').value = ''; document.getElementById('m-senha').value = ''; document.getElementById('modal-mec-title').textContent = 'Cadastrar Mecânico'; } document.getElementById('mec-senha-visible').style.display = 'none'; document.getElementById('m-senha').type = 'password'; document.getElementById('modal-mec').style.display = 'flex'; } async function saveMec() { const nome = document.getElementById('m-nome').value.trim(); const senha = document.getElementById('m-senha').value.trim(); if (!nome || !senha) return toast("Obrigatório!", true); await supabaseClient.from('mecanicos').upsert([{ id: mecEditId || Date.now().toString(), nome, comissao: Number(document.getElementById('m-com').value), senha }]); document.getElementById('modal-mec').style.display = 'none'; mecEditId = null; await carregarDados(); toast("Salvo!"); } async function deleteMec(id) { if (confirm("Remover?")) { await supabaseClient.from('mecanicos').delete().eq('id', id); await carregarDados(); toast("Removido!"); } } function toggleSenhaMec(id) { const m = db.mecanicos.find(x => x.id === id); const el = document.getElementById(`senha-${id}`); if (el.textContent === '••••••••') { el.textContent = m.senha; el.style.color = 'var(--brand)'; } else { el.textContent = '••••••••'; el.style.color = 'var(--text-dim)'; } } function renderMecanicos() { const el = document.getElementById('mec-grid'); if (!el) return; el.innerHTML = db.mecanicos.map(m => `<div class="stat-card"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><h3 style="font-size:1rem;">${m.nome}</h3><button class="btn btn-secondary btn-sm" onclick="openMecModal('${m.id}')">✏️</button></div><div class="label" style="margin-top:12px;">Comissão Ativa</div><div class="value" style="color:var(--brand); font-size:1.4rem;">${m.comissao}%</div><div class="label" style="margin-top:12px;">Senha</div><div style="display:flex; align-items:center; gap:8px; margin-top:6px;"><span id="senha-${m.id}" style="font-size:14px; font-weight:700; color:var(--text-dim); letter-spacing:2px;">••••••••</span><button class="btn btn-ghost btn-sm" onclick="toggleSenhaMec('${m.id}')">👁</button></div><button class="btn btn-danger btn-sm" style="width:100%; margin-top:15px;" onclick="deleteMec('${m.id}')">✕ Remover</button></div>`).join('') || '<p style="text-align:center; color:var(--text-dim); width:100%;">Vazio</p>'; }
function renderCatalogo() { const elP = document.getElementById('catalog-pecas-list'); if (elP) elP.innerHTML = db.catalogo_pecas.map(p => `<div class="catalog-item"><div class="catalog-item-info"><strong>${p.nome}</strong><span class="catalog-badge badge-peca">Peça</span></div><button class="btn btn-danger btn-sm" onclick="deleteCatalogItem('pecas', '${p.id}')">✕</button></div>`).join('') || '<p class="catalog-empty">Vazio</p>'; const elS = document.getElementById('catalog-servicos-list'); if (elS) elS.innerHTML = db.catalogo_servicos.map(s => `<div class="catalog-item"><div class="catalog-item-info"><strong>${s.nome}</strong><span class="catalog-badge badge-servico">Serviço</span></div><button class="btn btn-danger btn-sm" onclick="deleteCatalogItem('servicos', '${s.id}')">✕</button></div>`).join('') || '<p class="catalog-empty">Vazio</p>'; } async function addCatalogItem(type) { const inp = document.getElementById(type === 'pecas' ? 'cat-peca-nome' : 'cat-servico-nome'); const nome = inp.value.trim().toUpperCase(); if (!nome) return; await supabaseClient.from(type === 'pecas' ? 'catalogo_pecas' : 'catalogo_servicos').insert([{ id: Date.now().toString(), nome }]); inp.value = ''; await carregarDados(); toast("Adicionado!"); } async function deleteCatalogItem(type, id) { await supabaseClient.from(type === 'pecas' ? 'catalogo_pecas' : 'catalogo_servicos').delete().eq('id', id); await carregarDados(); toast("Removido!"); }
function filterRelatorios() { renderRelatorios(); } function filterRelatoriosToday() { const t = getTodayString(); document.getElementById('r-data-inicio').value = t; document.getElementById('r-data-fim').value = t; renderRelatorios(); } function clearRelatoriosFilter() { document.getElementById('r-data-inicio').value = ''; document.getElementById('r-data-fim').value = ''; renderRelatorios(); } function renderRelatorios() { const el = document.getElementById('r-mec-body'); if (!el) return; const dIni = document.getElementById('r-data-inicio').value; const dFim = document.getElementById('r-data-fim').value; const rank = db.mecanicos.map(m => { let mo = 0, com = 0; db.os.filter(o => o.status === 'finalizada').forEach(o => { const iso = o.dataISO || parseBRDateToISO(o.data); if ((!dIni || iso >= dIni) && (!dFim || iso <= dFim)) { o.servicos.forEach(s => { if (s.mecanicoId == m.id) { mo += (Number(s.valor) * Number(s.qtd)); com += (Number(s.comissaoVal) || 0); } }); } }); return { nome: m.nome, mo, com }; }).sort((a, b) => b.mo - a.mo); el.innerHTML = rank.map(m => `<tr><td>${m.nome}</td><td>${fmt(m.mo)}</td><td style="color:var(--brand)">${fmt(m.com)}</td></tr>`).join(''); }
function handlePhotoUpload(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.readAsDataURL(f); r.onload = (ev) => { const img = new Image(); img.src = ev.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const MAX = 600; const scale = MAX / img.width; canvas.width = MAX; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); const prev = document.getElementById('d-foto-preview'); if (prev) { prev.src = canvas.toDataURL('image/jpeg', 0.6); prev.style.display = 'block'; } } }; }

function configurarCliquesNav() {
    document.querySelectorAll('.nav-item, .mobile-actions-nav .btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = btn.getAttribute('data-page');
            if (!p) return;

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));

            if (btn.classList.contains('nav-item')) btn.classList.add('active');

            const pageEl = document.getElementById(`page-${p}`);
            if (pageEl) pageEl.classList.add('active');

            const mainNav = document.getElementById('main-nav');
            if (mainNav) mainNav.classList.remove('open');

            const overlay = document.getElementById('mobile-menu-overlay');
            if (overlay) overlay.style.display = 'none';
        });
    });
}

function doLogout() { localStorage.clear(); sessionStorage.clear(); location.reload(); }
function toggleMenu() { const nav = document.getElementById('main-nav'); if (!nav) return; nav.classList.toggle('open'); const overlay = document.getElementById('mobile-menu-overlay'); if (overlay) overlay.style.display = nav.classList.contains('open') ? 'block' : 'none'; }
function togglePwd(id, btn) { const i = document.getElementById(id); i.type = i.type === 'password' ? 'text' : 'password'; btn.textContent = i.type === 'password' ? '👁' : '🙈'; }

document.addEventListener('DOMContentLoaded', () => {
    carregarDados();
    const s = localStorage.getItem(CONFIG.SESSION_KEY) || sessionStorage.getItem(CONFIG.SESSION_KEY);
    if (s) { session = JSON.parse(s); initApp(); }
});