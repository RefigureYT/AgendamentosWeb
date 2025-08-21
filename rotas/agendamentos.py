from main import app, render_template, agendamento_controller, ParametroInvalido
from flask import session
from datetime import datetime

""" Leva para as páginas 'novoAgendamento' e 'agendamentos' """
@app.route("/agendamentos/<acao>")
def agendamentos(acao):
    if acao == "criar":
        return render_template("novoAgendamento.html")
    elif acao == "ver":
        # 1) Carrega tudo em memória
        agendamento_controller.clear_agendamentos()
        agendamento_controller.create_agendamento_from_bd_data()
        todos = agendamento_controller.agendamentos

        # — Ordena do mais recente para o mais antigo pela data de entrada
        todos.sort(key=lambda a: a.entrada or datetime.min, reverse=True)
        # 2) Filtra pelo role
        role = session.get("role", "all")
        if role == "limp_conf":
            # só Limpeza (1) e Conferência (3)
            dados = [a for a in todos if a.id_tipo in (1, 3)]
        elif role == "emb_exp":
            # só Embalar (4) e Expedição (5)
            dados = [a for a in todos if a.id_tipo in (4, 5)]
        else:
            # 'all' ou qualquer outro role vê tudo
            dados = todos

        # 3) Renderiza só os permitidos
        return render_template("agendamentos.html", dados=dados)

    else:
        raise ParametroInvalido()
