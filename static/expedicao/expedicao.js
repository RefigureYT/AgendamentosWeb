// static/expedicao/expedicao.js

document.addEventListener("DOMContentLoaded", function () {
    const botoesVisualizar = document.querySelectorAll('.js-visualizar-itens');

    botoesVisualizar.forEach(botao => {
        botao.addEventListener('click', function () {
            const dadosDaCaixa = JSON.parse(this.getAttribute('data-caixa'));
            abrirModalDetalhes(dadosDaCaixa);
        });
    });

    /**
     * CORRIGIDO: Busca um produto na lista pelo seu ID_ML (Etiqueta), não pelo SKU.
     * @param {string} idMl - A Etiqueta (id_ml) a ser procurada.
     * @param {Array} listaProdutos - A lista de todos os objetos de produto do agendamento.
     * @returns {object|null} - O objeto do produto encontrado ou nulo.
     */
    function getProdutoCompletoPorIdMl(idMl, listaProdutos) {
        // A condição foi trocada de p.sku === sku para p.id_ml === idMl
        return listaProdutos.find(p => p.id_ml === idMl) || null;
    }

    /**
     * Preenche e exibe o modal com os detalhes dos itens de uma caixa específica.
     */
    function abrirModalDetalhes(caixa) {
        const modalEl = document.getElementById('modalDetalhesCaixa');
        if (!modalEl) {
            console.error('Elemento do modal não encontrado!');
            return;
        }
        const modal = new bootstrap.Modal(modalEl);

        const dataContainer = document.getElementById('js-data-produtos');
        const placeholderContainer = document.getElementById('js-data-placeholder');
        const todosOsProdutos = JSON.parse(dataContainer.getAttribute('data-produtos'));
        const placeholderUrl = placeholderContainer.getAttribute('data-url');

        const modalTitle = modalEl.querySelector('.modal-title');
        const modalBody = modalEl.querySelector('.modal-body');

        modalTitle.textContent = `Itens da Caixa #${caixa.caixa_num}`;

        let bodyHtml = '<p class="text-muted text-center">Nenhum item encontrado nesta caixa.</p>';

        if (caixa.itens && caixa.itens.length > 0) {
            bodyHtml = '<ul class="list-group list-group-flush">';
            caixa.itens.forEach(item => {
                // --- CORREÇÃO PRINCIPAL AQUI ---
                // O 'item.sku' que vem da caixa é, na verdade, a etiqueta (id_ml).
                // Usamos a função corrigida para buscar o produto correspondente.
                const produtoInfo = getProdutoCompletoPorIdMl(item.sku, todosOsProdutos);

                const tituloProduto = produtoInfo ? produtoInfo.id_ml : 'Etiqueta não encontrada';
                // Agora que temos o 'produtoInfo' correto, podemos pegar seu SKU verdadeiro.
                const skuProduto = produtoInfo ? produtoInfo.sku : 'SKU não encontrado';
                const gtinProduto = produtoInfo ? produtoInfo.gtin : 'Não informado';
                const imagemUrl = produtoInfo && produtoInfo.imagem_url ? produtoInfo.imagem_url : placeholderUrl;

                bodyHtml += `
                    <li class="list-group-item d-flex justify-content-between align-items-center px-1">
                        <img src="${imagemUrl}" alt="Imagem do Produto" class="img-thumbnail me-3" style="width: 65px; height: 65px; object-fit: contain;">
                        
                        <div class="flex-grow-1">
                            <div class="text-muted d-block fw-bold">Etiqueta: ${tituloProduto}</div>
                            <small class="text-muted d-block">SKU: ${skuProduto}</small>
                            <small class="text-muted d-block">GTIN: ${gtinProduto}</small>
                        </div>
                        
                        <span class="badge bg-primary rounded-pill fs-5 ms-3">${item.quantidade}</span>
                    </li>`;
            });
            bodyHtml += '</ul>';
        }

        modalBody.innerHTML = bodyHtml;
        modal.show();
    }
});