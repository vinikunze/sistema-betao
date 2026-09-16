/* =====================================================
   BETÃO — Gráficos do dashboard (versão clara)
   Substitui os gráficos de linha (ilegíveis com poucos
   dados) por barras e rosca fáceis de entender.
   Carregado DEPOIS do script.js.
   ===================================================== */
(function () {
    "use strict";

    var money = (typeof window.fmt === "function") ? window.fmt
        : function (v) { return "R$ " + (Number(v) || 0).toFixed(2); };

    function eixoMoeda(v) {
        if (Math.abs(v) >= 1000) return "R$ " + (v / 1000).toFixed(1) + "k";
        return "R$ " + v;
    }

    function destruir(id) {
        var c = document.getElementById(id);
        if (c && typeof Chart !== "undefined" && Chart.getChart) {
            var ex = Chart.getChart(c);
            if (ex) ex.destroy();
        }
    }

    /* "finalizada" sozinho deixa de fora tudo que foi ENTREGUE — e entregue é o
       estado final normal de uma OS. Com os cinco carros do dia simulado, três
       estavam entregues: R$ 3.525,00 de R$ 4.095,00 sumiam destes gráficos.
       Mesma regra do script.js, num lugar só. */
    var concluida = (typeof window.osConcluida === "function")
        ? window.osConcluida
        : function (o) { return o && (o.status === "finalizada" || o.status === "entregue"); };

    var GRID = "rgba(255,255,255,0.05)";
    var TXT = "#8b95a7";

    /* ---------- 1) Faturamento × Custos × Comissões × Lucro (barras) ---------- */
    window.renderFaturamentoChart = function (labels, fat, custo, comissao) {
        if (typeof Chart === "undefined") return;
        var c = document.getElementById("faturamentoChart"); if (!c) return;
        destruir("faturamentoChart");

        var temDados = labels && labels.length;
        var L = temDados ? labels : ["Sem dados no período"];
        var F = temDados ? fat : [0];
        var C = temDados ? custo : [0];
        var K = temDados ? comissao : [0];
        var lucro = F.map(function (v, i) { return (v || 0) - (C[i] || 0) - (K[i] || 0); });

        new Chart(c.getContext("2d"), {
            type: "bar",
            data: {
                labels: L,
                datasets: [
                    { label: "Faturamento", data: F, backgroundColor: "#e8a020", borderRadius: 6, maxBarThickness: 38 },
                    { label: "Lucro", data: lucro, backgroundColor: "#22c55e", borderRadius: 6, maxBarThickness: 38 },
                    { label: "Custos", data: C, backgroundColor: "#ef4444", borderRadius: 6, maxBarThickness: 38 },
                    { label: "Comissões", data: K, backgroundColor: "#a855f7", borderRadius: 6, maxBarThickness: 38 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: "#e6eaf0", usePointStyle: true, pointStyle: "rectRounded", padding: 16 } },
                    tooltip: { callbacks: { label: function (x) { return x.dataset.label + ": " + money(x.raw); } } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TXT, callback: eixoMoeda } },
                    x: { grid: { display: false }, ticks: { color: TXT } }
                }
            }
        });
    };

    /* ---------- 2) Situação das Ordens (rosca por status) ---------- */
    window.renderTicketChart = function () {
        if (typeof Chart === "undefined") return;
        var c = document.getElementById("ticketChart"); if (!c) return;
        destruir("ticketChart");
        if (!window.db || !Array.isArray(db.os)) return;

        var cont = { aberta: 0, em_andamento: 0, finalizada: 0, entregue: 0, orcamento: 0, rejeitado: 0 };
        db.os.forEach(function (o) { if (cont[o.status] !== undefined) cont[o.status]++; });

        var labels = ["Abertas", "Em andamento", "Finalizadas", "Entregues", "Orçamentos", "Rejeitadas"];
        var dados = [cont.aberta, cont.em_andamento, cont.finalizada, cont.entregue, cont.orcamento, cont.rejeitado];
        var cores = ["#5b93f0", "#e8a020", "#3ec97a", "#22d3ee", "#a78bfa", "#ef5a5a"];
        var total = dados.reduce(function (a, b) { return a + b; }, 0);

        if (total === 0) { labels = ["Nenhuma OS ainda"]; dados = [1]; cores = ["#333"]; }

        new Chart(c.getContext("2d"), {
            type: "doughnut",
            data: { labels: labels, datasets: [{ data: dados, backgroundColor: cores, borderColor: "#181d26", borderWidth: 3, hoverOffset: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "62%",
                plugins: {
                    legend: { position: "right", labels: { color: "#e6eaf0", usePointStyle: true, pointStyle: "circle", padding: 12, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: function (x) {
                                if (total === 0) return "Sem ordens";
                                var pct = ((x.raw / total) * 100).toFixed(0);
                                return x.label + ": " + x.raw + " (" + pct + "%)";
                            }
                        }
                    }
                }
            }
        });
    };

    /* ---------- 3) Faturamento por dia da semana (barras) ---------- */
    function renderWeekdayChart() {
        if (typeof Chart === "undefined") return;
        var c = document.getElementById("weekdayChart"); if (!c) return;
        destruir("weekdayChart");
        if (!window.db || !Array.isArray(db.os)) return;

        var nomes = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        var soma = [0, 0, 0, 0, 0, 0, 0];
        db.os.filter(concluida).forEach(function (o) {
            var iso = o.dataISO || (typeof parseBRDateToISO === "function" ? parseBRDateToISO(o.data) : null);
            if (!iso) return;
            var d = new Date(iso + "T12:00:00");
            if (!isNaN(d)) soma[d.getDay()] += (Number(o.total) || 0);
        });
        // Reordena Segunda → Domingo (mais natural)
        var ordem = [1, 2, 3, 4, 5, 6, 0];
        var labels = ordem.map(function (i) { return nomes[i].slice(0, 3); });
        var dados = ordem.map(function (i) { return soma[i]; });
        var max = Math.max.apply(null, dados);

        new Chart(c.getContext("2d"), {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Faturamento",
                    data: dados,
                    backgroundColor: dados.map(function (v) { return (v === max && max > 0) ? "#e8a020" : "rgba(232,160,32,0.45)"; }),
                    borderRadius: 8, maxBarThickness: 60
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function (x) { return money(x.raw); } } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TXT, callback: eixoMoeda } },
                    x: { grid: { display: false }, ticks: { color: TXT } }
                }
            }
        });
    }
    window.renderWeekdayChart = renderWeekdayChart;

    /* ---------- 4) Faturamento ao longo do tempo (área com degradê) ---------- */
    var revPeriod = "month";

    function isoLocal(d) {
        var m = d.getMonth() + 1, day = d.getDate();
        return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
    }

    function rangeFor(key) {
        var hoje = new Date(); hoje.setHours(12, 0, 0, 0);
        var fim = new Date(hoje), ini = new Date(hoje);
        if (key === "7d") ini.setDate(hoje.getDate() - 6);
        else if (key === "30d") ini.setDate(hoje.getDate() - 29);
        else if (key === "90d") ini.setDate(hoje.getDate() - 89);
        else if (key === "month") ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12);
        else if (key === "all") {
            var datas = (db.os || []).filter(concluida)
                .map(function (o) { return o.dataISO || (typeof parseBRDateToISO === "function" ? parseBRDateToISO(o.data) : null); })
                .filter(Boolean).sort();
            if (datas.length) ini = new Date(datas[0] + "T12:00:00");
            else ini.setDate(hoje.getDate() - 6);
        }
        return { ini: ini, fim: fim };
    }

    function renderRevenueTrend() {
        if (typeof Chart === "undefined") return;
        var c = document.getElementById("revenueTrendChart"); if (!c) return;
        destruir("revenueTrendChart");
        if (!window.db || !Array.isArray(db.os)) return;

        var r = rangeFor(revPeriod);
        var mapa = {};
        db.os.filter(concluida).forEach(function (o) {
            var iso = o.dataISO || (typeof parseBRDateToISO === "function" ? parseBRDateToISO(o.data) : null);
            if (iso) mapa[iso] = (mapa[iso] || 0) + (Number(o.total) || 0);
        });

        var labels = [], dados = [], cur = new Date(r.ini), guard = 0;
        while (cur <= r.fim && guard < 1000) {
            var iso = isoLocal(cur);
            labels.push(iso.slice(8, 10) + "/" + iso.slice(5, 7));
            dados.push(mapa[iso] || 0);
            cur.setDate(cur.getDate() + 1); guard++;
        }

        var total = dados.reduce(function (a, b) { return a + b; }, 0);
        var maxV = dados.length ? Math.max.apply(null, dados) : 0;
        var idxMax = dados.indexOf(maxV);
        var sum = document.getElementById("revenue-summary");
        if (sum) {
            sum.innerHTML = total > 0
                ? '<span class="rev-total">' + money(total) + '</span> <span class="rev-sub">no período · melhor dia: ' + (labels[idxMax] || "-") + " (" + money(maxV) + ")</span>"
                : '<span class="rev-sub">Sem faturamento finalizado neste período.</span>';
        }

        new Chart(c.getContext("2d"), {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "Faturamento", data: dados,
                    borderColor: "#e8a020", borderWidth: 2.5, tension: 0.4, fill: true,
                    pointRadius: 0, pointHoverRadius: 6, pointHoverBackgroundColor: "#e8a020",
                    pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2,
                    backgroundColor: function (ctx) {
                        var ch = ctx.chart, area = ch.chartArea;
                        if (!area) return "rgba(232,160,32,0.15)";
                        var g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                        g.addColorStop(0, "rgba(232,160,32,0.45)");
                        g.addColorStop(0.5, "rgba(232,160,32,0.12)");
                        g.addColorStop(1, "rgba(232,160,32,0)");
                        return g;
                    }
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: "index" },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function (items) { return "Dia " + items[0].label; },
                            label: function (x) { return money(x.raw); }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TXT, callback: eixoMoeda } },
                    x: { grid: { display: false }, ticks: { color: TXT, maxTicksLimit: 12, autoSkip: true, maxRotation: 0 } }
                }
            }
        });
    }
    window.renderRevenueTrend = renderRevenueTrend;

    window.setRevenuePeriod = function (key, btn) {
        revPeriod = key;
        var tabs = document.querySelectorAll("#revenue-period-tabs .period-tab");
        tabs.forEach(function (t) { t.classList.remove("active"); });
        if (btn) btn.classList.add("active");
        renderRevenueTrend();
    };

    // Engancha: desenha também o gráfico de dia da semana e o de tendência
    if (typeof window.renderDashboard === "function") {
        var _orig = window.renderDashboard;
        window.renderDashboard = function () {
            var r = _orig.apply(this, arguments);
            try { renderWeekdayChart(); } catch (e) { console.error("weekday chart:", e); }
            try { renderRevenueTrend(); } catch (e) { console.error("revenue trend:", e); }
            return r;
        };
    }
})();
