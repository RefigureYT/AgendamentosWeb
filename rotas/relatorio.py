# agendamentos_web/rotas/relatorio.py

from flask import Blueprint, render_template, jsonify
from main import db_controller  # Importe o db_controller do seu main.py
import json

bp_relatorio = Blueprint('relatorio', __name__)

@bp_relatorio.route('/relatorio/<id_agend_ml>')
def ver_relatorio(id_agend_ml):
    """
    Busca os dados do relatório em JSON no banco de dados,
    converte para um dicionário Python e renderiza um template parcial.
    """
    try:
        # Usa o método que já existe no seu DatabaseController
        relatorio_str = db_controller.get_relatorio_by_agendamento_ml(id_agend_ml)

        if not relatorio_str:
            # Retorna um erro amigável se o relatório não for encontrado
            return '<div class="alert alert-warning">Relatório não encontrado para este agendamento.</div>'

        # Converte a string JSON para um dicionário Python
        dados_relatorio = json.loads(relatorio_str)

        # Renderiza um template HTML apenas com o conteúdo do modal
        return render_template('partials/modal_relatorio_conteudo.html', relatorio=dados_relatorio)

    except Exception as e:
        print(f"Erro ao buscar relatório: {e}")
        return '<div class="alert alert-danger">Ocorreu um erro ao carregar o relatório.</div>'