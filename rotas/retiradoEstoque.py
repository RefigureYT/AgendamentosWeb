import json
import mysql.connector
from flask import session, render_template, Blueprint, request, jsonify, current_app as app, redirect, url_for, make_response
from datetime import datetime
from classes.models import Agendamento
from main import agendamento_controller
import requests
from datetime import datetime, date
import re
import threading
import queue
import uuid
from typing import Literal, Optional
from datetime import datetime
import pytz

tz = pytz.timezone("America/Sao_Paulo")
data_str = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")

bp_retirado = Blueprint('retirado', __name__)

_TINY_BASE = "https://api.tiny.com.br/public-api/v3"  # segue seu padrão

# Fila e status de tarefas em memória (simples; reinício do app limpa o estado)
_mov_queue: "queue.Queue[dict]" = queue.Queue()
_mov_status: dict[str, dict] = {}
_mov_worker_started = False

# Configuração de acesso ao MySQL
_db_config = {
    'host': '192.168.15.200',
    'port': 3306,
    'user': 'Bruno_Lallo',
    'password': 'ji}dx(v{M,z2j+f>[/}%_Vr-0?nI}W*@Dw68NnHJ+tMu&ZkF',
    'database': 'jp_bd',
    'autocommit': True
}

# ===================== WORKER (com retries) =====================

def _start_estoque_worker_once():
    """Inicia uma única thread daemon que consome _mov_queue e lança no Tiny (com logs detalhados)."""
    global _mov_worker_started
    if _mov_worker_started:
        print("[estoque-worker] já iniciado.")
        return

    def _estoque_worker():
        import time

        print("[estoque-worker] thread iniciada.")
        while True:
            task = _mov_queue.get()  # bloqueia até ter tarefa
            task_id = task["task_id"]
            print("\n[estoque-worker] >>> Nova task recebida:", task_id)
            print("[estoque-worker] Task bruta:", task)

            try:
                _mov_status[task_id]["status"] = "processando"

                id_produto: int = task["id_produto"]
                id_deposito: int = task["id_deposito"]
                quantidade: float = task["quantidade"]
                tipo_api: Literal["S", "E", "B"] = task["tipo_api"]
                token: str = task["token"]
                observacoes: Optional[str] = task.get("observacoes")
                preco_unitario: Optional[float] = task.get("preco_unitario")

                try:
                    tz = pytz.timezone("America/Sao_Paulo")
                    data_str = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    data_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                quantidade_abs = abs(float(quantidade))
                url = f"{_TINY_BASE}/estoque/{id_produto}"

                current_token = token
                attempt_429 = 0
                did_swap_token = False

                print(f"[estoque-worker:{task_id}] url={url}")
                print(f"[estoque-worker:{task_id}] deposito={id_deposito} produto={id_produto} qtd={quantidade_abs} tipo={tipo_api}")
                print(f"[estoque-worker:{task_id}] token(recebido)={current_token[:5]}...{current_token[-5:] if len(current_token)>5 else current_token} (len={len(current_token)})")

                while True:
                    auth_header = _normalize_bearer(current_token)
                    print(f"[estoque-worker:{task_id}] Authorization header=Bearer <{len(current_token)} chars> (prefix ok={auth_header.lower().startswith('bearer ')})")

                    headers = {
                        "Authorization": auth_header,
                        "User-Agent": "AgendamentosWeb/1.0",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    }
                    body = {
                        "deposito": {"id": id_deposito},
                        "tipo": tipo_api,
                        "data": data_str,
                        "quantidade": quantidade_abs,
                        "precoUnitario": float(preco_unitario) if preco_unitario is not None else 0,
                        "observacoes": (observacoes or "")
                    }

                    print(f"[estoque-worker:{task_id}] POST -> Tiny (tentativa 429={attempt_429}, token_trocado={did_swap_token})")
                    try:
                        r = requests.post(url, headers=headers, json=body, timeout=30)
                    except requests.RequestException as req_err:
                        print(f"[estoque-worker:{task_id}] EXCEPTION requests: {req_err}")
                        _mov_status[task_id]["status"] = "falhou"
                        _mov_status[task_id]["error"] = {"exception": str(req_err)}
                        break

                    # Guarda payload essencial e status
                    _mov_status[task_id]["request"] = {
                        "url": url,
                        "body": {**body, "observacoes": "[omitted]" if body.get("observacoes") else ""},
                        "status_code": r.status_code
                    }

                    # Log de resposta
                    resp_text = (r.text or "")
                    short = (resp_text[:300] + ("..." if len(resp_text) > 300 else ""))
                    print(f"[estoque-worker:{task_id}] Tiny respondeu HTTP {r.status_code}")
                    print(f"[estoque-worker:{task_id}] Resumo resposta: {short}")

                    try:
                        resp_json = r.json()
                    except Exception:
                        resp_json = {"raw": resp_text}

                    if 200 <= r.status_code < 300:
                        print(f"[estoque-worker:{task_id}] ✅ CONCLUÍDO. JSON:", resp_json)
                        _mov_status[task_id]["status"] = "concluido"
                        _mov_status[task_id]["result"] = resp_json
                        break

                    # 401/403 -> tenta trocar token UMA vez
                    if r.status_code in (401, 403):
                        print(f"[estoque-worker:{task_id}] ⚠️ Auth falhou ({r.status_code}). Tentando buscar token no DB...")
                        if not did_swap_token:
                            new_tok = _get_fallback_token_from_db()
                            if new_tok and new_tok != current_token:
                                print(f"[estoque-worker:{task_id}] Token trocado: {current_token[:3]}... -> {new_tok[:3]}... (len {len(new_tok)})")
                                did_swap_token = True
                                current_token  = new_tok
                                continue  # reexecuta já com o novo token
                            else:
                                print(f"[estoque-worker:{task_id}] Nenhum token válido retornado do DB (new_tok={bool(new_tok)}).")
                        _mov_status[task_id]["status"] = "falhou"
                        _mov_status[task_id]["error"] = {
                            "status_code": r.status_code,
                            "response": resp_json,
                            "detail": "Falha de autenticação; troca de token indisponível/ineficaz."
                        }
                        break

                    # 429 -> backoff
                    if r.status_code == 429:
                        wait_s = _wait_backoff_429(attempt_429)
                        print(f"[estoque-worker:{task_id}] 429 recebido. Próxima espera: {wait_s}s")
                        attempt_429 += 1
                        if wait_s < 0:
                            print(f"[estoque-worker:{task_id}] ❌ Backoff máximo atingido; encerrando.")
                            _mov_status[task_id]["status"] = "falhou"
                            _mov_status[task_id]["error"] = {
                                "status_code": r.status_code,
                                "response": resp_json,
                                "detail": "Rate limit persistente; backoff máximo atingido."
                            }
                            break
                        time.sleep(wait_s)
                        continue

                    # Outros erros -> falha direta
                    print(f"[estoque-worker:{task_id}] ❌ Erro não tratado para retry (status={r.status_code}).")
                    _mov_status[task_id]["status"] = "falhou"
                    _mov_status[task_id]["error"] = {
                        "status_code": r.status_code,
                        "response": resp_json
                    }
                    break

            except Exception as e:
                print(f"[estoque-worker:{task_id}] EXCEPTION geral:", e)
                _mov_status[task_id]["status"] = "falhou"
                _mov_status[task_id]["error"] = {"exception": str(e)}
                try:
                    app.logger.exception("Falha no worker de estoque")
                except Exception:
                    pass
            finally:
                print(f"[estoque-worker] <<< Task finalizada: {task_id} (status={_mov_status[task_id]['status']})\n")
                _mov_queue.task_done()

    t = threading.Thread(target=_estoque_worker, daemon=True, name="estoque-worker")
    t.start()
    _mov_worker_started = True
    print("[estoque-worker] thread disparada.")
    
