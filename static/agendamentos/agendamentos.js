// -----------------------------
// Helpers de Modal (globais)
// -----------------------------
function showModal(id) {
    new bootstrap.Modal(document.getElementById(id)).show();
}
function hideModal(id) {
    const instance = bootstrap.Modal.getInstance(document.getElementById(id));
    if (instance) instance.hide();
}

// #################################

// Ao clicar em “+ Novo Agendamento”
(() => {
    const btn = document.querySelector('.add-new-agendamento');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idFake = Math.floor(Math.random() * 100000);
        $('#inp_id_pedido').val(idFake);
        showModal('modalSelecionarEmpresa');
    });
})();

// Etapa 1: Empresa → chama Marketplace
function abrirModalMarketplace() {
    const empresa = $('#nome_empresa').val();
    if (!empresa) return alert("Selecione a empresa!");
    $('#inp_nome_emp').val(empresa);
    hideModal('modalSelecionarEmpresa');
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalSelecionarMarketplace')).show();
    }, 300);
}


// Etapa 2: Marketplace → chama Tipo (ou Centro no Meli)
function abrirModalAgendamento() {
    const marketplace = $('#nome_marketplace').val();

    if (!marketplace) return alert("Selecione o marketplace!");
    $('#inp_mktp_pedido').val(marketplace);

    if (marketplace !== '1') {
        $('#inp_centro_distribuicao').val(''); // evita centro “fantasma”
    }

    const modalMkt = bootstrap.Modal.getInstance(document.getElementById('modalSelecionarMarketplace'));
    if (modalMkt) modalMkt.hide();

    setTimeout(() => {
        if (marketplace === '1') {
            new bootstrap.Modal(document.getElementById('modalCentroDistribuicao')).show();
        } else {
            new bootstrap.Modal(document.getElementById('modalTipoAgendamento')).show();
        }
    }, 300);
}

function confirmarCentro() {
    const centro = $('#nome_centro_distribuicao').val();
    if (!centro) return alert("Selecione um centro!");
    $('#inp_centro_distribuicao').val(centro);

    const modalCentro = bootstrap.Modal.getInstance(document.getElementById('modalCentroDistribuicao'));
    if (modalCentro) modalCentro.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalTipoAgendamento')).show();
    }, 300);
}

// Etapa 3: Tipo → chama Colaborador
function abrirModalColaborador() {
    const tipo = $('#nome_tipo').val();
    if (!tipo) return alert("Selecione o tipo de agendamento!");
    $('#inp_tipo_pedido').val(tipo);

    const modalTipo = bootstrap.Modal.getInstance(document.getElementById('modalTipoAgendamento'));
    if (modalTipo) modalTipo.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalNomeColaborador')).show();
    }, 300);
}

// Continua agendamento já iniciado
function continuePhase(ele) {
    const [_, id, tipo] = ele.id.split('--');
    window.location.href = `/retirado?id=${id}&tipo=${tipo}&mudar=True`;
}
// function continuePhase(ele) {
//     const [_, id, tipo] = ele.id.split('--');

//     // se for modo Embalar (tipo 4), dispara o SweetAlert2 em loading
//     if (tipo === '4') {
//         Swal.fire({
//             title: 'Carregando',
//             html: 'Aguarde, preparando a tela de embalagem.',
//             allowOutsideClick: false,
//             allowEscapeKey: false,
//             didOpen: () => {
//                 Swal.showLoading();
//                 // redireciona imediatamente — o usuário continua vendo o modal até a página carregar
//                 window.location.href = `/retirado?id=${id}&tipo=${tipo}&mudar=True`;
//             }
//         });
//     } else {
//         // fluxo padrão para os outros tipos
//         window.location.href = `/retirado?id=${id}&tipo=${tipo}&mudar=True`;
//     }
// }

// Define ID do agendamento nos modais (caso use "Começar")
function changeIdAgendamento(element) {
    const [_, idAgend, tipo] = element.id.split('--');
    $('#inp_id_pedido').val(idAgend);
    $('#inp_tipo_pedido').val(tipo);

    // preserva textos dos modais (se existirem no DOM)
    const txt = `Agendamento nº${idAgend}`;
    const elEmp = document.getElementById('modal-emp-agend');
    const elCol = document.getElementById('modal-col-agend');
    if (elEmp) elEmp.textContent = txt;
    if (elCol) elCol.textContent = txt;
}

