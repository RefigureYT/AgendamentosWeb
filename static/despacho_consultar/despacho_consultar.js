(() => {
    const API_MARKETPLACES = "/api/despacho/marketplaces";
    const API_EMPRESAS = "/api/despacho/empresas";
    const API_CONSULTAR = "/api/despacho/crossdocking/consultar";

    const el = (id) => document.getElementById(id);

    const dcErr = el("dcErr");
    const dcLoading = el("dcLoading");
    const resultsBody = el("resultsBody");
    const resultsCount = el("resultsCount");

    const qInput = el("qInput");
    const qBtnBuscar = el("qBtnBuscar");

    const fltMarketplace = el("fltMarketplace");
    const fltEmpresa = el("fltEmpresa");
    const fltChave = el("fltChave");
    const fltNumeroNota = el("fltNumeroNota");
    const fltDataDe = el("fltDataDe");
    const fltDataAte = el("fltDataAte");
    const fltHoraDe = el("fltHoraDe");
    const fltHoraAte = el("fltHoraAte");
    const btnBuscar = el("btnBuscar");
    const btnLimpar = el("btnLimpar");

    // Impressão
    const btnImprimirRelacao = el("btnImprimirRelacao");
    const printSheetEl = el("cdPrintSheet");

    const digits = (v) => String(v || "").replace(/\D+/g, "");

    let lastItems = [];
    let lastPrintCtx = null;

    function showErr(msg) {
        if (!dcErr) return;
        dcErr.textContent = msg || "Erro ao buscar.";
        dcErr.classList.remove("d-none");
    }

    function hideErr() {
        if (!dcErr) return;
        dcErr.classList.add("d-none");
        dcErr.textContent = "";
    }

    function setLoading(on) {
        if (!dcLoading) return;
        dcLoading.classList.toggle("d-none", !on);
    }

    function setCount(n) {
        if (!resultsCount) return;
        resultsCount.textContent = String(n || 0);
    }

    function setPrintEnabled(on) {
        if (!btnImprimirRelacao) return;
        btnImprimirRelacao.disabled = !on;
    }

    function escapeHtml(v) {
        return String(v ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function getSelectText(sel, fallback) {
        if (!sel) return fallback;
        const opt = sel.selectedOptions && sel.selectedOptions[0];
        const txt = (opt?.textContent || "").trim();
        if (sel.value === "" || !txt) return fallback;
        return txt;
    }

    function isoToBrDate(iso) {
        // "YYYY-MM-DD" -> "DD/MM/YYYY"
        const s = String(iso || "").trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return s;
        return `${m[3]}/${m[2]}/${m[1]}`;
    }

    function buildPeriodo(ctx) {
        const d1 = (ctx?.data_de || "").trim();
        const d2 = (ctx?.data_ate || "").trim();
        const h1 = (ctx?.hora_de || "").trim();
        const h2 = (ctx?.hora_ate || "").trim();

        const left = [d1 ? isoToBrDate(d1) : "", h1].filter(Boolean).join(" ");
        const right = [d2 ? isoToBrDate(d2) : "", h2].filter(Boolean).join(" ");

        if (!left && !right) return "";
        if (left && right) return `${left} → ${right}`;
        return left || right;
    }

    function capturePrintCtx(kind) {
        // Snapshot do que gerou os resultados atuais (para não “desalinhar” ao mexer nos filtros depois)
        return {
            kind: kind || "unknown",
            empresa: getSelectText(fltEmpresa, "Todas"),
            marketplace: getSelectText(fltMarketplace, "Todos"),
            q: (qInput?.value || "").trim(),
            numero_nota: (fltNumeroNota?.value || "").trim(),
            chave: digits(fltChave?.value || ""),
            data_de: (fltDataDe?.value || "").trim(),
            data_ate: (fltDataAte?.value || "").trim(),
            hora_de: (fltHoraDe?.value || "").trim(),
            hora_ate: (fltHoraAte?.value || "").trim(),
        };
    }

    function montarRelacaoHtml(repeticoes) {
        const ctx = lastPrintCtx || capturePrintCtx("unknown");

        const empresa = escapeHtml(ctx.empresa || "-");
        const marketplace = escapeHtml(ctx.marketplace || "-");
        const volumes = escapeHtml(String(lastItems?.length || 0));
        const dataHoje = escapeHtml(new Date().toLocaleDateString("pt-BR"));

        const extras = [];

        const periodo = buildPeriodo(ctx);
        if (periodo) {
            extras.push(`
        <div><span class="cd-print-label">Período:</span> <span class="cd-print-value">${escapeHtml(periodo)}</span></div>
      `);
        }

        if (ctx.kind === "quick" && ctx.q) {
            extras.push(`
        <div><span class="cd-print-label">Busca:</span> <span class="cd-print-value">${escapeHtml(ctx.q)}</span></div>
      `);
        }

        // Se quiser também, dá pra mostrar quando filtrou por nota/chave:
        // (mantive discreto pra não “estourar” o layout)
        if (ctx.kind === "filters") {
            const parts = [];
            if (ctx.numero_nota) parts.push(`Nº Nota ${ctx.numero_nota}`);
            if (ctx.chave) parts.push(`Chave ${ctx.chave}`);
            if (parts.length) {
                extras.push(`
          <div><span class="cd-print-label">Filtro:</span> <span class="cd-print-value">${escapeHtml(parts.join(" • "))}</span></div>
        `);
            }
        }

        const card = `
      <div class="cd-print-card">
        <h1 class="cd-print-title">Relação de coleta • Crossdocking</h1>

        <div class="cd-print-meta">
          <div><span class="cd-print-label">Empresa:</span> <span class="cd-print-value">${empresa}</span></div>
          <div><span class="cd-print-label">Marketplace:</span> <span class="cd-print-value">${marketplace}</span></div>
          <div><span class="cd-print-label">Data:</span> <span class="cd-print-value">${dataHoje}</span></div>
          <div><span class="cd-print-label">Volumes bipados:</span> <span class="cd-print-value">${volumes}</span></div>
          ${extras.join("")}
        </div>

        <div class="cd-print-volumes">
          <div class="cd-print-volumes-num">${volumes}</div>
          <div class="cd-print-volumes-label">Volumes bipados</div>
        </div>

        <div class="cd-print-notes">
          Observação: esta relação é resumida (não lista as NF-es). Para detalhes, use a tela de consulta.
        </div>

        <div class="cd-print-sign-grid">
          <div>
            <div class="cd-print-line"></div>
            <div class="cd-print-sign-label">Nome e assinatura (coleta)</div>
          </div>
          <div>
            <div class="cd-print-line"></div>
            <div class="cd-print-sign-label">Documento / RG / CPF</div>
          </div>
        </div>
      </div>
    `;

        const n = Math.max(1, Number(repeticoes) || 1);
        const cards = Array.from({ length: n }, (_, i) => {
            const sep = i === 0 ? "" : `<div class="cd-print-cut"></div>`;
            return `${sep}${card}`;
        }).join("");

        return `
      <div class="cd-print-wrap">
        <div class="cd-print-page">
          ${cards}
        </div>
      </div>
    `;
    }

    function imprimirRelacao() {
        if (!lastItems || lastItems.length <= 0) {
            showErr("Não há resultados para imprimir.");
            return;
        }

        // Gera 2 vias (metade/metade)
        const relacaoHtml = montarRelacaoHtml(2);

        // Copia os CSS atuais (bootstrap + despacho.css etc) para o iframe
        const stylesHtml = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map((n) => n.outerHTML)
            .join("\n");

        // Iframe invisível (impressão isolada => não repete páginas)
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.setAttribute("aria-hidden", "true");
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow.document;

        doc.open();
        doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Relação de coleta</title>
  ${stylesHtml}
  <style>
    /* no iframe, o #cdPrintSheet precisa ficar visível */
    #cdPrintSheet { display: block !important; }
  </style>
</head>
<body>
  <div id="cdPrintSheet" class="cd-print-sheet">
    ${relacaoHtml}
  </div>
</body>
</html>`);
        doc.close();

        const cleanup = () => {
            try { iframe.remove(); } catch (_) { }
        };

        // Alguns browsers não disparam afterprint sempre: mantém fallback
        iframe.contentWindow.onafterprint = cleanup;

        // Pequeno delay pra garantir CSS aplicado antes do print
        setTimeout(() => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } finally {
                // fallback de limpeza
                setTimeout(cleanup, 1500);
            }
        }, 250);
    }

    function renderRows(items) {
        if (!resultsBody) return;

        lastItems = Array.isArray(items) ? items : [];
        setPrintEnabled(lastItems.length > 0);

        if (!lastItems || lastItems.length === 0) {
            resultsBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-muted">Nada encontrado.</td>
        </tr>`;
            setCount(0);
            return;
        }

        const html = lastItems.map((r) => {
            const marketplace = r.marketplace || "-";
            const empresa = r.empresa || "-";
            const numNota = (r.numero_nota === null || r.numero_nota === undefined) ? "-" : r.numero_nota;
            const data = r.data_despacho || "-";
            const hora = r.hora_despacho || "-";

            return `
        <tr>
          <td>${r.id ?? "-"}</td>
          <td>${marketplace}</td>
          <td>${empresa}</td>
          <td class="text-monospace">${r.chave_acesso_nfe || "-"}</td>
          <td>${numNota}</td>
          <td>${data}</td>
          <td>${hora}</td>
        </tr>
      `;
        }).join("");

        resultsBody.innerHTML = html;
        setCount(lastItems.length);
    }

    async function loadMarketplaces() {
        const res = await fetch(API_MARKETPLACES, { method: "GET" });
        const json = await res.json();

        if (!res.ok || !json.ok) {
            throw new Error(json.error || "Falha ao carregar marketplaces");
        }

        const items = Array.isArray(json.items) ? json.items : [];

        const options = items.map((m) => {
            const nome = String(m.nome_mktp || "").trim();
            return `<option value="${m.id_mktp}">${nome || "Marketplace"}</option>`;
        }).join("");

        // Preenche apenas o select do modal (Filtros avançados)
        if (fltMarketplace) fltMarketplace.insertAdjacentHTML("beforeend", options);
    }

    async function loadEmpresas() {
        const res = await fetch(API_EMPRESAS, { method: "GET" });
        const json = await res.json();

        if (!res.ok || !json.ok) {
            throw new Error(json.error || "Falha ao carregar empresas");
        }

        const items = Array.isArray(json.items) ? json.items : [];

        const options = items.map((e) => {
            const nome = String(e.nome_emp || "").trim();
            return `<option value="${e.id_emp}">${nome || "Empresa"}</option>`;
        }).join("");

        if (fltEmpresa) fltEmpresa.insertAdjacentHTML("beforeend", options);
    }

    async function consultar(payload, printCtx) {
        hideErr();
        setLoading(true);

        // snapshot que vai aparecer na impressão desse resultado
        if (printCtx) lastPrintCtx = printCtx;

        try {
            const res = await fetch(API_CONSULTAR, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload || {}),
            });

            const json = await res.json().catch(() => ({}));

            if (!res.ok || !json.ok) {
                throw new Error(json.error || `Erro HTTP ${res.status}`);
            }

            renderRows(json.items || []);
        } catch (e) {
            renderRows([]);
            showErr(e?.message || "Erro ao buscar.");
        } finally {
            setLoading(false);
        }
    }

    function payloadFromQuick() {
        const q = (qInput?.value || "").trim();
        return { q };
    }

    function payloadFromFilters() {
        const out = {};

        const id_mktp = (fltMarketplace?.value || "").trim();
        const id_emp = (fltEmpresa?.value || "").trim();
        const chave = (fltChave?.value || "").trim();
        const numero = (fltNumeroNota?.value || "").trim();

        const data_de = (fltDataDe?.value || "").trim();
        const data_ate = (fltDataAte?.value || "").trim();
        const hora_de = (fltHoraDe?.value || "").trim();
        const hora_ate = (fltHoraAte?.value || "").trim();

        if (id_mktp) out.id_mktp = Number(id_mktp);
        if (id_emp) out.id_emp = Number(id_emp);
        if (chave) out.chave_acesso_nfe = chave;
        if (numero) out.numero_nota = numero;

        if (data_de) out.data_de = data_de;
        if (data_ate) out.data_ate = data_ate;
        if (hora_de) out.hora_de = hora_de;
        if (hora_ate) out.hora_ate = hora_ate;

        return out;
    }

    // Auto-busca quando for 44 dígitos (Pesquisa rápida)
    let autoTimer = null;
    function onQuickInput() {
        const d = digits(qInput?.value);
        if (d.length === 44) {
            clearTimeout(autoTimer);
            autoTimer = setTimeout(() => {
                consultar(payloadFromQuick(), capturePrintCtx("quick"));
            }, 250);
        }
    }

    function clearFilters() {
        if (fltMarketplace) fltMarketplace.value = "";
        if (fltEmpresa) fltEmpresa.value = "";
        if (fltChave) fltChave.value = "";
        if (fltNumeroNota) fltNumeroNota.value = "";
        if (fltDataDe) fltDataDe.value = "";
        if (fltDataAte) fltDataAte.value = "";
        if (fltHoraDe) fltHoraDe.value = "";
        if (fltHoraAte) fltHoraAte.value = "";
        hideErr();
    }

    document.addEventListener("DOMContentLoaded", async () => {
        setPrintEnabled(false);

        try {
            await loadMarketplaces();
            await loadEmpresas();
        } catch (e) {
            showErr(e?.message || "Não foi possível carregar marketplaces/empresas.");
        }

        // Pesquisa rápida
        if (qBtnBuscar) {
            qBtnBuscar.addEventListener("click", () => {
                consultar(payloadFromQuick(), capturePrintCtx("quick"));
            });
        }

        if (qInput) {
            qInput.addEventListener("input", onQuickInput);
            qInput.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    consultar(payloadFromQuick(), capturePrintCtx("quick"));
                }
            });
        }

        // Filtros
        if (btnBuscar) {
            btnBuscar.addEventListener("click", () => {
                consultar(payloadFromFilters(), capturePrintCtx("filters"));
            });
        }
        if (btnLimpar) btnLimpar.addEventListener("click", () => clearFilters());

        // Impressão
        if (btnImprimirRelacao) btnImprimirRelacao.addEventListener("click", () => imprimirRelacao());
    });
})();
