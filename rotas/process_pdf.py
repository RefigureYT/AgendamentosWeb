from main import app, redirect, url_for, agendamento_controller
from classes.models import Agendamento

""" Faz o BackEnd processar o arquivo PDF baixado e envia os dados ao banco de dados """
@app.route('/process-pdf/<path>/<type>')
def process_pdf(path, type):
    pdf_path = f"{app.config['UPLOAD_FOLDER']}/{path}"
    agendamento_controller.create_agendamento_from_pdf(
        pdf_path=pdf_path,
        id_agend_ml=path.split('-')[1],
        id_tipo=type,
        empresa=0,
        id_mktp=1,
        colaborador=''
    )
    agendamento:Agendamento = agendamento_controller.agendamentos[-1]
    agendamento_controller.get_prod_data_tiny(agendamento)
    agendamento_controller.get_comp_tiny(agendamento)
    agendamento_controller.get_comp_data_tiny(agendamento)

    agendamento_controller.insert_agendamento_in_bd(agendamento)
    # Como é feito após uma inserção, nunca acontecerá de não haver resposta
    id_agend_bd = agendamento_controller.get_last_made_agendamento_in_bd()[0]

    agendamento_controller.set_id_bd_for_all(agendamento, id_agend_bd)

    agendamento_controller.insert_produto_in_bd(agendamento)

    for i in agendamento_controller.return_all_produtos_from_agendamento(agendamento):
        produto = agendamento_controller.search_produto(agendamento, 'etiqueta', i[2])
        produto.set_id_bd(i[0])
        produto.set_id_bd_for_composicoes()

    agendamento_controller.set_error_flags_composicoes(agendamento)

    agendamento_controller.insert_composicao_in_bd(agendamento)

    return redirect(url_for('agendamentos', acao='ver'))
