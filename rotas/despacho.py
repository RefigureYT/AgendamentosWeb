from flask import Blueprint, jsonify, request, render_template, current_app, session
from psycopg2.extras import RealDictCursor
import psycopg2
import re
import time
import random
import uuid

def _pg_discard(pool, conn) -> None:
    """Remove conexão quebrada do pool."""
    if not conn or not pool:
        return
    try:
        pool.putconn(conn, close=True)
    except Exception:
        try:
            conn.close()
        except Exception:
            pass

def _pg_putconn(pool, conn) -> None:
    """
    Devolve conexão pro pool garantindo que não fica transação aberta.
    Se rollback falhar, descarta a conexão (porque provavelmente está morta).
    """
    if not conn or not pool:
        return
    try:
        conn.rollback()
    except Exception:
        _pg_discard(pool, conn)
        return
    pool.putconn(conn)

PG_MAX_RETRIES = 10
PG_BASE_SLEEP = 0.05
PG_MAX_SLEEP = 1.0

def _pg_sleep_backoff(attempt: int) -> None:
    # 0.05, 0.1, 0.2, 0.4, 0.8, 1.0, 1.0...
    delay = PG_BASE_SLEEP * (2 ** (attempt - 1))
    if delay > PG_MAX_SLEEP:
        delay = PG_MAX_SLEEP
    # jitter leve pra evitar thundering herd
    delay *= (0.8 + random.random() * 0.4)
    time.sleep(delay)

def _pg_select_all_with_retry(pool, sql: str, params=None, *, max_retries: int = PG_MAX_RETRIES):
    last_exc = None

    for attempt in range(1, max_retries + 1):
        conn = None
        handled = False

        try:
            conn = pool.getconn()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                return cur.fetchall() or []

        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            last_exc = e
            _pg_discard(pool, conn)  # descarta do pool
            handled = True

            if attempt >= max_retries:
                raise

            _pg_sleep_backoff(attempt)
            continue

        finally:
            if conn and not handled:
                _pg_putconn(pool, conn)

    # segurança (não deve chegar aqui)
    raise last_exc

bp_despacho = Blueprint('despacho', __name__)

def get_sandbox() -> bool:
    # debug=True => sandbox (testes) | debug=False => produção
    return bool(current_app.debug)

SCHEMA = "agendamentosweb"
TBL_DESPACHO = f"{SCHEMA}.despacho_crossdocking"
TBL_MKTP = f"{SCHEMA}.marketplace_agend"
TBL_EMP  = f"{SCHEMA}.empresas_agend"

def _digits(v) -> str:
    return re.sub(r"\D+", "", str(v or ""))


def _iso_row(row: dict) -> dict:
    # Converte date/time/datetime para string
    if not row:
        return row
    from datetime import date, datetime, time as dt_time
    for k, v in list(row.items()):
        if isinstance(v, (date, datetime, dt_time)):
            row[k] = v.isoformat()
    return row


