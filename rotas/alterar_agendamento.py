from main import (
    app,
    render_template,
    request,
    agendamento_controller,
    redirect,
    url_for,
    MetodoInvalido
)

@app.route("/alterar-agendamento", methods=["POST", "GET"])
def alt_agend():
    if request.method == "GET":
        # carregar em memória o agendamento a partir do BD
        agendamento_controller.clear_agendamentos()
        agendamento_controller.insert_agendamento(id_bd=int(request.args["id"]))
        agend_obj = agendamento_controller.get_last_made_agendamento()
        agendamento_controller.create_agendamento_from_bd_data(agend_obj)

        # se for chamada via AJAX (modal), devolve só o partial
        if request.args.get("modal") == "true":
            return render_template(
                "partials/form_editar_agendamento.html",
                dados=agendamento_controller.get_last_made_agendamento()
            )

        # caso contrário, página completa
        return render_template(
            "alterar_agendamento.html",
            dados=agendamento_controller.get_last_made_agendamento()
        )

    elif request.method == "POST":
        try:
            # 1) Pega o ID do agendamento que veio no form
            id_bd = int(request.form["inp_id"])

            # 2) Busca o registro atual no BD para extrair o colaborador
            registro = agendamento_controller.db_controller.get_agendamento_by_bd_id(id_bd)
            colaborador_atual = registro[0][5] if registro and registro[0][5] else ""
            centro_atual = registro[0][6] if registro and registro[0][6] else ""

            # 3) Recria em memória o objeto de agendamento (mantendo colaborador)
            agendamento_controller.clear_agendamentos()
            agendamento_controller.insert_agendamento(
                id_bd,
                request.form["inp_ml"],
                int(request.form["inp_tipo"]),
                int(request.form["inp_emp"]),
                int(request.form["inp_mktp"]),
                colaborador_atual,
                centro_distribuicao=centro_atual
            )

            # 4) Executa o UPDATE no BD
            agendamento_controller.update_agendamento(
                agendamento_controller.get_last_made_agendamento()
            )

            # resposta para AJAX
            if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                return "ok", 200

            # redireciona com flag de sucesso
            return redirect(url_for("agendamentos", acao="ver", alterado="ok"))

        except Exception as e:
            print(f"Erro ao alterar agendamento: {e}")

            if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                return "erro", 500

            return redirect(url_for("agendamentos", acao="ver", erro="alteracao"))

    else:
        raise MetodoInvalido()
