/* =====================================================
   BETÃO — Adicionar peça/serviço na hora + CAIXA ALTA
   Carregado DEPOIS do script.js (usa db, stateOS, etc).
   ===================================================== */

/* ---------- Criar SERVIÇO na hora ---------- */
async function addQuickServico() {
    var inp = document.getElementById('quick-servico-nome');
    if (!inp) return;
    var nome = inp.value.trim().toUpperCase();
    if (!nome) return;

    var existente = db.catalogo_servicos.find(function (s) {
        return (s.nome || '').toUpperCase() === nome;
    });
    var id;

    if (existente) {
        id = existente.id;
    } else {
        id = Date.now().toString();
        var resp = await supabaseClient.from('catalogo_servicos').insert([{ id: id, nome: nome }]);
        if (resp.error) {
            console.error('Erro ao salvar serviço:', resp.error);
            toast('Erro ao salvar serviço: ' + resp.error.message, true);
            return;
        }
        db.catalogo_servicos.push({ id: id, nome: nome });
    }

    // Marca na OS atual (se ainda não estiver) e atualiza a lista
    if (!stateOS.servicos.find(function (s) { return s.catalogoId === id; })) {
        toggleServico(id, nome);
    } else {
        renderChecklistServicos();
    }

    inp.value = '';
    inp.focus();
    toast(existente ? 'Serviço selecionado!' : 'Serviço criado e salvo no catálogo!');
}

/* ---------- Criar PEÇA na hora ---------- */
async function addQuickPeca() {
    var inp = document.getElementById('quick-peca-nome');
    if (!inp) return;
    var nome = inp.value.trim().toUpperCase();
    if (!nome) return;

    var existente = db.catalogo_pecas.find(function (p) {
        return (p.nome || '').toUpperCase() === nome;
    });
    var id;

    if (existente) {
        id = existente.id;
    } else {
        id = Date.now().toString();
        var resp = await supabaseClient.from('catalogo_pecas').insert([{ id: id, nome: nome }]);
        if (resp.error) {
            console.error('Erro ao salvar peça:', resp.error);
            toast('Erro ao salvar peça: ' + resp.error.message, true);
            return;
        }
        db.catalogo_pecas.push({ id: id, nome: nome });
    }

    if (!stateOS.pecas.find(function (p) { return p.catalogoId === id; })) {
        togglePeca(id, nome);
    } else {
        renderChecklistPecas();
    }

    inp.value = '';
    inp.focus();
    toast(existente ? 'Peça selecionada!' : 'Peça criada e salva no catálogo!');
}

/* ---------- CAIXA ALTA automática em tudo que é digitado ----------
   Converte o valor real do campo para maiúsculas enquanto se digita.
   Não mexe em: senhas, campos numéricos e na tela de login.        */
document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'password' || type === 'number') return;
    if (el.closest && el.closest('#auth-screen')) return;        // protege login/senha
    if (el.hasAttribute && el.hasAttribute('data-no-upper')) return;

    var upper = el.value.toUpperCase();
    if (upper !== el.value) {
        var start = el.selectionStart, end = el.selectionEnd;
        el.value = upper;
        try { el.setSelectionRange(start, end); } catch (_) { }
    }
}, true);
