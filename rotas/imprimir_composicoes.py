from main import app, render_template, agendamento_controller, jsonify

@app.get("/imprimir-comp/<id_agend>")
def imprimir_composicao(id_agend:int):
    agendamento_controller.clear_agendamentos()
    agendamento_controller.insert_agendamento(id_bd=id_agend)
    
    agendamento_obj = agendamento_controller.get_last_made_agendamento()
    
    agendamento_controller.create_agendamento_from_bd_data(agendamento_obj)
    
    return_val = agendamento_controller.return_comp_grouped(agendamento_obj)
    
    print(return_val[0].comp_origem[0].localizacao)

    return render_template("imprimir_composicoes.html", comps=sorted(return_val, key=lambda obj: obj.comp_origem[0].localizacao), agendamento=agendamento_obj)