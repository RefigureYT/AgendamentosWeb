from flask import Blueprint, jsonify, request, render_template, current_app, session
from psycopg2.extras import RealDictCursor
import re

bp_despacho = Blueprint('despacho', __name__)

def get_sandbox() -> bool:
    # debug=True => sandbox (testes) | debug=False => produção
    return bool(current_app.debug)

SCHEMA = "agendamentosweb"
TBL_DESPACHO = f"{SCHEMA}.despacho_crossdocking"
TBL_MKTP = f"{SCHEMA}.marketplace_agend"


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
    JSON esperado:
      {
        "id_mktp": <int>,
        "chave_acesso_nfe": "44_digitos"
      }

    Insere em: agendamentosweb.despacho_crossdocking
      - id (auto)
      - id_mktp (obrigatório)
      - chave_acesso_nfe (obrigatório)
      - numero_nota (auto pelo banco)
      - data_despacho (auto pelo banco)
      - hora_despacho (auto pelo banco)
    """
    if 'id_usuario' not in session:
        return jsonify(ok=False, error='Não autenticado'), 401

    data = request.get_json(silent=True) or {}

    # valida id_mktp (qualquer int positivo)
    try:
        id_mktp = int(data.get("id_mktp"))
        if id_mktp <= 0:
            raise ValueError("id_mktp precisa ser positivo")
    except Exception:
        return jsonify(ok=False, error='Parâmetro "id_mktp" é obrigatório e deve ser inteiro positivo'), 400

    # valida chave 44 dígitos
    chave_digits = _digits((data.get("chave_acesso_nfe") or "").strip())
    if len(chave_digits) != 44:
        return jsonify(ok=False, error='Parâmetro "chave_acesso_nfe" inválido (precisa ter 44 dígitos)'), 400

    pool = current_app.config.get("PG_POOL")
    if not pool:
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 500

    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            try:
                sandbox = get_sandbox()

                cur.execute(
                    f"""
                    INSERT INTO {TBL_DESPACHO}
                        (id_mktp, chave_acesso_nfe, sandbox)
                    VALUES
                        (%s, %s, %s)
                    RETURNING
                        id, id_mktp, chave_acesso_nfe, numero_nota, data_despacho, hora_despacho, sandbox
                    """,
                    (id_mktp, chave_digits, sandbox)
                )
                row = cur.fetchone()
                conn.commit()

                return jsonify(ok=True, row=_iso_row(row)), 200

            except Exception as e:
                conn.rollback()

                # Duplicidade (unique) no Postgres
                if getattr(e, "pgcode", None) == "23505":
                    return jsonify(ok=False, error="NF-e já cadastrada no banco"), 409

                current_app.logger.exception("Falha ao inserir em agendamentosweb.despacho_crossdocking")
                return jsonify(ok=False, error=str(e)), 500
    finally:
        pool.putconn(conn)


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
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 500

    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT id_mktp, nome_mktp
                FROM {TBL_MKTP}
                ORDER BY id_mktp ASC
                """
            )
            rows = cur.fetchall() or []
            return jsonify(ok=True, items=rows), 200
    finally:
        pool.putconn(conn)


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
        return jsonify(ok=False, error="PG_POOL não configurado no main.py"), 500

    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT
                    d.id,
                    d.id_mktp,
                    m.nome_mktp,
                    d.chave_acesso_nfe,
                    d.numero_nota,
                    d.data_despacho,
                    d.hora_despacho
                FROM {TBL_DESPACHO} d
                LEFT JOIN {TBL_MKTP} m
                       ON m.id_mktp = d.id_mktp
                {where_sql}
                ORDER BY
                    d.data_despacho DESC NULLS LAST,
                    d.hora_despacho DESC NULLS LAST,
                    d.id DESC
                LIMIT {limit}
                """,
                tuple(params)
            )
            rows = cur.fetchall() or []
            rows = [_iso_row(r) for r in rows]
            return jsonify(ok=True, count=len(rows), items=rows), 200
    finally:
        pool.putconn(conn)


@bp_despacho.route('/despacho')
def despacho_crossdocking():
    return render_template("despacho.html")


@bp_despacho.route('/despacho/consultar')
def despacho_consultar():
    return render_template("despacho_consultar.html")
