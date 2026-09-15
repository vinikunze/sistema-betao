/* =====================================================
   BETÃO — Teste de conexão
   Quando o navegador não consegue falar com o banco, o erro que aparece na
   tela é sempre o mesmo texto genérico — "Failed to fetch" no Chrome,
   "Load failed" no iPhone — seja qual for a causa real. Isso torna o
   problema impossível de diagnosticar só olhando a mensagem.

   Este teste separa as causas fazendo DUAS chamadas diferentes:

   P1: chamada normal, com a chave. É a mesma que o app faz.
   P2: chamada "no-cors". O navegador não deixa ler a resposta, mas ela só
       falha se o aparelho realmente não alcançar o servidor.

   Comparando as duas dá pra saber onde está o problema:
     P1 ok                  -> está tudo certo
     P1 respondeu com erro  -> chegou no banco; é a chave ou a permissão
     P1 falhou, P2 ok       -> alcança o servidor, mas a chamada é barrada
     P1 falhou, P2 falhou   -> o aparelho não alcança o Supabase (rede)
   ===================================================== */
(function () {
    "use strict";

    var TEMPO_LIMITE = 12000;

    function comLimite(promessa, ms) {
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, ms);
        return { sinal: ctrl.signal, fim: function () { clearTimeout(t); } };
    }

    async function sondaComChave() {
        var lim = comLimite(null, TEMPO_LIMITE);
        try {
            var resp = await fetch(supabaseUrl + '/rest/v1/socios?select=id&limit=1', {
                headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey },
                signal: lim.sinal
            });
            var corpo = '';
            try { corpo = (await resp.text()).slice(0, 200); } catch (e) { }
            return { ok: resp.ok, status: resp.status, corpo: corpo };
        } catch (e) {
            return { ok: false, status: null, erro: String(e && e.message || e) };
        } finally { lim.fim(); }
    }

    async function sondaSemCors() {
        var lim = comLimite(null, TEMPO_LIMITE);
        try {
            await fetch(supabaseUrl + '/rest/v1/', { mode: 'no-cors', signal: lim.sinal });
            return { alcancou: true };
        } catch (e) {
            return { alcancou: false, erro: String(e && e.message || e) };
        } finally { lim.fim(); }
    }

    async function estadoServiceWorker() {
        if (!('serviceWorker' in navigator)) return 'não suportado';
        try {
            var reg = await navigator.serviceWorker.getRegistration();
            if (!reg) return 'nenhum instalado';
            var script = (reg.active && reg.active.scriptURL) || '(sem ativo)';
            var controla = navigator.serviceWorker.controller ? 'controlando a página' : 'instalado, sem controlar';
            var nomes = [];
            try { nomes = await caches.keys(); } catch (e) { }
            return script.split('/').pop() + ' — ' + controla + (nomes.length ? ' — cache: ' + nomes.join(', ') : '');
        } catch (e) { return 'erro ao consultar: ' + e.message; }
    }

    function concluir(p1, p2) {
        if (p1.ok) {
            return { cor: 'ok', texto: 'Está tudo certo. O aparelho fala com o banco normalmente. Se mesmo assim o cadastro falhar, o problema é outro — me avise.' };
        }
        if (p1.status) {
            return {
                cor: 'aviso',
                texto: 'O aparelho CHEGOU no banco, e o banco respondeu com erro ' + p1.status + '. A internet está boa; o problema é a chave de acesso ou a permissão da tabela. Isso se resolve no código — me mande este resultado.'
            };
        }
        if (p2.alcancou) {
            return {
                cor: 'aviso',
                texto: 'O aparelho alcança o servidor, mas a chamada com a chave é barrada antes de chegar. Costuma ser filtro de rede (Wi-Fi da oficina, antivírus, extensão) mexendo na resposta. Teste no 4G, com o Wi-Fi desligado.'
            };
        }
        return {
            cor: 'erro',
            texto: 'O aparelho NÃO alcança o Supabase de jeito nenhum. A internet do aparelho pode estar bloqueando esse endereço — Wi-Fi da oficina, DNS, firewall ou portal de login. Teste no 4G, com o Wi-Fi desligado: se funcionar, o problema é a rede da oficina, não o sistema.'
        };
    }

    function linha(rotulo, valor) {
        return '<div class="diag-linha"><span>' + rotulo + '</span><strong>' + valor + '</strong></div>';
    }

    window.testarConexao = async function () {
        var el = document.getElementById('diag-resultado');
        if (!el) return;
        el.style.display = 'block';
        el.innerHTML = '<p class="diag-titulo">Testando…</p>';

        var host = supabaseUrl;
        try { host = new URL(supabaseUrl).host; } catch (e) { }

        var sw = await estadoServiceWorker();
        var p1 = await sondaComChave();
        var p2 = p1.ok || p1.status ? { alcancou: true } : await sondaSemCors();
        var fim = concluir(p1, p2);

        var versao = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : 'código antigo (sem marca de versão)';

        var corpo = ''
            + linha('Versão do código', versao)
            + linha('Banco', host)
            + linha('Internet do aparelho', navigator.onLine ? 'conectado' : 'SEM CONEXÃO')
            + linha('Service worker', sw)
            + linha('Chamada com a chave', p1.ok ? 'OK (' + p1.status + ')'
                : p1.status ? 'respondeu ' + p1.status + (p1.corpo ? ' — ' + p1.corpo : '')
                    : 'falhou — ' + (p1.erro || 'sem detalhe'))
            + linha('Servidor alcançável', p2.alcancou ? 'sim' : 'não');

        el.innerHTML = '<p class="diag-titulo">Teste de conexão</p>'
            + corpo
            + '<p class="diag-conclusao diag-' + fim.cor + '">' + fim.texto + '</p>'
            + '<button type="button" class="btn btn-secondary btn-sm" onclick="copiarDiagnostico()">Copiar resultado</button>';

        el.dataset.texto = el.innerText;
    };

    window.copiarDiagnostico = function () {
        var el = document.getElementById('diag-resultado');
        if (!el) return;
        var txt = el.dataset.texto || el.innerText;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(
                function () { toast('Resultado copiado! Cole na conversa.'); },
                function () { toast('Não consegui copiar. Tire um print da tela.', true); }
            );
        } else {
            toast('Não consegui copiar. Tire um print da tela.', true);
        }
    };
})();
