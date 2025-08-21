from werkzeug.utils import secure_filename
from main import (
    app,
    request,
    redirect,
    url_for,
    flash,
    render_template,
    session,
    ALLOWED_EXTENSIONS,
    MetodoInvalido,
    ArquivoInvalido,
    agendamento_controller,
    db_controller  
)
import os
import uuid
import random
import string
import pandas as pd

def mime_permitido(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload-excel', methods=['POST'])
def upload_excel():
    try:
        file = request.files.get('file')
        if not file or not mime_permitido(file.filename):
            flash("Arquivo inválido ou não selecionado", 'danger')
            raise ArquivoInvalido()

        # salva o arquivo no disco
        filename = secure_filename(file.filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)

        # 1) registro do upload
        upload_uuid = str(uuid.uuid4())
        db_controller.insert_excel_upload((upload_uuid, filename))

        # 2) cria o Agendamento em memória a partir do Excel
        ag = agendamento_controller.create_agendamento_from_excel(
            excel_path=save_path,
            id_tipo=int(request.form.get('tipo', 0)),
            empresa=int(request.form.get('empresa', 0)),
            id_mktp=int(request.form.get('marketplace', 0)),
            colaborador=request.form.get('colaborador', ''),
            upload_uuid=upload_uuid
        )

        agendamento = agendamento_controller.agendamentos[-1]
        agendamento_controller.get_prod_data_tiny(agendamento)
        agendamento_controller.get_comp_tiny(agendamento)
        agendamento_controller.get_comp_data_tiny(agendamento)

        # ─── NOVO ───
        # 2.5) gera um pedido fake de 8 dígitos e sobrescreve o id_agend_ml
        fake_pedido = ''.join(random.choices(string.digits, k=8))
        ag.id_agend_ml = fake_pedido
        # ───────────

        # 3) insere o Agendamento no BD e pega seu id interno (id_bd)
        agendamento_controller.insert_agendamento_in_bd(ag)
        last_id = agendamento_controller.get_last_made_agendamento_in_bd()[0]
        agendamento_controller.set_id_bd_for_all(ag, last_id)

        # 4) insere os produtos
        agendamento_controller.insert_produto_in_bd(ag)

        # 5) atualiza os produtos em memória com o id_prod que foi gerado no insert
        for rec in agendamento_controller.return_all_produtos_from_agendamento(ag):
            inserted_prod_id = rec[0]    # id_prod do BD
            sku_prod          = rec[4]    # sku_prod vindo do tuple
            produto_obj = agendamento_controller.search_produto(ag, 'sku', sku_prod)
            if produto_obj:
                produto_obj.set_id_bd(inserted_prod_id)
                produto_obj.set_id_bd_for_composicoes()

        # 6) insere as composições (foreign-key já ajustado pelo passo 5)
        agendamento_controller.insert_composicao_in_bd(ag)

        # 7) redireciona para a view do Excel (ou cleaning) passando o uuid
        return redirect(url_for('agendamentos', acao='ver') + "?upload=ok_excel")

    except Exception as e:
        print(f"Erro ao processar EXCEL: {e}")
        erro_msg = "erro_desconhecido"
        err_str = str(e).lower()
        if "gtin" in err_str:
            erro_msg = "gtin_vazio"
        elif "arquivo inválido" in err_str:
            erro_msg = "arquivo_invalido"
        elif "excel" in err_str:
            erro_msg = "erro_excel"
        elif "database" in err_str:
            erro_msg = "erro_banco"

        return redirect(
            url_for('agendamentos', acao='ver')
            + f"?upload=fail&erro={erro_msg}"
        )
