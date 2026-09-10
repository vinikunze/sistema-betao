/* =====================================================
   BETÃO — feedback de carregamento automático
   Liga a barra de progresso do topo a TODA atividade de
   rede (login, salvar, carregar, deletar). Sem mexer no
   resto do código: intercepta o fetch global.
   ===================================================== */
(function () {
    "use strict";

    // Cria a barra de progresso assim que o body existir
    var bar = document.createElement("div");
    bar.className = "app-progress";
    function mount() { if (document.body && !bar.parentNode) document.body.appendChild(bar); }
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);

    var inflight = 0;
    var hideTimer = null;

    function start() {
        clearTimeout(hideTimer);
        inflight++;
        mount();
        bar.classList.remove("done");
        // reinicia a animação de preenchimento
        void bar.offsetWidth;
        bar.classList.add("active");
    }

    function stop() {
        inflight = Math.max(0, inflight - 1);
        if (inflight === 0) {
            bar.classList.remove("active");
            bar.classList.add("done");
            hideTimer = setTimeout(function () { bar.classList.remove("done"); }, 480);
        }
    }

    // Intercepta o fetch (o supabase-js usa fetch por baixo dos panos)
    if (window.fetch) {
        var orig = window.fetch.bind(window);
        window.fetch = function () {
            start();
            return orig.apply(null, arguments).then(
                function (res) { stop(); return res; },
                function (err) { stop(); throw err; }
            );
        };
    }
})();
