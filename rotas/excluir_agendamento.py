from main import app, jsonify, agendamento_controller

@app.route('/agendamento/excluir/<int:id_agendamento>', methods=['DELETE'])
def excluir_agendamento_route(id_agendamento):
    """
    Rota para lidar com requisições de exclusão de agendamentos.
    """
    if not id_agendamento:
        return jsonify({"success": False, "message": "ID do agendamento não fornecido."}), 400

    sucesso = agendamento_controller.excluir_agendamento_completo(id_agendamento)

    if sucesso:
        return jsonify({"success": True, "message": "Agendamento excluído com sucesso."})
    else:
        return jsonify({"success": False, "message": "Erro ao excluir o agendamento."}), 500