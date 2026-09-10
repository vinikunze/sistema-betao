/* =====================================================
   BETÃO — Campos de veículo: marca/modelo salvos + ano
   - Marca: lista de montadoras + marcas já usadas
   - Modelo: aprende com o histórico de OS
   - Ano: lista de 1980 até 2026
   Guarda "MODELO ANO" no mesmo campo (compatível com o
   que já existe), separando só na hora de exibir/editar.
   Carregado DEPOIS do script.js.
   ===================================================== */
(function () {
    "use strict";

    var ANO_MIN = 1980, ANO_MAX = 2026;

    var MARCAS = [
        "VOLKSWAGEN", "FIAT", "CHEVROLET", "FORD", "TOYOTA", "HONDA", "HYUNDAI",
        "RENAULT", "JEEP", "NISSAN", "PEUGEOT", "CITROËN", "MITSUBISHI", "KIA",
        "BMW", "MERCEDES-BENZ", "AUDI", "VOLVO", "LAND ROVER", "JAGUAR",
        "CHERY", "CAOA CHERY", "BYD", "GWM", "RAM", "DODGE", "SUZUKI", "SUBARU",
        "IVECO", "SCANIA", "VOLARE", "AGRALE", "TROLLER", "LIFAN", "JAC",
        "MAHINDRA", "EFFA", "SSANGYONG", "MINI", "PORSCHE", "FERRARI"
    ];

    var regexAno = /\s*\b(19|20)\d{2}\b\s*$/;

    function montarAnoSelect() {
        var sel = document.getElementById("d-ano");
        if (!sel || sel.options.length > 1) return; // já montado
        var html = '<option value="">Ano</option>';
        for (var a = ANO_MAX; a >= ANO_MIN; a--) {
            html += '<option value="' + a + '">' + a + '</option>';
        }
        sel.innerHTML = html;
    }

    function preencherDatalists() {
        if (!window.db || !Array.isArray(db.os)) return;

        // Marcas: montadoras + as já usadas no histórico
        var marcas = {};
        MARCAS.forEach(function (m) { marcas[m] = true; });
        db.os.forEach(function (o) {
            var v = (o.veiculo || "").trim().toUpperCase();
            if (v) marcas[v] = true;
        });
        setOptions("marcas-list", Object.keys(marcas).sort());

        // Modelos: aprendidos do histórico, sem o ano no fim
        var modelos = {};
        db.os.forEach(function (o) {
            var m = (o.modelo || "").replace(regexAno, "").trim().toUpperCase();
            if (m) modelos[m] = true;
        });
        setOptions("modelos-list", Object.keys(modelos).sort());
    }

    function setOptions(id, arr) {
        var dl = document.getElementById(id);
        if (!dl) return;
        dl.innerHTML = arr.map(function (x) {
            return '<option value="' + x.replace(/"/g, "&quot;") + '"></option>';
        }).join("");
    }

    // Separa o ano que está grudado no fim do modelo e joga no select
    function separarAno() {
        var m = document.getElementById("d-modelo");
        var y = document.getElementById("d-ano");
        if (!m || !y) return;
        var match = (m.value || "").match(regexAno);
        if (match) {
            var ano = match[0].trim();
            y.value = ano;
            m.value = m.value.replace(regexAno, "").trim();
        } else {
            y.value = "";
        }
    }

    // Junta modelo + ano de volta no campo que é salvo no banco
    function juntarAno() {
        var m = document.getElementById("d-modelo");
        var y = document.getElementById("d-ano");
        if (!m) return;
        var base = (m.value || "").replace(regexAno, "").trim();
        m.value = (y && y.value) ? (base + " " + y.value).trim() : base;
    }

    // ---------- Engancha nas funções existentes ----------

    // Ao abrir o modal: monta ano, recheia listas e separa o ano do modelo
    if (typeof window.openDocModal === "function") {
        var _open = window.openDocModal;
        window.openDocModal = function () {
            var r = _open.apply(this, arguments);
            montarAnoSelect();
            preencherDatalists();
            setTimeout(separarAno, 0); // depois que o modal preencheu os campos
            return r;
        };
    }

    // Após buscar pela placa (preenche modelo com ano grudado): separa de novo
    if (typeof window.buscarPlaca === "function") {
        var _buscar = window.buscarPlaca;
        window.buscarPlaca = function () {
            var r = _buscar.apply(this, arguments);
            Promise.resolve(r).then(function () { setTimeout(separarAno, 0); },
                function () { setTimeout(separarAno, 0); });
            return r;
        };
    }

    // Antes de salvar: junta modelo + ano no campo do banco
    if (typeof window.saveDoc === "function") {
        var _save = window.saveDoc;
        window.saveDoc = function () {
            juntarAno();
            return _save.apply(this, arguments);
        };
    }

    // Monta tudo já no carregamento, por garantia
    document.addEventListener("DOMContentLoaded", function () {
        montarAnoSelect();
        preencherDatalists();
    });
})();
