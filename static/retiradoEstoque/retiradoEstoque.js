const urlParams = new URLSearchParams(window.location.search);
const idAgend = parseInt(urlParams.get('id'), 10);

let inicioTimestamp = null;
let intervaloTempo = null;
let tempoEstimadoSegundos = 0;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// --- Helpers p/ imagem da composição (modal) ---
const PLACEHOLDER_IMG = "/static/resources/sem_img.webp";
const _compImageCache = new Map();

// Atualiza a imagem do "izinho" do produto com base no value do select de depósito
function atualizarThumbPorSelect(selectEl) {
  if (!selectEl) return;

  const codigo = String(selectEl.value || '').trim();
  if (!codigo) return;

  // sobe até o card do produto (lista principal OU modal)
  const card = selectEl.closest('.produto-item-modal, .produto-item');
  if (!card) return;

  // pega a imagem dentro do popover daquele card
  const img = card.querySelector('.produto-thumb-popover img');
  if (!img) return;

  // monta o caminho da imagem no /static/resources
  img.src = `/static/resources/${codigo}.png`;
}

// Pausa o auto-refresh da lista quando o usuário está interagindo (modal aberto / input aberto)
window.pauseAutoRefresh = false;

// estado do modal de equivalente
let _eqModalSkuTarget = null;

// trava e cache do modal de equivalentes
let _equivBusy = false;
const _equivCache = new Map(); // chave: valor digitado (normalizado) -> Promise/resultado

async function _fetchImageForComp(comp) {
  try {
    if (!comp) return PLACEHOLDER_IMG;

    // chave de cache robusta
    const key = comp.id_comp ?? `${comp.fk_id_prod}|${comp.sku || ''}|${comp.id_tiny || ''}`;
    if (_compImageCache.has(key)) return _compImageCache.get(key);

    let url = PLACEHOLDER_IMG;

    if (comp.id_comp) {
      const r = await fetch(`/api/retirado/composicao/${comp.id_comp}/imagem`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      url = j.url || PLACEHOLDER_IMG;
    } else if (comp.fk_id_prod) {
      const qs = new URLSearchParams({
        fk_id_prod: String(comp.fk_id_prod),
        sku: comp.sku || "",
        id_tiny: comp.id_tiny ? String(comp.id_tiny) : ""
      });
      const r = await fetch(`/api/retirado/composicao/imagem?${qs}`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      url = j.url || PLACEHOLDER_IMG;
    }

    _compImageCache.set(key, url);
    return url;
  } catch {
    return PLACEHOLDER_IMG;
  }
}

function _getCompsJson() {
  try {
    return JSON.parse(document.getElementById("js-data")?.dataset?.comps || "[]");
  } catch { return []; }
}

/**
 * Encontra a composição pelo SKU dentro do payload do template
 * e retorna { id_comp, imagem_url_comp } (se existirem).
 */
function _findCompBySku(sku) {
  const blocos = _getCompsJson(); // esperado: [{ composicoes: [...] }, ...]
  for (const bloco of blocos) {
    const arr = Array.isArray(bloco.composicoes) ? bloco.composicoes : [];
    for (const c of arr) {
      if (String(c.sku || "").trim() === String(sku).trim()) return c;
    }
  }
  return null;
}

// ======================================================
const normSku = v => String(v ?? '').trim().toLowerCase();
const onlyDigits = v => String(v ?? '').replace(/\D/g, '');

// usar em seletores CSS
const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s);

// usar ao imprimir valores em HTML (Swal/innerHTML)
const escHtml = (s) => String(s ?? '')
  .replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const toNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

// GTIN válido: 8, 12, 13 ou 14 dígitos
const normGTIN = v => {
  const d = onlyDigits(v);
  return (d.length === 8 || d.length === 12 || d.length === 13 || d.length === 14) ? d : null;
};

// ID Tiny: só dígitos; se vazio vira null (assim não "casa" quando ambos são vazios)
const normIdTiny = v => {
  const d = onlyDigits(v);
  return d.length ? d : null;
};
// ======================================================
// Resolve a imagem da composição com 3 tentativas:
// 1) imagem vinda no JSON
// 2) endpoint backend (se existir)
// 3) fallback direto no Tiny via /api/tiny-proxy
// === Novo trecho completo ===
// === Novo trecho completo ===
async function resolveCompImage(comp) {
  if (!comp) return PLACEHOLDER_IMG;

  // 1) veio no JSON
  if (comp.imagem_url_comp && String(comp.imagem_url_comp).trim()) {
    return comp.imagem_url_comp;
  }

  // 2) backend resolve por id_comp ou (fk_id_prod/sku/id_tiny)
  try {
    const key = comp.id_comp ?? `${comp.fk_id_prod}|${comp.sku || ''}|${comp.id_tiny || ''}`;
    if (_compImageCache.has(key)) return _compImageCache.get(key);

    let url = PLACEHOLDER_IMG;
    if (comp.id_comp) {
      const r = await fetch(`/api/retirado/composicao/${comp.id_comp}/imagem`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      url = j.url || PLACEHOLDER_IMG;
    } else if (comp.fk_id_prod) {
      const qs = new URLSearchParams({
        fk_id_prod: String(comp.fk_id_prod),
        sku: comp.sku || "",
        id_tiny: comp.id_tiny ? String(comp.id_tiny) : ""
      });
      const r = await fetch(`/api/retirado/composicao/imagem?${qs}`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      url = j.url || PLACEHOLDER_IMG;
    }

    _compImageCache.set(key, url);
    return url;
  } catch {
    return PLACEHOLDER_IMG;
  }
}
// ======================================================

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
  setInterval(() => {
    if (!window.pauseAutoRefresh) {
      carregarProgressoServer();
    }
  }, 2 * 1000);


  // ─── atalho Enter nos inputs ─────────────────────
  ['skuInput', 'quantidadeInput'].forEach(id =>
    document.getElementById(id)
      .addEventListener('keydown', e => { if (e.key === 'Enter') biparProduto(); })
  );

  // Aqui ele pega as informações que estão no HTML e transforma em variáveis usáveis no JS
  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);
  // // console.log('>', produtos); // TODO REMOVER DEPOIS (DEBUG)

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
  // // console.log('Empresa>', empresaNome); // TODO REMOVER DEPOIS (DEBUG)
  // // console.log('Nº Agendamento>', numeroAgendamento); // TODO REMOVER DEPOIS (DEBUG)
  // // console.log('Colaborador>', nomeColaborador); // TODO REMOVER DEPOIS (DEBUG)
  // // console.log('Marketplace>', marketplaceAgendamento); // TODO REMOVER DEPOIS (DEBUG)

  // // console.log('Produtos>', produtos); // TODO REMOVER DEPOIS (DEBUG)

  let obj = [];

  const resultado = produtos.filter(p =>
    p.composicoes.some(c => c.sku === "JP12324")
  );

  // // console.log('Esse aqui é o resultado askdaldkajsdl >', resultado); // TODO REMOVER DEPOIS (DEBUG)
  preencherDepositosIniciais();

  // ─── Pausar auto-refresh ao interagir com os selects de depósito nos PENDENTES ──
  const pendentesContainer = document.getElementById('pendentesContainer');
  if (pendentesContainer) {
    // quando focar/clicar em um <select> de depósito -> pausa auto-refresh
    pendentesContainer.addEventListener('focusin', (e) => {
      if (e.target && e.target.matches('.deposito-select')) {
        window.pauseAutoRefresh = true;
      }
    });

    // quando sair do <select> -> libera auto-refresh novamente
    pendentesContainer.addEventListener('focusout', (e) => {
      if (e.target && e.target.matches('.deposito-select')) {
        window.pauseAutoRefresh = false;
      }
    });
  }
});

function defineImgDepositos() {
  // Atualiza tanto os selects da lista principal quanto os do modal
  document
    .querySelectorAll('.deposito-select, .deposito-select-modal')
    .forEach(sel => atualizarThumbPorSelect(sel));
}

