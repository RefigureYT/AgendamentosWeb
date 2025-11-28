from flask import Blueprint, render_template, request, jsonify, json, current_app
from base_jp_lab import Caller
from classes.models.DatabaseModel import Database
from classes.controllers.DatabaseController import DatabaseController
from classes.controllers.AgendamentoController import AgendamentoController
from datetime import datetime
import mysql.connector
from mysql.connector import errorcode

bp_embalar = Blueprint("embalar", __name__, template_folder="templates")

# Configuração de acesso ao MySQL
_db_config = {
    'host': '192.168.15.200',
    'port': 3306,
    'user': 'Bruno_Lallo',
    'password': 'ji}dx(v{M,z2j+f>[/}%_Vr-0?nI}W*@Dw68NnHJ+tMu&ZkF',
    'database': 'jp_bd',
    'autocommit': True
}

@bp_embalar.route("/api/embalar/buscar_anuncios", methods=["GET"])
def buscar_anuncios():
    ag_ctrl = current_app.config['AG_CTRL']
    caller  = current_app.config['CALLER']

    id_agendamento = request.args.get("id_agendamento")
    if not id_agendamento:
        return jsonify({"error": "ID do agendamento não fornecido."}), 400

    try:
        # monta objeto Agendamento usando o controller compartilhado
        ag = ag_ctrl.create_agendamento_from_bd_data(id_agendamento)
        if not ag:
            return jsonify({"error": "Agendamento não encontrado."}), 404

        anuncios = []
        for produto in ag.produtos:
            pd = produto.to_dict()

            # imagem do Tiny
            try:
                detalhes = caller.make_call(f"produtos/{produto.id_tiny}")
                anexos = detalhes.get("anexos", [])
                pd["imagemUrl"] = anexos[0].get("url", "") if anexos else ""
            except Exception:
                pd["imagemUrl"] = ""

            # composição do kit
            try:
                kits_resp = caller.make_call(f"produtos/{produto.id_tiny}/kits")
                kits = kits_resp.get("kits", [])
                pd["composicoes"] = [{
                    "nome":            kit.get("nome"),
                    "sku":             kit.get("sku"),
                    "unidades_totais": kit.get("quantidade", 0),
                    "estoque_error_flag": "red" if kit.get("quantidade", 0) > kit.get("estoque_tiny", 0) else "green"
                } for kit in kits]
            except Exception:
                pd["composicoes"] = [c.to_dict() for c in produto.composicoes]

            anuncios.append(pd)

        return jsonify({"success": True, "anuncios": anuncios})

    except Exception as e:
        print(f"Erro ao buscar anúncios: {e}")
        return jsonify({"error": "Erro interno do servidor ao buscar anúncios."}), 500

@bp_embalar.route("/api/embalar/bipar", methods=["POST"])
def bipar_embalagem():
    data = request.get_json() or {}
    id_agend = data.get("id_agend_ml")
    id_prod_ml = data.get("id_prod_ml")
    if not id_agend or not id_prod_ml: # E verificamos a nova variável
        return jsonify(error="Parâmetros 'id_agend_ml' e 'id_prod_ml' são obrigatórios."), 400

    insert_sql = """
        INSERT INTO embalagem_bipados (id_agend_ml, id_prod_ml, bipados)
        VALUES (%s, %s, 1)
        ON DUPLICATE KEY UPDATE bipados = bipados + 1
    """
    select_sql = """
        SELECT bipados FROM embalagem_bipados WHERE id_agend_ml = %s AND id_prod_ml = %s
    """

    try:
        conn = mysql.connector.connect(**_db_config)
        cur = conn.cursor()
        cur.execute(insert_sql, (id_agend, id_prod_ml))
        cur.execute(select_sql, (id_agend, id_prod_ml))
        row = cur.fetchone()
        novo_total = row[0] if row else 0
        cur.close()
        conn.close()
        return jsonify(id_prod_ml=id_prod_ml, bipados=novo_total)
    except Exception as e:
        print(f"Erro em bipar_embalagem: {e}")
        return jsonify(error=str(e)), 500