@bp_retirado.route('/api/bipagem/detalhe', methods=['GET'])
def api_bipagem_detalhe():
    """
    GET /api/bipagem/detalhe?id_agend_ml=123&sku=API1

    Retorna:
      - bipagem (1 linha de agendamento_produto_bipagem)
      - equivalentes (N linhas de agendamento_produto_bipagem_equivalentes)
      - totais (diretos, equivalentes_total, total)
    """
    try:
        id_agend_ml_raw = request.args.get('id_agend_ml')
        sku = (request.args.get('sku') or '').strip()

        # validações
        try:
            id_agend_ml = int(id_agend_ml_raw)
        except (TypeError, ValueError):
            return _cors_error("Query 'id_agend_ml' deve ser inteiro", 400)
        if not sku:
            return _cors_error("Query 'sku' é obrigatória", 400)
        if len(sku) > 30:
            return _cors_error("Query 'sku' excede 30 caracteres", 400)

        # SQL
        sql_bipagem = """
            SELECT id_agend_ml, sku, bipados
            FROM agendamento_produto_bipagem
            WHERE id_agend_ml = %s AND sku = %s
            LIMIT 1
        """
        sql_equivs = """
            SELECT
                id,
                id_agend_ml,
                sku_original,
                gtin_original,
                id_tiny_original,
                nome_equivalente,
                sku_bipado,
                gtin_bipado,
                id_tiny_equivalente,
                bipados,
                criado_por,
                criado_em,
                atualizado_em,
                observacao
            FROM agendamento_produto_bipagem_equivalentes
            WHERE id_agend_ml = %s AND sku_original = %s
            ORDER BY sku_bipado
        """

        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor(dictionary=True)

        # 1) Direto
        cur.execute(sql_bipagem, (id_agend_ml, sku))
        bipagem = cur.fetchone()  # dict | None

        # 2) Equivalentes
        cur.execute(sql_equivs, (id_agend_ml, sku))
        equivalentes = cur.fetchall()  # list[dict]

        cur.close(); conn.close()

        # helpers
        def serialize(v):
            if isinstance(v, (datetime, date)):
                return v.strftime("%Y-%m-%d %H:%M:%S")
            return v

        def to_int_safe(v, default=0):
            try:
                return int(v)
            except (TypeError, ValueError):
                return default

        # normaliza datas
        for row in (equivalentes or []):
            for k, v in list(row.items()):
                row[k] = serialize(v)

        # totais robustos
        bipados_diretos = to_int_safe(bipagem.get("bipados")) if bipagem else 0
        bipados_equivalentes_total = sum(to_int_safe(e.get("bipados")) for e in (equivalentes or []))
        bipados_total = bipados_diretos + bipados_equivalentes_total

        resp = make_response(jsonify({
            "ok": True,
            "id_agend_ml": id_agend_ml,
            "sku": sku,
            "bipagem": bipagem,                 # dict ou null
            "equivalentes": equivalentes,       # lista (0..N)
            "totais": {
                "bipados_diretos": bipados_diretos,
                "bipados_equivalentes_total": bipados_equivalentes_total,
                "bipados_total": bipados_total
            }
        }), 200)
        _set_cors_headers(resp)  # inofensivo se mesma origem
        return resp

    except Exception as e:
        app.logger.exception("Erro em /api/bipagem/detalhe [GET]")
        resp = make_response(jsonify(ok=False, error=str(e)), 500)
        _set_cors_headers(resp)
        return resp

@bp_retirado.route('/api/bipar', methods=['POST'])
def api_bipar():
    """
    Faz upsert em agendamento_produto_bipagem (bipe direto) e
    retorna o TOTAL = diretos + equivalentes para o sku original.
    """
    data     = request.get_json() or {}
    id_agend = data.get('id_agend')
    sku      = (data.get('sku') or '').strip()
    quant    = int(data.get('quant', 1))

    if not id_agend or not sku:
        return jsonify(error="Parâmetros 'id_agend' e 'sku' são obrigatórios"), 400

    insert_sql = """
        INSERT INTO agendamento_produto_bipagem (id_agend_ml, sku, bipados)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE bipados = bipados + %s
    """
    select_diretos_sql = """
        SELECT bipados
        FROM agendamento_produto_bipagem
        WHERE id_agend_ml = %s AND sku = %s
    """
    select_equiv_sql = """
        SELECT COALESCE(SUM(bipados), 0)
        FROM agendamento_produto_bipagem_equivalentes
        WHERE id_agend_ml = %s AND sku_original = %s
    """

    try:
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()

        # Upsert do bip "direto"
        cur.execute(insert_sql, (id_agend, sku, quant, quant))

        # Lê diretos atualizados
        cur.execute(select_diretos_sql, (id_agend, sku))
        row = cur.fetchone()
        diretos = int(row[0]) if row else 0

        # Soma equivalentes para este sku_original no mesmo agendamento
        cur.execute(select_equiv_sql, (id_agend, sku))
        equiv = int(cur.fetchone()[0] or 0)

        total = diretos + equiv

        cur.close()
        conn.close()

        # Mantive 'bipados' como TOTAL p/ não quebrar sua UI atual
        return jsonify(
            ok=True,
            sku=sku,
            bipados=total,                    # TOTAL (diretos + equivalentes)
            bipados_diretos=diretos,          # só diretos
            bipados_equivalentes=equiv        # só equivalentes
        )
    except Exception as e:
        app.logger.exception("Erro em api_bipar")
        return jsonify(error=str(e)), 500


