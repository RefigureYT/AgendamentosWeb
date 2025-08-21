from flask import Blueprint, render_template, request, jsonify
from base_jp_lab import Caller
from classes.models.DatabaseModel import Database
from classes.controllers.DatabaseController import DatabaseController
from classes.controllers.AgendamentoController import AgendamentoController
import mysql.connector


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
    id_agendamento = request.args.get("id_agendamento")
    if not id_agendamento:
        return jsonify({"error": "ID do agendamento não fornecido."}), 400

    try:
        # 1) instanciar DB, Caller e controller de agendamento
        db = Database()
        db_ctrl = DatabaseController(db)
        caller = Caller()
        ag_ctrl = AgendamentoController(db_ctrl, caller)

        # 2) monta objeto Agendamento
        ag = ag_ctrl.create_agendamento_from_bd_data(id_agendamento)
        if not ag:
            return jsonify({"error": "Agendamento não encontrado."}), 404

        anuncios = []
        for produto in ag.produtos:
            pd = produto.to_dict()

            # === busca URL da imagem no Tiny ===
            try:
                detalhes = caller.make_call(f"produtos/{produto.id_tiny}")
                anexos = detalhes.get("anexos", [])
                pd["imagemUrl"] = anexos[0].get("url", "") if anexos else ""
            except Exception:
                pd["imagemUrl"] = ""

            # === busca composição real do kit no Tiny ===
            try:
                kits_resp = caller.make_call(f"produtos/{produto.id_tiny}/kits")
                kits = kits_resp.get("kits", [])
                pd["composicoes"] = [{
                    "nome":             kit.get("nome"),
                    "sku":              kit.get("sku"),
                    "unidades_totais":  kit.get("quantidade", 0),
                    # compara quantidade pedida x estoque disponível no Tiny (se houver)
                    "estoque_error_flag": (
                        "red" if kit.get("quantidade", 0) > kit.get("estoque_tiny", 0)
                        else "green"
                    )
                } for kit in kits]
            except Exception:
                # fallback para a composição que você já tinha
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
    id_agend = data.get("id_agend_ml")
    if not id_agend:
        return jsonify(error="id_agend_ml obrigatório"), 400

    # conta quantas caixas já existem pra esse agendamento
    conn = mysql.connector.connect(**_db_config)
    cur  = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM embalagem_caixas WHERE id_agend_ml=%s", (id_agend,))
    num = cur.fetchone()[0] + 1
    cur.execute("INSERT INTO embalagem_caixas (id_agend_ml, caixa_num) VALUES (%s, %s)",
                (id_agend, num))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(caixa_num=num), 201

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
    # primeiro todas as caixas
    cur.execute("SELECT caixa_num FROM embalagem_caixas WHERE id_agend_ml=%s ORDER BY caixa_num", (id_agend_ml,))
    caixas = [r["caixa_num"] for r in cur.fetchall()]
    resultado = []
    for num in caixas:
        cur.execute("""
            SELECT sku, quantidade FROM embalagem_caixa_itens
            WHERE id_agend_ml=%s AND caixa_num=%s
        """, (id_agend_ml, num))
        rows = cur.fetchall()
        itens = [{"sku":   row["sku"],
            "quantidade": row["quantidade"]}
            for row in rows
        ]
        resultado.append({"caixa_num": num, "itens": itens})
    cur.close()
    conn.close()
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
