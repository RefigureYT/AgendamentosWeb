document.addEventListener("DOMContentLoaded", () => {
    const PRINTER_MAP = {
        btnImpressoraRelatorio: { key: "printer_relatorio" },
        btnImpressoraCx: { key: "printer_caixa" },
        btnImpressoraId: { key: "printer_id" },
    };

    // Para fins de DEBUG
    // Abaixo tem o código que quando todo o DOM é carregado
    // Surge um ALERTA dizendo as impressoras que estão salvas no localStorage /* para conferência */
    // (pode ser removido depois de testado)
    /*
    const savedPrinters = Object.values(PRINTER_MAP).map(cfg => {
        const v = localStorage.getItem(cfg.key);
        return `${cfg.key}: ${v ? v : "(nenhuma)"}`;
    }).join("\n");
    if (savedPrinters) {
        alert("Impressoras salvas:\n" + savedPrinters);
    } else {
        alert("Nenhuma impressora salva.");
    }
    */

    // Elementos do modal
    const modalEl = document.getElementById("printerModal");
    const btnOk = document.getElementById("btnConfirmPrinter");
    const loadingEl = document.getElementById("printerLoading");
    const listWrap = document.getElementById("printerListWrap");
    const listEl = document.getElementById("printerList");
    const emptyEl = document.getElementById("printerEmpty");
    const errorEl = document.getElementById("printerError");
    const bsModal = modalEl ? new bootstrap.Modal(modalEl) : null;

    // Labels de impressora selecionada
    const lblRelatorio = document.getElementById("lblImpressoraRelatorio");
    const lblCaixa = document.getElementById("lblImpressoraCx");
    const lblId = document.getElementById("lblImpressoraId");

    // Atualiza os labels com o que está salvo
    const updateLabels = () => {
        if (lblRelatorio) {
            const v = localStorage.getItem("printer_relatorio");
            lblRelatorio.textContent = v ? v : "Nenhuma impressora selecionada";
        }
        if (lblCaixa) {
            const v = localStorage.getItem("printer_caixa");
            lblCaixa.textContent = v ? v : "Nenhuma impressora selecionada";
        }
        if (lblId) {
            const v = localStorage.getItem("printer_id");
            lblId.textContent = v ? v : "Nenhuma impressora selecionada";
        }
    };
    updateLabels();

    // Atualiza os labels quando uma impressora é selecionada
    document.addEventListener("printer:selected", (e) => {
        const { key } = e.detail || {};
        if (key && Object.values(PRINTER_MAP).some(cfg => cfg.key === key)) {
            updateLabels();
        }
    });

    // NOVO: flag de guarda + helpers
    let isFetchingPrinters = false;
    const triggerButtons = Object.keys(PRINTER_MAP)
        .map(id => document.getElementById(id))
        .filter(Boolean);

    const disableTriggers = (state) => {
        triggerButtons.forEach(b => b.disabled = state);
    };

    const getSaved = (key) => localStorage.getItem(key);
    const setSaved = (key, name) => localStorage.setItem(key, name);

    let currentKey = null;
    let selectedName = null;

    function createPrinterItem(name, preselect = false) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
        item.setAttribute("role", "radio");
        item.setAttribute("aria-checked", preselect ? "true" : "false");
        item.textContent = name;

        const mark = document.createElement("span");
        mark.className = "badge text-bg-light";
        mark.textContent = preselect ? "Atual" : "Selecionar";
        item.appendChild(mark);

        if (preselect) {
            item.classList.add("active");
            selectedName = name;
            btnOk.disabled = false;
        }

        item.addEventListener("click", () => {
            listEl.querySelectorAll(".list-group-item").forEach(el => {
                el.classList.remove("active");
                el.setAttribute("aria-checked", "false");
                const b = el.querySelector(".badge");
                if (b) b.textContent = "Selecionar";
            });
            item.classList.add("active");
            item.setAttribute("aria-checked", "true");
            mark.textContent = "Selecionado";
            selectedName = name;
            btnOk.disabled = false;
        });

        return item;
    }

    function resetModalUI() {
        btnOk.disabled = true;
        selectedName = null;
        // Garantir “loading visível” e lista limpa
        loadingEl.classList.remove("d-none");
        listWrap.classList.add("d-none");
        emptyEl.classList.add("d-none");
        errorEl.classList.add("d-none");
        errorEl.textContent = "";
        listEl.innerHTML = "";
    }

    function openPrinterModal(key) {
        // NOVO: guarda anti-bounce
        if (isFetchingPrinters) return;
        isFetchingPrinters = true;
        disableTriggers(true);

        currentKey = key;
        resetModalUI();

        // Abre o modal JÁ em carregamento (bloqueia a UI)
        bsModal?.show();

        if (!window.BrowserPrint || typeof BrowserPrint.getLocalDevices !== "function") {
            loadingEl.classList.add("d-none");
            errorEl.textContent = "Zebra BrowserPrint não detectado. Instale/abra o BrowserPrint para listar impressoras.";
            errorEl.classList.remove("d-none");
            isFetchingPrinters = false;
            disableTriggers(false);
            return;
        }

        BrowserPrint.getLocalDevices(
            (devicesObject) => {
                const printers = devicesObject?.printer || [];
                loadingEl.classList.add("d-none");
                listWrap.classList.remove("d-none");

                const saved = getSaved(key);

                if (!printers.length) {
                    emptyEl.classList.remove("d-none");
                } else {
                    // limpa sempre antes de popular (evita duplicar se algo der reload no modal)
                    listEl.innerHTML = "";
                    printers.forEach(p => {
                        listEl.appendChild(createPrinterItem(p.name, saved && p.name === saved));
                    });
                    btnOk.disabled = !listEl.querySelector(".list-group-item.active");
                }

                isFetchingPrinters = false;
                disableTriggers(false);
            },
            (err) => {
                loadingEl.classList.add("d-none");
                errorEl.textContent = "Falha ao comunicar com o BrowserPrint. Verifique a instalação e tente novamente.";
                errorEl.classList.remove("d-none");
                console.error("[BrowserPrint] getLocalDevices error:", err);
                isFetchingPrinters = false;
                disableTriggers(false);
            }
        );
    }

    document.getElementById("btnConfirmPrinter").addEventListener("click", () => {
        if (!currentKey || !selectedName) return;
        setSaved(currentKey, selectedName);
        document.dispatchEvent(new CustomEvent("printer:selected", {
            detail: { key: currentKey, name: selectedName }
        }));
        bsModal?.hide();
    });

    // Liga os botões de abrir
    Object.entries(PRINTER_MAP).forEach(([btnId, cfg]) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener("click", () => openPrinterModal(cfg.key));
    });
});