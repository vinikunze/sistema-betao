/* =========================================
   1. INICIALIZAÇÃO E NUVEM (SUPABASE)
========================================= */
const supabaseUrl = 'https://ccvlaywiyvrixduvbccj.supabase.co';
/* Chave anon clássica (JWT). A chave nova, formato sb_publishable_, é a
   recomendada pelo Supabase, mas com ela o app falhava no celular e no tablet
   com erro genérico de rede — o sintoma de uma recusa que acontece antes dos
   cabeçalhos de CORS. Outro app no mesmo projeto, usado nestes aparelhos,
   funciona com esta chave. Voltando para o que é comprovado. */
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjdmxheXdpeXZyaXhkdXZiY2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MDYwNjYsImV4cCI6MjEwMzE4MjA2Nn0.-w74-5PkzuTbxMbQejDbaXmcLuQ_P4S_w8j_YXqVrRQ';
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

/* Marca de versão: o teste de conexão mostra isso na tela, então dá pra saber
   na hora se o aparelho está com o código atual ou com uma cópia velha em cache. */
const APP_VERSION = '2026-09-16.3-pdf-completo';

const CONFIG = { SESSION_KEY: 'betao_sess' };   // o código da empresa agora vive no banco

/* DOIS EIXOS INDEPENDENTES
   status    = onde o serviço está (orçamento → aberta → andamento → finalizada → entregue)
   pagamento = se o dinheiro entrou (não pago / parcial / pago)
   Uma OS pode estar ENTREGUE e NÃO PAGA: é a venda na carteira. Por isso são
   campos separados — juntar os dois num só perderia justamente essa combinação.

   Concluída é o que conta como produzido: finalizada OU entregue. Antes o
   código olhava só 'finalizada', então marcar como entregue apagaria a OS do
   faturamento e da comissão do mecânico. */
const STATUS_CONCLUIDOS = ['finalizada', 'entregue'];
const osConcluida = (o) => STATUS_CONCLUIDOS.indexOf(o && o.status) >= 0;

const SITUACOES_PAGAMENTO = [
    { id: 'nao_pago', nome: 'Não pago', bolinha: '🔴' },
    { id: 'parcial', nome: 'Falta acertar', bolinha: '🟡' },
    { id: 'pago', nome: 'Pago', bolinha: '🟢' },
];

const FORMAS_PAGAMENTO = [
    { id: '', nome: '—' },
    { id: 'pix', nome: 'Pix' },
    { id: 'dinheiro', nome: 'Dinheiro' },
    { id: 'debito', nome: 'Cartão de débito' },
    { id: 'credito', nome: 'Cartão de crédito' },
    { id: 'transferencia', nome: 'Transferência' },
    { id: 'carteira', nome: 'Na carteira (fiado)' },
];

/* Sem forma escolhida devolve vazio, não o traço: o "—" existe só como rótulo
   da opção em branco no select, e vazava para a etiqueta como "PAGO · —". */
const nomeForma = (id) => (id ? (FORMAS_PAGAMENTO.find(f => f.id === id) || {}).nome || '' : '');
const nomeSituacao = (id) => (SITUACOES_PAGAMENTO.find(x => x.id === id) || SITUACOES_PAGAMENTO[0]);

/* O que falta receber de uma OS. Nunca negativo: se alguém digitar valor pago
   maior que o total, o certo é mostrar zero a receber, não crédito. */
const aReceberDaOS = (o) => Math.max(0, (Number(o.total) || 0) - (Number(o.valor_pago) || 0));

/* Só conta na carteira o que já foi produzido e ainda não foi quitado. */
const osNaCarteira = (o) => osConcluida(o) && o.pagamento !== 'pago' && aReceberDaOS(o) > 0;
let db = { os: [], mecanicos: [], clientes: [], veiculos: [], catalogo_pecas: [], catalogo_servicos: [] };
let session = null; let loginMode = 'login';
let stateOS = { editId: null, type: 'os', servicos: [], pecas: [], checklist: null, fotos: [] };

let faturamentoChartInstance = null; let ticketChartInstance = null;

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
function getTodayString() { const tzoffset = (new Date()).getTimezoneOffset() * 60000; return new Date(Date.now() - tzoffset).toISOString().split('T')[0]; }
function parseBRDateToISO(brDateStr) { if (!brDateStr) return ''; const parts = brDateStr.split('/'); if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; return brDateStr; }
function toast(msg, err = false) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.className = 'toast show ' + (err ? 'err' : ''); setTimeout(() => t.classList.remove('show'), 3000); }

/* Falha de rede não diz nada sobre o banco: diz que o navegador nem chegou lá.
   Mostrar o endereço tentado transforma um "Load failed" genérico em algo que
   se resolve — dá pra ver na hora se o site está apontando pro projeto certo. */
function mensagemErro(err) {
    const txt = String((err && err.message) || err || 'erro desconhecido');
    if (/load failed|failed to fetch|networkerror|network request failed/i.test(txt)) {
        let host = supabaseUrl;
        try { host = new URL(supabaseUrl).host; } catch (e) { }
        return 'Sem resposta de ' + host + '. Verifique a internet do aparelho.';
    }
    return txt;
}

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
    const tabelas = ['mecanicos', 'os', 'clientes', 'veiculos', 'catalogo_pecas', 'catalogo_servicos'];   // socios não é mais legível: o login é por função
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
        try { renderCobrancas(); } catch (e) { console.error(e); }
        try { renderVeiculos(); } catch (e) { console.error(e); }
        try { renderMecanicos(); } catch (e) { console.error(e); }
        try { renderRelatorios(); } catch (e) { console.error(e); }
        try { renderCatalogo(); } catch (e) { console.error(e); }
    } else if (session) {
        try { renderPainelMecanico(); } catch (e) { console.error(e); }
    }
}

if (supabaseClient) {
    supabaseClient.channel('custom-all-channel')
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
    /* A conferência da senha acontece DENTRO do banco. O navegador manda usuário
       e senha e recebe de volta só o id e o nome — o hash nunca sai de lá.
       Antes esta tela baixava a tabela de sócios inteira, com as senhas em
       texto puro, antes mesmo de alguém digitar qualquer coisa. */
    if (!userInp || !senhaInp) return toast("Preencha usuário e senha!", true);

    if (loginMode === 'login') {
        const { data, error } = await supabaseClient.rpc('login_socio', { p_user: userInp, p_senha: senhaInp });
        if (error) { console.error("Login sócio:", error); return toast("Erro de conexão: " + mensagemErro(error), true); }
        const u = (data || [])[0];
        if (!u) return toast("Sócio não encontrado ou senha incorreta!", true);
        session = { id: u.id, nome: u.nome, role: 'socio' };
    } else if (loginMode === 'mecanico') {
        const { data, error } = await supabaseClient.rpc('login_mecanico', { p_nome: userInp, p_senha: senhaInp });
        if (error) { console.error("Login mecânico:", error); return toast("Erro de conexão: " + mensagemErro(error), true); }
        const m = (data || [])[0];
        if (!m) return toast("Mecânico não encontrado ou senha incorreta!", true);
        session = { id: m.id, nome: m.nome, role: 'mecanico' };
    }
    if (lembrar) localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session)); else sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
    initApp();
}