@bp_despacho.route('/api/despacho/crossdocking/nfe', methods=['POST'])
def api_despacho_crossdocking_nfe():
    """
    POST /api/despacho/crossdocking/nfe
    """
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    data = request.get_json(silent=True) or {}

    # valida id_mktp
    try:
        id_mktp = int(data.get("id_mktp"))
        if id_mktp <= 0:
            raise ValueError()
    except Exception:
        return jsonify(ok=False, error='Parâmetro "id_mktp" é obrigatório e deve ser inteiro positivo'), 400

    # valida id_emp
    try:
        id_emp = int(data.get("id_emp"))
        if id_emp <= 0:
            raise ValueError()
    except Exception:
        return jsonify(ok=False, error='Parâmetro "id_emp" é obrigatório e deve ser inteiro positivo'), 400

    # valida chave 44 dígitos
    chave_digits = _digits((data.get("chave_acesso_nfe") or "").strip())
    if len(chave_digits) != 44:
        return jsonify(ok=False, error='Parâmetro "chave_acesso_nfe" inválido (precisa ter 44 dígitos)'), 400

    pool = current_app.config.get("PG_POOL")
    if not pool:
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 503

    last_exc = None

    for attempt in range(1, PG_MAX_RETRIES + 1):
        conn = None
        discarded = False

        try:
            conn = pool.getconn()

            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # confirma empresa
                cur.execute(f"SELECT 1 FROM {TBL_EMP} WHERE id_emp = %s AND id_emp > 0", (id_emp,))
                if not cur.fetchone():
                    return jsonify(ok=False, error="Empresa inválida ou não cadastrada."), 400

                # confirma marketplace
                cur.execute(f"SELECT 1 FROM {TBL_MKTP} WHERE id_mktp = %s", (id_mktp,))
                if not cur.fetchone():
                    return jsonify(ok=False, error="Marketplace inválido ou não cadastrado."), 400

                sandbox = get_sandbox()

                # Importante: se você quer manter 409 quando já existe, deixa assim.
                # (Não dá retry "cego" em duplicidade; isso é regra de negócio, não falha de conexão.)
                cur.execute(
                    f"""
                    INSERT INTO {TBL_DESPACHO}
                        (id_mktp, id_emp, chave_acesso_nfe, sandbox)
                    VALUES
                        (%s, %s, %s, %s)
                    RETURNING
                        id, id_mktp, id_emp, chave_acesso_nfe, numero_nota, data_despacho, hora_despacho, sandbox
                    """,
                    (id_mktp, id_emp, chave_digits, sandbox)
                )

                row = cur.fetchone()
                conn.commit()

                return jsonify(ok=True, row=_iso_row(row)), 200

        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            last_exc = e
            _pg_discard(pool, conn)
            discarded = True

            if attempt >= PG_MAX_RETRIES:
                err_id = uuid.uuid4().hex[:10]
                current_app.logger.exception(f"[{err_id}] Postgres desconectou em /api/despacho/crossdocking/nfe após {PG_MAX_RETRIES} tentativas")
                return jsonify(
                    ok=False,
                    error="Falha ao consultar o banco. Contate um administrador.",
                    error_id=err_id
                ), 503

            _pg_sleep_backoff(attempt)
            continue

        except Exception as e:
            # Duplicidade (unique) no Postgres
            if getattr(e, "pgcode", None) == "23505":
                return jsonify(ok=False, error="NF-e já cadastrada no banco"), 409

            try:
                if conn:
                    conn.rollback()
            except Exception:
                pass

            current_app.logger.exception("Falha ao inserir em agendamentosweb.despacho_crossdocking")
            return jsonify(ok=False, error=str(e)), 500

        finally:
            if conn and not discarded:
                _pg_putconn(pool, conn)

    # Segurança
    raise last_exc

@bp_despacho.route('/api/despacho/marketplaces', methods=['GET'])
def api_despacho_marketplaces():
    """
    GET /api/despacho/marketplaces
    Lê de: agendamentosweb.marketplace_agend
    Retorna: { ok: true, items: [{id_mktp, nome_mktp}, ...] }
    """
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    pool = current_app.config.get("PG_POOL")
    if not pool:
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 503

    sql = f"""
        SELECT id_mktp, nome_mktp
        FROM {TBL_MKTP}
        ORDER BY id_mktp ASC
    """

    try:
        rows = _pg_select_all_with_retry(pool, sql, None, max_retries=10)
        return jsonify(ok=True, items=rows), 200

    except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
        err_id = uuid.uuid4().hex[:10]
        current_app.logger.exception(f"[{err_id}] Postgres desconectou em /api/despacho/marketplaces após 10 tentativas")
        return jsonify(
            ok=False,
            error="Falha ao consultar o banco. Contate um administrador.",
            error_id=err_id
        ), 503

