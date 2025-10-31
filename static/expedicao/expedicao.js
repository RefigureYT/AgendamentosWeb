document.addEventListener("DOMContentLoaded", function () {
    // --- 1. SELEÇÃO DE ELEMENTOS E DADOS ---
    const panelControl = document.querySelector('.panel-control');
    const inputBipCaixa = document.getElementById('input-bip-caixa');
    const contadorCaixasEl = document.getElementById('contador-caixas');
    const cronometroEl = document.getElementById('cronometro-expedicao');

    // Containers de estado da UI
    const containerInicio = document.getElementById('container-inicio');
    const containerBipagem = document.getElementById('container-bipagem');
    const containerFinalizacao = document.getElementById('container-finalizacao');

    // Botões de ação
    const btnIniciarExpedicao = document.getElementById('btn-iniciar-expedicao');
    const btnFinalizarExpedicao = document.getElementById('btn-finalizar-expedicao');
    const btnCancelarInicio = document.getElementById('btn-cancelar-inicio');
    const btnResetarExpedicao = document.getElementById('btn-resetar-expedicao');

    // Dados do agendamento (lidos dos atributos data-*)
    const agendamentoIdML = panelControl?.dataset.idMl;
    const agendamentoIdBD = panelControl?.dataset.idBd;
    const totalCaixas = document.querySelectorAll('.caixa-card-container').length;

    // Variáveis de estado
    let cronometroInterval;
    let pollingInterval;
    let transfOn = false; // false = finalizar sem transferir (temporário); true = transferir + finalizar

    // ====== MAPAS DE DEPÓSITOS ======
    // Atenção: mapeado conforme seu template: 1=Jaú Pesca, 2=Jaú Fishing, 3=L.T. Sports
    const DEPOSITOS_DESTINO = {
        1: { // ? Empresa Jaú Pesca [ SILVIO ]
            1: 787964633, // TODO Mercado Livre
            2: 789951567, // TODO Magazine Luiza
            3: null, // * Shopee (SILVIO NÃO TEM SHOPEE)
            4: 888484781 //  TODO Amazon
        },
        2: { // ? Empresa Jaú Fishing [ LEANDRO ]
            1: 888526350, // TODO Mercado Livre
            2: 901950985, // TODO Magazine Luiza
            3: null, // * Shopee (LEANDRO NÃO TEM SHOPEE)
            4: 901951075 //  TODO Amazon
        },
        3: { // ? Empresa LT Sports [ LUCAS ]
            1: 888526346, // TODO Mercado Livre
            2: 901950975, // TODO Magazine Luiza
            3: 895899584, // TODO Shopee
            4: 901951052 //  TODO Amazon 
        }
    }

    // Origem fixa (Produção) e fallback genérico (se faltar mapeamento)
    const DEPOSITO_PRODUCAO = 822208355; // Depósito 141

    const NOMES_EMPRESA = { 1: "Jaú Pesca", 2: "Jaú Fishing", 3: "L.T. Sports" };
    const NOMES_MKTP = { 1: "Mercado Livre", 2: "Magalu", 3: "Shopee", 4: "Amazon", 5: "Outros" };

    // ====== HELPERS ======
    function onlyDigits(v) { return String(v || '').replace(/\D+/g, ''); }

    function getTodosOsProdutos() {
        const container = document.getElementById('js-data-produtos');
        if (!container || !container.dataset.produtos) return [];
        try { return JSON.parse(container.dataset.produtos); } catch { return []; }
    }

    // Sanitize simples para mensagens em HTML dos modais
    function esc(s) {
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }

    // Resolve id_tiny a partir do item da caixa (item.sku pode ser id_ml ou sku)
    function resolverIdTiny(itemSku, todos) {
        const d = String(itemSku || '');
        const byIdML = todos.find(p => String(p.id_ml) === d);
        if (byIdML && (byIdML.id_tiny || byIdML.id)) return byIdML.id_tiny || byIdML.id;

        const bySku = todos.find(p => String(p.sku) === d);
        if (bySku && (bySku.id_tiny || bySku.id)) return bySku.id_tiny || bySku.id;

        const digit = onlyDigits(d);
        if (digit) {
            const byGtin = todos.find(p => onlyDigits(p.gtin) === digit);
            if (byGtin && (byGtin.id_tiny || byGtin.id)) return byGtin.id_tiny || byGtin.id;
        }
        return null;
    }

    function montarMovimentosValidos(movimentosAgregados, { depProducao, depDestino, precoUnitario = 0 }) {
        const validos = [];
        const invalidos = [];

        const dOrig = Number(depProducao);
        const dDest = Number(depDestino);
        const pUnit = Number(precoUnitario) || 0;

        movimentosAgregados.forEach(m => {
            const id = Number(m.id_produto);
            const un = Number(m.unidades);

            if (!Number.isFinite(id) || id <= 0) {
                invalidos.push({ ...m, motivo: 'id_produto inválido' });
                return;
            }
            if (!Number.isFinite(un) || un <= 0) {
                invalidos.push({ ...m, motivo: 'unidades inválidas' });
                return;
            }
            if (!Number.isFinite(dOrig) || dOrig <= 0) {
                invalidos.push({ ...m, motivo: 'depósito de origem inválido' });
                return;
            }
            if (!Number.isFinite(dDest) || dDest <= 0) {
                invalidos.push({ ...m, motivo: 'depósito de destino inválido' });
                return;
            }
            if (dOrig === dDest) {
                invalidos.push({ ...m, motivo: 'origem e destino iguais' });
                return;
            }

            validos.push({
                id_produto: id,
                de: dOrig,
                para: dDest,
                unidades: un,
                preco_unitario: pUnit
            });
        });

        return { validos, invalidos };
    }

    // ==== HELPER: entrada manual de ID de depósito (Admin) ====
    function inserirIdDepositoAdmin(depProducao) {
        return Swal.fire({
            title: 'Inserir ID do depósito (Admin)',
            html: 'Peça para que um administrador insira o ID do depósito!',
            input: 'number',
            inputLabel: 'ID do depósito de destino',
            inputAttributes: { min: 1, step: 1 },
            inputValidator: (value) => {
                if (!value) return 'Informe um ID.';
                const v = Number(value);
                if (!Number.isInteger(v) || v <= 0) return 'O ID precisa ser um inteiro > 0.';
                if (v === depProducao) return `O destino não pode ser igual à origem (#${depProducao}).`;
                return null;
            },
            showCancelButton: true,
            confirmButtonText: 'Usar este ID',
            cancelButtonText: 'Cancelar'
        }).then(res => {
            if (res.isConfirmed) return Number(res.value);
            throw new Error('cancelled');
        });
    }

    // --- FUNÇÃO AUXILIAR ROBUSTA PARA PARSE DE DATA (A CORREÇÃO PRINCIPAL) ---
    function parseISOLocal(isoString) {
        if (!isoString) return null;
        // Divide a string em partes: "YYYY-MM-DDTHH:MM:SS" -> ["YYYY", "MM", "DD", "HH", "MM", "SS"]
        const parts = isoString.split(/[-T:.]/); // Inclui '.' para remover possíveis milissegundos
        if (parts.length < 6) return null; // Garante que a data é válida
        // Os meses em JavaScript são 0-indexados (Janeiro=0, Dezembro=11), por isso subtraímos 1.
        return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
    }

    // === HELPERS PARA EXPEDIÇÃO (141 -> destino) ===

    // === HELPERS (Expedição via bipagem oficial) ===
    async function whoAmI() {
        try {
            const r = await fetch('/api/me', { credentials: 'same-origin' });
            if (!r.ok) return null;
            const j = await r.json();
            return j.authenticated ? j.user : null;
        } catch { return null; }
    }

    async function fetchAgendamentoCompleto(idAgend) {
        const r = await fetch(`/api/agendamento/${idAgend}/completo`, { credentials: 'same-origin' });
        if (!r.ok) {
            const t = await r.text().catch(() => '');
            throw new Error(`Falha ao ler bipagem (${r.status}): ${t || r.statusText}`);
        }
        return r.json();
    }

    /**
     * Monta movimentos de EXPEDIÇÃO (141 -> destino) usando /api/agendamento/:id/completo
     * - etapa: 'exp'
     * - equivalente: false (originais) | true (equivalentes)
     * - pk: comp_agend.id_prod_comp (para originais) | agendamento_produto_bipagem_equivalentes.id (para equivalentes)
     */
    function montarMovimentosExpedicaoDoAgendamento(dados, { depOrigem, depDestino }) {
        const movimentos = [];
        const faltantes = [];

        const prods = (dados?.produtos || []);
        for (const prod of prods) {
            const p = prod?.produto_original || {};
            const bipDiretos = Number(
                prod?.bipagem?.bipados ??
                prod?.bipagem_conf?.bipados ??
                prod?.totais?.bipados_diretos ??
                0
            );

            // Originais
            if (bipDiretos > 0) {
                if (p?.id_prod_tiny) {
                    movimentos.push({
                        equivalente: false,
                        etapa: 'exp',
                        pk: p.id_prod,                   // comp_agend.id_prod_comp
                        sku: p.sku_prod,
                        id_produto: p.id_prod_tiny,
                        de: Number(depOrigem),
                        para: Number(depDestino),
                        unidades: bipDiretos,
                        preco_unitario: 0
                    });
                } else {
                    faltantes.push({ tipo: 'original', sku: p.sku_prod, qtd: bipDiretos, motivo: 'sem id_prod_tiny' });
                }
            }

            // Equivalentes
            for (const eq of (prod?.equivalentes || [])) {
                const q = Number(eq?.bipados || 0);
                if (q <= 0) continue;

                if (eq?.id_tiny_equivalente) {
                    movimentos.push({
                        equivalente: true,
                        etapa: 'exp',
                        pk: eq.id,                       // tabela de equivalentes
                        sku: eq.sku_bipado,
                        id_produto: eq.id_tiny_equivalente,
                        de: Number(depOrigem),
                        para: Number(depDestino),
                        unidades: q,
                        preco_unitario: 0
                    });
                } else {
                    faltantes.push({ tipo: 'equivalente', sku: eq.sku_bipado, qtd: q, motivo: 'sem id_tiny_equivalente' });
                }
            }
        }

        return { movimentos, faltantes };
    }

    let inicioTimestamp = parseISOLocal(panelControl?.dataset.inicioExp);
    let fimTimestamp = parseISOLocal(panelControl?.dataset.fimExp);

    // --- 2. FUNÇÕES DO CRONÔMETRO ---
    function formatarTempo(milissegundos) {
        if (isNaN(milissegundos) || milissegundos < 0) {
            milissegundos = 0;
        }
        const totalSegundos = Math.floor(milissegundos / 1000);
        const horas = Math.floor(totalSegundos / 3600).toString().padStart(2, '0');
        const minutos = Math.floor((totalSegundos % 3600) / 60).toString().padStart(2, '0');
        const segundos = (totalSegundos % 60).toString().padStart(2, '0');
        return `${horas}:${minutos}:${segundos}`;
    }

    function iniciarCronometro() {
        if (cronometroInterval) clearInterval(cronometroInterval);
        if (!inicioTimestamp) return;

        cronometroInterval = setInterval(() => {
            const agora = new Date();
            const decorrido = agora - inicioTimestamp;
            cronometroEl.textContent = formatarTempo(decorrido);
        }, 1000);
    }

    function pararCronometro() {
        clearInterval(cronometroInterval);
        if (inicioTimestamp && fimTimestamp) {
            const decorrido = fimTimestamp - inicioTimestamp;
            cronometroEl.textContent = formatarTempo(decorrido);
        }
    }

    // --- 3. GERENCIAMENTO DE ESTADO DA UI ---
    function gerenciarEstadoInicial() {
        if (totalCaixas === 0) {
            if (cronometroEl) cronometroEl.textContent = "00:00:00";
            return;
        }

        verificarStatusCaixas();

        if (fimTimestamp) { // Se o processo JÁ TERMINOU
            containerInicio.style.display = 'none';
            containerBipagem.style.display = 'none';
            containerFinalizacao.style.display = 'block';
            btnFinalizarExpedicao.disabled = true;
            btnFinalizarExpedicao.innerHTML = '<i class="bi bi-check-all me-2"></i> Expedição Concluída';
            pararCronometro();
        } else if (inicioTimestamp) { // Se o processo ESTÁ EM ANDAMENTO
            containerInicio.style.display = 'none';
            containerFinalizacao.style.display = 'none';
            containerBipagem.style.display = 'block';
            inputBipCaixa.focus();
            iniciarCronometro();
            iniciarPolling();
        } else { // Se o processo NÃO COMEÇOU
            containerBipagem.style.display = 'none';
            containerFinalizacao.style.display = 'none';
            containerInicio.style.display = 'block';
        }
    }

    // --- 4. EVENT LISTENERS E LÓGICA DE AÇÕES ---
    btnIniciarExpedicao?.addEventListener('click', function () {
        this.disabled = true;
        fetch('/api/expedicao/iniciar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_agend_bd: agendamentoIdBD })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // Usa a nova função de parse robusta
                    inicioTimestamp = parseISOLocal(data.startTime);
                    gerenciarEstadoInicial();
                } else {
                    Swal.fire('Erro', 'Não foi possível iniciar a expedição.', 'error');
                    this.disabled = false;
                }
            });
    });

    // Pergunta um depósito de destino ao usuário (modo admin)
    async function solicitarDepositoDestino({ empresaId, mktpId, depProducao, motivo = '' }) {
        const { value: dep } = await Swal.fire({
            title: 'Depósito de destino',
            html: `
      ${motivo ? `<div class="mb-2 text-danger fw-bold">${motivo}</div>` : ''}
      <div class="mb-2">
        Empresa: <b>${NOMES_EMPRESA[empresaId] || '(?)'}</b><br>
        Marketplace: <b>${NOMES_MKTP[mktpId] || '(?)'}</b>
      </div>
      <div class="small text-muted">
        Somente um administrador deve informar este ID.
      </div>
    `,
            input: 'number',
            inputAttributes: { min: 1 },
            inputLabel: 'ID do depósito destino',
            inputPlaceholder: 'Ex.: 888526350',
            confirmButtonText: 'Usar este ID',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: (v) => {
                const n = Number(v);
                if (!n) {
                    Swal.showValidationMessage('Informe um número válido.');
                    return false;
                }
                if (n === Number(depProducao)) {
                    Swal.showValidationMessage('Origem e destino não podem ser o mesmo depósito.');
                    return false;
                }
                return n;
            }
        });
        return dep ? Number(dep) : null;
    }

    // Mostra erro da transferência com opções de Retry / “Informar ID”
    async function tratarFalhaTransferencia({ msg, podeInformarId, empresaId, mktpId, depProducao, onRetry, onRetryComId }) {
        const buttons = {
            confirmButtonText: 'Tentar novamente',
            showCancelButton: true,
            cancelButtonText: 'Fechar',
            showDenyButton: podeInformarId,
            denyButtonText: 'Informar ID e tentar'
        };
        const { isConfirmed, isDenied } = await Swal.fire({
            icon: 'error',
            title: 'Não foi possível transferir',
            html: esc(msg || 'Falha ao enfileirar as movimentações.'),
            ...buttons
        });

        if (isDenied && onRetryComId) {
            const novoId = await solicitarDepositoDestino({ empresaId, mktpId, depProducao, motivo: 'Depósito não mapeado ou inválido.' });
            if (novoId) onRetryComId(novoId);
            return;
        }
        if (isConfirmed && onRetry) onRetry();
    }

    btnFinalizarExpedicao?.addEventListener('click', async function () {
        if (this.disabled) return;

        // 🔀 Interruptor temporário: se false => apenas finaliza, se true => transfere + finaliza
        const transfFlag = !!transfOn;

        // Caminho A: SOMENTE FINALIZAR (sem transferir)
        if (!transfFlag) {
            const { isConfirmed } = await Swal.fire({
                title: "Finalizar sem transferir?",
                html: `Este modo temporário irá <b>apenas finalizar</b> a expedição, sem gerar movimentações de estoque.`,
                icon: "question",
                showCancelButton: true,
                confirmButtonColor: "#28a745",
                cancelButtonColor: "#6c757d",
                confirmButtonText: "Sim, só finalizar",
                cancelButtonText: "Cancelar"
            });
            if (!isConfirmed) return;

            this.disabled = true;
            Swal.fire({
                title: 'Finalizando…',
                html: 'Registrando conclusão da expedição.',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                const respFin = await fetch('/api/expedicao/finalizar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ id_agend_bd: panelControl?.dataset.idBd })
                }).then(x => x.json()).catch(() => ({ success: false }));

                if (!respFin?.success) {
                    this.disabled = false;
                    await Swal.fire('Erro', 'Não foi possível finalizar a expedição.', 'error');
                    return;
                }

                await Swal.fire({ icon: 'success', title: 'Expedição finalizada!', timer: 1500, showConfirmButton: false });
                window.location.href = '/agendamentos/ver?finalizado=ok';
                return;
            } catch (e) {
                console.error(e);
                this.disabled = false;
                await Swal.fire('Erro de rede', 'Falha ao comunicar com o servidor.', 'error');
                return;
            }
        }

        // Caminho B: TRANSFERIR + FINALIZAR (fluxo existente)
        const empresaId = Number(panelControl?.dataset.empresa || 0);
        const mktpId = Number(panelControl?.dataset.mktp || 0);
        const depProducao = Number(panelControl?.dataset.depProducao || DEPOSITO_PRODUCAO);

        // destino via mapa (ou solicitar)
        let depDestino = (DEPOSITOS_DESTINO[empresaId] || {})[mktpId] || null;

        // 1) Ler bipagem oficial do agendamento
        let dados;
        try {
            dados = await fetchAgendamentoCompleto(agendamentoIdBD);
            // console.log('[DEBUG] agendamento completo:', dados);
        } catch (e) {
            await Swal.fire('Erro', esc(e.message || 'Falha ao ler bipagem do agendamento.'), 'error');
            return;
        }

        // 2) Definir/validar depósito de destino
        if (!depDestino) {
            const novo = await solicitarDepositoDestino({
                empresaId, mktpId, depProducao,
                motivo: 'Não há depósito de destino configurado.'
            });
            if (!novo) return; // cancelado
            depDestino = Number(novo);
        }
        if (Number(depDestino) === Number(depProducao)) {
            await Swal.fire('Atenção', `Origem (#${depProducao}) e destino (#${depDestino}) não podem ser iguais.`, 'warning');
            return;
        }

        // 3) Montar movimentos de EXPEDIÇÃO a partir da bipagem oficial
        const montar = (dest) =>
            montarMovimentosExpedicaoDoAgendamento(dados, { depOrigem: depProducao, depDestino: dest });

        let { movimentos, faltantes } = montar(depDestino);

        // 4) Nada para mover? (prioriza explicar "faltantes")
        if (!movimentos.length) {
            if (faltantes.length) {
                const lista = faltantes.slice(0, 20)
                    .map(f => `• [${esc(f.tipo)}] ${esc(f.sku)} — ${esc(f.motivo)} (qtd: ${f.qtd})`)
                    .join('<br>');
                await Swal.fire({
                    icon: 'info',
                    title: 'Sem movimentos válidos',
                    html: `Todos os itens estão sem ID do Tiny:<br>${lista}`
                });
            } else {
                await Swal.fire('Nada para mover', 'Bipagem total do agendamento é 0 (diretos + equivalentes).', 'info');
            }
            return;
        }

        // 5) Confirmação
        const { isConfirmed } = await Swal.fire({
            title: "Confirmar",
            html: `Finalizar expedição e transferir do <b>Produção (#${depProducao})</b><br>
           para <b>${NOMES_MKTP[mktpId] || '(?)'} (dep #${depDestino})</b> — ${NOMES_EMPRESA[empresaId] || '(?)'}?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#28a745",
            cancelButtonColor: "#6c757d",
            confirmButtonText: "Sim, mover e finalizar",
            cancelButtonText: "Cancelar"
        });
        if (!isConfirmed) return;

        // 6) Observações + usuário
        const userName = (await whoAmI())?.nome_display_usuario || 'Indefinido';
        const observacoes =
            `Expedição - AgendamentosWeb\n` +
            `Ag.: ${agendamentoIdML}\n` +
            `Mktp.: ${NOMES_MKTP[mktpId] || ''}\n` +
            `Emp.: ${NOMES_EMPRESA[empresaId] || ''}\n` +
            `Co.: ${userName}`;

        // Função de tentativa (permite re-tentar com novo destino)
        const tentarMover = async (dest) => {
            // se trocar destino, reconstroi "movimentos" com novo 'para'
            if (dest !== depDestino) {
                const r = montar(dest);
                movimentos = r.movimentos;
                faltantes = r.faltantes;
            }
            if (!movimentos.length) {
                await Swal.fire('Nada para mover', 'Bipagem total do agendamento é 0 (diretos + equivalentes).', 'info');
                return;
            }

            this.disabled = true;
            Swal.fire({
                title: 'Transferindo para o marketplace…',
                html: 'Gerando movimentações de estoque (Saída/Entrada).',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                const r = await fetch('/estoque/mover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        observacoes,
                        preco_unitario: 0,
                        movimentos
                    })
                });
                const payload = await r.json().catch(() => ({}));

                if (r.ok && payload.ok) {
                    const qtd = Array.isArray(payload.tasks) ? payload.tasks.length : 0;

                    let html = `Foram enfileiradas <b>${qtd}</b> tarefas (Saídas e Entradas).`;
                    if (faltantes.length) {
                        const desc = faltantes.slice(0, 5)
                            .map(x => `• ${esc(x.sku)} (${esc(x.motivo)})`)
                            .join('<br>');
                        html += `<br><br><span class="text-muted">Itens ignorados:<br>${desc}</span>`;
                    }

                    // Finaliza a expedição somente após enfileirar
                    const respFin = await fetch('/api/expedicao/finalizar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ id_agend_bd: panelControl?.dataset.idBd })
                    }).then(x => x.json()).catch(() => ({ success: false }));

                    if (!respFin?.success) {
                        this.disabled = false;
                        await Swal.fire('Movido, mas não finalizado',
                            'As movimentações foram enfileiradas, porém houve erro ao finalizar a expedição. Tente finalizar novamente.',
                            'warning');
                        return;
                    }

                    await Swal.fire({ icon: 'success', title: 'Movimentações enfileiradas!', html, timer: 1800, showConfirmButton: false });
                    window.location.href = '/agendamentos/ver?finalizado=ok';
                } else {
                    await tratarFalhaTransferencia({
                        msg: payload?.error || payload?.detalhe || r.statusText,
                        podeInformarId: true,
                        empresaId, mktpId, depProducao,
                        onRetry: () => tentarMover(depDestino),
                        onRetryComId: (novoId) => tentarMover(Number(novoId))
                    });
                    this.disabled = false;
                }
            } catch (err) {
                console.error('Erro na transferência:', err);
                await tratarFalhaTransferencia({
                    msg: 'Não foi possível comunicar com o servidor.',
                    podeInformarId: true,
                    empresaId, mktpId, depProducao,
                    onRetry: () => tentarMover(depDestino),
                    onRetryComId: (novoId) => tentarMover(Number(novoId))
                });
                this.disabled = false;
            }
        };

        // dispara a tentativa com o destino atual
        return tentarMover(depDestino);
    });

    btnCancelarInicio?.addEventListener('click', function () {
        Swal.fire({
            title: "Voltar?",
            text: "Tem certeza que deseja cancelar o início desta expedição? O cronômetro será zerado.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Sim, cancelar!",
            cancelButtonText: "Não"
        }).then((result) => {
            if (result.isConfirmed) {
                fetch('/api/expedicao/cancelar-inicio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_agend_bd: agendamentoIdBD })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            window.location.reload();
                        } else {
                            Swal.fire('Erro!', 'Não foi possível cancelar o início.', 'error');
                        }
                    });
            }
        });
    });

    btnResetarExpedicao?.addEventListener('click', function () {
        Swal.fire({
            title: "Resetar Expedição?",
            html: "Isso irá apagar os horários de início e fim desta expedição, retornando-a ao estado inicial.<br><strong>Esta ação não pode ser desfeita.</strong>",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Sim, resetar!",
            cancelButtonText: "Cancelar"
        }).then((result) => {
            if (result.isConfirmed) {
                fetch('/api/expedicao/resetar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_agend_bd: agendamentoIdBD })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            Swal.fire('Resetado!', 'A expedição foi reiniciada.', 'success')
                                .then(() => window.location.reload());
                        } else {
                            Swal.fire('Erro!', 'Não foi possível resetar o estado da expedição.', 'error');
                        }
                    });
            }
        });
    });

    inputBipCaixa?.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const valorLido = this.value.trim();
            if (!valorLido) return;
            let idExtraido = '';
            try {
                const dadosQr = JSON.parse(valorLido);
                idExtraido = dadosQr.id;
            } catch (e) { idExtraido = valorLido; }
            this.value = '';
            const caixaContainer = document.querySelector(`.caixa-card-container[data-codigo-unico="${idExtraido}"]`);
            if (caixaContainer) {
                const card = caixaContainer.querySelector('.caixa-card');
                if (card.classList.contains('status-pendente')) {
                    fetch('/api/expedicao/bipar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id_agend_ml: agendamentoIdML,
                            codigo_unico_caixa: idExtraido
                        })
                    })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                marcarCaixaComoConcluidaNaTela(idExtraido);
                                atualizarContador();
                            } else {
                                Swal.fire('Erro!', 'Não foi possível salvar a bipagem no servidor.', 'error');
                            }
                        })
                        .catch((error) => {
                            console.error('ERRO na requisição POST:', error);
                            Swal.fire('Erro de Rede!', 'Falha de comunicação com o servidor.', 'error');
                        });
                } else {
                    Swal.fire({
                        icon: 'warning', title: 'Caixa já bipada!',
                        text: 'Esta caixa já foi registrada na expedição.',
                        timer: 2000, showConfirmButton: false
                    });
                }
            } else {
                marcarErro();
                Swal.fire({
                    icon: 'error', title: 'Caixa não encontrada!',
                    text: 'O QR Code lido não corresponde a nenhuma caixa deste agendamento.',
                    timer: 2500, showConfirmButton: false
                });
            }
        }
    });

    // --- 5. FUNÇÕES DE APOIO E ATUALIZAÇÃO DA UI ---
    function atualizarContador() {
        if (!contadorCaixasEl) return;
        const concluidas = document.querySelectorAll('.status-concluido').length;
        contadorCaixasEl.textContent = `${concluidas} / ${totalCaixas}`;
        if (concluidas === totalCaixas && totalCaixas > 0 && !fimTimestamp) {
            contadorCaixasEl.classList.remove('text-secondary');
            contadorCaixasEl.classList.add('text-success');
            fimTimestamp = new Date();
            pararCronometro();
            if (pollingInterval) clearInterval(pollingInterval);
            Swal.fire({
                icon: 'success', title: 'Todas as caixas bipadas!',
                text: 'Agora você pode finalizar a expedição.', confirmButtonText: 'Ok'
            }).then(() => {
                containerBipagem.style.display = 'none';
                containerFinalizacao.style.display = 'block';
            });
        }
    }

    function verificarStatusCaixas() {
        if (!agendamentoIdML) return;
        fetch(`/api/expedicao/bipados/${agendamentoIdML}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.bipados) {
                    data.bipados.forEach(codigoUnico => {
                        marcarCaixaComoConcluidaNaTela(codigoUnico);
                    });
                }
            })
            .catch(error => console.error("Erro no polling:", error))
            .finally(() => {
                atualizarContador();
            });
    }

    function iniciarPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(verificarStatusCaixas, 5000);
    }

    function marcarCaixaComoConcluidaNaTela(codigoUnico) {
        const caixaContainer = document.querySelector(`.caixa-card-container[data-codigo-unico="${codigoUnico}"]`);
        if (caixaContainer) {
            const card = caixaContainer.querySelector('.caixa-card');
            if (card.classList.contains('status-pendente')) {
                card.classList.remove('status-pendente');
                card.classList.add('status-concluido');
            }
        }
    }

    function marcarErro() {
        if (!inputBipCaixa) return;
        inputBipCaixa.classList.add('input-erro');
        setTimeout(() => {
            inputBipCaixa.classList.remove('input-erro');
        }, 600);
    }

    // --- 6. LÓGICA DO MODAL DE VISUALIZAÇÃO ---
    document.querySelectorAll('.js-visualizar-itens').forEach(botao => {
        botao.addEventListener('click', function () {
            const dadosDaCaixa = JSON.parse(this.getAttribute('data-caixa'));
            abrirModalDetalhes(dadosDaCaixa);
        });
    });

    function abrirModalDetalhes(caixa) {
        const modalEl = document.getElementById('modalDetalhesCaixa');
        if (!modalEl) { return; }

        const modal = new bootstrap.Modal(modalEl);
        const dataContainer = document.getElementById('js-data-produtos');
        const placeholderContainer = document.getElementById('js-data-placeholder');
        if (!dataContainer || !dataContainer.dataset.produtos) { return; }

        const todosOsProdutos = JSON.parse(dataContainer.dataset.produtos);
        const placeholderUrl = placeholderContainer?.dataset?.url || '/static/resources/placeholder.png';

        const modalTitle = modalEl.querySelector('.modal-title');
        const modalBody = modalEl.querySelector('.modal-body');

        modalTitle.textContent = `Itens da Caixa #${caixa.caixa_num}`;

        let bodyHtml = '<p class="text-muted text-center">Nenhum item encontrado nesta caixa.</p>';

        if (caixa.itens && caixa.itens.length > 0) {
            bodyHtml = '<ul class="list-group list-group-flush">';
            caixa.itens.forEach(item => {
                const matchProduto = todosOsProdutos.find(p =>
                    String(p.id_ml) === String(item.sku) ||
                    String(p.sku) === String(item.sku) ||
                    (p.gtin && (String(p.gtin).replace(/\D+/g, '') === String(item.sku).replace(/\D+/g, '')))
                ) || null;

                const nomeProduto = matchProduto ? matchProduto.nome : 'Produto não encontrado';
                const skuProduto = matchProduto ? matchProduto.sku : 'SKU não encontrado';
                const imagemUrl = (matchProduto && (matchProduto.imagem_url || matchProduto.imagemUrl)) ? (matchProduto.imagem_url || matchProduto.imagemUrl) : placeholderUrl;

                bodyHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center px-1">
          <img src="${imagemUrl}" alt="Imagem" class="img-thumbnail me-3" style="width:65px;height:65px;object-fit:contain;">
          <div class="flex-grow-1">
            <div class="fw-bold">${esc(nomeProduto)}</div>
            <small class="text-muted d-block">SKU: ${esc(skuProduto)}</small>
          </div>
          <span class="badge bg-primary rounded-pill fs-5 ms-3">${Number(item.quantidade || 0)}</span>
        </li>`;
            });
            bodyHtml += '</ul>';
        }

        modalBody.innerHTML = bodyHtml;
        modal.show();
    }

    // --- 7. INICIALIZAÇÃO DA PÁGINA ---
    gerenciarEstadoInicial();
});