// ─── busca estado no servidor e atualiza UI ─────────────────────
async function carregarProgressoServer() {
  try {
    const resp = await fetch(`/api/bipados-total/${idAgend}`, { credentials: 'include' });
    if (!resp.ok) throw new Error(resp.statusText);
    const dados = await resp.json();
    // console.log('Kelvinhoooo >', dados);
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
  const total = toNum(item?.dataset?.total, 0);
  const barra = item.querySelector('.progress-bar');

  item.querySelector('.bipados').textContent = `Bipados: ${bip}`;
  const pct = total > 0 ? (bip / total) * 100 : 0;
  barra.style.width = `${pct}%`;
  barra.setAttribute('aria-valuenow', bip);
  barra.textContent = `${Math.round(pct)}%`;

  // tira qualquer sujeira antiga de bg-success/text-white (bootstrap)
  item.classList.remove('bg-success', 'text-white');

  if (bip >= total) {
    // produto concluído: usa a classe própria de estilo
    item.classList.add('concluido');
    barra.classList.remove('bg-warning');
    barra.classList.add('bg-success');
  } else {
    // produto ainda em andamento/pendente
    item.classList.remove('concluido');
    barra.classList.remove('bg-success');
    barra.classList.add('bg-warning');
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
    const m = estP.textContent.match(/(\d{2})h (\d{2})m (\d{2})s/);
    if (m) {
      const [, h, mnt, s] = m;
      tempoEstimadoSegundos = (+h * 3600) + (+mnt * 60) + (+s);
    } else {
      tempoEstimadoSegundos = 0;
    }
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
  atualizarContadores();
  const skuEl = document.getElementById('skuInput'); // Define o elemento input de sku/gtin
  const qtdEl = document.getElementById('quantidadeInput'); // Define o elemento input de unidades

  let sku = (skuEl?.value || '').trim(); // Define o valor inserido no input de sku/gtin
  let qtd = Number(qtdEl?.value); // Define a quantidade 

  if (!sku || !Number.isFinite(qtd) || qtd <= 0) return; // Se algum dos valores estiver vazio ou inválido, não faz nada

  const jsonComps = _getCompsJson(); // Captura todos os produtos em JSON retorna uma lista
  console.log('jsonComps >', jsonComps);

  // Cada produto dentro da lista tem "composicoes" dentro dele sempre vai ter um produto, podendo ser ele mesmo (se for produto SIMPLES)
  // ou mais de um se for KIT, tendo isso em mente, o código abaixo ele procura por cada uma das composições e retorna a primeira que o valor bipado
  // bata com o SKU ou então com o GTIN/EAN da composição
  // Ele retorna a composição que bateu

  //Faz uma verificação antes de prosseguir
  const comps = (jsonComps || []).flatMap(p => p.composicoes || [])
  if (comps.length <= 0) return;
  let prodBipado = comps.find(c => normSku(c.sku) === normSku(sku) || normGTIN(c.gtin) === onlyDigits(sku));
  console.log('prodBipado >', prodBipado);

  let item = null;
  if (prodBipado) {
    item = document.querySelector(`.produto-item[data-sku="${esc(prodBipado.sku)}"]`);
    if (!item) return;

    console.log('Adicionando unidades ao banco (prod Original)');

    // Antes de adicionar as unidades ao banco e mandar ele atualizar as coisa tudo
    // Vamos primeiro fazer uma verificação
    // Se o valor total vai exceder o necessário (Ex: Precisa ir 100, já foi bipado 90 se o usuário bipar mais do que 10 ele não permite e dá erro.)

    if (await validarSeNaoExcedeuQuantidadeMaxima(item, qtd)) {
      await addUnidadesProdOriginal(prodBipado, qtd);
      atualizarContadores();
      console.log('Adicionando unidades ao banco (prod Original)');
    }
  }

  // 1) Tenta achar o item pelo SKU informado (SKU original no DOM)
  console.log(item);


  // 2) Se não achou, tenta mapear pelo SKU/GTIN das composições e ajustar para o SKU da composição (LEGACY)
  // 2) Se não achou verifica se é um produto equivalente (NEW)

  // 3) Busca equivalentes do agendamento
  if (!prodBipado) {
    const listaEquivalentes = await listarEquivalentes(idAgend); // deve retornar { bruto: [...] }
    console.log('listaEquivalentes >', listaEquivalentes);
    let prodEquiv = listaEquivalentes.bruto.find(p => normSku(p.sku_bipado) === normSku(sku) || onlyDigits(p.gtin_bipado) === onlyDigits(sku));

    // Se ele acha um produto equivalente ele já está subindo no banco certinho!
    if (prodEquiv) {
      console.log('prodEquiv >', prodEquiv);
      console.log('Adicionando ao banco a unidade equivalente...');

      // Verifica se excede o limite
      item = document.querySelector(`.produto-item[data-sku="${esc(prodEquiv.sku_original)}"]`);
      if (!item) {
        await Swal.fire({
          icon: 'error',
          title: 'Produto não localizado neste agendamento.',
          text: 'O item bipado não pertence a este agendamento.',
          timer: 3500, showConfirmButton: false
        });
        return;
      }

      if (await validarSeNaoExcedeuQuantidadeMaxima(item, qtd)) {
        await addUnidadesEquivalentes(prodEquiv, qtd);
        atualizarContadores();
        console.log('Adicionado ao banco!');
      }
    } else {
      console.log('Não encontrou nenhum produto equivalente.') // Depois a lógica vai ser ele procurar no Tiny
      const buscarTiny = await buscarProdutoTiny(sku); // Busca o produto no Tiny (Primeiro por EAN e depois por SKU)
      await defineProdFazBipagem(buscarTiny, qtd, prodBipado, prodEquiv, comps, listaEquivalentes);
    }
  }

  // Reset UI
  skuEl.value = '';
  qtdEl.value = 1;
  skuEl.focus();
  atualizarContadores();
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
    // mantém visual de concluído (bordas/verdes, barra verde)
    item.classList.add('concluido');
    item.classList.remove('bg-success', 'text-white');

    const barra = item.querySelector('.progress-bar');
    if (barra) {
      barra.classList.remove('bg-warning');
      barra.classList.add('bg-success');
    }

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
  const urlParams = new URLSearchParams(window.location.search);
  const idAgend = parseInt(urlParams.get('id'), 10);

  const { isConfirmed } = await Swal.fire({
    title: "Confirmar",
    text: "Deseja realmente finalizar a conferência deste agendamento?",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#28a745",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Sim, finalizar!",
    cancelButtonText: "Cancelar"
  });
  if (!isConfirmed) return;

  Swal.fire({
    title: 'Finalizando…',
    html: 'Gerando relatório e encerrando conferência.',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const csrf = getCsrf();
    const resp = await fetch(`/relatorio/finalizar/${idAgend}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        // cobre os n omes mais usados pelos frameworks
        'X-CSRFToken': csrf,      // Django
        'X-CSRF-Token': csrf,     // Rails/Express
        'X-XSRF-TOKEN': csrf      // Laravel/Sanctum
      },
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data?.message || `HTTP ${resp.status}`);

    // ✅ primeiro finaliza, depois dispara a transferência
    await agendamentoFinalizadoChamarTransferencia();
    await Swal.fire({
      icon: 'success',
      title: 'Sucesso!',
      text: 'Conferência finalizada e movimentação enfileirada.',
      timer: 1500,
      showConfirmButton: false
    });

    window.location.href = '/agendamentos/ver?finalizado=conferencia_ok';
  } catch (err) {
    console.error(err);
    Swal.fire('Erro!', String(err?.message || err), 'error');
  }
}

function getCsrf() {
  // tenta meta <meta name="csrf-token" content="...">
  const m = document.querySelector('meta[name="csrf-token"], meta[name="csrf"]');
  if (m?.content) return m.content;

  // tenta cookies mais comuns: Laravel/Django/etc.
  const c = document.cookie.match(/(?:^|;\s*)(XSRF-TOKEN|XSRF|csrftoken|csrf_token)=([^;]+)/);
  return c ? decodeURIComponent(c[2]) : '';
}

// // Rotaciona o código utilizando a chave
// function dec(b64, key) {
//   const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
//   const k = new TextEncoder().encode(key);
//   for (let i = 0; i < bytes.length; i++) bytes[i] ^= k[i % k.length];
//   return new TextDecoder().decode(bytes);
// }

// async function getTinyToken(empresa, marketplace) {
//   const PATH_KEY = 'tP2TTtorDkG6sxdA7UTkg2ErxBHQ7fRvQfpDLRSbBu2fswYxxmkZpf7pBusDpVJWiWCBrdsPU5rsDQfU3DB72ZiB5eJ3W7QtvAgUdRopfDDtbdijak2tP3PJmDyK3PzaQgD7gi6MtoPP3Y8QeF7VuYq4zEVHYGURCkXJxo3uEu48bbKWnQzhoyNvpzANfiFTJ7ZMsY58v9rSKZk88yLvMMhyBmoYg7zmfbqSjWJPsrBca7uSsjaNTT4qPRddkky956W7BvkaGPcmZAzSmCriGmCBwBwxFT49uxf6hhDcTq8unsbfSLjLzikxTji9dtNZ7DkvAfEYAcJBq7HoPug9E9HNPiEy9gSc5qys2zHBGQ9ez8iKGLegQCom3Km6T8zyMamMdPb29BYRutwaRd5TzhccD5Vzm2KxeoKNZzxdvgLaKCm9HgPLTb5pdDdWLAcmXqJK6iHk5kdgXCAzsnKKoieFxVNAWRiUMJYYmyvsX5ACBSPsnW8f4QAT6ohVSGMC';
//   const PASS_KEY = 'GE7bKeydUk8zEmqMoXM2uSF3i8PYXVAXh5nvQM7UwGbjWmxkFRYdr7HUbzP8WUSJkUF4AxFTooNqReDYqPUoLRG75ypxij88tZ2MWNzciWyAwZ4c68F2GHYQNirS4L7kVQhMMqgTdqX2sJmF2PvtukmvZ4AjieP3cnvJZ6zRPqYPV3RzNeT35rmT3mU4ob4hUeagosEz4m5rNEHKv9ni26PBZYyPVyqycoYn3gvxAM5Vaz2L88cLxUqsfwaAJtNdxeBwUuJRQfrW6qFV4aa39EWFkDaMisizZnEGQhc5AGDzJXmApoQE55W4fm6L67wY6PTmQpoeio9vfNdawhXetDg8PE2ZRCkDZTQeXunL9z4YFwEeFghQ6T4gtKr8647VaRKDL4rV4twKfyUrAjyHSiEJNPNaehzET3koczEToJnE3EJxv5z8gPsMMgZe5ChNQDADKeydspxEALbraQqLw3zxUsBAJFfmKPmpDA3cbsrL93gvLCbabeiYx8BmoEd5';
//   const PATH_COD = 'GTNjMDAXJwcsJR1YRxUTDHIdEBsjUxcnMiQZYnM1OCU+PEc2OCY3LwBGZSQbQRg/KwMKYxMoDjp0DQMAOD4wDR04dzI3AgkVBU0dFCVlVWxwKnRgXCIvIFIkI3cxYikAQyI3bSVhDkIlcTQyVFBeECoEXRVjShUtAhVLH2AnGw9lHXx0CABuPD8lBGJgGFMGMQt6YUANNQ1OKmECOCoCO3YTCHMvOX4Bc0FiUCwJIRQJCx0eHAMjHgIQLAQ+UBVnOAQuKUcBBnkffBNqDTBTf3YRCAAvIipNNho7FxdBKzVSVzMHGiMpNABLNyFZfCZnGDksKBkiZDQbIzw3HjlLfQZUBw41Gy8jAQNWHzU2CDgdNCEcPTgOIUQzMBB0O2VBLRksTCI5FwYSJVMPPzY4VDsLJgkbPwQIYxAGeiAHJDJZFClPKlI/I3kOMAA2ZRo6EwEzaRF4AgAFKzE+TggJAEI9DypXIBs6BiNtMUkPHRESCCM2MwBcVWcMVU8XXAM/ARULeA0CUXF9ADo/MD8GBxNQQRZJAysCfFwTTlpTLBJXFxMWL0JBHCcrI1UKAglKOCMTODIqZgIgAQUzChITAwsGMBNlMC4ODC4GDjo7CwsUHRMhWCsgKC07HCkbMBg8dTwtEj86LysKUCxxehUTEAY0UC5xOHg/YiosFSFxKxA='
//   const PASS_COD = 'A2ZWLwoEMgMbXFkRLDo5Cko9CH9BdgV2Sg9nKm5gBTsMUAsVCD9CDCVhAQMkDD8hHzZ9ChhWMCRET3QMJSAnPxIsBgEoHzEQOhw6EjsKZxcACTs+LRpkXWAqOxspXXJtRjdmO3IQGwRKGwsfIxF0GQIZGH8Lay0BDyw5dV4+fD4/FT4VLEYkO1Y8AgA1DDofcA4RGUwzLBg0Yy8MJzE4EiImMihtRjBxOQUROTNUYSw/RjF+ZDBfBHQfdgMiQ1cMcwo5Dkkecx5bC20mGHMSMi4aBwtCdxcqFAwnFwE4VA9HDREMCxcCOSw9cw82T3cnC00gKgFtRTYoBwkJCDUCQSAREidhMSACFCQRPXdDMSJ4VVdySDQtEQ5gFQwcCgASCB0jdSYjIBE4LiMkfDIIEUUjAh8HYj1yF1tYJVhzDzpnIRwzKRUfQSw5DgIFKjcSFUl+CjgxURwqH0NtDBE1Im4lPhUvVh0dYShdawIVcEAiLF8LRxVbIRckBGICQ30CP2sFFj8RFwJGASQAEE9gGgM4LDg1OCd9e2I2U10ZTxADXhw+UQgBBjg7KTBZJBkfLgcwVhQoNx4KAzUQfxA2AhRgNyMIOyBdARkoAnImNBc/OjR5IVwOPD4ZKSwpAD8KDxoJJAoSQFYbKRRqcUkCBgwEUDEsURsfPQ8YLwgSDV0=';

//   const path = dec(PATH_COD, PATH_KEY).trim();
//   const pass = dec(PASS_COD, PASS_KEY).trim();
//   // console.log('Senha:', pass);
//   const url = 'https://n8n.jaupesca.com.br/webhook/' + path + `?empresa=${empresa}&marketplace=${marketplace}`;

//   try {
//     // const response = await fetch(url, {
//     //   method: 'POST',
//     //   headers: {
//     //     'Content-Type': 'application/json',
//     //     'Authorization': `${pass}`
//     //   },
//     //   body: JSON.stringify({
//     //     empresa: empresa,
//     //     marketplace: marketplace,
//     //     agendamento: agendamento,
//     //     colaborador: colaborador,
//     //     produtos_agendamento: obj
//     //   })
//     // });

//     // if (!response.ok) {
//     //   const txt = await response.text().catch(() => '');
//     //   throw new Error(`HTTP ${response.status} – ${txt}`);
//     // }


//     // const data = await response.json();
//     // console.log('Resposta do n8n:', data);
//     // return data;

//     const resp = await fetch(url, {
//       method: 'GET',
//       headers: {
//         'Authorization': `${pass}`
//       },
//       credentials: 'include'
//     });

//     if (!resp.ok) {
//       throw new Error(`HTTP ${resp.status} | ${resp.json}`);
//     }

//     const data = await resp.json();
//     console.log('Resposta do n8n:', data);
//     return data;

//   } catch (error) {
//     console.error('Erro na requisição:', error);
//   }
// }

function adicionarEquivalente(sku) {
  resetModalEquivalenteUI(); // limpa UI anterior (soft)
  _eqModalSkuTarget = sku;

  // preenche informações e abre o modal
  document.getElementById('eq-sku-master').textContent = sku;

  const m = document.getElementById('modal-equivalente');
  m.style.display = 'block';
  document.body.style.overflow = 'hidden';
  window.pauseAutoRefresh = true;

  const input = document.getElementById('eq-input');
  input.value = '';
  input.focus();

  // Enter confirma
  if (!input._enter) {
    input._enter = true;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmarModalEquivalente();
    });
  }
}

function fecharModalEquivalente(hard = true) {
  resetModalEquivalenteUI({ hard });
  const m = document.getElementById('modal-equivalente');
  m.style.display = 'none';
  document.body.style.overflow = '';
  window.pauseAutoRefresh = false;
}

function resetModalEquivalenteUI({ hard = false } = {}) {
  const modal = document.getElementById('modal-equivalente');
  if (!modal) return;
  const content = modal.querySelector('.modal-content') || modal;

  // 1) overlay de confirmação + classe confirming
  content.querySelector('#eq-confirm-overlay')?.remove();
  content.classList.remove('confirming');

  // 2) input e mensagens
  const input = document.getElementById('eq-input');
  if (input) {
    input.value = '';
    input.disabled = false;
  }
  const erroDiv = document.getElementById('erroBuscaEquivalenteDiv');
  if (erroDiv) {
    erroDiv.innerHTML = '';
    erroDiv.classList.add('input-equivalente-off'); // volta a esconder
  }

  // 3) cabeçalho do modal e rolagem
  const skuMaster = document.getElementById('eq-sku-master');
  if (skuMaster) skuMaster.textContent = '—';
  content.scrollTop = 0;

  // 4) estado interno
  _eqModalSkuTarget = null;
  _equivBusy = false;
  if (hard) _equivCache.clear(); // se quiser zerar o cache entre aberturas
}

// === Novo trecho completo ===
async function confirmarModalEquivalente() {
  if (document.querySelector('#modal-equivalente .eq-confirm-overlay')) return;

  const inputEl = document.getElementById('eq-input');
  const val = (inputEl?.value || '').trim();
  if (!val) { notify.error('Digite ou bipe um SKU/GTIN.', { duration: 3000 }); return; }

  if (_equivBusy) return;
  _equivBusy = true; inputEl.disabled = true;

  try {
    const key = val.toLowerCase();
    let resultadoPromise = _equivCache.get(key);
    if (!resultadoPromise) {
      resultadoPromise = buscaProdutoEquivalente(val);
      _equivCache.set(key, resultadoPromise);
      setTimeout(() => _equivCache.delete(key), 60_000);
    }
    const produtoEquivalente = await resultadoPromise;

    // trata objeto {result, message}
    if (produtoEquivalente && typeof produtoEquivalente === 'object' && 'result' in produtoEquivalente) {
      notify.error(produtoEquivalente.message || 'Referência não permitida.', { duration: 4000 });
      return;
    }
    if (produtoEquivalente === 3) {
      notify.error('Nenhum produto encontrado (GTIN ou SKU inválidos).', { duration: 4000 });
      return;
    }

    await confirmaProdutoEquivalente(produtoEquivalente.itens[0], _eqModalSkuTarget);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/429/.test(msg)) notify.error('Tiny respondeu 429 (limite de requisições). Tente novamente em alguns segundos.', { duration: 5000 });
    else notify.error(msg, { duration: 5000 });
  } finally {
    _equivBusy = false; inputEl.disabled = false;
  }
}

// fechar modal-equivalente clicando fora / com ESC
window.addEventListener('click', (e) => {
  const m = document.getElementById('modal-equivalente');
  if (e.target === m) fecharModalEquivalente(true);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharModalEquivalente(true);
});


async function verificaAdicaoProdutoEquivalentePermitido(valorBipado) {
  const raw = document.getElementById("js-data").dataset.comps;
  const anunciosOriginais = JSON.parse(raw);

  const normSku = v => String(v ?? '').trim().toLowerCase();
  const normGtin = v => String(v ?? '').replace(/\D+/g, '');

  const valorSku = normSku(valorBipado);
  const valorGtin = normGtin(valorBipado);

  // junta todas as composições do agendamento sem duplicar SKU
  const vistos = new Set();
  const produtosComposicoes = [];
  anunciosOriginais.forEach(p => {
    (Array.isArray(p.composicoes) ? p.composicoes : []).forEach(c => {
      const keySku = normSku(c.sku);
      if (vistos.has(keySku)) return;
      vistos.add(keySku);
      produtosComposicoes.push({ sku: keySku, gtin: normGtin(c.gtin) });
    });
  });

  // 1) bloquear se tentar usar algo que já é do agendamento (SKU/GTIN)
  for (const p of produtosComposicoes) {
    const clashSku = p.sku === valorSku;
    const clashGtin = !!valorGtin && p.gtin === valorGtin;
    if (clashSku || clashGtin) {
      return {
        result: 1,
        message: 'Você não pode definir um produto do agendamento como Equivalente'
      };
    }
  }

  // 2) bloquear duplicata no BD (SKU/GTIN normalizados)
  let data = [];
  try {
    const resp = await fetch(`/api/equiv/${idAgend}`, { credentials: 'include' });
    data = await resp.json();
  } catch { /* backend também valida; aqui é só UX */ }

  for (const p of data) {
    const skuEq = normSku(p.sku_bipado);
    const gtinEq = normGtin(p.gtin_bipado);
    if (skuEq === valorSku || (!!valorGtin && gtinEq === valorGtin)) {
      return {
        result: 2,
        message: `Referência duplicada: ${valorBipado} já está cadastrada como equivalente de ${p.sku_original} e não pode ser registrada novamente.`
      };
    }
  }

  return null; // permitido
}

// === Novo trecho completo ===
async function buscaProdutoEquivalente(valorBipado) {
  // 1) validações/limites do seu fluxo continuam valendo
  const permitido = await verificaAdicaoProdutoEquivalentePermitido(valorBipado);
  if (permitido) {
    notify.error(permitido.message, { duration: 4000 });
    return permitido.result; // 1 = tentou usar item do agendamento | 2 = duplicado
  }

  // 2) backend resolve por GTIN ou SKU e já tenta kit
  const url = `/api/tiny/composicao-auto?valor=${encodeURIComponent(valorBipado)}`;
  const r = await fetch(url, { credentials: 'include' });

  if (r.status === 429) throw new Error('429');
  const j = await r.json().catch(() => ({}));

  if (!r.ok || !j.ok) {
    // mantém semântica antiga: 3 = “não encontrado”
    return 3;
  }

  // 3) Se você precisa do array no formato {itens:[...]}, normalize:
  //    Aqui usamos o próprio candidato (id/sku/descricao) como "item"
  //    e, se for kit, você pode criar itens derivados.
  const itens = [];
  if (j.id_tiny) {
    // detalhe do produto (para pegar sku/gtin/descricao/anexos se quiser)
    const d = await fetch(`/api/tiny/produto/${j.id_tiny}`, { credentials: 'include' })
      .then(x => x.json().catch(() => ({})))
      .catch(() => ({}));

    const prod = d?.produto || {};
    itens.push({
      id: j.id_tiny,
      sku: prod?.codigo || prod?.sku || '',
      gtin: prod?.gtin || '',
      descricao: prod?.descricao || '',
      situacao: prod?.situacao || 'A'
    });
  }

  if (itens.length === 0) return 3;
  return { itens };
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
    signal: ctrl.signal,
    credentials: 'include'
  });
  clearTimeout(t);

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg += ` – ${j.error}`; } catch { }
    throw new Error(msg);
  }
  return res.json();
}

async function resolveReferenciaUniversal(ref) {
  return fetchJSON('/api/resolve-referencia', {
    method: 'POST',
    body: { id_agend: idAgend, ref }
  });
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

async function validarSeNaoExcedeuQuantidadeMaxima(item, qtd) {
  console.log('ITEM >>>', item);
  if (!item) return false;

  const totalDom = toNum(item?.dataset?.total, 0);
  let atual = toNum(item?.dataset?.bipados, 0); // fallback local
  const sku = item?.dataset?.sku;

  // 2) checagem robusta
  if (!Number.isFinite(atual) || !Number.isFinite(totalDom)) {
    await Swal.fire({
      icon: 'error',
      title: 'Dados inválidos para validação de total.',
      timer: 3000,
      showConfirmButton: false
    });
    return false;
  }

  // 3) valida limite
  const permitido = totalDom - atual;
  if (qtd > permitido) {
    await Swal.fire({
      icon: 'error',
      title: 'Total excedido!',
      html: `Você pode adicionar no máximo <b>${permitido}</b> unidade(s) para <b>${escHtml(sku)}</b>.<br>
             Atual: <b>${atual}</b> • Total: <b>${totalDom}</b>`,
      timer: 5000,
      showConfirmButton: false
    });
    return false;
  }

  return true;
}

async function defineProdFazBipagem(buscarTiny, qtd, prodBipado, prodEquiv, comps, listaEquivalentes) {
  if (!buscarTiny) return;
  if (!buscarTiny.ok) { // Se não encontrar ou der qualquer erro

    if (buscarTiny.status === 429) {
      Swal.fire({ icon: 'error', title: 'Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.', timer: 3000, showConfirmButton: false });
      return;
    } else if (buscarTiny.status === 401) {
      Swal.fire({ icon: 'error', title: `Sessão expirada. Por favor faça login novamente.`, timer: 3000, showConfirmButton: false });
      return;
    } else if (buscarTiny.status === 400) {
      Swal.fire({ icon: 'error', title: 'Nenhum produto encontrado com o SKU/EAN enviado', timer: 2500, showConfirmButton: false });
    } else {
      Swal.fire({ icon: 'error', title: `ERRO: ${buscarTiny.error}`, timer: 2500, showConfirmButton: false });
      console.log('ERRO:', buscarTiny.error);
      return;
    }
  }

  console.log('Resposta da requisição ao Tiny >', buscarTiny); // DEBUG
  const prodBipadoSave = prodBipado;
  const prodEquivSave = prodEquiv;
  const compsSave = comps;
  const listaEquivalentesSave = listaEquivalentes;

  const prodTiny = buscarTiny.itens[0]; // Captura o primeiro índice (único produto localizado a partir do valor bipado)
  if (!prodTiny) { // Se não conseguir encontrar... (não faço ideia de como cairia aqui)
    Swal.fire({ icon: 'error', title: `Por favor contate um administrador do sistema. Erro no Tiny. Dados no Console`, timer: 2500, showConfirmButton: false });
    console.log('prodBipado >', prodBipado);
    console.log('prodEquiv >', prodEquiv);
    console.log('buscarTiny >', buscarTiny);
    console.log('prodTiny >', prodTiny);
    return;
  }

  // Existe a possibilidade do usuário bipar uma caixa fechada
  // A caixa fechada ela contém X unidades dentro dela
  // O Tiny reconhece como KIT, tendo em sua composição apenas um produto real
  // Dentro dele se mostra também várias unidades, sendo assim, precisamos verificar se ele está bipando uma caixa ou um produto simples.
  // Se simples => 1 Un (ou quantas o usuário definiu)
  // Se KIT => X Un (Quantas unidades estiverem no KIT)

  if (prodTiny.tipo === "S") { // Simples
    prodBipado = comps.find(c => normSku(c.sku) === normSku(prodTiny.sku) || normGTIN(c.gtin) === onlyDigits(prodTiny.gtin)); // A partir disso ele define o produtoOriginal bipado

    if (!prodBipado) { // Se não conseguir encontrar, pode ser que não seja um produto original, pode ser um produto equivalente
      // Então ele tenta buscar um produto equivalente também
      prodEquiv = listaEquivalentes.bruto.find(p => normSku(p.sku_bipado) === normSku(prodTiny.sku) || onlyDigits(p.gtin_bipado) === onlyDigits(prodTiny.gtin));

      if (!prodEquiv) {
        Swal.fire({ icon: 'error', title: 'Nenhum produto encontrado com o SKU/EAN enviado', timer: 2500, showConfirmButton: false });
        return;
      }

      // Verifica se não excede o limite
      const item = document.querySelector(`.produto-item[data-sku="${esc(prodEquiv.sku_original)}"]`);
      if (!item) {
        await Swal.fire({
          icon: 'error',
          title: 'Produto fora do agendamento',
          text: 'O item bipado não pertence a este agendamento.',
          timer: 3500, showConfirmButton: false
        });
        return;
      }

      if (await validarSeNaoExcedeuQuantidadeMaxima(item, qtd)) {
        await addUnidadesEquivalentes(prodEquiv, qtd);
        atualizarContadores();
      }
      return;
    } else {
      // Verifica se não excede o limite
      const item = document.querySelector(`.produto-item[data-sku="${esc(prodBipado.sku)}"]`);
      if (!item) {
        await Swal.fire({
          icon: 'error',
          title: 'Produto fora do agendamento',
          text: 'O item bipado não pertence a este agendamento.',
          timer: 3500, showConfirmButton: false
        });
        return;
      }

      if (await validarSeNaoExcedeuQuantidadeMaxima(item, qtd)) {
        await addUnidadesProdOriginal(prodBipado, qtd);
        atualizarContadores();
      }
      return;
    }
  } else if (prodTiny.tipo === "K") {
    console.log('ProdTiny para KIT >', prodTiny);
    const compKit = (await buscarCompKit(prodTiny.id))?.item;
    if (!compKit) return;

    console.log('compKit >', compKit);

    const buscarTinyComp = await buscarProdutoTiny(compKit.sku); // Busca o produto no Tiny (Primeiro por EAN e depois por SKU)
    console.log('buscarTinyComp >', buscarTinyComp);
    await defineProdFazBipagem(buscarTinyComp, compKit.quantidade, prodBipadoSave, prodEquivSave, compsSave, listaEquivalentesSave);
    return;
  }
}

async function buscarCompKit(idEanSku) {
  const url = `/api/tiny/kit-item?valor=${encodeURIComponent(idEanSku)}`;

  try {
    const r = await fetch(url, { credentials: 'include' });

    // sucesso
    if (r.ok) {
      // sempre tente parsear JSON; se não for JSON, lança (o endpoint sempre manda JSON)
      return await r.json();
    }

    // falha HTTP: tenta extrair payload de erro uma vez só
    const errPayload =
      (await r.clone().json().catch(() => null)) ||
      { error: await r.clone().text().catch(() => 'Erro desconhecido') };

    // roteia por status
    switch (r.status) {
      case 400:
        await Swal.fire({
          icon: 'error',
          title: 'Produto não encontrado ou não é KIT',
          timer: 2500,
          showConfirmButton: false
        });
        break;

      case 401:
        await Swal.fire({
          icon: 'error',
          title: 'Sessão expirada. Faça login novamente.',
          timer: 3000,
          showConfirmButton: false
        });
        break;

      case 409: {
        const count = errPayload?.count ?? 'vários';
        await Swal.fire({
          icon: 'error',
          title: `Kit com múltiplos itens (${count}).`,
          text: 'Esta operação exige kits com apenas 1 item.',
          timer: 3500,
          showConfirmButton: false
        });
        break;
      }

      case 429:
        await Swal.fire({
          icon: 'error',
          title: 'Muitas consultas em pouco tempo.',
          text: 'Aguarde alguns segundos e tente novamente.',
          timer: 3000,
          showConfirmButton: false
        });
        break;

      case 502:
        console.error('Detalhe Tiny:', errPayload?.detalhe || errPayload?.error);
        await Swal.fire({
          icon: 'error',
          title: 'Falha ao contatar Tiny',
          text: 'Mais detalhes no console (chamar ADM).',
          timer: 3000,
          showConfirmButton: false
        });
        break;

      case 503:
        await Swal.fire({
          icon: 'error',
          title: 'Token do Tiny indisponível no servidor',
          text: 'Chame um administrador.',
          timer: 3000,
          showConfirmButton: false
        });
        break;

      default:
        console.error('Erro inesperado:', r.status, errPayload);
        await Swal.fire({
          icon: 'error',
          title: 'Erro inesperado',
          text: 'Veja detalhes no console (chamar ADM).',
          timer: 3000,
          showConfirmButton: false
        });
    }

    // Retorna um shape de erro consistente para quem chamou (se precisar checar)
    return { ok: false, status: r.status, ...errPayload };

  } catch (e) {
    // erro de rede / CORS / abort
    console.error('Network/Fetch error:', e);
    await Swal.fire({
      icon: 'error',
      title: 'Falha de rede',
      text: 'Não foi possível contatar o servidor. Verifique sua conexão.',
      timer: 3000,
      showConfirmButton: false
    });
    return { ok: false, status: 0, error: 'network_error' };
  }
}

async function buscarProdutoTiny(sku) {
  try {
    const r = await fetch(`/api/tiny/buscar-produto?valor=${encodeURIComponent(sku)}`, { credentials: 'include' });
    if (!r.ok) throw r;
    //   {
    //   const txt = await r.text().catch(() => '');
    //   throw new Error(`HTTP ${r.status} – ${txt}`);
    // }
    return r.json();
  } catch (e) {
    if (e?.status === 400) {
      Swal.fire({ icon: 'error', title: 'Nenhum produto encontrado com o SKU/EAN enviado', timer: 2500, showConfirmButton: false });
      return;
    }
    const status = e?.status || 0;
    const text = (typeof e.text === 'function') ? await e.text().catch(() => '') : String(e);
    Swal.fire({ icon: 'error', title: `ERRO HTTP ${status}`, text, timer: 2500, showConfirmButton: false });
    return;
  }
}
async function addUnidadesProdOriginal(prodOriginal, qtd) {
  const payload = {
    id_agend: idAgend,
    sku: prodOriginal.sku,
    quant: qtd
  };

  const r = await fetch('/api/bipar', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} – ${txt}`);
  }
  return r.json();
}
async function addUnidadesEquivalentes(produtoBipado, qtd) {
  const payload = {
    id_agend: idAgend,
    sku_original: produtoBipado.sku_original,
    sku_bipado: produtoBipado.sku_bipado,
    quant: qtd
  };

  const requestAdd = await fetch('/api/equiv/add-unidades', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // ⚠️ aqui era `res.status` — CORRIGIDO:
  if (!requestAdd.ok) {
    const txt = await requestAdd.text().catch(() => '');
    throw new Error(`HTTP ${requestAdd.status} – ${txt}`);
  }
  return requestAdd.json();
}

// exemplo
// === Novo trecho completo ===
async function addDbEquivalente(sku, valorBipado) {
  const raw = document.getElementById("js-data").dataset.comps;
  const produtos = JSON.parse(raw);
  const nomeColaborador = document.getElementById("infoAgend").dataset.colaborador;

  // 1) Localiza o produto de referência (case-insensitive)
  let prodRef = null;
  for (const p of produtos) {
    const composicoes = p.composicoes || [];
    for (const c of composicoes) {
      if (c.sku === sku) { prodRef = c; break; }
    }
    if (prodRef) break;
  }
  if (!prodRef) {
    notify.error(`SKU de referência não encontrado: ${sku}`, { duration: 4000 });
    return;
  }

  // 2) Busca no Tiny via backend (sem token no cliente)
  const produtoEquivalente = await buscaProdutoEquivalente(valorBipado);
  if (produtoEquivalente === 1 || produtoEquivalente === 2) return;
  if (produtoEquivalente === 3) {
    notify.error('Nenhum produto encontrado (GTIN ou SKU inválidos)', { duration: 5000 });
    return;
  }

  // 3) Confirmação do usuário
  const confirmed = await confirmaProdutoEquivalente(produtoEquivalente.itens[0], sku);
  if (confirmed.respostaUser === false) {
    notify('Adição de produto equivalente cancelada.');
    return;
  }

  // 4) Gravação
  const equivalente = produtoEquivalente.itens[0];
  const payload = {
    id_agend: idAgend,
    sku_original: prodRef.sku,
    gtin_original: prodRef.gtin,
    id_tiny_original: prodRef.id_tiny,
    nome_equivalente: equivalente.descricao,
    sku_bipado: equivalente.sku,
    gtin_bipado: equivalente.gtin,
    id_tiny_equivalente: equivalente.id,
    usuario: nomeColaborador || 'Desconhecido',
    observacao: confirmed.obs ?? "Não informado"
  };

  try {
    await fetchJSON('/api/equiv/bipar', { method: 'POST', body: payload });
    notify.success('Produto equivalente adicionado com sucesso!', { duration: 2000 });
  } catch (e) {
    notify.error(`Erro ao gravar equivalente: ${e}`, { duration: 5000 });
  }
}

// === Novo trecho completo ===
async function confirmaProdutoEquivalente(prod, skuOriginal) {
  const modal = document.getElementById('modal-equivalente');
  const content = modal.querySelector('.modal-content') || modal;
  const comp = _findCompBySku(skuOriginal) || {};

  const inputEl = document.getElementById('eq-input');
  inputEl && (inputEl.disabled = true);

  content.classList.add('confirming');

  // imagem (placeholder se falhar) — agora via backend
  let imgUrl = PLACEHOLDER_IMG;
  try {
    const r = await fetch(`/api/tiny/produto/${prod.id}`, { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    const anexos = j?.produto?.anexos;
    if (Array.isArray(anexos) && anexos.length > 0) imgUrl = anexos[0].url;
  } catch { /* ignora e mantém placeholder */ }

  let ov = content.querySelector('#eq-confirm-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'eq-confirm-overlay';
    ov.className = 'eq-confirm-overlay';
    content.appendChild(ov);
  }

  ov.innerHTML = `
    <h3 class="titulo-vermelho" style="margin:0 0 .5rem;">Confirmar equivalente</h3>
    <p><strong>${prod.descricao}</strong></p>
    <p style="margin:-2px 0 8px;">SKU: <b>${prod.sku}</b> · GTIN: <b>${prod.gtin || '—'}</b></p>
    <img alt="Imagem do produto" src="${imgUrl}" class="eq-confirm-img">
    <p>Adicionar este item como equivalente de <b>${skuOriginal}</b>${comp?.nome ? ' — ' + comp.nome : ''}?</p>
    <input id="eq-obs" class="form-control" placeholder="Observação (opcional)">
    <div class="eq-confirm-footer">
      <button id="eq-confirm-no" class="btn btn-outline-secondary" type="button">Voltar</button>
      <button id="eq-confirm-yes" class="btn btn-primary" type="button">Confirmar</button>
    </div>
  `;

  const cleanup = () => {
    ov.remove();
    content.classList.remove('confirming');
    inputEl && (inputEl.disabled = false);
  };

  ov.querySelector('#eq-confirm-no').onclick = () => fecharModalEquivalente(true);

  ov.querySelector('#eq-confirm-yes').onclick = async (e) => {
    const btn = e.currentTarget;
    if (btn._busy) return;
    btn._busy = true;
    btn.disabled = true;

    const nomeColaborador = document.getElementById('infoAgend').dataset.colaborador || 'Desconhecido';
    const obs = ov.querySelector('#eq-obs')?.value || 'Não informado';

    const payload = {
      id_agend: idAgend,
      sku_original: comp.sku || skuOriginal,
      gtin_original: comp.gtin || null,
      id_tiny_original: comp.id_tiny || null,
      nome_equivalente: prod.descricao,
      sku_bipado: prod.sku,
      gtin_bipado: prod.gtin || null,
      id_tiny_equivalente: prod.id,
      usuario: nomeColaborador,
      observacao: obs
    };

    try {
      await fetchJSON('/api/equiv/bipar', { method: 'POST', body: payload });
      notify.success('Produto equivalente adicionado com sucesso!', { duration: 2000 });
      cleanup();
      fecharModalEquivalente();
      carregarProgressoServer();
    } catch (e) {
      notify.error(`Erro ao gravar equivalente: ${e}`, { duration: 5000 });
      btn._busy = false;
      btn.disabled = false;
    }
  };

  return { respostaUser: true, obs: null };
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

/**
 * Agrupa por (id_produto, de, para, etapa, equivalente) e agrega pk_list.
 * Não mexe em "unidades" (você já soma em outro lugar).
 * - Evita duplicar PKs (Set)
 * - Normaliza tipos pra chave estável
 * - Retorna pk_list ordenada
 *
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
function groupPkList(rows) {
  const toBool = (v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return ['true', '1', 'yes', 'y', 'sim'].includes(v.trim().toLowerCase());
    return Boolean(v);
  };

  const keyOf = (r) => JSON.stringify({
    id_produto: String(r.id_produto),
    de: Number(r.de),
    para: Number(r.para),
    etapa: String(r.etapa),
    equivalente: toBool(r.equivalente),
  });

  const map = new Map();

  for (const r of rows) {
    const key = keyOf(r);
    let acc = map.get(key);
    if (!acc) {
      const { pk, ...rest } = r;        // remove pk do “modelo”
      acc = { ...rest, pk_list: new Set() };
      map.set(key, acc);
    }
    if (r.pk !== undefined && r.pk !== null) {
      acc.pk_list.add(r.pk);
    }
  }

  // Converte Set -> Array e ordena pk_list
  return Array.from(map.values()).map(o => {
    const list = Array.from(o.pk_list);
    const allNumeric = list.every(v => typeof v === 'number' || /^\d+$/.test(String(v)));
    if (allNumeric) list.sort((a, b) => Number(a) - Number(b));
    else list.sort(); // ordenação lexicográfica para strings mistas
    return { ...o, pk_list: list };
  });
}

//? Ajuste esses IDs conforme seu mapeamento atual (ou traga do expedicao.js para 1 fonte só)
//? const DEPOSITO_ORIGEM = 785301556; //* Estoque (151) 
//? const DEPOSITO_DESTINO = 822208355; //* Produção (141)

//! DEPÓSITO | ID DEPÓSITO
//? 151             = 785301556
//? 1511 (Mesanino) = 894837591
//? 161 (Edícula)   = 905539821
//? 171             = 905539832
//? 177             = 894837619

async function agendamentoFinalizadoChamarTransferencia(DEPOSITO_DESTINO = 822208355) {
  // console.log('Função de transferencia chamada...'); // TODO REMOVER DEPOIS (DEBUG)
  // ! Como eu estou modificando para o ID de origem vir a partir de cada produto (vindo do DB)
  // ! Não será mais necessário esse "DEPOSITO_ORIGEM" é igual ao depósito destino, pois agora só será possível enviar ao banco valores pré definidos.
  // // * Apenas um guardinha de trânsito... Não é para acontecer, mas vai que o depósito origem e destino são iguais né...
  // if (DEPOSITO_ORIGEM === DEPOSITO_DESTINO) {
  //   throw new Error('Depósitos iguais — operação inválida.');
  // }

  //? Busca a bipagem no banco
  const url = `/api/agendamento/${idAgend}/completo`;
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) { //! Se deu algum erro na requisição ele ignora e não faz a transferência de *NADA*
    throw new Error(`Erro: ${resp.status} \n${resp.statusText}`);
  }

  // * Se deu tudo certo então define bipagemCompleta
  const bipagemCompleta = await resp.json();
  let listaObjPrincipal = []; //? Cria uma lista de objetos principal, ele será colocado dentro de "movimentos" no payload...
  //? Ele que será enviado para a rota fazer a transferência, ele basicamente avisa quais produtos devem ser transferidos, quantos e em qual depósito.
  // console.log('bipagemCompleta (DEBUG) >', bipagemCompleta); // TODO REMOVER DEPOIS (DEBUG)
  // console.log(bipagemCompleta.produtos.length); // TODO REMOVER DEPOIS (DEBUG)
  // console.log('Tipo de bipagemCompleta.produtos >', typeof bipagemCompleta.produtos); // TODO REMOVER DEPOIS (DEBUG)
  // console.log('É um array? >', Array.isArray(bipagemCompleta.produtos)); // TODO REMOVER DEPOIS (DEBUG)
  // ? Inicia um Looping onde esse looping serve para poder capturar os produtos do Agendamento e criar um objeto, a
  // console.log('bipagem completa >', bipagemCompleta);

  for (const prod of bipagemCompleta.produtos) {
    // console.log('Antes de verificar se vai pular ou não, essa é a variavel >', prod.bipagem.bipados); // TODO REMOVER DEPOIS (DEBUG)
    const p = prod.produto_original; // * Para facilitar na construção do Objeto

    // console.log('Antes de verificar se vai pular ou não, essa é a variavel >', p); // TODO REMOVER DEPOIS (DEBUG)
    // console.log('Antes de verificar se vai pular ou não, essa é a variavel >', prod.bipagem.bipados); // TODO REMOVER DEPOIS (DEBUG)
    //! Eu não tinha pensado nisso... Mas também é possível que não vá NADA do produto original!
    //! Exemplo: Produto original = Vara azul | Mas não vai vara azul, vai a vara verde, adiciona como equivalente apenas!
    const bipadosOriginal = prod.bipagem.bipados || 0; // ? Quantidade bipada do produto original (Caso não tenha nada, define como 0)
    // console.log('Quantidade bipada do produto original >', bipadosOriginal); // TODO REMOVER DEPOIS (DEBUG)
    if (bipadosOriginal > 0) { //! Sendo assim, caso aconteça de não ser enviado nada do produto original apenas não faça o objeto do produto original no Payload!
      // console.log('Maior que 0 >', prod);
      // console.log('Produto original que será processado (DEBUG) >', p); // TODO REMOVER DEPOIS (DEBUG)
      const objProdOriginal = { // ? Cira o objeto para o produto original
        // * NEW
        equivalente: false, // TODO DEBUG (Mas possivelmente pode acabar ficando posteriormente... Tinha pensado numa lógica, mas já esqueci '-' )
        etapa: 'conf', // TODO "conf" || "exp" (Isso define a coluna que é feita a transferência)
        pk: p.id_comp, // ? ID do produto (Database) que vai ser transferido (Original)
        // * NEW
        sku: p.sku_prod, // ? SKU do produto que vai ser transferido (Original)
        id_produto: p.id_prod_tiny, // ? ID do produto que vai ser transferido (Original)
        de: prod?.bipagem?.id_dep_origem || 785301556, // ? ID do depósito que vai ser debitado o valor bipado (Tiny) em caso de null o default é 785301556 (151)
        para: DEPOSITO_DESTINO, // ? ID do depósito que vai ser creditado o valor bipado (Tiny)
        unidades: prod.bipagem.bipados, // ? Quantidade que foi bipado do produto (Original)
        preco_unitario: 0 // * Isso daqui é opicional...
      }
      // console.log('Objeto do produto original criado (DEBUG) >', objProdOriginal); // TODO REMOVER DEPOIS (DEBUG)
      listaObjPrincipal.push(objProdOriginal); // ? Adiciona o objeto criado na lista de objetos
    }
    if (prod.equivalentes.length > 0) { //! Existe a possibilidadde de não haver produtos equivalentes, nesse caso apenas ignora
      for (const equiv of prod.equivalentes) {
        if (equiv.bipados <= 0) continue; //! Existe a possibilidade de haver produtos equivalentes porém sem ter sido bipado nenhuma unidade! Nesse caso, apenas ignore.
        // console.log('Produto equivalente que será processado (DEBUG) >', equiv); // TODO REMOVER DEPOIS (DEBUG)
        const objProdEquiv = { // ? Cira o objeto para o produto equivalente
          // equivalente: true, // TODO DEBUG (Mas possivelmente pode acabar ficando posteriormente... Tinha pensado numa lógica, mas já esqueci '-' )
          sku: equiv.sku_bipado, // ? SKU do produto que vai ser transferido (Equivalente)
          id_produto: equiv.id_tiny_equivalente, // ? ID do produto que vai ser transferido (Equivalente)
          de: equiv.id_dep_origem, // ? ID do depósito que vai ser debitado o valor bipado (Tiny)
          para: DEPOSITO_DESTINO, // ? ID do depósito que vai ser creditado o valor bipado (Tiny)
          unidades: equiv.bipados, // ? Quantidade que foi bipado do produto (Equivalente)
          preco_unitario: 0, // * Isso daqui é opicional...
          // **** NEW ****
          equivalente: true,
          etapa: 'conf',
          pk: equiv.id,
          // **** NEW ****
        }
        // console.log('Objeto do produto equivalente criado (DEBUG) >', objProdEquiv); // TODO REMOVER DEPOIS (DEBUG)
        listaObjPrincipal.push(objProdEquiv); // ? Adiciona o objeto criado na lista de objetos
      }
    } else { continue }
  }

  // ! Não sei se isso é uma possibilidade, mas é bom evitar...
  // ! Caso aconteça de não ter nada a transferir, retorna erro.
  if (listaObjPrincipal.length <= 0) throw new Error('Nada para transferir (bipagem total = 0).');
  // console.log('Objeto Principal (DEBUG) >', listaObjPrincipal); // TODO REMOVER DEPOIS (DEBUG)

  // ? Definindo variáveis para OBS (Tiny)
  const empresa = { 1: "Jaú Pesca", 2: "Jaú Fishing", 3: "L.T. Sports" }
  const info = document.getElementById("infoAgend")?.dataset || {};
  const empresaId = parseInt(info.empresa, 10);
  const numAg = info.agendamento;
  const mktp = info.marketplace;

  // Definindo Usuário que fez a transferência
  let user = ((await whoAmI())?.nome_display_usuario || "Indefinido");

  listaObjPrincipal = groupPkList(listaObjPrincipal);

  // // console.log('User >', user); // TODO REMOVER DEPOIS (DEBUG)
  const payload = {
    empresa: empresa[empresaId],             // opcional (futuro: seleção de token)
    observacoes: `Conferência - AgendamentosWeb \nAg.: ${numAg}\nMktp.: ${mktp}\nEmp.: ${empresa[empresaId]}\nCo.: ${user}`,      // opcional
    preco_unitario: 0,               // opcional; default=0
    movimentos: listaObjPrincipal
  }

  // console.log('Payload pronto para a transferência >', payload); // TODO REMOVER DEPOIS (DEBUG)

  // console.log('Preparando fetch para transferência de estoque...'); // TODO REMOVER DEPOIS (DEBUG)

  const transfReq = await fetch('/estoque/mover', {
    method: 'POST',
    credentials: 'include', // garante cookie de sessão
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!transfReq.ok) {
    const txt = await transfReq.text().catch(() => '');
    throw new Error(`Falha na transferência (${transfReq.status} ${transfReq.statusText}) ${txt}`);
  }

  return;
}
// agendamentoFinalizadoChamarTransferencia(); // TODOD REMOVER DEPOIS (DEBUG)

async function whoAmI() {
  const r = await fetch('/api/me', { credentials: 'same-origin' });
  if (!r.ok) return null;
  const j = await r.json();
  return j.authenticated ? j.user : null;
}

//? Essa função serve para toda vez que um select for modificado ele simplesmente altera no banco de dados o depósito de origem conforme selecionado.
async function onChangeDepositoBipagem(tipo, selectEl) {
  // tipo: 'original' | 'equivalente'
  console.log(selectEl);
  // Atualiza imediatamente a imagem do "izinho" conforme o depósito escolhido
  atualizarThumbPorSelect(selectEl);

  const codigo = String(selectEl.value || '').trim();
  const valorDep = Number(codigo);
  if (Number.isNaN(valorDep) || valorDep <= 0) {
    console.warn('id_dep_origem inválido em onChangeDepositoBipagem:', valorDep);
    return;
  }

  // id do agendamento (sempre vai existir na URL dessa tela)
  const urlParams = new URLSearchParams(window.location.search);
  const idAgend = parseInt(urlParams.get('id'), 10);

  let payload = {
    tipo,
    id_dep_origem: valorDep,
  };

  if (tipo === 'original') {
    const sku = selectEl.dataset.sku;
    if (!idAgend || !sku) {
      console.warn('Dados insuficientes para salvar depósito (original):', { idAgend, sku });
      return;
    }
    payload.id_agend = idAgend;
    payload.sku = sku;
  } else if (tipo === 'equivalente') {
    const idEquiv = selectEl.dataset.equivalenteId;
    if (!idEquiv) {
      console.warn('Dados insuficientes para salvar depósito (equivalente):', { idEquiv });
      return;
    }
    payload.id_equiv = Number(idEquiv);
  } else {
    console.warn('Tipo inválido em onChangeDepositoBipagem:', tipo);
    return;
  }

  try {
    const resp = await fetch('/api/dep-origem', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || data.ok !== true) {
      console.error('Falha ao atualizar depósito de origem:', data);
      // aqui dá pra plugar seu toast padrão
      alert('Falha ao atualizar o depósito de origem.');
      return;
    }

    console.log('Depósito de origem atualizado:', data);
    // se quiser, aqui dá pra disparar um toast bonitão:
    // notify.success('Depósito de origem atualizado.');
  } catch (err) {
    console.error('Erro de rede em onChangeDepositoBipagem:', err);
    alert('Erro de rede ao atualizar o depósito de origem.');
  }
}

async function preencherDepositosIniciais() {
  try {
    // pega o id do agendamento pela URL
    const urlParams = new URLSearchParams(window.location.search);
    const idAgend = parseInt(urlParams.get('id'), 10);

    if (!idAgend) {
      console.warn('ID de agendamento não encontrado na URL ao tentar preencher depósitos iniciais.');
      return;
    }

    const resp = await fetch(`/api/agendamento/${idAgend}/completo`, {
      credentials: 'include',
    });

    if (!resp.ok) {
      console.error('Falha ao buscar dados completos do agendamento:', resp.status, resp.statusText);
      return;
    }

    const data = await resp.json();
    const produtos = data?.produtos || [];

    if (!Array.isArray(produtos) || produtos.length === 0) {
      console.warn('Nenhum produto retornado em /api/agendamento/<id>/completo.');
      return;
    }

    // para cada produto, ajusta o select correspondente
    for (const item of produtos) {
      const prodOrig = item.produto_original || {};
      const bipagem = item.bipagem || {};

      const sku = (prodOrig.sku_prod || '').trim();
      if (!sku) continue;

      // se não tiver id_dep_origem definido ainda, usa 785301556 (Depósito 151)
      const idDepOrigem = bipagem.id_dep_origem ?? 785301556;

      const select = document.querySelector(
        `.deposito-select[data-sku="${CSS.escape(sku)}"]`
      );
      if (!select) continue;

      // seta o valor no select, se existir option correspondente
      const valorStr = String(idDepOrigem);
      const optionExiste = Array.from(select.options).some(opt => opt.value === valorStr);
      if (optionExiste) {
        select.value = valorStr;
      } else {
        console.warn(
          `Nenhum <option> no select de SKU=${sku} corresponde ao id_dep_origem=${idDepOrigem}.`
        );
      }
    }

    // 🔹 AGORA SIM: depois de todos os selects estarem corretos,
    // atualiza as imagens dos "izinhos" de acordo com o value atual
    defineImgDepositos();
  } catch (err) {
    console.error('Erro ao preencher depósitos iniciais:', err);
  }
}

// // TODO REMOVER DEPOIS (DEBUG)
// // async function testeDebug() { // TODO REMOVER DEPOIS (DEBUG)
// //   const response = await fetch('/api/retirado/329/originais-equivalentes'); // TODO REMOVER DEPOIS (DEBUG)
// //   const data = await response.json(); // TODO REMOVER DEPOIS (DEBUG)
// //   console.log(data); // TODO REMOVER DEPOIS (DEBUG)
// // } // TODO REMOVER DEPOIS (DEBUG)
// // testeDebug(); // TODO REMOVER DEPOIS (DEBUG)

async function moverEstoque(movimentos, meta = {}) {
  // movimentos: [{ sku?, id_produto, de, para, unidades, preco_unitario? }, ...]
  // meta: { empresa?, observacoes?, preco_unitario? }

  const payload = {
    empresa: meta.empresa || null,
    observacoes: meta.observacoes || null,
    preco_unitario: meta.preco_unitario ?? 0,
    movimentos
  };

  const resp = await fetch('/estoque/mover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include' // garante cookie de sessão
  });

  let data = {};
  try { data = await resp.json(); } catch { }
  if (!resp.ok || data.ok === false) {
    const msg = data?.error || `Falha ao mover estoque (HTTP ${resp.status})`;
    throw new Error(msg);
  }
  return data; // { ok:true, tasks:[...] }
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
    body: JSON.stringify(payload),
    credentials: 'include'
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
  // pausa auto-refresh e abre o modal imediatamente (loader)
  window.pauseAutoRefresh = true;

  const modalEl = document.getElementById('modal-editar-produto');
  modalEl.style.display = 'block';
  document.body.style.overflow = 'hidden';

  // overlay
  let _loadingEl = document.createElement('div');
  _loadingEl.className = 'loading';
  _loadingEl.id = 'modal-edit-loading';
  _loadingEl.textContent = 'Carregando...';
  modalEl.querySelector('.modal-content').appendChild(_loadingEl);

  const listaProdutos = document.getElementById('listaProdutos');

  const nomeProdOrigView = document.getElementById('master-nome');
  const skuView = document.getElementById('master-sku-view');
  const gtinView = document.getElementById('master-gtin');
  const img = document.getElementById('master-img');

  // estado inicial (skeleton/placeholder)
  nomeProdOrigView.textContent = '—';
  skuView.textContent = sku;
  gtinView.textContent = '—';
  img.src = PLACEHOLDER_IMG;
  img.classList.add('img-skeleton', 'skeleton');

  listaProdutos.innerHTML = `
    <div class="p-3 d-flex align-items-center gap-2">
      <div class="spinner" aria-label="Carregando"></div>
      <span style="color:#64748b">Carregando informações…</span>
    </div>
  `;

  // mostra o modal AGORA
  modalEl.style.display = 'block';
  document.body.style.overflow = 'hidden';

  try {
    // pega composição daquele SKU
    const raw = document.getElementById("js-data").dataset.comps;
    const produtos = JSON.parse(raw);
    const comp = produtos.flatMap(p => p.composicoes ?? []).find(c => c.sku === sku);
    const compEl = document.querySelector(`[data-sku="${esc(sku)}"]`);
    const compTotal = compEl?.dataset.total ?? "Não encontrado";

    if (!comp) {
      notify.error(`Composição não encontrada para o SKU ${sku}.`);
      fecharModal();
      return;
    }

    // busca totais do servidor p/ esse SKU original
    const response = await fetch(`/api/bipagem/detalhe?id_agend_ml=${idAgend}&sku=${encodeURIComponent(sku)}`, { credentials: 'include' });
    const data = await response.json();
    console.log('Esse aqui é o data, verifica se tem o id do depósito e onde ele está', data); // TODO [DEBUG]
    let totalBipadosOriginal = (data?.bipagem?.bipados ?? 0);
    const porcento = comp.unidades_totais > 0
      ? Math.min(100, Math.round((totalBipadosOriginal / comp.unidades_totais) * 100))
      : 0;

    // preenche painel esquerdo (master)
    nomeProdOrigView.textContent = comp.nome;
    skuView.textContent = comp.sku;
    gtinView.textContent = comp.gtin || '—';
    try {
      const url = await resolveCompImage(comp);
      img.src = url || PLACEHOLDER_IMG;
    } finally {
      img.classList.remove('img-skeleton', 'skeleton');
    }

    // pega o depósito de origem já retornado pelo backend (ou default 151)
    const depOrig = Number(data?.bipagem?.id_dep_origem ?? 785301556) || 785301556;

    // monta a lista à direita (ORIGINAL + EQUIVALENTES)
    listaProdutos.innerHTML = `
      <!-- ORIGINAL -->
      <div id="produto-ORIGINAL-${comp.id_tiny}" class="produto-item-modal" data-role="original">
        <div class="d-flex" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div>
            <strong id="nome-${sku}">${comp.nome}</strong>
            <span id="sku-${sku}" class="badge">${sku}</span>
            <span id="tipo-${sku}" class="badge">Original</span>
          </div>
          <div class="small" style="font-size:.85rem; color:#6b7280;">
            Bipado: <strong id="bipado-${sku}">${totalBipadosOriginal}</strong> /
            Total: <strong id="total-${sku}">${compTotal}</strong>
            (<span id="percent-${sku}">${porcento}</span>%)
          </div>
        </div>

        <div id="progressWrap-${sku}" class="progress"
             style="height:10px; background:#e5e7eb; border-radius:6px; overflow:hidden; margin:8px 0;">
          <div id="progressFill-${sku}" class="progress-bar" role="progressbar"
               style="width:${porcento}%; background:#f59e0b; height:10px;"
               aria-valuenow="${totalBipadosOriginal}" aria-valuemin="0"
               aria-valuemax="${compTotal}"></div>
        </div>

        <div class="controls" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <!-- Quantidade ORIGINAL -->
          <div class="d-flex align-items-center gap-2">
            <button id="menos-${sku}" class="btn btn-outline" onclick="removeUnEditarProduto('${sku}');" type="button">−</button>
            <input id="quantidade-${sku}" type="number" value="${totalBipadosOriginal}" min="0" step="1" style="width:100px;">
            <button id="mais-${sku}" class="btn btn-outline" onclick="addUnEditarProduto('${sku}');" type="button">+</button>
          </div>

          <!-- Depósito ORIGINAL + izinho (ALINHADO À ESQUERDA, IGUAL EQUIVALENTE) -->
          <div class="d-flex align-items-center gap-2">
            <div class="produto-thumb-wrap" data-sku="${sku}">
              <span class="info-icon" aria-label="Ver imagem do produto">i</span>
              <div class="produto-thumb-popover">
                <img
                  src="${PLACEHOLDER_IMG}"
                  alt="Imagem do produto ${sku}">
              </div>
            </div>

            <label class="form-label mb-0" style="font-size:.8rem; color:#6b7280;">Depósito:</label>
            <select
              class="form-select form-select-sm deposito-select-modal"
              data-role="original"
              data-sku="${sku}"
              onchange="onChangeDepositoBipagem('original', this)">
              <option value="785301556" ${depOrig === 785301556 ? 'selected' : ''}>Depósito 151</option>
              <option value="894837591" ${depOrig === 894837591 ? 'selected' : ''}>Depósito Mesanino</option>
              <option value="905539821" ${depOrig === 905539821 ? 'selected' : ''}>Depósito 161 (Edícula)</option>
              <option value="905539832" ${depOrig === 905539832 ? 'selected' : ''}>Depósito 171</option>
              <option value="894837619" ${depOrig === 894837619 ? 'selected' : ''}>Depósito 177</option>
            </select>
          </div>

          <!-- Última ação ORIGINAL (ancorada à direita, usando o MESMO padrão dos equivalentes) -->
          <div class="last-action-wrap">
            <span class="status">
              Última ação: <strong id="status-${sku}">—</strong>
            </span>
          </div>
        </div>
      </div>
    `;

    // acrescenta equivalentes
    (data?.equivalentes || []).forEach(p => {
      const porcentoEquiv = comp.unidades_totais > 0
        ? Math.min(100, Math.round((p.bipados / compTotal) * 100))
        : 0;

      // depósito de origem do equivalente (ou default 151)
      const depEquiv = Number(p.id_dep_origem ?? 785301556) || 785301556; //? Aparentemente está certo.

      listaProdutos.innerHTML += `
        <div id="produto-EQV-${p.id_tiny_equivalente}" class="produto-item-modal" data-role="equivalente">
          <div class="d-flex" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <div>
              <strong id="nome-${p.sku_bipado}">${p.nome_equivalente}</strong>
              <span id="sku-${p.sku_bipado}" class="badge">${p.sku_bipado}</span>
              <span id="tipo-${p.sku_bipado}" class="badge">Equivalente</span>
            </div>
            <div class="small" style="font-size:.85rem; color:#6b7280;">
              Bipado: <strong id="bipado-${p.sku_bipado}">${p.bipados}</strong> /
              Total: <strong id="total-${p.sku_bipado}">${compTotal}</strong>
              (<span id="percent-${p.sku_bipado}">${porcentoEquiv}</span>%)
            </div>
          </div>

          <div id="progressWrap-${p.sku_bipado}" class="progress"
               style="height:10px; background:#e5e7eb; border-radius:6px; overflow:hidden; margin:8px 0;">
            <div id="progressFill-${p.sku_bipado}" class="progress-bar" role="progressbar"
                 style="width:${porcentoEquiv}%; background:#3b82f6; height:10px;"
                 aria-valuenow="${p.bipados}" aria-valuemin="0"
                 aria-valuemax="${compTotal}"></div>
          </div>

          <div class="controls" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div class="d-flex align-items-center gap-2">
              <button id="menos-${p.sku_bipado}" onclick="removeUnEditarProduto('${p.sku_bipado}');" type="button" class="btn btn-outline">−</button>
              <input id="quantidade-${p.sku_bipado}" type="number" value="${p.bipados}" min="0" step="1" style="width:100px;">
              <button id="mais-${p.sku_bipado}" onclick="addUnEditarProduto('${p.sku_bipado}');" type="button" class="btn btn-outline">+</button>
            </div>

            <!-- Select de depósito do EQUIVALENTE (modal) + izinho -->
            <div class="d-flex align-items-center gap-2">
              <!-- Izinho com imagem do depósito -->
              <div class="produto-thumb-wrap" data-sku="${p.sku_bipado}">
                <span class="info-icon" aria-label="Ver imagem do produto">i</span>
                <div class="produto-thumb-popover">
                  <img
                    src="${PLACEHOLDER_IMG}"
                    alt="Imagem do produto ${p.sku_bipado}">
                </div>
              </div>

              <label class="form-label mb-0" style="font-size:.8rem; color:#6b7280;">Depósito:</label>
              <select
                class="form-select form-select-sm deposito-select-modal"
                data-role="equivalente"
                data-equivalente-id="${p.id}"
                onchange="onChangeDepositoBipagem('equivalente', this)">
                <option value="785301556" ${depEquiv === 785301556 ? 'selected' : ''}>Depósito 151</option>
                <option value="894837591" ${depEquiv === 894837591 ? 'selected' : ''}>Depósito Mesanino</option>
                <option value="905539821" ${depEquiv === 905539821 ? 'selected' : ''}>Depósito 161 (Edícula)</option>
                <option value="905539832" ${depEquiv === 905539832 ? 'selected' : ''}>Depósito 171</option>
                <option value="894837619" ${depEquiv === 894837619 ? 'selected' : ''}>Depósito 177</option>
              </select>
            </div>

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
    });

  } catch (err) {
    console.error(err);
    notify.error('Falha ao carregar informações do produto.');
    fecharModal();
  }

  // depois de montar ORIGINAL + EQUIVALENTES, atualiza os izinhos
  defineImgDepositos();

  document.getElementById('modal-editar-produto').style.display = 'block';
  // remove o overlay de loading, se ainda existir
  document.getElementById('modal-edit-loading')?.remove();
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
    body: JSON.stringify(payload),
    credentials: 'include'
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
          body: JSON.stringify(payload),
          credentials: 'include'
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
          body: JSON.stringify(payload),
          credentials: 'include'
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

async function verificarSeECaixaFechada(valorLido) {
  try {
    const resp = await fetch(`/api/tiny/composicao-auto?valor=${encodeURIComponent(valorLido)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include' // sessão
    });

    if (!resp.ok) return null;

    const composicao = await resp.json();
    if (!composicao || composicao.ok === false) return null;
    if (!Array.isArray(composicao.kit) || composicao.kit.length !== 1) return null;

    const k = composicao.kit[0];
    if (!k || !k.produto) return null;

    return {
      id_tiny: k.produto.id,
      sku: k.produto.sku,
      nome: k.produto.descricao,
      un: k.quantidade
    };
  } catch (e) {
    console.error('verificarSeECaixaFechada (auto) erro:', e);
    return null;
  }
}

async function salvarAlteracoesConfirmacaoGerente() {

  return true
}

function fecharModal() {
  document.getElementById('modal-editar-produto').style.display = 'none';
  document.body.style.overflow = '';
  window.pauseAutoRefresh = false;
}

// Fecha clicando fora
window.addEventListener('click', (e) => {
  const modal = document.getElementById('modal-editar-produto');
  if (e.target === modal) fecharModal();
});

// Fecha com ESC
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const modalEq = document.getElementById('modal-equivalente');
  const modalEdit = document.getElementById('modal-editar-produto');
  if (modalEq?.style.display === 'block') fecharModalEquivalente(true);
  else if (modalEdit?.style.display === 'block') fecharModal();
});
