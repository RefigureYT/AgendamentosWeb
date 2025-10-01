const urlParams = new URLSearchParams(window.location.search);
const idAgend = parseInt(urlParams.get('id'), 10);

let inicioTimestamp = null;
let intervaloTempo = null;
let tempoEstimadoSegundos = 0;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

document.addEventListener('DOMContentLoaded', () => {
  // ─── Collapse responsivo ───────────────────────
  const detalhes = document.getElementById('detalhesRetirada');
  const coll = bootstrap.Collapse.getOrCreateInstance(detalhes, { toggle: false });
  const toggleBtn = document.getElementById('btnToggleRetirada');
  const icon = toggleBtn.querySelector('i');
  function ajustarCollapse() {
    window.innerWidth < 768 ? coll.hide() : coll.show();
  }
  detalhes.addEventListener('show.bs.collapse', () => {
    icon.classList.replace('bi-chevron-down', 'bi-chevron-up');
  });
  detalhes.addEventListener('hide.bs.collapse', () => {
    icon.classList.replace('bi-chevron-up', 'bi-chevron-down');
  });
  window.addEventListener('resize', ajustarCollapse);
  ajustarCollapse();

  // ─── inicia polling e contador ─────────────────────
  carregarProgressoServer();
  iniciarContadorTempo();
  setInterval(carregarProgressoServer, 20000);

  // ─── atalho Enter nos inputs ─────────────────────
  ['skuInput', 'quantidadeInput'].forEach(id =>
    document.getElementById(id)
      .addEventListener('keydown', e => { if (e.key === 'Enter') biparProduto(); })
  );

  // Aqui ele pega as informações que estão no HTML e transforma em variáveis usáveis no JS
  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);
  console.log('>', produtos);

  const empresaId = parseInt(document.getElementById("infoAgend").dataset.empresa, 10);
  const empresaNome =
    empresaId === 1 ? "Jaú Pesca" :
      empresaId === 2 ? "Jaú Fishing" :
        empresaId === 3 ? "L.T. Sports" :
          "Nenhuma";

  const numeroAgendamento = document.getElementById("infoAgend").dataset.agendamento;
  const nomeColaborador = document.getElementById("infoAgend").dataset.colaborador;
  const marketplaceAgendamento = document.getElementById("infoAgend").dataset.marketplace;

  // Testa as variáveis
  console.log('Empresa>', empresaNome);
  console.log('Nº Agendamento>', numeroAgendamento);
  console.log('Colaborador>', nomeColaborador);
  console.log('Marketplace>', marketplaceAgendamento);

  console.log('Produtos>', produtos);

  let obj = [];

  //! ISSO AQUI NÃO PODE SER DELETADO, ELE DETERMINA OS PRODUTOS QUE SERÃO USADOS NA TRANSFERÊNCIA DE ESTOQUE
  //? No caso ele usa TODOS os produtos (por isso só funciona quando o agendamento está finalizado)
  //* Então lembre-se de alterar todo o agendamento antes de finalizar, se não ele vai transferir errado.
  // produtos.forEach(p => {
  //   console.log(p);
  //   const composicoes = p.composicoes;
  //   composicoes.forEach(c => {
  //     console.log(c);
  //     if (c.sku === "JP12324") {
  //       let produto = {
  //         nome: c.nome,
  //         sku: c.sku,
  //         id_tiny: c.id_tiny,
  //         gtin: c.gtin,
  //         unidades_de_kits: c.unidades_de_kits,
  //         unidades_por_kit: c.unidades_por_kit,
  //         unidades_totais: c.unidades_totais
  //       }
  //       obj.push(produto);
  //     }
  //   });
  // });
  // console.log('>', obj);

  const resultado = produtos.filter(p =>
    p.composicoes.some(c => c.sku === "JP12324")
  );

  console.log('Esse aqui é o resultado askdaldkajsdl >', resultado);

  carregarGtinComposicoes();
});

function carregarGtinComposicoes() {
  let composicoes = [];
  let vistos = new Set();


}

// ─── busca estado no servidor e atualiza UI ─────────────────────
async function carregarProgressoServer() {
  try {
    const resp = await fetch(`/api/bipados-total/${idAgend}`);
    if (!resp.ok) throw new Error(resp.statusText);
    const dados = await resp.json();
    console.log('Kelvinhoooo >', dados);
    // const mapa = Object.fromEntries(dados.map(x => [x.sku, x.bipados]));
    const mapa = Object.fromEntries(dados.map(x => [x.sku_original, x.bipados_total]));

    document.querySelectorAll('.produto-item').forEach(item => {
      const bip = mapa[item.dataset.sku] || 0;
      item.dataset.bipados = bip;
      atualizarUI(item, bip);
    });

    atualizarContadores();
    const completos = verificarSeFinalizouTudo();
    // se não estiver tudo concluído, reordena pendentes/concluídos normalmente
    if (!completos) distribuirItens();

  } catch (e) {
    console.error('Falha ao carregar progresso:', e);
  }
}


// ─── atualiza cores, barra e texto de um item ─────────────────────
function atualizarUI(item, bip) {
  const total = +item.dataset.total;
  const barra = item.querySelector('.progress-bar');

  item.querySelector('.bipados').textContent = `Bipados: ${bip}`;
  const pct = total > 0 ? (bip / total) * 100 : 0;
  barra.style.width = `${pct}%`;
  barra.setAttribute('aria-valuenow', bip);
  barra.textContent = `${Math.round(pct)}%`;

  if (bip >= total) {
    item.classList.add('bg-success', 'text-white');
    barra.classList.replace('bg-warning', 'bg-success');
  } else {
    item.classList.remove('bg-success', 'text-white');
    barra.classList.replace('bg-success', 'bg-warning');
  }
}


// ─── separa e ordena pendentes/concluídos ─────────────────────
function distribuirItens() {
  const concl = document.getElementById('concluidosContainer');
  const pend = document.getElementById('pendentesContainer');
  if (!concl || !pend) {
    console.warn('Distribuição: containers não encontrados');
    return;
  }

  // move cada item pro container correto
  document.querySelectorAll('.produto-item').forEach(item => {
    const bip = +item.dataset.bipados;
    const tot = +item.dataset.total;
    if (bip >= tot) concl.appendChild(item);
    else pend.appendChild(item);
  });

  // ordena pendentes (desc por bipados)
  Array.from(pend.querySelectorAll('.produto-item'))
    .sort((a, b) => +b.dataset.bipados - +a.dataset.bipados)
    .forEach(el => pend.appendChild(el));

  // (opcional) ordenar concluidos também, se desejar:
  // Array.from(concl.querySelectorAll('.produto-item'))
  //   .sort((a, b) => +b.dataset.bipados - +a.dataset.bipados)
  //   .forEach(el => concl.appendChild(el));
}


// ─── contador de tempo ─────────────────────
function iniciarContadorTempo() {
  const tempoP = document.getElementById('tempoP');
  const estP = document.getElementById('estimadoP');
  if (estP) {
    const [, h, m, s] = estP.textContent.match(/(\d{2})h (\d{2})m (\d{2})s/);
    tempoEstimadoSegundos = (+h * 3600) + (+m * 60) + (+s);
  }
  inicioTimestamp = Date.now();
  intervaloTempo = setInterval(() => {
    const secDec = Math.floor((Date.now() - inicioTimestamp) / 1000);
    const hh = String(Math.floor(secDec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secDec % 3600) / 60)).padStart(2, '0');
    const ss = String(secDec % 60).padStart(2, '0');
    tempoP.innerHTML = `<strong>🕒 Tempo:</strong> ${hh}h ${mm}m ${ss}s`;
  }, 1000);
}
function pararContadorTempo() {
  clearInterval(intervaloTempo);
}


