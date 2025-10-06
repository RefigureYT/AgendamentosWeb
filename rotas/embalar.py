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
    
# cria uma nova caixa
@bp_embalar.route("/api/embalar/caixa", methods=["POST"])
def criar_caixa():
    data = request.get_json() or {}
    id_agend = str(data.get("id_agend_ml") or "").strip()
    if not id_agend:
        return jsonify(error="id_agend_ml obrigatório"), 400

    conn = mysql.connector.connect(**_db_config)
    try:
        conn.start_transaction()
        cur = conn.cursor()

        cur.execute("""
            SELECT COALESCE(MAX(caixa_num), 0)
            FROM embalagem_caixas
            WHERE id_agend_ml=%s
            FOR UPDATE
        """, (id_agend,))
        prox = (cur.fetchone()[0] or 0) + 1

        codigo = f"{id_agend}-{prox}"
        cur.execute("""
            INSERT INTO embalagem_caixas
                (id_agend_ml, caixa_num, codigo_unico_caixa, inicio_embalagem)
            VALUES (%s, %s, %s, NOW())
        """, (id_agend, prox, codigo))
        conn.commit()
        return jsonify(caixa_num=prox, codigo_unico_caixa=codigo), 201

    except mysql.connector.Error as e:
        conn.rollback()
        if getattr(e, "errno", None) == errorcode.ER_DUP_ENTRY:
            cur = conn.cursor()
            cur.execute("""
                SELECT caixa_num, codigo_unico_caixa
                FROM embalagem_caixas
                WHERE id_agend_ml=%s
                ORDER BY caixa_num DESC LIMIT 1
            """, (id_agend,))
            row = cur.fetchone()
            if row:
                return jsonify(caixa_num=row[0], codigo_unico_caixa=row[1]), 200
        raise
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()
        
@bp_embalar.route("/api/embalar/scan", methods=["POST"])
def scan_atomico():
    data = request.get_json() or {}
    id_agend = str(data.get("id_agend_ml") or "").strip()
    id_prod_ml = str(data.get("id_prod_ml") or "").strip()  # etiqueta
    sku = str(data.get("sku") or "").strip()                # o que vai gravar na caixa (pode ser a própria etiqueta)
    codigo = (data.get("codigo_unico_caixa") or "").strip()
    cx_num = data.get("caixa_num")

    if not id_agend or not id_prod_ml or not sku or (not codigo and cx_num is None):
        return jsonify(ok=False, error="Informe id_agend_ml, id_prod_ml, sku e caixa (codigo_unico_caixa OU caixa_num)."), 400

    conn = mysql.connector.connect(**_db_config)
    try:
        conn.start_transaction()
        cur = conn.cursor()

        if codigo and cx_num is None:
            cur.execute("""
                SELECT caixa_num FROM embalagem_caixas
                WHERE id_agend_ml=%s AND codigo_unico_caixa=%s
                FOR UPDATE
            """, (id_agend, codigo))
            row = cur.fetchone()
            if not row:
                conn.rollback()
                return jsonify(ok=False, error="Caixa não encontrada (codigo_unico_caixa)."), 404
            cx_num = int(row[0])
        else:
            cur.execute("""
                SELECT 1 FROM embalagem_caixas
                WHERE id_agend_ml=%s AND caixa_num=%s
                FOR UPDATE
            """, (id_agend, cx_num))
            if not cur.fetchone():
                conn.rollback()
                return jsonify(ok=False, error="Caixa não encontrada (caixa_num)."), 404

        cur.execute("""
            INSERT INTO embalagem_bipados (id_agend_ml, id_prod_ml, bipados)
            VALUES (%s, %s, 1)
            ON DUPLICATE KEY UPDATE bipados = bipados + 1
        """, (id_agend, id_prod_ml))

        cur.execute("""
            INSERT INTO embalagem_caixa_itens (id_agend_ml, caixa_num, sku, quantidade)
            VALUES (%s, %s, %s, 1)
            ON DUPLICATE KEY UPDATE quantidade = quantidade + 1
        """, (id_agend, cx_num, sku))

        cur.execute("""
            SELECT bipados FROM embalagem_bipados
            WHERE id_agend_ml=%s AND id_prod_ml=%s
        """, (id_agend, id_prod_ml))
        bipados_atual = int((cur.fetchone() or [0])[0])

        cur.execute("""
            SELECT quantidade FROM embalagem_caixa_itens
            WHERE id_agend_ml=%s AND caixa_num=%s AND sku=%s
        """, (id_agend, cx_num, sku))
        qtd_na_caixa = int((cur.fetchone() or [0])[0])

        conn.commit()
        return jsonify(ok=True,
                       id_agend_ml=id_agend,
                       id_prod_ml=id_prod_ml,
                       caixa_num=cx_num,
                       sku=sku,
                       bipados=bipados_atual,
                       quantidade_caixa=qtd_na_caixa)
    except Exception as e:
        conn.rollback()
        return jsonify(ok=False, error=str(e)), 500
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

