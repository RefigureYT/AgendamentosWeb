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
    $('#inp_mktp_pedido_hidden').val(marketplace);

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
    const mktp = $('#inp_mktp_filtro').val();
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

function syncFonteDadosUpload() {
    const $toggle = $('#toggle_fonte_dados');
    if (!$toggle.length) return;

    const usarDb = $toggle.is(':checked');
    $('#upload_fonte_dados').val(usarDb ? 'db' : 'tiny');

    // Layout NOVO (Tiny | Banco)
    const $lblTiny = $('#src_lbl_tiny');
    const $lblDb = $('#src_lbl_db');
    if ($lblTiny.length && $lblDb.length) {
        $lblTiny.toggleClass('active', !usarDb);
        $lblDb.toggleClass('active', usarDb);

        const $badge = $('#badge_recomendado_db');
        if ($badge.length) $badge.toggle(usarDb);

        const $help = $('#source_help');
        if ($help.length) {
            $help.text(
                usarDb
                    ? 'Mais rápido e evita chamadas ao Tiny. Se faltar algo, mude para Tiny.'
                    : 'Usa o Tiny como fonte. Pode ser mais lento, mas tende a trazer tudo completo.'
            );
        }
    }

    // Layout antigo (se existir em alguma tela)
    const $oldLabel = $('#toggle_fonte_dados_label');
    if ($oldLabel.length) $oldLabel.text(usarDb ? 'Banco de dados' : 'Tiny');

    const $oldBadge = $('#toggle_fonte_dados_badge');
    if ($oldBadge.length) $oldBadge.toggle(usarDb);
}

function resetFonteDadosUpload() {
    $('#toggle_fonte_dados').prop('checked', true);
    syncFonteDadosUpload();
}

$(document).on('change', '#toggle_fonte_dados', syncFonteDadosUpload);
$(document).ready(function () { syncFonteDadosUpload(); });