// ─── envio de bipagem ─────────────────────
async function biparProduto() {
  const skuEl = document.getElementById('skuInput');
  const qtdEl = document.getElementById('quantidadeInput');

  let sku = (skuEl?.value || '').trim();
  let qtd = Number(qtdEl?.value);

  if (!sku || !Number.isFinite(qtd) || qtd <= 0) return;

  const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : s;
  const onlyDigits = (v) => String(v ?? '').replace(/\D+/g, '');
  const toNum = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  // 1) Tenta achar o item pelo SKU informado (SKU original no DOM)
  let item = document.querySelector(`.produto-item[data-sku="${esc(sku)}"]`);

  // 2) Se não achou, tenta mapear pelo SKU/GTIN das composições e ajustar para o SKU da composição
  if (!item) {
    const raw = document.getElementById('js-data')?.dataset?.comps || '[]';
    let produtos = [];
    try { produtos = JSON.parse(raw); } catch { }

    let foundComp = null;
    outer:
    for (const produto of produtos) {
      const comps = Array.isArray(produto.composicoes) ? produto.composicoes : [];
      for (const c of comps) {
        if (String(c.sku ?? '').trim() === sku || (c.gtin && onlyDigits(c.gtin) === onlyDigits(sku))) {
          foundComp = c;
          break outer;
        }
      }
    }
    if (foundComp) {
      sku = String(foundComp.sku ?? '').trim(); // ajusta p/ SKU real da composição
      item = document.querySelector(`.produto-item[data-sku="${esc(sku)}"]`);
    }
  }

  // 3) Busca equivalentes do agendamento
  const listaEquivalentes = await listarEquivalentes(idAgend); // deve retornar { bruto: [...] }
  let produtoBipado = null;
  for (const prod of (listaEquivalentes?.bruto || [])) {
    if (prod.sku_bipado === sku || onlyDigits(prod.gtin_bipado) === onlyDigits(sku)) {
      produtoBipado = prod;
      break;
    }
  }

  // 4) Determinar o item "original" no DOM para cálculo de total:
  // - Se veio por equivalente, o original é produtoBipado.sku_original
  // - Caso contrário, é o próprio `item` encontrado pelo SKU original
  let itemOriginal = item;
  let skuOriginalParaValidar = item?.getAttribute('data-sku') || sku;

  if (produtoBipado) {
    skuOriginalParaValidar = String(produtoBipado.sku_original || '').trim();
    itemOriginal = document.querySelector(`.produto-item[data-sku="${esc(skuOriginalParaValidar)}"]`);
  }

  if (!itemOriginal) {
    // Ele vai tentar buscar como se fosse uma caixa fechada 
    // (Pega o KIT verifica se tem apenas um produto como composição e se esse produto está no agendamento)
    const prod = await verificarSeECaixaFechada(skuOriginalParaValidar);

    if (prod) {
      qtd = prod.un;
      sku = prod.sku;
      // Muito importante: agora o “original” passa a ser o SKU do componente
      skuOriginalParaValidar = prod.sku;
      itemOriginal = document.querySelector(`.produto-item[data-sku="${esc(sku)}"]`);

      if (!itemOriginal) {
        Swal.fire({ icon: 'error', title: 'SKU não encontrado!', timer: 2500, showConfirmButton: false });
        return;
      }
    }
  }

  // 5) Valores do DOM (fallback local)
  let atualDom = toNum(itemOriginal.dataset?.bipados, 0); // total já bipado (diretos + equivalentes)
  let totalDom = toNum(itemOriginal.dataset?.total, 0);

  // 6) (Recomendado) Consultar o total atual FRESCO no servidor (diretos + equivalentes)
  let atualServidor = null;
  try {
    const qs = new URLSearchParams({ id_agend_ml: String(idAgend), sku: skuOriginalParaValidar });
    const resp = await fetch(`/api/bipagem/detalhe?${qs.toString()}`);
    if (resp.ok) {
      const j = await resp.json();
      const t = j?.totais?.bipados_total;
      if (Number.isFinite(Number(t))) atualServidor = Number(t);
      // Se quiser, também pode sincronizar o DOM aqui:
      // itemOriginal.dataset.bipados = String(atualServidor);
    }
  } catch (e) {
    console.warn('Falha ao consultar totais no servidor:', e);
  }

  const atual = Number.isFinite(atualServidor) ? atualServidor : atualDom;
  const total = totalDom;

  // 7) Checagem robusta
  if (!Number.isFinite(atual) || !Number.isFinite(total)) {
    Swal.fire({ icon: 'error', title: 'Dados inválidos para validação de total.', timer: 3000, showConfirmButton: false });
    return;
  }

  if (atual + qtd > total) {
    Swal.fire({
      icon: 'error',
      title: 'Total excedido!',
      html: `Bipagem de <b>${qtd}</b> excede o total permitido para <b>${esc(skuOriginalParaValidar)}</b>.<br>
             Atual: <b>${atual}</b> • Total: <b>${total}</b>`,
      timer: 5000,
      showConfirmButton: false
    });
    return;
  }

  // 8) Executar a bipagem (direto vs equivalente)
  try {
    if (!produtoBipado) {
      // Direto (SKU original)
      const resp = await fetch('/api/bipar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_agend: idAgend, sku: skuOriginalParaValidar, quant: qtd })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json(); // { sku, bipados, ... } -> bipados = total (diretos + equivalentes)
      const itm = document.querySelector(`.produto-item[data-sku="${esc(data.sku)}"]`);
      if (itm) {
        itm.dataset.bipados = String(toNum(data.bipados, atual) /* segurança */);
        atualizarUI(itm, toNum(data.bipados, atual));
        atualizarContadores();
        const completos = verificarSeFinalizouTudo();
        if (!completos) distribuirItens();
      }
    } else {
      // Equivalente
      const add = await addUnidadesEquivalentes(produtoBipado, qtd);
      // add.bipados_total = total acumulado (diretos + equivalentes) do SKU ORIGINAL
      const itm = document.querySelector(`.produto-item[data-sku="${esc(produtoBipado.sku_original)}"]`);
      if (itm) {
        itm.dataset.bipados = String(toNum(add?.bipados_total, atual + qtd));
        atualizarUI(itm, toNum(add?.bipados_total, atual + qtd));
        atualizarContadores();
        const completos = verificarSeFinalizouTudo();
        if (!completos) distribuirItens();
      }
    }
  } catch (err) {
    console.error('Erro ao registrar bipagem:', err);
    Swal.fire({ icon: 'error', title: 'Erro ao registrar bipagem', text: String(err?.message || err) });
    return;
  }

  // 9) Reset UI
  skuEl.value = '';
  qtdEl.value = 1;
  skuEl.focus();
}

// ─── atualiza "Em andamento" e "Finalizados" ─────────────────────
function atualizarContadores() {
  let emAnd = 0, fin = 0;
  document.querySelectorAll('.produto-item').forEach(item => {
    const tot = +item.dataset.total;
    const bi = +item.dataset.bipados;
    if (bi > 0 && bi < tot) emAnd++;
    if (bi >= tot) fin++;
  });
  document.getElementById('andamentoP').innerHTML = `<strong>🔄 Em andamento:</strong> ${emAnd}`;
  document.getElementById('finalizadosP').innerHTML = `<strong>✅ Finalizados:</strong> ${fin}`;
}


// ─── move tudo de “Concluídos” de volta para “Pendentes” ─────────────────────
function voltarTodosPendentes() {
  const pend = document.getElementById('pendentesContainer');
  const concl = document.getElementById('concluidosContainer');
  Array.from(concl.querySelectorAll('.produto-item')).forEach(item => {
    // reset de estilo
    item.classList.remove('bg-success', 'text-white');
    const barra = item.querySelector('.progress-bar');
    barra.classList.replace('bg-success', 'bg-warning');
    pend.appendChild(item);
  });
}


// ─── checa se tudo foi bipado, mostra botão e retorna um flag ─────────────────────
function verificarSeFinalizouTudo() {
  const todos = [...document.querySelectorAll('.produto-item')]
    .every(item => +item.dataset.bipados >= +item.dataset.total);
  if (todos) {
    pararContadorTempo();
    document.getElementById('skuInput').disabled = true;
    document.getElementById('quantidadeInput').disabled = true;
    document.getElementById('finalizarContainer').classList.remove('d-none');
    // retorna todos para pendentes assim que completa
    voltarTodosPendentes();
  }
  return todos;
}

async function finalizarAgendamento() {
  const idAgend = parseInt(new URLSearchParams(window.location.search).get('id'), 10);

  // Pede confirmação ao usuário, assim como na tela de embalagem
  const result = await Swal.fire({
    title: 'Finalizar Conferência?',
    text: "O relatório será gerado, a transferência entre depósitos será realizada e o pedido movido para a Embalagem. Deseja continuar?",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#28a745',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sim, finalizar!',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    Swal.fire({
      title: 'Processando...',
      text: 'Gerando relatório e atualizando o status.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      // Chama a nova rota com o método POST
      const response = await fetch(`/relatorio/finalizar/${idAgend}`, {
        method: 'POST'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        agendamentoFinalizadoChamarTransferencia();
        await Swal.fire({
          icon: 'success',
          title: 'Sucesso!',
          text: data.message,
          timer: 2000,
          timerProgressBar: true,
        });

        // Redireciona para a página de agendamentos com um parâmetro específico
        window.location.href = '/agendamentos/ver?finalizado=conferencia_ok';
      } else {
        throw new Error(data.message || 'Ocorreu um erro no servidor.');
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: `Falha ao finalizar a conferência: ${error.message}`,
      });
    }
  }
}


// Rotaciona o código utilizando a chave
function dec(b64, key) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const k = new TextEncoder().encode(key);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= k[i % k.length];
  return new TextDecoder().decode(bytes);
}

