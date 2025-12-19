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
    save_path = None
    try:
        file = request.files.get('file')
        if not file or not mime_permitido(file.filename):
            flash("Arquivo inválido ou não selecionado. Apenas .xlsx, .xls e .csv são permitidos.", 'danger')
            raise ArquivoInvalido()

        # 1) salva o arquivo no disco
        original = secure_filename(file.filename)
        unique   = f"{uuid.uuid4().hex}_{original}"
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)   # garante a pasta
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique)
        file.save(save_path)

        # 2) lê id_bd e demais campos do formulário
        id_bd_str = (request.form.get('id_bd') or "").strip()
        id_bd = int(id_bd_str) if id_bd_str.isdigit() else 0

        colaborador = request.form.get('colaborador', '')

        # fonte de dados: 'db' (PostgreSQL) ou 'tiny' (API)
        fonte_dados = (request.form.get('fonte_dados') or 'db').strip().lower()
        if fonte_dados not in ('db', 'tiny'):
            fonte_dados = 'db'

        # pool do PostgreSQL (definido no main.py)
        pg_pool = app.config.get('PG_POOL')

        # helper para evitar ValueError quando vier "Todas", "Todos", "", etc.
        def _parse_int_field(field_name: str, default: int = 0) -> int:
            raw = (request.form.get(field_name) or "").strip()
            return int(raw) if raw.isdigit() else default

        # Se vier "Todas" / "Todos" dos filtros, cai em default=0
        empresa = _parse_int_field('empresa', 0)
        id_mktp = _parse_int_field('marketplace', 0)
        id_tipo = _parse_int_field('tipo', 0)

        # Shopee normalmente não usa centro, mas deixamos aqui para Meli/Magalu se precisar
        centro_distribuicao = (
            request.form.get('centro_distribuicao')
            or request.form.get('inp_centro_distribuicao')
            or None
        )

        # 3) registra o upload (mantido igual)
        upload_uuid = str(uuid.uuid4())
        db_controller.insert_excel_upload((upload_uuid, original))

        # =========================
        #   CAMINHO: ATUALIZAR
        # =========================
        if id_bd > 0:
            # Atualiza o agendamento existente a partir da planilha,
            # preservando o número do pedido (id_agend_ml) já salvo.
            ok, msg = agendamento_controller.update_excel_agendamento(
                id_bd=id_bd,
                colaborador=colaborador,
                empresa=empresa,
                id_mktp=id_mktp,
                id_tipo=id_tipo,
                excel_path=save_path,
                centro_distribuicao=centro_distribuicao,
                fonte_dados=fonte_dados,
                pg_pool=pg_pool,
            )

            if ok:
                flash("Agendamento atualizado com sucesso a partir da planilha.", "success")
                return redirect(url_for('agendamentos', acao='ver') + "?upload=ok_excel_update")

            else:
                app.logger.error(f"Falha ao atualizar agendamento via Excel (id_bd={id_bd}): {msg}")
                flash("Falha ao atualizar o agendamento a partir da planilha.", "danger")
                return redirect(url_for('agendamentos', acao='ver') + "?upload=fail&erro=update_excel")

        # =========================
        #   CAMINHO: CRIAR NOVO
        # =========================
        # (mantido exatamente como estava, para não quebrar Shopee novo)
        ag = agendamento_controller.create_agendamento_from_excel(
            excel_path=save_path,
            id_tipo=id_tipo,
            empresa=empresa,
            id_mktp=id_mktp,
            colaborador=colaborador,
            upload_uuid=upload_uuid
        )

        if fonte_dados == 'tiny':
            agendamento_controller.get_prod_data_tiny(ag)
            agendamento_controller.get_comp_tiny(ag)
            agendamento_controller.get_comp_data_tiny(ag)
        else:
            # PostgreSQL: tiny.produtos + tiny.composicoes
            if not pg_pool:
                raise Exception("PG_POOL não configurado no app (main.py).")

            agendamento_controller.get_prod_data_pg(ag, pg_pool)
            agendamento_controller.get_comp_pg(ag, pg_pool)

        # gera um pedido fake de 8 dígitos e sobrescreve o id_agend_ml
        fake_pedido = ''.join(random.choices(string.digits, k=8))
        ag.id_agend_ml = fake_pedido

        # insere o Agendamento no BD e pega seu id interno (id_bd)
        agendamento_controller.insert_agendamento_in_bd(ag)
        last_id = agendamento_controller.get_last_made_agendamento_in_bd()[0]
        agendamento_controller.set_id_bd_for_all(ag, last_id)

        # insere os produtos
        agendamento_controller.insert_produto_in_bd(ag)

        # mapeia os IDs gerados de volta para os objetos em memória
        produtos_do_bd = agendamento_controller.return_all_produtos_from_agendamento(ag)

        mapa_produtos_memoria = {}
        for p in ag.produtos:
            mapa_produtos_memoria.setdefault(p.sku, []).append(p)

        for rec in produtos_do_bd:
            inserted_prod_id, sku_prod = rec[0], rec[4]

            if sku_prod in mapa_produtos_memoria and mapa_produtos_memoria[sku_prod]:
                produto_obj = mapa_produtos_memoria[sku_prod].pop(0)
                produto_obj.set_id_bd(inserted_prod_id)
                produto_obj.set_id_bd_for_composicoes()
            else:
                app.logger.warning(
                    f"SKU {sku_prod} do BD não correspondeu a nenhum produto pendente em memória."
                )

        # insere as composições
        agendamento_controller.insert_composicao_in_bd(ag)

        # define as flags de erro de estoque
        agendamento_controller.set_error_flags_composicoes(ag)

        # redireciona normalmente (mesmo parâmetro que você já usava)
        return redirect(url_for('agendamentos', acao='ver') + "?upload=ok_excel")

    except ArquivoInvalido:
        # trata especificamente o caso de arquivo inválido, sem repetir o flash
        return redirect(url_for('agendamentos', acao='ver') + "?upload=fail&erro=arquivo_invalido")

    except Exception as e:
        app.logger.error(f"Erro ao processar EXCEL: {e}", exc_info=True)
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

        flash("Ocorreu um erro inesperado ao processar a planilha.", "danger")
        return redirect(
            url_for('agendamentos', acao='ver')
            + f"?upload=fail&erro={erro_msg}"
        )

    finally:
        # Garante que o arquivo temporário seja sempre removido
        if save_path and os.path.exists(save_path):
            os.remove(save_path)
# =====================================================================