@bp_embalar.route('/api/embalar/bipados/<id_agend_ml>')
def api_embalar_bipados(id_agend_ml):
    select_sql = """
        SELECT id_prod_ml, bipados
        FROM embalagem_bipados
        WHERE id_agend_ml = %s
    """
    try:
        conn = mysql.connector.connect(**_db_config)
        cur = conn.cursor()
        cur.execute(select_sql, (id_agend_ml,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([{'id_prod_ml': r[0], 'bipados': r[1]} for r in rows])
    except Exception as e:
        print(f"Erro em api_embalar_bipados: {e}")
        return jsonify(error=str(e)), 500
    
def _resolve_tabelas_embalagem(tipo):
    """
    Decide se usa as tabelas de CAIXA ou de PALLET.

    tipo:
      - 0, None, "", "0"            => caixas (padrão)
      - 1, "1", "pallet", "pallets" => pallets

    Retorna (tabela_principal, tabela_itens, label).
    """
    is_pallet = False
    if isinstance(tipo, str):
        t = tipo.strip().lower()
        if t in ("1", "pallet", "pallets"):
            is_pallet = True
    elif tipo == 1:
        is_pallet = True

    if is_pallet:
        return "embalagem_pallets", "embalagem_pallet_itens", "pallet"
    else:
        return "embalagem_caixas", "embalagem_caixa_itens", "caixa"


# cria uma nova caixa/pallet
@bp_embalar.route("/api/embalar/caixa", methods=["POST"])
def criar_caixa():
    data = request.get_json() or {}
    id_agend = str(data.get("id_agend_ml") or "").strip()
    tipo = data.get("type")
    tabela_embalagem, _, label = _resolve_tabelas_embalagem(tipo)

    if not id_agend:
        return jsonify(error="id_agend_ml obrigatório"), 400

    conn = mysql.connector.connect(**_db_config)
    try:
        conn.start_transaction()
        cur = conn.cursor()

        cur.execute(
            f"""
            SELECT COALESCE(MAX(caixa_num), 0)
            FROM {tabela_embalagem}
            WHERE id_agend_ml=%s
            FOR UPDATE
            """,
            (id_agend,),
        )
        prox = (cur.fetchone()[0] or 0) + 1

        codigo = f"{id_agend}-{prox}"
        cur.execute(
            f"""
            INSERT INTO {tabela_embalagem}
                (id_agend_ml, caixa_num, codigo_unico_caixa, inicio_embalagem)
            VALUES (%s, %s, %s, NOW())
            """,
            (id_agend, prox, codigo),
        )
        conn.commit()
        return jsonify(caixa_num=prox, codigo_unico_caixa=codigo, tipo=label), 201

    except mysql.connector.Error as e:
        conn.rollback()
        if getattr(e, "errno", None) == errorcode.ER_DUP_ENTRY:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT caixa_num, codigo_unico_caixa
                FROM {tabela_embalagem}
                WHERE id_agend_ml=%s
                ORDER BY caixa_num DESC LIMIT 1
                """,
                (id_agend,),
            )
            row = cur.fetchone()
            if row:
                return jsonify(caixa_num=row[0], codigo_unico_caixa=row[1], tipo=label), 200
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()
        

@bp_embalar.route("/api/embalar/scan", methods=["POST"])
def scan_atomico():
    data = request.get_json() or {}
    id_agend = str(data.get("id_agend_ml") or "").strip()
    id_prod_ml = str(data.get("id_prod_ml") or "").strip()  # etiqueta
    sku = str(data.get("sku") or "").strip()                # o que vai gravar na caixa/pallet
    codigo = (data.get("codigo_unico_caixa") or "").strip()
    cx_num = data.get("caixa_num")
    tipo = data.get("type")
    tabela_embalagem, tabela_itens, label = _resolve_tabelas_embalagem(tipo)

    if not id_agend or not id_prod_ml or not sku or (not codigo and cx_num is None):
        return jsonify(
            ok=False,
            error="Informe id_agend_ml, id_prod_ml, sku e caixa/pallet (codigo_unico_caixa OU caixa_num).",
        ), 400

    conn = mysql.connector.connect(**_db_config)
    try:
        conn.start_transaction()
        cur = conn.cursor()

        if codigo and cx_num is None:
            cur.execute(
                f"""
                SELECT caixa_num FROM {tabela_embalagem}
                WHERE id_agend_ml=%s AND codigo_unico_caixa=%s
                FOR UPDATE
                """,
                (id_agend, codigo),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback()
                return jsonify(ok=False, error=f"{label.capitalize()} não encontrada (codigo_unico_caixa)."), 404
            cx_num = int(row[0])
        else:
            cur.execute(
                f"""
                SELECT 1 FROM {tabela_embalagem}
                WHERE id_agend_ml=%s AND caixa_num=%s
                FOR UPDATE
                """,
                (id_agend, cx_num),
            )
            if not cur.fetchone():
                conn.rollback()
                return jsonify(ok=False, error=f"{label.capitalize()} não encontrada (caixa_num)."), 404

        # bipagem sempre na mesma tabela
        cur.execute(
            """
            INSERT INTO embalagem_bipados (id_agend_ml, id_prod_ml, bipados)
            VALUES (%s, %s, 1)
            ON DUPLICATE KEY UPDATE bipados = bipados + 1
            """,
            (id_agend, id_prod_ml),
        )

        # itens na tabela dinâmica (caixas ou pallets)
        cur.execute(
            f"""
            INSERT INTO {tabela_itens} (id_agend_ml, caixa_num, sku, quantidade)
            VALUES (%s, %s, %s, 1)
            ON DUPLICATE KEY UPDATE quantidade = quantidade + 1
            """,
            (id_agend, cx_num, sku),
        )

        cur.execute(
            """
            SELECT bipados FROM embalagem_bipados
            WHERE id_agend_ml=%s AND id_prod_ml=%s
            """,
            (id_agend, id_prod_ml),
        )
        bipados_atual = int((cur.fetchone() or [0])[0])

        cur.execute(
            f"""
            SELECT quantidade FROM {tabela_itens}
            WHERE id_agend_ml=%s AND caixa_num=%s AND sku=%s
            """,
            (id_agend, cx_num, sku),
        )
        qtd_na_caixa = int((cur.fetchone() or [0])[0])

        conn.commit()
        return jsonify(
            ok=True,
            id_agend_ml=id_agend,
            id_prod_ml=id_prod_ml,
            caixa_num=cx_num,
            sku=sku,
            bipados=bipados_atual,
            quantidade_caixa=qtd_na_caixa,
            tipo=label,
        )
    except Exception as e:
        conn.rollback()
        return jsonify(ok=False, error=str(e)), 500
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


@bp_embalar.route("/api/embalar/caixa/item", methods=["POST"])
def adicionar_item_caixa():
    data = request.get_json() or {}
    id_agend = data.get("id_agend_ml")
    caixa_num = data.get("caixa_num")
    sku = data.get("sku")
    tipo = data.get("type")
    _, tabela_itens, label = _resolve_tabelas_embalagem(tipo)

    if not all([id_agend, caixa_num, sku]):
        return jsonify(error="Parâmetros inválidos"), 400

    conn = mysql.connector.connect(**_db_config)
    cur  = conn.cursor()
    # tenta inserir, ou incrementa se já existir
    cur.execute(
        f"""
        INSERT INTO {tabela_itens} (id_agend_ml, caixa_num, sku, quantidade)
        VALUES (%s,%s,%s,1)
        ON DUPLICATE KEY UPDATE quantidade = quantidade + 1
        """,
        (id_agend, caixa_num, sku),
    )
    conn.commit()
    # lê quantidade atual
    cur.execute(
        f"""
        SELECT quantidade FROM {tabela_itens}
        WHERE id_agend_ml=%s AND caixa_num=%s AND sku=%s
        """,
        (id_agend, caixa_num, sku),
    )
    qtd = cur.fetchone()[0]
    cur.close()
    conn.close()
    return jsonify(caixa_num=caixa_num, sku=sku, quantidade=qtd, tipo=label), 200


@bp_embalar.route("/api/embalar/caixa/<id_agend_ml>", methods=["GET"])
def buscar_caixas(id_agend_ml):
    """
    Retorna TODAS as caixas/pallets de um agendamento, com seus itens.
    """
    tipo = request.args.get("type")
    tabela_embalagem, tabela_itens, label = _resolve_tabelas_embalagem(tipo)

    conn = mysql.connector.connect(**_db_config)
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute(
            f"""
            SELECT caixa_num, codigo_unico_caixa
            FROM {tabela_embalagem}
            WHERE id_agend_ml=%s
            ORDER BY caixa_num
            """,
            (id_agend_ml,),
        )
        caixas_rows = cur.fetchall()
        resultado = []
        for row in caixas_rows:
            num = row["caixa_num"]
            cur.execute(
                f"""
                SELECT sku, quantidade
                FROM {tabela_itens}
                WHERE id_agend_ml=%s AND caixa_num=%s
                """,
                (id_agend_ml, num),
            )
            itens = [
                {"sku": r["sku"], "quantidade": r["quantidade"]}
                for r in cur.fetchall()
            ]
            resultado.append({
                "caixa_num": num,
                "codigo_unico_caixa": row["codigo_unico_caixa"],
                "itens": itens,
                "tipo": label,
            })
        return jsonify(resultado)
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@bp_embalar.route("/api/embalar/caixa/reabrir", methods=["POST"])
def reabrir_caixa():
    """
    Reabre uma caixa/pallet específica de um agendamento.
    """
    data = request.get_json() or {}

    id_agend = str(data.get("id_agend_ml") or "").strip()
    caixa_num = data.get("caixa_num")
    tipo = data.get("type")
    tabela_embalagem, _, label = _resolve_tabelas_embalagem(tipo)

    if not id_agend or caixa_num is None:
        return jsonify(
            ok=False,
            error="Informe 'id_agend_ml' e 'caixa_num'."
        ), 400

    conn = mysql.connector.connect(**_db_config)
    cur = conn.cursor()
    try:
        # Garante que a caixa/pallet existe
        cur.execute(
            f"""
            SELECT 1
            FROM {tabela_embalagem}
            WHERE id_agend_ml = %s AND caixa_num = %s
            """,
            (id_agend, caixa_num),
        )
        row = cur.fetchone()
        if not row:
            return jsonify(
                ok=False,
                error=f"{label.capitalize()} não encontrada para este agendamento."
            ), 404

        # Tenta limpar fim_embalagem, se existir
        try:
            cur.execute(
                f"""
                UPDATE {tabela_embalagem}
                SET fim_embalagem = NULL
                WHERE id_agend_ml = %s AND caixa_num = %s
                """,
                (id_agend, caixa_num),
            )
        except mysql.connector.Error:
            # Se não existir essa coluna, só ignora
            pass

        conn.commit()

        return jsonify(
            ok=True,
            id_agend_ml=id_agend,
            caixa_num=caixa_num,
            message=f"{label.capitalize()} reaberta com sucesso.",
        ), 200

    except Exception as e:
        conn.rollback()
        print("Erro em reabrir_caixa:", e)
        return jsonify(ok=False, error=str(e)), 500
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()
    

@bp_embalar.route("/api/embalar/caixa/<id_agend_ml>/<int:caixa_num>", methods=["GET"])
def buscar_caixa_unica(id_agend_ml, caixa_num):
    """
    Retorna APENAS uma caixa/pallet específica de um agendamento,
    com todos os itens dessa caixa/pallet.
    Usado no modal do lápis.
    """
    tipo = request.args.get("type")
    tabela_embalagem, tabela_itens, label = _resolve_tabelas_embalagem(tipo)

    conn = mysql.connector.connect(**_db_config)
    cur  = conn.cursor(dictionary=True)
    try:
        # Dados da caixa/pallet
        cur.execute(
            f"""
            SELECT caixa_num, codigo_unico_caixa
            FROM {tabela_embalagem}
            WHERE id_agend_ml=%s AND caixa_num=%s
            """,
            (id_agend_ml, caixa_num),
        )
        caixa = cur.fetchone()
        if not caixa:
            return jsonify(ok=False, error=f"{label.capitalize()} não encontrada."), 404

        # Itens
        cur.execute(
            f"""
            SELECT sku, quantidade
            FROM {tabela_itens}
            WHERE id_agend_ml=%s AND caixa_num=%s
            """,
            (id_agend_ml, caixa_num),
        )
        itens = [
            {"sku": r["sku"], "quantidade": r["quantidade"]}
            for r in cur.fetchall()
        ]

        return jsonify({
            "ok": True,
            "caixa_num": caixa["caixa_num"],
            "codigo_unico_caixa": caixa["codigo_unico_caixa"],
            "itens": itens,
            "tipo": label,
        })
    except Exception as e:
        print("Erro em buscar_caixa_unica:", e)
        return jsonify(ok=False, error=str(e)), 500
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@bp_embalar.route("/api/embalar/caixa/editar", methods=["POST"])
def editar_conteudo_caixa():
    """
    Edita o conteúdo de uma caixa/pallet:
      - Recebe as QUANTIDADES FINAIS por SKU
      - Calcula o delta em relação ao que havia
      - Atualiza tabela de itens (caixa ou pallet)
      - Atualiza embalagem_bipados somando/subtraindo o delta
        (mantendo bipados >= 0)
    """
    data = request.get_json() or {}

    id_agend = str(data.get("id_agend_ml") or "").strip()
    caixa_num = data.get("caixa_num")
    codigo = str(data.get("codigo_unico_caixa") or "").strip()
    itens_novos = data.get("itens") or []
    tipo = data.get("type")
    tabela_embalagem, tabela_itens, label = _resolve_tabelas_embalagem(tipo)

    if not id_agend or (caixa_num is None and not codigo):
        return jsonify(
            ok=False,
            error="Informe 'id_agend_ml' e 'caixa_num' ou 'codigo_unico_caixa'."
        ), 400

    # Normaliza itens novos em um dict {sku: quantidade_final}
    novos_map = {}
    for item in itens_novos:
        sku = str((item or {}).get("sku") or "").strip()
        if not sku:
            continue
        try:
            qtd = int((item or {}).get("quantidade") or 0)
        except (ValueError, TypeError):
            qtd = 0
        if qtd < 0:
            qtd = 0
        novos_map[sku] = novos_map.get(sku, 0) + qtd

    conn = mysql.connector.connect(**_db_config)
    cur  = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()

        # 1) Localiza e trava a caixa/pallet
        if codigo and caixa_num is None:
            cur.execute(
                f"""
                SELECT caixa_num, codigo_unico_caixa
                FROM {tabela_embalagem}
                WHERE id_agend_ml=%s AND codigo_unico_caixa=%s
                FOR UPDATE
                """,
                (id_agend, codigo),
            )
        else:
            cur.execute(
                f"""
                SELECT caixa_num, codigo_unico_caixa
                FROM {tabela_embalagem}
                WHERE id_agend_ml=%s AND caixa_num=%s
                FOR UPDATE
                """,
                (id_agend, caixa_num),
            )

        row = cur.fetchone()
        if not row:
            conn.rollback()
            return jsonify(ok=False, error=f"{label.capitalize()} não encontrada para este agendamento."), 404

        cx_num = int(row["caixa_num"])
        codigo = row["codigo_unico_caixa"]

        # 2) Lê itens atuais
        cur.execute(
            f"""
            SELECT sku, quantidade
            FROM {tabela_itens}
            WHERE id_agend_ml=%s AND caixa_num=%s
            FOR UPDATE
            """,
            (id_agend, cx_num),
        )
        atuais_rows = cur.fetchall()

        atuais_map = {}
        for r in atuais_rows:
            atuais_map[str(r["sku"])] = int(r["quantidade"] or 0)

        # 3) Calcula deltas por SKU (novo - atual)
        todos_skus = set(atuais_map.keys()) | set(novos_map.keys())
        deltas = {}
        for sku in todos_skus:
            old_q = atuais_map.get(sku, 0)
            new_q = novos_map.get(sku, 0)
            delta = new_q - old_q
            if delta != 0:
                deltas[sku] = delta

        # 4) Atualiza embalagem_bipados conforme o delta
        for sku, delta in deltas.items():
            if delta > 0:
                # Somar bipados
                cur.execute(
                    """
                    INSERT INTO embalagem_bipados (id_agend_ml, id_prod_ml, bipados)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE bipados = bipados + VALUES(bipados)
                    """,
                    (id_agend, sku, delta),
                )
            else:
                # Subtrair bipados, sem deixar negativo
                cur.execute(
                    """
                    UPDATE embalagem_bipados
                    SET bipados = GREATEST(bipados + %s, 0)
                    WHERE id_agend_ml = %s AND id_prod_ml = %s
                    """,
                    (delta, id_agend, sku),
                )

        # 5) Regrava itens (estado final)
        cur.execute(
            f"""
            DELETE FROM {tabela_itens}
            WHERE id_agend_ml=%s AND caixa_num=%s
            """,
            (id_agend, cx_num),
        )

        for sku, qtd in novos_map.items():
            if qtd <= 0:
                continue
            cur.execute(
                f"""
                INSERT INTO {tabela_itens}
                    (id_agend_ml, caixa_num, sku, quantidade)
                VALUES (%s, %s, %s, %s)
                """,
                (id_agend, cx_num, sku, qtd),
            )

        # 6) Lê bipados atualizados para os SKUs alterados
        bipados_atualizados = []
        if deltas:
            placeholders = ",".join(["%s"] * len(deltas))
            params = [id_agend] + list(deltas.keys())
            cur.execute(
                f"""
                SELECT id_prod_ml, bipados
                FROM embalagem_bipados
                WHERE id_agend_ml = %s
                  AND id_prod_ml IN ({placeholders})
                """,
                params,
            )
            bipados_atualizados = cur.fetchall()

        conn.commit()

        itens_saida = [
            {"sku": sku, "quantidade": qtd}
            for sku, qtd in novos_map.items()
            if qtd > 0
        ]

        return jsonify(
            ok=True,
            id_agend_ml=id_agend,
            caixa_num=cx_num,
            codigo_unico_caixa=codigo,
            itens=itens_saida,
            deltas=deltas,
            bipados_atualizados=bipados_atualizados,
            tipo=label,
        )

    except Exception as e:
        conn.rollback()
        print("Erro em editar_conteudo_caixa:", e)
        return jsonify(ok=False, error=str(e)), 500
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@bp_embalar.route("/api/embalar/caixa/excluir", methods=["POST"])
def excluir_caixa():
    """
    Exclui uma caixa/pallet específica de um agendamento, remove todos os itens
    e devolve as quantidades (decrementando embalagem_bipados).
    """
    data = request.get_json() or {}

    id_agend = str(data.get("id_agend_ml") or "").strip()
    caixa_num = data.get("caixa_num")
    codigo = str(data.get("codigo_unico_caixa") or "").strip()
    tipo = data.get("type")
    tabela_embalagem, tabela_itens, label = _resolve_tabelas_embalagem(tipo)

    if not id_agend or (caixa_num is None and not codigo):
        return jsonify(
            ok=False,
            error="Informe 'id_agend_ml' e 'caixa_num' ou 'codigo_unico_caixa'."
        ), 400

    conn = mysql.connector.connect(**_db_config)
    cur = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()

        # 1) Localiza e trava a caixa/pallet deste agendamento
        if codigo and caixa_num is None:
            cur.execute(
                f"""
                SELECT caixa_num, codigo_unico_caixa
                FROM {tabela_embalagem}
                WHERE id_agend_ml = %s AND codigo_unico_caixa = %s
                FOR UPDATE
                """,
                (id_agend, codigo),
            )
        else:
            cur.execute(
                f"""
                SELECT caixa_num, codigo_unico_caixa
                FROM {tabela_embalagem}
                WHERE id_agend_ml = %s AND caixa_num = %s
                FOR UPDATE
                """,
                (id_agend, caixa_num),
            )

        row = cur.fetchone()
        if not row:
            conn.rollback()
            return jsonify(ok=False, error=f"{label.capitalize()} não encontrada para este agendamento."), 404

        cx_num = int(row["caixa_num"])
        codigo = row["codigo_unico_caixa"]

        # 2) Lê itens (para devolver bipagem)
        cur.execute(
            f"""
            SELECT sku AS id_prod_ml, quantidade
            FROM {tabela_itens}
            WHERE id_agend_ml = %s AND caixa_num = %s
            """,
            (id_agend, cx_num),
        )
        itens_rows = cur.fetchall()

        # Agrupa por id_prod_ml (sku) para evitar UPDATE repetido
        agregados = {}
        for it in itens_rows:
            k = str(it["id_prod_ml"])
            agregados[k] = agregados.get(k, 0) + int(it["quantidade"] or 0)

        # 3) Devolve bipados (GREATEST para nunca ficar negativo)
        bipados_atualizados = []
        for id_prod_ml, qtd in agregados.items():
            cur.execute(
                """
                UPDATE embalagem_bipados
                SET bipados = GREATEST(bipados - %s, 0)
                WHERE id_agend_ml = %s AND id_prod_ml = %s
                """,
                (qtd, id_agend, id_prod_ml),
            )

        if agregados:
            placeholders = ",".join(["%s"] * len(agregados))
            params = [id_agend] + list(agregados.keys())
            cur.execute(
                f"""
                SELECT id_prod_ml, bipados
                FROM embalagem_bipados
                WHERE id_agend_ml = %s
                  AND id_prod_ml IN ({placeholders})
                """,
                params,
            )
            bipados_atualizados = cur.fetchall()

        # 4) Apaga itens
        cur.execute(
            f"""
            DELETE FROM {tabela_itens}
            WHERE id_agend_ml = %s AND caixa_num = %s
            """,
            (id_agend, cx_num),
        )

        # 5) Apaga a própria caixa/pallet
        cur.execute(
            f"""
            DELETE FROM {tabela_embalagem}
            WHERE id_agend_ml = %s AND caixa_num = %s
            """,
            (id_agend, cx_num),
        )

        conn.commit()
        return jsonify(
            ok=True,
            id_agend_ml=id_agend,
            caixa_num=cx_num,
            codigo_unico_caixa=codigo,
            itens_removidos=list(agregados.items()),
            bipados_atualizados=bipados_atualizados,
            tipo=label,
        )

    except Exception as e:
        conn.rollback()
        print("Erro em excluir_caixa:", e)
        return jsonify(ok=False, error=str(e)), 500
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()
