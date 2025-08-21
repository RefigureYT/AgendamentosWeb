function abrirModalMarketplace() {
    const modalEmpresa = bootstrap.Modal.getInstance(document.getElementById('modalSelecionarEmpresa'));
    modalEmpresa.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalSelecionarMarketplace')).show();
    }, 400);
}

function setMarketplace(idMktp) {
    $('#inp_mktp_pedido').val(idMktp);

    const modalMktp = bootstrap.Modal.getInstance(document.getElementById('modalSelecionarMarketplace'));
    modalMktp.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalTipoAgendamento')).show();
    }, 400);
}

function setTipoAgendamento(idTipo) {
    $('#inp_tipo_pedido').val(idTipo);

    const modalTipo = bootstrap.Modal.getInstance(document.getElementById('modalTipoAgendamento'));
    modalTipo.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalNomeColaborador')).show();
    }, 400);
}

function changeIdAgendamento(element) {
    let id_agend = element.id.split('--')
    $('#inp_id_pedido').val(id_agend[1])
    $('#inp_tipo_pedido').val(id_agend[2])
    $('#modal-emp-agend').text("Agendamento nº" + id_agend[1])
    $('#modal-col-agend').text("Agendamento nº" + id_agend[1])
}


function setFiltros() {
    let obj_array = Object.values($('.agendamento-container'))
    obj_array.pop()
    obj_array.pop()

    // limpa qualquer filtro anterior
    obj_array.forEach((x) => {
        if (x.classList.contains('hidden-class')) {
            x.classList.remove('hidden-class');
        }
    })

    let filtros = {
        "inp_emp": $('#inp_emp_pedido').find(':selected').val(),
        "inp_status": $('#inp_status_pedido').find(':selected').val(),
        "inp_mktp": $('#inp_mktp_pedido').find(':selected').val(),
        "inp_num": $('#inp_num_pedido').val()
    }

    let valores = Object.values(filtros)

    // === Atenção ao índice aqui: primeiro emp, status, depois mktp e, por fim, número ===
    let valor_emp = filtrarEmp(valores[0]);
    let valor_sta = filtrarStatus(valores[1]);
    let valor_mktp = filtrarMktp(valores[2]);
    let valor_num = filtrarNum(valores[3]);

    obj_array.forEach(x => {
        let classArr = x.classList;
        if (valor_emp != null && !classArr.contains(valor_emp)) {
            x.classList.add('hidden-class');
        }
        else if (valor_sta != null && !classArr.contains(valor_sta)) {
            x.classList.add('hidden-class');
        }
        else if (valor_mktp != null && !classArr.contains(valor_mktp)) {
            x.classList.add('hidden-class');
        }
        else if (valor_num != null && !classArr.contains(valor_num)) {
            x.classList.add('hidden-class');
        }
    });
}

function filtrarEmp(id_empresa) {
    if (id_empresa != 'Todas') {
        return "emp-" + id_empresa;
    } else {
        return null;
    }
}

function filtrarStatus(status_agend) {
    if (status_agend != 'Todos') {
        return "tipo-" + status_agend;
    } else {
        return null;
    }
}

function filtrarMktp(id_mktp) {
    if (id_mktp != 'Todas') {
        return "id_mktp-" + id_mktp;
    } else {
        return null;
    }
}

function filtrarNum(num_agend) {
    if (num_agend != '') {
        return "id-" + num_agend;
    } else {
        return null;
    }
}

// Ao clicar em “+ Novo Agendamento”
document.querySelector('.add-new-agendamento').addEventListener('click', function (e) {
    e.preventDefault();

    const idFake = Math.floor(Math.random() * 100000); // ID temporário ou real
    $('#inp_id_pedido').val(idFake);

    new bootstrap.Modal(document.getElementById('modalSelecionarEmpresa')).show();
});

// Etapa 1: Empresa → chama Marketplace
function abrirModalMarketplace() {
    const empresa = $('#nome_empresa').val();
    if (!empresa) return alert("Selecione a empresa!");

    $('#inp_nome_emp').val(empresa);

    bootstrap.Modal.getInstance(document.getElementById('modalSelecionarEmpresa')).hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalSelecionarMarketplace')).show();
    }, 400);
}

