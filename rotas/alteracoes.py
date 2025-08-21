from main import (
    app, 
    render_template, 
    request, 
    redirect,
    url_for,
    jsonify,
    agendamento_controller, 
    caller, 
    ParametroInvalido, 
    MetodoInvalido, 
    LimiteRequests)
import time

""" Leva para as páginas 'alteracoes' e 'compras' """
@app.route("/alteracoes/<acao>", methods=["GET", "POST"])
def alteracoes(acao):
    if acao == "alterar":
        if request.method == "POST":
            agendamento_controller.clear_agendamentos()

            agendamento_controller.insert_agendamento(request.json["id_agend"])
            agendamento_obj = agendamento_controller.get_last_made_agendamento()
            agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)
            # agendamento_controller.view.display_all_in_agend(agendamento_obj)

            produto_obj = agendamento_controller.search_produto(
                agendamento_obj, "id_bd", str(request.json["id_prod"])
            )

            agendamento_controller.insert_composicao_alteracao_in_bd(
                produto_obj, request.json["itens"]
            )

            return "Dados para serem alterados foram inseridos no banco de dados!"
        elif request.method == "GET":
            agendamento_controller.clear_agendamentos()
            agendamento_controller.create_agendamento_for_alteracao()
            joined_agend = agendamento_controller.create_joined_agendamento()

            return render_template(
                "alteracoes.html",
                dados=agendamento_controller.return_joined_composicoes_from_joined_agend(
                    joined_agend
                )
            )
        else:
            raise MetodoInvalido()
    elif acao == "comprar":
        if request.method == "POST":
            agendamento_controller.clear_agendamentos()

            agendamento_controller.insert_agendamento(request.json["id_agend"])
            agendamento_obj = agendamento_controller.get_last_made_agendamento()
            agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)
            # agendamento_controller.view.display_all_in_agend(agendamento_obj)

            produto_obj = agendamento_controller.search_produto(
                agendamento_obj, "id_bd", str(request.json["id_prod"])
            )

            agendamento_controller.insert_composicao_compras_in_bd(
                produto_obj, request.json["itens"]
            )

            return "Dados para serem comprados foram inseridos no banco de dados!"
        else:
            agendamento_controller.clear_agendamentos()

            return render_template(
                "compras.html",
                dados=agendamento_controller.get_compras_data()
            )
    else:
        raise ParametroInvalido()


@app.route("/dados-compra-tiny/<id_tiny>")
async def teste(id_tiny):
    
    try:
        resp = caller.make_call(f"produtos/{id_tiny}")
        time.sleep(5)
    except BaseException:
        raise LimiteRequests()
    return resp

@app.route("/dados-estoque/<id_tiny>")
async def dados_estoque(id_tiny):
    try:
        resp = caller.make_call(f"estoque/{id_tiny}")
        time.sleep(5)
        if isinstance(resp, dict) and "status" in resp and resp["status"] >= 400:
            # Se caller.make_call retorna um dicionário com um status de erro
            return jsonify(resp), resp["status"]
        return jsonify(resp)
    except LimiteRequests:
        raise LimiteRequests()
    except Exception as e:
        print(f"Erro inesperado ao chamar a API externa: {e}")
        return jsonify({"error": "Erro interno ao processar a requisição"}), 500

@app.route('/remover-compra/<id>/<quant>')
async def remover(id, quant):
    agendamento_controller.update_quant_compra(id, quant)
    return render_template(
                "compras.html",
                dados=agendamento_controller.get_compras_data()
            )