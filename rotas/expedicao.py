from flask import jsonify, redirect, url_for, json
from main import app, render_template, agendamento_controller, db_controller, ParametroInvalido, access
from datetime import datetime


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
    
@app.route('/expedicao/finalizar/<int:id_agend_bd>', methods=['POST'])
def finalizar_embalagem(id_agend_bd):
    """
    Finaliza a fase de embalagem, gera um relatório e move o agendamento para a expedição.
    """
    try:
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