async function getTinyToken(empresa, marketplace) {
  const PATH_KEY = 'tP2TTtorDkG6sxdA7UTkg2ErxBHQ7fRvQfpDLRSbBu2fswYxxmkZpf7pBusDpVJWiWCBrdsPU5rsDQfU3DB72ZiB5eJ3W7QtvAgUdRopfDDtbdijak2tP3PJmDyK3PzaQgD7gi6MtoPP3Y8QeF7VuYq4zEVHYGURCkXJxo3uEu48bbKWnQzhoyNvpzANfiFTJ7ZMsY58v9rSKZk88yLvMMhyBmoYg7zmfbqSjWJPsrBca7uSsjaNTT4qPRddkky956W7BvkaGPcmZAzSmCriGmCBwBwxFT49uxf6hhDcTq8unsbfSLjLzikxTji9dtNZ7DkvAfEYAcJBq7HoPug9E9HNPiEy9gSc5qys2zHBGQ9ez8iKGLegQCom3Km6T8zyMamMdPb29BYRutwaRd5TzhccD5Vzm2KxeoKNZzxdvgLaKCm9HgPLTb5pdDdWLAcmXqJK6iHk5kdgXCAzsnKKoieFxVNAWRiUMJYYmyvsX5ACBSPsnW8f4QAT6ohVSGMC';
  const PASS_KEY = 'GE7bKeydUk8zEmqMoXM2uSF3i8PYXVAXh5nvQM7UwGbjWmxkFRYdr7HUbzP8WUSJkUF4AxFTooNqReDYqPUoLRG75ypxij88tZ2MWNzciWyAwZ4c68F2GHYQNirS4L7kVQhMMqgTdqX2sJmF2PvtukmvZ4AjieP3cnvJZ6zRPqYPV3RzNeT35rmT3mU4ob4hUeagosEz4m5rNEHKv9ni26PBZYyPVyqycoYn3gvxAM5Vaz2L88cLxUqsfwaAJtNdxeBwUuJRQfrW6qFV4aa39EWFkDaMisizZnEGQhc5AGDzJXmApoQE55W4fm6L67wY6PTmQpoeio9vfNdawhXetDg8PE2ZRCkDZTQeXunL9z4YFwEeFghQ6T4gtKr8647VaRKDL4rV4twKfyUrAjyHSiEJNPNaehzET3koczEToJnE3EJxv5z8gPsMMgZe5ChNQDADKeydspxEALbraQqLw3zxUsBAJFfmKPmpDA3cbsrL93gvLCbabeiYx8BmoEd5';
  const PATH_COD = 'GTNjMDAXJwcsJR1YRxUTDHIdEBsjUxcnMiQZYnM1OCU+PEc2OCY3LwBGZSQbQRg/KwMKYxMoDjp0DQMAOD4wDR04dzI3AgkVBU0dFCVlVWxwKnRgXCIvIFIkI3cxYikAQyI3bSVhDkIlcTQyVFBeECoEXRVjShUtAhVLH2AnGw9lHXx0CABuPD8lBGJgGFMGMQt6YUANNQ1OKmECOCoCO3YTCHMvOX4Bc0FiUCwJIRQJCx0eHAMjHgIQLAQ+UBVnOAQuKUcBBnkffBNqDTBTf3YRCAAvIipNNho7FxdBKzVSVzMHGiMpNABLNyFZfCZnGDksKBkiZDQbIzw3HjlLfQZUBw41Gy8jAQNWHzU2CDgdNCEcPTgOIUQzMBB0O2VBLRksTCI5FwYSJVMPPzY4VDsLJgkbPwQIYxAGeiAHJDJZFClPKlI/I3kOMAA2ZRo6EwEzaRF4AgAFKzE+TggJAEI9DypXIBs6BiNtMUkPHRESCCM2MwBcVWcMVU8XXAM/ARULeA0CUXF9ADo/MD8GBxNQQRZJAysCfFwTTlpTLBJXFxMWL0JBHCcrI1UKAglKOCMTODIqZgIgAQUzChITAwsGMBNlMC4ODC4GDjo7CwsUHRMhWCsgKC07HCkbMBg8dTwtEj86LysKUCxxehUTEAY0UC5xOHg/YiosFSFxKxA='
  const PASS_COD = 'A2ZWLwoEMgMbXFkRLDo5Cko9CH9BdgV2Sg9nKm5gBTsMUAsVCD9CDCVhAQMkDD8hHzZ9ChhWMCRET3QMJSAnPxIsBgEoHzEQOhw6EjsKZxcACTs+LRpkXWAqOxspXXJtRjdmO3IQGwRKGwsfIxF0GQIZGH8Lay0BDyw5dV4+fD4/FT4VLEYkO1Y8AgA1DDofcA4RGUwzLBg0Yy8MJzE4EiImMihtRjBxOQUROTNUYSw/RjF+ZDBfBHQfdgMiQ1cMcwo5Dkkecx5bC20mGHMSMi4aBwtCdxcqFAwnFwE4VA9HDREMCxcCOSw9cw82T3cnC00gKgFtRTYoBwkJCDUCQSAREidhMSACFCQRPXdDMSJ4VVdySDQtEQ5gFQwcCgASCB0jdSYjIBE4LiMkfDIIEUUjAh8HYj1yF1tYJVhzDzpnIRwzKRUfQSw5DgIFKjcSFUl+CjgxURwqH0NtDBE1Im4lPhUvVh0dYShdawIVcEAiLF8LRxVbIRckBGICQ30CP2sFFj8RFwJGASQAEE9gGgM4LDg1OCd9e2I2U10ZTxADXhw+UQgBBjg7KTBZJBkfLgcwVhQoNx4KAzUQfxA2AhRgNyMIOyBdARkoAnImNBc/OjR5IVwOPD4ZKSwpAD8KDxoJJAoSQFYbKRRqcUkCBgwEUDEsURsfPQ8YLwgSDV0=';

  const path = dec(PATH_COD, PATH_KEY).trim();
  const pass = dec(PASS_COD, PASS_KEY).trim();
  // console.log('Senha:', pass);
  const url = 'https://n8n.jaupesca.com.br/webhook/' + path + `?empresa=${empresa}&marketplace=${marketplace}`;

  try {
    // const response = await fetch(url, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `${pass}`
    //   },
    //   body: JSON.stringify({
    //     empresa: empresa,
    //     marketplace: marketplace,
    //     agendamento: agendamento,
    //     colaborador: colaborador,
    //     produtos_agendamento: obj
    //   })
    // });

    // if (!response.ok) {
    //   const txt = await response.text().catch(() => '');
    //   throw new Error(`HTTP ${response.status} – ${txt}`);
    // }


    // const data = await response.json();
    // console.log('Resposta do n8n:', data);
    // return data;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `${pass}`
      }
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.json}`);
    }

    const data = await resp.json();
    console.log('Resposta do n8n:', data);
    return data;

  } catch (error) {
    console.error('Erro na requisição:', error);
  }
}

function adicionarEquivalente(sku) {
  const box = document.getElementById(`equivalente-${sku}`);           // div container
  const field = document.getElementById(`inputEquivalente-${sku}`);    // o <input> de fato
  const btn = document.getElementById(`btnEquivalente-${sku}`);

  const estavaOff = box.classList.contains("input-equivalente-off");

  // toggle de visibilidade
  box.classList.toggle("input-equivalente-off");
  btn.textContent = estavaOff ? "-" : "+";

  if (estavaOff) {
    // foca depois de exibir
    requestAnimationFrame(() => {
      field.focus({ preventScroll: true });
      field.select();
    });

    // evita listeners duplicados
    if (!field._enterHandler) {
      field._enterHandler = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const valorBipado = field.value.trim();
          if (valorBipado) {
            addDbEquivalente(sku, valorBipado);
            field.value = "";
            // opcional: esconder e devolver foco ao botão
            box.classList.add("input-equivalente-off");
            btn.textContent = "+";
            btn.focus();
          }
        }
      };
      field.addEventListener("keydown", field._enterHandler);
    }
  } else {
    // opcional: ao esconder, remova o handler
    if (field._enterHandler) {
      field.removeEventListener("keydown", field._enterHandler);
      field._enterHandler = null;
    }
  }
}

async function verificaAdicaoProdutoEquivalentePermitido(valorBipado) {
  const raw = document.getElementById("js-data").dataset.comps;
  const anunciosOriginais = JSON.parse(raw);
  let produtosComposicoes = [];
  let vistos = new Set();
  console.log('TODOS OS ANÚNCIOS EXEMPLO AGENDAMENTO ATUAL >', anunciosOriginais);

  anunciosOriginais.forEach(p => {
    const i = p.composicoes;
    i.forEach(c => {
      const key = c.sku;
      if (vistos.has(key)) return; // Verifica se já existe (para não haver duplicatas)
      vistos.add(key);
      produtosComposicoes.push({ nome: c.nome, sku: c.sku, gtin: c.gtin, id_tiny: c.id_tiny });
    });
  });

  console.log('Todas as composições dos anúncios COMPLETO DUBLADO SEM VIRUS TOTAL 100% 2077 ATUALIZADO >', produtosComposicoes);
  // Para cima disso tem a lógica que ele pega todos os produtos que devem ser bipado (quantidade é ignorada)
  // Abaixo vai ter a lógica que verifica se o usuário está tentando vincular um produto do agendamento com outro produto do agendamento (para não dar B.O.)

  for (const p of produtosComposicoes) {
    if (p.sku === valorBipado) {
      console.log(`Para ${p.nome} cujo possui o SKU ${p.sku} bate com o sku ${valorBipado} OU SEJA NÃO PODE!!!!`);
      const obj = {
        result: 1,
        message: 'Você não pode definir um produto do agendamento como Equivalente'
      }
      return obj;
    }
    console.log(`Para ${p.nome} cujo possui o SKU ${p.sku} *NÃO* bate com o sku ${valorBipado}`);
  }

  // A parte de cima cumpri bem o que promete em poucas linhas de código.
  // Agora abaixo após a verificação para saber se o produto já existe no agendamento
  // Ele usar os valores que já existem na tabela de equivalente e verifica se já existe esse valor lá dentro.
  // Caso já exista o produto dentro da tabela de equivalentes, a função será interrompida para que não haja duplicatas!

  const resp = await fetch(`/api/equiv/${idAgend}`);
  const data = await resp.json();
  console.log('Resultado da busca de produtos equivalentes do BANCO DE DADOS XAMPPPPPPPP >', data);

  for (const p of data) {
    if (p.sku_bipado === valorBipado || p.gtin_bipado === valorBipado) {
      console.log(`Já existe um produto equivalente com a mesma referência no banco de dados \n ${valorBipado} já equivale ao produto ${p.sku_original}, portanto, não pode ser referenciado novamente.`);
      const obj = {
        result: 2,
        message: `Referência duplicada: ${valorBipado} já está cadastrada como equivalente de ${p.sku_original} e não pode ser registrada novamente.`
      }

      return obj;
    }
    console.log(`Este produto ${p.sku_original} possui ${p.sku_bipado} como referência. Valor bipado não confere: ${valorBipado} (Já esperado, então está correto!)`)
  }

  return null;
}

async function buscaProdutoEquivalente(valorBipado, token) {
  const urlDefault = 'https://api.tiny.com.br/public-api/v3';
  // const urlSku = urlDefault + `/produtos?codigo=${valorBipado}`; // Assumi que é um SKU
  // const urlGtin = urlDefault + `/produtos?gtin=${valorBipado}`; // Assumi que é um GTIN/EAN
  const isLikelyGTIN = (v) => /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(v);
  let result = null;

  const permitidoAddEquivalente = await verificaAdicaoProdutoEquivalentePermitido(valorBipado);

  if (permitidoAddEquivalente !== null) {
    // messageBuscaEquivalenteTiny(permitidoAddEquivalente);
    if (permitidoAddEquivalente.result === 1) {
      notify.error(permitidoAddEquivalente.message, { type: 'info', duration: 5000 });
      result = 1;
      console.log('Result para adição do bagulho equivalente >', result);
      return result;
    } else if (permitidoAddEquivalente.result === 2) {
      notify.error(permitidoAddEquivalente.message, { type: 'info', duration: 5000 });
      result = 2;
      console.log('Result para adição do bagulho equivalente >', result);
      return result;
    } else {
      console.log('Result para adição do bagulho equivalente > Não retornou nada aí vai voltar nulo');
      return; // Não consigo imaginar que caso pode cair...
    }
  }

  try {
    // const tinySku = await fetch(urlSku, {
    //   method: 'GET',
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });

    // const data = await tinySku.json();

    // Ex.: buscar produto pelo código (SKU)

    if (isLikelyGTIN(valorBipado)) {
      // Se determinado como GTIN, tenta por GTIN
      console.log('DETERMINADO COMO GTIN >', valorBipado);

      // BUSCA POR GTIN/EAN
      const tentativaGtin = await fetch(`/api/tiny-proxy?gtin=${encodeURIComponent(valorBipado)}`, {
        method: 'GET',
        headers: {
          'Path': '/public-api/v3/produtos',
          'Authorization': 'Bearer ' + token
        }
      });

      const dataGtin = await tentativaGtin.json();
      console.log('Resultado por GTIN:', dataGtin);

      if (dataGtin.itens.length === 0) {
        console.log('NENHUM PRODUTO ENCONTRADO POR GTIN');
        console.log('Tentando como SKU');

        // BUSCA POR SKU
        const url = `/api/tiny-proxy?codigo=${encodeURIComponent(valorBipado)}`;
        const tentativaSku = await fetch(url, {
          method: 'GET',
          headers: {
            'Path': '/public-api/v3/produtos',
            'Authorization': 'Bearer ' + token
          }
        });
        const dataSku = await tentativaSku.json();
        console.log('RESULT POR SKU: ', dataSku);

        if (dataSku.itens.length === 0) {
          console.log('INFELIZMENTE NÃO FOI POSSÍVEL ENCONTRAR NENHUM PRODUTO NEM COM SKU NEM COM GTIN');
          result = 3;
          return result;
        } else {
          result = dataSku;
        }
      } else {
        result = dataGtin;
      }
      return result;
    }
    else {
      // Caso contrário faz como SKU primeiro

      console.log('DETERMINADO COMO SKU >', valorBipado);

      // BUSCA POR SKU
      const url = `/api/tiny-proxy?codigo=${encodeURIComponent(valorBipado)}`;
      const tentativaSku = await fetch(url, {
        method: 'GET',
        headers: {
          'Path': '/public-api/v3/produtos',
          'Authorization': 'Bearer ' + token
        }
      });
      const dataSku = await tentativaSku.json();
      console.log('RESULT POR SKU: ', dataSku);

      if (dataSku.itens.length === 0) {
        console.log('NADA ENCONTRADO');
        console.log('Tentando agora a pesquisa por GTIN/EAN');

        // BUSCA POR GTIN/EAN
        const tentativaGtin = await fetch(`/api/tiny-proxy?gtin=${encodeURIComponent(valorBipado)}`, {
          method: 'GET',
          headers: {
            'Path': '/public-api/v3/produtos',
            'Authorization': 'Bearer ' + token
          }
        });

        console.log(tentativaGtin.status);

        let data = null;
        let text = null;

        // Tenta JSON; se falhar, lê como texto
        try {
          data = await tentativaGtin.clone().json();
        } catch {
          text = await tentativaGtin.text();
        }

        if (!tentativaGtin.ok) {
          // 4xx/5xx
          const msg =
            (data && data.detalhes && data.detalhes[0] && data.detalhes[0].mensagem) ||
            (data && data.error) || // caso o seu proxy retorne {error: "..."}
            text ||
            'Erro ao consultar Tiny \nCOD Err: #j3uY3c6FC8Sd';

          console.log(`Erro ${tentativaGtin.status}:`, msg);
          throw new Error(`Erro ${tentativaGtin.status}:`, msg);
        } else {
          // Sucesso 2xx
          console.log('OK:', data);
        }


        const dataGtin = await tentativaGtin.json();
        console.log('Resultado por GTIN:', dataGtin);

        if (dataGtin.itens.length === 0) {
          console.log('INFELIZMENTE NÃO FOI POSSÍVEL ENCONTRAR NENHUM PRODUTO NEM COM SKU NEM COM GTIN');
          result = 3;
          return result;
        } else {
          result = dataGtin;
        }
      } else {
        result = dataSku;
      }

      return result;
    }
  } catch (error) {
    console.log(`Deu erro na requisição TINY com SKU: ${error}`);
    const erro = error.toString();
    if (erro.includes("400")) {
      result = 3;
      return result;
    } else {
      notify.error(error, { type: 'info', duration: 5000 })
    }
  }
}

async function messageBuscaEquivalenteTiny(message) {
  const erroDiv = document.getElementById('erroBuscaEquivalenteDiv');

  erroDiv.classList.remove('input-equivalente-off');
  erroDiv.innerHTML = message;
  await sleep(2000);
  erroDiv.classList.add('input-equivalente-off');
}

// Pequeno utilitário para requisições JSON com timeout
async function fetchJSON(url, { method = 'GET', headers = {}, body, timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: ctrl.signal
  });
  clearTimeout(t);

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg += ` – ${j.error}`; } catch { }
    throw new Error(msg);
  }
  return res.json();
}

async function listarEquivalentes(idAgend) {
  const data = await fetchJSON(`/api/equiv/${idAgend}`);
  console.table(data);
  // Dica: agrupar por sku_original para montar UI
  const agrupado = data.reduce((acc, r) => {
    (acc[r.sku_original] ||= []).push({ sku: r.sku_bipado, bipados: r.bipados, atualizado_em: r.atualizado_em });
    return acc;
  }, {});
  return { bruto: data, porOriginal: agrupado };
}

async function addUnidadesEquivalentes(produtoBipado, qtd) {
  const payload = {
    id_agend: idAgend,          // ex.: 227
    sku_original: produtoBipado.sku_original,  // ex.: 'API1'
    sku_bipado: produtoBipado.sku_bipado,      // ex.: '123'
    quant: qtd
  };

  const requestAdd = await fetch('/api/equiv/add-unidades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });


  const data = await requestAdd.json().catch(() => ({}));

  if (!requestAdd.ok || data.ok === false) {
    // 404 quando não encontra o par (id_agend, sku_original, sku_bipado)
    // Outros códigos: erro do servidor/validação
    const msg = data?.error || `Falha (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return data;
}
// exemplo
async function addDbEquivalente(sku, valorBipado) {
  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);

  const nomeColaborador = document.getElementById("infoAgend").dataset.colaborador;
  // console.log('>', produtos);

  let prodRef = null;

  for (const p of produtos) {
    // console.log(p);
    const composicoes = p.composicoes;
    for (const c of composicoes) {
      // console.log('>', c);
      if (c.sku === sku) {
        prodRef = c;
        break;
      }
    }
  }

  const result = await getTinyToken("jaupesca", "tiny");
  const token = result[0].access_token;

  const produtoEquivalente = await buscaProdutoEquivalente(valorBipado, token);

  if (produtoEquivalente === 1) {
    return;
  } else if (produtoEquivalente === 2) {
    return
  } else if (produtoEquivalente === 3) {
    console.log('Nenhum produto encontrado (GTIN ou SKU inválidos)');
    notify.error('Nenhum produto encontrado (GTIN ou SKU inválidos)', { type: 'info', duration: 5000 });
    return;
  } else {
    console.log('Produto Equivalente:', produtoEquivalente);
  }

  const confirmed = await confirmaProdutoEquivalente(produtoEquivalente.itens[0], sku, token);

  if (confirmed.respostaUser === false) { // Cai aqui se confirmed retornar false
    console.log('Usuário cancelou a adição do produto equivalente');
    notify('Adição de produto equivalente foi cancelado com sucesso!');
    return;
  }
  console.log('Usuário permitiu a adição do produto equivalente');
  console.log('Produto Equivalente #123 >', produtoEquivalente);
  console.log('Produto Equivalente #123456 >', produtoEquivalente.itens[0]);
  console.log('Produto Referência >', prodRef);

  const equivalente = produtoEquivalente.itens[0];
  console.log('Produto REQUI DO TINY >', prodRef);
  console.log('Produto REQUI DO TINY Equivalente >', produtoEquivalente);
  const payload = {
    id_agend: idAgend,
    sku_original: prodRef.sku,
    gtin_original: prodRef.gtin,
    id_tiny_original: prodRef.id_tiny,
    nome_equivalente: produtoEquivalente.itens[0].descricao,
    sku_bipado: produtoEquivalente.itens[0].sku,
    gtin_bipado: equivalente.gtin,
    id_tiny_equivalente: equivalente.id,
    usuario: nomeColaborador || 'Desconhecido',
    observacao: confirmed.obs !== null ? confirmed.obs : "Não informado"
  };

  console.log('Se liga no Payload do pai 8-) >', payload);

  console.log('Perfeito, agora vou enviar para o banco de dados');

  const json = await fetchJSON('/api/equiv/bipar', { method: 'POST', body: payload });
  console.log('resultado:', json);
  // messageBuscaEquivalenteTiny("Deu certinho! Agora é só bipar o produto normalmente.");
  notify.success('Produto equivalente adicionado com sucesso!', { type: 'info', duration: 2000 });
}

