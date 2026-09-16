/* =========================================
   ÍCONES
   Emoji não é ícone. Ele muda de desenho em cada aparelho — o 🔧 do iPhone do
   mecânico não é o mesmo do tablet Android —, mistura estilos que não
   pertencem à mesma família (🟡 chapado do lado de ✏️ desenhado) e não aceita
   cor da folha de estilo. A interface tinha 111 emojis e 37 símbolos
   diferentes; isto aqui é um conjunto só, traçado, que herda a cor do texto e
   escala com a fonte.

   Uso:  ico('cliente')            → 16px, cor do texto ao redor
         ico('alerta', 20)         → 20px
         ico('pix', 16, 'success') → com a cor de uma variável
========================================= */
(function (global) {
    'use strict';

    // Traçados de 24×24. Todos com o mesmo peso de linha, para parecerem da
    // mesma mão — que é exatamente o que o emoji não consegue fazer.
    const D = {
        painel: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
        orcamento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>',
        // Prancheta com linhas: é a ordem de serviço em si, o papel da bancada.
        ordem: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 11h8M8 15h5"/>',
        cobranca: '<path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3c0 4.2 10 2 10 6.2 0 1.9-2.2 3.3-5 3.3s-5-1.4-5-3.3"/>',
        veiculo: '<path d="M5 17h14"/><path d="M3 17v-4l2.3-5.2A2 2 0 0 1 7.1 6.5h9.8a2 2 0 0 1 1.8 1.3L21 13v4"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>',
        equipe: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
        catalogo: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
        relatorio: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
        calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        mais: '<path d="M12 5v14M5 12h14"/>',
        editar: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>',
        fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
        mover: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
        voltar: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
        avancar: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
        ok: '<path d="m4 12 5 5L20 6"/>',
        alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
        imprimir: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
        salvar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
        foto: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>',
        cliente: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        chave: '<circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.5 8-8"/><path d="m16 7 2.5 2.5M19 4l2 2"/>',
        olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
        olhoFechado: '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6M6.5 7.9A17 17 0 0 0 2 12s3.6 6 10 6c1.6 0 3-.4 4.3-1"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
        sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
        menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
        dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
        garantia: '<path d="M12 2 4 5.5v6c0 5 3.4 9.3 8 10.5 4.6-1.2 8-5.5 8-10.5v-6L12 2Z"/><path d="m9 12 2 2 4-4"/>',
        retorno: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/>',
        lixeira: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8h.01"/>',
        relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        /* Chave de boca de verdade. A primeira tentativa era um traço torto que
           no logotipo virava um rabisco — e era o mesmo desenho de `ordem`,
           então dois lugares diferentes mostravam a mesma coisa errada. */
        ferramenta: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>',
        peca: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
    };

    /* Bolinha cheia para status. Antes era 🔵🟡🟢🔷 — quatro emojis que em
       aparelho diferente saem com tamanhos diferentes e desalinham a linha. */
    function bolinha(cor, tam) {
        return '<svg class="ico ico-cheio" width="' + (tam || 10) + '" height="' + (tam || 10) +
            '" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="' + cor + '"/></svg>';
    }

    function ico(nome, tam, cor) {
        const d = D[nome];
        if (!d) return '';
        const s = tam || 16;
        const estilo = cor ? ' style="color:var(--' + cor + ')"' : '';
        return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
            'aria-hidden="true"' + estilo + '>' + d + '</svg>';
    }

    /* O HTML estático escreve <span data-ico="calendario"></span>, que se lê bem
       no editor; esta passada troca pelos traçados quando a página abre. O que
       o JavaScript monta em texto usa ico() direto. */
    function aplicarIcones(raiz) {
        (raiz || document).querySelectorAll('[data-ico]').forEach(function (el) {
            const nome = el.getAttribute('data-ico');
            if (!D[nome]) return;
            el.innerHTML = ico(nome, Number(el.getAttribute('data-ico-tam')) || 16);
            el.removeAttribute('data-ico');
        });
    }

    document.addEventListener('DOMContentLoaded', function () { aplicarIcones(); });

    global.ico = ico;
    global.aplicarIcones = aplicarIcones;
    global.bolinha = bolinha;
    global.ICONES = D;
})(window);
