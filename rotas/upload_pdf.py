import re
from mysql.connector import IntegrityError
from werkzeug.utils import secure_filename
from main import (
    app,
    request,
    redirect,
    url_for,
    flash,
    session,
    ALLOWED_EXTENSIONS,
    MetodoInvalido,
    ArquivoInvalido,
    agendamento_controller
)
import os


def mime_permitido(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/upload-pdf', methods=['POST'])
def upload():
    print(request.form)
    try:
        # 1) valida upload
        if 'path' not in request.files:
            flash("PDF não foi enviado")
            raise ArquivoInvalido()

        file = request.files['path']
        if file.filename == '' or not mime_permitido(file.filename):
            flash('Arquivo inválido ou não selecionado')
            raise ArquivoInvalido()

        # 2) salva o PDF
        filename = secure_filename(file.filename)
        path_pdf = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(path_pdf)

        # 3) extrai id do ML do nome do arquivo
        try:
            novo_id_ml = filename.split('-')[1]
        except IndexError:
            return redirect('/error/0')

        # 4) Dados do formulário
        id_bd_str = request.form.get('id_bd', '').strip() or '0'
        try:
            id_bd = int(id_bd_str)
        except ValueError:
            id_bd = 0

        colab   = session.get('nome_display_usuario', '')
        empresa = int(request.form.get('empresa', '0'))
        mktp    = int(request.form.get('marketplace', '0'))
        tipo    = int(request.form.get('tipo', '0'))
        centro  = request.form.get('centro_distribuicao', None) 
        
        id_agendamento = novo_id_ml

        # === ATUALIZAÇÃO ===
        if id_bd:
            sucesso, msg = agendamento_controller.update_pdf_agendamento(
                id_bd=id_bd,
                colaborador=colab,
                empresa=empresa,
                id_mktp=mktp,
                id_tipo=tipo,
                pdf_path=path_pdf,
                new_id_agend_ml=novo_id_ml,
                centro_distribuicao=centro
            )
            if not sucesso:
                raise Exception(msg)
            # CORREÇÃO: Mudei o parâmetro para 'atualizado=ok' para dar um feedback melhor ao usuário
            return redirect(url_for('agendamentos', acao='ver', atualizado='ok'))

        # === NOVO AGENDAMENTO ===

        # --- VERIFICAÇÃO DE DUPLICIDADE MOVIDA PARA CÁ ---
        # Agora, a checagem só acontece se NÃO for uma atualização (id_bd é 0 ou nulo)
        if agendamento_controller.db_controller.exists_agendamento_ml(id_agendamento):
            print(f"Tentativa de criar agendamento duplicado: {id_agendamento}")
            os.remove(path_pdf) 
            return redirect(url_for('agendamentos', acao='ver', upload='fail', erro='duplicado', pedido=id_agendamento))
        
        agendamento_controller.create_agendamento_from_pdf(
            pdf_path=path_pdf,
            id_agend_ml=id_agendamento,
            id_tipo=tipo,
            empresa=empresa,
            id_mktp=mktp,
            colaborador=colab,
            centro_distribuicao=centro
        )
        agendamento = agendamento_controller.agendamentos[-1]
        agendamento_controller.get_prod_data_tiny(agendamento)
        agendamento_controller.get_comp_tiny(agendamento)
        agendamento_controller.get_comp_data_tiny(agendamento)
        
        # O try/except aqui ainda é útil para outros erros de banco de dados
        try:
            agendamento_controller.insert_agendamento_in_bd(agendamento)
        except IntegrityError as e:
            if e.errno == 1062:
                pedido = agendamento.id_agend_ml
                return redirect(
                    url_for('agendamentos', acao='ver', upload='fail', erro='duplicado', pedido=pedido)
                )

        id_agend_bd = agendamento_controller.get_last_made_agendamento_in_bd()[0]
        agendamento_controller.set_id_bd_for_all(agendamento, id_agend_bd)
        agendamento_controller.insert_produto_in_bd(agendamento)

        for tpl in agendamento_controller.return_all_produtos_from_agendamento(agendamento):
            produto = agendamento_controller.search_produto(agendamento, 'id_ml', tpl[2])
            if not produto:
                app.logger.warning(f"Produto não encontrado para o id_ml {tpl[2]}")
                continue
            
            produto.set_id_bd(tpl[0])
            produto.set_id_bd_for_composicoes()

        agendamento_controller.set_error_flags_composicoes(agendamento)
        agendamento_controller.insert_composicao_in_bd(agendamento)

        return redirect(url_for('agendamentos', acao='ver') + "?upload=ok_pdf")

    except Exception as e:
        print(f"Erro ao processar PDF: {e}")
        msg = str(e).lower()

        # primeiro, testamos duplicado
        if "já existe" in msg or "duplicado" in msg:
            # tenta extrair o número do pedido de dentro da mensagem
            m = re.search(r'(\d+)', str(e))
            pedido = m.group(1) if m else ''
            return redirect(
                url_for('agendamentos', acao='ver')
                + f'?upload=fail&erro=duplicado&pedido={pedido}'
            )

        # senão, mapeamos os outros erros como antes
        erro_msg = "erro_desconhecido"
        if "gtin" in msg:
            erro_msg = "gtin_vazio"
        elif "arquivo inválido" in msg:
            erro_msg = "arquivo_invalido"
        elif "pdf" in msg:
            erro_msg = "erro_pdf"
        elif "database" in msg:
            erro_msg = "erro_banco"

        return redirect(
            url_for('agendamentos', acao='ver')
            + f'?upload=fail&erro={erro_msg}'
        )