// Etapa 2: Marketplace → chama Tipo
function abrirModalAgendamento() {
    const marketplace = $('#nome_marketplace').val();
    if (!marketplace) return alert("Selecione o marketplace!");

    // armazena no hidden do formulário
    $('#inp_mktp_pedido').val(marketplace);

    // se for Mercado Livre (valor “1”), mostra antes o modal de centro
    if (marketplace === '1') {
        bootstrap.Modal.getInstance(document.getElementById('modalSelecionarMarketplace')).hide();
        setTimeout(() => new bootstrap.Modal(document.getElementById('modalCentroDistribuicao')).show(), 300);
    } else {
        // fluxo normal para os outros marketplaces
        bootstrap.Modal.getInstance(document.getElementById('modalSelecionarMarketplace')).hide();
        setTimeout(() => new bootstrap.Modal(document.getElementById('modalTipoAgendamento')).show(), 300);
    }
}

function confirmarCentro() {
    const centro = $('#nome_centro_distribuicao').val();
    if (!centro) return alert("Selecione um centro!");

    $('#inp_centro_distribuicao').val(centro);

    // fecha e segue para o modal de tipo
    bootstrap.Modal.getInstance(document.getElementById('modalCentroDistribuicao')).hide();
    setTimeout(() => new bootstrap.Modal(document.getElementById('modalTipoAgendamento')).show(), 300);
}

// Etapa 3: Tipo → chama Colaborador
function abrirModalColaborador() {
    const tipo = $('#nome_tipo').val();
    if (!tipo) return alert("Selecione o tipo de agendamento!");

    $('#inp_tipo_pedido').val(tipo);

    bootstrap.Modal.getInstance(document.getElementById('modalTipoAgendamento')).hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalNomeColaborador')).show();
    }, 400);
}

// Continua agendamento já iniciado
function continuePhase(ele) {
    const [_, id, tipo] = ele.id.split('--');

    // fluxo padrão para os outros tipos
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
    let [_, idAgend, tipo] = element.id.split('--');
    $('#inp_id_pedido').val(idAgend);
    $('#inp_tipo_pedido').val(tipo);
}

// Filtro visual da tabela de agendamentos
function setFiltros() {
    document.querySelectorAll('.agendamento-container').forEach(card => {
        card.classList.remove('hidden-class');
    });

    const emp = $('#inp_emp_pedido').val();
    const status = $('#inp_status_pedido').val();
    const mktp = $('#inp_mktp_pedido').val();
    const num = $('#inp_num_pedido').val().trim();

    document.querySelectorAll('.agendamento-container').forEach(card => {
        const classes = card.classList;

        if (emp !== 'Todas' && !classes.contains(`emp-${emp}`)) {
            return card.classList.add('hidden-class');
        }
        if (status !== 'Todos' && !classes.contains(`tipo-${status}`)) {
            return card.classList.add('hidden-class');
        }
        if (mktp !== 'Todas' && !classes.contains(`id_mktp-${mktp}`)) {
            return card.classList.add('hidden-class');
        }

        // novo: filtra pelo texto do span.pedido-numero
        if (num) {
            const textoPedido = card.querySelector('.pedido-numero')?.textContent.trim() || '';
            if (!textoPedido.includes(num)) {
                return card.classList.add('hidden-class');
            }
        }
    });
}

function abrirModalUpload() {
    // 1) valores já gravados nos hidden inputs e no campo colaborador
    const colaborador = $('#nome_colaborador').val();
    const empresa = $('#nome_empresa').val();
    const marketplace = $('#nome_marketplace').val();
    const tipo = $('#nome_tipo').val();

    // 2) seleciona form, file input e botões de upload
    const form = $('#form_upload_pdf');
    const fileInput = form.find('input[type="file"]');
    const btn = form.find('button[type="submit"]');
    const label = $('#modalUploadPdfLabel');
    const helpText = $('#upload_help_text');

    // 3) escolhe rota/upload de Excel vs PDF
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

    // 4) preenche os hidden inputs do form
    $('#upload_colaborador').val(colaborador);
    $('#upload_empresa').val(empresa);
    $('#upload_marketplace').val(marketplace);
    $('#upload_tipo').val(tipo);

    // 5) fecha o modal de Tipo de Agendamento e abre o modal de Upload
    bootstrap.Modal
        .getInstance(document.getElementById('modalTipoAgendamento'))
        .hide();

    setTimeout(() => {
        new bootstrap.Modal(
            document.getElementById('modalUploadPdf')
        ).show();
    }, 300);
}


document
    .getElementById("form_upload_pdf")
    .addEventListener("submit", function (e) {
        // this é o <form>
        const form = this;
        // detecta se é upload de Excel pela action do form
        const isExcel = form.action.includes("/upload-excel");
        // ou, alternativamente, pelo accept do file input:
        // const fileInput = form.querySelector('input[type="file"]');
        // const isExcel = fileInput.accept.includes(".xlsx");

        Swal.fire({
            title: isExcel ? "Enviando CSV..." : "Enviando PDF...",
            text: "Aguarde o processamento.",
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => {
                Swal.showLoading();
            },
        });
    });