async function doRegister() {
    const nome = document.getElementById('r-nome').value.trim(); const email = document.getElementById('r-email').value.trim();
    const codigo = document.getElementById('r-codigo').value.trim(); const senha = document.getElementById('r-senha').value; const confirma = document.getElementById('r-confirma').value;
    if (senha !== confirma) return toast("As senhas não conferem!", true);
    if (!nome || !email) return toast("Preencha todos os campos!", true);

    /* O código da empresa é conferido no banco, não aqui. Antes ele estava
       escrito neste arquivo, ou seja, à vista de quem abrisse o código-fonte
       da página — qualquer um podia se cadastrar como sócio. */
    const { error } = await supabaseClient.rpc('registrar_socio',
        { p_nome: nome, p_email: email, p_senha: senha, p_codigo: codigo });
    if (error) { console.error("Registro:", error); return toast(mensagemErro(error), true); }
    toast("Conta criada! Faça login."); switchTab('login');
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
            <button class="nav-item active" data-page="dashboard">Dashboard BI</button><button class="nav-item" data-page="orcamentos">Orçamentos</button><button class="nav-item" data-page="os">Gestão Ágil (OS)</button><button class="nav-item" data-page="cobrancas">Cobranças</button><button class="nav-item" data-page="veiculos">Veículos</button><button class="nav-item" data-page="mecanicos">Equipe</button><button class="nav-item" data-page="catalogo">Catálogo</button><button class="nav-item" data-page="relatorios">Relatórios</button>`;

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

    /* Sugere a partir do cadastro de veículos e, depois, do histórico de OS —
       assim os carros atendidos antes de existir cadastro continuam aparecendo. */
    const veiculosMap = new Map();
    db.veiculos.forEach(v => {
        const dono = clientePorId(v.cliente_id);
        veiculosMap.set(v.placa, {
            cliente: dono ? dono.nome : 'Sem dono cadastrado',
            info: [v.marca, v.modelo].filter(Boolean).join(' '),
        });
    });
    db.os.slice().sort((a, b) => Number(b.id) - Number(a.id)).forEach(doc => {
        const p = normalizarPlaca(doc.placa);
        if (p && !veiculosMap.has(p)) {
            veiculosMap.set(p, { cliente: doc.cliente || 'Desconhecido', info: [doc.veiculo, doc.modelo].filter(Boolean).join(' ') });
        }
    });

    const alvo = normalizarPlaca(input);
    const matches = [];
    veiculosMap.forEach((dados, placa) => { if (placa.includes(alvo)) matches.push({ placa, ...dados }); });
    matches.sort((a, b) => a.placa.localeCompare(b.placa));
    if (matches.length > 0) {
        suggestionsBox.innerHTML = matches.slice(0, 8).map(m => `<div class="autocomplete-item" onclick="selecionarPlaca('${m.placa}')"><strong>${m.placa}</strong><span class="autocomplete-client">${m.cliente}${m.info ? ' · ' + m.info : ''}</span></div>`).join('');
        suggestionsBox.classList.remove('hidden');
    } else { suggestionsBox.classList.add('hidden'); }
}
function selecionarPlaca(placa) { document.getElementById('d-placa').value = placa; document.getElementById('placa-suggestions').classList.add('hidden'); buscarPlaca(placa); }
document.addEventListener('click', function (e) { const box = document.getElementById('placa-suggestions'); const inp = document.getElementById('d-placa'); if (box && !box.contains(e.target) && e.target !== inp) box.classList.add('hidden'); });

function buscarPlaca(placaInput) {
    const placa = normalizarPlaca(placaInput);
    if (placa.length < 7) return;
    const campo = document.getElementById('d-placa'); if (campo) campo.value = placa;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };

    // Primeiro o cadastro do veículo, que é a fonte atual. Só depois o
    // histórico de OS, para os carros que já rodavam antes deste cadastro.
    const v = veiculoPorPlaca(placa);
    if (v) {
        set('d-veiculo', v.marca); set('d-modelo', v.modelo); set('d-motor', v.motor); set('d-km', v.km_atual);
        const dono = clientePorId(v.cliente_id);
        if (dono) set('d-cliente', dono.nome);
        const qtd = osDoVeiculo(v.id, placa).length;
        toast(qtd ? `🚗 ${v.marca} ${v.modelo} · ${qtd} ${qtd === 1 ? 'serviço' : 'serviços'} no histórico` : '🚗 Veículo encontrado!');
        mostrarAlertaGarantia(v.id, placa);
        return;
    }

    const match = db.os.slice().sort((a, b) => Number(b.id) - Number(a.id))
        .find(doc => normalizarPlaca(doc.placa) === placa);
    if (match) {
        ['cliente', 'veiculo', 'modelo', 'motor', 'km'].forEach(f => set('d-' + f, match[f]));
        toast("🚗 Dados recuperados do histórico!");
    }
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
        const currList = db.os.filter(o => { const iso = o.dataISO || parseBRDateToISO(o.data); return iso >= curIni && iso <= curFim && osConcluida(o); });

        const faturamentoTotal = currList.reduce((a, o) => a + (Number(o.total) || 0), 0);
        const lucroTotal = currList.reduce((a, o) => a + (Number(o.lucro) || 0), 0);
        const comissaoTotal = currList.reduce((a, o) => a + (Number(o.comissao) || 0), 0);
        const ticketMedio = currList.length > 0 ? (faturamentoTotal / currList.length) : 0;

        const d1 = new Date(curIni); const d2 = new Date(curFim); const diffTime = Math.abs(d2 - d1); const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const prevFimDate = new Date(d1); prevFimDate.setDate(prevFimDate.getDate() - 1); const prevFim = prevFimDate.toISOString().split('T')[0];
        const prevIniDate = new Date(prevFimDate); prevIniDate.setDate(prevIniDate.getDate() - diffDays + 1); const prevIni = prevIniDate.toISOString().split('T')[0];
        const prevList = db.os.filter(o => { const iso = o.dataISO || parseBRDateToISO(o.data); return iso >= prevIni && iso <= prevFim && osConcluida(o); });

        const pFat = prevList.reduce((a, o) => a + (Number(o.total) || 0), 0); const pLucro = prevList.reduce((a, o) => a + (Number(o.lucro) || 0), 0); const pCom = prevList.reduce((a, o) => a + (Number(o.comissao) || 0), 0); const pTicket = prevList.length > 0 ? (pFat / prevList.length) : 0;

        /* Taxa de retorno: quanto do que saiu voltou por causa do nosso serviço.
           É o indicador de retrabalho — cada retorno custa peça, mão de obra e
           comissão de novo, e some do lucro sem aparecer em lugar nenhum. */
        const retornos = currList.filter(o => o.retorno_de_os);
        const taxaRetorno = currList.length ? (retornos.length / currList.length) * 100 : 0;
        const elTaxa = document.getElementById('d-retorno-taxa');
        if (elTaxa) elTaxa.textContent = taxaRetorno.toFixed(taxaRetorno % 1 === 0 ? 0 : 1) + '%';
        const elTaxaInfo = document.getElementById('d-retorno-info');
        if (elTaxaInfo) elTaxaInfo.textContent = retornos.length
            ? retornos.length + (retornos.length === 1 ? ' retorno em ' : ' retornos em ') + currList.length + ' OS'
            : (currList.length ? 'Nenhum retorno' : '--');

        /* A receber é a carteira INTEIRA, não só a do período filtrado: dívida
           antiga continua sendo dívida, e é isso que se quer saber ao olhar. */
        const carteira = db.os.filter(osNaCarteira);
        const totalAReceber = carteira.reduce((a, o) => a + aReceberDaOS(o), 0);
        const elReceber = document.getElementById('d-receber');
        if (elReceber) animateValue('d-receber', 0, totalAReceber, 1000);
        const elReceberInfo = document.getElementById('d-receber-info');
        if (elReceberInfo) elReceberInfo.textContent = carteira.length
            ? carteira.length + (carteira.length === 1 ? ' OS em aberto' : ' OS em aberto')
            : 'Nada na carteira';

        animateValue('d-fat', 0, faturamentoTotal, 1000); animateValue('d-lucro', 0, lucroTotal, 1000); animateValue('d-comissao', 0, comissaoTotal, 1000); animateValue('d-ticket', 0, ticketMedio, 1000);

        if (document.getElementById('d-fat-trend')) document.getElementById('d-fat-trend').innerHTML = getTrendHTML(faturamentoTotal, pFat);
        if (document.getElementById('d-lucro-trend')) document.getElementById('d-lucro-trend').innerHTML = getTrendHTML(lucroTotal, pLucro);
        if (document.getElementById('d-comissao-trend')) document.getElementById('d-comissao-trend').innerHTML = getTrendHTML(comissaoTotal, pCom);
        if (document.getElementById('d-ticket-trend')) document.getElementById('d-ticket-trend').innerHTML = getTrendHTML(ticketMedio, pTicket);

        if (document.getElementById('d-tbody')) {
            document.getElementById('d-tbody').innerHTML = currList.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 8).map(o => `<tr><td>#${o.id}</td><td>${o.veiculo}</td><td>${fmt(o.total)}</td><td>${getStatusBadge(o.status)}${osConcluida(o) ? ' ' + getPagamentoBadge(o) : ''}${getRetornoBadge(o)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">Nenhuma OS finalizada no período.</td></tr>';
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
/* Etiqueta separada: retorno não é um status nem um pagamento, é a marca de
   que este serviço foi refeito sem cobrar de novo. */
function getRetornoBadge(o) {
    if (!o || !o.retorno_de_os) return '';
    const titulo = o.retorno_motivo ? ` title="${String(o.retorno_motivo).replace(/"/g, '&quot;')}"` : '';
    return `<span${titulo} style="color:var(--gold); font-weight:bold; background:rgba(232,160,32,0.12); padding:4px 8px; border-radius:4px; font-size:11px; white-space:nowrap;">↩️ RETORNO OS #${o.retorno_de_os}</span>`;
}

function getStatusBadge(s) {
    if (!s) s = 'aberta';
    const upper = s.toUpperCase();
    if (s === 'entregue') return `<span style="color:var(--blue); font-weight:bold; background:rgba(59,130,246,0.14); padding:4px 8px; border-radius:4px; font-size:11px;">🔷 ENTREGUE</span>`;
    if (s === 'finalizada') return `<span style="color:var(--success); font-weight:bold; background:rgba(34,197,94,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🟢 ${upper}</span>`;
    if (s === 'em_andamento') return `<span style="color:var(--gold); font-weight:bold; background:rgba(232,160,32,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🟡 ${upper}</span>`;
    if (s === 'orcamento') return `<span style="color:var(--gold); font-weight:bold; background:rgba(232,160,32,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🟡 ORÇAMENTO PENDENTE</span>`;
    if (s === 'rejeitado') return `<span style="color:var(--danger); font-weight:bold; background:rgba(239,68,68,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🔴 ${upper}</span>`;
    return `<span style="color:var(--blue); font-weight:bold; background:rgba(59,130,246,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">🔵 ${upper}</span>`;
}

/* Etiqueta de pagamento, separada da etiqueta de status: as duas aparecem
   lado a lado para não confundir "serviço pronto" com "dinheiro recebido". */
function getPagamentoBadge(o) {
    const sit = nomeSituacao(o.pagamento);
    const forma = nomeForma(o.forma_pagamento);
    const cor = o.pagamento === 'pago' ? 'var(--success)' : (o.pagamento === 'parcial' ? 'var(--brand)' : 'var(--danger)');
    const fundo = o.pagamento === 'pago' ? 'rgba(34,197,94,0.1)' : (o.pagamento === 'parcial' ? 'rgba(232,160,32,0.1)' : 'rgba(239,68,68,0.1)');
    let texto = sit.nome.toUpperCase();
    if (o.pagamento === 'pago' && forma) texto += ' · ' + forma.toUpperCase();
    else if (o.pagamento !== 'pago' && aReceberDaOS(o) > 0) texto += ' · FALTA ' + fmt(aReceberDaOS(o));
    return `<span style="color:${cor}; font-weight:bold; background:${fundo}; padding:4px 8px; border-radius:4px; font-size:11px; white-space:nowrap;">${sit.bolinha} ${texto}</span>`;
}

function renderOrcamentos() {
    const el = document.getElementById('orc-tbody'); if (!el) return;
    // O Orçamento agora mora dentro da tabela OS
    const orcs = db.os.filter(o => o.status === 'orcamento' || o.status === 'rejeitado');
    el.innerHTML = orcs.sort((a, b) => Number(b.id) - Number(a.id)).map(o => `<tr><td>#${o.id}</td><td>${o.data}</td><td>${o.veiculo}</td><td>${o.cliente}</td><td>${fmt(o.total)}</td><td>${getStatusBadge(o.status)}${osConcluida(o) ? ' ' + getPagamentoBadge(o) : ''}${getRetornoBadge(o)}</td><td><button class="btn btn-secondary btn-sm" onclick="openDocModal('orcamento','${o.id}')">✏️ Abrir</button></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhum Orçamento.</td></tr>';
}

function renderOSKanban() {
    const cardsAberta = document.getElementById('cards-aberta'); if (!cardsAberta) return;

    // Apenas OS reais entram aqui
    const abertas = db.os.filter(o => o.status === 'aberta').sort((a, b) => Number(b.id) - Number(a.id));
    const andamento = db.os.filter(o => o.status === 'em_andamento').sort((a, b) => Number(b.id) - Number(a.id));
    const finalizadas = db.os.filter(o => o.status === 'finalizada').sort((a, b) => Number(b.id) - Number(a.id));
    const entregues = db.os.filter(o => o.status === 'entregue').sort((a, b) => Number(b.id) - Number(a.id));

    if (document.getElementById('count-aberta')) document.getElementById('count-aberta').textContent = abertas.length;
    if (document.getElementById('count-andamento')) document.getElementById('count-andamento').textContent = andamento.length;
    if (document.getElementById('count-finalizada')) document.getElementById('count-finalizada').textContent = finalizadas.length;
    if (document.getElementById('count-entregue')) document.getElementById('count-entregue').textContent = entregues.length;

    const buildCard = (o) => `
        <div class="kanban-card" id="kcard-${o.id}" draggable="true" ondragstart="drag(event)">
            <div class="kc-header"><span class="kc-id">#${o.id}</span><span class="kc-val">${fmt(o.total)}</span></div>
            <div class="kc-veiculo">${o.veiculo}</div>
            <div class="kc-cliente">👤 ${o.cliente || 'Sem Nome'} | 🚗 ${o.placa || 'Sem Placa'}</div>
            ${osConcluida(o) ? `<div class="kc-pagamento">${getPagamentoBadge(o)}</div>` : ''}
            <div class="kc-footer"><span class="kc-date">${o.data}</span><button class="btn btn-secondary btn-sm" onclick="openDocModal('os','${o.id}')">✏️ Abrir</button></div>
        </div>
    `;
    cardsAberta.innerHTML = abertas.map(buildCard).join('');
    if (document.getElementById('cards-andamento')) document.getElementById('cards-andamento').innerHTML = andamento.map(buildCard).join('');
    if (document.getElementById('cards-finalizada')) document.getElementById('cards-finalizada').innerHTML = finalizadas.map(buildCard).join('');
    if (document.getElementById('cards-entregue')) document.getElementById('cards-entregue').innerHTML = entregues.map(buildCard).join('');
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
/* Monta os selects de pagamento a partir das listas, para não haver duas
   fontes de verdade entre o HTML e o que é gravado no banco. */
function montarSelectsPagamento() {
    const sit = document.getElementById('d-pagamento');
    if (sit && !sit.options.length) {
        sit.innerHTML = SITUACOES_PAGAMENTO.map(x => `<option value="${x.id}">${x.bolinha} ${x.nome}</option>`).join('');
    }
    const forma = document.getElementById('d-forma-pagamento');
    if (forma && !forma.options.length) {
        forma.innerHTML = FORMAS_PAGAMENTO.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
    }
}

/* "Pago" preenche o valor pago com o total sozinho — ninguém quer digitar o
   mesmo número duas vezes. "Não pago" zera. "Falta acertar" deixa a pessoa
   digitar quanto entrou, que é justamente a informação que só ela sabe. */
function aoMudarSituacaoPagamento() {
    const sit = document.getElementById('d-pagamento');
    const valor = document.getElementById('d-valor-pago');
    if (!sit || !valor) return;
    if (sit.value === 'pago') valor.value = totalAtualDoDoc();
    else if (sit.value === 'nao_pago') valor.value = 0;
    atualizarResumoPagamento();
}

function totalAtualDoDoc() {
    const el = document.getElementById('res-total');
    if (!el) return 0;
    // res-total já está formatado em reais; o número puro vem do dataset.
    return Number(el.dataset.valor || 0);
}

function atualizarResumoPagamento() {
    const el = document.getElementById('d-falta-receber');
    if (!el) return;
    const total = totalAtualDoDoc();
    const pago = Number((document.getElementById('d-valor-pago') || {}).value) || 0;
    const falta = Math.max(0, total - pago);
    el.textContent = falta > 0 ? 'Falta receber ' + fmt(falta) : 'Quitado';
    el.style.color = falta > 0 ? 'var(--danger)' : 'var(--success)';
}

/* =========================================
   NOVA OS EM ETAPAS
   O modal cresceu para 3,5 telas de rolagem no tablet e 8,2 no celular,
   conforme o checklist de entrada e o pagamento foram entrando. Rolar
   procurando campo, com a mão suja, é onde o preenchimento trava.
   Em etapas cada tela tem um assunto só e cabe sem rolar (ou quase).
   O total fica fixo no rodapé, porque é o número que se olha o tempo todo.
========================================= */
const ETAPAS = [
    { n: 1, nome: 'Veículo' },
    { n: 2, nome: 'Serviços' },
    { n: 3, nome: 'Peças' },
    { n: 4, nome: 'Fechamento' },
];
let etapaAtual = 1;

function montarBarraEtapas() {
    const el = document.getElementById('etapas-barra'); if (!el) return;
    el.innerHTML = ETAPAS.map(e => {
        const estado = e.n === etapaAtual ? 'atual' : (e.n < etapaAtual ? 'feita' : '');
        return `<button type="button" class="etapa-passo ${estado}" onclick="irParaEtapa(${e.n})">
            <span class="etapa-num">${e.n < etapaAtual ? '✓' : e.n}</span><span class="etapa-nome">${e.nome}</span>
        </button>`;
    }).join('');
}

/* Contadores na barra: dá para ver que há 3 serviços marcados sem voltar lá. */
function atualizarContadoresEtapas() {
    const el = document.getElementById('etapas-barra'); if (!el) return;
    const marca = (n, qtd) => {
        const passo = el.querySelector(`.etapa-passo:nth-child(${n}) .etapa-nome`);
        if (passo) passo.textContent = ETAPAS[n - 1].nome + (qtd ? ` (${qtd})` : '');
    };
    marca(2, (stateOS.servicos || []).length);
    marca(3, (stateOS.pecas || []).length);
}

function irParaEtapa(n) {
    etapaAtual = Math.min(Math.max(1, n), ETAPAS.length);
    document.querySelectorAll('#modal-doc .etapa').forEach(el => {
        el.style.display = Number(el.dataset.etapa) === etapaAtual ? 'block' : 'none';
    });
    montarBarraEtapas();
    atualizarContadoresEtapas();

    const voltar = document.getElementById('btn-etapa-voltar');
    const avancar = document.getElementById('btn-etapa-avancar');
    if (voltar) voltar.style.visibility = etapaAtual === 1 ? 'hidden' : 'visible';
    if (avancar) avancar.style.visibility = etapaAtual === ETAPAS.length ? 'hidden' : 'visible';

    // O corpo do modal volta ao topo: sem isso a etapa nova abre no meio.
    const caixa = document.querySelector('#modal-doc .modal-box');
    if (caixa) caixa.scrollTop = 0;
}

function etapaProxima() { irParaEtapa(etapaAtual + 1); }
function etapaAnterior() { irParaEtapa(etapaAtual - 1); }

function openDocModal(type, editId = null) {
    stateOS.type = type; stateOS.editId = editId;
    if (document.getElementById('mdoc-title')) document.getElementById('mdoc-title').textContent = type === 'os' ? 'Ordem de Serviço' : 'Orçamento';

    if (document.getElementById('btn-convert-os')) {
        document.getElementById('btn-convert-os').style.display = (type === 'orcamento' && editId && session.role === 'socio') ? 'block' : 'none';
    }
    if (document.getElementById('btn-print-doc')) document.getElementById('btn-print-doc').style.display = editId ? 'block' : 'none';

    const statusSelect = document.getElementById('d-status');
    if (statusSelect) {
        if (type === 'os') statusSelect.innerHTML = `<option value="aberta">🔵 Aberta</option><option value="em_andamento">🟡 Andamento</option><option value="finalizada">🟢 Finalizada</option><option value="entregue">🔷 Entregue</option>`;
        else statusSelect.innerHTML = `<option value="orcamento">🟡 Pendente (Orçamento)</option><option value="rejeitado">🔴 Rejeitado</option>`;
    }

    montarSelectsPagamento();

    stateOS.checklist = { combustivel: '', itens: {}, avarias: '' };
    stateOS.fotos = [];

    if (editId) {
        const doc = db.os.find(x => x.id == editId);
        stateOS.checklist = Object.assign({ combustivel: '', itens: {}, avarias: '' }, doc.checklist || {});
        ['cliente', 'veiculo', 'modelo', 'placa', 'km', 'motor', 'status'].forEach(f => { const el = document.getElementById('d-' + f); if (el) el.value = doc[f] || ''; });
        if (document.getElementById('d-pagamento')) document.getElementById('d-pagamento').value = doc.pagamento || 'nao_pago';
        if (document.getElementById('d-forma-pagamento')) document.getElementById('d-forma-pagamento').value = doc.forma_pagamento || '';
        if (document.getElementById('d-valor-pago')) document.getElementById('d-valor-pago').value = Number(doc.valor_pago) || 0;
        stateOS.servicos = JSON.parse(JSON.stringify(doc.servicos || [])); stateOS.pecas = JSON.parse(JSON.stringify(doc.pecas || []));
    } else {
        ['cliente', 'veiculo', 'modelo', 'placa', 'km', 'motor'].forEach(f => { const el = document.getElementById('d-' + f); if (el) el.value = ''; });
        if (statusSelect) statusSelect.value = type === 'os' ? 'aberta' : 'orcamento';
        if (document.getElementById('d-pagamento')) document.getElementById('d-pagamento').value = 'nao_pago';
        if (document.getElementById('d-forma-pagamento')) document.getElementById('d-forma-pagamento').value = '';
        if (document.getElementById('d-valor-pago')) document.getElementById('d-valor-pago').value = 0;
        stateOS.servicos = []; stateOS.pecas = []; stateOS.fotoBase64 = null;
        if (document.getElementById('d-foto-preview')) document.getElementById('d-foto-preview').style.display = 'none';
    }
    if (typeof renderChecklistEntrada === 'function') renderChecklistEntrada();
    if (typeof carregarFotosDaOS === 'function' && editId) carregarFotosDaOS(editId);

    // Alerta de garantia: só faz sentido em OS, e depende de saber qual carro é.
    const retornoChk = document.getElementById('d-retorno');
    if (retornoChk) { retornoChk.checked = false; aoMarcarRetorno(); }
    const motivo = document.getElementById('d-retorno-motivo');
    if (motivo) motivo.value = '';
    const alerta = document.getElementById('alerta-garantia');
    if (alerta) { alerta.style.display = 'none'; }
    const linhaRet = document.getElementById('retorno-row');
    if (linhaRet) linhaRet.style.display = 'none';
    if (editId) {
        const doc = db.os.find(x => x.id == editId);
        if (doc && doc.retorno_de_os && retornoChk) {
            retornoChk.checked = true;
            if (motivo) motivo.value = doc.retorno_motivo || '';
        }
        if (doc) mostrarAlertaGarantia(doc.veiculo_id, doc.placa);
    }

    checklistExpandido = { servicos: false, pecas: false };
    irParaEtapa(1);
    renderChecklistServicos(); renderChecklistPecas(); updateTotals();
    if (document.getElementById('modal-doc')) document.getElementById('modal-doc').style.display = 'flex';
}

/* BUSCA NOS CHECKLISTS
   O mesmo campo que cria item novo tambem filtra a lista: digitar "past" deixa
   so as pastilhas. Ignora acento e caixa, entao "oleo" acha "ÓLEO". */
const normalizarBusca = (txt) => (txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

function termoBusca(tipo) {
    const inp = document.getElementById(tipo === 'pecas' ? 'quick-peca-nome' : 'quick-servico-nome');
    return inp ? normalizarBusca(inp.value) : '';
}

function filtrarChecklist(tipo) { if (tipo === 'pecas') renderChecklistPecas(); else renderChecklistServicos(); }

/* =========================================
   GARANTIA E RETORNO
   Retrabalho custa peça, mão de obra e comissão. Isso só é possível agora
   porque o sistema reconhece que duas OS são do mesmo carro.
========================================= */
const GARANTIA_PADRAO_DIAS = 90;

const garantiaDoServico = (catalogoId) => {
    const c = db.catalogo_servicos.find(x => x.id === catalogoId);
    return c && c.garantia_dias != null ? Number(c.garantia_dias) : GARANTIA_PADRAO_DIAS;
};

const diasDesde = (o) => {
    const iso = o.dataISO || parseBRDateToISO(o.data);
    if (!iso) return Infinity;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
};

/* Serviços ainda dentro do prazo num carro. Só olha OS concluída: garantia
   começa a contar quando o serviço ficou pronto, não quando o carro entrou. */
function servicosEmGarantia(veiculoId, placa, ignorarOsId) {
    const achados = [];
    osDoVeiculo(veiculoId, placa).forEach(o => {
        if (!osConcluida(o) || String(o.id) === String(ignorarOsId)) return;
        const dias = diasDesde(o);
        (o.servicos || []).forEach(sv => {
            const prazo = garantiaDoServico(sv.catalogoId);
            if (prazo > 0 && dias <= prazo) {
                achados.push({ osId: o.id, descricao: sv.descricao, dias, prazo, restam: prazo - dias });
            }
        });
    });
    return achados.sort((a, b) => a.restam - b.restam);
}

function mostrarAlertaGarantia(veiculoId, placa) {
    const el = document.getElementById('alerta-garantia');
    const linha = document.getElementById('retorno-row');
    if (!el) return;

    const emGarantia = servicosEmGarantia(veiculoId, placa, stateOS.editId);
    if (!emGarantia.length) {
        el.style.display = 'none'; el.innerHTML = '';
        if (linha) linha.style.display = 'none';
        return;
    }

    el.style.display = 'block';
    el.innerHTML = '<strong>⚠️ Este carro tem serviço em garantia</strong>' +
        '<ul>' + emGarantia.slice(0, 4).map(g =>
            `<li>${g.descricao} — feito há ${g.dias} ${g.dias === 1 ? 'dia' : 'dias'} (OS #${g.osId}, garantia de ${g.prazo} dias, restam ${g.restam})</li>`
        ).join('') + '</ul>' +
        '<span class="alerta-rodape">Se o carro voltou por causa disso, marque como retorno em garantia abaixo.</span>';

    if (linha) {
        linha.style.display = 'grid';
        const sel = document.getElementById('d-retorno-os');
        if (sel) {
            const vistas = [];
            emGarantia.forEach(g => { if (!vistas.some(v => v.osId === g.osId)) vistas.push(g); });
            sel.innerHTML = vistas.map(g => `<option value="${g.osId}">OS #${g.osId} · ${g.descricao}</option>`).join('');
        }
    }
}

function aoMarcarRetorno() {
    const marcado = (document.getElementById('d-retorno') || {}).checked;
    ['d-retorno-os', 'd-retorno-motivo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !marcado;
    });
}

/* =========================================
   CLIENTES E VEÍCULOS
   A placa é a identidade do carro. Normalizada aqui e no banco (trigger), para
   "ABC-1D23", "abc1d23" e "ABC 1D23" serem sempre o mesmo veículo — senão o
   histórico se parte em vários cadastros e não serve para nada.
========================================= */
const normalizarPlaca = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const chaveNome = (n) => normalizarBusca(n);
const novoId = () => Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');

const clientePorId = (id) => db.clientes.find(c => c.id === id);
const veiculoPorPlaca = (placa) => { const p = normalizarPlaca(placa); return p ? db.veiculos.find(v => v.placa === p) : null; };
const osDoVeiculo = (veiculoId, placa) => {
    const p = normalizarPlaca(placa);
    return db.os.filter(o => (veiculoId && o.veiculo_id === veiculoId) || (p && normalizarPlaca(o.placa) === p))
        .sort((a, b) => Number(b.id) - Number(a.id));
};

/* Acha o cliente pelo nome ou cria um novo. O casamento é pelo nome sem acento
   e sem caixa: quem digita "Joao silva" hoje e "JOÃO SILVA" amanhã é a mesma
   pessoa, e tratar como duas destruiria o histórico. */
async function garantirCliente(nome) {
    const limpo = String(nome || '').trim();
    if (!limpo) return null;
    const existente = db.clientes.find(c => chaveNome(c.nome) === chaveNome(limpo));
    if (existente) return existente.id;

    const id = novoId();
    const { error } = await supabaseClient.from('clientes').insert([{ id, nome: limpo.toUpperCase() }]);
    if (error) { console.error('Cliente:', error); return null; }
    db.clientes.push({ id, nome: limpo.toUpperCase(), telefone: '', documento: '', observacoes: '' });
    return id;
}

/* Cria ou atualiza o veículo. Insert em vez de upsert pelo mesmo motivo da OS:
   se dois aparelhos cadastrarem a mesma placa ao mesmo tempo, o banco recusa o
   segundo (placa é única) e nós relemos, em vez de sobrescrever. */
async function garantirVeiculo(dados, clienteId) {
    const placa = normalizarPlaca(dados.placa);
    if (!placa) return null;

    const campos = {
        placa,
        marca: (dados.marca || '').toUpperCase(),
        modelo: (dados.modelo || '').toUpperCase(),
        motor: (dados.motor || '').toUpperCase(),
        km_atual: dados.km || '',
    };
    if (clienteId) campos.cliente_id = clienteId;

    const existente = veiculoPorPlaca(placa);
    if (existente) {
        const { error } = await supabaseClient.from('veiculos').update(campos).eq('id', existente.id);
        if (error) { console.error('Veículo:', error); return existente.id; }
        Object.assign(existente, campos);
        return existente.id;
    }

    const id = novoId();
    const { error } = await supabaseClient.from('veiculos').insert([{ id, ...campos }]);
    if (!error) { db.veiculos.push({ id, ...campos }); return id; }

    if (error.code === '23505') {          // outro aparelho cadastrou a placa primeiro
        const { data } = await supabaseClient.from('veiculos').select('*').eq('placa', placa).limit(1);
        const achado = (data || [])[0];
        if (achado) {
            await supabaseClient.from('veiculos').update(campos).eq('id', achado.id);
            db.veiculos.push(Object.assign(achado, campos));
            return achado.id;
        }
    }
    console.error('Veículo:', error);
    return null;
}

/* MAIS USADOS
   Conta quantas vezes cada item do catálogo já foi lançado em OS e sobe os
   mais frequentes para o topo. Com quase 100 itens cadastrados, os poucos que
   a oficina lança todo dia ficam ao alcance do dedo sem rolar nem buscar.
   Sem histórico nenhum, nada muda: tudo cai no grupo de baixo. */
const TOPO_MAIS_USADOS = 8;
let cacheUsos = { chave: null, servicos: new Map(), pecas: new Map() };

function contarUsos() {
    // Recontar a cada toque seria desperdício: o histórico só muda ao gravar OS.
    const chave = db.os.length + ':' + (db.os.length ? db.os[db.os.length - 1].id : '');
    if (cacheUsos.chave === chave) return cacheUsos;
    const servicos = new Map(), pecas = new Map();
    db.os.forEach(o => {
        (o.servicos || []).forEach(sv => { if (sv.catalogoId) servicos.set(sv.catalogoId, (servicos.get(sv.catalogoId) || 0) + 1); });
        (o.pecas || []).forEach(pc => { if (pc.catalogoId) pecas.set(pc.catalogoId, (pecas.get(pc.catalogoId) || 0) + 1); });
    });
    cacheUsos = { chave, servicos, pecas };
    return cacheUsos;
}

function separarMaisUsados(lista, usos) {
    // sort é estável: itens com a mesma contagem mantêm a ordem do catálogo.
    const topo = lista.filter(i => (usos.get(i.id) || 0) > 0)
        .sort((a, b) => (usos.get(b.id) || 0) - (usos.get(a.id) || 0))
        .slice(0, TOPO_MAIS_USADOS);
    const noTopo = new Set(topo.map(i => i.id));
    return { topo, resto: lista.filter(i => !noTopo.has(i.id)) };
}

function botaoChecklist(tipo, item) {
    const ativo = tipo === 'pecas'
        ? stateOS.pecas.find(p => p.catalogoId === item.id)
        : stateOS.servicos.find(sv => sv.catalogoId === item.id);
    const acao = tipo === 'pecas' ? 'togglePeca' : 'toggleServico';
    return `<button type="button" class="checklist-btn ${ativo ? 'checklist-btn-active' : ''}" onclick="${acao}('${item.id}', '${item.nome.replace(/'/g, "\\'")}')"><span class="check-icon">${ativo ? '✓' : '+'}</span>${item.nome}</button>`;
}

/* Com quase 100 itens no catálogo, a lista inteira ocupava 4 telas de rolagem
   no celular. Mostra um punhado e guarda o resto atrás de um toque: quem sabe
   o que quer digita na busca, quem está olhando vê os mais prováveis primeiro.
   Com busca ativa não corta nada — ali o resultado já é curto por definição. */
const CHECKLIST_VISIVEL = 14;
let checklistExpandido = { servicos: false, pecas: false };

function expandirChecklist(tipo) {
    checklistExpandido[tipo] = true;
    filtrarChecklist(tipo);
}

function montarChecklist(tipo, lista, termo) {
    const usos = tipo === 'pecas' ? contarUsos().pecas : contarUsos().servicos;
    const botao = (i) => botaoChecklist(tipo, i);
    // Numa lista já filtrada, separar em grupos vira ruído: ordena e pronto.
    if (termo) {
        return lista.slice()
            .sort((a, b) => (usos.get(b.id) || 0) - (usos.get(a.id) || 0))
            .map(botao).join('');
    }

    const { topo, resto } = separarMaisUsados(lista, usos);
    const expandido = checklistExpandido[tipo];
    const cabem = Math.max(0, CHECKLIST_VISIVEL - topo.length);
    const mostrar = expandido ? resto : resto.slice(0, cabem);
    const escondidos = resto.length - mostrar.length;

    const maisBotao = escondidos > 0
        ? `<button type="button" class="checklist-mais" onclick="expandirChecklist('${tipo}')">Ver todos (+${escondidos})</button>`
        : '';

    if (!topo.length) return mostrar.map(botao).join('') + maisBotao;
    return '<div class="checklist-grupo">★ Mais usados</div>' + topo.map(botao).join('')
        + '<div class="checklist-grupo">Todos</div>' + mostrar.map(botao).join('') + maisBotao;
}

function checklistVazio(tipo, termo) {
    const label = tipo === 'pecas' ? 'peça' : 'serviço';
    if (!termo) return `<p class="checklist-empty">Nenhum${tipo === 'pecas' ? 'a' : ''} ${label} no catálogo ainda.</p>`;
    return `<p class="checklist-empty">Nenhum${tipo === 'pecas' ? 'a' : ''} ${label} com "${termo}". Toque em <strong>+ Adicionar</strong> para criar.</p>`;
}

function renderChecklistServicos() {
    const el = document.getElementById('checklist-servicos'); if (!el) return;
    const termo = termoBusca('servicos');
    const lista = termo ? db.catalogo_servicos.filter(cs => normalizarBusca(cs.nome).includes(termo)) : db.catalogo_servicos;
    el.innerHTML = montarChecklist('servicos', lista, termo) || checklistVazio('servicos', termo);
    renderServicosAtivos();
}
function toggleServico(catalogoId, nome) { const idx = stateOS.servicos.findIndex(s => s.catalogoId === catalogoId); if (idx >= 0) stateOS.servicos.splice(idx, 1); else stateOS.servicos.push({ id: Date.now().toString(), catalogoId, descricao: nome.toUpperCase(), mecanicoId: (session.role === 'mecanico' ? session.id : ''), qtd: 1, valor: 0 }); renderChecklistServicos(); updateTotals(); }
function renderServicosAtivos() { const el = document.getElementById('servicos-ativos'); if (!el) return; el.innerHTML = stateOS.servicos.length ? `<div class="ativo-header-row"><span>Serviço</span><span>Mecânico</span><span>Qtd</span><span>R$ Unit.</span><span></span></div>` + stateOS.servicos.map(s => `<div class="ativo-row"><span class="ativo-nome">${s.descricao}</span><select onchange="updS('${s.id}','mecanicoId',this.value)"><option value="">Loja</option>${db.mecanicos.map(m => `<option value="${m.id}" ${s.mecanicoId == m.id ? 'selected' : ''}>${m.nome}</option>`).join('')}</select><input type="number" value="${s.qtd}" oninput="updS('${s.id}','qtd',this.value)"><input type="number" value="${s.valor}" oninput="updS('${s.id}','valor',this.value)"><button class="btn btn-danger btn-sm" onclick="removeServico('${s.id}')">✕</button></div>`).join('') : '<p style="color:var(--text-dim); font-size:12px;">Vazio</p>'; }
function removeServico(id) { stateOS.servicos = stateOS.servicos.filter(s => s.id !== id); renderChecklistServicos(); updateTotals(); }

function renderChecklistPecas() {
    const el = document.getElementById('checklist-pecas'); if (!el) return;
    const termo = termoBusca('pecas');
    const lista = termo ? db.catalogo_pecas.filter(cp => normalizarBusca(cp.nome).includes(termo)) : db.catalogo_pecas;
    el.innerHTML = montarChecklist('pecas', lista, termo) || checklistVazio('pecas', termo);
    renderPecasAtivas();
}
function togglePeca(catalogoId, nome) { const idx = stateOS.pecas.findIndex(p => p.catalogoId === catalogoId); if (idx >= 0) stateOS.pecas.splice(idx, 1); else stateOS.pecas.push({ id: Date.now().toString(), catalogoId, nome: nome.toUpperCase(), qtd: 1, custo: 0, venda: 0 }); renderChecklistPecas(); updateTotals(); }
function renderPecasAtivas() { const el = document.getElementById('pecas-ativas'); if (!el) return; el.innerHTML = stateOS.pecas.length ? `<div class="ativo-header-row" style="grid-template-columns: 2fr 0.6fr 1fr 1fr auto;"><span>Peça</span><span>Qtd</span><span>Custo</span><span>Venda</span><span></span></div>` + stateOS.pecas.map(p => `<div class="ativo-row" style="grid-template-columns: 2fr 0.6fr 1fr 1fr auto;"><span class="ativo-nome">${p.nome}</span><input type="number" value="${p.qtd}" oninput="updP('${p.id}','qtd',this.value)"><input type="number" value="${p.custo}" oninput="updP('${p.id}','custo',this.value)"><input type="number" value="${p.venda}" oninput="updP('${p.id}','venda',this.value)"><button class="btn btn-danger btn-sm" onclick="removePeca('${p.id}')">✕</button></div>`).join('') : '<p style="color:var(--text-dim); font-size:12px;">Vazio</p>'; }
function removePeca(id) { stateOS.pecas = stateOS.pecas.filter(p => p.id !== id); renderChecklistPecas(); updateTotals(); }

function updS(id, f, v) { const s = stateOS.servicos.find(x => x.id == id); if (s) s[f] = (f === 'valor' || f === 'qtd') ? Number(v) : v; updateTotals(); }
function updP(id, f, v) { const p = stateOS.pecas.find(x => x.id == id); if (p) p[f] = (f === 'nome') ? v.toUpperCase() : Number(v); updateTotals(); }
function updateTotals() {
    const mo = stateOS.servicos.reduce((a, s) => a + (Number(s.valor) * Number(s.qtd)), 0);
    const pe = stateOS.pecas.reduce((a, p) => a + (Number(p.venda) * Number(p.qtd)), 0);
    const elTotal = document.getElementById('res-total');
    if (elTotal) {
        elTotal.textContent = fmt(mo + pe);
        elTotal.dataset.valor = mo + pe;   // o número cru, para o cálculo do que falta receber
    }
    const elRodape = document.getElementById('rodape-total');
    if (elRodape) elRodape.textContent = fmt(mo + pe);
    atualizarContadoresEtapas();
    if (document.getElementById('sub-mo')) document.getElementById('sub-mo').textContent = fmt(mo);
    if (document.getElementById('sub-pecas')) document.getElementById('sub-pecas').textContent = fmt(pe);
    atualizarResumoPagamento();
}

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

        // Pagamento: o valor pago nunca passa do total nem fica negativo, e
        // "pago" sempre quita — assim o que falta receber não mente.
        const situacao = document.getElementById('d-pagamento') ? document.getElementById('d-pagamento').value : 'nao_pago';
        const formaPg = document.getElementById('d-forma-pagamento') ? document.getElementById('d-forma-pagamento').value : '';
        let pago = Number((document.getElementById('d-valor-pago') || {}).value) || 0;
        if (situacao === 'pago') pago = tot;
        if (situacao === 'nao_pago') pago = 0;
        pago = Math.min(Math.max(0, pago), tot);

        /* Cadastra (ou reconhece) o cliente e o veículo antes de gravar a OS.
           A OS guarda os dois: o vínculo, que cruza o histórico, e o texto,
           que é o que foi impresso e combinado na época. */
        const clienteId = await garantirCliente(clienteU);
        const veiculoId = await garantirVeiculo(
            { placa: placaU, marca: veiculoU, modelo: modeloU, motor: motorU, km: document.getElementById('d-km').value },
            clienteId);

        const ehRetorno = (document.getElementById('d-retorno') || {}).checked || false;
        const retornoDeOs = ehRetorno ? ((document.getElementById('d-retorno-os') || {}).value || null) : null;
        const retornoMotivo = ehRetorno ? ((document.getElementById('d-retorno-motivo') || {}).value || '').trim() : '';

        const data = { checklist: stateOS.checklist || {}, retorno_de_os: retornoDeOs, retorno_motivo: retornoMotivo, id, cliente_id: clienteId, veiculo_id: veiculoId, cliente: clienteU, veiculo: veiculoU, modelo: modeloU, placa: placaU, km: document.getElementById('d-km').value, motor: motorU, status: statusDoc, servicos: stateOS.servicos, pecas: stateOS.pecas, maoObra: tMO, custoPecas: cP, receitaPecas: rP, total: tot, lucro: tot - tCom - cP, comissao: tCom, data: dataRegistro, dataISO: dataISORegistro, pagamento: situacao, forma_pagamento: formaPg, valor_pago: pago };

        // TUDO VAI PARA A TABELA OS AGORA
        const erroGravar = stateOS.editId
            ? (await supabaseClient.from('os').update(data).eq('id', id)).error
            : await inserirNovoDoc(data);
        if (erroGravar) { console.error("Erro banco:", erroGravar); return toast("Erro ao gravar: " + mensagemErro(erroGravar), true); }

        // As fotos já estão no Storage; aqui só se amarra elas à OS, que só
        // agora tem número definitivo.
        if (typeof salvarFotosDaOS === 'function') await salvarFotosDaOS(data.id);

        if (document.getElementById('modal-doc')) document.getElementById('modal-doc').style.display = 'none';
        await carregarDados();
        toast(stateOS.type === 'os' ? "OS Gravada!" : "Orçamento Salvo!");
    } catch (e) {
        console.error("Erro ao salvar:", e); toast("Erro interno ao salvar.", true);
    }
}