async function confirmaProdutoEquivalente(prod, sku, accessToken) {
  const painel = document.getElementById('confirmaEquivalente');
  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);
  let comp = {};

  painel.classList.remove('input-equivalente-off');
  console.log('Esse é o objeto do produto que vai aparecer na confirmação para o Equivalente >', prod);
  console.log('Sku ORIGINAL >', sku);
  console.log('Obj >', produtos);

  console.log('Fazendo Laço de repetição para buscar o produto referência');
  for (const p of produtos) {
    const i = p.composicoes;
    for (const c of i) {
      if (c.sku === sku) {
        comp = c;
        break;
      }
    };
  };
  console.log('Terminou o laço de repetição');

  console.log('Produto Referência >', comp);

  const response = await fetch('/api/tiny-proxy', {
    method: 'GET',
    headers: {
      'Path': `/public-api/v3/produtos/${prod.id}`,
      'Authorization': 'Bearer ' + accessToken
    }
  });

  const data = await response.json();
  console.log('Result de chamada para GET da imagem >', data);
  let urlImagem = '../static/resources/sem_img.webp';

  if (data.anexos.length > 0) {
    urlImagem = data.anexos[0].url;
  }

  console.log('Aqui está a url da imagem >', urlImagem);

  painel.innerHTML = `
      <p id="confirmaEquivalente-nome">Nome: <strong>${prod.descricao}</strong></p>
      <p id="confirmaEquivalente-sku">SKU: <strong>${prod.sku}</strong></p>
      <p id="confirmaEquivalente-gtin">GTIN: <strong>${prod.gtin}</strong></p>
      <img id="confirmaEquivalente-img" style="max-width: 480px; max-height: 280px" src="${urlImagem}" alt="Imagem do produto">

      <p>Deseja adicionar este produto como equivalente para</p>
      <p>${sku} - ${comp.nome}</p>
      <input id="inputObs" type="text" placeholder="Observação (Opicional)"> <br><br>
      <div id="btnSim" style="border: 5px solid green; color: white; background-color: green;">SIM</div><br>
      <div id="btnNao" style="border: 5px solid red; color: white; background-color: red;">NÃO</div>
    `;

  const resposta = await perguntarConfirmacao();
  const inputObs = document.getElementById('inputObs');
  const observacao = inputObs.value !== "" ? inputObs.value : null;

  console.log('Este é o valor do campo de observações >', observacao);
  painel.classList.add('input-equivalente-off');
  console.log('Resposta do usuário para Equivalente >', resposta);
  const resp = {
    respostaUser: resposta,
    obs: observacao
  }
  return resp;
}

