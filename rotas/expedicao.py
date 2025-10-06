from flask import Blueprint, jsonify, request, render_template, current_app
import json  # (builtin)

bp_expedicao = Blueprint('expedicao', __name__, template_folder='templates')

print("-> Definindo rotas para a Expedição...")

@bp_expedicao.route('/expedicao/<int:id_agend_bd>')
def expedicao(id_agend_bd: int):
    """
    Renderiza a página principal da expedição.
    Carrega o agendamento do BD, monta as caixas com:
      - codigo_unico = "<id_agend_ml>/<caixa_num>"
      - total_unidades somando os itens da caixa
    """
    if not id_agend_bd:
        # Mantém a mesma exceção usada no projeto (vem do main/exceptions)
        raise current_app.view_functions['health_check'].__globals__['ParametroInvalido']() \
            if 'ParametroInvalido' in current_app.view_functions['health_check'].__globals__ else Exception("Parâmetro inválido")

    cfg = current_app.config
    agendamento_controller = cfg['AG_CTRL']
    db_controller = cfg['DB_CTRL']

    # Carrega agendamento completo
    agendamento_controller.clear_agendamentos()
    agendamento_controller.insert_agendamento(id_bd=id_agend_bd)
    agendamento_obj = agendamento_controller.get_last_made_agendamento()
    agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)

    if not agendamento_obj or not getattr(agendamento_obj, 'id_agend_ml', None):
        return "Erro: Agendamento não encontrado no banco de dados.", 404

    # Caixas e produtos
    caixas_data = db_controller.get_caixas_by_agendamento_ml(agendamento_obj.id_agend_ml)
    produtos_para_json = [p.to_dict() for p in agendamento_obj.produtos]

    # Campos derivados úteis no front
    for caixa in caixas_data:
        caixa['codigo_unico'] = f"{agendamento_obj.id_agend_ml}/{caixa['caixa_num']}"
        caixa['total_unidades'] = sum(int(item.get('quantidade', 0)) for item in caixa.get('itens', []))

    return render_template(
        "expedicao.html",
        dados_agend=agendamento_obj,
        caixas=caixas_data,
        todos_os_produtos_json=json.dumps(produtos_para_json, ensure_ascii=False)
    )

@bp_expedicao.route('/api/expedicao/bipar', methods=['POST'])
def api_expedicao_bipar():
    """
    Registra uma caixa bipada (única) na expedição.
    Usa INSERT IGNORE para não duplicar.
    """
    data = request.get_json() or {}
    id_agend_ml = data.get('id_agend_ml')
    codigo_unico_caixa = data.get('codigo_unico_caixa')

    if not id_agend_ml or not codigo_unico_caixa:
        return jsonify({"success": False, "message": "Dados incompletos."}), 400

    access = current_app.config['ACCESS']
    try:
        access.custom_i_u_query(
            "INSERT IGNORE INTO expedicao_caixas_bipadas (id_agend_ml, codigo_unico_caixa) VALUES (%s, %s)",
            [(id_agend_ml, codigo_unico_caixa)]
        )
        return jsonify({"success": True}), 201
    except Exception as e:
        print(f"!!! Erro ao salvar bipagem da expedição: {e}")
        return jsonify({"success": False, "message": "Erro interno do servidor."}), 500

@bp_expedicao.route('/api/expedicao/bipados/<id_agend_ml>')
def api_expedicao_bipados(id_agend_ml):
    """
    Retorna a lista de códigos únicos de caixas já bipadas para um agendamento.
    """
    access = current_app.config['ACCESS']
    try:
        rows = access.custom_select_query(
            "SELECT codigo_unico_caixa FROM expedicao_caixas_bipadas WHERE id_agend_ml = %s",
            (id_agend_ml,)
        ) or []
        bipados = [r[0] for r in rows]
        return jsonify({"success": True, "bipados": bipados})
    except Exception as e:
        print(f"!!! Erro ao buscar bipados da expedição: {e}")
        return jsonify({"success": False, "message": "Erro interno do servidor."}), 500

@bp_expedicao.route('/api/expedicao/iniciar', methods=['POST'])
def iniciar_expedicao():
    """
    Marca o início da expedição no BD e retorna o timestamp em ISO8601.
    Mantém a lógica “antiga” (mais estável) usando o db_controller.
    """
    data = request.get_json() or {}
    id_agend_bd = data.get('id_agend_bd')
    if not id_agend_bd:
        return jsonify({"success": False, "message": "ID do agendamento não fornecido."}), 400

    cfg = current_app.config
    db_controller = cfg['DB_CTRL']

    try:
        db_controller.update_expedicao_inicio(id_agend_bd)
        agendamento = db_controller.get_agendamento_by_bd_id(id_agend_bd)[0]
        # No antigo, o início ficava no índice 8 — mantém compatibilidade
        start_time_iso = agendamento[8].isoformat() if agendamento[8] else None
        return jsonify({"success": True, "startTime": start_time_iso})
    except Exception as e:
        print(f"!!! Erro ao iniciar a expedição: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@bp_expedicao.route('/api/expedicao/finalizar', methods=['POST'])
def finalizar_expedicao():
    """
    Atualiza o status do agendamento para Finalizado e gera o relatório final.
    Fluxo “antigo” + melhoria: carrega o objeto antes de finalizar, finaliza, gera/salva relatório.
    """
    data = request.get_json() or {}
    id_agend_bd = data.get('id_agend_bd')
    if not id_agend_bd:
        return jsonify({"success": False, "message": "ID do agendamento não fornecido."}), 400

    cfg = current_app.config
    agendamento_controller = cfg['AG_CTRL']

    try:
        # 1) carrega o objeto do agendamento
        agendamento_controller.clear_agendamentos()
        agendamento_controller.insert_agendamento(id_bd=id_agend_bd)
        agendamento_obj = agendamento_controller.get_last_made_agendamento()
        agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)

        # 2) finaliza expedição (atualiza tempos/status no BD)
        agendamento_controller.finalizar_expedicao(id_agend_bd)

        # 3) gera e salva relatório final de expedição
        agendamento_controller.gerar_e_salvar_relatorio_expedicao(agendamento_obj)

        return jsonify({"success": True, "message": "Agendamento movido para 'Finalizado'."})
    except Exception as e:
        print(f"!!! Erro ao finalizar a expedição: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
