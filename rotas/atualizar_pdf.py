import os
import time
from flask import request, redirect, url_for, flash
from werkzeug.utils import secure_filename

# Importe as variáveis globais da sua aplicação (app, controller, etc.)
from main import app, agendamento_controller 

@app.route('/atualizar-pdf', methods=['POST'])
def atualizar_pdf_route():
    # Valida se os campos necessários foram enviados no formulário
    if 'path' not in request.files or 'id_bd_atualizar' not in request.form:
        flash('Requisição inválida. Faltam parâmetros.', 'danger')
        # Redireciona para a página de visualização de agendamentos
        return redirect(url_for('agendamentos', acao='ver'))

    file = request.files['path']
    id_bd = request.form.get('id_bd_atualizar')

    if file.filename == '' or not id_bd:
        flash('Dados incompletos. Selecione um arquivo e tente novamente.', 'warning')
        return redirect(url_for('agendamentos', acao='ver'))

    # Verifica se o arquivo é um PDF
    if file and file.filename.endswith('.pdf'):
        try:
            # Garante um nome de arquivo seguro e único
            filename = secure_filename(f"update_{id_bd}_{int(time.time())}.pdf")
            
            # Define o caminho para salvar o arquivo (ajuste a pasta se necessário)
            upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads') 
            if not os.path.exists(upload_folder):
                os.makedirs(upload_folder)
            pdf_path = os.path.join(upload_folder, filename)
            
            file.save(pdf_path)

            # Chama o método do controller para processar a atualização
            success, message = agendamento_controller.update_pdf_agendamento(int(id_bd), pdf_path)
            
            # Remove o arquivo temporário após o processamento
            os.remove(pdf_path) 

            if success:
                # Adiciona o parâmetro 'atualizado=ok' para o feedback no front-end
                return redirect(url_for('agendamentos', acao='ver', atualizado='ok'))
            else:
                flash(f'Erro na atualização: {message}', 'danger')
                return redirect(url_for('agendamentos', acao='ver'))

        except Exception as e:
            flash(f'Ocorreu um erro inesperado: {str(e)}', 'danger')
            return redirect(url_for('agendamentos', acao='ver'))
    
    # Se o arquivo não for um PDF
    flash('Formato de arquivo inválido. Por favor, envie um PDF.', 'warning')
    return redirect(url_for('agendamentos', acao='ver'))