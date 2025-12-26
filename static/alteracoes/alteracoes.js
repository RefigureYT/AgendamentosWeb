(() => {
    const $ = (id) => document.getElementById(id);

    const elBody = $("altBody");
    const elCount = $("lblCount");
    const elMsg = $("altMsg");

    const elSearch = $("qSearch");
    const elFeitos = $("chkFeitos");
    const btnReload = $("btnReload");

    // Modal (somente ENGANO)
    const modalEl = $("modalReport");
    const modalTitle = $("modalTitle");
    const modalId = $("modalReportId");
    const modalObs = $("modalObs");
    const modalFeito = $("modalFeito");
    const modalHint = $("modalHint");
    const btnConfirm = $("btnModalConfirm");

    let bsModal = null;
    let debounceT = null;

    function showMsg(type, text) {
        elMsg.classList.remove("d-none", "alert-success", "alert-danger", "alert-warning", "alert-info");
        elMsg.classList.add(`alert-${type}`);
        elMsg.textContent = text;
    }

    function hideMsg() {
        elMsg.classList.add("d-none");
        elMsg.textContent = "";
    }

    function fmtDate(iso) {
        if (!iso) return "";
        try {
            const d = new Date(iso);
            return d.toLocaleString("pt-BR");
        } catch {
            return iso;
        }
    }

    function esc(s) {
        return String(s ?? "").replace(/[&<>"']/g, (m) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[m]));
    }

    function isEngano(obs) {
        return String(obs || "").trim().toUpperCase().startsWith("ENGANO:");
    }

    function statusInfo(row) {
        if (row?.feito) return { text: "FEITO", badge: "bg-success" };
        if (isEngano(row?.obs)) return { text: "ENGANO", badge: "bg-warning text-dark" };
        return { text: "PENDENTE", badge: "bg-danger" };
    }

    function setColumnsVisibility() {
        const showFeitos = !!elFeitos.checked;

        // Obs só faz sentido quando está vendo feitos (ou enganos)
        document.querySelectorAll(".alt-col-obs").forEach((el) => {
            el.classList.toggle("d-none", !showFeitos);
        });

        // Ações agora fazem sentido nos 2 modos:
        // - Pendente: Corrigido / Engano
        // - Mostrar feitos: Voltar p/ pendente
        // (então não escondemos mais a coluna)
    }

    function toastCopied() {
        const div = document.createElement("div");
        div.textContent = "Copiado!";
        div.style.position = "fixed";
        div.style.right = "18px";
        div.style.bottom = "18px";
        div.style.zIndex = "9999";
        div.style.padding = "10px 12px";
        div.style.borderRadius = "12px";
        div.style.color = "#fff";
        div.style.background = "rgba(0,0,0,0.85)";
        div.style.fontWeight = "700";
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 900);
    }

    async function copyText(text) {
        const t = (text || "").trim();
        if (!t) return;

        try {
            await navigator.clipboard.writeText(t);
            toastCopied();
            return;
        } catch { /* fallback abaixo */ }

        // fallback
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toastCopied();
    }

    async function apiList() {
        const q = (elSearch.value || "").trim();
        const show_feitos = elFeitos.checked ? "1" : "0";

        const url = new URL("/api/alteracoes/reports", window.location.origin);
        if (q) url.searchParams.set("q", q);
        url.searchParams.set("show_feitos", show_feitos);

        const resp = await fetch(url.toString(), { credentials: "same-origin" });
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok || !data.ok) {
            const msg = data.error || `HTTP ${resp.status}`;
            throw new Error(msg);
        }
        return data.items || [];
    }

    async function apiUpdate(id, acao, obs, feito) {
        const resp = await fetch(`/api/alteracoes/reports/${id}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao, obs, feito })
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
            throw new Error(data.error || `HTTP ${resp.status}`);
        }
        return data.item;
    }

    function renderRows(items) {
        elCount.textContent = String(items.length);

        if (!items.length) {
            elBody.innerHTML = `<tr><td colspan="13" class="text-muted">Nenhum report encontrado.</td></tr>`;
            setColumnsVisibility();
            return;
        }

        const showFeitos = !!elFeitos.checked;

        elBody.innerHTML = items.map((r) => {
            const id = r.id;
            const st = statusInfo(r);
            const isPendente = (st.text === "PENDENTE");

            let actionsHtml = "";

            // Modo PENDENTES: Corrigido / Engano (somente quando está PENDENTE)
            if (!showFeitos && isPendente) {
                actionsHtml = `
              <div class="btn-group btn-group-sm" role="group">
                <button class="btn btn-success" data-action="corrigido" data-id="${id}">Corrigido</button>
                <button class="btn btn-outline-danger" data-action="engano" data-id="${id}">Engano</button>
              </div>
            `;
            }

            // Modo FEITOS/ENGANO: Voltar p/ pendente
            if (showFeitos && !isPendente) {
                actionsHtml = `
              <button class="btn btn-outline-secondary btn-sm" data-action="pendente" data-id="${id}">
                <i class="bi bi-arrow-counterclockwise"></i> Voltar p/ pendente
              </button>
            `;
            }

            return `
            <tr>
            <td class="alt-copy" title="Clique para copiar" data-label="Data">${esc(fmtDate(r.created_at))}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="Empresa">${esc(r.empresa_label)}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="MKTP">${esc(r.marketplace_label)}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="Etiqueta/ID">${esc(r.etiqueta_id || "")}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="Produto">${esc(r.produto)}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="SKU">${esc(r.sku || "")}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="EAN">${esc(r.ean || "")}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="Tipo">${esc(r.tipo)}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="Report">${esc(r.report)}</td>
            <td class="alt-copy" title="Clique para copiar" data-label="Colaborador">${esc(r.colaborador || "")}</td>

            <td class="alt-copy alt-col-obs" title="Clique para copiar" data-label="Obs">${esc(r.obs || "")}</td>

            <td class="alt-copy" title="Clique para copiar" data-label="Status">
                <span class="badge ${st.badge}">${st.text}</span>
            </td>

            <td class="text-end alt-col-acoes" data-label="Ações">
                ${actionsHtml}
            </td>
            </tr>
        `;
        }).join("");

        setColumnsVisibility();
    }

    function openEnganoModal(id) {
        modalId.value = String(id);
        modalObs.value = "";
        modalFeito.checked = false; // padrão: fica ENGANO (não FEITO)

        modalTitle.textContent = "Marcar como engano";
        modalHint.innerHTML = "Observação é <b>obrigatória</b>. Status vira <b>ENGANO</b> (a menos que você marque como FEITO).";

        if (!bsModal) bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();
        setTimeout(() => modalObs.focus(), 150);
    }

    async function onConfirmEngano() {
        const id = Number(modalId.value || "0");
        const obsRaw = (modalObs.value || "").trim();
        const feito = !!modalFeito.checked;

        if (!id) return;

        if (!obsRaw) {
            showMsg("warning", "Para 'engano' a observação é obrigatória.");
            modalObs.focus();
            return;
        }

        // garante que o status “ENGANO” seja identificável (mesmo se o backend não prefixar)
        const obsToSend = obsRaw.toUpperCase().startsWith("ENGANO:") ? obsRaw : `ENGANO: ${obsRaw}`;

        btnConfirm.disabled = true;
        try {
            await apiUpdate(id, "engano", obsToSend, feito);
            bsModal?.hide();
            showMsg("success", "Atualizado com sucesso!");
            await reload();
        } catch (e) {
            showMsg("danger", String(e.message || e));
        } finally {
            btnConfirm.disabled = false;
        }
    }

    async function reload() {
        hideMsg();
        elBody.innerHTML = `<tr><td colspan="13" class="text-muted">Carregando...</td></tr>`;
        try {
            let items = await apiList();

            // Regra:
            // - Se NÃO está mostrando feitos => mostrar somente PENDENTE
            // - Se está mostrando feitos      => mostrar somente FEITO e ENGANO
            if (elFeitos.checked) {
                items = (items || []).filter((r) => !!r.feito || isEngano(r.obs));
            } else {
                items = (items || []).filter((r) => !r.feito && !isEngano(r.obs));
            }

            renderRows(items);
        } catch (e) {
            elBody.innerHTML = `<tr><td colspan="13" class="text-danger">Erro: ${esc(e.message || e)}</td></tr>`;
            showMsg("danger", String(e.message || e));
            setColumnsVisibility();
        }
    }

    // ========= Eventos =========

    // Click em botões
    document.addEventListener("click", async (ev) => {
        const btn = ev.target?.closest?.("button[data-action][data-id]");
        if (!btn) return;

        const action = btn.getAttribute("data-action");
        const id = Number(btn.getAttribute("data-id") || "0");
        if (!id) return;

        // CORRIGIDO: direto (sem modal, sem obs)
        if (action === "corrigido") {
            try {
                btn.disabled = true;
                await apiUpdate(id, "corrigido", "", true);
                showMsg("success", "Marcado como corrigido!");
                await reload();
            } catch (e) {
                showMsg("danger", String(e.message || e));
            } finally {
                btn.disabled = false;
            }
            return;
        }

        // VOLTAR P/ PENDENTE
        if (action === "pendente") {
            if (!confirm("Voltar este report para PENDENTE?")) return;
            try {
                btn.disabled = true;
                await apiUpdate(id, "pendente", "", false);
                showMsg("success", "Voltou para pendente!");
                await reload();
            } catch (e) {
                showMsg("danger", String(e.message || e));
            } finally {
                btn.disabled = false;
            }
            return;
        }

        // ENGANO: abre modal (obs obrigatória)
        if (action === "engano") {
            openEnganoModal(id);
        }
    });

    // Confirmar engano
    btnConfirm.addEventListener("click", onConfirmEngano);

    // Recarregar
    btnReload.addEventListener("click", reload);

    // Toggle feitos
    elFeitos.addEventListener("change", reload);

    // Buscar
    elSearch.addEventListener("input", () => {
        clearTimeout(debounceT);
        debounceT = setTimeout(reload, 250);
    });

    // Copiar: qualquer célula
    elBody.addEventListener("click", (ev) => {
        // não copia quando clicou em botão/ação
        if (ev.target.closest("button")) return;

        const td = ev.target.closest("td.alt-copy");
        if (!td) return;

        const txt = td.innerText || "";
        copyText(txt);
    });

    document.addEventListener("DOMContentLoaded", reload);
})();
