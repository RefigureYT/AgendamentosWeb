from main import (
    app,
    render_template,
    request,
    redirect,
    url_for,
    jsonify,
    agendamento_controller,
    caller,
    ParametroInvalido,
    MetodoInvalido,
    LimiteRequests
)
import time

# === NOVO: Reports (Postgres) ===
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import session, current_app

SCHEMA = "agendamentosweb"
TBL_REPORTS = f"{SCHEMA}.alteracoes_reports"

def get_sandbox() -> bool:
    return bool(current_app.debug)

def _pg_putconn(pool, conn):
    if not pool or not conn:
        return
    try:
        conn.rollback()
    except Exception:
        pass
    try:
        pool.putconn(conn)
    except Exception:
        pass

def _pg_discard(pool, conn):
    if not pool or not conn:
        return
    try:
        conn.close()
    except Exception:
        pass
    try:
        pool.putconn(conn, close=True)
    except Exception:
        pass

""" Leva para as páginas 'alteracoes' e 'compras' """
@app.route("/alteracoes/<acao>", methods=["GET", "POST"])
def alteracoes(acao):
    if acao == "alterar":
        if request.method == "POST":
            agendamento_controller.clear_agendamentos()

            agendamento_controller.insert_agendamento(request.json["id_agend"])
            agendamento_obj = agendamento_controller.get_last_made_agendamento()
            agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)
            # agendamento_controller.view.display_all_in_agend(agendamento_obj)

            produto_obj = agendamento_controller.search_produto(
                agendamento_obj, "id_bd", str(request.json["id_prod"])
            )

            agendamento_controller.insert_composicao_alteracao_in_bd(
                produto_obj, request.json["itens"]
            )

            return "Dados para serem alterados foram inseridos no banco de dados!"
        elif request.method == "GET":
            # Agora essa aba é só o painel de Reports (carrega via JS/API)
            return render_template("alteracoes.html")
        else:
            raise MetodoInvalido()
    elif acao == "comprar":
        if request.method == "POST":
            agendamento_controller.clear_agendamentos()

            agendamento_controller.insert_agendamento(request.json["id_agend"])
            agendamento_obj = agendamento_controller.get_last_made_agendamento()
            agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)
            # agendamento_controller.view.display_all_in_agend(agendamento_obj)

            produto_obj = agendamento_controller.search_produto(
                agendamento_obj, "id_bd", str(request.json["id_prod"])
            )

            agendamento_controller.insert_composicao_compras_in_bd(
                produto_obj, request.json["itens"]
            )

            return "Dados para serem comprados foram inseridos no banco de dados!"
        else:
            agendamento_controller.clear_agendamentos()

            return render_template(
                "compras.html",
                dados=agendamento_controller.get_compras_data()
            )
    else:
        raise ParametroInvalido()


@app.route("/dados-compra-tiny/<id_tiny>")
async def teste(id_tiny):
    
    try:
        resp = caller.make_call(f"produtos/{id_tiny}")
        time.sleep(5)
    except BaseException:
        raise LimiteRequests()
    return resp

@app.route("/dados-estoque/<id_tiny>")
async def dados_estoque(id_tiny):
    try:
        resp = caller.make_call(f"estoque/{id_tiny}")
        time.sleep(5)
        if isinstance(resp, dict) and "status" in resp and resp["status"] >= 400:
            # Se caller.make_call retorna um dicionário com um status de erro
            return jsonify(resp), resp["status"]
        return jsonify(resp)
    except LimiteRequests:
        raise LimiteRequests()
    except Exception as e:
        print(f"Erro inesperado ao chamar a API externa: {e}")
        return jsonify({"error": "Erro interno ao processar a requisição"}), 500

@app.route('/remover-compra/<id>/<quant>')
async def remover(id, quant):
    agendamento_controller.update_quant_compra(id, quant)
    return render_template(
                "compras.html",
                dados=agendamento_controller.get_compras_data()
            )

# ==========================================================
# API - ALTERAÇÕES (REPORTS)
# ==========================================================

