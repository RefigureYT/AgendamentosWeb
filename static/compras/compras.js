async function getTinyData(ele) {
    let id = ele.id.split('row-')[1]
    let quant_total = $(`#qnt-total-${id}`).text()
    console.log(quant_total)
    const response = await fetch(`https://agendamento.jaupesca.com.br/dados-compra-tiny/${id}`, { mode: 'cors' }) // TODO: Mudar para o IP correto
    if (!response.ok) {
        throw new Error(`Response status: ${response.status}`)
    }
    const texto = await response.json()
    console.log(texto['fornecedores'])
    if (texto['fornecedores'].length > 0) {
        $(`#fornecedor-${id}`).text(texto['fornecedores'][0]['nome'] != '' ? texto['fornecedores'][0]['nome'] : "Não achado")
        $(`#cod-fornecedor-${id}`).text(texto['fornecedores'][0]['codigoProdutoNoFornecedor'] != '' ? texto['fornecedores'][0]['codigoProdutoNoFornecedor'] : "Não achado")
    } else {
        $(`#fornecedor-${id}`).text("Não achado")
        $(`#cod-fornecedor-${id}`).text("Não achado")
    }
    $(`#qnt-faltante-${id}`).text(Math.max(0, quant_total - parseInt(texto['estoque']['quantidade'])))
    $(`#estoque-tiny-${id}`).text(texto['estoque']['quantidade'])
    $(`#qnt-compra-${id}`).val(0)
}

Array.from($('.tr-class')).forEach((x, index, arr) => {
    
   getTinyData(x) // TODO Reativar
})

function turnTableDataToJson(extensao) {
    let allData = []
    Array.from($('.tr-class')).forEach((produto) => {
        let children = $(produto).children()
        allData.push(JSON.stringify(
            {
                nome: children[0].textContent,
                fornecedor: children[1].textContent,
                cod_fornecedor: children[2].textContent,
                qnt_total: children[3].textContent,
                estoque_tiny: children[4].textContent,
                qnt_faltante: children[5].textContent,
                qnt_compra: $(children[6]).children()[0].value
            }))
    })
    let data = new FormData()
    data.append('dados', allData)
    fetch(`https://agendamento.jaupesca.com.br/compra-planilha/${extensao}`, { // TODO: Mudar para o IP correto
        mode: 'cors',
        method: 'POST',
        body: data
    }).then((response) => {
        window.location.replace(response.url);
    })
}

function autoResizeInput(input) {
    const mirror = input.nextElementSibling;
    mirror.textContent = input.value || "0";
    input.style.width = mirror.offsetWidth + "px";
}

function removeComprado(input) {
    quant = Array.from(input.parentElement.parentElement.children[0].children)[0].value
    id = input.id.split('remover-')[1]

    fetch(`https://agendamento.jaupesca.com.br/remover-compra/${id}/${quant}`, {mode: 'cors'}) //TODO - Localização do endereço
}

// Aplica ao carregar a tabela
window.addEventListener("load", () => {
    document.querySelectorAll(".input-wrapper input[type='number']").forEach(input => autoResizeInput(input));
});

window.addEventListener("load", () => {
    const hoje = new Date();
    const dataFormatada = hoje.toLocaleDateString('pt-BR') + ' ' + hoje.toLocaleTimeString('pt-BR');
    const spanData = document.getElementById("data-hoje");
    if (spanData) {
        spanData.innerText = dataFormatada;
    }
});
