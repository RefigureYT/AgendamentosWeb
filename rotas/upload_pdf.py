import re
import os
from werkzeug.utils import secure_filename

# OBS: você está usando Postgres agora; este import do mysql pode ficar,
# mas não é mais "a fonte de verdade" para IntegrityError.
# Se quiser, depois trocamos para psycopg2.IntegrityError.
from mysql.connector import IntegrityError

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
    agendamento_controller,
)

# --- tenta obter o pool do Postgres (tiny.produtos / tiny.composicoes) do main.py ---
# (mantém compatível caso você tenha nomeado de formas diferentes)
try:
    from main import PG_POOL as _PG_POOL_MAIN
except Exception:
    _PG_POOL_MAIN = None

try:
    from main import pg_pool as _PG_POOL_MAIN_2
except Exception:
    _PG_POOL_MAIN_2 = None


def _get_pg_pool():
    # Prioriza variáveis exportadas do main (se existirem)
    pool = _PG_POOL_MAIN_2 or _PG_POOL_MAIN
    if pool:
        return pool

    # Fallback oficial do seu projeto: main.py guarda em app.config["PG_POOL"]
    try:
        return app.config.get("PG_POOL")
    except Exception:
        return None

def mime_permitido(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _safe_set(obj, attr, value):
    """Seta atributo com fallback (caso não exista setter)."""
    # tenta setter "set_xxx"
    setter = f"set_{attr}"
    if hasattr(obj, setter):
        try:
            getattr(obj, setter)(value)
            return
        except Exception:
            pass
    try:
        setattr(obj, attr, value)
    except Exception:
        pass


def _safe_search_produto(agendamento, att_name, att_value):
    """Procura produto em memória sem estourar AttributeError se attr não existir."""
    for p in getattr(agendamento, "produtos", []) or []:
        if hasattr(p, att_name) and str(getattr(p, att_name)) == str(att_value):
            return p
    return None


@app.route("/upload-pdf", methods=["POST"])
def upload():
    print(request.form)
    try:
        # 1) valida upload
        if "path" not in request.files:
            flash("PDF não foi enviado")
            raise ArquivoInvalido()

        file = request.files["path"]
        if file.filename == "" or not mime_permitido(file.filename):
            flash("Arquivo inválido ou não selecionado")
            raise ArquivoInvalido()

        # 2) salva o PDF
        filename = secure_filename(file.filename)
        path_pdf = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(path_pdf)

        # 3) extrai id do ML do nome do arquivo
        try:
            novo_id_ml = filename.split("-")[1]
        except IndexError:
            return redirect("/error/0")

        # 4) Dados do formulário
        id_bd_str = request.form.get("id_bd", "").strip() or "0"
        try:
            id_bd = int(id_bd_str)
        except ValueError:
            id_bd = 0

        colab = session.get("nome_display_usuario", "")
        empresa = int(request.form.get("empresa", "0"))
        mktp = int(request.form.get("marketplace", "0"))
        tipo = int(request.form.get("tipo", "0"))
        centro = request.form.get("centro_distribuicao", None)

        # --- NOVO: fonte de dados (db ou tiny) ---
        fonte = (request.form.get("fonte_dados", "db") or "db").strip().lower()
        if fonte not in ("db", "tiny"):
            fonte = "db"

        pg_pool = _get_pg_pool()

        id_agendamento = novo_id_ml

        # ==========================================================
        # === ATUALIZAÇÃO (id_bd existe) ===
        # ==========================================================
        if id_bd:
            # Se for via Tiny, usa seu controller atual
            if fonte == "tiny":
                sucesso, msg = agendamento_controller.update_pdf_agendamento(
                    id_bd=id_bd,
                    colaborador=colab,
                    empresa=empresa,
                    id_mktp=mktp,
                    id_tipo=tipo,
                    pdf_path=path_pdf,
                    new_id_agend_ml=novo_id_ml,
                    centro_distribuicao=centro,
                )
                if not sucesso:
                    raise Exception(msg)
                return redirect(url_for("agendamentos", acao="ver", atualizado="ok"))

            # --- via DB (Postgres) ---
            if not pg_pool:
                raise Exception(
                    "PG_POOL não está disponível no upload_pdf.py. "
                    "Exporte o pool no main.py (ex.: PG_POOL = pool) e importe aqui."
                )

            # 1) carrega agendamentos do DB em memória
            agendamento_controller.create_agendamento_from_bd_data()
            agendamento_original = agendamento_controller.search_agendamento("id_bd", str(id_bd))
            if not agendamento_original:
                raise Exception(f"Agendamento com id_bd={id_bd} não encontrado.")

            # 2) centro final
            centro_final = centro if centro is not None else getattr(agendamento_original, "centro_distribuicao", None)

            # 3) atualiza meta em memória (vai salvar no final)
            _safe_set(agendamento_original, "id_agend_ml", novo_id_ml)
            _safe_set(agendamento_original, "colaborador", colab)
            _safe_set(agendamento_original, "empresa", empresa)
            _safe_set(agendamento_original, "id_mktp", mktp)
            _safe_set(agendamento_original, "id_tipo", tipo)
            _safe_set(agendamento_original, "centro_distribuicao", centro_final)

            # 4) limpa produtos e composições antigos no BD
            agendamento_controller.db_controller.delete_composicoes_by_agendamento(id_bd)
            agendamento_controller.db_controller.delete_produtos_by_agendamento(id_bd)

            # 5) recria a partir do PDF (em memória)
            agendamento_controller.create_agendamento_from_pdf(
                pdf_path=path_pdf,
                id_agend_ml=novo_id_ml,
                id_tipo=tipo,
                empresa=empresa,
                id_mktp=mktp,
                colaborador=colab,
                centro_distribuicao=centro_final,
            )
            novo = agendamento_controller.agendamentos[-1]
            agendamento_controller.set_id_bd_for_all(novo, id_bd)

            # 6) enriquece via Postgres
            agendamento_controller.get_prod_data_pg(novo, pg_pool)
            agendamento_controller.get_comp_pg(novo, pg_pool)

            # 7) insere produtos no BD
            agendamento_controller.insert_produto_in_bd(novo)

            # 8) mapeia id_bd dos produtos para os objetos em memória
            produtos_bd = agendamento_controller.return_all_produtos_from_agendamento(novo)
            for tpl in produtos_bd:
                if not tpl or len(tpl) < 3:
                    continue

                id_prod_bd = tpl[0]
                id_ml_bd = tpl[2]  # normalmente seu campo único

                produto_obj = (
                    _safe_search_produto(novo, "id_ml", id_ml_bd)
                    or _safe_search_produto(novo, "etiqueta", id_ml_bd)
                    or _safe_search_produto(novo, "sku", tpl[4] if len(tpl) > 4 else "")
                )
                if not produto_obj:
                    app.logger.warning(f"[PDF UPDATE DB] Produto não encontrado p/ chave={id_ml_bd} (tpl={tpl})")
                    continue

                if hasattr(produto_obj, "set_id_bd"):
                    produto_obj.set_id_bd(id_prod_bd)
                else:
                    produto_obj.id_bd = id_prod_bd

                if hasattr(produto_obj, "set_id_bd_for_composicoes"):
                    produto_obj.set_id_bd_for_composicoes()

            # 9) flags + insert composições
            agendamento_controller.set_error_flags_composicoes(novo)
            agendamento_controller.insert_composicao_in_bd(novo)

            # 10) atualiza agendamento no BD (com o novo número do pedido)
            agendamento_controller.db_controller.update_agendamento(
                id_agend_bd=id_bd,
                id_agend_ml=novo_id_ml,
                id_agend_tipo=tipo,
                empresa=empresa,
                id_mktp=mktp,
                colaborador=colab,
                centro_distribuicao=centro_final,
            )

            return redirect(url_for("agendamentos", acao="ver", atualizado="ok"))

        # ==========================================================
        # === NOVO AGENDAMENTO ===
        # ==========================================================

        # checa duplicidade só no "novo"
        if agendamento_controller.db_controller.exists_agendamento_ml(id_agendamento):
            print(f"Tentativa de criar agendamento duplicado: {id_agendamento}")
            os.remove(path_pdf)
            return redirect(
                url_for("agendamentos", acao="ver", upload="fail", erro="duplicado", pedido=id_agendamento)
            )

        agendamento_controller.create_agendamento_from_pdf(
            pdf_path=path_pdf,
            id_agend_ml=id_agendamento,
            id_tipo=tipo,
            empresa=empresa,
            id_mktp=mktp,
            colaborador=colab,
            centro_distribuicao=centro,
        )
        agendamento = agendamento_controller.agendamentos[-1]

        # --- decide fonte ---
        if fonte == "tiny":
            agendamento_controller.get_prod_data_tiny(agendamento)
            agendamento_controller.get_comp_tiny(agendamento)
            agendamento_controller.get_comp_data_tiny(agendamento)
        else:
            if not pg_pool:
                raise Exception(
                    "PG_POOL não está disponível no upload_pdf.py. "
                    "Exporte o pool no main.py (ex.: PG_POOL = pool) e importe aqui."
                )
            agendamento_controller.get_prod_data_pg(agendamento, pg_pool)
            agendamento_controller.get_comp_pg(agendamento, pg_pool)

        # cria agendamento no BD
        try:
            agendamento_controller.insert_agendamento_in_bd(agendamento)
        except IntegrityError as e:
            # fallback legado
            if getattr(e, "errno", None) == 1062:
                pedido = agendamento.id_agend_ml
                return redirect(url_for("agendamentos", acao="ver", upload="fail", erro="duplicado", pedido=pedido))

        id_agend_bd = agendamento_controller.get_last_made_agendamento_in_bd()[0]
        agendamento_controller.set_id_bd_for_all(agendamento, id_agend_bd)

        # insere produtos
        agendamento_controller.insert_produto_in_bd(agendamento)

        # mapeia ids produtos
        for tpl in agendamento_controller.return_all_produtos_from_agendamento(agendamento):
            if not tpl or len(tpl) < 3:
                continue

            key = tpl[2]
            produto = (
                _safe_search_produto(agendamento, "id_ml", key)
                or _safe_search_produto(agendamento, "etiqueta", key)
                or _safe_search_produto(agendamento, "sku", tpl[4] if len(tpl) > 4 else "")
            )
            if not produto:
                app.logger.warning(f"Produto não encontrado para chave={key} (tpl={tpl})")
                continue

            if hasattr(produto, "set_id_bd"):
                produto.set_id_bd(tpl[0])
            else:
                produto.id_bd = tpl[0]

            if hasattr(produto, "set_id_bd_for_composicoes"):
                produto.set_id_bd_for_composicoes()

        # flags + composições
        agendamento_controller.set_error_flags_composicoes(agendamento)
        agendamento_controller.insert_composicao_in_bd(agendamento)

        return redirect(url_for("agendamentos", acao="ver") + "?upload=ok_pdf")

    except Exception as e:
        print(f"Erro ao processar PDF: {e}")
        msg = str(e).lower()

        # primeiro: duplicado
        if "já existe" in msg or "duplicado" in msg:
            m = re.search(r"(\d+)", str(e))
            pedido = m.group(1) if m else ""
            return redirect(
                url_for("agendamentos", acao="ver") + f"?upload=fail&erro=duplicado&pedido={pedido}"
            )

        erro_msg = "erro_desconhecido"
        if "gtin" in msg:
            erro_msg = "gtin_vazio"
        elif "arquivo inválido" in msg:
            erro_msg = "arquivo_invalido"
        elif "pdf" in msg:
            erro_msg = "erro_pdf"
        elif "database" in msg or "banco" in msg:
            erro_msg = "erro_banco"

        return redirect(url_for("agendamentos", acao="ver") + f"?upload=fail&erro={erro_msg}")