@app.route("/api/alteracoes/reports", methods=["GET"])
def api_alteracoes_reports_list():
    if "id_usuario" not in session:
        return jsonify(ok=False, error="Não autenticado"), 401

    pool = current_app.config.get("PG_POOL")
    if not pool:
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 500

    q = (request.args.get("q") or "").strip()
    show_feitos = (request.args.get("show_feitos") or "0").strip() in ("1", "true", "True")

    where = ["sandbox = %s"]
    params = [get_sandbox()]

    if show_feitos:
        # Mostrar somente FEITO e ENGANO (não trazer pendentes junto)
        where.append("(feito = true OR COALESCE(obs, '') ILIKE %s)")
        params.append("ENGANO:%")
    else:
        # Mostrar somente PENDENTE (exclui ENGANO)
        where.append("feito = false")
        where.append("COALESCE(obs, '') NOT ILIKE %s")
        params.append("ENGANO:%")

    if q:
        where.append("""
          (
            empresa_label ILIKE %s OR
            marketplace_label ILIKE %s OR
            etiqueta_id ILIKE %s OR
            produto ILIKE %s OR
            sku ILIKE %s OR
            ean ILIKE %s OR
            tipo ILIKE %s OR
            report ILIKE %s OR
            colaborador ILIKE %s OR
            obs ILIKE %s
          )
        """)
        like = f"%{q}%"
        params.extend([like, like, like, like, like, like, like, like, like, like])

    where_sql = " WHERE " + " AND ".join(where)

    for attempt in (1, 2):
        conn = None
        try:
            conn = pool.getconn()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"""
                    SELECT
                      id,
                      created_at,
                      empresa_label,
                      marketplace_label,
                      etiqueta_id,
                      produto,
                      sku,
                      ean,
                      tipo,
                      report,
                      colaborador,
                      obs,
                      feito
                    FROM {TBL_REPORTS}
                    {where_sql}
                    ORDER BY feito ASC, created_at DESC, id DESC
                    LIMIT 1000
                    """,
                    tuple(params)
                )
                rows = cur.fetchall() or []
                return jsonify(ok=True, items=rows), 200

        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            _pg_discard(pool, conn)
            conn = None
            if attempt == 1:
                continue
            current_app.logger.exception("Postgres caiu em /api/alteracoes/reports")
            return jsonify(ok=False, error="Falha de conexão com o Postgres"), 503

        finally:
            _pg_putconn(pool, conn)


@app.route("/api/alteracoes/reports/<int:report_id>", methods=["PATCH"])
def api_alteracoes_reports_update(report_id: int):
    if "id_usuario" not in session:
        return jsonify(ok=False, error="Não autenticado"), 401

    pool = current_app.config.get("PG_POOL")
    if not pool:
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 500

    data = request.get_json(silent=True) or {}

    acao = (data.get("acao") or "").strip().lower()  # "corrigido" | "engano" | "pendente"
    obs = (data.get("obs") or "").strip()
    feito = bool(data.get("feito", False))

    if acao not in ("corrigido", "engano", "pendente"):
        return jsonify(ok=False, error='Campo "acao" deve ser "corrigido", "engano" ou "pendente"'), 400

    # VOLTAR P/ PENDENTE: limpa obs e marca feito=false
    if acao == "pendente":
        obs = ""
        feito = False
    else:
        if acao == "engano" and not obs:
            return jsonify(ok=False, error='Para "engano" a observação é obrigatória'), 400

        # "corrigido" sempre vira feito=True
        if acao == "corrigido":
            feito = True
            if not obs:
                obs = "CORRIGIDO."

        # prefixa para ficar claro no histórico, sem criar coluna extra
        prefix = "CORRIGIDO: " if acao == "corrigido" else "ENGANO: "
        if obs and not obs.upper().startswith(("CORRIGIDO:", "ENGANO:")):
            obs = prefix + obs

    for attempt in (1, 2):
        conn = None
        try:
            conn = pool.getconn()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"""
                    UPDATE {TBL_REPORTS}
                    SET obs = %s,
                        feito = %s
                    WHERE id = %s
                      AND sandbox = %s
                    RETURNING
                      id,
                      created_at,
                      empresa_label,
                      marketplace_label,
                      etiqueta_id,
                      produto,
                      sku,
                      ean,
                      tipo,
                      report,
                      colaborador,
                      obs,
                      feito
                    """,
                    (obs, feito, report_id, get_sandbox())
                )
                row = cur.fetchone()
                if not row:
                    conn.rollback()
                    return jsonify(ok=False, error="Report não encontrado (ou ambiente diferente)."), 404

                conn.commit()
                return jsonify(ok=True, item=row), 200

        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            _pg_discard(pool, conn)
            conn = None
            if attempt == 1:
                continue
            current_app.logger.exception("Postgres caiu em PATCH /api/alteracoes/reports/<id>")
            return jsonify(ok=False, error="Falha de conexão com o Postgres"), 503

        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            current_app.logger.exception("Erro ao atualizar report")
            return jsonify(ok=False, error=str(e)), 500

        finally:
            _pg_putconn(pool, conn)