/* =====================================================
   BETÃO — Checklist de entrada e fotos do veículo
   Registra a condição do carro na chegada. O problema que isso resolve é
   concreto: o cliente volta dizendo que o amassado foi a oficina. Com o
   registro e a foto datados da entrada, a conversa acaba ali.
   Carregado DEPOIS do script.js.
   ===================================================== */
(function () {
    "use strict";

    var NIVEIS = ['E', '1/4', '1/2', '3/4', 'F'];

    // Itens que somem e viram discussão. A lista vem do que as oficinas
    // conferem na recepção do veículo.
    var ITENS = [
        'Estepe', 'Macaco', 'Chave de roda', 'Triângulo', 'Extintor',
        'Documento', 'Manual', 'Rádio', 'Tapetes', 'Calotas',
    ];

    var MAX_LADO = 1200;   // grande o bastante para mostrar um risco, pequeno
    var QUALIDADE = 0.7;   // o bastante para subir rápido no 4G da oficina

    /* ---------- estado do checklist em edição ---------- */
    function estado() {
        if (!stateOS.checklist) stateOS.checklist = { combustivel: '', itens: {}, avarias: '' };
        if (!stateOS.fotos) stateOS.fotos = [];
        return stateOS.checklist;
    }

    /* ---------- desenho ---------- */
    function montarCombustivel() {
        var el = document.getElementById('combustivel-barra');
        if (!el) return;
        var atual = estado().combustivel;
        el.innerHTML = NIVEIS.map(function (n) {
            return '<button type="button" class="combustivel-btn' + (n === atual ? ' ativo' : '') +
                '" onclick="setCombustivel(\'' + n + '\')">' + n + '</button>';
        }).join('');
    }

    function montarItens() {
        var el = document.getElementById('itens-grid');
        if (!el) return;
        var marcados = estado().itens || {};
        el.innerHTML = ITENS.map(function (nome) {
            var on = !!marcados[nome];
            return '<button type="button" class="item-btn' + (on ? ' ativo' : '') +
                '" onclick="toggleItemEntrada(\'' + nome + '\')">' +
                '<span class="item-check">' + (on ? '✓' : '') + '</span>' + nome + '</button>';
        }).join('');
    }

    function montarFotos() {
        var el = document.getElementById('entrada-fotos');
        if (!el) return;
        var fotos = stateOS.fotos || [];
        el.innerHTML = fotos.map(function (f, i) {
            return '<div class="foto-item">' +
                '<img src="' + (f.url || '') + '" alt="Foto ' + (i + 1) + '">' +
                '<button type="button" class="foto-remover" onclick="removerFoto(' + i + ')">✕</button>' +
                '</div>';
        }).join('');
    }

    function atualizarResumo() {
        var el = document.getElementById('entrada-resumo');
        if (!el) return;
        var c = estado();
        var qtdItens = Object.keys(c.itens || {}).filter(function (k) { return c.itens[k]; }).length;
        var partes = [];
        if (c.combustivel) partes.push('⛽ ' + c.combustivel);
        if (qtdItens) partes.push(qtdItens + (qtdItens === 1 ? ' item' : ' itens'));
        if ((c.avarias || '').trim()) partes.push('avarias anotadas');
        if ((stateOS.fotos || []).length) partes.push((stateOS.fotos.length) + ' foto' + (stateOS.fotos.length === 1 ? '' : 's'));
        el.textContent = partes.length ? partes.join(' · ') : 'não preenchido';
        el.classList.toggle('preenchido', partes.length > 0);
    }

    window.renderChecklistEntrada = function () {
        montarCombustivel(); montarItens(); montarFotos(); atualizarResumo();
        var av = document.getElementById('entrada-avarias');
        if (av) av.value = estado().avarias || '';
    };

    /* ---------- interações ---------- */
    window.setCombustivel = function (n) {
        var c = estado();
        c.combustivel = (c.combustivel === n) ? '' : n;   // tocar de novo desmarca
        montarCombustivel(); atualizarResumo();
    };

    window.toggleItemEntrada = function (nome) {
        var c = estado();
        if (!c.itens) c.itens = {};
        c.itens[nome] = !c.itens[nome];
        montarItens(); atualizarResumo();
    };

    document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'entrada-avarias') {
            estado().avarias = e.target.value;
            atualizarResumo();
        }
    });

    /* ---------- fotos ---------- */
    /* Reduz antes de subir: a foto de um tablet moderno tem vários MB, e o que
       importa aqui é enxergar o risco, não a resolução. */
    function reduzir(arquivo) {
        return new Promise(function (resolve, reject) {
            var leitor = new FileReader();
            leitor.onerror = function () { reject(new Error('Não consegui ler a imagem')); };
            leitor.onload = function (ev) {
                var img = new Image();
                img.onerror = function () { reject(new Error('Arquivo não é uma imagem válida')); };
                img.onload = function () {
                    var escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * escala);
                    canvas.height = Math.round(img.height * escala);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(function (blob) {
                        blob ? resolve(blob) : reject(new Error('Não consegui converter a imagem'));
                    }, 'image/jpeg', QUALIDADE);
                };
                img.src = ev.target.result;
            };
            leitor.readAsDataURL(arquivo);
        });
    }

    window.adicionarFotos = async function (ev) {
        var arquivos = Array.from(ev.target.files || []);
        ev.target.value = '';                    // permite escolher a mesma foto de novo
        if (!arquivos.length || !supabaseClient) return;

        for (var i = 0; i < arquivos.length; i++) {
            try {
                var blob = await reduzir(arquivos[i]);
                var caminho = 'entrada/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
                var envio = await supabaseClient.storage.from('os-fotos')
                    .upload(caminho, blob, { contentType: 'image/jpeg' });
                if (envio.error) { console.error('Foto:', envio.error); toast('Erro ao enviar foto: ' + mensagemErro(envio.error), true); continue; }

                // Bucket é privado: para exibir, precisa de URL assinada.
                var assinada = await supabaseClient.storage.from('os-fotos').createSignedUrl(caminho, 3600);
                stateOS.fotos.push({ caminho: caminho, url: assinada.data ? assinada.data.signedUrl : '' });
                montarFotos(); atualizarResumo();
            } catch (e) {
                console.error('Foto:', e);
                toast(e.message || 'Erro ao processar a foto', true);
            }
        }
        toast('Foto adicionada!');
    };

    window.removerFoto = async function (i) {
        var f = (stateOS.fotos || [])[i];
        if (!f) return;
        if (!confirm('Remover esta foto?')) return;
        try { await supabaseClient.storage.from('os-fotos').remove([f.caminho]); } catch (e) { console.error(e); }
        if (f.id) { try { await supabaseClient.from('os_fotos').delete().eq('id', f.id); } catch (e) { console.error(e); } }
        stateOS.fotos.splice(i, 1);
        montarFotos(); atualizarResumo();
    };

    /* ---------- carregar as fotos de uma OS já gravada ---------- */
    window.carregarFotosDaOS = async function (osId) {
        stateOS.fotos = [];
        if (!osId || !supabaseClient) { montarFotos(); atualizarResumo(); return; }
        var r = await supabaseClient.from('os_fotos').select('*').eq('os_id', osId);
        if (r.error) { console.error('Fotos:', r.error); montarFotos(); return; }
        for (var i = 0; i < (r.data || []).length; i++) {
            var f = r.data[i];
            var assinada = await supabaseClient.storage.from('os-fotos').createSignedUrl(f.caminho, 3600);
            stateOS.fotos.push({ id: f.id, caminho: f.caminho, url: assinada.data ? assinada.data.signedUrl : '' });
        }
        montarFotos(); atualizarResumo();
    };

    /* ---------- gravar os vínculos depois que a OS ganhou id ---------- */
    window.salvarFotosDaOS = async function (osId) {
        var novas = (stateOS.fotos || []).filter(function (f) { return !f.id; });
        if (!novas.length || !supabaseClient) return;
        var linhas = novas.map(function (f) {
            f.id = Date.now().toString() + Math.floor(Math.random() * 1000);
            return { id: f.id, os_id: osId, caminho: f.caminho, momento: 'entrada' };
        });
        var r = await supabaseClient.from('os_fotos').insert(linhas);
        if (r.error) console.error('Vincular fotos:', r.error);
    };
})();