/* NÚMERO DA OS SEM ATROPELAMENTO
   O número é sequencial (maxId + 1) porque é o que a oficina anota no papel.
   Só que dois aparelhos podem gerar o MESMO número ao mesmo tempo: o dono no
   tablet abrindo uma OS enquanto o mecânico no celular pede um orçamento.
   Com upsert, o segundo sobrescrevia o primeiro por inteiro — sem erro na
   tela, sem rastro, levando junto a comissão de quem trabalhou.

   Agora usa insert: se o número já existe, o banco recusa (23505) em vez de
   sobrescrever. Aí relemos o último número e tentamos o seguinte. */
async function proximoIdOS() {
    const { data, error } = await supabaseClient.from('os').select('id');
    if (error) return null;
    const maior = (data || []).reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
    return (maior + 1).toString();
}

async function inserirNovoDoc(data) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
        const { error } = await supabaseClient.from('os').insert([data]);
        if (!error) return null;
        if (error.code !== '23505') return error;   // erro de verdade, não colisão
        const novoId = await proximoIdOS();
        if (!novoId) return error;
        data.id = novoId;
    }
    return { message: 'Não foi possível reservar um número para esta OS. Tente de novo.' };
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

/* O papel que vai para a mão do cliente precisa dizer o mesmo que o sistema
   sabe. Faltavam: telefone, checklist de entrada, situação de pagamento,
   garantia por serviço, aviso de retorno e linha de assinatura — justamente
   o que se usa quando alguém contesta alguma coisa depois. */