function perguntarConfirmacao() {
  return new Promise((resolve) => {
    const btnSim = document.getElementById('btnSim');
    const btnNao = document.getElementById('btnNao');

    // garante que os listeners sejam adicionados só 1 vez
    btnSim.onclick = () => resolve(true);
    btnNao.onclick = () => resolve(false);
  });
}

async function agendamentoFinalizadoChamarTransferencia() {
  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);
  const token = await getTinyToken("jaupesca", "tiny");
  const accessToken = "a"; // token[0].access_token;
  const comp = [];
  const vistos = new Set();
  console.log('ASODHJAPSDOIHJASNDPIANPIANC >', produtos);

  produtos.forEach(p => {
    p.composicoes.forEach(c => {
      if (!vistos.has(c.sku)) {
        comp.push(c);
        vistos.add(c.sku);
      }
    });
  });

  console.log('Completinho o comps >', comp);
  let bipagemTotal = [];

  for (const produto of comp) {
    console.log('idAgend >', idAgend);
    const response = await fetch(`/api/bipagem/detalhe?id_agend_ml=${idAgend}&sku=${produto.sku}`);

    const data = await response.json();
    console.log('Resposta da busca antes da transferência', data);

    const prodRef = {
      nome: produto.nome,
      sku: produto.sku,
      id_tiny: produto.id_tiny,
      un: data.bipagem.bipados
    }
    bipagemTotal.push(prodRef);

    data.equivalentes.forEach(prod => {
      bipagemTotal.push(prod);
    });

    console.log('Será feito a trasferência nesses produtos >', bipagemTotal);
  }

  console.log('Este é o bipagemTotal >', bipagemTotal);
  for (const prod of bipagemTotal) {
    console.log('prod | Esse produto precisa sair do 151 e entrar no 141 >', prod);
    const id_depositoS = 785301556;
    const id_depositoE = 822208355;

    const toIntOrNull = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };

    // pega o primeiro ID numérico válido: id_tiny ou id_tiny_equivalente
    const id_prod = toIntOrNull(prod.id_tiny) ?? toIntOrNull(prod.id_tiny_equivalente);

    if (id_prod == null) {
      throw new Error(`ID do Tiny inválido para SKU ${prod.sku || ''}`);
    }

    console.log('id_prod >', id_prod);
    console.log('prod <', prod);
    const un_prod = prod.un ?? prod.bipados;
    const marketplaceAgendamento = document.getElementById("infoAgend").dataset.marketplace;
    const nomeColaborador = document.getElementById("infoAgend").dataset.colaborador;
    const empresaId = parseInt(document.getElementById("infoAgend").dataset.empresa, 10);
    const numeroAgendamento = document.getElementById("infoAgend").dataset.agendamento;

    const empresaNome =
      empresaId === 1 ? "Jaú Pesca" :
        empresaId === 2 ? "Jaú Fishing" :
          empresaId === 3 ? "L.T. Sports" :
            "Nenhuma";
    const observacoes = `Conferência - AgendamentosWeb\nAg.: ${numeroAgendamento}\nMktp.: ${marketplaceAgendamento}\nEmp.: ${empresaNome}\nCo.: ${nomeColaborador}`

    // if(defineEntrada === 1) {
    transferirEstoque(id_depositoS, id_prod, un_prod, "S", accessToken, observacoes); // "S" = Saída do estoque
    //   defineEntrada = 2;
    // } else {
    transferirEstoque(id_depositoE, id_prod, un_prod, "E", accessToken, observacoes); // "E" = Entrada no estoque
    //   defineEntrada = 1;
    // }    
  }
  notify('Operação concluída!\n Todos os itens do agendamento estão sendo transferidos');
}