@bp_embalar.route("/api/embalar/caixa/item", methods=["POST"])
def adicionar_item_caixa():
    data = request.get_json() or {}
    id_agend = data.get("id_agend_ml")
    caixa_num = data.get("caixa_num")
    sku = data.get("sku")
    if not all([id_agend, caixa_num, sku]):
        return jsonify(error="Parâmetros inválidos"), 400

    conn = mysql.connector.connect(**_db_config)
    cur  = conn.cursor()
    # tenta inserir, ou incrementa se já existir
    cur.execute("""
        INSERT INTO embalagem_caixa_itens (id_agend_ml, caixa_num, sku, quantidade)
        VALUES (%s,%s,%s,1)
        ON DUPLICATE KEY UPDATE quantidade = quantidade + 1
    """, (id_agend, caixa_num, sku))
    conn.commit()
    # lê quantidade atual
    cur.execute("""
    SELECT quantidade FROM embalagem_caixa_itens
    WHERE id_agend_ml=%s AND caixa_num=%s AND sku=%s
    """, (id_agend, caixa_num, sku))
    qtd = cur.fetchone()[0]
    cur.close()
    conn.close()
    return jsonify(caixa_num=caixa_num, sku=sku, quantidade=qtd), 200

@bp_embalar.route("/api/embalar/caixa/<id_agend_ml>", methods=["GET"])
def buscar_caixas(id_agend_ml):
    conn = mysql.connector.connect(**_db_config)
    cur  = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT caixa_num, codigo_unico_caixa
        FROM embalagem_caixas
        WHERE id_agend_ml=%s
        ORDER BY caixa_num
    """, (id_agend_ml,))
    caixas_rows = cur.fetchall()
    resultado = []
    for row in caixas_rows:
        num = row["caixa_num"]
        cur.execute("""
            SELECT sku, quantidade
            FROM embalagem_caixa_itens
            WHERE id_agend_ml=%s AND caixa_num=%s
        """, (id_agend_ml, num))
        itens = [{"sku": r["sku"], "quantidade": r["quantidade"]} for r in cur.fetchall()]
        resultado.append({
            "caixa_num": num,
            "codigo_unico_caixa": row["codigo_unico_caixa"],
            "itens": itens
        })
    cur.close(); conn.close()
    return jsonify(resultado)

@bp_embalar.route('/api/embalar/iniciar', methods=['POST'])
def iniciar_embalagem():
    """Cria um registro para um produto no início da embalagem com 0 bipados."""
    data = request.get_json() or {}
    id_agend = data.get("id_agend_ml")
    id_prod_ml = data.get("id_prod_ml")

    if not id_agend or not id_prod_ml:
        return jsonify(error="Parâmetros 'id_agend_ml' e 'id_prod_ml' são obrigatórios."), 400

    # Insere com 0 ou atualiza para 0 se já existir por algum motivo
    sql = """
        INSERT INTO embalagem_bipados (id_agend_ml, id_prod_ml, bipados)
        VALUES (%s, %s, 0)
        ON DUPLICATE KEY UPDATE bipados = 0
    """

    try:
        conn = mysql.connector.connect(**_db_config)
        cur = conn.cursor()
        cur.execute(sql, (id_agend, id_prod_ml))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify(success=True, message="Produto iniciado na embalagem.")
    except Exception as e:
        print(f"Erro em iniciar_embalagem: {e}")
        return jsonify(error=str(e)), 500

@bp_embalar.route('/embalar/finalizar/<int:id_agend_bd>', methods=['POST'])
def finalizar_embalagem(id_agend_bd):
    """
    Finaliza a fase de embalagem, gera um relatório e move o agendamento para a expedição.
    """
    try:
        cfg = current_app.config
        agendamento_controller = cfg['AG_CTRL']
        access = cfg['ACCESS']
        
        # 1. Carrega o agendamento completo a partir do banco de dados
        agendamento_controller.clear_agendamentos()
        agendamento_controller.insert_agendamento(id_bd=id_agend_bd)
        agend = agendamento_controller.get_last_made_agendamento()
        agendamento_controller.create_agendamento_from_bd_data(agend)

        if not agend:
            return jsonify({"success": False, "message": "Agendamento não encontrado."}), 404

        # 2. Busca dados das caixas e itens embalados para o relatório
        caixas_result = access.custom_select_query(
            "SELECT caixa_num FROM embalagem_caixas WHERE id_agend_ml = %s ORDER BY caixa_num",
            (agend.id_agend_ml,)
        )
        
        caixas_relatorio = []
        if caixas_result:
            for caixa_row in caixas_result:
                caixa_num = caixa_row[0]
                # Busca os itens na caixa, incluindo o nome do produto
                itens_result = access.custom_select_query(
                    """SELECT i.sku, i.quantidade, p.nome_prod
                    FROM embalagem_caixa_itens i
                    LEFT JOIN produtos_agend p ON i.sku = p.sku_prod AND p.id_agend_prod = %s
                    WHERE i.id_agend_ml = %s AND i.caixa_num = %s
                    """,
                    (agend.id_bd, agend.id_agend_ml, caixa_num)
                )
                itens_caixa = [{"sku": item[0], "quantidade": item[1], "nome": item[2]} for item in itens_result] if itens_result else []
                caixas_relatorio.append({"caixa_numero": caixa_num, "itens": itens_caixa})

        # 3. Monta o payload do relatório de embalagem
        relatorio_payload = {
            "tipo_relatorio": "embalagem",
            "termino_embalagem": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "detalhes_embalagem": {
                "total_caixas": len(caixas_relatorio),
                "caixas": caixas_relatorio
            }
        }

        # 4. Busca o relatório de conferência existente para adicionar as novas informações
        relatorio_final = {}
        relatorio_existente_raw = access.custom_select_query(
            "SELECT relatorio FROM relatorio_agend WHERE id_agend_ml = %s", (agend.id_agend_ml,)
        )
        if relatorio_existente_raw and relatorio_existente_raw[0][0]:
            relatorio_final = json.loads(relatorio_existente_raw[0][0])

        # Adiciona os dados de embalagem ao relatório geral
        relatorio_final['RelatorioEmbalagem'] = relatorio_payload

        # 5. Salva o relatório atualizado no banco
        access.custom_i_u_query(
            """INSERT INTO relatorio_agend (id_agend_ml, relatorio) VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE relatorio = VALUES(relatorio)""",
            [(agend.id_agend_ml, json.dumps(relatorio_final, ensure_ascii=False))]
        )

        # 6. Altera o tipo do agendamento para Expedição (ID 5)
        agend.set_tipo(5)
        agendamento_controller.update_agendamento(agend)

        return jsonify({"success": True, "message": "Embalagem finalizada. Agendamento movido para expedição."})

    except Exception as e:
        print(f"Erro ao finalizar embalagem: {e}")
        return jsonify({"success": False, "message": str(e)}), 500