function generatePDF() {
    const doc = db.os.find(x => x.id == stateOS.editId); if (!doc) return;
    const txt = (id, valor) => { const el = document.getElementById(id); if (el) el.textContent = valor; };
    const bloco = (id, visivel) => { const el = document.getElementById(id); if (el) el.style.display = visivel ? 'block' : 'none'; };

    txt('print-type', stateOS.type === 'os' ? 'Ordem de Serviço' : 'Orçamento');
    txt('print-id', doc.id);
    txt('print-date', doc.data);
    txt('print-status', (doc.status || '').toUpperCase());

    ['cliente', 'veiculo', 'modelo', 'placa', 'km', 'motor'].forEach(f => txt('print-' + f, doc[f] || 'Não informado'));

    const dono = clientePorId(doc.cliente_id);
    txt('print-telefone', (dono && dono.telefone) ? dono.telefone : 'Não informado');
    txt('print-assina-cliente', doc.cliente || '');

    // Retorno em garantia: sai destacado, porque é o que explica valor zerado
    // ou serviço repetido para quem lê o papel depois.
    const ehRetorno = !!doc.retorno_de_os;
    bloco('print-retorno', ehRetorno);
    if (ehRetorno) {
        txt('print-retorno-os', '#' + doc.retorno_de_os);
        txt('print-retorno-motivo', doc.retorno_motivo ? 'Motivo: ' + doc.retorno_motivo : '');
    }

    // Checklist só aparece se foi preenchido: seção vazia num documento
    // assinado sugere que nada foi conferido.
    const c = doc.checklist || {};
    const itens = Object.keys(c.itens || {}).filter(k => c.itens[k]);
    const temChecklist = !!(c.combustivel || itens.length || (c.avarias || '').trim());
    bloco('print-checklist-secao', temChecklist);
    if (temChecklist) {
        txt('print-combustivel', c.combustivel || 'Não informado');
        txt('print-entrada-data', doc.data || '--');
        txt('print-itens', itens.length ? itens.join(', ') : 'Nenhum item registrado');
        txt('print-avarias', (c.avarias || '').trim() || 'Nenhuma avaria observada na entrada');
    }

    const tabela = (id, linhas) => { const el = document.getElementById(id); if (el) el.innerHTML = linhas; };
    tabela('print-servicos', (doc.servicos || []).map(sv => {
        const dias = garantiaDoServico(sv.catalogoId);
        const garantia = dias > 0 ? dias + ' dias' : 'Sem garantia';
        return `<tr><td>${sv.descricao}</td><td>${garantia}</td><td>${sv.qtd}</td><td>${fmt(sv.valor)}</td><td>${fmt(sv.valor * sv.qtd)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">Nenhum serviço.</td></tr>');

    tabela('print-pecas', (doc.pecas || []).map(p =>
        `<tr><td>${p.nome}</td><td>${p.qtd}</td><td>${fmt(p.venda)}</td><td>${fmt(p.venda * p.qtd)}</td></tr>`
    ).join('') || '<tr><td colspan="4">Nenhuma peça.</td></tr>');

    txt('print-sub-mo', fmt(doc.maoObra));
    txt('print-sub-pe', fmt(doc.receitaPecas));
    txt('print-total', fmt(doc.total));

    // Orçamento ainda não tem pagamento para mostrar.
    const mostrarPagamento = stateOS.type === 'os';
    bloco('print-pagamento-secao', mostrarPagamento);
    if (mostrarPagamento) {
        const falta = aReceberDaOS(doc);
        txt('print-pg-situacao', nomeSituacao(doc.pagamento).nome);
        txt('print-pg-forma', nomeForma(doc.forma_pagamento) || 'Não informada');
        txt('print-pg-pago', fmt(doc.valor_pago));
        txt('print-pg-falta', fmt(falta));
    }

    const temGarantia = (doc.servicos || []).some(sv => garantiaDoServico(sv.catalogoId) > 0);
    bloco('print-garantia-nota', temGarantia);

    window.print();
}


/* =========================================
   8. OUTRAS PÁGINAS E EXTRAS
========================================= */
function renderPainelMecanico() {
    const dIni = document.getElementById('m-data-inicio') ? document.getElementById('m-data-inicio').value : ''; const dFim = document.getElementById('m-data-fim') ? document.getElementById('m-data-fim').value : ''; let totalMO = 0, totalComissao = 0, qtd = 0; const html = []; db.os.filter(o => osConcluida(o)).forEach(o => { const iso = o.dataISO || parseBRDateToISO(o.data); if ((!dIni || iso >= dIni) && (!dFim || iso <= dFim)) { o.servicos.forEach(s => { if (s.mecanicoId == session.id) { totalMO += (Number(s.valor) * Number(s.qtd)); totalComissao += (Number(s.comissaoVal) || 0); qtd++; html.push(`<tr><td>${o.data}</td><td>${o.veiculo}</td><td>${s.descricao}</td><td style="color:var(--success); font-weight:bold;">${fmt(s.comissaoVal)}</td></tr>`); } }); } }); const elCom = document.getElementById('mec-total-comissao'); if (elCom) elCom.textContent = fmt(totalComissao); const elMo = document.getElementById('mec-total-mo'); if (elMo) elMo.textContent = fmt(totalMO); const elQtd = document.getElementById('mec-qtd-trabalhos'); if (elQtd) elQtd.textContent = qtd; const elBody = document.getElementById('mec-tbody'); if (elBody) elBody.innerHTML = html.join('') || '<tr><td colspan="4" style="text-align:center;">Nenhum serviço.</td></tr>';

    // Lista os orçamentos que este mecânico solicitou
    const orcHtml = [];
    db.os.filter(o => o.status === 'orcamento' || o.status === 'rejeitado').forEach(o => {
        const isMine = o.servicos.some(s => s.mecanicoId == session.id);
        if (isMine) { orcHtml.push(`<tr><td>${o.data}</td><td>${o.veiculo} / ${o.placa}</td><td>${getStatusBadge(o.status)}</td></tr>`); }
    });
    const elOrc = document.getElementById('mec-orc-tbody');
    if (elOrc) elOrc.innerHTML = orcHtml.join('') || '<tr><td colspan="3" style="text-align:center;">Nenhuma solicitação.</td></tr>';
}

let mecEditId = null;

/* A senha do mecânico não pode mais ser LIDA — só substituída. O hash fica no
   banco e não volta para o navegador. Por isso, ao editar, o campo abre vazio:
   em branco mantém a atual, preenchido troca. */
function openMecModal(editId = null) {
    mecEditId = editId;
    const campoSenha = document.getElementById('m-senha');
    const dica = document.getElementById('mec-senha-dica');
    if (editId) {
        const m = db.mecanicos.find(x => x.id === editId);
        document.getElementById('m-nome').value = m.nome;
        document.getElementById('m-com').value = m.comissao;
        document.getElementById('modal-mec-title').textContent = 'Editar Mecânico';
        if (dica) dica.textContent = 'Deixe em branco para manter a senha atual.';
    } else {
        document.getElementById('m-nome').value = '';
        document.getElementById('m-com').value = '';
        document.getElementById('modal-mec-title').textContent = 'Cadastrar Mecânico';
        if (dica) dica.textContent = 'Esta será a senha que ele usa para entrar pelo celular.';
    }
    if (campoSenha) { campoSenha.value = ''; campoSenha.type = 'password'; }
    const visivel = document.getElementById('mec-senha-visible');
    if (visivel) visivel.style.display = 'none';
    document.getElementById('modal-mec').style.display = 'flex';
}

async function saveMec() {
    const nome = document.getElementById('m-nome').value.trim();
    const senha = document.getElementById('m-senha').value.trim();
    if (!nome) return toast("Informe o nome!", true);
    if (!mecEditId && !senha) return toast("Defina uma senha para o novo mecânico!", true);

    const { error } = await supabaseClient.rpc('salvar_mecanico', {
        p_id: mecEditId || '',
        p_nome: nome,
        p_comissao: Number(document.getElementById('m-com').value) || 0,
        p_senha: senha,
    });
    if (error) { console.error("Salvar mecânico:", error); return toast(mensagemErro(error), true); }

    document.getElementById('modal-mec').style.display = 'none';
    mecEditId = null;
    await carregarDados();
    toast(senha ? "Salvo! Senha definida." : "Salvo!");
}

async function deleteMec(id) {
    const m = db.mecanicos.find(x => x.id === id);
    if (!confirm(`Remover ${m ? m.nome : 'este mecânico'}?\n\nAs OS que ele já fez continuam no sistema, mas a comissão dele some dos relatórios.`)) return;
    const { error } = await supabaseClient.rpc('deletar_mecanico', { p_id: id });
    if (error) { console.error("Remover mecânico:", error); return toast(mensagemErro(error), true); }
    await carregarDados();
    toast("Removido!");
}

function renderMecanicos() {
    const el = document.getElementById('mec-grid'); if (!el) return;
    el.innerHTML = db.mecanicos.map(m => `<div class="stat-card"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><h3 style="font-size:1rem;">${m.nome}</h3><button class="btn btn-secondary btn-sm" onclick="openMecModal('${m.id}')">✏️</button></div><div class="label" style="margin-top:12px;">Comissão Ativa</div><div class="value" style="color:var(--brand); font-size:1.4rem;">${m.comissao}%</div><div class="label" style="margin-top:12px;">Senha</div><div style="font-size:12px; color:var(--text-dim); margin-top:6px;">Guardada com segurança. Para trocar, toque em ✏️.</div><button class="btn btn-danger btn-sm" style="width:100%; margin-top:15px;" onclick="deleteMec('${m.id}')">✕ Remover</button></div>`).join('') || '<p style="text-align:center; color:var(--text-dim); width:100%;">Vazio</p>';
}
function renderCatalogo() { const elP = document.getElementById('catalog-pecas-list'); if (elP) elP.innerHTML = db.catalogo_pecas.map(p => `<div class="catalog-item"><div class="catalog-item-info"><strong>${p.nome}</strong><span class="catalog-badge badge-peca">Peça</span></div><button class="btn btn-danger btn-sm" onclick="deleteCatalogItem('pecas', '${p.id}')">✕</button></div>`).join('') || '<p class="catalog-empty">Vazio</p>'; const elS = document.getElementById('catalog-servicos-list'); if (elS) elS.innerHTML = db.catalogo_servicos.map(s => `<div class="catalog-item"><div class="catalog-item-info"><strong>${s.nome}</strong><span class="catalog-badge badge-servico">Serviço</span></div><button class="btn btn-danger btn-sm" onclick="deleteCatalogItem('servicos', '${s.id}')">✕</button></div>`).join('') || '<p class="catalog-empty">Vazio</p>'; } async function addCatalogItem(type) { const inp = document.getElementById(type === 'pecas' ? 'cat-peca-nome' : 'cat-servico-nome'); const nome = inp.value.trim().toUpperCase(); if (!nome) return; await supabaseClient.from(type === 'pecas' ? 'catalogo_pecas' : 'catalogo_servicos').insert([{ id: Date.now().toString(), nome }]); inp.value = ''; await carregarDados(); toast("Adicionado!"); } async function deleteCatalogItem(type, id) { await supabaseClient.from(type === 'pecas' ? 'catalogo_pecas' : 'catalogo_servicos').delete().eq('id', id); await carregarDados(); toast("Removido!"); }
function filterRelatorios() { renderRelatorios(); } function filterRelatoriosToday() { const t = getTodayString(); document.getElementById('r-data-inicio').value = t; document.getElementById('r-data-fim').value = t; renderRelatorios(); } function clearRelatoriosFilter() { document.getElementById('r-data-inicio').value = ''; document.getElementById('r-data-fim').value = ''; renderRelatorios(); } function renderRelatorios() { const el = document.getElementById('r-mec-body'); if (!el) return; const dIni = document.getElementById('r-data-inicio').value; const dFim = document.getElementById('r-data-fim').value; const rank = db.mecanicos.map(m => { let mo = 0, com = 0; db.os.filter(o => osConcluida(o)).forEach(o => { const iso = o.dataISO || parseBRDateToISO(o.data); if ((!dIni || iso >= dIni) && (!dFim || iso <= dFim)) { o.servicos.forEach(s => { if (s.mecanicoId == m.id) { mo += (Number(s.valor) * Number(s.qtd)); com += (Number(s.comissaoVal) || 0); } }); } }); return { nome: m.nome, mo, com }; }).sort((a, b) => b.mo - a.mo); el.innerHTML = rank.map(m => `<tr><td>${m.nome}</td><td>${fmt(m.mo)}</td><td style="color:var(--brand)">${fmt(m.com)}</td></tr>`).join(''); }
/* =========================================
   COBRANÇAS — quem deve, quanto e há quanto tempo
   O universo aqui é só OS concluída (finalizada ou entregue). Serviço que
   ainda está na bancada não é cobrança, e manter esse mesmo recorte faz o
   total bater exatamente com o card "A RECEBER" do painel.
========================================= */
let filtroCobranca = 'receber';

const FILTROS_COBRANCA = {
    receber: { label: 'Total a receber', teste: (o) => o.pagamento !== 'pago' },
    parcial: { label: 'Falta acertar', teste: (o) => o.pagamento === 'parcial' },
    pago: { label: 'Total recebido', teste: (o) => o.pagamento === 'pago' },
    todos: { label: 'Total concluído', teste: () => true },
};

function setFiltroCobranca(f) {
    filtroCobranca = FILTROS_COBRANCA[f] ? f : 'receber';
    document.querySelectorAll('#cobranca-filtros [data-cob]').forEach(b => {
        const ativo = b.getAttribute('data-cob') === filtroCobranca;
        b.classList.toggle('btn-primary', ativo);
        b.classList.toggle('btn-secondary', !ativo);
    });
    renderCobrancas();
}

function irParaCobrancas() {
    const btn = document.querySelector('.nav-item[data-page="cobrancas"]');
    if (btn) btn.click();
    setFiltroCobranca('receber');
}

/* Dias desde que a OS foi registrada. É o que dá urgência à cobrança:
   "500 reais" incomoda menos que "500 reais parados há 90 dias". */
function diasEmAberto(o) {
    const iso = o.dataISO || parseBRDateToISO(o.data);
    if (!iso) return 0;
    const dia = new Date(iso + 'T00:00:00');
    if (isNaN(dia)) return 0;
    return Math.max(0, Math.floor((Date.now() - dia.getTime()) / 86400000));
}

async function quitarOS(id) {
    const o = db.os.find(x => x.id == id);
    if (!o) return;
    if (!confirm(`Marcar a OS #${o.id} de ${o.cliente || 'sem nome'} como PAGA?\n\nValor: ${fmt(o.total)}`)) return;
    const { error } = await supabaseClient.from('os')
        .update({ pagamento: 'pago', valor_pago: Number(o.total) || 0 }).eq('id', o.id);
    if (error) { console.error(error); return toast('Erro ao quitar: ' + mensagemErro(error), true); }
    await carregarDados();
    toast('OS #' + o.id + ' quitada!');
}

function renderCobrancas() {
    const el = document.getElementById('cob-tbody'); if (!el) return;
    const filtro = FILTROS_COBRANCA[filtroCobranca] || FILTROS_COBRANCA.receber;

    // Mais antiga primeiro: a fila de cobrança começa por quem deve há mais tempo.
    const lista = db.os.filter(o => osConcluida(o) && filtro.teste(o))
        .sort((a, b) => diasEmAberto(b) - diasEmAberto(a) || Number(b.id) - Number(a.id));

    const soma = lista.reduce((a, o) => a + (filtroCobranca === 'pago' ? (Number(o.valor_pago) || 0) : aReceberDaOS(o)), 0);

    const elLabel = document.getElementById('cob-label-total');
    if (elLabel) elLabel.textContent = filtro.label;
    const elTotal = document.getElementById('cob-total');
    if (elTotal) elTotal.textContent = fmt(soma);
    const elQtd = document.getElementById('cob-qtd');
    if (elQtd) elQtd.textContent = lista.length + (lista.length === 1 ? ' ordem' : ' ordens');

    const emAberto = lista.filter(o => aReceberDaOS(o) > 0);
    const elAntiga = document.getElementById('cob-antiga');
    const elAntigaInfo = document.getElementById('cob-antiga-info');
    if (elAntiga && elAntigaInfo) {
        if (emAberto.length) {
            const velha = emAberto[0];
            elAntiga.textContent = diasEmAberto(velha) + ' dias';
            elAntigaInfo.textContent = '#' + velha.id + ' · ' + (velha.cliente || 'sem nome') + ' · ' + fmt(aReceberDaOS(velha));
        } else {
            elAntiga.textContent = '--';
            elAntigaInfo.textContent = 'Nada em aberto';
        }
    }

    el.innerHTML = lista.map(o => {
        const falta = aReceberDaOS(o);
        const dias = diasEmAberto(o);
        // Vermelho a partir de 30 dias: é quando a conversa deixa de ser lembrete.
        const corDias = falta > 0 && dias >= 30 ? 'var(--danger)' : 'var(--text-dim)';
        return `<tr>
            <td>#${o.id}</td>
            <td>${o.data || '--'}</td>
            <td style="color:${corDias}; font-weight:700;">${dias}</td>
            <td>${o.cliente || 'Sem nome'}</td>
            <td>${o.veiculo || ''} ${o.placa ? '· ' + o.placa : ''}</td>
            <td>${fmt(o.total)}</td>
            <td style="color:var(--success);">${fmt(o.valor_pago)}</td>
            <td style="color:${falta > 0 ? 'var(--danger)' : 'var(--text-dim)'}; font-weight:700;">${fmt(falta)}</td>
            <td>${nomeForma(o.forma_pagamento) || '--'}</td>
            <td style="white-space:nowrap;">
                ${falta > 0 ? `<button class="btn btn-success btn-sm" onclick="quitarOS('${o.id}')">✓ Quitar</button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="openDocModal('os','${o.id}')">✏️ Abrir</button>
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="10" style="text-align:center; color:var(--text-dim);">Nenhuma ordem nesta situação.</td></tr>`;
}

/* =========================================
   VEÍCULOS E FICHA DO CLIENTE
   Responde as perguntas do balcão: "o que já fizemos nesse carro?",
   "quando foi a última vez?", "esse aí me deve alguma coisa?".
========================================= */
let fichaVeiculoId = null;

function resumoDoVeiculo(v) {
    const lista = osDoVeiculo(v.id, v.placa);
    const concluidas = lista.filter(osConcluida);
    return {
        lista,
        qtd: concluidas.length,
        total: concluidas.reduce((a, o) => a + (Number(o.total) || 0), 0),
        aberto: lista.filter(osNaCarteira).reduce((a, o) => a + aReceberDaOS(o), 0),
        ultima: lista.length ? lista[0].data : null,
    };
}

function renderVeiculos() {
    const el = document.getElementById('veic-tbody'); if (!el) return;
    const termo = normalizarBusca((document.getElementById('veic-busca') || {}).value || '');

    const linhas = db.veiculos.map(v => {
        const dono = clientePorId(v.cliente_id);
        return { v, dono, ...resumoDoVeiculo(v) };
    }).filter(r => {
        if (!termo) return true;
        const alvo = [r.v.placa, r.v.marca, r.v.modelo, r.dono ? r.dono.nome : ''].join(' ');
        return normalizarBusca(alvo).includes(termo);
    }).sort((a, b) => Number(b.lista.length ? b.lista[0].id : 0) - Number(a.lista.length ? a.lista[0].id : 0));

    el.innerHTML = linhas.map(r => `<tr>
        <td><strong>${r.v.placa}</strong></td>
        <td>${[r.v.marca, r.v.modelo].filter(Boolean).join(' ') || '--'}</td>
        <td>${r.v.ano || '--'}</td>
        <td>${r.dono ? r.dono.nome : '<span style="color:var(--text-dim);">Sem dono</span>'}</td>
        <td>${r.dono && r.dono.telefone ? r.dono.telefone : '--'}</td>
        <td>${r.qtd}</td>
        <td>${r.ultima || '--'}</td>
        <td>${fmt(r.total)}${r.aberto > 0 ? ` <span style="color:var(--danger); font-size:11px; font-weight:700;">(${fmt(r.aberto)} em aberto)</span>` : ''}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="abrirFicha('${r.v.id}')">📋 Ficha</button></td>
    </tr>`).join('') || `<tr><td colspan="9" style="text-align:center; color:var(--text-dim);">${termo ? 'Nenhum veículo encontrado.' : 'Nenhum veículo ainda. Eles são cadastrados sozinhos quando você grava uma OS com placa.'}</td></tr>`;
}

function abrirFicha(veiculoId) {
    const v = db.veiculos.find(x => x.id === veiculoId); if (!v) return;
    fichaVeiculoId = veiculoId;
    const dono = clientePorId(v.cliente_id);
    const r = resumoDoVeiculo(v);

    document.getElementById('ficha-placa').textContent = v.placa;
    document.getElementById('ficha-veiculo').textContent =
        [[v.marca, v.modelo].filter(Boolean).join(' '), v.ano, v.motor, v.km_atual ? v.km_atual + ' km' : ''].filter(Boolean).join(' · ') || 'Sem dados do veículo';

    document.getElementById('ficha-cliente-nome').value = dono ? dono.nome : '';
    document.getElementById('ficha-cliente-telefone').value = dono ? (dono.telefone || '') : '';
    document.getElementById('ficha-cliente-obs').value = dono ? (dono.observacoes || '') : '';

    document.getElementById('ficha-qtd').textContent = r.qtd;
    document.getElementById('ficha-total').textContent = fmt(r.total);
    document.getElementById('ficha-aberto').textContent = fmt(r.aberto);

    document.getElementById('ficha-tbody').innerHTML = r.lista.map(o => `<tr>
        <td>#${o.id}</td>
        <td>${o.data || '--'}</td>
        <td>${o.km || '--'}</td>
        <td style="max-width:280px;">${(o.servicos || []).map(sv => sv.descricao).join(', ') || '--'}</td>
        <td>${fmt(o.total)}</td>
        <td>${getStatusBadge(o.status)}${osConcluida(o) ? ' ' + getPagamentoBadge(o) : ''}${getRetornoBadge(o)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-ficha').style.display='none'; openDocModal('os','${o.id}')">✏️</button></td>
    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center; color:var(--text-dim);">Nenhum serviço registrado neste veículo.</td></tr>';

    document.getElementById('modal-ficha').style.display = 'flex';
}

/* O telefone e a observação do cliente só existem aqui: é onde você está
   quando descobre que precisa deles (cobrando, ou atendendo o carro). */
async function salvarFichaCliente() {
    const v = db.veiculos.find(x => x.id === fichaVeiculoId); if (!v) return;
    const nome = document.getElementById('ficha-cliente-nome').value.trim();
    if (!nome) return toast('Informe o nome do cliente!', true);

    const telefone = document.getElementById('ficha-cliente-telefone').value.trim();
    const observacoes = document.getElementById('ficha-cliente-obs').value.trim();

    let clienteId = v.cliente_id;
    const atual = clientePorId(clienteId);
    // Nome diferente do cadastrado: é outro dono (carro vendido), então o
    // veículo passa a apontar para ele — sem mexer nas OS antigas, que guardam
    // o nome de quem era o dono na época.
    if (!atual || chaveNome(atual.nome) !== chaveNome(nome)) {
        clienteId = await garantirCliente(nome);
        if (clienteId && clienteId !== v.cliente_id) {
            await supabaseClient.from('veiculos').update({ cliente_id: clienteId }).eq('id', v.id);
            v.cliente_id = clienteId;
        }
    }
    if (!clienteId) return toast('Não consegui salvar o cliente.', true);

    const { error } = await supabaseClient.from('clientes')
        .update({ nome: nome.toUpperCase(), telefone, observacoes }).eq('id', clienteId);
    if (error) { console.error('Cliente:', error); return toast(mensagemErro(error), true); }

    await carregarDados();
    abrirFicha(fichaVeiculoId);
    toast('Cliente salvo!');
}

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