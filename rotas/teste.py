from main import app, render_template, agendamento_controller

@app.route('/teste-2')
def teste_2():
    agendamento_controller.clear_agendamentos()
    agendamento_controller.create_agendamento_for_compras()
    for i in agendamento_controller.agendamentos:
        print(len(i.produtos))
    dados = agendamento_controller.create_joined_agendamento()
    #print(dados)
    return render_template('teste.html', dados=agendamento_controller.return_joined_agend_in_dict(dados))
    #agendamento_controller.clear_agendamentos()
    #agendamento_controller.insert_agendamento(1)
    #agendamento_controller.create_agendamento_from_bd_data(agendamento_controller.get_last_made_agendamento())
    #return render_template('teste.html', dados=agendamento_controller.return_all_in_dict(agendamento_controller.get_last_made_agendamento()))