function abrirModalUpload() {
    const colaborador = $('#nome_colaborador').val();

    // ✅ sempre volta para "Banco de dados (RECOMENDADO)" ao abrir
    resetFonteDadosUpload();

    // Novo agendamento: zera id_bd e limpa info de atualização
    $('#upload_id_bd').val('');
    $('#info-atualizacao-pdf').hide().empty();

    // Helpers rápidos
    const pickFirst = (...sels) => {
        for (const s of sels) {
            const v = $(s).val();
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
    };

    // 1) Empresa
    let empresa = pickFirst('#nome_empresa', '#inp_nome_emp');
    if (!empresa) {
        const empFiltro = pickFirst('#inp_emp_pedido');
        if (empFiltro && /^\d+$/.test(empFiltro)) empresa = empFiltro;
    }

    // 2) Marketplace (suporta as 2 versões de id)
    let marketplace = pickFirst('#nome_marketplace', '#inp_mktp_pedido_hidden', '#inp_mktp_pedido');
    if (!marketplace) {
        const mktFiltro = pickFirst('#inp_mktp_filtro');
        if (mktFiltro && /^\d+$/.test(mktFiltro)) marketplace = mktFiltro;
    }

    // 3) Tipo
    const tipo = pickFirst('#nome_tipo');

    // 4) Centro (só ML)
    let centro = '';
    if (String(marketplace) === '1') {
        centro = pickFirst('#nome_centro_distribuicao', '#inp_centro_distribuicao');
    }
    $('#inp_centro_distribuicao').val(centro);

    // Hidden inputs do upload
    $('#upload_empresa').val(empresa);
    $('#upload_marketplace').val(marketplace);
    $('#upload_tipo').val(tipo);
    $('#upload_colaborador').val(colaborador);

    // Preenche pills (contexto)
    const EMP = { '1': 'Jaú Pesca', '2': 'Jaú Fishing', '3': 'L.T. Sports' };
    const MKTP = { '1': 'Mercado Livre', '2': 'Magalu', '3': 'Shopee', '4': 'Amazon' };
    const TIPO = { '1': 'Limpeza', '3': 'Conferência', '4': 'Embalar', '5': 'Expedição' };

    $('#ctx_empresa').html(`<i class="bi bi-building"></i> ${EMP[empresa] || '—'}`);
    $('#ctx_mktp').html(`<i class="bi bi-shop"></i> ${MKTP[marketplace] || '—'}`);
    $('#ctx_tipo').html(`<i class="bi bi-flag"></i> ${TIPO[tipo] || '—'}`);

    // Centro só aparece no ML (PDF)
    const isExcel = marketplace && marketplace !== '1';
    if (isExcel) {
        $('#ctx_centro').addClass('d-none');
    } else {
        $('#ctx_centro').removeClass('d-none')
            .html(`<i class="bi bi-geo-alt"></i> ${centro || '—'}`);
    }

    // Configura UI e form (PDF x Excel)
    const $form = $('#form_upload_pdf');
    const $file = $('#upload_file_input');
    const $btn = $('#upload_submit_btn');

    if (isExcel) {
        $form.attr('action', '/upload-excel');
        $file.attr({ name: 'file', accept: '.xlsx,.xls,.csv' });

        $('#modalUploadPdfLabel').text('Upload do Excel');
        $('#upload_subtitle').text('Envie o Excel do pedido para montar produtos e composição.');
        $('#upload_file_label').text('Arquivo Excel');
        $('#upload_file_hint').html('<i class="bi bi-info-circle"></i> Apenas <strong>.xlsx, .xls ou .csv</strong>.');
        $btn.text('Enviar Excel');
    } else {
        $form.attr('action', '/upload-pdf');
        $file.attr({ name: 'path', accept: 'application/pdf' });

        $('#modalUploadPdfLabel').text('Upload do PDF');
        $('#upload_subtitle').text('Envie o PDF do pedido para montar produtos e composição.');
        $('#upload_file_label').text('Arquivo PDF');
        $('#upload_file_hint').html('<i class="bi bi-info-circle"></i> Apenas <strong>.pdf</strong>.');
        $btn.text('Enviar PDF');
    }

    // Fecha modal anterior e abre o upload
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
        Swal.fire({
            icon: 'success',
            title: 'Excel processado!',
            text: 'O agendamento foi criado com sucesso.',
            confirmButtonText: 'OK'
        }).then(clearQS);
        return;
    }

    // usado quando o back-end redirecionar com ?upload=ok_excel_update
    if (upload === "ok_excel_update") {
        Swal.fire({
            icon: 'success',
            title: 'Excel atualizado!',
            text: 'O agendamento foi atualizado com sucesso.',
            confirmButtonText: 'OK'
        }).then(clearQS);
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
    // compat: algumas telas usam inp_mktp_pedido, outras inp_mktp_pedido_hidden
    $('#inp_mktp_pedido_hidden').val(idMktp);
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
    resetFonteDadosUpload();

    const form = document.getElementById('form_upload_pdf');
    const modalElement = document.getElementById('modalUploadPdf');
    const modal = new bootstrap.Modal(modalElement);

    const infoParaUsuario = document.getElementById('info-atualizacao-pdf');

    const fileInput = document.getElementById('upload_file_input') || form.querySelector('input[type="file"]');
    const submitButton = document.getElementById('upload_submit_btn') || form.querySelector('button[type="submit"]');

    // garante hidden id_bd
    let hiddenId = document.getElementById('upload_id_bd');
    if (!hiddenId) {
        hiddenId = document.createElement('input');
        hiddenId.type = 'hidden';
        hiddenId.name = 'id_bd';
        hiddenId.id = 'upload_id_bd';
        form.appendChild(hiddenId);
    }
    hiddenId.value = id_bd;

    // acha o card
    const botao = document.getElementById(`btn-modal--${id_bd}--`);
    const card = botao ? botao.closest('.agendamento-container') : null;

    const getClassValue = (prefix) => {
        if (!card) return '';
        const cls = Array.from(card.classList).find((c) => c.startsWith(prefix));
        return cls ? cls.replace(prefix, '') : '';
    };

    const empresa = getClassValue('emp-');
    const marketplace = getClassValue('id_mktp-');
    const tipo = getClassValue('tipo-');
    const centroDistribuicao = card?.dataset.centro || '';

    // hidden do upload
    document.getElementById('upload_empresa').value = empresa;
    document.getElementById('upload_marketplace').value = marketplace;
    document.getElementById('upload_tipo').value = tipo;

    const colaborador = card?.querySelector('.text-primary')?.innerText || '';
    document.getElementById('upload_colaborador').value = colaborador;

    // centro só ML
    document.getElementById('inp_centro_distribuicao').value =
        marketplace === '1' ? centroDistribuicao : '';

    // pills
    const EMP = { '1': 'Jaú Pesca', '2': 'Jaú Fishing', '3': 'L.T. Sports' };
    const MKTP = { '1': 'Mercado Livre', '2': 'Magalu', '3': 'Shopee', '4': 'Amazon' };
    const TIPO = { '1': 'Limpeza', '3': 'Conferência', '4': 'Embalar', '5': 'Expedição' };

    $('#ctx_empresa').html(`<i class="bi bi-building"></i> ${EMP[empresa] || '—'}`);
    $('#ctx_mktp').html(`<i class="bi bi-shop"></i> ${MKTP[marketplace] || '—'}`);
    $('#ctx_tipo').html(`<i class="bi bi-flag"></i> ${TIPO[tipo] || '—'}`);

    const isExcel = marketplace && marketplace !== '1';
    if (isExcel) $('#ctx_centro').addClass('d-none');
    else $('#ctx_centro').removeClass('d-none')
        .html(`<i class="bi bi-geo-alt"></i> ${centroDistribuicao || '—'}`);

    // info para usuário
    if (infoParaUsuario) {
        infoParaUsuario.style.display = 'block';
        infoParaUsuario.innerHTML = `Atualizando pedido <strong>${id_agend_ml || ''}</strong>.`;
    }

    // configura form + UI
    if (isExcel) {
        form.action = '/upload-excel';
        if (fileInput) {
            fileInput.name = 'file';
            fileInput.accept = '.xlsx,.xls,.csv';
        }
        $('#modalUploadPdfLabel').text('Atualizar Excel do Pedido');
        $('#upload_subtitle').text('Envie o Excel do pedido para atualizar produtos e composição.');
        $('#upload_file_label').text('Arquivo Excel');
        $('#upload_file_hint').html('<i class="bi bi-info-circle"></i> Apenas <strong>.xlsx, .xls ou .csv</strong>.');
        if (submitButton) submitButton.textContent = 'Atualizar Excel';
    } else {
        form.action = '/upload-pdf';
        if (fileInput) {
            fileInput.name = 'path';
            fileInput.accept = 'application/pdf';
        }
        $('#modalUploadPdfLabel').text('Atualizar PDF do Pedido');
        $('#upload_subtitle').text('Envie o PDF do pedido para atualizar produtos e composição.');
        $('#upload_file_label').text('Arquivo PDF');
        $('#upload_file_hint').html('<i class="bi bi-info-circle"></i> Apenas <strong>.pdf</strong>.');
        if (submitButton) submitButton.textContent = 'Atualizar PDF';
    }

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
    carregarInfoEmpresaModal(idAgend);
    // ---------- Helpers robustos ----------
    const toStr = v => (v === null || v === undefined) ? '' : String(v);
    const esc = s => toStr(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // XSS básico
    const slug = s => toStr(s).replace(/[^\w\-]+/g, '-'); // id html seguro
    const asInt = v => Number.isFinite(v) ? v : parseInt(v ?? 0, 10) || 0;
    const isZeroLike = v => v === null || v === undefined || v === '' || Number(v) === 0;

    const effStatus = (st, unused) => {
        const s = Number.isFinite(st) ? st : parseInt(st ?? 0, 10) || 0;
        if (s === 3 || s === 1 || s === 2) return s; // Erro / Em execução / Concluído preservam
        return unused ? 4 : 0;                        // senão, 0 (Pendente)
    };

    const hasRunStatus = (a, b) => [a, b].some(v => [1, 2, 3].includes(parseInt(v ?? 0, 10)));

    const isUnusedEquiv = (e) => {
        if (hasRunStatus(e.status_conf, e.status_exp)) return false;
        const noMoves = isZeroLike(e.qtd_mov_conf) && isZeroLike(e.qtd_mov_exp) && isZeroLike(e.bipados);
        const noLanc = !e.lanc_conf_s && !e.lanc_conf_e && !e.lanc_exp_s && !e.lanc_exp_e;
        return noMoves && noLanc;
    };

    const isUnusedComp = (c, pack, prod) => {
        const noMoves = isZeroLike(c.qtd_mov_conf) && isZeroLike(c.qtd_mov_exp);
        const noLanc = !c.lanc_conf_s && !c.lanc_conf_e && !c.lanc_exp_s && !c.lanc_exp_e;

        // NOVO: se houve bipagem no SKU da composição, não é "não usado"
        const bipComp = asInt(c?.bipados_diretos_comp);
        if (bipComp > 0) return false;

        // regra antiga (mantida): bipagem direta no SKU do ORIGINAL
        const bipSku = pack?.bipagemDireta?.sku;
        const bipQtd = asInt(pack?.bipagemDireta?.bipados);
        const skuComp = c?.sku_comp || '';
        const skuProd = prod?.sku_prod || '';
        const isOriginalSku = (skuComp && skuComp === skuProd) || (skuComp && bipSku && skuComp === bipSku);
        const usedByDirectBip = isOriginalSku && bipQtd > 0;

        return !usedByDirectBip && noMoves && noLanc;
    };

    const mascarar = (val) => {
        if (val === null || val === undefined || val === '') return '—';
        const s = String(val);
        return s.length > 6 ? `${s.slice(0, 3)}...${s.slice(-3)}` : s;
    };

    const statusMap = Object.freeze({
        0: 'Pendente',
        1: 'Em execução',
        2: 'Concluído',
        3: 'Erro',
        4: 'Ignorado'
    });
    const statusClassMap = Object.freeze({
        0: 'pendente',
        1: 'execucao',
        2: 'ok',
        3: 'erro',
        4: 'ignorado'
    });

    // ordem de severidade para agregação de status (maior prioridade primeiro)
    const SEVERITY = [3, 1, 0, 2, 4]; // Erro > Execução > Pendente > OK > Ignorado

    const aggStatus = (list) => {
        const set = new Set(list.filter(v => v !== null && v !== undefined));
        if (set.size === 0) return 0; // default "pendente" se não há info
        // se todos forem iguais, retorna o próprio
        if (set.size === 1) return [...set][0];
        // senão, aplica severidade
        for (const s of SEVERITY) if (set.has(s)) return s;
        return 0;
    };

    const badgeHTML = (st) => {
        const s = (st in statusMap) ? st : 0;
        const cls = statusClassMap[s] || 'pendente';
        const icon = s === 1 ? '<i class="bi bi-arrow-repeat spin"></i> ' :
            s === 3 ? '<i class="bi bi-exclamation-triangle-fill"></i> ' : '';
        return `<span class="badge badge-${cls}">${icon}${statusMap[s]}</span>`;
    };

    const chip = (label, val, statusRef) => {
        // statusRef é o status (conf ou exp) para definir classe 'erro' ou 'muted' quando nulo
        const isNull = (val === null || val === undefined || val === '');
        const cls = isNull ? (statusRef === 3 ? 'erro' : 'muted') : '';
        return `<span class="chip-lcto ${cls}">${esc(label)}: ${isNull ? '—' : mascarar(val)}</span>`;
    };

    const statusbarClass = (confAgg, expAgg) => {
        const worst = aggStatus([confAgg, expAgg]); // 3 > 1 > 0 > 2 > 4
        if (worst === 3) return 'statusbar--erro';
        if (worst === 1) return 'statusbar--exec';
        if (worst === 0) return 'statusbar--pendente';
        if (worst === 2) return 'statusbar--ok';
        if (worst === 4) return 'statusbar--muted'; // tudo ignorado
        return 'statusbar--muted';
    };

    const sumQtdMovConf = (comps, equivs, bipagemDireta) => {
        const a = (comps ?? []).reduce((s, c) => s + asInt(c.qtd_mov_conf), 0);
        const b = (equivs ?? []).reduce((s, e) => s + asInt(e.qtd_mov_conf), 0);
        const c = asInt(bipagemDireta?.bipados ?? 0);
        // regra prática: totals.bipados_total costuma existir e ser a verdade, mas se faltar, soma.
        return a + b + c;
    };

    const sumQtdMovSucesso = (comps, equivs) => {
        const conclComps = (comps ?? []).reduce((s, c) => s + (asInt(c.status_conf) === 2 ? asInt(c.qtd_mov_conf) : 0), 0);
        const conclEquivs = (equivs ?? []).reduce((s, e) => s + (asInt(e.status_conf) === 2 ? asInt(e.qtd_mov_conf) : 0), 0);
        return conclComps + conclEquivs;
    };

    // ---------- UI setup ----------
    // fecha o modal "olho" se aberto
    const modalOlho = document.getElementById('modalOlho');
    const instOlho = modalOlho ? bootstrap.Modal.getInstance(modalOlho) : null;
    if (instOlho) instOlho.hide();

    // abre o modal de transferências
    const modalTransf = new bootstrap.Modal(document.getElementById('modalTransferencias'));
    modalTransf.show();

    const pastasContainer = document.getElementsByClassName('transf-accordion')[0];
    if (!pastasContainer) return console.error('[verTransferenciasAgendamento] .transf-accordion não encontrado');

    // ---------- Fetch ----------
    let data;
    try {
        const r = await fetch(`/api/retirado/${idAgend}/produtos-detalhados`, { headers: { 'Accept': 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        data = await r.json();
    } catch (err) {
        console.error('Falha ao buscar dados:', err);
        pastasContainer.innerHTML = `<div class="alert alert-danger">Não foi possível carregar as transferências (id ${esc(idAgend)}).</div>`;
        return;
    }

    const itens = data?.produtosOriginais ?? [];
    console.log('Dados recebidos:', itens); // TODO remover SOMENTE DEBUG REMOVER DEPOIS
    if (!Array.isArray(itens) || itens.length === 0) {
        pastasContainer.innerHTML = `<div class="alert alert-warning">Nenhum item encontrado para este agendamento.</div>`;
        return;
    }

    // ---------- Render ----------
    const htmlCards = [];
    itens.forEach((pack, idx) => {
        const prod = pack.produto || {};
        const comps = Array.isArray(pack.composicoes) ? pack.composicoes : [];
        const equivs = Array.isArray(pack.equivalentes) ? pack.equivalentes : [];

        // Agregações: originais/equivalentes “não usados” => Ignorado (4)
        const compConfList = comps.map(c => effStatus(asInt(c.status_conf), isUnusedComp(c, pack, prod)));
        const compExpList = comps.map(c => effStatus(asInt(c.status_exp), isUnusedComp(c, pack, prod)));
        const equivConfList = equivs.map(e => effStatus(asInt(e.status_conf), isUnusedEquiv(e)));
        const equivExpList = equivs.map(e => effStatus(asInt(e.status_exp), isUnusedEquiv(e)));

        const confAgg = aggStatus([...compConfList, ...equivConfList]);
        const expAgg = aggStatus([...compExpList, ...equivExpList]);

        const cardCls = statusbarClass(confAgg, expAgg);

        // Listas de status efetivos por linha (ORIGINAL + EQUIVALENTE)
        const confEffList = [...compConfList, ...equivConfList];
        const expEffList = [...compExpList, ...equivExpList];

        // Cabeçalho: Qtd Agendada / Movida
        const qtdAgendada = asInt(prod.unidades_prod);

        // Soma apenas o que está CONCLUÍDO (status_conf === 2).
        // Bipagem direta só entra se o agregado de Conferência do card estiver Concluído.
        const qtdMovida = (() => {
            const base = sumQtdMovSucesso(comps, equivs);
            const bipSucesso = (confAgg === 2) ? asInt(pack?.bipagemDireta?.bipados) : 0;
            return base + bipSucesso;
        })();


        // ID/anchor seguro
        const anchorId = `equiv-${slug(prod.sku_prod || prod.id_prod || `item-${idx}`)}`;
        const ariaExpanded = (idx === 0) ? 'true' : 'false';
        const collapseCls = (idx === 0) ? 'collapse show' : 'collapse';

        // Tabela: linhas ORIGINAL (composições) + EQUIVALENTE (quando houver)
        const linhas = [];

        // Linhas de composições (ORIGINAL)
        for (const c of comps) {
            const stConfRaw = asInt(c.status_conf);
            const stExpRaw = asInt(c.status_exp);
            const effConf = effStatus(stConfRaw, isUnusedComp(c, pack, prod));
            const effExp = effStatus(stExpRaw, isUnusedComp(c, pack, prod));

            const lancs = [
                chip('S', c.lanc_conf_s, effConf),
                chip('E', c.lanc_conf_e, effConf),
                '<br>',
                chip('S', c.lanc_exp_s, effExp),
                chip('E', c.lanc_exp_e, effExp),
            ].join(' ');

            linhas.push(`
            <tr>
                <td><span class="badge badge-tipo-original">ORIGINAL</span></td>
                <td>${esc(c.sku_comp)}</td>
                <td>${esc(c.nome_comp)}</td>
                <td class="text-end">${asInt(c.qtd_mov_conf)}</td>
                <td>${badgeHTML(effConf)}</td>
                <td>${badgeHTML(effExp)}</td>
                <td class="d-none d-md-table-cell">${lancs}</td>
            </tr>
            `);
        }

        // Linhas de equivalentes (EQUIVALENTE)
        if (equivs.length > 0) {
            for (const e of equivs) {
                const stConfRaw = asInt(e.status_conf);
                const stExpRaw = asInt(e.status_exp);
                const effConf = effStatus(stConfRaw, isUnusedEquiv(e));
                const effExp = effStatus(stExpRaw, isUnusedEquiv(e));

                const lancs = [
                    chip('S', e.lanc_conf_s, effConf),
                    chip('E', e.lanc_conf_e, effConf),
                    '<br>',
                    chip('S', e.lanc_exp_s, effExp),
                    chip('E', e.lanc_exp_e, effExp),
                ].join(' ');

                linhas.push(`
                <tr>
                    <td><span class="badge badge-tipo-equivalente">EQUIVALENTE</span></td>
                    <td>${esc(e.sku_bipado)}</td>
                    <td>${esc(e.nome_equivalente ?? 'Equivalente')}</td>
                    <td class="text-end">${asInt(e.qtd_mov_conf)}</td>
                    <td>${badgeHTML(effConf)}</td>
                    <td>${badgeHTML(effExp)}</td>
                    <td class="d-none d-md-table-cell">${lancs}</td>
                </tr>
                `);
            }
        } else {
            // Informação quando não houve equivalente (mantém compatível com teu HTML de exemplo)
            linhas.push(`
        <tr class="row-informativo">
          <td><span class="badge badge-tipo-equivalente">EQUIVALENTE</span></td>
          <td>—</td>
          <td>Sem equivalente — movimentação feita com o ORIGINAL</td>
          <td class="text-end">—</td>
          <td><span class="badge badge-ignorado">Ignorado</span></td>
          <td><span class="badge badge-ignorado">Ignorado</span></td>
          <td class="d-none d-md-table-cell">
            <span class="chip-lcto muted">——</span> <span class="chip-lcto muted">——</span>
          </td>
        </tr>
      `);
        }

        // Mini-notes dinâmico (rico)
        const notes = [];

        // Diagnóstico de erros
        const confErrs = confEffList.filter(s => s === 3).length;
        const expErrs = expEffList.filter(s => s === 3).length;
        const hasErro = (confErrs + expErrs) > 0;
        if (hasErro) {
            notes.push(`<div class="error"><i class="bi bi-bug-fill"></i> Falhas detectadas: <strong>${confErrs}</strong> em Conferência e <strong>${expErrs}</strong> em Expedição.</div>`);
        }

        // Execução em curso
        const emExecOps = confEffList.filter(s => s === 1).length + expEffList.filter(s => s === 1).length;
        if (emExecOps > 0) {
            notes.push(`<div><i class="bi bi-arrow-repeat"></i> Worker em curso para <strong>${emExecOps}</strong> operação(ões).</div>`);
        }

        // Aguardando expedição (sem erro)
        if (!hasErro && confAgg === 2 && expAgg !== 2) {
            notes.push(`<div><i class="bi bi-clock-history"></i> Conferência concluída; aguardando expedição.</div>`);
        }

        // Equivalentes/Originais não utilizados
        const allEquivUnused = equivs.length > 0 && equivs.every(isUnusedEquiv);
        if (allEquivUnused) {
            notes.push(`<div><i class="bi bi-slash-circle"></i> Equivalentes não utilizados: marcados como <strong>Ignorados</strong>.</div>`);
        }
        const allCompUnused = comps.length > 0 && comps.every(c => isUnusedComp(c, pack, prod));
        if (allCompUnused) {
            notes.push(`<div><i class="bi bi-slash-circle"></i> Originais não utilizados neste envio.</div>`);
        }

        // Progresso (parcial ou concluído)
        if (!hasErro && qtdMovida > 0 && qtdMovida < qtdAgendada) {
            notes.push(`<div><i class="bi bi-bar-chart"></i> Parcial: movido <strong>${qtdMovida}</strong> de <strong>${qtdAgendada}</strong>.</div>`);
        }
        if (!hasErro && confAgg === 2 && expAgg === 2 && qtdMovida >= qtdAgendada) {
            notes.push(`<div><i class="bi bi-check2-circle"></i> Transferência concluída (<strong>${qtdAgendada}</strong>/<strong>${qtdAgendada}</strong>).</div>`);
        }

        // Bipagem direta (informativo)
        if (pack?.bipagemDireta?.bipados) {
            notes.push(`<div><i class="bi bi-upc-scan"></i> Bipagem direta do original: <strong>${asInt(pack.bipagemDireta.bipados)}</strong>.</div>`);
        }

        // Sem tentativas
        const noAttempts = confEffList.every(s => s === 0) && expEffList.every(s => s === 0) && qtdMovida === 0;
        if (noAttempts && !hasErro && emExecOps === 0) {
            notes.push(`<div><i class="bi bi-info-circle"></i> Sem tentativas registradas.</div>`);
        }

        const confBadge = badgeHTML(confAgg);
        const expBadge = badgeHTML(expAgg);

        // Cabeçalho de cada “pasta”
        htmlCards.push(`
    <div class="prod-card ${cardCls}" data-pack="${anchorId}">
        <button class="prod-header" data-bs-toggle="collapse" data-bs-target="#${anchorId}" aria-expanded="${ariaExpanded}">
        <div class="left">
            <span class="badge badge-tipo-original">ORIGINAL</span>
            <span class="sku">${esc(prod.sku_prod ?? '')}</span>
            <span class="nome">${esc(prod.nome_prod ?? '')}</span>
        </div>
        <div class="right" id="${anchorId}-right">
            <span class="pill"><span class="lbl">Qtd Agendada:</span> ${qtdAgendada}</span>
            <span class="pill"><span class="lbl">Qtd Movida:</span> ${qtdMovida}</span>
            <span class="pill"><span class="lbl">Conf.:</span> ${confBadge}</span>
            <span class="pill"><span class="lbl">Exp.:</span> ${expBadge}</span>
            <i class="chevron bi bi-chevron-down"></i>
        </div>
        </button>

        <div id="${anchorId}" class="${collapseCls}">
        <div class="equiv-body">
            <div class="table-responsive">
            <table class="table table-sm align-middle mb-2">
                <thead class="table-light">
                <tr>
                    <th style="width:120px;">Tipo</th>
                    <th style="width:120px;">SKU</th>
                    <th>Produto</th>
                    <th class="text-end" style="width:140px;">Qtd Movida</th>
                    <th style="width:150px;">Conf.</th>
                    <th style="width:150px;">Exp.</th>
                    <th class="d-none d-md-table-cell" style="width:200px;">Lançamentos</th>
                </tr>
                </thead>
                <tbody id="${anchorId}-tbody">
                ${linhas.join('\n')}
                </tbody>
            </table>
            </div>

            <div class="mini-notes${(confAgg === 3 || expAgg === 3) ? ' error' : ''}" id="${anchorId}-notes">
            ${notes.join('\n') || '<div class="text-muted"><i class="bi bi-info-circle"></i> Sem observações.</div>'}
            </div>
        </div>
        </div>
    </div>
    `);
    });

    pastasContainer.innerHTML = htmlCards.join('\n');

    // ===== Auto-refresh (2s) sem reabrir modal =====
    if (window.__transfTimer) {
        clearInterval(window.__transfTimer);
        window.__transfTimer = null;
    }

    const modalEl = document.getElementById('modalTransferencias');

    // função que calcula e atualiza só o necessário
    const doRefresh = async () => {
        try {
            const r = await fetch(`/api/retirado/${idAgend}/produtos-detalhados`, { headers: { 'Accept': 'application/json' } });
            if (!r.ok) return; // silencioso
            const fresh = await r.json();
            const packs = fresh?.produtosOriginais ?? [];

            // set de classes statusbar possíveis para troca
            const BAR_CLASSES = ['statusbar--erro', 'statusbar--exec', 'statusbar--pendente', 'statusbar--ok', 'statusbar--muted'];

            packs.forEach((pack, idx) => {
                const prod = pack.produto || {};
                const comps = Array.isArray(pack.composicoes) ? pack.composicoes : [];
                const equivs = Array.isArray(pack.equivalentes) ? pack.equivalentes : [];

                // === mesmo cálculo de antes ===
                const compConfList = comps.map(c => effStatus(asInt(c.status_conf), isUnusedComp(c, pack, prod)));
                const compExpList = comps.map(c => effStatus(asInt(c.status_exp), isUnusedComp(c, pack, prod)));
                const equivConfList = equivs.map(e => effStatus(asInt(e.status_conf), isUnusedEquiv(e)));
                const equivExpList = equivs.map(e => effStatus(asInt(e.status_exp), isUnusedEquiv(e)));

                const confAgg = aggStatus([...compConfList, ...equivConfList]);
                const expAgg = aggStatus([...compExpList, ...equivExpList]);
                const cardCls = statusbarClass(confAgg, expAgg);

                // Header counts/badges
                const qtdAgendada = asInt(prod.unidades_prod);
                const qtdMovida = (() => {
                    const conclComps = (comps ?? []).reduce((s, c) => s + (asInt(c.status_conf) === 2 ? asInt(c.qtd_mov_conf) : 0), 0);
                    const conclEquivs = (equivs ?? []).reduce((s, e) => s + (asInt(e.status_conf) === 2 ? asInt(e.qtd_mov_conf) : 0), 0);
                    const base = conclComps + conclEquivs;
                    const bipSucesso = (confAgg === 2) ? asInt(pack?.bipagemDireta?.bipados) : 0;
                    return base + bipSucesso;
                })();

                // Ids estáveis
                const anchorId = `equiv-${slug(prod.sku_prod || prod.id_prod || `item-${idx}`)}`;

                // Monta tbody novamente (troca só o conteúdo da tabela)
                const linhas = [];
                for (const c of comps) {
                    const stConf = effStatus(asInt(c.status_conf), isUnusedComp(c, pack, prod));
                    const stExp = effStatus(asInt(c.status_exp), isUnusedComp(c, pack, prod));

                    const lancs = [
                        chip('S', c.lanc_conf_s, stConf),
                        chip('E', c.lanc_conf_e, stConf),
                        '<br>',
                        chip('S', c.lanc_exp_s, stExp),
                        chip('E', c.lanc_exp_e, stExp),
                    ].join(' ');
                    linhas.push(`
          <tr>
            <td><span class="badge badge-tipo-original">ORIGINAL</span></td>
            <td>${esc(c.sku_comp)}</td>
            <td>${esc(c.nome_comp)}</td>
            <td class="text-end">${asInt(c.qtd_mov_conf)}</td>
            <td>${badgeHTML(stConf)}</td>
            <td>${badgeHTML(stExp)}</td>
            <td class="d-none d-md-table-cell">${lancs}</td>
          </tr>
        `);
                }
                if (equivs.length > 0) {
                    for (const e of equivs) {
                        const stConf = effStatus(asInt(e.status_conf), isUnusedEquiv(e));
                        const stExp = effStatus(asInt(e.status_exp), isUnusedEquiv(e));

                        const lancs = [
                            chip('S', e.lanc_conf_s, stConf),
                            chip('E', e.lanc_conf_e, stConf),
                            '<br>',
                            chip('S', e.lanc_exp_s, stExp),
                            chip('E', e.lanc_exp_e, stExp),
                        ].join(' ');
                        linhas.push(`
            <tr>
              <td><span class="badge badge-tipo-equivalente">EQUIVALENTE</span></td>
              <td>${esc(e.sku_bipado)}</td>
              <td>${esc(e.nome_equivalente ?? 'Equivalente')}</td>
              <td class="text-end">${asInt(e.qtd_mov_conf)}</td>
              <td>${badgeHTML(stConf)}</td>
              <td>${badgeHTML(stExp)}</td>
              <td class="d-none d-md-table-cell">${lancs}</td>
            </tr>
          `);
                    }
                } else {
                    linhas.push(`
          <tr class="row-informativo">
            <td><span class="badge badge-tipo-equivalente">EQUIVALENTE</span></td>
            <td>—</td>
            <td>Sem equivalente — movimentação feita com o ORIGINAL</td>
            <td class="text-end">—</td>
            <td><span class="badge badge-ignorado">Ignorado</span></td>
            <td><span class="badge badge-ignorado">Ignorado</span></td>
            <td class="d-none d-md-table-cell"><span class="chip-lcto muted">——</span> <span class="chip-lcto muted">——</span></td>
          </tr>
        `);
                }

                // Mini-notes (mesma regra rica)
                const confEffList = [...compConfList, ...equivConfList];
                const expEffList = [...compExpList, ...equivExpList];
                const confErrs = confEffList.filter(s => s === 3).length;
                const expErrs = expEffList.filter(s => s === 3).length;
                const hasErro = (confErrs + expErrs) > 0;
                const emExecOps = confEffList.filter(s => s === 1).length + expEffList.filter(s => s === 1).length;

                const notes = [];
                if (hasErro) notes.push(`<div class="error"><i class="bi bi-bug-fill"></i> Falhas detectadas: <strong>${confErrs}</strong> em Conferência e <strong>${expErrs}</strong> em Expedição.</div>`);
                if (emExecOps > 0) notes.push(`<div><i class="bi bi-arrow-repeat"></i> Worker em curso para <strong>${emExecOps}</strong> operação(ões).</div>`);
                if (!hasErro && confAgg === 2 && expAgg !== 2) notes.push(`<div><i class="bi bi-clock-history"></i> Conferência concluída; aguardando expedição.</div>`);
                if (equivs.length > 0 && equivs.every(isUnusedEquiv)) notes.push(`<div><i class="bi bi-slash-circle"></i> Equivalentes não utilizados: marcados como <strong>Ignorados</strong>.</div>`);
                if (comps.length > 0 && comps.every(c => isUnusedComp(c, pack, prod))) notes.push(`<div><i class="bi bi-slash-circle"></i> Originais não utilizados neste envio.</div>`);
                if (!hasErro && qtdMovida > 0 && qtdMovida < qtdAgendada) notes.push(`<div><i class="bi bi-bar-chart"></i> Parcial: movido <strong>${qtdMovida}</strong> de <strong>${qtdAgendada}</strong>.</div>`);
                if (!hasErro && confAgg === 2 && expAgg === 2 && qtdMovida >= qtdAgendada) notes.push(`<div><i class="bi bi-check2-circle"></i> Transferência concluída (<strong>${qtdAgendada}</strong>/<strong>${qtdAgendada}</strong>).</div>`);
                if (pack?.bipagemDireta?.bipados) notes.push(`<div><i class="bi bi-upc-scan"></i> Bipagem direta do original: <strong>${asInt(pack.bipagemDireta.bipados)}</strong>.</div>`);
                const noAttempts = confEffList.every(s => s === 0) && expEffList.every(s => s === 0) && qtdMovida === 0;
                if (noAttempts && !hasErro && emExecOps === 0) notes.push(`<div><i class="bi bi-info-circle"></i> Sem tentativas registradas.</div>`);

                // ===== Patch fino no DOM =====
                const card = document.querySelector(`.prod-card[data-pack="${anchorId}"]`);
                if (!card) {
                    // card novo (caso apareça durante o refresh): apenda no fim
                    const confBadge = badgeHTML(confAgg);
                    const expBadge = badgeHTML(expAgg);
                    const headerRight = `
          <span class="pill"><span class="lbl">Qtd Agendada:</span> ${qtdAgendada}</span>
          <span class="pill"><span class="lbl">Qtd Movida:</span> ${qtdMovida}</span>
          <span class="pill"><span class="lbl">Conf.:</span> ${confBadge}</span>
          <span class="pill"><span class="lbl">Exp.:</span> ${expBadge}</span>
          <i class="chevron bi bi-chevron-down"></i>`;
                    const html = `
          <div class="prod-card ${cardCls}" data-pack="${anchorId}">
            <button class="prod-header" data-bs-toggle="collapse" data-bs-target="#${anchorId}" aria-expanded="false">
              <div class="left">
                <span class="badge badge-tipo-original">ORIGINAL</span>
                <span class="sku">${esc(prod.sku_prod ?? '')}</span>
                <span class="nome">${esc(prod.nome_prod ?? '')}</span>
              </div>
              <div class="right" id="${anchorId}-right">${headerRight}</div>
            </button>
            <div id="${anchorId}" class="collapse">
              <div class="equiv-body">
                <div class="table-responsive">
                  <table class="table table-sm align-middle mb-2">
                    <thead class="table-light">...</thead>
                    <tbody id="${anchorId}-tbody">${linhas.join('\n')}</tbody>
                  </table>
                </div>
                <div class="mini-notes${(confAgg === 3 || expAgg === 3) ? ' error' : ''}" id="${anchorId}-notes">
                  ${notes.join('\n') || '<div class="text-muted"><i class="bi bi-info-circle"></i> Sem observações.</div>'}
                </div>
              </div>
            </div>
          </div>`;
                    pastasContainer.insertAdjacentHTML('beforeend', html);
                } else {
                    // 1) faixa de status (classe do card)
                    BAR_CLASSES.forEach(c => card.classList.remove(c));
                    card.classList.add(cardCls);

                    // 2) header right (pills + badges)
                    const confBadge = badgeHTML(confAgg);
                    const expBadge = badgeHTML(expAgg);
                    const headerRight = `
          <span class="pill"><span class="lbl">Qtd Agendada:</span> ${qtdAgendada}</span>
          <span class="pill"><span class="lbl">Qtd Movida:</span> ${qtdMovida}</span>
          <span class="pill"><span class="lbl">Conf.:</span> ${confBadge}</span>
          <span class="pill"><span class="lbl">Exp.:</span> ${expBadge}</span>
          <i class="chevron bi bi-chevron-down"></i>`;
                    const rightEl = document.getElementById(`${anchorId}-right`);
                    if (rightEl) rightEl.innerHTML = headerRight;

                    // 3) tbody (linhas)
                    const tbodyEl = document.getElementById(`${anchorId}-tbody`);
                    if (tbodyEl) tbodyEl.innerHTML = linhas.join('\n');

                    // 4) mini-notes (conteúdo + classe error)
                    const notesEl = document.getElementById(`${anchorId}-notes`);
                    if (notesEl) {
                        notesEl.classList.toggle('error', (confAgg === 3 || expAgg === 3));
                        notesEl.innerHTML = notes.join('\n') || '<div class="text-muted"><i class="bi bi-info-circle"></i> Sem observações.</div>';
                    }
                }
            });
        } catch (e) {
            // silencioso
            console.error('Deu erro, não sei aonde... Ta aí o erro ;-) =>', e);
        }
    };

    // liga o timer
    window.__transfTimer = setInterval(doRefresh, 2000);

    // desliga ao fechar o modal
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (window.__transfTimer) {
            clearInterval(window.__transfTimer);
            window.__transfTimer = null;
        }
    }, { once: true });
}

async function carregarInfoEmpresaModal(idAgend) {
    const a = await fetch(`/api/agendamento/${encodeURIComponent(idAgend)}/basico`);
    if (!a.ok) throw new Error(`HTTP ${a.status} ${a.statusText}`);

    const data = await a.json();

    const numAgend = document.getElementById('ag-num');
    const empresa = document.getElementById('ag-empresa');
    const mktp = document.getElementById('ag-marketplace');

    numAgend.innerHTML = data.numero_agendamento;
    empresa.innerHTML = data.empresa.nome;
    mktp.innerHTML = data.marketplace.nome;
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

(function () {
    function mapEmpresa(v) {
        return ({ "1": "Jaú Pesca", "2": "Jaú Fishing", "3": "L.T. Sports", "0": "Nenhuma" })[String(v)] || "—";
    }
    function mapMktp(v) {
        return ({ "1": "Mercado Livre", "2": "Magalu", "3": "Shopee", "4": "Amazon" })[String(v)] || "—";
    }
    function mapTipo(v) {
        return ({ "1": "Limpeza", "3": "Conferência", "4": "Embalar", "5": "Expedição", "2": "Finalizado" })[String(v)] || "—";
    }

    function updateFonteUI() {
        const toggle = document.getElementById("toggle_fonte_dados");
        const hidden = document.getElementById("upload_fonte_dados");
        const label = document.getElementById("toggle_fonte_dados_label");
        const badge = document.getElementById("toggle_fonte_dados_badge");
        const desc = document.getElementById("fonte_dados_desc");

        if (!toggle || !hidden || !label) return;

        const isDb = !!toggle.checked;
        hidden.value = isDb ? "db" : "tiny";
        label.textContent = isDb ? "Banco" : "Tiny";

        if (badge) badge.style.display = isDb ? "inline-block" : "none";

        if (desc) {
            desc.textContent = isDb
                ? "Mais rápido e evita chamadas ao Tiny. Se faltar algo, mude para Tiny."
                : "Usa o Tiny como fonte. Pode ser mais lento, mas tende a trazer tudo completo.";
        }
    }

    function updateResumoUI() {
        const emp = document.getElementById("upload_empresa")?.value;
        const mk = document.getElementById("upload_marketplace")?.value;
        const tp = document.getElementById("upload_tipo")?.value;
        const ce = document.getElementById("inp_centro_distribuicao")?.value;

        const rEmp = document.getElementById("resumo_empresa");
        const rMk = document.getElementById("resumo_marketplace");
        const rTp = document.getElementById("resumo_tipo");
        const rCe = document.getElementById("resumo_centro");

        if (rEmp) rEmp.textContent = mapEmpresa(emp);
        if (rMk) rMk.textContent = mapMktp(mk);
        if (rTp) rTp.textContent = mapTipo(tp);
        if (rCe) rCe.textContent = (ce && String(ce).trim()) ? String(ce).trim() : "—";
    }

    document.addEventListener("DOMContentLoaded", function () {
        const toggle = document.getElementById("toggle_fonte_dados");
        if (toggle) toggle.addEventListener("change", updateFonteUI);

        const modalEl = document.getElementById("modalUploadPdf");
        if (modalEl) {
            modalEl.addEventListener("show.bs.modal", function () {
                updateResumoUI();
                updateFonteUI();
            });
        }

        // inicializa caso a página já tenha o modal no DOM
        updateFonteUI();
    });
})();

(function () {
    function $(id) { return document.getElementById(id); }

    function updateFonteUI() {
        const toggle = $("toggle_fonte_dados");
        const hidden = $("upload_fonte_dados");
        const lblTiny = $("src_lbl_tiny");
        const lblDb = $("src_lbl_db");
        const badge = $("badge_recomendado_db");
        const help = $("source_help");

        if (!toggle || !hidden) return;

        const isDb = !!toggle.checked;
        hidden.value = isDb ? "db" : "tiny";

        if (lblTiny) lblTiny.classList.toggle("active", !isDb);
        if (lblDb) lblDb.classList.toggle("active", isDb);

        if (badge) badge.style.display = isDb ? "inline-block" : "none";

        if (help) {
            help.textContent = isDb
                ? "Muito rápido e evita chamadas ao Tiny. Se faltar algo, mude para Tiny."
                : "Usa o Tiny como fonte. Muito lento, porém atualizado.";
        }
    }

    document.addEventListener("change", function (e) {
        if (e.target && e.target.id === "toggle_fonte_dados") updateFonteUI();
    });

    document.addEventListener("DOMContentLoaded", updateFonteUI);
})();