// Filtro visual da tabela de agendamentos (versão nova, sem helpers)
function setFiltros() {
    const cards = document.querySelectorAll('.agendamento-container');

    // limpa qualquer filtro anterior
    cards.forEach(card => card.classList.remove('hidden-class'));

    const emp = $('#inp_emp_pedido').val();
    const status = $('#inp_status_pedido').val();
    const mktp = $('#inp_mktp_pedido').val();
    const num = ($('#inp_num_pedido').val() || '').trim();

    cards.forEach(card => {
        const classes = card.classList;

        // só filtra quem tem metadados de classe esperados
        const isFilterable = [...classes].some(c =>
            c.startsWith('emp-') || c.startsWith('tipo-') || c.startsWith('id_mktp-') || c.startsWith('id-')
        );
        if (!isFilterable) return; // ignora placeholders

        if (emp !== 'Todas' && !classes.contains(`emp-${emp}`)) {
            return card.classList.add('hidden-class');
        }
        if (status !== 'Todos' && !classes.contains(`tipo-${status}`)) {
            return card.classList.add('hidden-class');
        }
        if (mktp !== 'Todas' && !classes.contains(`id_mktp-${mktp}`)) {
            return card.classList.add('hidden-class');
        }
        if (num) {
            const textoPedido = card.querySelector('.pedido-numero')?.textContent.trim() || '';
            if (!textoPedido.includes(num)) {
                return card.classList.add('hidden-class');
            }
        }
    });
}

// Upload (PDF/Excel)
function abrirModalUpload() {
    const colaborador = $('#nome_colaborador').val();

    // lê do <select> com fallback para os hiddens (fluxo por botões)
    const empresa = $('#nome_empresa').val() || $('#inp_nome_emp').val();
    const marketplace = $('#nome_marketplace').val() || $('#inp_mktp_pedido').val();
    const tipo = $('#nome_tipo').val() || $('#inp_tipo_pedido').val();

    // só grava centro se for Meli; caso contrário, zera
    const centro = (String(marketplace) === '1') ? ($('#nome_centro_distribuicao').val() || '') : '';
    $('#inp_centro_distribuicao').val(centro);

    const form = $('#form_upload_pdf');
    const fileInput = form.find('input[type="file"]');
    const btn = form.find('button[type="submit"]');
    const label = $('#modalUploadPdfLabel');
    const helpText = $('#upload_help_text');

    if (marketplace === '2' || marketplace === '3') {
        form.attr('action', '/upload-excel');
        fileInput.attr({ name: 'file', accept: '.xlsx,.xls,.csv' });
        btn.text('Enviar Excel');
        label.text('Upload do Excel');
        helpText.text('Selecione o arquivo Excel (.xlsx) do pedido:');
    } else {
        form.attr('action', '/upload-pdf');
        fileInput.attr({ name: 'path', accept: 'application/pdf' });
        btn.text('Enviar PDF');
        label.text('Upload do PDF');
        helpText.text('Selecione o arquivo PDF do pedido:');
    }

    $('#upload_colaborador').val(colaborador);
    $('#upload_empresa').val(empresa);
    $('#upload_marketplace').val(marketplace);
    $('#upload_tipo').val(tipo);

    const modalTipo = bootstrap.Modal.getInstance(document.getElementById('modalTipoAgendamento'));
    if (modalTipo) modalTipo.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalUploadPdf')).show();
    }, 300);
}


// Loader no submit do upload (com guard)
(() => {
    const form = document.getElementById("form_upload_pdf");
    if (!form) return;
    form.addEventListener("submit", function (e) {
        const fileInput = this.querySelector('input[type="file"]');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            // sem arquivo: deixe o browser validar/avisar; não abre o loader
            return;
        }
        const isExcel = this.action.includes("/upload-excel");
        Swal.fire({
            title: isExcel ? "Enviando Excel..." : "Enviando PDF...",
            text: "Aguarde o processamento.",
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => { Swal.showLoading(); },
        });
    });
})();


// Pós-redirect (mensagens)
window.addEventListener("load", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const upload = urlParams.get("upload");
    const erro = urlParams.get("erro");
    const pedido = urlParams.get("pedido");

    if (Swal.isVisible()) Swal.close();

    const clearQS = () => window.history.replaceState({}, document.title, window.location.pathname);

    if (upload === "ok_excel") {
        Swal.fire({ icon: 'success', title: 'Excel processado!', text: 'O agendamento foi criado com sucesso.', confirmButtonText: 'OK' })
            .then(clearQS);
        return;
    }
    if (upload === "ok_pdf") {
        Swal.fire({ icon: 'success', title: 'PDF processado!', text: 'O agendamento foi criado com sucesso.', confirmButtonText: 'OK' })
            .then(clearQS);
        return;
    }
    if (urlParams.get("alterado") === "ok") {
        Swal.fire({ icon: 'success', title: 'Alterações salvas!', text: 'O agendamento foi atualizado com sucesso.', confirmButtonText: 'OK' })
            .then(clearQS);
        return;
    }
    if (upload === "fail" && erro === "duplicado") {
        Swal.fire({ icon: 'warning', title: 'Pedido já existente', text: `Já existe um agendamento com o número ${pedido}.`, confirmButtonText: 'OK' })
            .then(clearQS);
        return;
    }
    if (upload === "fail") {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Ocorreu um erro ao processar o pedido. Por favor, tente novamente.', confirmButtonText: 'OK' })
            .then(clearQS);
        return;
    }
});

