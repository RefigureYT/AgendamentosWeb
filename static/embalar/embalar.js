document.addEventListener("DOMContentLoaded", async () => {
  // 1) Dados iniciais e imagem padrão
  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);
  const placeholderImage = document.getElementById("placeholder-image").dataset.url;
  const headerBar = document.querySelector(".header-bar");
  const idAgendMl = headerBar ? headerBar.dataset.idMl : null;
  const idAgendBd = headerBar ? headerBar.dataset.idBd : null;

  const agendamentoCompleto = {};

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

  function imprimirNaImpressoraDeRede(zpl) {
    BrowserPrint.getLocalDevices(
      devices => {
        const termos = ['deskjp12', '192.168.15.152'];
        const printer = devices.find(d =>
          d.connection === 'driver' &&
          termos.some(t => d.uid.toLowerCase().includes(t))
        );
        if (!printer) {
          console.error("❌ Impressora compartilhada não encontrada.");
          return;
        }
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


  function printViaBrowserPrint(zpl) {
    BrowserPrint.getDefaultDevice("printer", function (printer) {
      printer.send(zpl,
        () => console.log("enviado!"),
        err => console.error("erro printer:", err)
      );
    }, err => console.error("nenhuma impressora:", err));
  }

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
      const resp = await fetch(`/api/embalar/caixa/${idAgendMl}`);
      if (!resp.ok) return;
      const caixasData = await resp.json();
      caixasData.forEach(box => {
        // recria cada caixa fechada no DOM
        const num = box.caixa_num;
        const totalItens = box.itens.reduce((s, i) => s + i.quantidade, 0);
        // adiciona ao state
        const idx = caixas.length;
        caixas.push({
          id: num,
          itens: box.itens.reduce((acc, i) => ({ ...acc, [i.sku]: i.quantidade }), {}),
          fechada: true,
          element: null
        });
        // monta o card
        const caixaDiv = document.createElement("div");
        caixaDiv.className = "card caixa-card caixa-fechada";
        caixaDiv.innerHTML = `
          <div class="card-header">Caixa ${num} - (${totalItens} ${totalItens > 1 ? 'itens' : 'item'})</div>
          <div class="card-body">
            <ul class="list-unstyled mb-0"></ul>
          </div>`;
        caixas[idx].element = caixaDiv;
        caixasContainer.prepend(caixaDiv);
        // popula itens na lista
        const ul = caixaDiv.querySelector("ul");
        box.itens.forEach(i => {
          const li = document.createElement("li");
          li.className = "d-flex justify-content-between p-1";
          li.innerHTML = `<span>${i.sku}</span><span class="fw-bold">Unidades: ${i.quantidade}</span>`;
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

    // Limpa a área de botões (mas não as caixas)
    const btnNovaCaixa = document.getElementById('btn-nova-caixa');
    const btnFinalizar = document.getElementById('btn-finalizar-embalagem');
    if (btnNovaCaixa) btnNovaCaixa.remove();
    if (btnFinalizar) btnFinalizar.remove();
    if (totalProdutos === produtosConcluidos && totalProdutos > 0) {
      // Se todos os produtos foram concluídos...
      // A lógica para fechar uma caixa aberta (se houver) está correta e deve permanecer
      if (existeCaixaAberta) {
        fecharCaixaAtiva();
        return; // Interrompe para evitar adicionar o botão de finalizar antes da hora
      }
      // Se não há caixa aberta, adicionamos o botão "Finalizar Embalagem"
      const clone = templateFinalizar.content.cloneNode(true);
      // Pegamos a referência do botão dentro do template
      const botaoFinalizar = clone.querySelector('#btn-finalizar-embalagem');
      // AQUI ESTÁ A MUDANÇA: Adicionamos o "escutador de eventos" de clique
      // que chama a função que você já adicionou no final do seu arquivo.
      botaoFinalizar.addEventListener('click', handleFinalizarEmbalagem);
      // Finalmente, adicionamos o botão já funcional à página
      caixaActionsContainer.prepend(clone);
    } else {
      // AINDA HÁ PRODUTOS PENDENTES
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
        const requerido = c.unidades_por_kit || 1;
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
    // 1) ajusta o índice da caixa ativa
    caixaAtivaIndex = caixas.length;

    // 2) cria o objeto da caixa e empurra no state
    //    usei 'caixaObj' + var para evitar TDZ
    var caixaObj = {
      id: null,      // vai receber o num do servidor
      itens: {},        // sku → quantidade
      fechada: false,
      persisted: false,
      element: null,
    };
    caixaObj.startTime = new Date();
    caixas.push(caixaObj);

    // 3) monta o card no DOM
    const numero = caixas.length;
    const caixaDiv = document.createElement('div');
    caixaDiv.className = 'card caixa-card caixa-aberta';
    caixaDiv.innerHTML = `
    <div class="card-header">Caixa ${numero}</div>
    <div class="card-body">
      <ul class="list-unstyled mb-0"></ul>
    </div>
  `;
    // salva a referência ao elemento
    caixaObj.element = caixaDiv;

    // 4) adiciona na lista de caixas à esquerda
    caixasContainer.prepend(caixaDiv);

    // 5) atualiza os botões (Nova caixa / Finalizar)
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
    imprimirNaImpressoraDeRede(zpl);
  }



  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1' || e.key === 'F2') {
      e.preventDefault();

      const idx = caixaAtivaIndex;
      const caixa = caixas[idx];
      if (!caixa || caixa.fechada) {
        Swal.fire("Atenção", "Nenhuma caixa aberta para fechar.", "warning");
        return;
      }

      // 1) fecha a caixa (sem imprimir)
      fecharCaixaAtiva();

      // 2) imprime as etiquetas conforme a tecla
      if (e.key === 'F1') {
        gerarEtiquetaCaixa(caixa);
        gerarEtiquetaCustom(caixa);
      } else {
        // F2: só a custom
        gerarEtiquetaCustom(caixa);
      }

      // 3) atualiza botões, contador etc.
      atualizarPainelEsquerdo();
    }
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
    imprimirNaImpressoraDeRede(zpl);
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


  async function adicionarItemNaCaixa(etiqueta) {
    if (caixaAtivaIndex === -1 || caixas[caixaAtivaIndex].fechada) {
      Swal.fire("Atenção", "Nenhuma caixa aberta. Crie uma nova caixa antes.", "warning");
      throw new Error("Nenhuma caixa aberta.");
    }

    const caixa = caixas[caixaAtivaIndex];

    // ==== 1) se ainda não persistiu a caixa, cria agora no servidor ====
    if (!caixa.persisted) {
      try {
        const resp = await fetch("/api/embalar/caixa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_agend_ml: idAgendMl })
        });
        if (!resp.ok) throw new Error("Falha ao criar caixa");
        const { caixa_num } = await resp.json();
        caixa.id = caixa_num;
        caixa.persisted = true;
        // atualiza o header do card
        caixa.element.querySelector('.card-header').textContent = `Caixa ${caixa.id}`;
      } catch (err) {
        console.error(err);
        Swal.fire("Erro", "Não foi possível criar a caixa no servidor.", "error");
        return;
      }
    }

    // ==== 2) agora sim adiciona o item no front e no back ====
    caixa.itens[etiqueta] = (caixa.itens[etiqueta] || 0) + 1;

    const ul = caixa.element.querySelector('ul');
    let li = ul.querySelector(`li[data-etiqueta="${etiqueta}"]`);
    if (!li) {
      li = document.createElement('li');
      li.dataset.etiqueta = etiqueta;
      li.className = 'd-flex justify-content-between p-1';
      ul.appendChild(li);
    }
    li.innerHTML = `
    <span>${etiqueta}</span>
    <span class="fw-bold">Unidades: ${caixa.itens[etiqueta]}</span>
  `;
    li.classList.add('item-caixa-novo');
    setTimeout(() => li.classList.remove('item-caixa-novo'), 700);

    // ==== 3) persiste o item no servidor ====
    try {
      await fetch("/api/embalar/caixa/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_agend_ml: idAgendMl,
          caixa_num: caixa.id,
          sku: etiqueta
        })
      });
    } catch (err) {
      console.error("Erro ao salvar item na caixa:", err);
    }
  }

  async function biparEmbalagem(idProdMl) { // ALTERADO: Recebe o id_ml único
    try {
      const response = await fetch("/api/embalar/bipar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ALTERADO: Envia o id_prod_ml para o backend
        body: JSON.stringify({ id_agend_ml: idAgendMl, id_prod_ml: idProdMl }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro na API: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Falha ao registrar bipagem:", error);
      Swal.fire("Erro", `Não foi possível registrar a bipagem: ${error.message}`, "error");
      throw error;
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

    // ETAPA 1: Checa se o valor é uma ETIQUETA de um produto já iniciado.
    const produtoPorEtiqueta = produtos.find(p => p.id_ml === valor);
    if (produtoPorEtiqueta) {
      console.log("LOG: O valor é uma ETIQUETA de um produto conhecido.", produtoPorEtiqueta);
      inputSku.value = ""; // Limpa o campo

      if (produtoPorEtiqueta.bipados >= produtoPorEtiqueta.unidades) {
        console.log("LOG: Produto já finalizado.");
        Swal.fire({ icon: "info", title: "Anúncio já finalizado!", timer: 2000, showConfirmButton: false });
        return;
      }

      if (produtoPorEtiqueta.bipados >= 0) {
        console.log("LOG: Bipando +1 unidade para a etiqueta.");
        try {
          await adicionarItemNaCaixa(valor);
          const resp = await biparEmbalagem(produtoPorEtiqueta.id_ml);
          atualizarStatusProduto(resp.id_prod_ml, resp.bipados);
        } catch (err) { console.warn(err.message); }
      } else {
        Swal.fire({ icon: "warning", title: "Ação Inválida", text: "Bipe o SKU do produto para iniciar a embalagem dele primeiro." });
      }
      return;
    }

    // ETAPA 2: Se não for etiqueta, busca por SKU/GTIN em produtos PENDENTES.
    console.log("LOG: O valor não é uma etiqueta em andamento. Procurando por SKUs pendentes...");
    const candidatos = produtos.filter(prod => {
      if (prod.bipados !== undefined) {
        return false; // Ignora produtos já iniciados
      }
      if (prod.sku === valor || prod.gtin === valor) return true;
      return prod.composicoes.some(item => item.sku === valor || item.gtin === valor);
    });

    console.log(`LOG: Encontrados ${candidatos.length} candidatos pendentes.`, candidatos);
    inputSku.value = "";

    // ETAPA 3: Decide o que fazer com os candidatos.
    if (candidatos.length === 0) {
      console.log("LOG: Nenhum candidato encontrado. Fim do fluxo.");
      Swal.fire("Não Encontrado", `Nenhum anúncio PENDENTE foi encontrado para o código: "${valor}"`, "warning");
      return;
    }

    if (candidatos.length === 1) {
      console.log("LOG: Encontrado 1 candidato. Abrindo modal de confirmação diretamente.");
      abrirModalConfirmacao(candidatos[0]);
      return;
    }

    // Se encontrou mais de um, mostra o modal de seleção.
    console.log("LOG: Encontrados múltiplos candidatos. Abrindo modal de seleção.");
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
    const todosOsIconesInfo = document.querySelectorAll("#lista-anuncios .bi-info-circle");
    todosOsIconesInfo.forEach((icon) => {
      const itemLi = icon.closest(".produto-item");
      if (!itemLi) return;
      const sku = itemLi.dataset.sku;
      const produto = produtos.find((p) => p.sku === sku);
      if (!produto) return;
      const imagemUrl = produto.imagemUrl || placeholderImage;
      const popoverContent = `<img src="${imagemUrl}" class="img-fluid rounded" style="max-width: 150px;">`;
      new bootstrap.Popover(icon, { html: true, trigger: "hover", placement: "left", content: popoverContent, container: "body", customClass: "produto-popover" });
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
      const response = await fetch(`/api/embalar/bipados/${idAgendMl}`);
      if (!response.ok) {
        console.warn(`Sincronização falhou: ${response.statusText}`);
        return;
      }
      const data = await response.json();

      // ALTERADO: A API agora retorna {id_prod_ml, bipados}, usamos isso.
      data.forEach(item => {
        atualizarStatusProduto(item.id_prod_ml, item.bipados);
      });
    } catch (error) {
      console.error("Erro ao sincronizar dados de embalagem:", error);
    }
  }

  function gerarEtiqueta(sku) {
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
      zplAndamento.push("^XA^CI28");
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
    printViaBrowserPrint(zpl);
  }






  // Inicialização
  inicializarPopoversDeImagem();
  await carregarCaixasSalvas();
  await buscarDadosEmbalagem(); // Busca inicial
  setInterval(buscarDadosEmbalagem, 1000);



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
      const response = await fetch(`/expedicao/finalizar/${idAgendamento}`, {
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
}
);