// Função que faz a transferência de estoque
async function transferirEstoque(id_deposito, id_prod, un_prod, tipo, token, observacoes) {
  // Aqui agora vai vir a função que vai fazer a requisição para o Python onde o mesmo fará a transferência de estoque
  // Como o Python vai colocar meio que em fila, então será possível usar outro endpoint para saber o status do processo


  // Depósitos 

  // "id": 888484781,
  // "nome": "Amazon FULL Silvio",

  // "id": 789951727,
  // "nome": "Americanas FULL PESCAJAU",

  // "id": 813254602,
  // "nome": "Avarias (Defeito)",

  // "id": 822208355,
  // "nome": "Deposito 141 Produção",

  // "id": 785301556,
  // "nome": "Deposito 151 Inferior",

  // "id": 894837591,
  // "nome": "Deposito 151 Mesanino",

  // "id": 894837619,
  // "nome": "Deposito 177 Cx Fechado",

  // "id": 897682013,
  // "nome": "Deposito Caixas",

  // "id": 814366386,
  // "nome": "Empresa CT Fishing",

  // "id": 814366459,
  // "nome": "Empresa LT SPORTS",

  // "id": 888484630,
  // "nome": "Estudio",

  // "id": 789951567,
  // "nome": "Magalu FULL PESCAJAU",

  // "id": 888526350,
  // "nome": "Mercado Livre Full CT FISHING",

  // "id": 888526346,
  // "nome": "Mercado Livre Full LT SPORTS",

  // "id": 787964633,
  // "nome": "Mercado Livre Full PESCAJAU",

  // "id": 889339924,
  // "nome": "Monstruario Leandro Turatti",

  // "id": 889339919,
  // "nome": "Monstruario Marcos",

  // "id": 813254664,
  // "nome": "Servico de Terceiros",

  // "id": 895899591,
  // "nome": "Shopee Full JAUFISHING",

  // "id": 895899584,
  // "nome": "Shopee Full LT SPORTS",

  // "id": 895899410,
  // "nome": "Shopee Full S de Alencar",

  // notify('Processando...\n Transferência de estoque sendo feita. Por favor aguarde 😉', { type: 'info', duration: 3000 });

  const payload = {
    id_deposito: id_deposito,
    id_produto: id_prod,
    unidades: un_prod,
    tipo: tipo, // também aceita "Saída"
    auth_token: token,
    observacoes: observacoes
  };

  console.log('Este é o payload >', payload);

  const resp = await fetch('/transf-estoque', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });


  const data = await resp.json();
  console.log('Resultado da transferência de estoque >', data);
  // const taskId = data.task_id;

  // if (!taskId) {
  //   throw new Error('task_id ausente na resposta do servidor');
  // }

  // try {
  //   const resultado = await acompanharStatus(taskId, 5000, 180000); // verifica a cada 5s, timeout 3min
  //   console.log("Transferência finalizada com sucesso:", resultado);
  // } catch (err) {
  //   console.error("Falha na transferência:", err);
  // }
}

// /**
//  * Faz polling do status da transferência de estoque.
//  * @param {string} taskId - ID da tarefa retornado pelo Python.
//  * @param {number} intervalo - Intervalo entre checagens (ms).
//  * @param {number} timeout - Tempo máximo para aguardar (ms).
//  * @returns {Promise<object>} - Resolve com o resultado final ou rejeita com erro.
//  */
// function acompanharStatus(taskId, intervalo = 5000, timeout = 120000) {
//   return new Promise((resolve, reject) => {
//     const inicio = Date.now();

//     const timer = setInterval(async () => {
//       try {
//         const resp = await fetch(`/transf-estoque/status/${taskId}`);
//         if (!resp.ok) throw new Error(`Falha na consulta: ${resp.status}`);

//         const data = await resp.json();
//         console.log(`Status atual da task ${taskId}:`, data.status);
//         console.log('Resposta inteira >', data);
//         if (data.status === "concluido") {
//           clearInterval(timer);
//           resolve(data); // { status: "concluido", result: {...} }
//         } else if (data.status === "falhou") {
//           clearInterval(timer);
//           reject(data.error); // Detalhes do erro
//         } else if (Date.now() - inicio >= timeout) {
//           clearInterval(timer);
//           reject(new Error("Tempo limite excedido para concluir a transferência"));
//         }
//       } catch (err) {
//         clearInterval(timer);
//         reject(err);
//       }
//     }, intervalo);
//   });
// }