// -----------------------------
// Seleção rápida (compatibilidade)
// -----------------------------
function setMarketplace(idMktp) {
    $('#inp_mktp_pedido').val(idMktp);
    if (String(idMktp) !== '1') {
        $('#inp_centro_distribuicao').val('');
    }
    hideModal('modalSelecionarMarketplace');
    setTimeout(() => {
        if (String(idMktp) === '1') {
            showModal('modalCentroDistribuicao');
        } else {
            showModal('modalTipoAgendamento');
        }
    }, 300);
}

function setTipoAgendamento(idTipo) {
    $('#inp_tipo_pedido').val(idTipo);
    hideModal('modalTipoAgendamento');
    setTimeout(() => showModal('modalNomeColaborador'), 300);
}

// -----------------------------
// Modais diversos
// -----------------------------
function abrirModalAlteracoes(id) {
    const modal = new bootstrap.Modal(document.getElementById('modalEditarAgendamento'));
    const content = $('#editarAgendamentoContent');
    content.html('<p>Carregando...</p>');
    $.get(`/alterar-agendamento?id=${id}&modal=true`, function (data) {
        content.html(data);
        modal.show();
    }).fail(() => {
        content.html('<div class="alert alert-danger">Erro ao carregar o conteúdo.</div>');
    });
}

function abrirModalAtualizarPDF(id_bd, id_agend_ml) {
    const form = document.getElementById('form_upload_pdf');
    const modal = new bootstrap.Modal(document.getElementById('modalUploadPdf'));
    const modalLabel = document.getElementById('modalUploadPdfLabel');
    const infoParaUsuario = document.getElementById('info-atualizacao-pdf');

    form.action = '/upload-pdf';
    if (!document.getElementById('upload_id_bd')) {
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'id_bd';
        hiddenInput.id = 'upload_id_bd';
        form.appendChild(hiddenInput);
    }
    document.getElementById('upload_id_bd').value = id_bd;

    const botao = document.getElementById(`btn-modal--${id_bd}--`);
    const card = botao.closest('.agendamento-container');

    const getClassValue = (prefix) => {
        const cls = [...card.classList].find(c => c.startsWith(prefix));
        return cls ? cls.replace(prefix, '') : '';
    };

    const centroDistribuicao = card.dataset.centro || '';

    document.getElementById('upload_colaborador').value = card.querySelector('.text-primary')?.innerText || '';
    document.getElementById('upload_empresa').value = getClassValue('emp-');
    document.getElementById('upload_marketplace').value = getClassValue('id_mktp-');
    document.getElementById('upload_tipo').value = getClassValue('tipo-');
    document.getElementById('inp_centro_distribuicao').value = centroDistribuicao;

    modalLabel.textContent = 'Atualizar PDF do Pedido';
    infoParaUsuario.innerHTML = `Atualizando o agendamento do pedido: <strong>${id_agend_ml}</strong>`;
    infoParaUsuario.style.display = 'block';

    modal.show();
}

function iniciarExclusao(idAgendamento) {
    Swal.fire({
        title: 'Você tem certeza?',
        text: "Esta ação não pode ser revertida! Todos os produtos e dados associados a este agendamento serão permanentemente excluídos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (!result.isConfirmed) return;

        Swal.fire({
            title: 'Excluindo...',
            text: 'Por favor, aguarde.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        fetch(`/agendamento/excluir/${idAgendamento}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    Swal.fire('Excluído!', 'O agendamento foi excluído com sucesso.', 'success');
                    const card = document.querySelector(`.agendamento-container.id-${idAgendamento}`);
                    if (card) {
                        card.style.transition = 'opacity 0.5s ease';
                        card.style.opacity = '0';
                        setTimeout(() => { card.remove(); location.reload(); }, 300);
                    } else {
                        location.reload();
                    }
                } else {
                    Swal.fire('Erro!', 'Não foi possível excluir o agendamento. ' + (data.message || ''), 'error');
                }
            })
            .catch(() => Swal.fire('Erro de Rede!', 'Não foi possível se comunicar com o servidor.', 'error'));
    });
}


function abrirModalRelatorio(idAgendamentoML) {
    const modalElement = document.getElementById('modalVerRelatorio');
    const modal = new bootstrap.Modal(modalElement);
    const conteudoDiv = document.getElementById('conteudo-relatorio');

    conteudoDiv.innerHTML = `
    <div class="d-flex justify-content-center align-items-center">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span class="ms-3">Carregando relatório...</span>
    </div>`;
    modal.show();

    fetch(`/relatorio/${idAgendamentoML}`)
        .then(response => {
            if (!response.ok) throw new Error('Erro de rede ao buscar o relatório.');
            return response.text();
        })
        .then(html => { conteudoDiv.innerHTML = html; })
        .catch(() => {
            conteudoDiv.innerHTML = '<div class="alert alert-danger">Não foi possível carregar o relatório. Tente novamente mais tarde.</div>';
        });
}

