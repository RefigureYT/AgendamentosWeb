document.addEventListener("DOMContentLoaded", async () => {

  // ==== util: escapar HTML simples (para innerHTML) ====
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // imagem segura (evita http em https + placeholder)
  function resolveImageUrl(url) {
    const placeholder =
      document.getElementById("placeholder-image")?.dataset?.url ||
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#999">sem imagem</text></svg>'
      );
    let u = url || placeholder;
    if (location.protocol === "https:" && /^http:\/\//i.test(u)) u = placeholder;
    return u;
  }

  function buildInfoHTML(d) {
    const img = resolveImageUrl(d.imagemUrl);
    return `
    <div class="pp-card">
      <img src="${img}" alt="${esc(d.nome || '')}">
      <div class="meta">
        <div><span class="k">Nome:</span> ${esc(d.nome || "-")}</div>
        <div><span class="k">SKU:</span> ${esc(d.sku || "-")}</div>
        <div><span class="k">EAN:</span> ${esc(d.gtin || "-")}</div>
        <div><span class="k">Etiqueta/ID ML:</span> ${esc(d.id_ml || "-")}</div>
        <div><span class="k">ID Tiny:</span> ${esc(d.id_tiny || "-")}</div>
        <div><span class="k">Unidades:</span> ${esc(d.unidades ?? "-")}</div>
      </div>
    </div>`;
  }

  // ==== util fetch com CSRF + timeout ====
  const CSRF = document.querySelector('meta[name="csrf-token"]')?.content || '';
  async function fetchJSON(url, { method = 'GET', headers = {}, body = null, timeoutMs = 10000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF, ...headers },
        body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || res.statusText);
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  // ---- Modal de seleção de impressoras (BrowserPrint) ----
  (() => {
    // Mapa das chaves persistidas por tipo
    const KEY_BY_TIPO = { relatorio: 'printer_relatorio', caixa: 'printer_caixa', id: 'printer_id' };

    let currentKey = null;
    let selectedName = null;
    let isFetching = false; // guarda contra requisições concorrentes

    const modalEl = document.getElementById("printerModal");
    const btnOk = document.getElementById("btnConfirmPrinter");
    const loadingEl = document.getElementById("printerLoading");
    const listWrap = document.getElementById("printerListWrap");
    const listEl = document.getElementById("printerList");
    const emptyEl = document.getElementById("printerEmpty");
    const errorEl = document.getElementById("printerError");

    // Exponho globalmente para você poder usar em qualquer função
    window.bsModal = modalEl ? new bootstrap.Modal(modalEl) : null;

    function resetUI() {
      btnOk.disabled = true;
      selectedName = null;
      loadingEl.classList.remove("d-none");
      listWrap.classList.add("d-none");
      emptyEl.classList.add("d-none");
      errorEl.classList.add("d-none");
      errorEl.textContent = "";
      listEl.innerHTML = "";
    }

    function createItem(name, preselect = false) {
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

    function openPrinterModalForKey(key) {
      if (!window.bsModal) { console.warn("Modal de impressoras não encontrado."); return; }
      if (isFetching) return; // evita múltiplas buscas/listagens

      isFetching = true;
      currentKey = key;
      resetUI();
      bsModal.show(); // abre já em modo "loading" e bloqueia a UI

      if (!window.BrowserPrint || typeof BrowserPrint.getLocalDevices !== "function") {
        loadingEl.classList.add("d-none");
        errorEl.textContent = "Zebra BrowserPrint não detectado. Instale/abra o BrowserPrint para listar impressoras.";
        errorEl.classList.remove("d-none");
        isFetching = false;
        return;
      }

      BrowserPrint.getLocalDevices(
        (devicesObject) => {
          const printers = devicesObject?.printer || [];
          const saved = localStorage.getItem(key);

          loadingEl.classList.add("d-none");
          listWrap.classList.remove("d-none");
          listEl.innerHTML = "";

          if (!printers.length) {
            emptyEl.classList.remove("d-none");
          } else {
            printers.forEach(p => listEl.appendChild(createItem(p.name, saved && p.name === saved)));
            btnOk.disabled = !listEl.querySelector(".list-group-item.active");
          }

          isFetching = false;
        },
        (err) => {
          loadingEl.classList.add("d-none");
          errorEl.textContent = "Falha ao comunicar com o BrowserPrint. Verifique a instalação e tente novamente.";
          errorEl.classList.remove("d-none");
          console.error("[BrowserPrint] getLocalDevices error:", err);
          isFetching = false;
        }
      );
    }

    btnOk.addEventListener("click", () => {
      if (!currentKey || !selectedName) return;
      localStorage.setItem(currentKey, selectedName);

      // dispara evento para quem quiser ouvir e atualizar UI
      document.dispatchEvent(new CustomEvent("printer:selected", {
        detail: { key: currentKey, name: selectedName }
      }));

      bsModal.hide();
    });

    // Exponho uma função por tipo (relatorio|caixa|id)
    window.openPrinterModalByTipo = function (tipo) {
      const key = KEY_BY_TIPO[tipo];
      if (!key) return;
      openPrinterModalForKey(key);
    };
  })();
  // Para fins de DEBUG
  // Abaixo tem o código que quando todo o DOM é carregado
  // Surge um ALERTA dizendo as impressoras que estão salvas no localStorage /* para conferência */
  // (pode ser removido depois de testado)

  // const savedPrinters = [
  //     { key: "printer_relatorio" },
  //     { key: "printer_caixa" },
  //     { key: "printer_id" },
  // ].map(cfg => {  
  //     const v = localStorage.getItem(cfg.key);
  //     return `${cfg.key}: ${v ? v : "(nenhuma)"}`;
  // }).join("\n");
  // if (savedPrinters) {
  //     alert("Impressoras salvas:\n" + savedPrinters);
  // } else {
  //     alert("Nenhuma impressora salva.");
  // }
  // Fim do código de DEBUG
  // ===================================================================
  // 1) Dados iniciais e imagem padrão

  // ===== Modal Fechar Caixa: estado e helpers =====
  const LAST_PRINT_PREF_KEY = 'preferencia_impressao_caixa';
  let modalFecharCaixa = null;
  let selectedOpcaoImpressao = 'ambas'; // default
  let ultimaCaixaSnapshot = null;       // guarda referência da caixa antes de fechar

  // ==== Globais usadas pelo modal de fechamento ====
  const FKEY_TO_OPT = { F1: 'ambas', F2: 'ml', F3: 'jp', F4: 'nenhuma' };
  let isFecharModalOpen = false; // indica se o modal de fechar caixa está aberto

  function inicializarModalFecharCaixa() {
    const elModal = document.getElementById('modalFecharCaixa');
    if (!elModal) return;

    // instancia (backdrop travado e sem ESC)
    modalFecharCaixa = new bootstrap.Modal(elModal, { backdrop: 'static', keyboard: false });

    const labels = Array.from(elModal.querySelectorAll('.fechar-caixa-option'));
    const btnConfirm = elModal.querySelector('#btnConfirmarFechamento');
    const btnCancel = elModal.querySelector('#btnCancelarFechamento');
    const chkLembrar = elModal.querySelector('#guardarOpcaoImpressao');

    function aplicarSelecao(id) {
      selectedOpcaoImpressao = id;
      labels.forEach(l => l.classList.toggle('active', l.dataset.value === id));
      const input = elModal.querySelector(`input[name="optImpressao"][value="${id}"]`);
      if (input) input.checked = true;
    }
    window.__aplicarSelecaoFecharCaixa = aplicarSelecao; // exporta para outros handlers

    // estado de aberto/fechado (evita resets)
    elModal.addEventListener('shown.bs.modal', () => { isFecharModalOpen = true; });
    elModal.addEventListener('hidden.bs.modal', () => { isFecharModalOpen = false; });

    // clique nas opções
    labels.forEach(l => l.addEventListener('click', () => aplicarSelecao(l.dataset.value)));

    // carrega preferência salva (se existir)
    const saved = localStorage.getItem(LAST_PRINT_PREF_KEY);
    aplicarSelecao(saved || 'ambas');
    if (saved) chkLembrar.checked = true;

    // atalhos DENTRO do modal: F1–F4 escolhem, Enter confirma
    elModal.addEventListener('keydown', (e) => {
      if (FKEY_TO_OPT[e.key]) {
        e.preventDefault();
        aplicarSelecao(FKEY_TO_OPT[e.key]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        btnConfirm.click();
      }
    });

    // confirmar
    btnConfirm.addEventListener('click', async () => {
      // lembrar preferência
      if (chkLembrar.checked) {
        localStorage.setItem(LAST_PRINT_PREF_KEY, selectedOpcaoImpressao);
      }

      // precisa ter caixa aberta
      if (caixaAtivaIndex === -1 || !caixas[caixaAtivaIndex] || caixas[caixaAtivaIndex].fechada) {
        Swal.fire("Atenção", "Nenhuma caixa aberta para fechar.", "warning");
        return;
      }

      // 🔒
      const wantsMLFromModal = (selectedOpcaoImpressao === 'ambas' || selectedOpcaoImpressao === 'ml');
      if (wantsMLFromModal && !assertCanPrintMLOrWarn()) {
        return; // mantém o modal aberto
      }

      // snapshot antes de fechar
      const caixaAtual = caixas[caixaAtivaIndex];
      ultimaCaixaSnapshot = caixaAtual;

      // fecha (seta endTime, atualiza UI, zera caixaAtivaIndex)
      fecharCaixaAtiva();

      // imprime conforme a seleção
      try {
        if (selectedOpcaoImpressao === 'ambas') {
          gerarEtiquetaCustom(ultimaCaixaSnapshot.id); // ML inbound
          gerarEtiquetaCaixa(ultimaCaixaSnapshot.id);  // JP interna
        } else if (selectedOpcaoImpressao === 'ml') {
          gerarEtiquetaCustom(ultimaCaixaSnapshot.id);
        } else if (selectedOpcaoImpressao === 'jp') {
          gerarEtiquetaCaixa(ultimaCaixaSnapshot.id);
        } // 'nenhuma' => não imprime
      } catch (e) {
        console.error('Erro ao imprimir etiqueta(s):', e);
        Swal.fire("Erro", "Falha ao imprimir etiqueta(s). Verifique a impressora.", "error");
      }

      modalFecharCaixa.hide();
      atualizarPainelEsquerdo();
    });

    // cancelar
    btnCancel.addEventListener('click', () => modalFecharCaixa.hide());
  }

  // abre o modal (se houver caixa aberta)
  function abrirModalFecharCaixa() {
    if (!modalFecharCaixa) inicializarModalFecharCaixa();
    const elModal = document.getElementById('modalFecharCaixa');
    if (!elModal) return;

    // sem caixa aberta
    if (caixaAtivaIndex === -1 || !caixas[caixaAtivaIndex] || caixas[caixaAtivaIndex].fechada) {
      Swal.fire("Atenção", "Nenhuma caixa aberta para fechar.", "warning");
      return;
    }

    // se já está aberto, não reconfigura (evita reset por re-render)
    if (elModal.classList.contains('show') || isFecharModalOpen) return;

    // aplica a seleção salva APENAS se não houver uma ativa
    const hasActive = !!elModal.querySelector('.fechar-caixa-option.active');
    if (!hasActive) {
      const saved = localStorage.getItem(LAST_PRINT_PREF_KEY) || 'ambas';
      window.__aplicarSelecaoFecharCaixa?.(saved);
      elModal.querySelector('#guardarOpcaoImpressao').checked = !!localStorage.getItem(LAST_PRINT_PREF_KEY);
    }

    modalFecharCaixa.show();
  }

  let produtos = [];
  try {
    const raw = document.getElementById("js-data").dataset.comps ?? "[]";
    produtos = JSON.parse(raw);
    if (!Array.isArray(produtos)) produtos = [];
  } catch (e) {
    console.error("JSON inválido em #js-data:", e);
    Swal.fire("Erro", "Falha ao preparar os produtos. Recarregue a página.", "error");
    return;
  }

  const placeholderImage = document.getElementById("placeholder-image").dataset.url;
  const headerBar = document.querySelector(".header-bar");
  const idAgendMl = headerBar ? headerBar.dataset.idMl : null;
  const idAgendBd = headerBar ? headerBar.dataset.idBd : null;
  const idMktp = headerBar ? headerBar.dataset.idMktp : null;
  const marketplace = { 1: "Mercado Livre", 2: "Magalu", 3: "Shopee", 4: "Amazon", 5: "Outros" }[parseInt(idMktp, 10)] || "Desconhecido";

  // === Guardas por Marketplace (ML) ===
  const isMercadoLivre = () =>
    Number.parseInt(idMktp ?? "0", 10) === 1 || /MERCADO\s*LIVRE/i.test(String(marketplace));

  const isShopee = () => parseInt(idMktp, 10) === 3;
  const isMLouShopee = () => [1, 3].includes(parseInt(idMktp, 10));

  function assertMLAllowedOrWarn() {
    if (isMercadoLivre()) return true;
    Swal.fire({
      icon: "info",
      title: "Ação indisponível",
      html: `Este agendamento é para o \"<b>${esc(marketplace)}</b>\", portanto, não é possível imprimir uma etiqueta para o Mercado Livre.<br><br>Use <b>F3</b> (etiqueta JP) ou <b>F4</b> (sem etiqueta).`
    });
    return false;
  }

  // === Nova verificação (ML + NÃO COLETA) ===
  function assertCanPrintMLOrWarn() {
    // 1) Primeiro: precisa ser Mercado Livre
    if (!assertMLAllowedOrWarn()) return false;

    // 2) Depois: bloquear COLETA
    const centro =
      String(headerBar?.dataset?.centro ?? agendamentoCompleto.centro_distribuicao ?? "")
        .trim()
        .toUpperCase();

    if (centro === "COLETA" || centro.includes("COLETA")) {
      Swal.fire({
        icon: "info",
        title: "Impressão indisponível para COLETA",
        html: `Este agendamento está marcado como <b>COLETA</b>. 
A etiqueta de <b>volume do Mercado Livre</b> não pode ser gerada automaticamente.
<br><br>Por favor, gere a etiqueta diretamente no <b>site do Mercado Livre</b>. Utilize 
<b>F3</b> (etiqueta interna) ou <b>F4</b> (sem etiqueta).`

      });
      return false;
    }
    return true;
  }

  const agendamentoCompleto = {};
  // Crie uma fila 1-shot no escopo do arquivo
  let pendingPrint = null

  document.addEventListener("printer:selected", () => {
    if (!pendingPrint) return;
    const job = pendingPrint;
    pendingPrint = null;           // evita loop/duplicidade
    setTimeout(() => imprimirEtiqueta(job.zpl, job.tipo), 0);
  });

  // Pega os dados principais dos atributos data-* do cabeçalho
  if (headerBar) {
    agendamentoCompleto.id_agend_ml = headerBar.dataset.idMl;
    agendamentoCompleto.id_bd = headerBar.dataset.idBd;
    agendamentoCompleto.empresa = headerBar.dataset.empresa;
    // LINHA NOVA: Captura o centro de distribuição
    agendamentoCompleto.centro_distribuicao = headerBar.dataset.centro;
  }

  // Pega os dados que estão como texto no cabeçalho
  const divsInfo = headerBar ? headerBar.querySelectorAll(".d-flex.flex-wrap > div") : [];
  divsInfo.forEach(div => {
    const textContent = div.textContent.trim();
    if (textContent.startsWith("Colaborador:")) {
      agendamentoCompleto.colaborador = textContent.replace("Colaborador:", "").trim();
    } else if (textContent.startsWith("Data:")) {
      agendamentoCompleto.data = textContent.replace("Data:", "").trim();
    } else if (textContent.startsWith("Hora:")) {
      agendamentoCompleto.hora = textContent.replace("Hora:", "").trim();
    }
  });

  // Adiciona a lista de produtos (que já inclui as composições)
  agendamentoCompleto.produtos = produtos;

  // Finalmente, exibe o objeto completo no console
  console.log("Dados do Agendamento (reconstruídos pelo JS):", agendamentoCompleto);

  const empresa = parseInt(headerBar?.dataset?.empresa ?? "0", 10) || 0;
  const sellerIdMap = {
    1: '539172427',   // Jaú Pesca
    2: '1111253828',  // Jaú Fishing
    3: '491881969'    // L.T. Sports
  };
  const sellerId = sellerIdMap[empresa] || '';

  // Variáveis de estado para as caixas
  let caixas = [];
  let caixaAtivaIndex = -1;
  let caixaStartTime = null;

  // Outra função que também será descontinuada
  // Utilize sempre a função imprimirEtiqueta(zpl, tipo) (UNIVERSAL)
  function imprimirNaImpressoraDeRede(zpl) {
    BrowserPrint.getLocalDevices(
      devices => {
        // Termo de busca alterado para apenas deskjp12
        // const termos = ['deskjp12', '192.168.15.152'];
        // Não deu certo, vamos procurar pelo nome da impressora
        // const hostComputador  = 'deskjp12';
        const nomeExatoDaImpressora = 'Impressora Etiqueta Conferencia01 em deskjp12'.toLowerCase();

        console.log("Procurando pela impressora com nome exato:", nomeExatoDaImpressora);
        console.log('Devices encontrados ->', devices);
        const printer = devices.find(d => {
          // Condição 1: A impressora deve ser gerenciada por um driver no pc do usuário
          // const isDriver = d.connection === 'driver';

          // Condição 2: O nome do computador host ('deskjp12') deve estar no nome ou UID da impressora.
          // O UID de impressoras de driver compartilhadas costuma ser algo como:
          // "\\deskjp12\ZebraPrinter" ou "Zebra (Cópia 1) em deskjp12"
          // const hasHostName = d.uid.toLowerCase().includes(hostComputador);
          // termos.some(t => d.uid.toLowerCase().includes(t))
          // return isDriver && hasHostName;
          return d.name.toLowerCase() === nomeExatoDaImpressora;
        });
        if (!printer) {
          console.error("❌ Impressora compartilhada não encontrada.");
          console.log("Verifique se a impressora compartilhada a partir de 'deskjp12' está instalada neste computador e online.");
          return;
        }
        console.log("✅ Impressora compartilhada encontrada:", printer);
        printer.send(
          zpl,
          () => console.log("✅ Enviado via driver Windows!"),
          err => console.error("❌ Erro ao imprimir via driver:", err)
        );
      },
      err => console.error("❌ Erro ao listar dispositivos:", err),
      "printer"
    );
  }

  // Essa função será removida
  // Será usada uma outra função universal que utilizará a impressora salva no localStorage
  function printViaBrowserPrint(zpl) { // Para gerar as etiquetas dos produtos (Mercado Livre Full)
    BrowserPrint.getDefaultDevice("printer", function (printer) {
      printer.send(zpl,
        () => console.log("enviado!"),
        err => console.error("erro printer:", err)
      );
    }, err => console.error("nenhuma impressora:", err));
  }

  // Função universal para a impressão de etiquetas
  function imprimirEtiqueta(zpl, tipo) {
    const keyMap = { relatorio: 'printer_relatorio', caixa: 'printer_caixa', id: 'printer_id' };
    const key = keyMap[tipo]; if (!key) return console.error("Tipo inválido:", tipo);

    const saved = localStorage.getItem(key);
    if (!saved) {
      if (!pendingPrint) pendingPrint = { zpl, tipo };
      window.openPrinterModalByTipo?.(tipo);
      return;
    }
    if (!window.BrowserPrint || typeof BrowserPrint.getLocalDevices !== "function") {
      Swal.fire("Impressão indisponível",
        "Zebra BrowserPrint não está disponível. Abra/instale para continuar.",
        "error");
      return;
    }

    BrowserPrint.getLocalDevices(
      (devices) => {
        const dev = devices.find(d => d.uid === saved || d.name === saved);
        if (!dev) {
          console.error("Impressora salva não encontrada:", saved);
          if (!pendingPrint) pendingPrint = { zpl, tipo };
          if (typeof window.openPrinterModalByTipo === "function") window.openPrinterModalByTipo(tipo);
          return;
        }
        dev.send(zpl,
          () => console.log("✅ Enviado para:", dev.name || dev.uid),
          err => console.error("❌ Erro ao imprimir:", err)
        );
      },
      err => console.error("❌ Erro ao listar impressoras:", err),
      "printer"
    );
  }
  // Fim da função universal de impressão


  if (!idAgendMl) {
    console.error("Não foi possível encontrar o ID do Agendamento (id_agend_ml) no HTML.");
    Swal.fire("Erro Crítico", "Não foi possível identificar o agendamento. A página não funcionará corretamente.", "error");
    return;
  }

  // 2) Instâncias dos modais (Bootstrap 5)
  const modalSelecione = new bootstrap.Modal(document.getElementById("modalSelecioneAnuncio"));
  const modalConfirme = new bootstrap.Modal(document.getElementById("modalConfirmeAnuncio"));

  // 3) Elementos da UI
  const inputSku = document.getElementById("input-embalar");
  const bodySelecione = document.getElementById("modalSelecioneAnuncioBody");
  const bodyConfirme = document.getElementById("modalConfirmeAnuncioBody");
  const btnConfirmar = document.getElementById("btnConfirmarAnuncio");
  const caixasContainer = document.getElementById("caixas-container");
  // NOVO: Container dos botões e caixas
  const caixaActionsContainer = document.getElementById("caixa-actions-container");
  const contadorFinalizadosEl = document.getElementById("finalizadosP");
  const listaPrincipalEl = document.getElementById("lista-anuncios");
  const templateNovaCaixa = document.getElementById("template-nova-caixa");
  // NOVO: Template do botão finalizar
  const templateFinalizar = document.getElementById("template-finalizar-embalagem");

  async function carregarCaixasSalvas() {
    try {
      const caixasData = await fetchJSON(`/api/embalar/caixa/${idAgendMl}`);
      caixasData.forEach(box => {
        const num = box.caixa_num;
        const totalItens = box.itens.reduce((s, i) => s + Number(i.quantidade || 0), 0);

        const idx = caixas.length;
        caixas.push({
          id: num,
          codigo: box.codigo_unico_caixa || null,
          itens: box.itens.reduce((acc, i) => ({ ...acc, [i.sku]: Number(i.quantidade || 0) }), {}),
          fechada: true,
          persisted: true,
          element: null
        });

        const caixaDiv = document.createElement("div");
        caixaDiv.className = "card caixa-card caixa-fechada";
        caixaDiv.innerHTML = `
        <div class="card-header">Caixa ${esc(num)} - (${totalItens} ${totalItens > 1 ? 'itens' : 'item'})</div>
        <div class="card-body">
          <ul class="list-unstyled mb-0"></ul>
        </div>`;
        caixas[idx].element = caixaDiv;
        caixasContainer.prepend(caixaDiv);

        const ul = caixaDiv.querySelector("ul");
        box.itens.forEach(i => {
          const li = document.createElement("li");
          li.className = "d-flex justify-content-between p-1";
          li.innerHTML = `<span>${esc(i.sku)}</span><span class="fw-bold">Unidades: ${esc(i.quantidade)}</span>`;
          ul.appendChild(li);
        });
      });
      caixaAtivaIndex = -1;
      verificarModoEtiqueta();
    } catch (error) {
      console.error("Erro ao carregar caixas salvas:", error);
    }
  }

  function atualizarPainelEsquerdo() {
    const totalProdutos = produtos.length;
    const produtosConcluidos = listaPrincipalEl.querySelectorAll(".produto-concluido").length;
    const existeCaixaAberta = caixaAtivaIndex !== -1 && !caixas[caixaAtivaIndex].fechada;

    const btnNovaCaixa = document.getElementById('btn-nova-caixa');
    const btnFinalizar = document.getElementById('btn-finalizar-embalagem');
    if (btnNovaCaixa) btnNovaCaixa.remove();
    if (btnFinalizar) btnFinalizar.remove();

    if (totalProdutos === produtosConcluidos && totalProdutos > 0) {
      // Agora abre o modal (se houver caixa aberta) e não reabre se já estiver aberto
      if (existeCaixaAberta) {
        if (!isFecharModalOpen) abrirModalFecharCaixa();
        return;
      }
      // Se não há caixa aberta, mostra o botão "Finalizar Embalagem"
      const clone = templateFinalizar.content.cloneNode(true);
      const botaoFinalizar = clone.querySelector('#btn-finalizar-embalagem');
      botaoFinalizar.addEventListener('click', handleFinalizarEmbalagem);
      caixaActionsContainer.prepend(clone);
    } else {
      const algumProdutoProntoParaEmbalar = produtos.some(p => p.bipados !== undefined);
      if (algumProdutoProntoParaEmbalar && !existeCaixaAberta) {
        const clone = templateNovaCaixa.content.cloneNode(true);
        caixaActionsContainer.prepend(clone);
        document.getElementById('btn-nova-caixa').addEventListener('click', abrirNovaCaixa);
      }
    }
  }

  function abrirModalConfirmacao(prod) {
    if (!prod) {
      console.error("Tentativa de abrir modal de confirmação sem um produto válido.");
      return;
    }

    bodyConfirme.dataset.skuConferindo = prod.sku;
    bodyConfirme.dataset.idMlConferindo = prod.id_ml;

    const imgUrl = prod.imagemUrl || placeholderImage;
    let lisHtml;

    if (prod.composicoes && prod.composicoes.length > 0) {
      lisHtml = prod.composicoes.map((c) => {
        const requerido = c.unidades_por_kit || c.unidades_totais || 1;
        const img = c.imagemUrl || prod.imagemUrl || "";
        return `
      <li class="componente-item status-pendente"
          data-sku-esperado="${c.sku}"
          data-gtin-esperado="${c.gtin}"
          data-id-tiny-esperado="${c.id_tiny || ''}"
          data-nome-esperado="${esc(c.nome)}"
          data-img="${img}"
          data-requerido="${requerido}" data-bipado="0">
        <span class="componente-nome">${c.nome}</span>
        <span class="componente-status">
          <i class="bi bi-info-circle info-componente" tabindex="0" aria-label="Detalhes do componente"></i>
          <span class="contador-bipagem">(0/${requerido})</span>
        </span>
      </li>`;
      }).join("");
    } else {
      const requerido = 1;
      const img = prod.imagemUrl || "";
      lisHtml = `
    <li class="componente-item status-pendente"
        data-sku-esperado="${prod.sku}"
        data-gtin-esperado="${prod.gtin}"
        data-id-tiny-esperado="${prod.id_tiny || ''}"
        data-nome-esperado="${esc(prod.nome)}"
        data-img="${img}"
        data-requerido="${requerido}" data-bipado="0">
      <span class="componente-nome">${prod.nome}</span>
      <span class="componente-status">
        <i class="bi bi-info-circle info-componente" tabindex="0" aria-label="Detalhes do componente"></i>
        <span class="contador-bipagem">(0/${requerido})</span>
      </span>
    </li>`;
    }


    bodyConfirme.innerHTML = `
        <div class="modal-main-layout">
            <div class="modal-image-container"><img src="${imgUrl}" alt="${prod.nome}"></div>
            <div class="modal-list-container"><ul class="lista-componentes">${lisHtml}</ul></div>
        </div>
        <div class="modal-footer-input">
            <input type="text" id="sku-confirmacao-unico" class="form-control" placeholder="Bipar SKU do componente aqui...">
        </div>`;

    inicializarPopoversDeComponentes();
    modalSelecione.hide();
    modalConfirme.show();
    setTimeout(() => { document.getElementById("sku-confirmacao-unico")?.focus(); }, 500);
  }

  function inicializarPopoversDeComponentes() {
    if (!window.bootstrap?.Popover) return;

    const icons = document.querySelectorAll("#modalConfirmeAnuncio .info-componente");
    icons.forEach((icon) => {
      const li = icon.closest(".componente-item");
      if (!li) return;

      bootstrap.Popover.getInstance(icon)?.dispose();

      const d = {
        nome: li.dataset.nomeEsperado,
        sku: li.dataset.skuEsperado,
        gtin: li.dataset.gtinEsperado,
        id_tiny: li.dataset.idTinyEsperado,
        id_ml: bodyConfirme?.dataset?.idMlConferindo || "", // etiqueta do anúncio
        unidades: li.dataset.requerido,
        imagemUrl: li.dataset.img
      };

      new bootstrap.Popover(icon, {
        html: true,
        trigger: "hover focus",
        placement: "left",
        container: "body",
        customClass: "product-popover popover-wide",
        content: buildInfoHTML(d)
      });
    });
  }

  // ===================================================================
  // LÓGICA DE GERENCIAMENTO DAS CAIXAS
  // ===================================================================

  function verificarModoEtiqueta() {
    const algumProdutoProntoParaEmbalar = produtos.some(p => p.bipados !== undefined);
    const existeCaixaAberta = caixaAtivaIndex !== -1 && !caixas[caixaAtivaIndex].fechada;
    const btnNovaCaixa = document.getElementById('btn-nova-caixa');

    if (algumProdutoProntoParaEmbalar && !existeCaixaAberta && !btnNovaCaixa) {
      const clone = templateNovaCaixa.content.cloneNode(true);
      caixaActionsContainer.prepend(clone);
      document.getElementById('btn-nova-caixa').addEventListener('click', abrirNovaCaixa);
    } else if ((!algumProdutoProntoParaEmbalar || existeCaixaAberta) && btnNovaCaixa) {
      btnNovaCaixa.remove();
    }
  }

  async function abrirNovaCaixa() {
    // índice da nova caixa
    caixaAtivaIndex = caixas.length;
    document.getElementById('input-embalar').focus(); // Move o foco para o input, assim o usuário não precisa clicar para bipar uma caixa

    // objeto base
    const caixaObj = {
      id: null,
      codigo: null,        // <- vamos guardar o codigo_unico_caixa
      itens: {},
      fechada: false,
      persisted: false,
      element: null,
    };
    caixaObj.startTime = new Date();
    caixas.push(caixaObj);

    // cria visual no DOM
    const numeroTemporario = caixas.length;
    const caixaDiv = document.createElement('div');
    caixaDiv.className = 'card caixa-card caixa-aberta';
    caixaDiv.innerHTML = `
    <div class="card-header">Caixa ${numeroTemporario}</div>
    <div class="card-body"><ul class="list-unstyled mb-0"></ul></div>`;
    caixaObj.element = caixaDiv;
    caixasContainer.prepend(caixaDiv);

    // cria imediatamente no servidor (evita “abrir sem id”)
    try {
      const { caixa_num, codigo_unico_caixa } = await fetchJSON('/api/embalar/caixa', {
        method: 'POST',
        body: { id_agend_ml: idAgendMl }
      });
      caixaObj.id = caixa_num;
      caixaObj.codigo = codigo_unico_caixa;
      caixaObj.persisted = true;
      caixaDiv.querySelector('.card-header').textContent = `Caixa ${caixaObj.id}`;
    } catch (err) {
      console.error(err);
      Swal.fire("Erro", "Não foi possível criar a caixa no servidor.", "error");
      // volta estado
      caixas.pop();
      caixaAtivaIndex = -1;
      caixaDiv.remove();
      return;
    }

    atualizarPainelEsquerdo();
  }

  function gerarEtiquetaCustom(nCaixa) {
    // Bloqueia etiqueta ML se não for ML OU se for COLETA
    if (!assertCanPrintMLOrWarn()) return;

    const idAgendamento = idAgendMl;
    const numeroCaixa = nCaixa;

    // Busca o centro de distribuição
    const centroRaw = agendamentoCompleto.centro_distribuicao;
    const centro = String(centroRaw || '').toUpperCase();
    const centroKey = (centro === 'BRSP06') ? 'SP06' : centro; // normaliza

    // Configuração por centro
    const centerConfig = {
      BRSP11: {
        text: '(Endere_C3_A7o correto: Rua Concretex_2C 800 Galp_C3_A3o H_2C Cumbica_2C Guarulhos)_2C Centro log_C3_ADstico Guarulhos - BRSP11',
        y: 965
      },
      BRRC02: {
        text: 'Centro log_C3_ADstico Sumar_C3_A9 - BRRC02',
        y: 970
      },
      BRRC01: {
        text: 'Centro log_C3_ADstico Perus - BRRC01',
        y: 970
      },
      BRSP10: {
        text: 'Centro log_C3_ADstico SP10 - BRSP10',
        y: 970
      },
      SP06: {
        text: 'Centro log_C3_ADstico Ara_C3_A7ariguama - BRSP06',
        y: 970
      }
    };
    const cfg = centerConfig[centroKey] || {
      text: `Centro log_C3_ADstico ${centro}`,
      y: 970
    };

    // Monta o JSON interno do QR
    const qrPayload = {
      id: `${idAgendamento}/${numeroCaixa}`,
      reference_id: `${idAgendamento}/${numeroCaixa}`,
      t: "inb",
      ops_data: {
        source: "seller",
        container_type: "box"
      }
    };

    // Toda a lista de linhas ZPL, incluindo as duas dinâmicas para o centro
    const zpl = [
      '^XA',
      '^MCY',
      '^CI28',
      '^LH5,15',
      '^FX  HEADER  ^FS',
      '^FX Logo_Meli ^FS',
      '^FO20,10^GFA,800,800,10,,:::::::::::O0FF,M07JFE,L07FC003FE,K07EL07E,J01EN078,J07P0E,I01CP038,I07R0E,001CK01FK038,003L0IFK0C,0078J03803CJ0E,0187J06I07I01D8,0300F00F8J0FEFE0C,02003IFK01J06,04I01C6P02,08K0401FM01,1L08060CM083K0100C02M0C2M01001M046K0306I0CL064K0198I02L024Q01L02CR08K03CR04K03FR02K03FFQ01J07!C1FQ0C007E3C03EP0203F03C0078O010F003CI0EF1N0F8003CI070C4M06I03CI02003CL02I03CI02P02I036I03N0106I066I01J08J0C4I067J0EI08J078I0E38I03I0E00406I01C3CI01800100204I01C3CJ0FI080118I03C1EJ03800801FJ0780FK0C008018J0F,078J07C0823J01F,07EJ01C1C36J07E,03FK031C3K0FC,01FCJ01E18J01F8,00FER07F,007F8P01FE,003FFP0FFC,I0FFEN07FF,I03FFCL03FFC,J0IFCJ03IF,J07PFE,K0PF,K01NF8,L01LF8,N0JF,,:::::::::::^FS',
      `^FO120,30^A0N,24,24^FH^FD#${sellerId}^FS`,
      `^FO560,20^GFA,1584,1584,24,,:::::::::::::L03IFC,L07IFC,:L07IF8,L0JF8,L0JF,K01JFM0JFE007C001FI0FK07C,K01JFM0JFE007C001F001FK07C,K03IFEM0JFE007C001F001FK078,K03IFCM0JFE0078001E001FK0F8,K03IFCL01F8K0F8003E001EK0F8,K07IF8L01FL0F8003E003EK0F8,:K07IF8L01EL0F8003E003EK0F,K0JFM01EL0FI03C003EK0F,K0JFM03EK01FI03C007EJ01F,K0JFM03EK01FI07C007CJ01F,K0MFJ03EK01FI07C007CJ01F,J01MFJ03IFE001FI07C007CJ01E,J01LFEJ03IFE001EI07800FCJ01E,J03LFCJ07IFE003EI0F800FCJ03E,J03LF8J07IFE003EI0F800F8J03E,J03LFK07CK03EI0F800F8J03E,J07KFEK0FCK07E001F800F8J03E,J07KFCK0F8K07E001F001FK07C,M01FFCK0F8K07E001F001FK07C,N0FF8K0F8K07E001F001FK07C,N0FFL0F8K07E003E001FK07C,M01FEK01F8K07E007E001FK0FC,M01FCK01FL03F80FC001F8J0FC,M01F8K01FL01JF8003JF80JFE,M03FL01FM0JFI03JF80JFE,M03FL01EM07FFEI03JF00JFC,M03EV0FF,M07C,M078,M07,M0E,:M0C,L018,L01,,:::::::::^FS`,
      `^FO120,60^A0N,24,24^FH^FB550,2,0,L^FDEnvio: ${idAgendamento}/${numeroCaixa}^FS`,
      `^FO300,150^GB500,45,3^FS`,
      `^FO325,163^A0N,27,27^FB460,1,0,C^FR^FH^FDENTREGAR NA FULL^FS`,
      `^FO325,210^A0N,27,27^FB460,1,0,C^FR^FH^FDN_c3_83O V_c3_81LIDA PARA COLETA^FS`,
      `^FO400,235^GB127,0,2^FS`,
      `^FX  QR Code  ^FS`,
      `^FO280,320^BY2,2,1^BQN,2,6^FDLA,${JSON.stringify(qrPayload)}^FS`,
      `^FO0,590^A0N,35,35^FB800,1,0,C^FD${idAgendamento}/${numeroCaixa}^FS`,
      // ← Linhas dinâmicas por centro:
      `^FO0,670^A0N,150,150^FB810,1,0,C^FD${centro}^FS`,
      `^FO30,${cfg.y}^A0N,30,30^FB550,3,5,L^FH^FD${cfg.text}^FS`,
      '^FX  END CUSTOM_DATA  ^FS',
      '^FO0,900^GB800,0,2^FS',
      '^FO30,930^A0N,30,30^FB551,2,0,L^FH^FDVOLUMES^FS',// Exemplo estático se precisar como fallback
      `^FO30,1070^A0N,30,30^FH^FDEnvio: ${idAgendamento}/${numeroCaixa}^FS`,
      '^FX  END_FOOTER  ^FS',
      '^XZ'
    ].join('\n');

    console.log(zpl);
    imprimirEtiqueta(zpl, 'caixa');
  }



  window.addEventListener('keydown', (e) => {
    if (!['F1', 'F2', 'F3', 'F4', 'Enter'].includes(e.key)) return;

    const elModal = document.getElementById('modalFecharCaixa');
    const modalAberto = !!(elModal && elModal.classList.contains('show'));

    // Se o modal de fechar caixa está ABERTO:
    if (modalAberto) {
      if (FKEY_TO_OPT[e.key]) {
        e.preventDefault();
        window.__aplicarSelecaoFecharCaixa?.(FKEY_TO_OPT[e.key]); // seleciona opção
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        elModal.querySelector('#btnConfirmarFechamento')?.click(); // Enter confirma
        return;
      }
    }

    // Se QUALQUER outro modal Bootstrap estiver aberto, ignora atalhos
    if (document.body.classList.contains('modal-open')) return;

    // ===== Fluxo rápido fora do modal: F1–F4 fecham a caixa ativa e imprimem =====
    if (!['F1', 'F2', 'F3', 'F4'].includes(e.key)) return;
    e.preventDefault();

    const idx = caixaAtivaIndex;
    const caixa = caixas[idx];
    if (!caixa || caixa.fechada) {
      Swal.fire("Atenção", "Nenhuma caixa aberta para fechar.", "warning");
      return;
    }

    // 🔒 Bloqueio: se NÃO for ML e usuário tentou F1 ou F2, impedir
    const wantsML = (e.key === 'F1' || e.key === 'F2');
    if (wantsML && !assertCanPrintMLOrWarn()) {
      return; // não fecha a caixa, não imprime
    }

    // 1) fecha a caixa (sem imprimir)
    fecharCaixaAtiva();

    // 2) imprime conforme a tecla
    if (e.key === 'F1') {
      gerarEtiquetaCustom(caixa.id);    // ML + JP
      gerarEtiquetaCaixa(caixa.id);
    } else if (e.key === 'F2') {    // só ML
      gerarEtiquetaCustom(caixa.id);
    } else if (e.key === 'F3') {    // só JP
      gerarEtiquetaCaixa(caixa.id);
    } else if (e.key === 'F4') {
      // nenhuma
    }

    // 3) atualiza UI
    atualizarPainelEsquerdo();
  });

  function gerarEtiquetaCaixa(caixaRef) {
    // Permite receber SÓ o número (preferido) ou ainda o objeto (retrocompatível)
    // - número: procura por id exato; se não achar, tenta como índice 1-based (id = posição)
    // - objeto: usa direto
    let cx = null;
    if (typeof caixaRef === 'number' || typeof caixaRef === 'string') {
      const idNum = Number(caixaRef);
      cx = (Array.isArray(caixas) ? (caixas.find(c => Number(c.id) === idNum) || caixas[idNum - 1]) : null) || null;
    } else if (caixaRef && typeof caixaRef === 'object') {
      cx = caixaRef;
    }

    if (!cx) {
      console.error('Caixa não encontrada para referência:', caixaRef);
      Swal.fire('Erro', `Caixa ${caixaRef} não encontrada.`, 'error');
      return;
    }

    const headerBar = document.querySelector('.header-bar');
    const freteId = headerBar?.dataset?.idMl || '';

    // Garante datas válidas
    const start = cx.startTime ? new Date(cx.startTime) : new Date();
    const end = cx.endTime ? new Date(cx.endTime) : new Date();
    const dataStr = start.toLocaleDateString('pt-BR');
    const horaIni = start.toLocaleTimeString('pt-BR', { hour12: false });
    const horaFim = end.toLocaleTimeString('pt-BR', { hour12: false });

    const logoJauPesca = '^FO250,120^GFA,4440,4440,37,,:::hP03C,hP01FC,hQ0FF8,hQ03FF,hQ01FFE,hR0IFC,hR07IF,hR03IFC,hR01JF,hR01JFC,hS0KF,hS07JF8,hS07JFE,hS03KF,hS03KFC,hS03KFE,hS01LF,hI03JFK01LF8,hH07LF8I01LFC,hG03NFI01LFE,h01OFE001MF,h07PFC01MF8,gY01RF01MFC,gY03RFE0MFE,gY0TF81LFE,gX01UF07LF,gX03UFE0LF8,gX07VF83KF8,18gV0XF0KFC,0EgU01XFC3JFC,07gU01YF0JFE,038gT03YFE3IFE,03EgT07gF87IF,01FgT0gGFE1IF,00FCP0FFCY01gHF87FF,00FEO0JFCX01gIF3FF8,007F8M03KF8W03gIFCFF8,007FCM07KFEW07gJF3F8,003FFM0MF8V07QF00QFCF8,001FF8K01MFCV0QFE001QF38,001FFEK03NFU01QFCI03PFC8,I0IFK07NF8T01QF8J07PF,I0IFCJ0OFCT03QFK01PFC,I07FFEJ0OFCT07QFL03PF,I07IF8001OFET07PFEM07OFC,I03IFC003OFET0QFCM01PF,I03IFE003PFS01QF8N03OFC,I01JF807PFS01QF8O0OFE,I01JFC0QFS03QFP01OF8,I01JF80QFS07QFQ03NFE,J0JF81QFS07PFER0OF,J0JF03QFS0QFCR03NFC,J0JF03QFR01QFCS0OF,J07FFE07PFER01QF8S07NF8,J07FFE07PFCR03QFT03NFC,J07FFC0QFCR07QFT01JFC0IF,J07FFC0QF8R0QFET01JF803FF8,J07FFC1QFS0QFCT01JF003FFC,J03FF81QFR01QF8T01JF001FFE,J03FF81PFER03QF8T03JF001IF,J03FF81PFCR03QFU07JF001IF8,J03FF83PFCR07PFEU07JF001IFC,J03FF83PF8R0QFEU0KF001IFE,J03FF03PFS0QFCT01KF803JF,J03FF03PFR01QF8I01EO01KF803JF,J03FF03OFER03QF8001IFN03KFE0KF8,J03FF03OFCR03QFI07IFEM07RF8,J03FF03OFCR07PFEI0KFCL07RF8,J03FF01OF8R0QFE001LFL0SFC,J03FF81OF8R0QFC003LFEJ01SF8,J03FF81OFR01QF8003MFCI03SF8,J07FF80OFR03QF8003NFI0TF,J07FF80OFR03QFI03OF9TFE,J07FFC0OF8Q07PFEI03gJFC,J07FFC07NF8Q0QFEI03gJF,J07FFE03NFCQ0QFCI01gIFC,J0IFE03NFCP01QF8J0gIF,J0JF01NFEP03QF8J07gGFC,J0JF80OF8O03QFK03gGF,I01JF807NFEO07PFEK01gF8,I01JFC03OFCN0QFCL07XFC,I01JFC01PFM01QFCL01WFC,I03JFI0PFEL01QF8M03UFC,I03IFCI07PFCK03QFO07SFC,I03IF8I03QFK07QFP03QF,I07FFEJ01QFEJ0QFEQ01NF8,I07FF8K07QFC001QFCN03EJ01FF,I0FFEL03RF81RFCN07FFE,I0FFCM0gLF8N07JFE,001FFN03gKFO0LF8,001FCO07gJFN01LF,003FP01gIFEN03KFC,003EQ03gHFCN07KF,0078R07gGFCM01KFC,006S01gGF8M03JFE,008T03gFN0KF8,X0gFM07JFC,X01XFEL07JFC,Y03WFCK07JF,g0WF8,g01VF,gG03TFE,gH0TFC,gH01SF,gI03QFE,gJ0QF8,gJ01OFE,gK03NF,gL07LF8,gM01JF,,:::::^FS';
    const logoMercadoLivre = '^FO350,356^GFA,1800,1800,15,,::::::::::::::::::::::::::R03JFE,Q0NF,P07FFC001IF,O03FEL03FE,N01FEN03FC,N07EP07F,M01FR0FC,M07CR03F,L01FT0F8,L07CL01F8K03E,L0FL01IF8K0F,K01EL07JFK07C,K03F8J01F800FCJ0FE,K0F7F8I0FCI01FC00FF7,J01C0FF80FF8J07JF838,J01801KFL0IFC01C,J03I01FFDCR0E,J07L01801FCN06,J0EL03007FEN07,J0CL0700E07N038,I018L0E03C01CM018,I038K01C07I0EM01C,I03L0180EI07N0C,I03L01E3CI038M0E,I06M0FFJ01EM06,I06N08K07M06,I06T038L06,I0ET01CL0F,I0FET0EK07F,I0FFES07J07FF,I0EFFCR01C003FE7,I0E07F8R0E01FE07,I0E00FER0707F007,I0E001F87N04039F8007,I0EI03FFDFL0601FCI07,I0EJ0F8FF8K0300FJ07,I0EJ07061F8J01807J07,I0FJ07I0FEK0C03J0F,I07J07I0C7K0703J0E,I07J03J03K0387I01E,I078I0388001I0C01FEI01E,I078I01F8001800600FCI03C,I03CJ0F8001E00380FJ03C,I03EJ01C003F801C1CJ07C,I01EK0E2001880E3CJ0F8,I01FK0FEI0CC07F8I01F8,J0F8J03FI0C607FJ03F,J0FCK07980C3078J07F,J07EK03F80C18EK0FE,J03F8K0FC0C1FEJ01FC,J03FCL0E3IF8J03F8,J01FEL07IF8K0FF,K0FF8K03E1EK01FF,K07FET07FC,K03FF8R01FF8,L0FFER0IF,L07FFCP03FFE,L03IF8N01IF8,M0JF8L01JF,M03JFCJ07JFC,N0TF,N03RFC,O0QFE,O01PF,P01NF,R0KFE,,::::::::::::::::::::::::::^FS';
    const objEmpresaLogo = {
      // Jaú Pesca
      1: '^FO100,30^GFA,8856,8856,82,,::::::::::hN0AA,hM03FF8,hM07FF,hM0FFE,hM0FFC,hL01FF8,hL01FF,hL03FC,hL03F8,hL03F,,:::S0MF801QFCJ07IFM0IFEQ07QFCL0PFL07QFJ01QF007QF,R01MF803RF8I0JF8K01JFQ0SFK07PFCJ03RFJ0RF80RFE,R03MF803RFC001JF8K03JFP01SFCI01RFJ0SFI03RF80SF,R03MF807RFE001JFL03JFP01SFEI07RF8001SFI07RF80SF8,R03MF807SF001JFL03IFEP01TFI0SFC003SFI0SF01SFC,R07MF807SF003JFL03IFEP03TF001SFC007SF001SF01SFE,R07MF007SF803JFL07IFEP03TF803SFC00SFE003SF01SFE,R07MF00TF803IFEL07IFEP03TF807SFE01SFE007SF01SFE,R07MF00TF803IFEL07IFCP03TF807SFE03SFE00SFE03SFE,R0NF00TF807IFEL07IFCP03TF80TFE03SFE00SFE03TF,R07LFE00TF807IFEL0JFCP07TF80TFE07SFC01SFC03TF,R07LFE00TF807IFCL0JFCP07TF81TFE07SF801SFC01TF,V0IFEQ03JF807IFCL0JF8P07IFL03JF81IFCL0JFE0IFER03IF8gG07IFE,U03IFEQ01JF80JFCL0JF8P07IF8K01JF83IFEL07IFE0JFR03IFCgG07IFE,U07IFCQ01JF80JFCK01JF8P0JF8K01JF83IFEL07IFE0JF8Q03IFEgG03IFE,U07IFCQ01JF80JF8K01JF8P0JF8K01JF83IFEL07IFC0JF8Q07IFEgG03IFE,U0JFCQ01JF00JF8K01JFQ0JF8K01JF03IFEL07IFC1JF8Q07IFEgG07IFE,U0JFCQ01JF01JF8K01JFQ0JF8K01JF07IFEL0JFC1JFR07IFCgG07IFE,U0JF8Q03JF01JF8K03JFP01JF8K03JF07IFEL0JFC1JFR07IFCgG07IFC,U0JF8Q03JF01JFL03JFP01JFL03JF07IFCL0JF81JFR0JFCgG07IFC,T01JF8Q03IFE01JFL03IFEP01JFL03IFE07IFCL0JF81JFR0JFCgG0JFC,T01JF8Q03IFE03JFL03IFEP01JFL03IFE0JFCK01JF81JFR0JF8gG0JFC,T01JFR07IFE03JFL07IFEP03JFL07IFE0JFCK03JF80JFR0JF8gG0JF8,T01JF00TFE03IFEL07IFEP03JFL07IFE0UF00RF8001JF8P03TF8,T03JF03TFC03IFEL07IFCP03JFL0JFC0UF007RF001JF8P07TF8,T03JF03TFC07IFEL07IFCP03JF8J03JFC1UF003RF801JFQ0UF8,T03IFE07TFC07IFEL0JFCP07TFC1UF001RFC01JFQ0UF,T03IFE07TFC07IFCL0JFCP07TF81TFEI07QFE03JFQ0UF,J07FF8L07IFE07IFL03JFC07IFCL0JF8P07TF81JF8gH07FFE03JFP01IFCL0KF,I01IFEL07IFE07IFL01JF80JFCL0JF8P07TF03JFgI07FFE03IFEP01IFEL07JF,I03IFEL07IFC0JF8K01JF80JFCK01JF8P0TFE03JFgH01IFE03IFEP01JFL03IFE,I03IFEL07IFC0JFCK01JF80JF8K01JF8P0TFC03IFEgH01IFE07IFEP01JFL03IFE,I07IFEL0JFC0JF8K01JF80JF8K01JFQ0TF803IFEgH03IFE07IFEP03JFL07IFE,I07IFCL0JFC0JF8K01JF01JF8K01JFQ0TF007IFEgH03IFE07IFCP03IFEL07IFE,I07IFCL0JF81JF8K01JF01JF8K03JFP01SFE007IFEgH03IFE07IFCP03IFEL07IFC,I07IFCL0JF81JF8K03JF01JFL03JFP01SF8007IFCgH03IFE0JFCP03IFEL07IFC,I0JFCK01JF81JFL03JF01JFL03IFEP01RFEI07IFCgH07IFE0JFCP07IFEL0JFC,I0JFCK01JF01JF8K07IFE01JFL07IFEP01QFEJ07IF8gH07IFE0JFCP07IFEL0JFC,I0JFCK03JF03JF8K0JFE03JF8K0JFEP03JFR0IFEgI0JFC0JFCP07JFK01JF8,I0UF03TFE03TFEP03IFER0TF001TFC0SFC07TF8,I0TFE03TFE03TFCP03IFER0TF803TFC0SFE0UF8,I0TFE03TFC03TFCP03IFER0TF807TF80SFE0UF8,I0TFC07TFC03TFCP07IFER0TF807TF80SFE0UF,I0TFC07TFC01TFCP07IFCR07SF807TF00SFE0UF,I0TF807TFC01TF8P07IFCR07SF00TFE00SFC1UF,I07SF007TF801TF8P07IFCR07SF00TFC007RFC1UF,I07RFE00UF800TF8P0JFCR03SF00TF8007RFC1TFE,I03RFC00UF800TF8P0JFCR03SF00TFI03RFC1TFE,I01RFI0PF1JF8007NF1JFQ0JF8R01RFE01SFEI01RF83OFC7IFE,J0QFCI0OF81JFI01MF81JFQ0JF8S07QFE01SF8J0RF83NFE07IFC,J01OFEJ07MFC00IFEJ07KFC01IFEQ0JFT01QFC00RFCK01QF01NF803IF8,,:::::::::::::::::::::::::::::::^FS',

      // Jaú Fishing
      2: '^FO83,30^GFA,8856,8856,82,,::::::::::hM01FFhU01IF8,hM03FF8hT03IFC,hM07FFhU07IFC,hM0FFEhU07IFC,hM0FF8hU0JFC,hL01FFhV0JFC,hL01FEhV0JF8,hL03FChV0JF8,hL03F8hU01JF8,hL03EhV01JF8,kJ01JF,:kJ03JF,:R01MF801QFEJ0JFM0IFEP01UF80JFJ0RF003RF8I03IFC00IFE00LFCK01RFC,R01MF803RF8001JF8K01JFP01UFC1JFI03RF003RFEI03IFE01JF07MFK07RFC,R03MF807RFC001JF8K03JFP03UFC1JFI0SF007SF8007IFE03JF1NF8I01SFC,R03MF807RFE001JFL03IFEP03UF81JF001SF007SFC007IFC03SFCI07SFC,R03MF807SF001JFL03IFEP03UF83JF003SF007SFC007IFC03SFEI0TF8,R07MF007SF003JFL03IFEP07UF83JF007SF007SFE00JFC07SFE001TF8,R07MF00TF803JFL07IFEP07UF83IFE00SFE00TFE00JFC07TF003TF8,R07MF00TF803IFEL07IFCP07UF03IFE01SFE00TFE00JF807TF007TF8,R07MF00TF803IFEL07IFCP07UF07IFE03SFE00TFE00JF807TF007TF,R0MFE00TF807IFEL07IFCP0VF07IFE03SFE00UF01JF80UF00UF,R07LFE00TF807IFEL0JFCP07TFE07IFC07SFC01UF01JF80UF00TFE,R03LFE007SF807IFCL0JF8P07TFC07IFC07SF801TFE01JF00UF01TFC,V0IFEQ01JF807IFCL0JF8Q01IF8Q0JFC07FFER01IFCL07IFE01JF00IFEL03JF01IFC,U03IFCQ01JF80JFCL0JF8Q03IFEQ0JFC0JF8Q01IFEL03IFE03JF00JFL03JF01IFE,U07IFCQ01JF80JFCK01JF8Q03IFEQ0JF80JF8Q03JFL03IFE03JF01JF8K03JF03JF,U07IFCQ01JF80JF8K01JFR03IFEQ0JF80JF8Q03JFL07IFE03IFE01JFL03JF03IFE,U0JFCQ01JF00JF8K01JFR03IFEP01JF81JF8Q03IFEL07IFE03IFE01JFL03IFE03IFE,U0JF8Q01JF01JF8K01JFR07IFEP01JF81JF8Q03IFEL07IFC07IFE01JFL03IFE07IFE,U0JF8Q03JF01JF8K03JFR07IFCP01JF01JFR07IFEL07IFC07IFE03JFL07IFE07IFE,U0JF8Q03JF01JFL03IFER07IFCP01JF01JFR07IFEL0JFC07IFC03IFEL07IFE07IFC,T01JF8Q03IFE01JFL03IFER07IFCP01JF01JFR07IFCL0JFC07IFC03IFEL07IFC07IFC,T01JFR03IFE03JFL03IFER0JFCP03JF00JFR07IFCL0JF80JFC03IFEL07IFC07IFC,T01JFR07IFE03JFL07IFER0JFEP03IFE00JF8Q07IFCL0JF80JFC07IFEL0JFC0JFC,T01JF01TFE03IFEL07IFCR0PFCJ03IFE00RFCI0JFCK01JF80JF807IFCL0JFC0JF8J0LF,T03JF03TFC03IFEL07IFCR0PFCJ03IFE007RFI0JF8K01JF80JF807IFCL0JF80JF8J0LF,T03IFE03TFC07IFEL07IFCQ01PFCJ07IFE003RF800JF8K01JF01JF807IFCL0JF80JF8I01LF,T03IFE07TFC07IFEL0JFCQ01PFCJ07IFCI0RFC00JF8K01JF01JF80JFCK01JF81JF8I01LF,T03IFE07TFC07IFCL0JF8Q01PF8J07IFCI03QFE01JF8K03JF01JF00JF8K01JF81JFJ01LF,J0IFCL07IFE07FFEL03JF807IFCL0JF8Q01IF8Q07IFCR03FFE01JFL03JF01JF00JF8K01JF01JFL03IFE,I03IFEL07IFE07IF8K01JF80JFCL0JF8Q03IFCQ0JFCR07FFE01JFL03IFE01JF00JF8K01JF01JFL03IFE,I03IFEL07IFC0JFCK01JF80JFCK01JF8Q03IFEQ0JF8Q01JF03JFL03IFE03JF01JF8K03JF03JFL03IFE,I07IFEL07IFC0JFCK01JF80JF8K01JFR03IFEQ0JF8Q01JF03JFL07IFE03IFE01JFL03JF03IFEL07IFE,I07IFEL0JFC0JF8K01JF00JF8K01JFR03IFEQ0JF8Q01JF03IFEL07IFE03IFE01JFL03IFE03IFEL07IFC,I07IFCL0JF80JF8K01JF01JF8K01JFR07IFEP01JF8Q03IFE03IFEL07IFC03IFE01JFL03IFE03IFEL07IFC,I07IFCL0JF81JF8K01JF01JF8K03JFR07IFEP01JFR03IFE03IFEL07IFC07IFE03JFL07IFE07IFEL07IFC,I07IFCL0JF81JF8K03JF01JFL03JFR07IFCP01JFR03IFE07IFEL0JFC07IFC03IFEL07IFE07IFCL0JFC,I0JFCK01JF81JFL03IFE01JFL03IFER07IFCP01JFR03IFE07IFCL0JFC07IFC03IFEL07IFC07IFCL0JF8,I0JFCK01JF01JF8K07IFE01JFL07IFER0JFCP03JFR07IFE07IFCL0JF807IFC03IFEL07IFC07IFEL07IF8,I0JFEK07JF03JFCK0JFE03JF8K0JFER0JFCP03IFEQ01JFC07IFCL0JF80JFC07IFEL0JFC07JFL03IF8,I0UF03TFE03TFEP03KF8P03IFE01TFC0JFCK01JF80JF807IFCL0JFC07TF8,I0TFE03TFC03TFCP07KF8P03IFE03TFC0JF8K01JF80JF807IFCL0JF80UF,I0TFE03TFC03TFCP07KF8P07IFE07TF80JF8K01JF00JF807IFCL0JF807TF,I0TFC07TFC03TFCP0LF8P07IFC07TF80JF8K01JF01JF80JFCK01JF807TF,I0TF807TFC01TFCP0LFQ07IFC07TF01JF8K03JF01JF00JF8K01JF807TF,I0TF807TF801TF8P0LFQ07IFC0TFE01JFL03JF01JF00JF8K01JF007SFE,I07SF007TF801TF8P0LFQ0JFC0TFC01JFL03IFE01JF00JF8K01JF007SFE,I07RFE00UF800TF8O01LFQ0JF80TF801JFL03IFE03JF01JF8K03JF003SFE,I03RF800PFDJF8007NFDJF8O01KFEQ0JF80TF003JFL07IFE03IFE01JFL03JF001SFE,I01RFI0OFE1JFI03MFE1JFP01KFEQ0JF80SFC003IFEL07IFE03IFE01JFL03IFEI0SFC,J07PFCI0OF01JFI01MF01JFP01KFCQ0JF00SFI03IFEL07IFC03IFE01JFL03IFEI03RFC,K0OFCJ07MF800IFEJ03KF800IFCP01KF8Q0IFE00RF8I01IFCL03IF801IF800IFCL01IFCJ07QF8,,:::::::::::::::::::::::::::::::^FS',

      // LT Sports
      3: '^FO85,30^GFA,8774,8774,82,,::::::::::lT0IFC,lS01IFE,lS03IFE,:lS07IFE,:lS07IFC,:lS0JFC,:lS0JF8,:lR01IFE,L03JFCX03TF8W0OFEI03PF8N07NF8K07FF8003JFK03TFCJ07OFE,L0KFEW01UFEU01QF800RFCK01QFEI01IFE01LFCI0UFEI0RF,K01LFW03UFEU07QFC01SFK0SF8003IFE07MF001VF003RF8,K01KFEW03UFET01RF803SFCI03SFC003IFE3NF801VF00SF8,K01KFEW03UFET07RF803SFEI07SFE003SFC03UFE01SF,K03KFEW07UFCT0SF803SFEI0TFE007SFE03UFE03SF,K03KFEW07UFCS01SF803TF001UF007SFE03UFE07SF,K03KFCW07UFCS03SF007TF003UF007TF03UFE0TF,K03KFCW07UFCS07SF007TF007UF807TF07UFC1SFE,K03KFCW0VF8S0TF007TF00VF80UF07UFC1SFE,K07KFCW0VF8R01TF007TF00VF80UF07UFC3SFE,K07KF8W0VFS01SFE00UF01VF80UF07UF83SFC,K03KF8W07TFES03SF800UF01VF80UF03UF07SF,L01JF8gI07IF8X03IFS0IFEL03JF03IF8M03JF81IFCL03JFM03IF8L07IF,L01JF8gI0JFY07IFCR0JFL01JF03IFEM01JF01JFL03JFM0JF8L0JF8,L01JFgI01JFY07IFCQ01JF8K01JF03IFEM01JF01JFL03IFEL01JF8L0JF8,L01JFgI03JFY07IFCQ01JF8K03JF03IFEM01JF01JFL03IFEL01JF8L0JF8,L01JFgI03JFY0JFCQ01JFL03IFE07IFEM03JF03JFL07IFEL01JFM0JF8,L03JFgI03IFEY0JFCQ01JFL03IFE07IFEM03IFE03JFL07IFEL01JFM0JF8,L03IFEgI03IFEY0JFCQ03JFL03IFE07IFCM03IFE03IFEL07IFEL03JFL01JF8,L03IFEgI07IFEY0RFJ03JFL07IFE07IFCM03IFE03IFEL07IFCL03JFM0JF,L03IFEgI07IFEY0RFEI03IFEL07IFC0JFCM07IFE07IFEL07IFCL03IFEM0JF,L07IFEgI07IFCY0SF8003IFEL07IFC0JFCM07IFC07IFEL07IF8L03IFEM0JF,L07IFCgI07IFCY0SFC007IFEL07IFC0JF8M07IFC07IFCL01FFEM07IFEM0JFC,L07IFCgI0JFCY0SFE007IFEL0JFC0JF8M07IFC07IFCW07IFEM07QFE,L07IFCgI0JFCY07SF007IFCL0JF81JF8M0JFC0JFCW07IFCM03RF8,L0JFCgI0JF8Y07SF007IFCL0JF81JF8M0JF80JFCW07IFCM01RFC,L0JF8gI0JF8Y03SF80JFCL0JF81JFN0JF80JF8W0JFCN0RFE,L0JF8gH01JF8Y01SF80JFCK01JF81JFN0JF80JF8W0JFCN01QFE,L0JF8K07IFS01JF8g0SF80JF8K01JF03JFM01JF81JF8W0JF8W03FFE,K01JF8K0JF8R01JFgG03RF80JF8K01JF03JFM01JF81JF8W0JF8W0JF,K01JFK01JF8R01JFgH0RF81JF8K01JF03IFEM01JF01JFW01JF8V01JF,K01JFK01JFS03JFgO03JF81JF8K03JF03IFEM01JF01JFW01JF8V01JF,K01JFK01JFS03JFgO01JF81JFL03JF07IFEM03JF03JFW01JFW01JF,K03JFK01JFS03IFEgO01JF81JFL03IFE07IFEM03JF03JFW01JFW01JF,K03IFEK03JFS03IFEgO01JF03JFL03IFE07IFCM03IFE03IFEW03JFW03JF,K03IFEK03IFES07IFEgO01JF03JFL07IFE07IFCM03IFE03IFEW03JFW03IFE,K03IFEK03IFES07IFEgO03JF03JFL07IFC0JFCM07IFE07IFEW03IFEW03IFE,K07IF8K03IFES07IFCgO03JF03JFL0JFC0JFCM0JFC07IFEW03IFEW07IFE,J07TFE007FEN07IFCJ03FFR03SFE07TFC0VFC07IFCW07IFEM07SFE,I03UFC03IF8M0JFCI01IFCP01TFE07TF80VFC07IFCW07IFEL01TFC,I03UFC07IF8M0JFCI03IFCP01TFC07TF80VF80JFCW07IFCL03TFC,I07UFC07IF8M0JF8I03IFCP03TFC07TF00VF80JFCW07IFCL07TF8,I07UFC07IF8M0JF8I03IFCP03TF80UF00VF00JF8W0JFCL07TF8,I07UF807IF8L01JF8I07IF8P03TF00TFE00UFE00JF8W0JFCL07TF,I07UF80JFM01JF8I07IF8P07SFE00TFC007TFC01JF8W0JF8L07SFE,I0VF80JFM01JFJ07IF8P07SFC00TF8007TF801JF8W0JF8L0TFC,I0VF80JFM01JFJ07IF8P07SF801TFI03TF001JFW01JF8L0TF8,I0VF00JFM03JFJ0JFQ07RFE001SFEI01SFE001JFW01JF8L0TF,I0VF01IFEM03JFJ0JFQ07RF8001SF8J0SF8001JFW01JFM0SFC,I0UFE00IFEM01IFEJ0IFEQ07QFEI01RFEK03QFEI01IFEW01JFM0SF,I07TFC007FF8N0IF8J03FFCQ03PFCJ03QFCM03OFEK0IFCX0IFCM07QF,iR03JF,iR03IFE,:iR07IFE,:iR07IFC,:iR0JFC,:iR0JF8,::iR0IFE,,:::::::::::::::::^FS'
    };



    // DOBJ47694
    // ISZR57209
    const linhas = [
      '^XA', '^CI28', '^LH0,0',
      objEmpresaLogo[agendamentoCompleto.empresa],
      logoJauPesca,
      `^FO35,250^A0N,40,40^FDFrete: ${freteId}^FS`,
      `^FO480,250^A0N,40,40^FDData: ${dataStr}^FS`,
      `^FO35,300^A0N,40,40^FDInicio: ${horaIni}^FS`,
      `^FO480,300^A0N,40,40^FDTermino: ${horaFim}^FS`,
      logoMercadoLivre,
      '^FO30,380^GB750,2,2^FS',
      '^FO30,400^A0N,40,40^FDEtiqueta/UN^FS',
      `^FO600,400^A0N,40,40^FDCaixa: ${cx.id}^FS`,
      '^FO30,450^GB750,2,2^FS'
    ];

    let y = 480;
    const step = 50;
    Object.entries(cx.itens || {}).forEach(([sku, qtd]) => {
      linhas.push(`^FO25,${y}^A0N,30,30^FD ${sku} / ${qtd}^FS`);
      y += step;
    });

    linhas.push('^XZ');

    const zpl = linhas.join('\n');
    console.log(zpl);
    imprimirEtiqueta(zpl, 'caixa');
  }

  function fecharCaixaAtiva() {
    if (caixaAtivaIndex === -1 || caixas[caixaAtivaIndex].fechada) {
      return;
    }

    const caixa = caixas[caixaAtivaIndex];
    const caixaEl = caixa.element;
    const totalItens = Object.values(caixa.itens).reduce((sum, count) => sum + count, 0);

    if (totalItens === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Ação Inválida',
        text: 'Você não pode fechar uma caixa vazia.'
      });
      return;
    }

    // 1) marca a caixa como fechada no front
    caixa.fechada = true;
    caixaEl.classList.remove('caixa-aberta');
    caixaEl.classList.add('caixa-fechada');

    // 2) atualiza o header com número e total de itens
    const header = caixaEl.querySelector('.card-header');
    header.textContent = `Caixa ${caixa.id} - (${totalItens} ${totalItens > 1 ? 'itens' : 'item'})`;

    // 3) registra o timestamp de término
    caixa.endTime = new Date();

    // 4) “desativa” a caixa atual antes de gerar a etiqueta
    caixaAtivaIndex = -1;

    // 5) gera uma ZPL só para esta caixa (use o startTime que você já setou em abrirNovaCaixa)

    // 6) atualiza botões (“Nova Caixa” / “Finalizar”) conforme o estado
    atualizarPainelEsquerdo();
  }

  let scanBusy = false; // trava simples contra double-enter
  async function adicionarItemNaCaixa(etiqueta) {
    if (caixaAtivaIndex === -1 || caixas[caixaAtivaIndex].fechada) {
      Swal.fire("Atenção", "Nenhuma caixa aberta. Crie uma nova caixa antes.", "warning");
      throw new Error("Nenhuma caixa aberta.");
    }
    if (scanBusy) return; // evita duplicidade
    scanBusy = true;

    const caixa = caixas[caixaAtivaIndex];

    // garante que a caixa exista no BD (se alguém mudou sua função abrirNovaCaixa)
    if (!caixa.persisted) {
      try {
        const { caixa_num, codigo_unico_caixa } = await fetchJSON('/api/embalar/caixa', {
          method: 'POST',
          body: { id_agend_ml: idAgendMl }
        });
        caixa.id = caixa_num;
        caixa.codigo = codigo_unico_caixa;
        caixa.persisted = true;
        caixa.element.querySelector('.card-header').textContent = `Caixa ${caixa.id}`;
      } catch (err) {
        scanBusy = false;
        console.error(err);
        Swal.fire("Erro", "Não foi possível criar a caixa no servidor.", "error");
        return;
      }
    }

    try {
      // CHAMADA ATÔMICA: bipados + item da caixa de uma vez
      const resp = await fetchJSON('/api/embalar/scan', {
        method: 'POST',
        body: {
          id_agend_ml: idAgendMl,
          id_prod_ml: etiqueta,                   // etiqueta do anúncio
          sku: etiqueta,                          // o que grava na caixa (pode ser a própria etiqueta)
          codigo_unico_caixa: caixa.codigo,       // preferível ao número
          caixa_num: caixa.id                     // redundante, mas útil
        }
      });

      // Atualiza estado e DOM com o que o servidor confirmou
      caixa.itens[etiqueta] = resp.quantidade_caixa;

      const ul = caixa.element.querySelector('ul');
      let li = ul.querySelector(`li[data-etiqueta="${etiqueta}"]`);
      if (!li) {
        li = document.createElement('li');
        li.dataset.etiqueta = etiqueta;
        li.className = 'd-flex justify-content-between p-1';
        ul.appendChild(li);
      }
      li.innerHTML = `<span>${esc(etiqueta)}</span><span class="fw-bold">Unidades: ${esc(caixa.itens[etiqueta])}</span>`;
      li.classList.add('item-caixa-novo');
      setTimeout(() => li.classList.remove('item-caixa-novo'), 700);

      // atualiza contador do produto (bipados) a partir do valor garantido do banco
      atualizarStatusProduto(resp.id_prod_ml, resp.bipados);

      return resp; // caso o chamador queira usar

    } catch (err) {
      console.error("Erro ao bipar:", err);
      Swal.fire("Erro", err.message || "Falha ao bipar", "error");
    } finally {
      scanBusy = false;
    }
  }

  async function iniciarEmbalagem(idProdMl) {
    try {
      const response = await fetch("/api/embalar/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_agend_ml: idAgendMl, id_prod_ml: idProdMl }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Falha ao iniciar embalagem no servidor");
      }
      return await response.json();
    } catch (error) {
      console.error("Erro ao iniciar embalagem:", error);
      Swal.fire("Erro", "Não foi possível registrar o início da embalagem no banco de dados.", "error");
      throw error; // Lança o erro para que a função que chamou saiba que falhou
    }
  }

  function atualizarStatusProduto(idMlParaAtualizar, bipadosAtuais) {
    const produtoData = produtos.find(p => p.id_ml === idMlParaAtualizar);
    if (!produtoData) return;

    const itemLi = listaPrincipalEl.querySelector(`li[data-id-ml="${idMlParaAtualizar}"]`);
    if (!itemLi) return;

    const totalNec = produtoData.unidades;
    const bipadosCapped = Math.min(bipadosAtuais, totalNec);

    // --- INÍCIO DA CORREÇÃO ---
    // A propriedade 'bipados' no objeto em memória só é definida aqui.
    // Se for 0, significa que acabamos de validar o SKU.
    if (produtoData.bipados === undefined && bipadosCapped === 0) {
      produtoData.bipados = 0; // Define como 0 para marcar como "iniciado"
    } else {
      produtoData.bipados = bipadosCapped;
    }

    const skuSpan = itemLi.querySelector(".sku");
    const unidadesSpan = itemLi.querySelector(".unidades");

    // Condição corrigida: troca para etiqueta assim que o produto é iniciado (bipados >= 0)
    if (typeof produtoData.bipados === "number") {
      itemLi.dataset.sku = produtoData.id_ml; // Muda o SKU do item para a etiqueta
      skuSpan.textContent = produtoData.id_ml;
      skuSpan.classList.add("etiqueta");

      // --- [REIMPRIMIR] injeta o botão assim que o produto é iniciado ---
      if (isMLouShopee()) { // Mercado Livre ou Shopee
        const meta = itemLi.querySelector(".produto-meta");
        if (!meta.querySelector(".btn-reimprimir")) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-sm btn-outline-secondary ms-2 btn-reimprimir";
          btn.title = "Reimprimir etiquetas deste anúncio";
          btn.innerHTML = '<i class="bi bi-printer"></i>';
          // coloca o botão antes do contador de unidades
          meta.insertBefore(btn, meta.querySelector(".unidades"));
        }
      }
    }

    unidadesSpan.textContent = `Bipados: ${produtoData.bipados}/${totalNec}`;
    // --- FIM DA CORREÇÃO ---

    if (produtoData.bipados >= totalNec) {
      itemLi.classList.add("produto-concluido");
      if (!itemLi.querySelector("i.bi-check-circle-fill")) {
        itemLi.querySelector(".produto-info").insertAdjacentHTML("afterbegin", '<i class="bi bi-check-circle-fill me-2"></i>');
      }
    } else {
      itemLi.classList.remove("produto-concluido");
      itemLi.querySelector("i.bi-check-circle-fill")?.remove();
    }

    atualizarContadorFinalizados();
    atualizarPainelEsquerdo();
  }

  // VERSÃO CORRIGIDA
  function atualizarContadorFinalizados() {
    const contagem = listaPrincipalEl.querySelectorAll(".produto-concluido").length;
    if (contadorFinalizadosEl) {
      contadorFinalizadosEl.innerHTML = `<strong>✅ Finalizados:</strong> ${contagem}`;
    }
    // A chamada para atualizarPainelEsquerdo() foi removida daqui.
  }

  // --- [REIMPRIMIR] handler global (delegação) ---
  document.getElementById("lista-anuncios").addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".btn-reimprimir");
    if (!btn) return;

    const li = btn.closest("li.produto-item");
    const idMl = li?.dataset.idMl;
    const produto = produtos.find(p => p.id_ml === idMl);
    if (!produto) return;

    const { value: qtdRaw } = await Swal.fire({
      title: "Reimprimir etiquetas",
      input: "number",
      inputLabel: "Quantas etiquetas faltam?",
      inputValue: 1,
      inputAttributes: { min: 1, step: 1 },
      showCancelButton: true,
      confirmButtonText: "Imprimir",
      cancelButtonText: "Cancelar"
    });
    if (!qtdRaw) return;

    const qtd = Math.max(1, parseInt(qtdRaw, 10) || 1);
    reimprimirEtiquetas(produto.id_ml, qtd); // usa a etiqueta/ID do anúncio
  });

  inputSku.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const valor = inputSku.value.trim();
    if (!valor) return;

    console.clear();
    console.log(`--- BIP REGISTRADO: "${valor}" ---`);

    // 1) é uma etiqueta de produto já iniciado?
    const produtoPorEtiqueta = produtos.find(p => p.id_ml === valor);
    inputSku.value = "";

    if (produtoPorEtiqueta) {
      if (produtoPorEtiqueta.bipados >= produtoPorEtiqueta.unidades) {
        Swal.fire({ icon: "info", title: "Anúncio já finalizado!", timer: 1800, showConfirmButton: false });
        return;
      }
      // chama a função atômica (já atualiza UI)
      try {
        await adicionarItemNaCaixa(valor);
      } catch { /* erros já tratados internamente */ }
      return;
    }

    // 2) Não é etiqueta em andamento: procura SKU/GTIN em produtos PENDENTES
    const candidatos = produtos.filter(prod => {
      if (prod.bipados !== undefined) return false;
      if (prod.sku === valor || prod.gtin === valor) return true;
      return prod.composicoes?.some(item => item.sku === valor || item.gtin === valor);
    });

    if (candidatos.length === 0) {
      Swal.fire("Não Encontrado", `Nenhum anúncio PENDENTE para: "${valor}"`, "warning");
      return;
    }
    if (candidatos.length === 1) {
      abrirModalConfirmacao(candidatos[0]);
      return;
    }

    // múltiplos — abrir modal de seleção
    bodySelecione.innerHTML = candidatos.map(prod => {
      const imgUrl = prod.imagemUrl || placeholderImage;
      return `<div class="card mb-3" data-sku="${prod.sku}" data-id-ml="${prod.id_ml}" style="cursor: pointer;">
              <div class="row g-0">
                <div class="col-3 d-flex align-items-center justify-content-center p-2">
                  <img src="${imgUrl}" class="img-fluid rounded-start" alt="${prod.nome}">
                </div>
                <div class="col-9">
                  <div class="card-body">
                    <h6 class="card-title">Anúncio: ${prod.nome}</h6>
                    <p class="card-text mb-1"><strong>Etiqueta:</strong> ${prod.id_ml}</p>
                    <p class="card-text mb-1"><strong>Qtd Etiquetas:</strong> ${prod.unidades}</p>
                    <p class="card-text mb-0"><strong>Tipo:</strong> ${prod.is_kit ? "Kit" : "Simples"}</p>
                  </div>
                </div>
              </div>
            </div>`;
    }).join("");
    modalSelecione.show();
  });

  // ===================================================================
  // FUNÇÕES ORIGINAIS
  // ===================================================================

  function inicializarPopoversDeImagem() {
    if (!window.bootstrap?.Popover) return;

    const icons = document.querySelectorAll("#lista-anuncios .info-trigger");
    icons.forEach((icon) => {
      const li = icon.closest(".produto-item");
      if (!li) return;

      // evita duplicar
      bootstrap.Popover.getInstance(icon)?.dispose();

      // acha o produto (preferência por id_ml; senão sku)
      const idMl = li.dataset.idMl || li.dataset.idml;
      const sku = li.dataset.sku;
      const p =
        (idMl && produtos.find(x => String(x.id_ml) === String(idMl))) ||
        (sku && produtos.find(x => String(x.sku) === String(sku)));

      if (!p) return;

      // possíveis chaves de imagem vindas do back
      const imagemUrl = p.imagemUrl || p.imageUrl || p.imagem_url || p.imagem || p.imagemTiny || li.dataset.imagemUrl || "";

      new bootstrap.Popover(icon, {
        html: true,
        trigger: "hover focus",
        placement: "left",
        container: "body",
        customClass: "product-popover popover-wide",
        content: buildInfoHTML({
          nome: p.nome, sku: p.sku, gtin: p.gtin, id_ml: p.id_ml,
          id_tiny: p.id_tiny, unidades: p.unidades, imagemUrl
        })
      });
    });
  }

  // (NOVO) Reaplica popovers quando a lista mudar (itens adicionados/alterados dinamicamente)
  const observer = new MutationObserver(() => inicializarPopoversDeImagem());
  if (listaPrincipalEl) {
    observer.observe(listaPrincipalEl, { childList: true, subtree: true });
  }

  // continue chamando uma vez no final também:
  inicializarPopoversDeImagem();

  bodySelecione.addEventListener("click", (e) => {
    const card = e.target.closest(".card[data-id-ml]");
    if (!card) return;

    const idMl = card.dataset.idMl;
    const prod = produtos.find((p) => p.id_ml === idMl);

    if (prod) {
      abrirModalConfirmacao(prod);
    } else {
      console.error("Produto não encontrado para o id_ml clicado:", idMl);
      modalSelecione.hide();
    }
  });

  bodyConfirme.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.id !== "sku-confirmacao-unico") return;
    e.preventDefault();
    const inputUnico = e.target;
    const valorDigitado = inputUnico.value.trim();
    if (!valorDigitado) return;
    const itemLi = Array.from(bodyConfirme.querySelectorAll('.componente-item')).find(li => {
      const okSku = li.dataset.skuEsperado === valorDigitado;
      const okGtin = li.dataset.gtinEsperado === valorDigitado;
      const ainda = +li.dataset.bipado < +li.dataset.requerido;
      return (okSku || okGtin) && ainda;
    });
    if (itemLi) {
      let contagemBipada = parseInt(itemLi.dataset.bipado) + 1;
      const contagemRequerida = parseInt(itemLi.dataset.requerido);
      itemLi.dataset.bipado = contagemBipada;
      const contadorSpan = itemLi.querySelector(".contador-bipagem");
      contadorSpan.textContent = `(${contagemBipada}/${contagemRequerida})`;

      itemLi.classList.remove('status-pendente');
      if (contagemBipada < contagemRequerida) {
        itemLi.classList.add('status-progresso');
      } else {
        itemLi.classList.add('status-concluido');
      }

      if (!bodyConfirme.querySelector(".componente-item:not(.status-concluido)")) {
        inputUnico.disabled = true;
        inputUnico.placeholder = "Todos os itens foram conferidos!";
        btnConfirmar.focus();
      }
    } else {
      Swal.fire({ icon: "error", title: "SKU Inválido!", timer: 2000, showConfirmButton: false });
      inputUnico.classList.add("animate__animated", "animate__shakeX");
      setTimeout(() => { inputUnico.classList.remove("animate__animated", "animate__shakeX"); }, 800);
    }
    inputUnico.value = "";
  });

  btnConfirmar.addEventListener("click", async () => {
    const itemPendente = bodyConfirme.querySelector(".componente-item:not(.status-concluido)");
    if (itemPendente) {
      Swal.fire("Atenção!", "Ainda existem itens pendentes na lista.", "warning");
      return;
    }
    const idMlConferido = bodyConfirme.dataset.idMlConferindo;
    if (!idMlConferido) {
      console.error("Erro Crítico: idMlConferindo não foi encontrado no dataset do modal.");
      return;
    }
    modalConfirme.hide();
    const produtoParaEtiqueta = produtos.find(p => String(p.id_ml) === String(idMlConferido));
    if (produtoParaEtiqueta) {
      // Imprime pelo ID do anúncio (etiqueta), não pelo SKU
      gerarEtiqueta(idMlConferido);
    }
    try {
      await iniciarEmbalagem(idMlConferido);
      atualizarStatusProduto(idMlConferido, 0);
    } catch (error) {
      console.error("Não foi possível iniciar o produto, a UI não será alterada.");
    }
  });

  async function buscarDadosEmbalagem() {
    if (!idAgendMl) return;
    try {
      const data = await fetchJSON(`/api/embalar/bipados/${idAgendMl}`);
      data.forEach(item => atualizarStatusProduto(item.id_prod_ml, Number(item.bipados || 0)));
    } catch (error) {
      console.warn("Sincronização falhou:", error.message || error);
    }
  }

  function gerarEtiqueta(idMl) {
    console.log('[ LOG ] Marketplace ID:', idMktp);
    switch (parseInt(idMktp)) {
      case 1: // Mercado Livre
        gerarEtiquetaMeLi(idMl);
        break;
      case 3: // Shopee
        gerarEtiquetaShopee(idMl);
        break;
      default:
        Swal.fire("Não disponível",
          `Este agendamento é para o \"${esc(marketplace)}\". A geração de etiqueta específica ainda não está implementada.`,
          "info");
        break;
    }
  }

  function reimprimirEtiquetas(idMl, qtd) {
    const q = Number(qtd);
    if (!Number.isFinite(q) || q <= 0) {
      Swal.fire("Quantidade inválida", "Informe um número maior que zero.", "warning");
      return;
    }
    switch (parseInt(idMktp, 10)) {
      case 1: // Mercado Livre
        return gerarEtiquetaMeLi(idMl, q);
      case 3: // Shopee
        return gerarEtiquetaShopee(idMl, q);
      default:
        Swal.fire("Reimpressão indisponível", "Este marketplace ainda não tem reimpressão.", "info");
    }
  }

  function gerarEtiquetaMeLi(idMl, un = null) {
    const anuncio = produtos.find((p) => String(p.id_ml) === String(idMl));
    if (!anuncio) return;

    // POSIÇÕES FIXAS
    const xColunaEsquerda = 15;    // ^FO15,15
    const xColunaDireita = 350;   // ^FO350,15

    // OFFSETS PARA TEXTO DO CÓDIGO DE BARRAS
    const textoOffEsq = 95 - xColunaEsquerda; // 80
    const textoOffDir = 420 - xColunaDireita;  // 70

    // POSIÇÕES (X/Y) PARA NOME E SKU
    const nomeXLeft = 15;   // ^FO15,110
    const skuXLeft = 15;   // ^FO15,175
    const nomeXRight = 350;  // ^FO350,110
    const skuXRight = 350;  // ^FO350,175
    const nomeY = 110;
    const skuY = 175;

    // LARGURA DO BLOCO DE TEXTO
    const nomeWidth = 280;  // ^FB280,...

    const unidades_totais = un === null ? anuncio.unidades : Number(un);

    let etiquetasGeradas = 0;
    const linhasNecessarias = Math.ceil(unidades_totais / 2);
    const zplAndamento = [];

    for (let linha = 0; linha < linhasNecessarias; linha++) {
      zplAndamento.push("^XA");
      zplAndamento.push("^CI28");
      zplAndamento.push("^LH0,0");

      // Coluna esquerda
      if (etiquetasGeradas < unidades_totais) {
        zplAndamento.push(
          `^FO${xColunaEsquerda},15^BY2,,0^BCN,54,N,N^FD${anuncio.id_ml}^FS`
        );
        zplAndamento.push(
          `^FO${xColunaEsquerda + textoOffEsq},80^A0N,20,25^FH^FD${anuncio.id_ml}^FS`
        );
        zplAndamento.push(
          `^FO${nomeXLeft},${nomeY}^A0N,18,18^FB${nomeWidth},3,2,L^FH^FD${anuncio.nome}^FS`
        );
        zplAndamento.push(
          `^FO${skuXLeft},${skuY}^A0N,18,18^FH^FDSKU: ${anuncio.sku}^FS`
        );
        etiquetasGeradas++;
      }

      // Coluna direita
      if (etiquetasGeradas < unidades_totais) {
        zplAndamento.push(
          `^FO${xColunaDireita},15^BY2,,0^BCN,54,N,N^FD${anuncio.id_ml}^FS`
        );
        zplAndamento.push(
          `^FO${xColunaDireita + textoOffDir},80^A0N,20,25^FH^FD${anuncio.id_ml}^FS`
        );
        zplAndamento.push(
          `^FO${nomeXRight},${nomeY}^A0N,18,18^FB${nomeWidth},3,2,L^FH^FD${anuncio.nome}^FS`
        );
        zplAndamento.push(
          `^FO${skuXRight},${skuY}^A0N,18,18^FH^FDSKU: ${anuncio.sku}^FS`
        );
        etiquetasGeradas++;
      }

      zplAndamento.push("^XZ");
    }

    const zpl = zplAndamento.join("\n");
    console.log(zpl);
    imprimirEtiqueta(zpl, "id");
  }

  function gerarEtiquetaShopee(idMl, un = null) {
    const anuncio = produtos.find((p) => String(p.id_ml) === String(idMl));
    if (!anuncio) return;

    const nomeAnuncio = anuncio.nome;
    const etiqueta = anuncio.id_ml;
    const unidadesTotais = un === null ? anuncio.unidades : Number(un);

    console.log("LOG: Gerando etiqueta Shopee para o anúncio:", idMl, anuncio);

    const zplConstructor = []; // Array para armazenar as etiquetas (cada índice será separado por quebra de linha "\n")

    console.log('anuncio:', anuncio);
    console.log('Quantidade:', unidadesTotais);

    for (let i = 0; i < unidadesTotais; i++) {
      zplConstructor.push("^XA");
      zplConstructor.push("^CI28");

      zplConstructor.push("^FO15,10");
      zplConstructor.push("^A0N,20,20");
      zplConstructor.push("^FB450,3,0,C,0");
      zplConstructor.push(`^FD${nomeAnuncio}^FS`);

      zplConstructor.push("^FO165,70");
      zplConstructor.push("^BQN,2,7");
      zplConstructor.push(`^FDLA,${etiqueta}^FS`);

      zplConstructor.push("^FO80,250");
      zplConstructor.push("^A0N,20,20");
      zplConstructor.push("^FB450,1,0,L,0");
      zplConstructor.push(`^FDbarcode:${etiqueta}^FS`);

      zplConstructor.push("^FO80,280");
      zplConstructor.push("^A0N,20,20");
      zplConstructor.push("^FB450,1,0,L,0");
      zplConstructor.push(`^FDwhs skuid:${etiqueta}^FS`);

      zplConstructor.push("^XZ");
    }

    const zpl = zplConstructor.join("\n");
    console.log(zpl);
    imprimirEtiqueta(zpl, "id");
  }

  // Inicialização
  inicializarPopoversDeImagem();
  await carregarCaixasSalvas();
  await buscarDadosEmbalagem(); // Busca inicial
  const SYNC_MS = 1 * 60 * 1000; // 1 minuto  
  const syncId = setInterval(buscarDadosEmbalagem, SYNC_MS);
  window.addEventListener('beforeunload', () => clearInterval(syncId));


  async function handleFinalizarEmbalagem(event) {
    event.preventDefault();

    const headerBar = document.querySelector('.header-bar');
    const idAgendamento = headerBar.dataset.idBd; // Pega o ID do agendamento do header da página

    // Pede confirmação ao usuário
    const result = await Swal.fire({
      title: 'Finalizar Embalagem?',
      text: "O relatório será gerado e o pedido movido para a Expedição. Deseja continuar?",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sim, finalizar!',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) {
      return;
    }

    // **1) Gera uma etiqueta ZPL para cada caixa já fechada**
    //    (supondo que cada objeto em `caixas` tenha `startTime` e `endTime` definidos)
    caixas
      .filter(cx => cx.fechada && cx.startTime && cx.endTime)
      .forEach(cx => gerarEtiquetaCaixa(cx.id));

    // 2) Mostra o loading
    Swal.fire({
      title: 'Processando...',
      text: 'Gerando relatório e atualizando o status.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    // 3) Envia para o backend finalizar o agendamento
    try {
      const response = await fetch(`/embalar/finalizar/${idAgendamento}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        await Swal.fire({
          icon: 'success',
          title: 'Sucesso!',
          text: data.message,
          timer: 2000,
          timerProgressBar: true,
        });
        window.location.href = '/agendamentos/ver?atualizado=ok';
      } else {
        throw new Error(data.message || 'Ocorreu um erro no servidor.');
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: `Falha ao finalizar a embalagem: ${error.message}`,
      });
    }
  }
  // Sincroniza a cada 1 segundos

  function funcoesDisponiveis() {
    console.log('======= IDENTIFICAÇÃO =======');
    console.log('gerarEtiquetaShopee(\"ID_ML\", \"un\");');
    console.log('gerarEtiquetaMeLi(\"ID_ML\", \"un\");\n\n');


    console.log('=========== VOLUME ===========');
    console.log('Etiqueta Mercado Livre');
    console.log('gerarEtiquetaCustom(\"nCaixa\");');
    console.log('gerarEtiquetaCustom(caixas[0]); // passe o OBJETO da caixa\n\n');

    console.log('Etiqueta Jaú Pesca');
    console.log('gerarEtiquetaCaixa(\"nCaixa\");');
    console.log('gerarEtiquetaCaixa(caixas[0]); // passe o OBJETO da caixa\n');
  }

  // 👉 Expor no console:
  window.gerarEtiquetaShopee = gerarEtiquetaShopee;
  window.funcoesDisponiveis = funcoesDisponiveis;
  window.gerarEtiquetaMeLi = gerarEtiquetaMeLi;
  window.gerarEtiquetaCustom = gerarEtiquetaCustom; // ML
  window.gerarEtiquetaCaixa = gerarEtiquetaCaixa; // JP
  inicializarModalFecharCaixa();
});