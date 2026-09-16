/* =====================================================
   BETÃO — INTELIGÊNCIA DE VENDAS (BI do dashboard)
   Deriva insights dos dados reais de OS. Não altera a
   lógica existente: roda depois do renderDashboard.
   Carregado DEPOIS do script.js.
   ===================================================== */
(function () {
    "use strict";

    /* Entregue também é OS concluída. Sem isto, tudo que já saiu da oficina
       sumia do faturamento desta seção, da comparação com o período anterior e
       da lista de OS recentes. */
    var concluida = (typeof window.osConcluida === "function")
        ? window.osConcluida
        : function (o) { return o && (o.status === "finalizada" || o.status === "entregue"); };

    var biChart = null;
    var money = (typeof window.fmt === "function")
        ? window.fmt
        : function (v) { return "R$ " + (Number(v) || 0).toFixed(2); };

    function periodo() {
        var i = document.getElementById("d-data-inicio");
        var f = document.getElementById("d-data-fim");
        var dIni = i ? i.value : "";
        var dFim = f ? f.value : "";
        if (!dIni && !dFim) {
            var now = new Date();
            dIni = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
            dFim = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
        }
        return { ini: dIni, fim: dFim };
    }

    function isoDe(o) {
        return o.dataISO || (typeof parseBRDateToISO === "function" ? parseBRDateToISO(o.data) : o.data) || "";
    }

    function brData(iso) {
        if (!iso) return "—";
        var p = iso.split("-");
        return p.length === 3 ? (p[2] + "/" + p[1] + "/" + p[0]) : iso;
    }

    function rankBars(itens, cor) {
        if (!itens.length) return '<div class="bi-empty">Sem dados no período.</div>';
        var max = itens[0].receita || 1;
        return itens.map(function (it, idx) {
            var w = Math.max(4, (it.receita / max) * 100);
            return '<div class="bi-rank-item">' +
                '<div class="bi-rank-info">' +
                '<span class="bi-rank-name"><b>' + (idx + 1) + '.</b> ' + it.nome + '</span>' +
                '<span class="bi-rank-val">' + money(it.receita) + ' · ' + it.qtd + 'x</span>' +
                '</div>' +
                '<div class="bi-rank-track"><div class="bi-rank-fill" data-w="' + w + '" style="width:0;background:' + cor + '"></div></div>' +
                '</div>';
        }).join("");
    }

    function agregar(lista, campoNome, campoValor) {
        var mapa = {};
        lista.forEach(function (o) {
            (o[campoValor === "valor" ? "servicos" : "pecas"] || []).forEach(function (it) {
                var nome = (it[campoNome] || "—").toString().trim() || "—";
                var preco = campoValor === "valor" ? Number(it.valor) : Number(it.venda);
                var qtd = Number(it.qtd) || 0;
                if (!mapa[nome]) mapa[nome] = { nome: nome, qtd: 0, receita: 0 };
                mapa[nome].qtd += qtd;
                mapa[nome].receita += (preco || 0) * qtd;
            });
        });
        return Object.keys(mapa).map(function (k) { return mapa[k]; })
            .sort(function (a, b) { return b.receita - a.receita; }).slice(0, 5);
    }

    function renderInsights() {
        if (!window.db || !Array.isArray(db.os)) return;
        var per = periodo();
        var lblP = document.getElementById("bi-period");
        if (lblP) lblP.textContent = brData(per.ini) + " a " + brData(per.fim);

        var fin = db.os.filter(function (o) {
            var iso = isoDe(o);
            return concluida(o) && iso >= per.ini && iso <= per.fim;
        });

        var totServ = fin.reduce(function (a, o) { return a + (Number(o.maoObra) || 0); }, 0);
        var totPec = fin.reduce(function (a, o) { return a + (Number(o.receitaPecas) || 0); }, 0);
        var fat = fin.reduce(function (a, o) { return a + (Number(o.total) || 0); }, 0);
        var lucro = fin.reduce(function (a, o) { return a + (Number(o.lucro) || 0); }, 0);
        var baseVendas = totServ + totPec;
        var pctServ = baseVendas > 0 ? (totServ / baseVendas * 100) : 0;
        var pctPec = baseVendas > 0 ? (totPec / baseVendas * 100) : 0;
        var margem = fat > 0 ? (lucro / fat * 100) : 0;

        // Período anterior (mesmo tamanho) para tendência
        var d1 = new Date(per.ini), d2 = new Date(per.fim);
        var dias = Math.ceil(Math.abs(d2 - d1) / 86400000) + 1;
        var pf = new Date(d1); pf.setDate(pf.getDate() - 1);
        var pi = new Date(pf); pi.setDate(pi.getDate() - dias + 1);
        var prevIni = pi.toISOString().split("T")[0], prevFim = pf.toISOString().split("T")[0];
        var fatPrev = db.os.filter(function (o) {
            var iso = isoDe(o);
            return concluida(o) && iso >= prevIni && iso <= prevFim;
        }).reduce(function (a, o) { return a + (Number(o.total) || 0); }, 0);
        var varFat = fatPrev > 0 ? ((fat - fatPrev) / fatPrev * 100) : (fat > 0 ? 100 : 0);

        // Operacional (estado atual, não só do período)
        var emAberto = db.os.filter(function (o) { return o.status === "aberta" || o.status === "em_andamento"; }).length;
        var orcPend = db.os.filter(function (o) { return o.status === "orcamento"; }).length;
        var rejeitados = db.os.filter(function (o) { return o.status === "rejeitado"; }).length;
        var finalizados = db.os.filter(concluida).length;
        var baseConv = finalizados + rejeitados;
        var conversao = baseConv > 0 ? (finalizados / baseConv * 100) : 0;

        // Rankings
        var topServ = agregar(fin, "descricao", "valor");
        var topPec = agregar(fin, "nome", "venda");

        // Mecânico destaque
        var melhorMec = null, melhorMecVal = 0;
        if (window.db.mecanicos) {
            db.mecanicos.forEach(function (m) {
                var v = 0;
                fin.forEach(function (o) {
                    (o.servicos || []).forEach(function (s) {
                        if (s.mecanicoId == m.id) v += (Number(s.valor) * Number(s.qtd));
                    });
                });
                if (v > melhorMecVal) { melhorMecVal = v; melhorMec = m.nome; }
            });
        }

        // ---------- DONUT composição ----------
        var canvas = document.getElementById("composicaoChart");
        if (canvas && typeof Chart !== "undefined") {
            if (biChart) biChart.destroy();
            if (baseVendas > 0) {
                biChart = new Chart(canvas.getContext("2d"), {
                    type: "doughnut",
                    data: {
                        labels: ["Serviços (mão de obra)", "Peças"],
                        datasets: [{
                            data: [totServ, totPec],
                            backgroundColor: ["#e8a020", "#3b82f6"],
                            borderColor: "#0e0e0e", borderWidth: 3, hoverOffset: 6
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: "66%",
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: function (c) { return c.label + ": " + money(c.raw); } } }
                        }
                    }
                });
            }
        }
        var leg = document.getElementById("bi-comp-legend");
        if (leg) {
            leg.innerHTML = baseVendas > 0
                ? '<div class="bi-leg-item"><span class="bi-dot" style="background:#e8a020"></span>Serviços <b>' + pctServ.toFixed(0) + '%</b> <small>' + money(totServ) + '</small></div>' +
                  '<div class="bi-leg-item"><span class="bi-dot" style="background:#3b82f6"></span>Peças <b>' + pctPec.toFixed(0) + '%</b> <small>' + money(totPec) + '</small></div>'
                : '<div class="bi-empty">Nenhuma OS concluída no período.</div>';
        }

        // ---------- MÉTRICAS de saúde ----------
        var mClass = margem >= 40 ? "bi-pos" : (margem >= 25 ? "bi-neu" : "bi-neg");
        var cClass = conversao >= 70 ? "bi-pos" : (conversao >= 50 ? "bi-neu" : "bi-neg");
        var metr = document.getElementById("bi-metrics");
        if (metr) {
            metr.innerHTML =
                metric("Margem de lucro", margem.toFixed(0) + "%", mClass, money(lucro) + " de lucro") +
                metric("Conversão de orçamentos", conversao.toFixed(0) + "%", cClass, finalizados + " fechados · " + rejeitados + " recusados") +
                metric("OS em aberto", emAberto, emAberto > 0 ? "bi-neu" : "bi-pos", "aguardando finalização") +
                metric("Orçamentos pendentes", orcPend, orcPend > 0 ? "bi-neu" : "bi-pos", "esperando resposta do cliente");
        }

        // ---------- DESTAQUES automáticos ----------
        var bom = [], aten = [];
        if (fat > 0) {
            if (varFat > 0) bom.push("Faturamento " + varFat.toFixed(0) + "% acima do período anterior.");
            else if (varFat < 0) aten.push("Faturamento caiu " + Math.abs(varFat).toFixed(0) + "% vs período anterior.");
        }
        if (margem >= 40) bom.push("Margem de lucro saudável (" + margem.toFixed(0) + "%).");
        else if (fat > 0 && margem < 25) aten.push("Margem apertada (" + margem.toFixed(0) + "%) — revise preço de peças/serviços.");
        if (topServ.length) bom.push("Serviço campeão: " + topServ[0].nome + " (" + money(topServ[0].receita) + ").");
        if (topPec.length) bom.push("Peça mais vendida: " + topPec[0].nome + " (" + topPec[0].qtd + "x).");
        if (melhorMec) bom.push("Destaque da equipe: " + melhorMec + " (" + money(melhorMecVal) + " em serviços).");
        if (conversao >= 70 && baseConv > 0) bom.push("Boa conversão de orçamentos (" + conversao.toFixed(0) + "%).");
        else if (baseConv > 0 && conversao < 50) aten.push("Conversão baixa: " + conversao.toFixed(0) + "% dos orçamentos viraram serviço.");
        if (orcPend > 0) aten.push(orcPend + " orçamento(s) pendente(s) — faça follow-up com o cliente.");
        if (emAberto > 0) aten.push(emAberto + " OS em aberto — finalize para faturar.");
        if (!bom.length) bom.push("Ainda sem dados suficientes neste período. Finalize OS para gerar análises.");
        if (!aten.length) aten.push("Nada crítico no período.");

        fillList("bi-good-list", bom);
        fillList("bi-warn-list", aten);

        // ---------- RANKINGS ----------
        setHTML("bi-top-servicos", rankBars(topServ, "var(--brand)"));
        setHTML("bi-top-pecas", rankBars(topPec, "var(--blue)"));

        // Anima as barras de ranking
        requestAnimationFrame(function () {
            document.querySelectorAll(".bi-rank-fill[data-w]").forEach(function (el) {
                el.style.width = el.getAttribute("data-w") + "%";
            });
        });
    }

    // Tabela de OS recentes: abertas + em andamento + finalizadas (abertas no topo)
    function renderRecentOS() {
        if (!window.db || !Array.isArray(db.os)) return;
        var tb = document.getElementById("d-tbody");
        if (!tb) return;
        var ordem = { "aberta": 0, "em_andamento": 1, "finalizada": 2, "entregue": 3 };
        var oper = db.os.filter(function (o) {
            return o.status === "aberta" || o.status === "em_andamento" || concluida(o);
        });
        oper.sort(function (a, b) {
            var sa = ordem[a.status], sb = ordem[b.status];
            if (sa !== sb) return sa - sb;          // abertas/andamento primeiro
            return Number(b.id) - Number(a.id);     // mais recentes primeiro
        });
        var top = oper.slice(0, 10);
        /* Esta tabela e a do script.js escrevem no mesmo #d-tbody, e esta é a que
           roda por último. Enquanto ela saía cedo por não achar window.db, quem
           aparecia era a outra — a que mostra pagamento e retorno. Agora que as
           duas rodam, esta precisa mostrar o mesmo, senão o painel perdia a
           informação de quem está devendo e de qual carro voltou na garantia. */
        var badge = (typeof getStatusBadge === "function") ? getStatusBadge : function (s) { return s; };
        var badgePg = (typeof getPagamentoBadge === "function") ? getPagamentoBadge : function () { return ""; };
        var badgeRet = (typeof getRetornoBadge === "function") ? getRetornoBadge : function () { return ""; };
        tb.innerHTML = top.length
            ? top.map(function (o) {
                var etiquetas = badge(o.status) +
                    (concluida(o) ? " " + badgePg(o) : "") + badgeRet(o);
                return '<tr><td>#' + o.id + '</td><td>' + (o.veiculo || "—") + '</td><td>' +
                    money(o.total) + '</td><td class="td-etiquetas">' + etiquetas + '</td></tr>';
            }).join("")
            : '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">Nenhuma OS cadastrada ainda.</td></tr>';
    }

    function metric(label, val, cls, sub) {
        return '<div class="bi-metric">' +
            '<div class="bi-metric-top"><span class="bi-metric-label">' + label + '</span>' +
            '<strong class="bi-metric-val ' + cls + '">' + val + '</strong></div>' +
            '<div class="bi-metric-sub">' + sub + '</div></div>';
    }
    function fillList(id, arr) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = arr.map(function (t) { return "<li>" + t + "</li>"; }).join("");
    }
    function setHTML(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

    // Expõe e engancha no renderDashboard existente
    window.renderInsights = renderInsights;
    window.renderRecentOS = renderRecentOS;
    if (typeof window.renderDashboard === "function") {
        var _orig = window.renderDashboard;
        window.renderDashboard = function () {
            var r = _orig.apply(this, arguments);
            try { renderInsights(); } catch (e) { console.error("BI:", e); }
            try { renderRecentOS(); } catch (e) { console.error("BI tabela OS:", e); }
            return r;
        };
    }
})();