// =============== OLHO: modal com opções ===============
function abrirModalOlho(idBd, idTipo) {
    const modalEl = document.getElementById('modalOlho');
    modalEl.dataset.id = idBd;
    modalEl.dataset.tipo = idTipo;
    document.getElementById('olho_id_text').textContent = idBd;
    new bootstrap.Modal(modalEl).show();
}

// Botão: Entrar para visualizar (somente leitura)
(() => {
    const btn = document.getElementById('btnOlhoVisualizar');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const modalEl = document.getElementById('modalOlho');
        const id = modalEl.dataset.id;
        const tipo = modalEl.dataset.tipo;
        // fecha o modal e vai para a tela em modo "visualizar"
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) inst.hide();
        window.location.href = `/retirado?id=${id}&tipo=${tipo}&mudar=False`;
    });
})();

// Botão: Ver transferências entre depósitos
(() => {
    const btn = document.getElementById('btnOlhoTransferencias');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const modalOlho = document.getElementById('modalOlho');
        const id = modalOlho.dataset.id;
        const inst = bootstrap.Modal.getInstance(modalOlho);
        if (inst) inst.hide();
        await verTransferenciasAgendamento(id);
    });
})();

async function verTransferenciasAgendamento(idAgend) {
    const modalEl = document.getElementById('modalTransferencias');
    const body = document.getElementById('conteudo-transferencias');
    body.innerHTML = `
    <div class="d-flex justify-content-center align-items-center p-4">
      <div class="spinner-border" role="status"><span class="visually-hidden">Carregando...</span></div>
      <span class="ms-3">Carregando transferências...</span>
    </div>`;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    try {
        const resp = await fetch(`/api/retirado/${idAgend}/originais-equivalentes`, { credentials: 'include' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const dados = await resp.json();
        console.log(dados);

        const linhas = [];
        const add = (item, tipo) => {
            const sku = item.sku ?? item.sku_bipado ?? item.sku_comp ?? '';
            const nome = item.nome ?? item.nome_equivalente ?? item.nome_original ?? item.nome_comp ?? '';
            const qtd = item.qtd_mov_conf ?? item.qtd ?? item.qtd_conf ?? '';
            const saida = item.lanc_conf_s ?? '';
            const entrada = item.lanc_conf_e ?? '';
            linhas.push(`
        <tr>
          <td>${tipo}</td>
          <td>${sku}</td>
          <td>${nome}</td>
          <td class="text-end">${qtd || '-'}</td>
          <td>${saida || '-'}</td>
          <td>${entrada || '-'}</td>
        </tr>`);
        };

        (dados.originais || []).forEach(o => add(o, 'Original'));
        (dados.equivalentes || []).forEach(e => add(e, 'Equivalente'));

        body.innerHTML = `
      <div class="mb-2 small text-muted">Agendamento: <strong>${idAgend}</strong></div>
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead>
            <tr>
              <th style="min-width:110px">Tipo</th>
              <th>SKU</th>
              <th>Produto</th>
              <th class="text-end">Qtd mov.</th>
              <th>Saída (idLanc)</th>
              <th>Entrada (idLanc)</th>
            </tr>
          </thead>
          <tbody>${linhas.join('')}</tbody>
        </table>
      </div>
      <div class="small text-muted">
        Os códigos “idLanc” são os lançamentos retornados pelo Tiny. “-” indica que ainda não houve movimentação registrada.
      </div>`;
    } catch (err) {
        console.error(err);
        body.innerHTML = `
      <div class="alert alert-danger">
        Não foi possível carregar as transferências deste agendamento.
      </div>`;
    }
}


// Modo dev: ?devModal=olho  | ?devModal=transf | ?devModal=olho,transf
(function () {
    const params = new URLSearchParams(location.search);
    const raw = params.get('devModal');
    if (!raw) return;

    const map = {
        olho: 'modalOlho',
        transf: 'modalTransferencias',
        transferencias: 'modalTransferencias'
    };

    raw.split(',').map(s => s.trim().toLowerCase()).forEach(key => {
        const idModal = map[key] || key; // também aceita o próprio id
        const el = document.getElementById(idModal);
        if (!el) return;

        const modal = new bootstrap.Modal(el, { backdrop: 'static', keyboard: false });
        el.addEventListener('hide.bs.modal', (e) => e.preventDefault()); // não deixa fechar
        modal.show();
    });
})();
