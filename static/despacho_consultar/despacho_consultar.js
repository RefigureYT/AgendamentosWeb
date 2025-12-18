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

    const digits = (v) => String(v || "").replace(/\D+/g, "");

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

    function renderRows(items) {
        if (!resultsBody) return;

        if (!items || items.length === 0) {
            resultsBody.innerHTML = `
            <tr>
            <td colspan="7" class="text-muted">Nada encontrado.</td>
            </tr>`;
            setCount(0);
            return;
        }

        const html = items.map((r) => {
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
        setCount(items.length);
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

    async function consultar(payload) {
        hideErr();
        setLoading(true);

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
                consultar(payloadFromQuick());
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
        try {
            await loadMarketplaces();
            await loadEmpresas();
        } catch (e) {
            showErr(e?.message || "Não foi possível carregar marketplaces/empresas.");
        }

        // Pesquisa rápida
        if (qBtnBuscar) qBtnBuscar.addEventListener("click", () => consultar(payloadFromQuick()));
        if (qInput) {
            qInput.addEventListener("input", onQuickInput);
            qInput.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    consultar(payloadFromQuick());
                }
            });
        }

        // Filtros
        if (btnBuscar) btnBuscar.addEventListener("click", () => consultar(payloadFromFilters()));
        if (btnLimpar) btnLimpar.addEventListener("click", () => clearFilters());
    });
})();