@bp_despacho.route('/api/despacho/empresas', methods=['GET'])
def api_despacho_empresas():
    """
    GET /api/despacho/empresas
    Lê de: agendamentosweb.empresas_agend
    Ignora: id_emp = 0 ("Nenhuma")
    Retorna: { ok: true, items: [{id_emp, nome_emp}, ...] }
    """
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    pool = current_app.config.get("PG_POOL")
    if not pool:
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 503

    sql = f"""
        SELECT id_emp, nome_emp
        FROM {TBL_EMP}
        WHERE id_emp <> 0
        ORDER BY id_emp ASC
    """

    try:
        rows = _pg_select_all_with_retry(pool, sql, None, max_retries=10)
        return jsonify(ok=True, items=rows), 200

    except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
        err_id = uuid.uuid4().hex[:10]
        current_app.logger.exception(f"[{err_id}] Postgres desconectou em /api/despacho/empresas após 10 tentativas")
        return jsonify(
            ok=False,
            error="Falha ao consultar o banco. Contate um administrador.",
            error_id=err_id
        ), 503

@bp_despacho.route('/api/despacho/crossdocking/consultar', methods=['POST'])
def api_despacho_crossdocking_consultar():
    """
    POST /api/despacho/crossdocking/consultar
    Payload (todos opcionais):
      {
        "q": "texto livre (44 dígitos => chave | numérico => numero_nota)",
        "id_mktp": 123,
        "chave_acesso_nfe": "44 dígitos (aceita com máscara)",
        "numero_nota": 123456,
        "data_de": "YYYY-MM-DD",
        "data_ate": "YYYY-MM-DD",
        "hora_de": "HH:MM" | "HH:MM:SS",
        "hora_ate": "HH:MM" | "HH:MM:SS",
        "limit": 200
      }

    Observação:
      - numero_nota é opcional no banco: quando filtrar por numero_nota, ignora registros NULL.
    """
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    data = request.get_json(silent=True) or {}

    q = str(data.get("q") or "").strip()
    id_mktp_raw = data.get("id_mktp", None)
    id_emp_raw  = data.get("id_emp", None)
    chave_raw = str(data.get("chave_acesso_nfe") or "").strip()
    numero_raw = data.get("numero_nota", None)

    data_de = str(data.get("data_de") or "").strip()
    data_ate = str(data.get("data_ate") or "").strip()
    hora_de = str(data.get("hora_de") or "").strip()
    hora_ate = str(data.get("hora_ate") or "").strip()

    # limit
    try:
        limit = int(data.get("limit") or 200)
        if limit < 1:
            limit = 1
        if limit > 500:
            limit = 500
    except Exception:
        limit = 200

    # normaliza chave
    chave_digits = _digits(chave_raw)
    if chave_digits and len(chave_digits) != 44:
        return jsonify(ok=False, error='Filtro "chave_acesso_nfe" inválido (precisa ter 44 dígitos)'), 400

    # normaliza id_mktp (opcional)
    id_mktp = None
    if id_mktp_raw not in (None, "", "null"):
        try:
            id_mktp = int(id_mktp_raw)
            if id_mktp <= 0:
                raise ValueError()
        except Exception:
            return jsonify(ok=False, error='Filtro "id_mktp" deve ser inteiro positivo'), 400

    # normaliza id_emp (opcional)
    id_emp = None
    if id_emp_raw not in (None, "", "null"):
        try:
            id_emp = int(id_emp_raw)
            if id_emp <= 0:
                raise ValueError()
        except Exception:
            return jsonify(ok=False, error='Filtro "id_emp" deve ser inteiro positivo'), 400

    # normaliza numero_nota (opcional)
    numero_nota = None
    if numero_raw not in (None, "", "null"):
        try:
            numero_nota = int(str(numero_raw).strip())
            if numero_nota < 0:
                raise ValueError()
        except Exception:
            return jsonify(ok=False, error='Filtro "numero_nota" deve ser numérico'), 400

    # interpreta q
    q_digits = _digits(q)
    q_chave = None
    q_numero = None
    if q_digits:
        if len(q_digits) == 44:
            q_chave = q_digits
        else:
            # se for algo numérico (e não for 44), tenta como número de nota
            try:
                q_numero = int(q_digits)
            except Exception:
                q_numero = None

    # valida data/hora por regex simples (deixa o Postgres converter)
    def _valid_date(s: str) -> bool:
        return bool(re.match(r"^\d{4}-\d{2}-\d{2}$", s))

    def _valid_time(s: str) -> bool:
        return bool(re.match(r"^\d{2}:\d{2}(:\d{2})?$", s))

    if data_de and not _valid_date(data_de):
        return jsonify(ok=False, error='Filtro "data_de" inválido (use YYYY-MM-DD)'), 400
    if data_ate and not _valid_date(data_ate):
        return jsonify(ok=False, error='Filtro "data_ate" inválido (use YYYY-MM-DD)'), 400
    if hora_de and not _valid_time(hora_de):
        return jsonify(ok=False, error='Filtro "hora_de" inválido (use HH:MM ou HH:MM:SS)'), 400
    if hora_ate and not _valid_time(hora_ate):
        return jsonify(ok=False, error='Filtro "hora_ate" inválido (use HH:MM ou HH:MM:SS)'), 400

    where = []
    params = []

    # sempre filtra pelo ambiente (produção vs sandbox)
    where.append("d.sandbox = %s")
    params.append(get_sandbox())

    # marketplace
    if id_mktp is not None:
        where.append("d.id_mktp = %s")
        params.append(id_mktp)

    # empresa
    if id_emp is not None:
        where.append("d.id_emp = %s")
        params.append(id_emp)

    # chave
    if chave_digits:
        where.append("d.chave_acesso_nfe = %s")
        params.append(chave_digits)

    # numero_nota (ignora NULL)
    if numero_nota is not None:
        where.append("(d.numero_nota IS NOT NULL AND d.numero_nota = %s)")
        params.append(numero_nota)

    # q
    if q_chave:
        where.append("d.chave_acesso_nfe = %s")
        params.append(q_chave)
    elif q_numero is not None:
        where.append("(d.numero_nota IS NOT NULL AND d.numero_nota = %s)")
        params.append(q_numero)

    # datas
    if data_de:
        where.append("d.data_despacho >= %s::date")
        params.append(data_de)
    if data_ate:
        where.append("d.data_despacho <= %s::date")
        params.append(data_ate)

    # horas
    if hora_de:
        where.append("d.hora_despacho >= %s::time")
        params.append(hora_de)
    if hora_ate:
        where.append("d.hora_despacho <= %s::time")
        params.append(hora_ate)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    pool = current_app.config.get("PG_POOL")
    if not pool:
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 503

    sql = f"""
        SELECT
            d.id,
            COALESCE(m.nome_mktp, '-') AS marketplace,
            COALESCE(e.nome_emp, '-')  AS empresa,
            d.chave_acesso_nfe,
            d.numero_nota,
            d.data_despacho,
            d.hora_despacho
        FROM {TBL_DESPACHO} d
        LEFT JOIN {TBL_MKTP} m
               ON m.id_mktp = d.id_mktp
        LEFT JOIN {TBL_EMP} e
               ON e.id_emp = d.id_emp
        {where_sql}
        ORDER BY
            d.data_despacho DESC NULLS LAST,
            d.hora_despacho DESC NULLS LAST,
            d.id DESC
        LIMIT {limit}
    """

    try:
        rows = _pg_select_all_with_retry(pool, sql, tuple(params), max_retries=PG_MAX_RETRIES)
        rows = [_iso_row(r) for r in rows]
        return jsonify(ok=True, count=len(rows), items=rows), 200

    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        err_id = uuid.uuid4().hex[:10]
        current_app.logger.exception(f"[{err_id}] Postgres desconectou em /api/despacho/crossdocking/consultar após {PG_MAX_RETRIES} tentativas")
        return jsonify(
            ok=False,
            error="Falha ao consultar o banco. Contate um administrador.",
            error_id=err_id
        ), 503

@bp_despacho.route('/despacho')
def despacho_crossdocking():
    return render_template("despacho.html")

@bp_despacho.route('/despacho/consultar')
def despacho_consultar():
    return render_template("despacho_consultar.html")
