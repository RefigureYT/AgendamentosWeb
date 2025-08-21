document.addEventListener("DOMContentLoaded", async () => {
    // 1) Dados iniciais e imagem padrão
    const raw = document.getElementById("js-data").dataset.comps;
    const produtos = JSON.parse(raw);
    const placeholderImage = document.getElementById("placeholder-image").dataset.url;
    const headerBar = document.querySelector(".header-bar");
    const idAgendMl = headerBar ? headerBar.dataset.idMl : null;
    const idAgendBd = headerBar ? headerBar.dataset.idBd : null;

    // Variáveis de estado para as caixas e impressora
    let caixas = [];
    let caixaAtivaIndex = -1;
    let caixaStartTime = null;
    let impressoraSelecionada; // Variável para guardar a impressora

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
    const caixaActionsContainer = document.getElementById("caixa-actions-container");
    const contadorFinalizadosEl = document.getElementById("finalizadosP");
    const listaPrincipalEl = document.getElementById("lista-anuncios");
    const templateNovaCaixa = document.getElementById("template-nova-caixa");
    const templateFinalizar = document.getElementById("template-finalizar-embalagem");

    // ===================================================================
    // NOVA LÓGICA DE IMPRESSÃO DIRETA
    // ===================================================================
    /**
     * Configura a comunicação com o Zebra Browser Print e define a impressora padrão.
     */
    function setupImpressora() {
        BrowserPrint.getDefaultDevice("printer", (device) => {
            impressoraSelecionada = device;
            console.log("Impressora padrão encontrada:", device);
            if (!impressoraSelecionada) {
                 Swal.fire('Impressora não encontrada', 'Verifique se a impressora Zebra está conectada e se o Zebra Browser Print está em execução.', 'warning');
            }
        }, (error) => {
            console.error("Erro ao buscar impressora padrão:", error);
            Swal.fire('Erro de Comunicação', 'Não foi possível se conectar ao Zebra Browser Print. Verifique se ele está instalado e em execução.', 'error');
        });
    }

    /**
     * Envia o código ZPL para a impressora selecionada.
     * @param {string} zpl - O código ZPL a ser impresso.
     */
    function enviarParaImpressora(zpl) {
        if (!impressoraSelecionada) {
            Swal.fire('Impressora Indisponível', 'A impressora padrão não foi encontrada. A impressão não pode continuar.', 'error');
            return;
        }
        impressoraSelecionada.send(zpl,
            () => { console.log("Impressão enviada com sucesso."); },
            (error) => { console.error("Erro ao imprimir:", error); Swal.fire('Falha na Impressão', error, 'error'); }
        );
    }
    
    // ===================================================================
    // FUNÇÕES DE ETIQUETA MODIFICADAS
    // ===================================================================

    function gerarEtiqueta(sku) {
        const anuncio = produtos.find((p) => p.sku === sku);
        if (!anuncio) return;

        let xColunaEsquerda = 30;
        let xColunaDireita = 350;
        let etiquetasGeradas = 0;
        let linhasNecessarias = Math.ceil(anuncio.unidades / 2);

        const zplAndamento = [];

        for (let linha = 0; linha < linhasNecessarias; linha++) {
            zplAndamento.push("^XA^CI28");
            zplAndamento.push("^LH0,0");

            if (etiquetasGeradas < anuncio.unidades) {
                zplAndamento.push(`^FO${xColunaEsquerda},15^BY2,,0^BCN,54,N,N^FD${anuncio.id_ml}^FS`);
                zplAndamento.push(`^FO${xColunaEsquerda + 75},75^A0N,20,25^FH^FD${anuncio.id_ml}^FS`);
                zplAndamento.push(`^FO${xColunaEsquerda + 75},76^A0N,20,25^FH^FD${anuncio.id_ml}^FS`);
                zplAndamento.push(`^FO${xColunaEsquerda - 14},115^A0N,18,18^FB300,3,2,L^FH^FD${anuncio.nome}^FS`);
                zplAndamento.push(`^FO${xColunaEsquerda - 14},180^A0N,18,18^FH^FDSKU: ${anuncio.sku}^FS`);
                etiquetasGeradas++;
            }

            if (etiquetasGeradas < anuncio.unidades) {
                zplAndamento.push(`^FO${xColunaDireita},15^BY2,,0^BCN,54,N,N^FD${anuncio.id_ml}^FS`);
                zplAndamento.push(`^FO${xColunaDireita + 75},75^A0N,20,25^FH^FD${anuncio.id_ml}^FS`);
                zplAndamento.push(`^FO${xColunaDireita + 75},76^A0N,20,25^FH^FD${anuncio.id_ml}^FS`);
                zplAndamento.push(`^FO${xColunaDireita - 14},115^A0N,18,18^FB300,3,2,L^FH^FD${anuncio.nome}^FS`);
                zplAndamento.push(`^FO${xColunaDireita - 14},180^A0N,18,18^FH^FDSKU: ${anuncio.sku}^FS`);
                etiquetasGeradas++;
            }

            zplAndamento.push("^XZ");
        }

        const zplCompleto = zplAndamento.join('\n');
        console.log("Enviando ZPL da etiqueta para a impressora:", zplCompleto);
        
        // MODIFICADO: Em vez de baixar, envia para a impressora
        enviarParaImpressora(zplCompleto);
    }

    function gerarEtiquetaCaixa(caixa) {
        const headerBar = document.querySelector('.header-bar');
        const freteId = headerBar.dataset.idMl;
        const dataStr = caixa.startTime.toLocaleDateString('pt-BR');
        const horaIni = caixa.startTime.toLocaleTimeString('pt-BR', { hour12: false });
        const horaFim = caixa.endTime.toLocaleTimeString('pt-BR', { hour12: false });

        const linhas = [
            '^XA^CI28',
            '^LH0,0',
            `^FO30,30^BQN,2,15^FDLA,${freteId}^FS`,
            `^FO390,40^A0N,32,32^FDFrete: ${freteId}^FS`,
            `^FO390,90^A0N,32,32^FDData: ${dataStr}^FS`,
            `^FO390,140^A0N,32,32^FDInicio: ${horaIni}^FS`,
            `^FO390,190^A0N,32,32^FDTermino: ${horaFim}^FS`,
            '^FO620,225^GFA,0,4150,30,,::::::::::::::::::::::::::::::::::::::::::Y03KFE,W01OF8,V01JF800JFC,U01FFEM03FFC,U0FF8O01FF8,T07F8Q01FF,S03FCS01FC,S0FEU03F8,R07FW07E,R0F8W01F8,Q03EY07E,Q0F8Y01F8,P03EgG07C,P078gG01F,O01FP03IFO078,O03CO01KFN03C,O07CO07F807FCN0F,O0FF8M01F8I03F8M0F8,N03CFFM03EK0FEL07FC,N0781FEK03F8K01FCJ03F8E,N0F003FEI03FEM07FE007FE07,M01EI07FE03FFCN0LF0038,M03CJ0LF8N01JFI01C,M038K0IF87X0E,M07P0EI03F8R07,M0EO01CI0FFER07,L01CO038003F1FR038,L01CO07I07807CQ01C,L038O0E001E001ER0C,L03O01C003CI0FR0E,L07O0380078I038Q06,L06O03001EJ01CQ07,L0EO03003CK0FQ03,L0CO03C0F8K078P038,K01CO01FFEL03CP018,K018P07F8M0EP018,K018g07P01C,K038g03CP0C,K038g01EP0C,K03CgG0FP0C,K03FCg078N07E,K03FFCY01CM07FE,K031FFCY0EL07FFE,K0301FF8X07K03FF0E,K03001FFX03CI01FF80E,K03I01FCW01EI0FF800E,K03J03F8W0F003FCI0E,K03K0FEW0381FEJ0E,K03K01F8FCQ04001C7FK0E,K038K07IF7FO06I0FF8K0E,K038K01F87FFCN03I07CL0E,K038L0E03C1EN0180038K01E,K038L0E01807FN0E001CK01E,K03CL0E01007FCM07001CK01C,K03CL0EJ031EM03801CK01C,K03CL0EL07M01C01CK03C,K01EL06L03N0E01CK03C,K01EL07L038I03I07038K078,K01FL03FCJ018I018003FFL078,L0FL01FCJ018J0C001FEL0F8,L0F8L07CJ03FJ0E001F8K01F8,L0FCM0EJ03FCI070018L01F,L07CM06J031EI038038L03F,L07EM078K07I01C038L07E,L03FM03EEJ031800E0FM07E,L03F8L01FEJ038C007FEM0FC,L01FCM07FJ0187007FCL01FC,L01FEN07J0183803FM03F8,M0FFN03C700181C07N07F,M07F8M01FF00380E0FN0FF,M03FCN07F003007BEM03FE,M03FEO03807807FCM07FC,M01FF8N01C0FE0FFN0FF8,N0FFCO0KFEN03FF8,N07FFO07F87F8N07FF,N03FF8N01EQ01FFE,N01FFEgG03FFC,O0IF8g0IF8,O07FFEY03FFE,O03IF8W01IFC,P0IFEW07IF8,P07IFCU03IFE,P01JF8S01JFC,Q0KF8R0KF,Q03KF8P0KFE,R0LFCM01LF8,R03MFCI03MFE,S0YF,S01WFC,T07UFE,U0UF,V0SF8,W0QF,X03MFE,gG0IF8,,:::::::::::::::::::::::::::::::::::::::::^FS',
            '^FO30,380^GB750,2,2^FS',
            '^FO30,400^A0N,40,40^FDEtiqueta/UN^FS',
            `^FO600,400^A0N,40,40^FDCaixa: ${caixa.id}^FS`,
            '^FO30,450^GB750,2,2^FS'
        ];

        let y = 480;
        const step = 50;
        Object.entries(caixa.itens).forEach(([sku, qtd]) => {
            linhas.push(`^FO25,${y}^A0N,30,30^FD ${sku} / ${qtd}^FS`);
            y += step;
        });

        linhas.push('^XZ');
        const zpl = linhas.join('\n');
        
        console.log("Enviando ZPL da caixa para a impressora:", zpl);
        // MODIFICADO: Em vez de baixar, envia para a impressora
        enviarParaImpressora(zpl);
    }
    
    // O RESTANTE DO SEU CÓDIGO `embalar.js` PERMANECE IGUAL...
    // COLE AS FUNÇÕES `fecharCaixaAtiva`, `abrirNovaCaixa`, `biparEmbalagem`, etc., aqui.
    // A única alteração necessária foi nas duas funções acima.
    // ...
    // ...COLE O RESTANTE DO CÓDIGO AQUI...
    // ...

    // NO FINAL DO ARQUIVO, DENTRO DO EVENTO DOMContentLoaded, ADICIONE A INICIALIZAÇÃO DA IMPRESSORA
    
    // Inicialização
    setupImpressora(); // <<< NOVA LINHA
    inicializarPopoversDeImagem();
    await carregarCaixasSalvas();
    await buscarDadosEmbalagem(); 
    setInterval(buscarDadosEmbalagem, 10000); // Aumentei o intervalo para 10s para não sobrecarregar
    
    // ... (cole o restante do seu código, como a função handleFinalizarEmbalagem)
});