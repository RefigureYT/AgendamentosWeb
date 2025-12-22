// static/despacho/despacho.js

document.addEventListener("DOMContentLoaded", () => {
    const API_MARKETPLACES = "/api/despacho/marketplaces";
    const API_EMPRESAS = "/api/despacho/empresas";
    const API_BIPAR_NFE = "/api/despacho/crossdocking/nfe";

    // ===== marca “Despacho” ativo no menu =====
    try {
        const path = window.location.pathname || "";
        const links = document.querySelectorAll(".navbar .nav-link[href]");
        links.forEach((a) => {
            const href = a.getAttribute("href") || "";
            if (path.startsWith("/despacho") && href.includes("/despacho")) {
                a.classList.add("is-active");
            }
        });
    } catch (_) { }

    // ===== elementos =====
    const errorPopupEl = document.getElementById("cdErrorPopup");

    const modalEmpresaEl = document.getElementById("modalSelecionarEmpresa");
    const modalMktpEl = document.getElementById("modalSelecionarMarketplace");

    const selEmpresa = document.getElementById("nome_empresa");
    const selMarketplace = document.getElementById("nome_marketplace");

    const areaDespacho = document.getElementById("areaDespacho");
    const inpNfeBarcode = document.getElementById("inpNfeBarcode");
    const infoMarketplace = document.getElementById("cdMarketplaceInfo");

    const counterEl = document.getElementById("cdCounter");
    const listEl = document.getElementById("cdBipesList");
    const btnConcluir = document.getElementById("btnConcluir");
    const btnImprimirRelacao = document.getElementById("btnImprimirRelacao");
    const printSheetEl = document.getElementById("cdPrintSheet");

    // ===== estado =====
    let count = 0;
    const nfesBipadas = new Set();
    let marketplaceSelecionadoId = null;
    let empresaSelecionadaId = null;
    let marketplaceSelecionadoNome = "";
    let empresaSelecionadaNome = "";
    let errorTimer = null;

    // botão de impressão começa desabilitado
    setPrintEnabled(false);

    // limpa a folha após a impressão (evita ficar "presa" no DOM)
    window.addEventListener("beforeprint", () => {
        // Alguns cenários (ex: confirmação via modal) podem abrir o preview em branco
        // se o conteúdo ainda não estiver montado.
        if (printSheetEl && !printSheetEl.innerHTML) {
            printSheetEl.innerHTML = montarRelacaoHtml(2);
        }
    });

    window.addEventListener("afterprint", () => {
        // Delay para evitar limpar cedo demais (alguns navegadores disparam o evento rapidamente).
        if (printSheetEl) {
            setTimeout(() => {
                printSheetEl.innerHTML = "";
            }, 400);
        }
    });

    // ===== helpers =====
    function showErrorPopup(msg) {
        if (!errorPopupEl) return;

        const text = (msg || "").toString().trim();
        if (!text) return;

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
            try {
                return JSON.stringify(payload.error);
            } catch {
                return fallback;
            }
        }

        if (payload.message && typeof payload.message === "string") return payload.message;

        try {
            return JSON.stringify(payload);
        } catch {
            return fallback;
        }
    }

    function escapeHtml(v) {
        return String(v ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function setPrintEnabled(on) {
        if (!btnImprimirRelacao) return;
        btnImprimirRelacao.disabled = !on;
    }

    function montarRelacaoHtml(repeticoes = 2) {
        const dataHoje = new Date().toLocaleDateString("pt-BR");
        const empresa = escapeHtml(empresaSelecionadaNome || "-");
        const marketplace = escapeHtml(marketplaceSelecionadoNome || "-");
        const volumes = Number(count) || 0;

        const card = `
        <div class="cd-print-card">
          <h1 class="cd-print-title">Relação de Coleta • Crossdocking</h1>

          <div class="cd-print-meta">
            <div><span class="cd-print-label">Empresa:</span> <span class="cd-print-value">${empresa}</span></div>
            <div><span class="cd-print-label">Marketplace:</span> <span class="cd-print-value">${marketplace}</span></div>
            <div><span class="cd-print-label">Data:</span> <span class="cd-print-value">${dataHoje}</span></div>
            <div><span class="cd-print-label">Volumes bipados:</span> <span class="cd-print-value">${volumes}</span></div>
          </div>

          <div class="cd-print-volumes">
            <div class="cd-print-volumes-num">${volumes}</div>
            <div class="cd-print-volumes-label">Volumes bipados</div>
          </div>

          <div class="cd-print-notes">
            Observação: esta relação é resumida (não lista as NF-es). Para detalhes, use “Consultar pedidos”.
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
        if (!empresaSelecionadaId || !marketplaceSelecionadoId) {
            showErrorPopup("Selecione a empresa e o marketplace antes de imprimir");
            return;
        }
        if ((Number(count) || 0) <= 0) {
            showErrorPopup("Nenhuma NF-e bipada para imprimir");
            return;
        }
        if (!printSheetEl) {
            // fallback (não deve acontecer se o HTML estiver atualizado)
            window.print();
            return;
        }

        // 2 vias na mesma folha (em cima e em baixo)
        printSheetEl.innerHTML = montarRelacaoHtml(2);

        // força reflow pra garantir que o HTML “assentou” (ajuda a evitar preview em branco)
        void printSheetEl.offsetHeight;

        // dá um tick a mais pro DOM renderizar antes do print (Chrome/Edge)
        setTimeout(() => window.print(), 120);
    }
    function resetarBipes() {
        count = 0;
        nfesBipadas.clear();
        if (counterEl) counterEl.textContent = "0";
        if (listEl) listEl.innerHTML = "";
        setPrintEnabled(false);
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

    // ===== modal dinâmico =====
    async function carregarMarketplacesNoSelect() {
        if (!selMarketplace) return;

        // opcional: mostra "carregando..."
        selMarketplace.innerHTML = `<option value="" selected disabled>Carregando...</option>`;

        const res = await fetch(API_MARKETPLACES, { method: "GET" });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
            throw new Error(json.error || `Falha ao carregar marketplaces (HTTP ${res.status})`);
        }

        const items = Array.isArray(json.items) ? json.items : [];

        selMarketplace.innerHTML = `<option value="" selected disabled>Selecione o Marketplace</option>`;

        for (const m of items) {
            const opt = document.createElement("option");
            opt.value = String(m.id_mktp);
            opt.textContent = String(m.nome_mktp || "").trim() || `Marketplace ${m.id_mktp}`;
            selMarketplace.appendChild(opt);
        }
    }

    async function carregarEmpresasNoSelect() {
        if (!selEmpresa) return;

        selEmpresa.innerHTML = `<option value="" selected disabled>Carregando...</option>`;

        const res = await fetch(API_EMPRESAS, { method: "GET" });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
            throw new Error(json.error || `Falha ao carregar empresas (HTTP ${res.status})`);
        }

        const items = Array.isArray(json.items) ? json.items : [];

        selEmpresa.innerHTML = `<option value="" selected disabled>Selecione a Empresa</option>`;

        for (const e of items) {
            // a API já ignora id_emp=0, mas vamos garantir
            const id = Number(e.id_emp);
            if (!Number.isFinite(id) || id <= 0) continue;

            const opt = document.createElement("option");
            opt.value = String(id);
            opt.textContent = String(e.nome_emp || "").trim() || `Empresa ${id}`;
            selEmpresa.appendChild(opt);
        }
    }

    // Modal 1 (Empresa)
    if (modalEmpresaEl && selEmpresa) {
        modalEmpresaEl.addEventListener("shown.bs.modal", async () => {
            try {
                await carregarEmpresasNoSelect();
                selEmpresa.focus();
            } catch (e) {
                showErrorPopup(e?.message || "Não foi possível carregar as empresas.");
            }
        });
    }

    // Modal 2 (Marketplace)
    if (modalMktpEl && selMarketplace) {
        modalMktpEl.addEventListener("shown.bs.modal", async () => {
            try {
                await carregarMarketplacesNoSelect();
                selMarketplace.focus();
            } catch (e) {
                showErrorPopup(e?.message || "Não foi possível carregar os marketplaces.");
            }
        });
    }

    // ===== botão "Imprimir relação" =====
    if (btnImprimirRelacao) {
        btnImprimirRelacao.addEventListener("click", (e) => {
            e.preventDefault();
            imprimirRelacao();
        });
    }

    // ===== ENTER no input -> valida 44 dígitos -> POST -> lista + contador =====
    if (inpNfeBarcode) {
        inpNfeBarcode.addEventListener("keydown", async (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();

            if (!empresaSelecionadaId) {
                showErrorPopup("Selecione a empresa antes de bipar");
                return;
            }
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
                const resp = await fetch(API_BIPAR_NFE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id_mktp: Number(marketplaceSelecionadoId),
                        id_emp: Number(empresaSelecionadaId),
                        chave_acesso_nfe: digits,
                    }),
                });

                const data = await resp.json().catch(() => null);

                if (!resp.ok || !data || data.ok !== true) {
                    if (resp.status === 409) {
                        showErrorPopup("NF-e já registrada no banco");
                    } else {
                        showErrorPopup(errorToString(data, `Erro HTTP ${resp.status}`));
                    }
                    return;
                }

                // sucesso no banco -> marca, conta e lista (SEM popup no sucesso)
                nfesBipadas.add(digits);

                count += 1;
                if (counterEl) counterEl.textContent = String(count);
                setPrintEnabled(true);

                const row = data.row || {};
                const hora = row.hora_despacho ? String(row.hora_despacho).slice(0, 8) : "";
                const tsServer =
                    row.data_despacho && hora ? `${row.data_despacho} ${hora}` : new Date().toLocaleString("pt-BR");

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

    // ===== botão concluir (opção de imprimir a relação antes de finalizar) =====
    if (btnConcluir) {
        btnConcluir.addEventListener("click", async () => {
            const redirectUrl = btnConcluir.getAttribute("data-redirect-url") || "/";
            const countdownSeconds = Number(btnConcluir.getAttribute("data-countdown") || "5");

            if (!empresaSelecionadaId || !marketplaceSelecionadoId) {
                showErrorPopup("Selecione a empresa e o marketplace antes de concluir");
                return;
            }

            if ((Number(count) || 0) <= 0) {
                showErrorPopup("Nenhuma NF-e bipada");
                return;
            }

            const resumoHtml = `
        <div style="text-align:left; font-size: 1.02rem;">
          <div><b>Empresa:</b> ${escapeHtml(empresaSelecionadaNome || "-")}</div>
          <div><b>Marketplace:</b> ${escapeHtml(marketplaceSelecionadoNome || "-")}</div>
          <div><b>Volumes bipados:</b> ${escapeHtml(count)}</div>
          <div style="margin-top: 10px;" class="text-muted">
            A relação impressa é resumida (1 página) e não lista as NF-es.
          </div>
        </div>
      `;

            const escolha = await Swal.fire({
                icon: "question",
                title: "Finalizar despacho",
                html: resumoHtml,
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: "Imprimir relação",
                denyButtonText: "Concluir",
                cancelButtonText: "Voltar",
                confirmButtonColor: "#0b5ed7",
                allowOutsideClick: false,
                allowEscapeKey: true,
            });

            if (escolha.isConfirmed) {
                // Garante que o SweetAlert fechou 100% antes de abrir o print (evita página em branco)
                setTimeout(() => imprimirRelacao(), 150);
                return;
            }

            if (!escolha.isDenied) {
                // cancelou / fechou
                return;
            }

            // Concluir -> mostra contagem e redireciona
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
                confirmButtonColor: "#0b5ed7",
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

    window.confirmarEmpresaCrossdocking = function () {
        if (!selEmpresa) {
            showErrorPopup("Selecione a empresa");
            return;
        }

        const empVal = selEmpresa.value;
        if (!empVal || Number(empVal) <= 0) {
            showErrorPopup("Selecione uma empresa válida");
            return;
        }

        empresaSelecionadaId = empVal;

        // guarda nome selecionado (para impressão)
        empresaSelecionadaNome = selEmpresa?.options?.[selEmpresa.selectedIndex]?.text || "";

        // Se trocou empresa, zera marketplace selecionado
        marketplaceSelecionadoId = null;
        marketplaceSelecionadoNome = "";
        if (selMarketplace) selMarketplace.value = "";

        if (!modalEmpresaEl || !window.bootstrap) return;

        const inst = bootstrap.Modal.getInstance(modalEmpresaEl) || new bootstrap.Modal(modalEmpresaEl);

        // Só abre o modal 2 depois que o 1 terminar de fechar (evita bug de backdrop/animação)
        modalEmpresaEl.addEventListener(
            "hidden.bs.modal",
            () => {
                if (modalMktpEl && window.bootstrap) {
                    const inst2 = bootstrap.Modal.getInstance(modalMktpEl) || new bootstrap.Modal(modalMktpEl);
                    inst2.show();
                }
            },
            { once: true }
        );

        inst.hide();
    };

    window.confirmarMarketplaceCrossdocking = function () {
        if (!empresaSelecionadaId) {
            showErrorPopup("Selecione a empresa primeiro");
            return;
        }

        if (!selMarketplace) {
            showErrorPopup("Selecione o marketplace");
            return;
        }

        const mktpVal = selMarketplace.value;
        if (!mktpVal || Number(mktpVal) <= 0) {
            showErrorPopup("Selecione o marketplace");
            return;
        }

        marketplaceSelecionadoId = mktpVal;

        const empTxt = selEmpresa?.options?.[selEmpresa.selectedIndex]?.text || "";
        const mktpTxt = selMarketplace.options[selMarketplace.selectedIndex]?.text || "";

        // guarda nomes para impressão
        empresaSelecionadaNome = empTxt;
        marketplaceSelecionadoNome = mktpTxt;

        if (!modalMktpEl || !window.bootstrap) return;

        const inst = bootstrap.Modal.getInstance(modalMktpEl) || new bootstrap.Modal(modalMktpEl);

        // Só atualiza a UI depois que o modal fechar (fica mais “liso”)
        modalMktpEl.addEventListener(
            "hidden.bs.modal",
            () => {
                resetarBipes();
                if (areaDespacho) areaDespacho.classList.remove("d-none");
                if (infoMarketplace) {
                    infoMarketplace.innerHTML =
                        `Marketplace selecionado: <span class="cd-pill">${mktpTxt}</span> ` +
                        `Empresa: <span class="cd-pill cd-pill--soft">${empTxt}</span>`;
                }
                if (inpNfeBarcode) setTimeout(() => inpNfeBarcode.focus(), 150);
            },
            { once: true }
        );

        inst.hide();
    };
});