(() => {
  const STATE = { ready: false, container: null, queue: [] };

  // garante DOM pronto
  function onReady() {
    STATE.ready = true;
    STATE.container = ensureContainer();
    // entrega toasts que chegaram antes do DOM
    for (const { msg, opts, resolve } of STATE.queue.splice(0)) {
      resolve(_notify(msg, opts));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

  // cria ou reutiliza o container (.toast-container)
  function ensureContainer() {
    let el = document.querySelector('.toast-container');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast-container';
      document.body.appendChild(el);
    }
    return el;
  }

  // cria a estrutura do toast e controla vida/animacoes
  function _notify(message, { type = 'info', duration = 2000 } = {}) {
    const container = STATE.container || ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const btnClose = document.createElement('button');
    btnClose.className = 'toast__close';
    btnClose.type = 'button';
    btnClose.setAttribute('aria-label', 'Fechar notificação');
    btnClose.textContent = '×';

    const msg = document.createElement('div');
    msg.className = 'toast__message';
    msg.textContent = String(message ?? '');

    const progress = document.createElement('div');
    progress.className = 'toast__progress';

    toast.appendChild(btnClose);
    toast.appendChild(msg);
    toast.appendChild(progress);
    container.prepend(toast);

    // anima entrada
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // barra de progresso reversa controlada por JS (independe de @keyframes)
    let removed = false;
    let start = Date.now();
    let remaining = Math.max(0, duration);

    function setProgressWidth(msRemaining) {
      const pct = Math.max(0, Math.min(100, (msRemaining / duration) * 100));
      progress.style.width = `${pct}%`;
    }

    // estado inicial
    progress.style.transition = 'none';
    setProgressWidth(remaining);
    // dispara transição -> 0%
    requestAnimationFrame(() => {
      progress.style.transition = `width ${remaining}ms linear`;
      setProgressWidth(0);
    });

    const remove = () => {
      if (removed) return;
      removed = true;
      toast.style.transition = 'transform .18s ease, opacity .18s ease';
      toast.style.transform = 'translateY(-6px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 180);
    };

    let timer = setTimeout(remove, remaining);

    // fechar manual
    btnClose.addEventListener('click', () => {
      clearTimeout(timer);
      remove();
    });

    // pausar/resumir no hover
    let paused = false;
    const pause = () => {
      if (paused || removed) return;
      paused = true;
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      remaining = Math.max(0, remaining - elapsed);
      // congela barra
      const nowPct = (remaining / duration) * 100;
      progress.style.transition = 'none';
      setProgressWidth(remaining);
    };
    const resume = () => {
      if (!paused || removed) return;
      paused = false;
      start = Date.now();
      // retoma transição do ponto atual
      requestAnimationFrame(() => {
        progress.style.transition = `width ${remaining}ms linear`;
        setProgressWidth(0);
      });
      timer = setTimeout(remove, remaining);
    };

    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', resume);

    return toast;
  }

  // API pública: retorna o elemento do toast
  function notify(message, opts) {
    if (STATE.ready) return _notify(message, opts);
    // se chamado antes do DOM, enfileira e devolve uma pseudo-promise de elemento
    return new Promise((resolve) => STATE.queue.push({ msg: message, opts, resolve }));
  }

  // helpers
  notify.success = (m, o = {}) => notify(m, { ...o, type: 'success' });
  notify.error = (m, o = {}) => notify(m, { ...o, type: 'error' });
  notify.info = (m, o = {}) => notify(m, { ...o, type: 'info' });
  notify.warn = (m, o = {}) => notify(m, { ...o, type: 'warning' });

  // expõe global
  window.notify = notify;

  // notify('Operação concluída!');
  // notify.success('Estoque transferido!', { duration: 3000 });
  // notify.error('Saldo insuficiente para Saída.');
  // notify('Processando...\nAguarde.', { type: 'info', duration: 5000 });
})();

async function editarProdutoCompLapis(sku) {
  // Se precisar popular algo dinamicamente:
  // document.querySelector('#conteudoModalEditarProduto p:nth-child(2) strong').textContent = sku;

  const listaProdutos = document.getElementById('listaProdutos');
  const bipados = document.querySelector(`[data-sku="${sku}"]`).dataset.bipados;

  console.log('listaProdutos >', listaProdutos);

  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);

  console.log('Produtos >', produtos);

  const comp = produtos.flatMap(p => p.composicoes ?? []).find(c => c.sku === sku);


  console.log('Este é o produto composição >', comp);

  const response = await fetch(`/api/bipagem/detalhe?id_agend_ml=${idAgend}&sku=${sku}`);
  const data = await response.json();
  console.log('data >', data);
  let totalBipadosOriginal = 0;

  if (data.bipagem === null || data.bipagem === undefined) {
    totalBipadosOriginal = 0;
  } else {
    totalBipadosOriginal = data.bipagem.bipados;
  }

  const porcento = comp.unidades_totais > 0 ? Math.min(100, Math.round((totalBipadosOriginal / comp.unidades_totais) * 100)) : 0;

  console.log('Total Bipados Original >', totalBipadosOriginal);
  const nomeProdOrigView = document.getElementById('master-nome');
  const skuView = document.getElementById('master-sku-view');
  const gtinView = document.getElementById('master-gtin');
  const img = document.getElementById('master-img');

  console.log('Valor de comp.nome:', comp.nome);
  nomeProdOrigView.innerHTML = comp.nome;
  skuView.innerHTML = comp.sku;
  gtinView.innerHTML = comp.gtin;

  // Exemplo para mudar a imagem
  // img.src = "https://blog.abler.com.br/wp-content/uploads/2022/08/Teste-de-Perfil-Comportamental.jpg"

  console.log('Total Bipados original 2>', data);
  console.log('Total Bipados original 3>', totalBipadosOriginal);
  listaProdutos.innerHTML = `
  <!-- ============ PRODUTO ORIGINAL (o primeiro da lista) ============ -->
          <div id="produto-ORIGINAL-${comp.id_tiny}" class="produto-item-modal" data-role="original">
            <div class="d-flex" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <div>
                <strong id="nome-${sku}">${comp.nome}</strong>
                <span id="sku-${sku}" class="badge">${sku}</span>
                <span id="tipo-${sku}" class="badge">Original</span>
              </div>
              <div class="small" style="font-size:.85rem; color:#6b7280;">
                Bipado: <strong id="bipado-${sku}">${totalBipadosOriginal}</strong> /
                Total: <strong id="total-${sku}">${comp.unidades_totais}</strong>
                (<span id="percent-${sku}">${porcento}</span>%)
              </div>
            </div>

            <!-- Barra de progresso -->
            <div id="progressWrap-${sku}" class="progress"
              style="height:10px; background:#e5e7eb; border-radius:6px; overflow:hidden; margin:8px 0;">
              <div id="progressFill-${sku}" class="progress-bar" role="progressbar"
                style="width:0%; background:#f59e0b; height:10px;" aria-valuenow="0" aria-valuemin="0"
                aria-valuemax="100"></div>
            </div>

            <!-- Controles de quantidade -->
            <div class="controls" style="display:flex; align-items:center; gap:8px;">
              <button id="menos-${sku}" class="btn btn-outline" onclick="removeUnEditarProduto('${sku}');" type="button">−</button>
              <input id="quantidade-${sku}" type="number" value="${totalBipadosOriginal}" min="0" step="1" style="width:100px;">
              <button id="mais-${sku}" class="btn btn-outline" onclick="addUnEditarProduto('${sku}');" type="button">+</button>

              <div class="ms-auto" style="margin-left:auto; font-size:.85rem; color:#6b7280;">
                Última ação: <strong id="status-${sku}">—</strong>
              </div>
            </div>
          </div>
          `;


  console.log('Req to DB | View EQUIVALENTES >', data);

  const fill = document.getElementById(`progressFill-${sku}`);
  fill.style.width = `${porcento}%`;
  fill.setAttribute('aria-valuenow', bipados);
  fill.setAttribute('aria-valuemax', comp.unidades_totais);



  data.equivalentes.forEach(p => {
    console.log('data,equivalentes <', p);

    const porcentoEquiv = comp.unidades_totais > 0 ? Math.min(100, Math.round((p.bipados / comp.unidades_totais) * 100)) : 0;

    listaProdutos.innerHTML += `
      <!-- ============ PRODUTO EQUIVALENTE ============ -->
      <div id="produto-EQV-${p.id_tiny_equivalente}" class="produto-item-modal" data-role="equivalente">
        <!-- lixeira no canto direito -->

        <div class="d-flex" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div>
            <strong id="nome-${p.sku_bipado}">${p.nome_equivalente}</strong>
            <span id="sku-${p.sku_bipado}" class="badge">${p.sku_bipado}</span>
            <span id="tipo-${p.sku_bipado}" class="badge">Equivalente</span>
          </div>
          <div class="small" style="font-size:.85rem; color:#6b7280;">
            Bipado: <strong id="bipado-${p.sku_bipado}">${p.bipados}</strong> /
            Total: <strong id="total-${p.sku_bipado}">${comp.unidades_totais}</strong>
            (<span id="percent-${p.sku_bipado}">${porcentoEquiv}</span>%)
          </div>
        </div>

        <!-- Barra de progresso -->
        <div id="progressWrap-${p.sku_bipado}" class="progress"
          style="height:10px; background:#e5e7eb; border-radius:6px; overflow:hidden; margin:8px 0;">
          <div id="progressFill-${p.sku_bipado}" class="progress-bar" role="progressbar"
            style="width:0%; background:#3b82f6; height:10px;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
          </div>
        </div>

        <!-- Controles de quantidade -->
        <div class="controls" style="display:flex; align-items:center; gap:8px;">
          <button id="menos-${p.sku_bipado}" onclick="removeUnEditarProduto('${p.sku_bipado}');" type="button" class="btn btn-outline">−</button>
          <input id="quantidade-${p.sku_bipado}" type="number" value="${p.bipados}" min="0" step="1" style="width:100px;">
          <button id="mais-${p.sku_bipado}" onclick="addUnEditarProduto('${p.sku_bipado}');" type="button" class="btn btn-outline">+</button>


          <div class="last-action-wrap">
            <button id="excluir-${p.sku_bipado}" class="btn-icon"
                    aria-label="Excluir equivalente"
                    title="Excluir equivalente"
                    data-sku-original="${sku}"
                    data-sku-equivalente="${p.sku_bipado}"
                    data-id-tiny="${p.id_tiny_equivalente}"
                    onclick="excluirEquivalente(this)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm2 5h2v11h-2V8Zm-4 0h2v11H7V8Zm8 0h2v11h-2V8Z"/>
              </svg>
            </button>

            <span class="status">
              Última ação: <strong id="status-${p.sku_bipado}">—</strong>
            </span>
          </div>


        </div>
      </div>
            `;


    const fillEquiv = document.getElementById(`progressFill-${p.sku_bipado}`);
    fillEquiv.style.width = `${porcentoEquiv}%`;
    fillEquiv.setAttribute('aria-valuenow', p.bipados);
    fillEquiv.setAttribute('aria-valuemax', comp.unidades_totais);

  });

  // Mostra o modal
  document.getElementById('modal-editar-produto').style.display = 'block';

  // Evita o scroll de fundo (opcional)
  document.body.style.overflow = 'hidden';
}