def normalize_gtin(value):
    if value is None:
        return None
    s = str(value).strip()
    # Tratamentos comuns de "não encontrado"
    if s.lower() in {
        "gtin/ean não encontrado", "gtin nao encontrado", "gtin não encontrado",
        "ean não encontrado", "nao encontrado", "não encontrado", "not found", ""
    }:
        return None
    # Se vier um número, mantemos só dígitos; senão devolvemos original
    digits = re.sub(r'\D+', '', s)
    return digits if digits else s  # pode ser texto curto; coluna é VARCHAR(14)

def to_int_or_none(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None

@bp_retirado.route('/api/equiv/bipar', methods=['POST'])
def api_equiv_bipar():
    data = request.get_json() or {}

    # obrigatórios
    id_agend     = data.get('id_agend')
    sku_original = (data.get('sku_original') or '').strip()
    sku_bipado   = (data.get('sku_bipado') or '').strip()

    # opcionais
    gtin_original       = normalize_gtin(data.get('gtin_original'))
    gtin_bipado         = normalize_gtin(data.get('gtin_bipado'))
    id_tiny_original    = to_int_or_none(data.get('id_tiny_original'))
    id_tiny_equivalente = to_int_or_none(data.get('id_tiny_equivalente'))
    nome_equivalente    = (data.get('nome_equivalente') or '').strip() or None   # <<< ADICIONADO
    usuario             = (data.get('usuario') or '').strip() or 'Desconhecido'
    observacao          = (data.get('observacao') or '').strip() or None

    # valida mínimos
    try:
        id_agend = int(id_agend)
    except (TypeError, ValueError):
        return jsonify(error="'id_agend' deve ser inteiro"), 400
    if not sku_original or not sku_bipado:
        return jsonify(error="Campos 'sku_original' e 'sku_bipado' são obrigatórios"), 400
    if len(sku_original) > 30 or len(sku_bipado) > 30:
        return jsonify(error="SKU excede 30 caracteres"), 400
    if gtin_original and len(str(gtin_original)) > 14:
        return jsonify(error="gtin_original excede 14 caracteres após normalização"), 400
    if gtin_bipado and len(str(gtin_bipado)) > 14:
        return jsonify(error="gtin_bipado excede 14 caracteres após normalização"), 400
    if observacao and len(observacao) > 255:
        return jsonify(error="observacao excede 255 caracteres"), 400
    if usuario and len(usuario) > 100:
        return jsonify(error="usuario excede 100 caracteres"), 400
    if nome_equivalente and len(nome_equivalente) > 255:                           # <<< ADICIONADO
        return jsonify(error="nome_equivalente excede 255 caracteres"), 400

    insert_sql = """
        INSERT INTO agendamento_produto_bipagem_equivalentes
          (id_agend_ml, sku_original, gtin_original, id_tiny_original,
           nome_equivalente,                                                   
           sku_bipado,  gtin_bipado,  id_tiny_equivalente,
           bipados, criado_por, observacao)
        VALUES (%s, %s, %s, %s,
                %s,
                %s, %s, %s,
                0, %s, %s)
    """

    try:
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()
        cur.execute(
            insert_sql,
            (id_agend, sku_original, gtin_original, id_tiny_original,
             nome_equivalente,                                                     # <<< ADICIONADO
             sku_bipado, gtin_bipado, id_tiny_equivalente,
             usuario, observacao)
        )
        conn.commit()
        cur.close(); conn.close()

        return jsonify(
            ok=True, created=True,
            id_agend=id_agend,
            sku_original=sku_original, gtin_original=gtin_original, id_tiny_original=id_tiny_original,
            nome_equivalente=nome_equivalente,                                     # <<< ADICIONADO (não quebra nada)
            sku_bipado=sku_bipado,   gtin_bipado=gtin_bipado,   id_tiny_equivalente=id_tiny_equivalente,
            bipados=0, criado_por=usuario, observacao=observacao
        ), 201

    except mysql.connector.Error as e:
        from mysql.connector import errorcode
        if getattr(e, "errno", None) == errorcode.ER_DUP_ENTRY:
            return jsonify(ok=False, error="Equivalente já existe (id_agend_ml, sku_original, sku_bipado).", code="DUPLICATE"), 409
        if getattr(e, "errno", None) == errorcode.ER_NO_REFERENCED_ROW_2:
            return jsonify(ok=False, error="FK violada: (id_agend_ml, sku) não existe na tabela pai.", code="FK_FAIL"), 422
        app.logger.exception("Erro em /api/equiv/bipar")
        return jsonify(error=str(e)), 500
    
@bp_retirado.route('/api/equiv/add-unidades', methods=['POST'])
def api_equiv_add_unidades():
    data         = request.get_json() or {}
    id_agend     = data.get('id_agend')
    sku_original = (data.get('sku_original') or '').strip()
    sku_bipado   = (data.get('sku_bipado') or '').strip()
    quant        = int(data.get('quant', 1))

    if not id_agend or not sku_original or not sku_bipado:
        return jsonify(error="Campos 'id_agend', 'sku_original', 'sku_bipado' são obrigatórios"), 400
    if quant == 0:
        return jsonify(error="'quant' deve ser diferente de zero"), 400

    upd_sql = """
        UPDATE agendamento_produto_bipagem_equivalentes
           SET bipados = bipados + %s, atualizado_em = CURRENT_TIMESTAMP
         WHERE id_agend_ml=%s AND sku_original=%s AND sku_bipado=%s
    """
    sel_par_sql = """
        SELECT bipados
          FROM agendamento_produto_bipagem_equivalentes
         WHERE id_agend_ml=%s AND sku_original=%s AND sku_bipado=%s
    """
    sel_diretos_sql = """
        SELECT COALESCE(bipados,0)
          FROM agendamento_produto_bipagem
         WHERE id_agend_ml=%s AND sku=%s
    """
    sel_equiv_total_sql = """
        SELECT COALESCE(SUM(bipados),0)
          FROM agendamento_produto_bipagem_equivalentes
         WHERE id_agend_ml=%s AND sku_original=%s
    """

    try:
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()

        # 1) soma no par equivalente (erro 404 se não existir)
        cur.execute(upd_sql, (quant, id_agend, sku_original, sku_bipado))
        if cur.rowcount == 0:
            cur.close(); conn.close()
            return jsonify(ok=False, error="Equivalente não encontrado para este agendamento/sku"), 404

        # (opcional) commit imediato da alteração
        conn.commit()

        # 2) valor do par (equivalente) após a soma
        cur.execute(sel_par_sql, (id_agend, sku_original, sku_bipado))
        row = cur.fetchone()
        bipados_par = int(row[0]) if row else 0

        # 3) diretos do sku_original
        cur.execute(sel_diretos_sql, (id_agend, sku_original))
        row = cur.fetchone()
        bipados_diretos = int(row[0]) if row else 0

        # 4) soma de TODOS os equivalentes para o sku_original
        cur.execute(sel_equiv_total_sql, (id_agend, sku_original))
        row = cur.fetchone()
        bipados_equivalentes_total = int(row[0]) if row and row[0] is not None else 0

        # 5) total final = diretos + equivalentes_total
        bipados_total = bipados_diretos + bipados_equivalentes_total

        cur.close(); conn.close()

        return jsonify(
            ok=True,
            id_agend=id_agend,
            sku_original=sku_original,
            sku_bipado=sku_bipado,
            incrementado=quant,
            bipados=bipados_par,                      # valor do PAR equivalente (como antes)
            bipados_diretos=bipados_diretos,          # só diretos
            bipados_equivalentes_total=bipados_equivalentes_total,  # soma de todos equivalentes
            bipados_total=bipados_total               # diretos + equivalentes_total
        )
    except Exception as e:
        app.logger.exception("Erro em /api/equiv/add-unidades")
        return jsonify(error=str(e)), 500

@bp_retirado.route('/api/bipados/<int:id_agend>')
def api_bipados_agend(id_agend):
    select_sql = """
        SELECT sku, bipados
        FROM agendamento_produto_bipagem
        WHERE id_agend_ml = %s
    """
    try:
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()
        cur.execute(select_sql, (id_agend,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([{'sku': r[0], 'bipados': r[1]} for r in rows])
    except Exception as e:
        app.logger.exception("Erro em api_bipados_agend")
        return jsonify(error=str(e)), 500

@bp_retirado.route('/api/bipados-total/<int:id_agend>')
def api_bipados_total(id_agend):
    sql = """
        SELECT
          x.sku_original,
          SUM(x.bipados) AS bipados_total
        FROM (
          SELECT
            apb.sku AS sku_original,
            COALESCE(apb.bipados, 0) AS bipados
          FROM agendamento_produto_bipagem apb
          WHERE apb.id_agend_ml = %s

          UNION ALL

          SELECT
            ape.sku_original AS sku_original,
            COALESCE(ape.bipados, 0) AS bipados
          FROM agendamento_produto_bipagem_equivalentes ape
          WHERE ape.id_agend_ml = %s
        ) x
        GROUP BY x.sku_original
        ORDER BY x.sku_original
    """
    try:
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()
        cur.execute(sql, (id_agend, id_agend))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([{"sku_original": r[0], "bipados_total": int(r[1])} for r in rows])
    except Exception as e:
        app.logger.exception("Erro em api_bipados_total")
        return jsonify(error=str(e)), 500

@bp_retirado.route('/api/equiv/<int:id_agend>', methods=['GET'])
def api_equiv_listar(id_agend):
    sql = """
        SELECT
            id,
            id_agend_ml,
            sku_original,
            gtin_original,
            id_tiny_original,
            nome_equivalente,                 -- <<< ADICIONADO
            sku_bipado,
            gtin_bipado,
            id_tiny_equivalente,
            bipados,
            criado_por,
            criado_em,
            atualizado_em,
            observacao
        FROM agendamento_produto_bipagem_equivalentes
        WHERE id_agend_ml = %s
        ORDER BY sku_original, sku_bipado
    """
    try:
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor(dictionary=True)
        cur.execute(sql, (id_agend,))
        rows = cur.fetchall()
        cur.close(); conn.close()

        def serialize(v):
            if isinstance(v, (datetime, date)):
                return v.strftime("%Y-%m-%d %H:%M:%S")
            return v

        return jsonify([
            {k: serialize(v) for k, v in row.items()}
            for row in rows
        ])
    except Exception as e:
        app.logger.exception("Erro em /api/equiv/<id>")
        return jsonify(error=str(e)), 500


@bp_retirado.route('/api/equiv/delete', methods=['DELETE'])
def api_equiv_delete():
    """
    DELETE /api/equiv/delete
    Body JSON:
    {
        "id_agend": 123,
        "sku_original": "SKU-ORIG",
        "sku_bipado": "SKU-BIPADO"
    }

    Exclui um registro específico da tabela
    agendamento_produto_bipagem_equivalentes.
    """
    data = request.get_json() or {}

    # ----------------------------
    # 1) Captura e valida entradas
    # ----------------------------
    id_agend     = data.get('id_agend')
    sku_original = (data.get('sku_original') or '').strip()
    sku_bipado   = (data.get('sku_bipado') or '').strip()

    try:
        id_agend = int(id_agend)
    except (TypeError, ValueError):
        return jsonify(ok=False, error="'id_agend' deve ser inteiro"), 400

    if not sku_original or not sku_bipado:
        return jsonify(ok=False, error="Campos 'sku_original' e 'sku_bipado' são obrigatórios"), 400
    if len(sku_original) > 30 or len(sku_bipado) > 30:
        return jsonify(ok=False, error="SKU excede 30 caracteres"), 400

    # ----------------------------
    # 2) SQL principal
    # ----------------------------
    delete_sql = """
        DELETE FROM agendamento_produto_bipagem_equivalentes
         WHERE id_agend_ml = %s
           AND sku_original = %s
           AND sku_bipado = %s
    """

    # Após excluir, recalculamos o total de bipados
    select_diretos_sql = """
        SELECT COALESCE(bipados,0)
        FROM agendamento_produto_bipagem
        WHERE id_agend_ml = %s AND sku = %s
    """
    select_equiv_total_sql = """
        SELECT COALESCE(SUM(bipados),0)
        FROM agendamento_produto_bipagem_equivalentes
        WHERE id_agend_ml = %s AND sku_original = %s
    """

    try:
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()

        # ----------------------------
        # 3) Executa exclusão
        # ----------------------------
        cur.execute(delete_sql, (id_agend, sku_original, sku_bipado))
        rows_affected = cur.rowcount

        if rows_affected == 0:
            cur.close(); conn.close()
            return jsonify(ok=False, error="Equivalente não encontrado para exclusão"), 404

        conn.commit()

        # ----------------------------
        # 4) Recalcula totais
        # ----------------------------
        cur.execute(select_diretos_sql, (id_agend, sku_original))
        row = cur.fetchone()
        bipados_diretos = int(row[0]) if row else 0

        cur.execute(select_equiv_total_sql, (id_agend, sku_original))
        row = cur.fetchone()
        bipados_equivalentes_total = int(row[0]) if row and row[0] is not None else 0

        bipados_total = bipados_diretos + bipados_equivalentes_total

        cur.close(); conn.close()

        return jsonify(
            ok=True,
            deleted=True,
            id_agend=id_agend,
            sku_original=sku_original,
            sku_bipado=sku_bipado,
            bipados_diretos=bipados_diretos,
            bipados_equivalentes_total=bipados_equivalentes_total,
            bipados_total=bipados_total
        ), 200

    except Exception as e:
        app.logger.exception("Erro em /api/equiv/delete")
        return jsonify(ok=False, error=str(e)), 500

@bp_retirado.route('/retirado', methods=['GET', 'POST'])
def retirado_estoque():
    if request.method == "GET":
        agendamento_controller.clear_agendamentos()
        # Corrigido para lidar com IDs que podem não ser inteiros inicialmente
        id_agendamento = request.args['id']
        agendamento_controller.insert_agendamento(id_bd=int(id_agendamento))
        agend: Agendamento = agendamento_controller.get_last_made_agendamento()
        agendamento_controller.create_agendamento_from_bd_data(agend)
        agendamento_controller.set_error_flags_composicoes(agend)

        tipo = int(request.args.get('tipo', 0))

        if tipo == 1:
            return render_template(
            'limpeza.html',
            dados=agendamento_controller.search_agendamento('id_bd', str(agend.id_bd)),
            comps=agendamento_controller.return_all_in_dict(agend)
            )

        elif tipo == 4: # Fase "Embalar"
            comps = []
            for p in agend.produtos:
                pd = p.to_dict() 
                pd['imagemUrl'] = pd.pop('imagem_url', '') 
                pd['composicoes'] = []
                for c in p.composicoes:
                    comp_dict = c.to_dict()
                    comp_dict['imagem_url'] = comp_dict.get('imagem_url', '')
                    pd['composicoes'].append(comp_dict)
                comps.append(pd)
            return render_template(
                'embalar.html',
                dados=agend,
                comps=comps, 
                dados_agend=agend
            )

        elif tipo == 5:
            return redirect(url_for('expedicao', id_agend_bd=agend.id_bd))

        else:
            comps = []
            pode_mudar = request.args.get('mudar', 'False').lower() == 'true'
            for p in agend.produtos:
                pd = p.to_dict() 
                pd['imagemUrl'] = pd.pop('imagem_url', '') 
                pd['composicoes'] = []
                for c in p.composicoes:
                    comp_dict = c.to_dict()
                    comp_dict['imagem_url'] = comp_dict.get('imagem_url', '')
                    pd['composicoes'].append(comp_dict)
                comps.append(pd)
            
            # mapeamento marketplace no mesmo padrão do dicionário de empresa
            marketplace_map = {
                1: "Mercado Livre",
                2: "Magalu",
                3: "Shopee",
                4: "Amazon"
            }
            marketplace_nome = marketplace_map.get(getattr(agend, "id_mktp", 0), "Nenhuma")

            return render_template(
                'retiradoEstoque.html',
                dados=agendamento_controller.return_comp_grouped(agend),
                comps=comps,
                pode_mudar=pode_mudar,
                dados_agend=agendamento_controller.get_last_made_agendamento(),
                marketplace_nome=marketplace_nome
            )

    # ─── se for POST (finaliza e redireciona para embalar) ───────────────────
    agendamento_controller.clear_agendamentos()
    agendamento_controller.insert_agendamento(request.form['inp_id_pedido'])
    agend: Agendamento = agendamento_controller.get_last_made_agendamento()
    agendamento_controller.create_agendamento_from_bd_data(agend)
    agendamento_controller.set_error_flags_composicoes(agend)
    agendamento_controller.set_empresa_colaborador_agend(
        agend,
        request.form.get('inp_nome_emp', ''),
        request.form.get('inp_nome_col', '')
    )
    agendamento_controller.update_empresa_colaborador_bd(agend)

    # Marca como embalar
    agend.set_tipo(4)
    agendamento_controller.update_agendamento(agend)

    # ─── Recria o comps serializável para o POST também ────────────────
    comps = []
    for p in agend.produtos:
        pd = p.to_dict()
        # Busca e adiciona a URL da imagem
        pd['imagemUrl'] = agendamento_controller.get_product_image_url(p.sku)
        pd['composicoes'] = [c.to_dict() for c in p.composicoes]
        comps.append(pd)
    # ────────────────────────────────────────────────────────────────────

    return render_template(
        'embalar.html',
        dados=agendamento_controller.search_agendamento('id_bd', agend.id_bd),
        comps=comps,
        dados_agend=agend
    )

@bp_retirado.route('/relatorio/finalizar/<int:id_agend>', methods=['POST'])
def finalizar_conferencia(id_agend):
    """
    Finaliza a fase de conferência, gera um relatório e move o agendamento para Embalar.
    """
    try:
        # Carrega o agendamento em memória
        agendamento_controller.clear_agendamentos()
        agendamento_controller.insert_agendamento(id_bd=id_agend)
        ag = agendamento_controller.get_last_made_agendamento()
        agendamento_controller.create_agendamento_from_bd_data(ag)

        # ----- O bloco de geração de relatório permanece o mesmo -----
        inicio = ag.entrada
        termino = datetime.now()
        duracao = termino - inicio
        informacoes = {
            "Agendamento": ag.id_agend_ml,
            "Empresa": {1:"Jaú Pesca",2:"Jaú Fishing",3:"L.T. Sports"}.get(ag.empresa, ""),
            "DataInicio": inicio.strftime("%d/%m/%Y %Hh %Mm %Ss"),
            "DataTerminoConferencia": termino.strftime("%d/%m/%Y %Hh %Mm %Ss"),
            "Permanencia": f"{duracao.seconds//3600:02d}h {(duracao.seconds%3600)//60:02d}m {duracao.seconds%60:02d}s"
        }
        colaboradores = [{"Colaborador": ag.colaborador}]
        rel = []
        for p in ag.produtos:
            total = sum(c.unidades_totais for c in p.composicoes) or p.unidades
            kits = [{"codigo_tiny_kit": c.id_tiny, "sku_kit": c.prod_sku} for c in p.composicoes]
            historico = []
            rel.append({
                "sku": p.sku, "codigo_de_barras":p.gtin, "codigo_tiny": p.id_tiny or None,
                "nome": p.nome, "unidades_totais": str(total), "faz_parte_de": kits, "historico": historico
            })
        payload = {
            "Informacoes": informacoes, "Colaboradores": colaboradores, "RelatorioConferencia": rel
        }
        # ----------------------------------------------------------------

        # Salva no banco
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()
        cur.execute(
            "INSERT INTO relatorio_agend (id_agend_ml, relatorio) VALUES (%s, %s) ON DUPLICATE KEY UPDATE relatorio = VALUES(relatorio)",
            (ag.id_agend_ml, json.dumps(payload, ensure_ascii=False))
        )
        conn.commit()
        cur.close()
        conn.close()

        # Marca como Embalar (ID 4)
        ag.set_tipo(4)
        agendamento_controller.update_agendamento(ag)

        # Retorna uma resposta de sucesso padronizada
        return jsonify({"success": True, "message": "Conferência finalizada! O agendamento foi movido para a Embalagem."})

    except Exception as e:
        app.logger.exception("Falha ao finalizar conferência e salvar relatório")
        return jsonify({"success": False, "message": f"Erro ao finalizar: {e}"}), 500


# ---------------------------------------------------------------
# 1) Proxy genérico para Tiny (GET + OPTIONS com CORS)
#    Front envia:
#      - Header "Path": ex. /public-api/v3/produtos
#      - Header "Authorization": ex. "Bearer xyz..."
#    Query string do request é repassada (ex.: ?codigo=JP123)
# ---------------------------------------------------------------
@bp_retirado.route('/api/tiny-proxy', methods=['GET', 'OPTIONS'])
def tiny_proxy():
    # Preflight CORS
    if request.method == 'OPTIONS':
        resp = make_response('', 204)
        _set_cors_headers(resp)
        return resp

    path = (request.headers.get('Path') or '').strip()
    auth = (request.headers.get('Authorization') or '').strip()

    if not path or not auth:
        return _cors_error('Headers "Path" e "Authorization" são obrigatórios', 400)

    # Normaliza e valida o Path para evitar SSRF
    if not path.startswith('/'):
        path = '/' + path

    # Permita só o prefixo da API pública do Tiny v3
    allowed_prefixes = ['/public-api/v3/']
    if not any(path.startswith(p) for p in allowed_prefixes):
        return _cors_error('Path inválido para proxy', 400)

    base_url = 'https://api.tiny.com.br'
    url = f'{base_url}{path}'

    # Copiamos a query string do request atual
    params = request.args.to_dict(flat=True)

    # Repassar somente o Authorization, definindo um UA simples
    headers = {
        'Authorization': auth,
        'User-Agent': 'AgendamentosWeb/1.0'
    }

    try:
        r = requests.get(url, headers=headers, params=params, timeout=20)
    except requests.RequestException as e:
        app.logger.exception('Falha ao chamar Tiny')
        return _cors_error(f'Erro ao contatar Tiny: {e}', 502)

    # Monta a resposta preservando status e content-type do Tiny
    resp = make_response(r.content, r.status_code)
    resp.headers['Content-Type'] = r.headers.get('Content-Type', 'application/json')
    _set_cors_headers(resp)
    return resp


# ---------------------------------------------------------------
# 2) Atalho: produto por SKU (POST JSON)
#    Body: { "sku": "JP123", "token": "Bearer xyz..." }  (ou mande o token no header Authorization)
# ---------------------------------------------------------------
@bp_retirado.route('/api/tiny/produto-por-sku', methods=['POST', 'OPTIONS'])
def tiny_produto_por_sku():
    if request.method == 'OPTIONS':
        resp = make_response('', 204)
        _set_cors_headers(resp)
        return resp

    data = request.get_json() or {}
    sku = (data.get('sku') or '').strip()
    token = (data.get('token') or request.headers.get('Authorization') or '').strip()

    if not sku or not token:
        return _cors_error('Parâmetros "sku" e "token" são obrigatórios', 400)

    # Garante prefixo Bearer (se já vier, mantemos)
    if not token.lower().startswith('bearer '):
        token = f'Bearer {token}'

    url = 'https://api.tiny.com.br/public-api/v3/produtos'
    headers = {'Authorization': token, 'User-Agent': 'AgendamentosWeb/1.0'}
    params = {'codigo': sku}

    try:
        r = requests.get(url, headers=headers, params=params, timeout=20)
    except requests.RequestException as e:
        app.logger.exception('Falha ao chamar Tiny (produto-por-sku)')
        return _cors_error(f'Erro ao contatar Tiny: {e}', 502)

    resp = make_response(r.content, r.status_code)
    resp.headers['Content-Type'] = r.headers.get('Content-Type', 'application/json')
    _set_cors_headers(resp)
    return resp


# ---------------------------------------------------------------
# Helpers CORS
# ---------------------------------------------------------------
def _set_cors_headers(resp):
    # Libere *apenas* o(s) origin(s) que você usa no front
    origin = request.headers.get('Origin') or '*'
    resp.headers['Access-Control-Allow-Origin'] = origin
    resp.headers['Vary'] = 'Origin'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Authorization, Path, Content-Type'
    resp.headers['Access-Control-Max-Age'] = '600'
    return resp

def _cors_error(msg, code):
    resp = make_response(jsonify(error=msg), code)
    _set_cors_headers(resp)
    return resp

def _to_str_first(v) -> str:
    """Converte para string. Se vier lista/tupla, usa o primeiro item.
    Se vier None -> '' . Se vier dict -> levanta ValueError (tipo inválido)."""
    if v is None:
        return ''
    if isinstance(v, (list, tuple)):
        v = v[0] if v else ''
    if isinstance(v, dict):
        raise ValueError("Tipo inválido (dict) para campo string")
    return str(v)

def _to_opt_str_first(v):
    """Como _to_str_first, mas retorna None se vazio após strip()."""
    s = _to_str_first(v).strip()
    return s if s else None


@bp_retirado.route('/transf-estoque', methods=['POST', 'OPTIONS'])
def transf_estoque():
    """
    Enfileira um lançamento de estoque no Tiny (S/E/B) para processamento em background.
    Body JSON:
      - id_deposito   (int|list[int])   -> obrigatório
      - id_produto    (int|list[int])   -> obrigatório
      - unidades      (number|list)     -> obrigatório (> 0)
      - tipo          (str|list[str])   -> "Saída" | "Entrada" | "Balanço" | "S" | "E" | "B"
      - auth_token    (str|list[str])   -> obrigatório (Bearer xyz... ou apenas xyz)
      - observacoes   (str|list[str])   -> opcional
      - preco_unitario(number|list)     -> opcional (default = 0)
    """
    if request.method == 'OPTIONS':
        resp = make_response('', 204)
        _set_cors_headers(resp)
        return resp

    try:
        _start_estoque_worker_once()
        data = request.get_json() or {}
        print("\n[/transf-estoque] payload recebido:", {k: (v if k!='auth_token' else '(omitido)') for k,v in data.items()})

        # --- Normalização defensiva ---
        try:
            _id_dep_raw = data.get('id_deposito')
            if isinstance(_id_dep_raw, (list, tuple)):
                _id_dep_raw = _id_dep_raw[0] if _id_dep_raw else None
            id_deposito = int(_id_dep_raw)

            _id_prod_raw = data.get('id_produto')
            if isinstance(_id_prod_raw, (list, tuple)):
                _id_prod_raw = _id_prod_raw[0] if _id_prod_raw else None
            id_produto = int(_id_prod_raw)

            _un_raw = data.get('unidades')
            if isinstance(_un_raw, (list, tuple)):
                _un_raw = _un_raw[0] if _un_raw else None
            quantidade = float(_un_raw)
        except (TypeError, ValueError):
            print("[/transf-estoque] erro de tipos nos campos id_deposito/id_produto/unidades")
            return _cors_error("Campos 'id_deposito', 'id_produto' devem ser inteiros e 'unidades' numérico", 400)

        if quantidade <= 0:
            print("[/transf-estoque] unidades <= 0")
            return _cors_error("Campo 'unidades' deve ser maior que zero", 400)

        try:
            tipo = _to_str_first(data.get('tipo')).strip()
            token = _to_str_first(data.get('auth_token')).strip()
            observacoes = _to_opt_str_first(data.get('observacoes'))
            _preco_raw = data.get('preco_unitario')
            if isinstance(_preco_raw, (list, tuple)):
                _preco_raw = _preco_raw[0] if _preco_raw else None
            preco_unit = float(_preco_raw) if _preco_raw is not None else None
        except ValueError as ve:
            print(f"[/transf-estoque] tipos inválidos no payload: {ve}")
            return _cors_error(f"Tipos inválidos no payload: {ve}", 400)

        if not token:
            print("[/transf-estoque] auth_token ausente")
            return _cors_error("Campo 'auth_token' é obrigatório", 400)

        # Mapeia tipo amigável -> API Tiny
        t = tipo.lower()
        if t in ('saida', 'saída', 's'):
            tipo_api = 'S'
        elif t in ('entrada', 'e'):
            tipo_api = 'E'
        elif t in ('balanco', 'balanço', 'b', 'ajuste'):
            tipo_api = 'B'
        else:
            print(f"[/transf-estoque] tipo inválido: {tipo}")
            return _cors_error("Campo 'tipo' deve ser 'Saída', 'Entrada' ou 'Balanço' (ou S/E/B)", 400)

        task_id = uuid.uuid4().hex
        print(f"[/transf-estoque] enfileirando task_id={task_id} deposito={id_deposito} produto={id_produto} qtd={quantidade} tipo={tipo_api}")

        _mov_status[task_id] = {
            "status": "enfileirado",
            "criado_em": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "params": {
                "id_produto": id_produto,
                "id_deposito": id_deposito,
                "unidades": quantidade,
                "tipo": tipo_api
            }
        }
        _mov_queue.put({
            "task_id": task_id,
            "id_produto": id_produto,
            "id_deposito": id_deposito,
            "quantidade": quantidade,
            "tipo_api": tipo_api,
            "token": token,
            "observacoes": observacoes,
            "preco_unitario": preco_unit,
        })

        resp = make_response(jsonify(ok=True, task_id=task_id, status="enfileirado"), 202)
        _set_cors_headers(resp)
        return resp

    except Exception as e:
        print(f"[/transf-estoque] EXCEPTION: {e}")
        try:
            app.logger.exception("Falha no POST /transf-estoque")
        except Exception:
            pass
        resp = make_response(jsonify(ok=False, error="Falha interna ao enfileirar lançamento", detalhe=str(e)), 500)
        _set_cors_headers(resp)
        return resp

@bp_retirado.route('/transf-estoque/status/<task_id>', methods=['GET', 'OPTIONS'])
def transf_estoque_status(task_id):
    if request.method == 'OPTIONS':
        resp = make_response('', 204)
        _set_cors_headers(resp)
        return resp

    print(f"[/transf-estoque/status] consulta status task_id={task_id}")
    st = _mov_status.get(task_id)
    if not st:
        print(f"[/transf-estoque/status] task não encontrada: {task_id}")
        return _cors_error("Task não encontrada", 404)

    resp = make_response(jsonify(st), 200)
    _set_cors_headers(resp)
    return resp

# ===================== HELPERS NOVOS =====================

def _wait_backoff_429(attempt_idx: int) -> int:
    """Backoff para 429 em segundos: 5, 10, 20, 40, 60, 120, 240, 480, 600. Ao estourar, retorna -1."""
    ladder = [5, 10, 20, 40, 60, 120, 240, 480, 600]
    return ladder[attempt_idx] if attempt_idx < len(ladder) else -1

def _get_fallback_token_from_db() -> Optional[str]:
    """
    Busca um access_token no MySQL:
      - Tenta pegar o MAIS RECENTE (quando houver carimbo de tempo/auto-inc).
      - Limpa aspas e espaços.
    Retorna a string do token (sem 'Bearer ') ou None.
    """
    try:
        print("[token-db] consultando DB por access_token (id_api_valor=13)")
        conn = mysql.connector.connect(**_db_config)
        cur  = conn.cursor()

        # Se houver coluna de timestamp/auto-inc, isso pega o mais recente.
        # Caso não exista, ORDER BY id_api_valor DESC mantém compatível.
        cur.execute("""
            SELECT access_token
              FROM apis_valores
             WHERE id_api_valor = 13
             ORDER BY id_api_valor DESC
             LIMIT 1
        """)
        row = cur.fetchone()
        cur.close(); conn.close()

        if not row:
            print("[token-db] nenhuma linha encontrada.")
            return None

        raw = row[0]
        if raw is None:
            print("[token-db] access_token NULL no DB.")
            return None

        tok = str(raw).strip().strip('"').strip("'")
        # Token “limpo”:
        tok = tok.replace("\r", "").replace("\n", "").strip()

        if not tok:
            print("[token-db] access_token vazio após limpeza.")
            return None

        print(f"[token-db] token encontrado: {tok[:5]}...{tok[-5:] if len(tok)>5 else tok} (len={len(tok)})")
        return tok
    except Exception as e:
        print("[token-db] EXCEPTION ao buscar token no DB:", e)
        try:
            app.logger.exception("Falha ao buscar fallback token no DB")
        except Exception:
            pass
        return None

def _normalize_bearer(token: str) -> str:
    return token if token.lower().startswith("bearer ") else f"Bearer {token}"

@bp_retirado.route('/api/tiny/produto-por-sku-interno', methods=['GET'])
def tiny_produto_por_sku_interno():
    """
    Busca produto no Tiny por SKU, usando o Caller do servidor.
    Requer usuário logado (session['id_usuario']).
    Ex.: GET /api/tiny/produto-por-sku-interno?sku=JP123
    """
    # Segurança extra (o before_request já bloqueia, mas deixo explícito):
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    sku = (request.args.get('sku') or '').strip()
    if not sku:
        return jsonify(ok=False, error='Parâmetro "sku" é obrigatório'), 400

    try:
        # Reaproveita o Caller (Tiny v3) já configurado no main.py
        # Dica: situacao='A' filtra produto ativo quando houver múltiplos
        resp = agendamento_controller.caller.make_call(
            'produtos',
            params_add={'codigo': sku, 'situacao': 'A'}
        )

        # Padroniza retorno
        if not isinstance(resp, dict):
            return jsonify(ok=False, error='Resposta inesperada do Tiny', raw=resp), 502

        itens = resp.get('itens', []) or []
        # Se vier mais de um, preferimos o ativo (situacao == 'A')
        ativo = next((i for i in itens if i.get('situacao') == 'A'), itens[0] if itens else None)

        return jsonify(ok=True, itens=itens, ativo=ativo), 200

    except Exception as e:
        app.logger.exception("Falha ao consultar Tiny por SKU")
        return jsonify(ok=False, error=str(e)), 500


@bp_retirado.route('/api/tiny/produto/<int:id_tiny>', methods=['GET'])
def tiny_produto_por_id_interno(id_tiny: int):
    """
    Detalhes do produto por ID do Tiny, com sessão obrigatória.
    Ex.: GET /api/tiny/produto/123456
    """
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    try:
        resp = agendamento_controller.caller.make_call(f'produtos/{id_tiny}')
        if not isinstance(resp, dict):
            return jsonify(ok=False, error='Resposta inesperada do Tiny', raw=resp), 502
        return jsonify(ok=True, produto=resp), 200
    except Exception as e:
        app.logger.exception("Falha ao consultar Tiny por ID")
        return jsonify(ok=False, error=str(e)), 500


@bp_retirado.route('/api/tiny/produto/<int:id_tiny>/kit', methods=['GET'])
def tiny_produto_kit_interno(id_tiny: int):
    """
    Composição (kit) do produto por ID do Tiny, com sessão obrigatória.
    Ex.: GET /api/tiny/produto/123456/kit
    """
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    try:
        resp = agendamento_controller.caller.make_call(f'produtos/{id_tiny}/kit')
        # O Tiny costuma devolver uma lista/nó simples; padronize para JSON
        return jsonify(ok=True, kit=resp), 200
    except Exception as e:
        app.logger.exception("Falha ao consultar kit do Tiny")
        return jsonify(ok=False, error=str(e)), 500
    
@bp_retirado.route('/api/tiny/composicao-por-sku', methods=['GET'])
def tiny_composicao_por_sku_interno():
    """
    GET /api/tiny/composicao-por-sku?sku=JP123
    - Requer sessão válida (usuário logado).
    - Busca produto por SKU no Tiny -> pega ID.
    - Busca composição (kit) por ID.
    - Retorna {"ok": true, "sku": "...", "id_tiny": 123, "kit": [...]}.
      Se não for kit, "kit" será [].
    """
    # segurança: exige usuário logado (além do before_request do app)
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    sku = (request.args.get('sku') or '').strip()
    if not sku:
        return jsonify(ok=False, error='Parâmetro "sku" é obrigatório'), 400

    try:
        # 1) Produto por SKU (preferindo ativo)
        resp_prod = agendamento_controller.caller.make_call(
            'produtos',
            params_add={'codigo': sku, 'situacao': 'A'}
        )
        if not isinstance(resp_prod, dict):
            return jsonify(ok=False, error='Resposta inesperada ao buscar produto', raw=resp_prod), 502

        itens = resp_prod.get('itens') or []
        if not itens:
            # tenta sem filtro 'situacao' como fallback
            resp_prod2 = agendamento_controller.caller.make_call(
                'produtos',
                params_add={'codigo': sku}
            )
            if isinstance(resp_prod2, dict):
                itens = resp_prod2.get('itens') or []

        if not itens:
            return jsonify(ok=False, error='Produto não encontrado pelo SKU', sku=sku), 404

        # escolhe item ativo; se não houver, pega o primeiro
        ativo = next((i for i in itens if (i or {}).get('situacao') == 'A'), itens[0])
        id_tiny = (ativo or {}).get('id')
        if not id_tiny:
            return jsonify(ok=False, error='Produto encontrado mas sem id Tiny'), 502

        # 2) Composição (kit) por ID
        # No seu projeto você usa '/produtos/{id}/kit' (mantemos a consistência)
        resp_kit = agendamento_controller.caller.make_call(f'produtos/{id_tiny}/kit')

        # Normaliza saída: se o Tiny não retornar lista, tenta extrair
        if isinstance(resp_kit, list):
            kit = resp_kit
        elif isinstance(resp_kit, dict) and 'itens' in resp_kit:
            kit = resp_kit.get('itens') or []
        elif resp_kit in (None, ''):
            kit = []
        else:
            # formato inesperado, mas não vamos quebrar o front
            kit = []

        return jsonify(ok=True, sku=sku, id_tiny=id_tiny, kit=kit), 200

    except Exception as e:
        app.logger.exception("Falha em /api/tiny/composicao-por-sku")
        return jsonify(ok=False, error=str(e)), 500