window.addEventListener("load", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const upload = urlParams.get("upload");
    const erro = urlParams.get("erro");
    const pedido = urlParams.get("pedido");

    // 0) Se ainda estiver mostrando o "Enviando PDF...", fecha
    if (Swal.isVisible()) {
        Swal.close();
    }

    // 1) Excel OK
    if (upload === "ok_excel") {
        Swal.fire({
            icon: 'success',
            title: 'Excel processado!',
            text: 'O agendamento foi criado com sucesso.',
            confirmButtonText: 'OK'
        }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
        });
        return;
    }

    // 2) PDF OK
    if (upload === "ok_pdf") {
        Swal.fire({
            icon: 'success',
            title: 'PDF processado!',
            text: 'O agendamento foi criado com sucesso.',
            confirmButtonText: 'OK'
        }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
        });
        return;
    }

    // 3) Alteração OK
    if (urlParams.get("alterado") === "ok") {
        Swal.fire({
            icon: 'success',
            title: 'Alterações salvas!',
            text: 'O agendamento foi atualizado com sucesso.',
            confirmButtonText: 'OK'
        }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
        });
        return;
    }

    // 4) Duplicado
    if (upload === "fail" && erro === "duplicado") {
        Swal.fire({
            icon: 'warning',
            title: 'Pedido já existente',
            text: `Já existe um agendamento com o número ${pedido}.`,
            confirmButtonText: 'OK'
        }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
        });
        return;
    }

    // 5) Qualquer outro erro de upload
    if (upload === "fail") {
        Swal.fire({
            icon: 'error',
            title: 'Erro',
            text: 'Ocorreu um erro ao processar o pedido. Por favor, tente novamente.',
            confirmButtonText: 'OK'
        }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
        });
        return;
    }
});



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
    // --- Início da Depuração ---
    console.clear(); // Limpa o console para facilitar a leitura
    console.log(`--- Iniciando Modal de Atualização para ID BD: ${id_bd} ---`);
    // --- Fim da Depuração ---

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

    // --- Início da Depuração ---
    console.log("Elemento do Card encontrado:", card);
    // --- Fim da Depuração ---

    const getClassValue = (prefix) => {
        const cls = [...card.classList].find(c => c.startsWith(prefix));
        return cls ? cls.replace(prefix, '') : '';
    };

    // --- INÍCIO DA CORREÇÃO E DEPURAÇÃO ---
    const centroDistribuicao = card.dataset.centro || '';
    console.log(`Valor lido do atributo 'data-centro': "${centroDistribuicao}"`); // <-- Ponto crucial da depuração

    // Preenche todos os campos hidden do formulário
    document.getElementById('upload_colaborador').value = card.querySelector('.text-primary')?.innerText || '';
    document.getElementById('upload_empresa').value = getClassValue('emp-');
    document.getElementById('upload_marketplace').value = getClassValue('id_mktp-');
    document.getElementById('upload_tipo').value = getClassValue('tipo-');
    document.getElementById('inp_centro_distribuicao').value = centroDistribuicao; // <-- A correção está aqui

    console.log(`Valor final do campo hidden 'centro_distribuicao': "${document.getElementById('inp_centro_distribuicao').value}"`);
    // --- FIM DA CORREÇÃO E DEPURAÇÃO ---

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
        if (result.isConfirmed) {
            // Feedback de carregamento
            Swal.fire({
                title: 'Excluindo...',
                text: 'Por favor, aguarde.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // Requisição DELETE
            fetch(`/agendamento/excluir/${idAgendamento}`, {
                method: 'DELETE',
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        Swal.fire(
                            'Excluído!',
                            'O agendamento foi excluído com sucesso.',
                            'success'
                        );

                        const cardParaRemover = document.querySelector(`.agendamento-container.id-${idAgendamento}`);
                        if (cardParaRemover) {
                            // Fade-out + reload
                            cardParaRemover.style.transition = 'opacity 0.5s ease';
                            cardParaRemover.style.opacity = '0';
                            setTimeout(() => {
                                cardParaRemover.remove();
                                location.reload();
                            }, 500);
                        } else {
                            // Se não achar o card, recarrega direto
                            location.reload();
                        }
                    } else {
                        Swal.fire(
                            'Erro!',
                            'Não foi possível excluir o agendamento. ' + (data.message || ''),
                            'error'
                        );
                    }
                })
                .catch(() => {
                    Swal.fire(
                        'Erro de Rede!',
                        'Não foi possível se comunicar com o servidor.',
                        'error'
                    );
                });
        }
    });
}
