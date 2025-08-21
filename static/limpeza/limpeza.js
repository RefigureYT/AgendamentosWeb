document.addEventListener('DOMContentLoaded', () => {
    const detalhes = document.getElementById('detalhesAgendamento');
    const coll = bootstrap.Collapse.getOrCreateInstance(detalhes, { toggle: false });
    const toggleBtn = document.getElementById('btnToggleDetalhes');
    const icon = toggleBtn.querySelector('i');

    function ajustarCollapse() {
        if (window.innerWidth < 768) {
            coll.hide();
        } else {
            coll.show();
        }
    }

    // **Aqui**: troca o ícone ao abrir
    detalhes.addEventListener('show.bs.collapse', () => {
        icon.classList.replace('bi-chevron-down', 'bi-chevron-up');
        toggleBtn.setAttribute('aria-expanded', 'true');
    });

    // **E aqui** ao fechar
    detalhes.addEventListener('hide.bs.collapse', () => {
        icon.classList.replace('bi-chevron-up', 'bi-chevron-down');
        toggleBtn.setAttribute('aria-expanded', 'false');
    });

    window.addEventListener('resize', ajustarCollapse);
    ajustarCollapse();
});



function getEleToCorrection(ele) {
    let id_prod = parseInt(ele.id.split('btn-corr-')[1]) - 1
    let checked_values_alt = []
    let checked_values_com = []
    let id_agend_bd = parseInt(dados['id_bd'])
    let id_prod_bd = dados['produtos'][parseInt(id_prod)]['id_bd']

    Array.from($('.corr-' + id_prod.toString())).forEach(x => {
        if (x.checked && x.classList.contains('alterar')) {
            checked_values_alt.push(
                dados['produtos'][parseInt(id_prod)]['composicao'][x.id.split('-')[3]]);
        }
    })
    if (checked_values_alt.length == 0) {
        console.log("Nenhum item de composição selecionado!");
    } else {
        console.log(checked_values_alt);
    }

    Array.from($('.corr-' + id_prod.toString())).forEach(x => {
        if (x.checked && x.classList.contains('comprar')) {
            checked_values_com.push(
                dados['produtos'][parseInt(id_prod)]['composicao'][x.id.split('-')[3]]);
        }
    })
    if (checked_values_com.length == 0) {
        console.log("Nenhum item de composição selecionado!");
    } else {
        console.log(checked_values_com);
    }

    post_alterar_data = { 'id_agend': id_agend_bd, 'id_prod': id_prod_bd, 'itens': checked_values_alt }
    post_comprar_data = { 'id_agend': id_agend_bd, 'id_prod': id_prod_bd, 'itens': checked_values_com }

    console.log("Dados para alteração: ")
    console.log(post_alterar_data)
    console.log("Dados para compra: ")
    console.log(post_comprar_data)

    if (post_alterar_data['itens'].lenght > 0) {
        makeFetchForCorrection(post_alterar_data, 'alterar')
    }
    if (post_comprar_data['itens'].length > 0) {
        makeFetchForCorrection(post_comprar_data, 'comprar')
    }
}

function makeFetchForCorrection(post_data, url_path) {
    url = 'https://agendamento.jaupesca.com.br/alteracoes/' + url_path  //TODO - Localização do endereço
    fetch(url, {
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        method: 'POST',
        body: JSON.stringify(post_data)
    }).then((response) => {
        if (response.ok) {
            console.log("Fetch foi feito");
        } else {
            throw Error('Erro');
        }
    }).catch(function (error) {
        console.log(error)
    })
}

function activateBtn(ele) {
    let class_name = Array.from(ele.classList)[1];
    let id = parseInt(class_name.split('corr-')[1]) + 1;
    if (Array.from($('.' + Array.from(ele.classList)[0])).some(x => x.checked)) {
        $('#btn-corr-' + id.toString()).prop('disabled', false);
    } else {
        $('#btn-corr-' + id.toString()).prop('disabled', true);
    }
}

function showTable(ele) {
    $('#table-' + parseInt(ele.id.split('show-more-arrow-')[1])).toggleClass('display-hidden');
    $(ele).toggleClass('rotated')
}

function makeTables() {
    Array.from($('.table-comp')).forEach((ele, index) => {
        ele.innerHTML = `
            <table class="table table-light table-striped">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>SKU</th>
                        <th>ID Tiny</th>
                        <th>GTIN</th>
                        <th>Un./kit</th>
                        <th>Total un.</th>
                        <th>Estoque</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableBodyData(index)}
                </tbody>
            </table>
        `
    });
}

function tableBodyData(index) {
    let tableBody = '';
    dados['produtos'][index].composicao.forEach((x, index_comp) => {
        console.log(x.nome, x.sku, x.localizacao)
        let ele_class = '';
        if (x.estoque_error_flag == 'green') {
            ele_class = 'success';
        } else if (x.estoque_error_flag == 'yellow') {
            ele_class = 'warning';
        } else {
            ele_class = 'danger';
        }
        tableBody += `
            <tr class='table-${ele_class}'>
                <td><a href="https://erp.tiny.com.br/produtos#edit/${x.id_tiny}" target="_blank">${x.nome}</a></td>
                <td>${x.sku}</td>
                <td>${x.id_tiny}</td>
                <td>${x.gtin}</td>
                <td>${x.unidades_por_kit}</td>
                <td>${x.unidades_totais}</td>
                <td>${x.estoque_tiny}</td>
                <td>
                    <div class="form-check">
                        <input id='enviar-corr-${index}-${index_comp}' class='form-check-input corr-${index} alterar' type='checkbox' onchange='activateBtn(this)'>
                        <label class='form-check-label' for='enviar-corr-${index}-${index_comp}'>Alterar</label>
                    </div>
                    <div class="form-check">
                        <input id='enviar-comp-${index}-${index_comp}' class='form-check-input corr-${index} comprar' type='checkbox' onchange='activateBtn(this)'>
                        <label class='form-check-label' for='enviar-comp-${index}-${index_comp}'>Comprar</label>
                    </div>
                </td>
            </tr>
        `
    })

    return tableBody;
}

makeTables()

function altBtn(x) {
    var win = window.open(`https://erp.tiny.com.br/produtos#edit/${dados['produtos'][x.id.split('btn-alt-')[1] - 1].id_tiny}`)
    if (win) {
        win.focus();
    } else {
        alert('Por favor, habilite popups nesse página!');
    }
    Swal.fire({
        template: "#my-template"
    }).then(alert => {
        if (alert.isConfirmed) {
            console.log('CONFIRMADO');
            console.log(alert);
            window.open(window.origin + `/atualizar?prod_id=${dados['produtos'][x.id.split('btn-alt-')[1] - 1].id_bd}&id=${agend_id}&tipo=${agend_tipo}`, '_self')
        } else if (alert.isDenied) {
            console.log('NEGADO');
            console.log(alert);
        } else if (alert.isDismissed) {
            console.log('CANCELADO');
            console.log(alert);
        }
    }
    )
}