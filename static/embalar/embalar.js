document.addEventListener("DOMContentLoaded", async () => {

  // ==== util: escapar HTML simples (para innerHTML) ====
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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

      // snapshot antes de fechar
      const caixaAtual = caixas[caixaAtivaIndex];
      ultimaCaixaSnapshot = caixaAtual;

      // fecha (seta endTime, atualiza UI, zera caixaAtivaIndex)
      fecharCaixaAtiva();

      // imprime conforme a seleção
      try {
        if (selectedOpcaoImpressao === 'ambas') {
          gerarEtiquetaCustom(ultimaCaixaSnapshot); // ML inbound
          gerarEtiquetaCaixa(ultimaCaixaSnapshot);  // JP interna
        } else if (selectedOpcaoImpressao === 'ml') {
          gerarEtiquetaCustom(ultimaCaixaSnapshot);
        } else if (selectedOpcaoImpressao === 'jp') {
          gerarEtiquetaCaixa(ultimaCaixaSnapshot);
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
  const divsInfo = headerBar.querySelectorAll(".d-flex.flex-wrap > div");
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

  const empresa = parseInt(headerBar.dataset.empresa, 10);
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
    const key = keyMap[tipo];
    if (!key) return console.error("Tipo inválido:", tipo);

    const saved = localStorage.getItem(key);
    if (!saved) {
      console.error("Nenhuma impressora salva para:", key);
      if (!pendingPrint) pendingPrint = { zpl, tipo };
      if (typeof window.openPrinterModalByTipo === "function") window.openPrinterModalByTipo(tipo);
      return;
    }

    if (!window.BrowserPrint || typeof BrowserPrint.getLocalDevices !== "function") {
      console.error("BrowserPrint indisponível.");
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
        return `<li class="componente-item status-pendente" data-sku-esperado="${c.sku}" data-gtin-esperado="${c.gtin}" data-requerido="${requerido}" data-bipado="0">
                        <span class="componente-nome">${c.nome}</span>
                        <span class="componente-status"><span class="contador-bipagem">(0/${requerido})</span></span>
                    </li>`;
      }).join("");
    } else {
      const requerido = 1;
      lisHtml = `<li class="componente-item status-pendente" data-sku-esperado="${prod.sku}" data-gtin-esperado="${prod.gtin}" data-requerido="${requerido}" data-bipado="0">
                       <span class="componente-nome">${prod.nome}</span>
                       <span class="componente-status"><span class="contador-bipagem">(0/${requerido})</span></span>
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

    modalSelecione.hide();
    modalConfirme.show();
    setTimeout(() => { document.getElementById("sku-confirmacao-unico")?.focus(); }, 500);
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
      caixasContainer.prepend(clone);
      document.getElementById('btn-nova-caixa').addEventListener('click', abrirNovaCaixa);
    } else if ((!algumProdutoProntoParaEmbalar || existeCaixaAberta) && btnNovaCaixa) {
      btnNovaCaixa.remove();
    }
  }

  async function abrirNovaCaixa() {
    // índice da nova caixa
    caixaAtivaIndex = caixas.length;

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

  function gerarEtiquetaCustom(caixa) {
    const idAgendamento = idAgendMl;
    const numeroCaixa = caixa.id;

    // Busca o centro de distribuição
    const centro = agendamentoCompleto.centro_distribuicao;
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
    const cfg = centerConfig[centro] || {
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

    // 1) fecha a caixa (sem imprimir)
    fecharCaixaAtiva();

    // 2) imprime conforme a tecla
    if (e.key === 'F1') {           // ML + JP
      gerarEtiquetaCaixa(caixa);
      gerarEtiquetaCustom(caixa);
    } else if (e.key === 'F2') {    // só ML
      gerarEtiquetaCustom(caixa);
    } else if (e.key === 'F3') {    // só JP
      gerarEtiquetaCaixa(caixa);
    } else if (e.key === 'F4') {
      // nenhuma
    }

    // 3) atualiza UI
    atualizarPainelEsquerdo();
  });

  function gerarEtiquetaCaixa(caixa) {
    const headerBar = document.querySelector('.header-bar');
    const freteId = headerBar.dataset.idMl;
    const dataStr = caixa.startTime.toLocaleDateString('pt-BR');
    const horaIni = caixa.startTime.toLocaleTimeString('pt-BR', { hour12: false });
    const horaFim = caixa.endTime.toLocaleTimeString('pt-BR', { hour12: false });

    const linhas = [
      '^XA^CI28',
      '^LH0,0',
      `^FO30,30^BQN,2,15^FDLA,Frete:${freteId} - Data: ${dataStr} - Inicio: ${horaIni} - Termino: ${horaFim}^FS`,
      `^FO390,40^A0N,32,32^FDFrete: ${freteId}^FS`,
      `^FO390,90^A0N,32,32^FDData: ${dataStr}^FS`,
      `^FO390,140^A0N,32,32^FDInicio: ${horaIni}^FS`,
      `^FO390,190^A0N,32,32^FDTermino: ${horaFim}^FS`,

      // Logo do mercado livre
      '^FO620,225^GFA,0,4150,30,,::::::::::::::::::::::::::::::::::::::::::Y03KFE,W01OF8,V01JF800JFC,U01FFEM03FFC,U0FF8O01FF8,T07F8Q01FF,S03FCS01FC,S0FEU03F8,R07FW07E,R0F8W01F8,Q03EY07E,Q0F8Y01F8,P03EgG07C,P078gG01F,O01FP03IFO078,O03CO01KFN03C,O07CO07F807FCN0F,O0FF8M01F8I03F8M0F8,N03CFFM03EK0FEL07FC,N0781FEK03F8K01FCJ03F8E,N0F003FEI03FEM07FE007FE07,M01EI07FE03FFCN0LF0038,M03CJ0LF8N01JFI01C,M038K0IF87X0E,M07P0EI03F8R07,M0EO01CI0FFER07,L01CO038003F1FR038,L01CO07I07807CQ01C,L038O0E001E001ER0C,L03O01C003CI0FR0E,L07O0380078I038Q06,L06O03001EJ01CQ07,L0EO03003CK0FQ03,L0CO03C0F8K078P038,K01CO01FFEL03CP018,K018P07F8M0EP018,K018g07P01C,K038g03CP0C,K038g01EP0C,K03CgG0FP0C,K03FCg078N07E,K03FFCY01CM07FE,K031FFCY0EL07FFE,K0301FF8X07K03FF0E,K03001FFX03CI01FF80E,K03I01FCW01EI0FF800E,K03J03F8W0F003FCI0E,K03K0FEW0381FEJ0E,K03K01F8FCQ04001C7FK0E,K038K07IF7FO06I0FF8K0E,K038K01F87FFCN03I07CL0E,K038L0E03C1EN0180038K01E,K038L0E01807FN0E001CK01E,K03CL0E01007FCM07001CK01C,K03CL0EJ031EM03801CK01C,K03CL0EL07M01C01CK03C,K01EL06L03N0E01CK03C,K01EL07L038I03I07038K078,K01FL03FCJ018I018003FFL078,L0FL01FCJ018J0C001FEL0F8,L0F8L07CJ03FJ0E001F8K01F8,L0FCM0EJ03FCI070018L01F,L07CM06J031EI038038L03F,L07EM078K07I01C038L07E,L03FM03EEJ031800E0FM07E,L03F8L01FEJ038C007FEM0FC,L01FCM07FJ0187007FCL01FC,L01FEN07J0183803FM03F8,M0FFN03C700181C07N07F,M07F8M01FF00380E0FN0FF,M03FCN07F003007BEM03FE,M03FEO03807807FCM07FC,M01FF8N01C0FE0FFN0FF8,N0FFCO0KFEN03FF8,N07FFO07F87F8N07FF,N03FF8N01EQ01FFE,N01FFEgG03FFC,O0IF8g0IF8,O07FFEY03FFE,O03IF8W01IFC,P0IFEW07IF8,P07IFCU03IFE,P01JF8S01JFC,Q0KF8R0KF,Q03KF8P0KFE,R0LFCM01LF8,R03MFCI03MFE,S0YF,S01WFC,T07UFE,U0UF,V0SF8,W0QF,X03MFE,gG0IF8,,:::::::::::::::::::::::::::::::::::::::::^FS',

      '^FO30,380^GB750,2,2^FS',
      '^FO30,400^A0N,40,40^FDEtiqueta/UN^FS',
      `^FO600,400^A0N,40,40^FDCaixa: ${caixa.id}^FS`,
      '^FO30,450^GB750,2,2^FS'
    ];

    // agora renderiza cada SKU/qtde na sequência
    let y = 480;
    const step = 50;
    Object.entries(caixa.itens).forEach(([sku, qtd]) => {
      linhas.push(`^FO25,${y}^A0N,30,30^FD ${sku} / ${qtd}^FS`);
      y += step;
    });

    linhas.push('^XZ');

    const zpl = linhas.join('\n');
    console.log(zpl)
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
    const todos = document.querySelectorAll("#lista-anuncios .bi-info-circle");
    todos.forEach((icon) => {
      const itemLi = icon.closest(".produto-item");
      if (!itemLi) return;
      const idMl = itemLi.dataset.idMl;
      const produto = produtos.find((p) => p.id_ml === idMl);
      if (!produto) return;
      const imagemUrl = produto.imagemUrl || placeholderImage;
      const popoverContent = `<img src="${esc(imagemUrl)}" class="img-fluid rounded" style="max-width: 150px;">`;
      new bootstrap.Popover(icon, {
        html: true,
        trigger: "hover",
        placement: "left",
        content: popoverContent,
        container: "body",
        customClass: "produto-popover"
      });
    });
  }

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
    const produtoParaEtiqueta = produtos.find(p => p.id_ml === idMlConferido);
    if (produtoParaEtiqueta) {
      gerarEtiqueta(produtoParaEtiqueta.sku);
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

  function gerarEtiqueta(sku) {
    console.log('[ LOG ] Marketplace ID:', idMktp);
    switch (parseInt(idMktp)) {
      case 1: // Mercado Livre
        gerarEtiquetaMeLi(sku);
        console.log('Mercado Livre');
        break;
      case 3: // Shopee
        gerarEtiquetaShopee(sku);
        console.log('Shopee');
        break;
      default:
        gerarEtiquetaMeLi(sku); // Padrão para outros marketplaces (SOMENTE ENQUANTO EU NÃO FAÇO AS OUTRAS)
        console.log('Qualquer outro Marketplace ainda não implementado, usando padrão MeLi');
        break;
    }
  }

  function gerarEtiquetaMeLi(sku) {
    const anuncio = produtos.find((p) => p.sku === sku);
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

    let etiquetasGeradas = 0;
    const linhasNecessarias = Math.ceil(anuncio.unidades / 2);
    const zplAndamento = [];

    for (let linha = 0; linha < linhasNecessarias; linha++) {
      zplAndamento.push("^XA");
      zplAndamento.push("^CI28");
      zplAndamento.push("^LH0,0");

      // Coluna esquerda
      if (etiquetasGeradas < anuncio.unidades) {
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
      if (etiquetasGeradas < anuncio.unidades) {
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

  function gerarEtiquetaShopee(sku) {
    const anuncio = produtos.find((p) => p.sku === sku);
    if (!anuncio) return;

    const nomeAnuncio = anuncio.nome;
    const etiqueta = anuncio.id_ml;

    console.log("LOG: Gerando etiqueta Shopee para o SKU:", sku, anuncio);

    const zplConstructor = []; // Array para armazenar as etiquetas (cada índice será separado por quebra de linha "\n")

    console.log('anuncio:', anuncio);
    console.log('Quantidade:', anuncio.unidades);

    for (let i = 0; i < anuncio.unidades; i++) {
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
  const SYNC_MS = 2000; // em vez de 1000
  setInterval(buscarDadosEmbalagem, SYNC_MS);



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
      .forEach(cx => gerarEtiquetaCaixa(cx));

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
    console.log('gerarEtiquetaShopee(\"sku\");');
    console.log('gerarEtiquetaMeLi(\"sku\");\n\n');


    console.log('=========== VOLUME ===========');
    console.log('Etiqueta Mercado Livre');
    console.log('gerarEtiquetaCustom(\"nCaixa\");');
    console.log('LEMBRETE: Utilize o índice da caixa como número (número da caixa - 1)\n\n');

    console.log('Etiqueta Jaú Pesca');
    console.log('gerarEtiquetaCaixa(\"nCaixa\");');
    console.log('LEMBRETE: Utilize o índice da caixa como número (número da caixa - 1)\n');
  }

  // 👉 Expor no console:
  window.gerarEtiquetaShopee = gerarEtiquetaShopee;
  window.funcoesDisponiveis = funcoesDisponiveis;
  window.gerarEtiquetaMeLi = gerarEtiquetaMeLi;
  window.gerarEtiquetaCustom = gerarEtiquetaCustom; // ML
  window.gerarEtiquetaCaixa = gerarEtiquetaCaixa; // JP
  inicializarModalFecharCaixa();
});