async function excluirEquivalente(obj) {
  console.log('Este é o OBJETO à ser excluído:', obj);
  const skuExcloi = obj.id.replace("excluir-", "");
  const skuOriginal = obj.dataset.skuOriginal;
  console.log('Este é o SKU do objeto:', skuExcloi);
  console.log('Este é o SKU Original do objeto:', skuOriginal);


  const payload = {
    id_agend: idAgend,
    sku_original: skuOriginal,
    sku_bipado: skuExcloi
  };

  const resp = await fetch('/api/equiv/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  console.log('Resposta da exclusão:', data);

  if (data.ok) {
    notify.success(`O produto com o SKU "${skuExcloi}" foi excluído com sucesso!`);

    const id_tiny_equivalente = obj.dataset.idTiny;
    const div = document.getElementById(`produto-EQV-${id_tiny_equivalente}`);

    div.remove();
  } else {
    notify.error(`Ocorreu um erro ao tentar excluir o produto. Contate um Desenvolvedor.`);
    console.log('Erro ao tentar excluir produto equivalente do agendamento:', data);
  }

}

function addUnEditarProduto(sku) {
  const input = document.getElementById(`quantidade-${sku}`);
  let value = Number(input.value)
  value++;
  let totalBipados = 0;
  const produtos = document.querySelectorAll('#listaProdutos [id^="produto-"]');
  const totalPermitido = Number(produtos[0].querySelector('[id^="total-"]').textContent.trim());
  console.log(produtos);

  produtos.forEach(prod => {
    const bipadoElement = prod.querySelector('[id^="quantidade-"]');

    if (bipadoElement) {
      const bipadoValue = Number(bipadoElement.value.trim());
      console.log(`Produto: Sla → Bipado: ${bipadoValue}`);
      totalBipados += bipadoValue;
    }
  });
  console.log('Total Existente:', totalBipados);
  console.log('Total Permitido', totalPermitido);

  if (++totalBipados <= totalPermitido) {
    input.value = value;
  } else {
    notify.error('Você não pode adicionar mais produtos do que o agendamento está pedindo.');
  }
}

function removeUnEditarProduto(sku) {
  const input = document.getElementById(`quantidade-${sku}`);
  let value = Number(input.value)
  value--;

  if (value >= 0) {
    input.value = value;
  } else {
    notify.error('Não é possível adicionar unidades negativas ao agendamento! \nPor favor, nem tente ;-)');
  }
}

async function salvarAlteracoes() {
  // Aqui, para otimizar a quantidade de requisições feitas ao banco  
  // Ele deve verificar o que houve mudanças, para isso, verifica se os valores são iguais 
  // ou seja, se bipados e a quantidade que está no input são iguais, se sim então ignora, caso contrário faz a alteração

  const confirmado = await salvarAlteracoesConfirmacaoGerente();
  const listaProdutos = document.querySelectorAll('#listaProdutos [id^="produto-"]');
  const listaEditados = [];

  for (let i = 0; i < listaProdutos.length; i++) {
    const bipadosOriginal = Number(listaProdutos[i].querySelector('[id^="bipado-"]').textContent.trim());
    // console.log(`Bipados de cada um #${i+1}>`, bipadosOriginal);
    const bipadosEditado = listaProdutos[i].querySelector('[id^="quantidade-"]').value;
    // console.log(`Bipados editado >`, bipadosEditado);

    if (Number(bipadosOriginal) !== Number(bipadosEditado)) {
      console.log(`Índice ${i} foi editado`);
      listaEditados.push(listaProdutos[i]);
    }
  }
  console.log('Estes foram editados >', listaEditados);

  console.log('listaProdutos >', listaProdutos);

  if (listaEditados.length > 0) {
    for (const prod of listaEditados) {
      console.log('>', prod);

      if (prod.id.includes("EQV")) {
        console.log('EQV');
        const input = prod.querySelector('[id^="quantidade-"]');
        const skuOriginal = document.getElementById('master-sku-view').textContent.trim();
        const skuBipado = input.id.replace("quantidade-", "");
        console.log('Esse é o SKU >', skuOriginal);


        const bipadosOriginal = Number(prod.querySelector('[id^="bipado-"]').textContent.trim());
        const bipadosEditado = prod.querySelector('[id^="quantidade-"]').value;
        const delta = bipadosEditado - bipadosOriginal;

        const payload = {
          id_agend: idAgend,
          sku_original: skuOriginal,
          sku_bipado: skuBipado,
          quant: delta
        }

        console.log('Este será o payload >', payload);

        console.log('Fazendo requisição');
        const req = await fetch('/api/equiv/add-unidades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await req.json();

        console.log('Essa foi a resposta da requisição de edit >', data);
        if (data.ok) {
          notify.success(`Edição do produto: ${skuBipado}               \nRealizado com sucesso!`);
        } else {
          notify.success(`Ocorreu um erro ao editar o produto: ${skuBipado}               \n`);
          console.log('Erro >', data);
        }
      } else if (prod.id.includes("ORIGINAL")) {
        console.log('ORIGINAL');
        const skuOriginal = document.getElementById('master-sku-view').textContent.trim();
        const input = prod.querySelector(`[id^="quantidade-${skuOriginal}"]`);

        console.log('Esse é o SKU >', skuOriginal);
        console.log(`bipado-${skuOriginal}`);


        const bipadosOriginal = Number(document.getElementById(`bipado-${skuOriginal}`).textContent.trim());
        const bipadosEditado = document.getElementById(`quantidade-${skuOriginal}`).value;

        const delta = bipadosEditado - bipadosOriginal;
        console.log('Delta T>', delta);

        const payload = {
          id_agend: idAgend,
          sku: skuOriginal,
          quant: delta
        };
        console.log('Payload ORiginal >', payload);

        const req = await fetch('/api/bipar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await req.json();
        console.log('Data Resposta para o produto original >', data);

        if (data.ok) {
          notify.success(`Edição do produto original: ${skuOriginal}           \nRealizado com sucesso!`);
        } else {
          notify.success(`Ocorreu um erro ao editar o produto: ${skuOriginal}               \n`);
          console.log('Erro >', data);
        }
      }
    };
    fecharModal();
  } else {
    fecharModal();
    notify('Não houve nenhuma alteração no produto.');
  }
}

async function verificarSeECaixaFechada(skuOriginalParaValidar) {
  try {
    const getComp = await fetch(`/api/tiny/composicao-por-sku?sku=${encodeURIComponent(skuOriginalParaValidar)}`, {
      method: 'GET',
      headers: { "Accept": "application/json" },
      credentials: "include"
    });

    if (!getComp.ok) {
      // HTTP 4xx/5xx
      return null;
    }

    const composicao = await getComp.json();
    console.log('Resposta composição:', composicao);

    // Guardas
    if (!composicao || composicao.ok === false) return null;
    if (!Array.isArray(composicao.kit)) return null;
    if (composicao.kit.length !== 1) return null;

    const k = composicao.kit[0];
    if (!k || !k.produto) return null;

    return {
      id_tiny: k.produto.id,
      sku: k.produto.sku,
      nome: k.produto.descricao,
      un: k.quantidade
    };
  } catch (err) {
    console.error("Falha ao buscar composição:", err);
    return null;
  }
}

async function salvarAlteracoesConfirmacaoGerente() {

  return true
}

function fecharModal() {
  document.getElementById('modal-editar-produto').style.display = 'none';
  document.body.style.overflow = '';
}

// Fecha clicando fora
window.addEventListener('click', (e) => {
  const modal = document.getElementById('modal-editar-produto');
  if (e.target === modal) fecharModal();
});

// Fecha com ESC
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharModal();
});