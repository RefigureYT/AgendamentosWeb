// static/expedicao_crossdocking/expedicao_crossdocking.js

document.addEventListener("DOMContentLoaded", () => {
    // ===== marca “Expedição” ativo no menu =====
    try {
        const path = window.location.pathname || "";
        const links = document.querySelectorAll(".navbar .nav-link[href]");
        links.forEach((a) => {
            const href = a.getAttribute("href") || "";
            if (path.startsWith("/expedicao") && href.includes("/expedicao")) {
                a.classList.add("is-active");
            }
        });
    } catch (_) { }

    // ===== elementos =====
    const errorPopupEl = document.getElementById("cdErrorPopup");

    const modalEl = document.getElementById("modalSelecionarMarketplace");
    const selMarketplace = document.getElementById("nome_marketplace");

    const areaDespacho = document.getElementById("areaDespacho");
    const inpNfeBarcode = document.getElementById("inpNfeBarcode");
    const infoMarketplace = document.getElementById("cdMarketplaceInfo");

    const counterEl = document.getElementById("cdCounter");
    const listEl = document.getElementById("cdBipesList");
    const btnConcluir = document.getElementById("btnConcluir");

    let count = 0;
    const nfesBipadas = new Set();
    let marketplaceSelecionadoId = null;

    let errorTimer = null;

    function showErrorPopup(msg) {
        if (!errorPopupEl) return;

        const text = (msg || "").toString().trim();
        if (!text) return;

        // texto bem “longe”
        errorPopupEl.textContent = text;
        errorPopupEl.classList.remove("d-none");

        if (errorTimer) clearTimeout(errorTimer);
        errorTimer = setTimeout(() => {
            errorPopupEl.classList.add("d-none");
        }, 2500);
    }

    function errorToString(payload, fallback = "Erro ao processar.") {
        if (!payload) return fallback;
        if (typeof payload === "string") return payload;

        if (payload.error) {
            if (typeof payload.error === "string") return payload.error;
            try { return JSON.stringify(payload.error); } catch { return fallback; }
        }

        if (payload.message && typeof payload.message === "string") return payload.message;

        try { return JSON.stringify(payload); } catch { return fallback; }
    }

    function resetarBipes() {
        count = 0;
        nfesBipadas.clear();
        if (counterEl) counterEl.textContent = "0";
        if (listEl) listEl.innerHTML = "";
    }

    function adicionarBipe(digits, ts) {
        if (!listEl) return;

        const item = document.createElement("div");
        item.className = "cd-bipe-item";
        item.innerHTML = `
      <div class="cd-bipe-code">${digits}</div>
      <div class="cd-bipe-time">${ts}</div>
    `;

        listEl.appendChild(item);
        listEl.scrollTop = listEl.scrollHeight;
    }

    // foca o select quando o modal abrir
    if (modalEl && selMarketplace) {
        modalEl.addEventListener("shown.bs.modal", () => {
            selMarketplace.focus();
        });
    }

    // ENTER no input -> valida 44 dígitos -> POST -> lista + contador (SEM alert no sucesso)
    if (inpNfeBarcode) {
        inpNfeBarcode.addEventListener("keydown", async (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();

            if (!marketplaceSelecionadoId) {
                showErrorPopup("Selecione o marketplace antes de bipar");
                return;
            }

            const raw = (inpNfeBarcode.value || "").trim();
            const digits = raw.replace(/\D+/g, "");

            if (digits.length !== 44) {
                showErrorPopup("NF-e inválida: precisa ter 44 dígitos");
                return;
            }

            // bloqueio local (rápido)
            if (nfesBipadas.has(digits)) {
                showErrorPopup("NF-e já bipada nesta sessão");
                inpNfeBarcode.value = "";
                inpNfeBarcode.focus();
                return;
            }

            inpNfeBarcode.disabled = true;

            try {
                const resp = await fetch("/api/despacho/crossdocking/nfe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id_mktp: Number(marketplaceSelecionadoId),
                        chave_acesso_nfe: digits,
                    }),
                });

                const data = await resp.json().catch(() => null);

                // erro HTTP ou backend ok:false
                if (!resp.ok || !data || data.ok !== true) {
                    // se for duplicidade no banco, mensagem padrão GRANDE
                    if (resp.status === 409) {
                        showErrorPopup("NF-e já registrada no banco");
                    } else {
                        showErrorPopup(errorToString(data, `Erro HTTP ${resp.status}`));
                    }
                    return;
                }

                // sucesso no banco -> agora sim marca, conta e lista (SEM popup/alert)
                nfesBipadas.add(digits);

                count += 1;
                if (counterEl) counterEl.textContent = String(count);

                const row = data.row || {};
                const hora = row.hora_despacho ? String(row.hora_despacho).slice(0, 8) : "";
                const tsServer =
                    row.data_despacho && hora
                        ? `${row.data_despacho} ${hora}`
                        : new Date().toLocaleString("pt-BR");

                adicionarBipe(digits, tsServer);

            } catch (err) {
                showErrorPopup(errorToString(err, "Falha de rede ao salvar a NF-e"));
            } finally {
                inpNfeBarcode.disabled = false;
                inpNfeBarcode.value = "";
                inpNfeBarcode.focus();
            }
        });
    }

    // botão concluir (SweetAlert2 + contagem regressiva + redirect)
    if (btnConcluir) {
        btnConcluir.addEventListener("click", async () => {
            const redirectUrl = btnConcluir.getAttribute("data-redirect-url") || "/";
            const countdownSeconds = Number(btnConcluir.getAttribute("data-countdown") || "5");

            let timerInterval = null;

            await Swal.fire({
                icon: "success",
                title: "Despacho concluído!",
                html: `
        <div style="font-size: 1.05rem;">
          Tudo certo. Redirecionando para <b>Agendamentos</b> em
          <b><span id="cdSwalCountdown">${countdownSeconds}</span>s</b>.
        </div>
      `,
                showConfirmButton: true,
                confirmButtonText: "OK",
                confirmButtonColor: "#6c63ff",
                allowOutsideClick: false,
                allowEscapeKey: false,
                timer: countdownSeconds * 1000,
                timerProgressBar: true,
                didOpen: () => {
                    const el = Swal.getHtmlContainer()?.querySelector("#cdSwalCountdown");

                    timerInterval = setInterval(() => {
                        const msLeft = Swal.getTimerLeft();
                        if (msLeft == null) return;

                        const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
                        if (el) el.textContent = String(secLeft);
                    }, 200);
                },
                willClose: () => {
                    if (timerInterval) clearInterval(timerInterval);
                },
            });

            window.location.href = redirectUrl;
        });
    }

    // função chamada pelo botão OK do modal
    window.confirmarMarketplaceCrossdocking = function () {
        if (!selMarketplace) {
            showErrorPopup("Selecione o marketplace");
            return;
        }

        const val = selMarketplace.value;
        if (!val) {
            showErrorPopup("Selecione o marketplace");
            return;
        }

        marketplaceSelecionadoId = val;
        const txt = selMarketplace.options[selMarketplace.selectedIndex]?.text || "";

        // fecha modal
        if (modalEl && window.bootstrap) {
            const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            inst.hide();
        }

        // prepara UI
        resetarBipes();
        if (areaDespacho) areaDespacho.classList.remove("d-none");
        if (infoMarketplace) infoMarketplace.textContent = `Marketplace selecionado: ${txt}`;
        if (inpNfeBarcode) setTimeout(() => inpNfeBarcode.focus(), 150);
    };
});
