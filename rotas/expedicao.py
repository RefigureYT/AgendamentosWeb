from flask import jsonify, redirect, url_for, json, request
from main import app, render_template, agendamento_controller, db_controller, ParametroInvalido, access
from datetime import datetime
import mysql.connector
from classes.controllers.AgendamentoController import AgendamentoController
from classes.controllers.DatabaseController import DatabaseController

_db_config = {
    'host': '192.168.15.200',
    'port': 3306,
    'user': 'Bruno_Lallo',
    'password': 'ji}dx(v{M,z2j+f>[/}%_Vr-0?nI}W*@Dw68NnHJ+tMu&ZkF',
    'database': 'jp_bd',
    'autocommit': True
}

@app.route('/expedicao/<int:id_agend_bd>')
def expedicao(id_agend_bd: int):
    if not id_agend_bd:
        raise ParametroInvalido()

    agendamento_controller.clear_agendamentos()
    agendamento_controller.insert_agendamento(id_bd=id_agend_bd)
    agendamento_obj = agendamento_controller.get_last_made_agendamento()
    agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)

    if not agendamento_obj or not agendamento_obj.id_agend_ml:
        return "Erro: Agendamento não encontrado no banco de dados.", 404

    caixas_data = db_controller.get_caixas_by_agendamento_ml(agendamento_obj.id_agend_ml)
    produtos_para_json = [p.to_dict() for p in agendamento_obj.produtos]

    # --- NOVA LÓGICA APLICADA AQUI ---
    for caixa in caixas_data:
        # Cria o identificador único no formato "agendamento/caixa"
        caixa['codigo_unico'] = f"{agendamento_obj.id_agend_ml}/{caixa['caixa_num']}"
        # Calcula o total de unidades
        caixa['total_unidades'] = sum(item.get('quantidade', 0) for item in caixa.get('itens', []))
    # --- FIM DA NOVA LÓGICA ---

    return render_template(
        "expedicao.html", 
        dados_agend=agendamento_obj,
        caixas=caixas_data, # Agora cada caixa tem a chave 'codigo_unico'
        todos_os_produtos_json=json.dumps(produtos_para_json)
    )
    
@app.route('/api/expedicao/bipar', methods=['POST'])
def api_expedicao_bipar():
    """ Salva o registro de uma caixa bipada no banco de dados. """
    data = request.get_json()
    id_agend_ml = data.get('id_agend_ml')
    codigo_unico_caixa = data.get('codigo_unico_caixa')
    print(f"[API /bipar] Recebido: agendamento={id_agend_ml}, caixa={codigo_unico_caixa}")

    if not id_agend_ml or not codigo_unico_caixa:
        return jsonify({"success": False, "message": "Dados incompletos."}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**_db_config)
        cur = conn.cursor()
        sql = "INSERT IGNORE INTO expedicao_caixas_bipadas (id_agend_ml, codigo_unico_caixa) VALUES (%s, %s)"
        cur.execute(sql, (id_agend_ml, codigo_unico_caixa))
        conn.commit()
        cur.close()
        return jsonify({"success": True}), 201
    except Exception as e:
        print(f"!!! Erro ao salvar bipagem da expedição: {e}")
        return jsonify({"success": False, "message": "Erro interno do servidor."}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()

@app.route('/api/expedicao/bipados/<id_agend_ml>')
def api_expedicao_bipados(id_agend_ml):
    """ Retorna a lista de caixas já bipadas para um agendamento. """
    print(f"[API /bipados] Consultando para agendamento: {id_agend_ml}")
    
    conn = None
    try:
        conn = mysql.connector.connect(**_db_config)
        cur = conn.cursor()
        sql = "SELECT codigo_unico_caixa FROM expedicao_caixas_bipadas WHERE id_agend_ml = %s"
        cur.execute(sql, (id_agend_ml,))
        results = cur.fetchall()
        bipados = [row[0] for row in results] if results else []
        cur.close()
        print(f"[API /bipados] Encontrados: {bipados}")
        return jsonify({"success": True, "bipados": bipados})
    except Exception as e:
        print(f"!!! Erro ao buscar bipados da expedição: {e}")
        return jsonify({"success": False, "message": "Erro interno do servidor."}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()

@app.route("/api/expedicao/iniciar", methods=["POST"])
def api_expedicao_iniciar():
    data = request.get_json() or {}
    id_agend_bd = int(data.get("id_agend_bd") or 0)
    if not id_agend_bd:
        return jsonify(success=False, error="id_agend_bd ausente"), 400
    try:
        # INJEÇÃO DO ACCESS AQUI ⤵
        ctrl = AgendamentoController(db_controller=DatabaseController(access_obj=access))
        ts = ctrl.iniciar_expedicao(id_agend_bd)
        return jsonify(success=True, startTime=ts.isoformat())
    except Exception as e:
        # Deixa o front ver uma mensagem clara
        return jsonify(success=False, error=str(e)), 500


@app.route("/api/expedicao/finalizar", methods=["POST"])
def api_expedicao_finalizar():
    data = request.get_json() or {}
    id_agend_bd = int(data.get("id_agend_bd") or 0)
    if not id_agend_bd:
        return jsonify(success=False, error="id_agend_bd ausente"), 400
    try:
        # INJEÇÃO DO ACCESS AQUI ⤵
        ctrl = AgendamentoController(db_controller=DatabaseController(access_obj=access))
        ts = ctrl.finalizar_expedicao(id_agend_bd)
        return jsonify(success=True, endTime=ts.isoformat())
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500
