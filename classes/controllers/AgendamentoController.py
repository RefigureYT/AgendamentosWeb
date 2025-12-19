from classes.models import Agendamento, Produto, Composicao, JoinedComposicao, JoinedAgendamento
from classes.views import AgendamentoView
from classes.services import PdfService, SpreadsheetService
from .DatabaseController import DatabaseController
from datetime import datetime
import time, json
from base_jp_lab import Caller
import logging
from typing import Optional
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
    )

class AgendamentoController:
    def __init__(self, db_controller:DatabaseController = None, caller_obj:Caller = None):
        self.agendamentos = []
        self.view = AgendamentoView()
        self.pdf_service = PdfService()
        self.csv_service = SpreadsheetService
        self.db_controller = db_controller
        self.caller = caller_obj

    #Busca nova chave Access Token
    #print(api_token_db(access_obj,))

    def insert_agendamento(self, id_bd:int = 0, id_agend_ml:str = '', id_tipo:int = 0, empresa:int = 0, id_mktp:int = 0, colaborador = '', entrada:datetime = None, centro_distribuicao:str = ''):
        self.agendamentos.append(Agendamento(id_bd, id_agend_ml, id_tipo, empresa, id_mktp, colaborador, entrada, centro_distribuicao))

    def search_agendamento(self, att_name:str = '', att_value:str = ''):
        return next((i for i in self.agendamentos if str(getattr(i, att_name)) == att_value), None)
    
    def insert_produto(self, agendamento:Agendamento = None,
                    id_bd:int = 0, 
                    id_tiny:str = '', 
                    id_ml:str = '', 
                    nome:str = '', 
                    sku:str = '', 
                    gtin:str = '', 
                    unidades:int = 0, 
                    estoque_error_flag:str = '',
                    imagem_url:str = ''):
        produto = Produto(id_agend=agendamento.id_bd, id_bd=id_bd, id_tiny=id_tiny, id_ml=id_ml, nome=nome, sku=sku, gtin=gtin, unidades=unidades, estoque_error_flag=estoque_error_flag, imagem_url=imagem_url) 
        agendamento.insert_produto(produto)

    def insert_produto_in_bd(self, agendamento:Agendamento = None):
        self.db_controller.insert_produto_in_bd(agendamento.return_produtos_in_tuple())

    def search_produto(self, agendamento:Agendamento, att_name:str = '', att_value:str = ''):
        return next((i for i in agendamento.produtos if str(getattr(i, att_name)) == att_value), None)

    def insert_composicao(self, produto:Produto = None, 
                        id_bd:int = 0, 
                        fk_id_prod:int = 0, 
                        nome:str = '', 
                        sku:str = '',
                        id_tiny:str = '',
                        gtin:str = '',
                        unidades_por_kit:int = 0,
                        unidades_de_kits:int = 0,
                        estoque_tiny:int = 0,
                        localizacao:str = '',
                        estoque_error_flag:str = '',
                        imagem_url:str = ''):
        composicao = Composicao(id_bd=id_bd, fk_id_prod=fk_id_prod, nome=nome, sku=sku, prod_sku=produto.sku, id_tiny=id_tiny, gtin=gtin, prod_gtin=produto.gtin, unidades_por_kit=unidades_por_kit, unidades_de_kits=unidades_de_kits, estoque_tiny=estoque_tiny, localizacao=localizacao, estoque_error_flag=estoque_error_flag, imagem_url=imagem_url)        
        produto.insert_composicao(composicao)

    def insert_composicao_in_bd(self, agendamento:Agendamento = None):
        self.db_controller.insert_composicao_in_bd(agendamento.return_all_composicoes_in_tuple())

    def insert_composicao_alteracao_in_bd(self, produto:Produto = None, comp_list_dict:list[dict] = []):
        comp_to_change = [produto.search_composicao('id_bd', i['id_bd']) for i in comp_list_dict]
        self.db_controller.insert_alteracao_in_bd([i.to_tuple_alteracao() for i in comp_to_change])

    def insert_composicao_compras_in_bd(self, produto:Produto = None, comp_list_dict:list[dict] = []):
        comp_to_change = [produto.search_composicao('id_bd', i['id_bd']) for i in comp_list_dict]
        self.db_controller.insert_compras_in_bd([i.to_tuple_compra() for i in comp_to_change])

    def search_composicao(self, produto:Produto, att_name:str = '', att_value:str = ''):
        return next((i for i in produto.composicoes if str(getattr(i, att_name)) == att_value), None)

    def create_agendamento_from_pdf(self, 
                                    pdf_path: str, 
                                    id_agend_ml: str, 
                                    id_tipo: int, 
                                    empresa: int, 
                                    id_mktp: int,
                                    colaborador: str,
                                    centro_distribuicao: Optional[str] = None) -> Agendamento:
        """Create complete Agendamento with Produtos from PDF"""
        try:
            # Create base agendamento
            agendamento = Agendamento(
                id_agend_ml=id_agend_ml,
                id_tipo=id_tipo,
                empresa=empresa,
                id_mktp=id_mktp,
                centro_distribuicao=centro_distribuicao,
                colaborador=colaborador
            )
            
            # Parse PDF
            product_data_list = self.pdf_service.parse_pdf_to_dict(pdf_path)
            
            # Create products and add to agendamento
            for product_data in product_data_list:
                produto = Produto(
                    id_ml=product_data['id_ml'],
                    sku=product_data['sku'],
                    nome=product_data['nome'],
                    unidades=product_data['unidades'],
                    gtin=product_data['codigo_uni'],
                    etiqueta=product_data['etiqueta']
                )
                agendamento.insert_produto(produto)
                
                # For now assume simple products (no composition)
                # You would add composition logic here if needed
            
            self.agendamentos.append(agendamento)
            self.view.show_agendamento_created(agendamento)
            return agendamento
            
        except Exception as e:
            self.view.show_error(f"Failed to create agendamento: {str(e)}")
            raise
        
    
    def create_agendamento_from_excel(self,
                                  excel_path: str,
                                  id_tipo: int,
                                  empresa: int,
                                  id_mktp: int,
                                  colaborador: str,
                                  upload_uuid: str) -> Agendamento:
        """
        Cria um Agendamento com Produtos e Composições a partir de um arquivo
        (Excel ou CSV Magalu).
        """
        try:
            agendamento = Agendamento(
                id_agend_ml=upload_uuid,
                id_tipo=id_tipo,
                empresa=empresa,
                id_mktp=id_mktp,
                colaborador=colaborador
            )

            # Parse genérico (detecta extensão)
            rows = SpreadsheetService.parse_spreadsheet_to_dict(excel_path)
            if rows:
                logger.debug(">>> primeira linha: %s", rows[0])

            for row in rows:
                # --- fluxo Excel (.xlsx/.xls) ---
                if 'sku_variacao' in row:
                    sku       = row['sku_variacao'] if row['sku_variacao'] != '-' else (row.get('sku_principal') or 'SKU não encontrado')
                    nome      = row.get('produto', '')
                    unidades  = int(row.get('unidades', 0))
                    # UNIFICAÇÃO: tenta usar etiqueta (Shopee); se não tiver, cai pro item_id
                    id_ml     = str(row.get('id_prod_ml') or row.get('Etiqueta Full') or row.get('item_id') or '').strip()

                # --- fluxo CSV Magalu (.csv) ---
                elif 'sku' in row:
                    sku       = row['sku']
                    nome      = row.get('produto', '')
                    unidades  = int(row.get('unidades', 0))
                    id_ml     = ''  # CSV não tem etiqueta/id do item
                else:
                    # linha inesperada: pula
                    continue

                produto = Produto(
                    id_ml    = id_ml,   # <--- sempre preenche o campo único
                    nome     = nome,
                    sku      = sku,
                    unidades = unidades
                )
                agendamento.insert_produto(produto)


            self.agendamentos.append(agendamento)
            self.view.show_agendamento_created(agendamento)
            return agendamento

        except Exception as e:
            self.view.show_error(f"Failed to create agendamento: {str(e)}")
            raise

    def create_agendamento_from_bd_data(self, agendamento:Agendamento = None):
        if agendamento is None:
            db_resp = self.db_controller.get_all_agendamentos()
            if type(db_resp) is tuple:
                # Este caso provavelmente não acontece, mas mantendo a lógica
                self.insert_agendamento(db_resp[0], db_resp[1], db_resp[2], db_resp[3], db_resp[4], db_resp[5], db_resp[7], db_resp[6])
            elif type(db_resp) is list:
                for tuple_data in db_resp:
                    # CORREÇÃO: Passando todos os parâmetros do banco de dados com os nomes corretos.
                    self.insert_agendamento(
                        id_bd=tuple_data[0],
                        id_agend_ml=tuple_data[1],
                        id_tipo=tuple_data[2],
                        empresa=tuple_data[3],
                        id_mktp=tuple_data[4],
                        colaborador=tuple_data[5],
                        centro_distribuicao=tuple_data[6],
                        entrada=tuple_data[7]
                    )
        else:
            db_resp = self.get_agendamento_by_id(agendamento)[0]
            agendamento.id_agend_ml = db_resp[1]
            agendamento.id_tipo = db_resp[2]
            agendamento.empresa = db_resp[3]
            agendamento.id_mktp = db_resp[4]
            agendamento.colaborador = db_resp[5]
            agendamento.centro_distribuicao = db_resp[6]
            entrada_db = db_resp[7] 
            if isinstance(entrada_db, str):
                try:
                    agendamento.entrada = datetime.strptime(entrada_db, '%Y-%m-%d %H:%M:%S')
                except (ValueError, TypeError):
                    agendamento.entrada = datetime.now()
            elif entrada_db is None: # Adiciona esta verificação
                agendamento.entrada = datetime.now()
            else:
                agendamento.entrada = entrada_db
            produtos = self.return_all_produtos_from_agendamento(agendamento)
            for prod_bd in produtos:
                self.insert_produto(agendamento=agendamento, 
                                    id_bd=prod_bd[0],
                                    id_tiny=prod_bd[3],
                                    id_ml=prod_bd[2],
                                    nome=prod_bd[8],
                                    sku=prod_bd[4],
                                    gtin=prod_bd[5],
                                    unidades=prod_bd[6],
                                    estoque_error_flag=prod_bd[9],
                                    imagem_url=prod_bd[10]
                                    )
                produto:Produto = agendamento.produtos[-1]
                composicoes = self.return_all_composicoes_from_produto(produto)
                for comp_bd in composicoes:
                    self.insert_composicao(produto=produto,
                                        id_bd=comp_bd[0],
                                        fk_id_prod=produto.id_bd,
                                        nome=comp_bd[5],
                                        sku=comp_bd[4],
                                        id_tiny=comp_bd[2],
                                        gtin=comp_bd[3],
                                        unidades_por_kit=comp_bd[6],
                                        unidades_de_kits=produto.unidades,
                                        estoque_tiny=comp_bd[8],
                                        localizacao=comp_bd[9],
                                        estoque_error_flag=comp_bd[10],
                                        imagem_url=(comp_bd[11] if len(comp_bd) > 11 else '')
                                        )
                    
    def create_agendamento_for_alteracao(self):
        db_resp = self.db_controller.get_all_agendamentos_in_alteracoes()
        for resp in db_resp:
            self.insert_agendamento(resp[0], resp[1], resp[2], resp[3], resp[4], resp[5], resp[6])
            agendamento = self.get_last_made_agendamento()

            produtos = self.get_produtos_from_alteracoes(agendamento)
            logger.debug("Produtos em alteração: %s", produtos)
            for prod_bd in produtos:
                self.insert_produto(agendamento=agendamento, 
                                    id_bd=prod_bd[0],
                                    id_tiny=prod_bd[3],
                                    id_ml=prod_bd[2],
                                    nome=prod_bd[8],
                                    sku=prod_bd[4],
                                    gtin=prod_bd[5],
                                    unidades=prod_bd[6],
                                    estoque_error_flag=prod_bd[9]
                                    )
                produto:Produto = agendamento.produtos[-1]
                self.view.display_produto(produto)
                composicoes = self.get_composicao_from_alteracoes(produto)
                for comp_bd in composicoes:
                    self.insert_composicao(produto=produto,
                                        id_bd=comp_bd[0],
                                        fk_id_prod=produto.id_bd,
                                        nome=comp_bd[5],
                                        sku=comp_bd[4],
                                        id_tiny=comp_bd[2],
                                        gtin=comp_bd[3],
                                        unidades_por_kit=comp_bd[6],
                                        unidades_de_kits=produto.unidades,
                                        estoque_tiny=comp_bd[8],
                                        estoque_error_flag=comp_bd[9],
                                        imagem_url=(comp_bd[11] if len(comp_bd) > 11 else '')
                                        )
                    
    def create_agendamento_for_compras(self):
        db_resp = self.db_controller.get_all_agendamentos_in_compras()
        for resp in db_resp:
            self.insert_agendamento(resp[0], resp[1], resp[2], resp[3], resp[4], resp[5], resp[6])
            agendamento = self.get_last_made_agendamento()

            produtos = self.get_produtos_from_compras(agendamento)
            for prod_bd in produtos:
                self.insert_produto(agendamento=agendamento, 
                                    id_bd=prod_bd[0],
                                    id_tiny=prod_bd[3],
                                    id_ml=prod_bd[2],
                                    nome=prod_bd[8],
                                    sku=prod_bd[4],
                                    gtin=prod_bd[5],
                                    unidades=prod_bd[6],
                                    estoque_error_flag=prod_bd[9]
                                    )
                produto:Produto = agendamento.produtos[-1]
                composicoes = self.get_composicao_from_compras(produto)
                for comp_bd in composicoes:
                    self.insert_composicao(produto=produto,
                                        id_bd=comp_bd[0],
                                        fk_id_prod=produto.id_bd,
                                        nome=comp_bd[5],
                                        sku=comp_bd[4],
                                        id_tiny=comp_bd[2],
                                        gtin=comp_bd[3],
                                        unidades_por_kit=comp_bd[6],
                                        unidades_de_kits=produto.unidades,
                                        estoque_tiny=comp_bd[8],
                                        estoque_error_flag=comp_bd[9],
                                        imagem_url=(comp_bd[11] if len(comp_bd) > 11 else '')
                                        )
                    
    def create_joined_agendamento(self):
        join_agend = JoinedAgendamento()
        for agendamento in self.agendamentos:
            join_agend.insert_agendamento(agendamento)
        join_agend.set_produtos()
        return join_agend
    
    def return_joined_composicoes_from_joined_agend(self, join_agend:JoinedAgendamento = None):
        return join_agend.return_comp_grouped()

    def set_empresa_colaborador_agend(self, agendamento:Agendamento, empresa:int = 0, colaborador:str = ''):
        agendamento.set_colaborador(colaborador)
        agendamento.set_empresa(empresa)
        
    def get_compras_data(self):
        return self.db_controller.get_composicoes_from_compras()

    def get_produtos_from_alteracoes(self, agendamento:Agendamento = None):
        return self.db_controller.get_produtos_from_alteracoes(agendamento.id_bd)

    def get_composicao_from_alteracoes(self, produto:Produto = None):
        return self.db_controller.get_composicao_from_alteracoes(produto.id_bd)

    def get_produtos_from_compras(self, agendamento:Agendamento = None):
        return self.db_controller.get_produtos_from_compras(agendamento.id_bd)

    def get_composicao_from_compras(self, produto:Produto = None):
        return self.db_controller.get_composicao_from_compras(produto.id_bd)

    def get_last_made_agendamento(self) -> Agendamento:
        if not self.agendamentos:
            raise IndexError("Nenhum agendamento carregado em memória.")
        return self.agendamentos[-1]

    def get_last_made_agendamento_in_bd(self):
        return self.db_controller.get_last_agendamento()

    def get_agendamento_by_id(self, agendamento:Agendamento = None):
        return self.db_controller.get_agendamento_by_bd_id(agendamento.id_bd)

    def _get_tiny_image_by_id(self, id_tiny: str) -> str:
        """Retorna a URL da primeira imagem (anexo) do produto Tiny, ou ''."""
        if not id_tiny:
            return ""
        resp_details = self.caller.make_call(f"produtos/{id_tiny}")
        time.sleep(0.85)

        # DEBUG
        logger.debug("[IMG] detalhes(%s) tipo: %s", id_tiny, type(resp_details).__name__)
        data = resp_details.get("produto", resp_details) if isinstance(resp_details, dict) else {}
        anexos = (data or {}).get("anexos") or []
        logger.debug("[IMG] anexos (1º): %s", anexos[:1])  # só o primeiro p/ não poluir

        for ax in anexos:
            url = (ax or {}).get("url") or ""
            if url:
                return url
        return ""

    def get_prod_data_tiny(self, agendamento:Agendamento = None):
        for produto in agendamento.produtos:
            resp = self.caller.make_call('produtos', params_add={'codigo': produto.sku})
            time.sleep(0.85)

            # DEBUG
            if isinstance(resp, dict):
                logger.debug("[TINY] produtos?codigo=%r → tipo %s", produto.sku, type(resp).__name__)
                logger.debug("[TINY] keys: %s", list(resp.keys()))

            if isinstance(resp, dict) and 'itens' in resp:
                itens = resp['itens'] or []
                alvo = None

                if len(itens) == 1:
                    alvo = itens[0]
                elif len(itens) > 1:
                    alvo = next((i for i in itens if i.get('situacao') == 'A'), itens[0])

                if alvo:
                    # setar campos básicos
                    produto.set_gtin(alvo.get('gtin'))
                    produto.set_id_tiny(alvo.get('id'))
                    produto.set_is_kit(alvo.get('tipo'))

                    logger.debug("[TINY] itens.len: %s", len(resp.get('itens', [])))

                    # 🚀 NOVO: buscar imagem pelo id_tiny e setar no produto
                    try:
                        tried_fetch = False
                        img_url = None
                        if not getattr(produto, "imagem_url", None):
                            tried_fetch = True
                            img_url = self._get_tiny_image_by_id(produto.id_tiny)

                        if img_url:
                            if hasattr(produto, "set_imagem_url"):
                                produto.set_imagem_url(img_url)
                            else:
                                produto.imagem_url = img_url
                            logger.debug("[IMG] URL definida no produto: %s", img_url)
                        else:
                            if tried_fetch:
                                logger.info("[IMG] Sem anexo/imagem no Tiny para %s (id %s)", produto.sku, produto.id_tiny)
                            else:
                                logger.debug("[IMG] Já havia imagem para %s; não buscou.", produto.sku)

                    except Exception as e:
                        logger.error("[IMG] Falha ao obter imagem para %s: %s", produto.sku, e)
                if not alvo:
                    logger.info("[TINY] SKU %s não encontrado/ativo", produto.sku)
                    continue
            else:
                logger.warning("[TINY] Resposta inesperada para produtos?codigo=%s: %s", produto.sku, resp)

                
    def get_comp_data_tiny(self, agendamento: Agendamento = None):
        composicoes_dict = self.get_all_composicoes_grouped(agendamento)
        for id_tiny in composicoes_dict:
            resp = self.caller.make_call(f'produtos/{id_tiny}')
            time.sleep(0.85)

            if not isinstance(resp, dict):
                logger.warning("AVISO: Falha ao buscar dados da composição com id_tiny %s. Resposta: %s", id_tiny, resp)
                continue

            data = resp.get('produto', resp)

            gtin_value   = (data or {}).get('gtin')
            estoque_info = (data or {}).get('estoque')

            # 🔥 NOVO: pega a 1ª imagem dos anexos (se houver)
            imagem_url = ""
            try:
                anexos = (data or {}).get("anexos") or []
                for ax in anexos:
                    url = (ax or {}).get("url") or ""
                    if url:
                        imagem_url = url
                        break
            except Exception as e:
                logger.debug("[COMP IMG] Falha ao ler anexos para id_tiny %s: %s", id_tiny, e)

            # aplica em TODAS as comps com o mesmo id_tiny
            for composicao in composicoes_dict[id_tiny]:
                composicao.set_gtin(gtin_value if gtin_value is not None else '')

                if estoque_info and isinstance(estoque_info, dict):
                    composicao.set_estoque_tiny(estoque_info.get('quantidade', 0) or 0)
                    composicao.set_localizacao(estoque_info.get('localizacao', '') or '')
                else:
                    composicao.set_estoque_tiny(0)
                    composicao.set_localizacao('Indefinido')

                # 🔥 NOVO: guardar a URL da imagem na composição (para ir ao INSERT)
                if imagem_url:
                    if hasattr(composicao, "set_imagem_url"):
                        composicao.set_imagem_url(imagem_url)
                    else:
                        # fallback seguro caso não tenha setter no model
                        composicao.imagem_url = imagem_url

    def set_id_bd_for_all(self, agendamento:Agendamento = None, last_id_agend:int = 0):
        agendamento.set_id_bd(last_id_agend)
        agendamento.set_id_agend_for_produtos()

    def get_all_composicoes_grouped(self, agendamento:Agendamento = None) -> dict:
        composicoes_dict = {}
        
        for produto in agendamento.produtos:
            for composicao in produto.composicoes:
                key = composicao.id_tiny
                
                if key in composicoes_dict:
                    composicoes_dict[key].append(composicao)
                else:
                    composicoes_dict[key] = [composicao]
        
        return composicoes_dict
    
    def return_all_produtos_from_agendamento(self, agendamento:Agendamento = None):
        return self.db_controller.get_all_produtos_from_agendamento(agendamento.id_bd)

    def return_all_composicoes_from_produto(self, produto:Produto = None):
        return self.db_controller.get_all_composicoes_from_produto(produto.id_bd)

    def return_comp_grouped(self, agendamento: Agendamento = None) -> list[JoinedComposicao]:
        composicoes_dict = {}
        
        for produto in agendamento.produtos:
            for composicao in produto.composicoes:
                # Usando SKU como chave para agrupamento (pode ser id_tiny ou outro campo único)
                key = composicao.sku
                
                if key in composicoes_dict:
                    # Se já existe, soma as unidades
                    existing = composicoes_dict[key]
                    existing.unidades_totais += composicao.unidades_totais
                    existing.insert_comp_origem(composicao)
                    existing.insert_produto_origem(produto)
                else:
                    # Se não existe, adiciona ao dicionário
                    composicoes_dict[key] = JoinedComposicao(composicao.sku, composicao.id_tiny, composicao.estoque_tiny)
                    composicoes_dict[key].unidades_totais += composicao.unidades_totais
                    composicoes_dict[key].insert_comp_origem(composicao)
                    composicoes_dict[key].insert_produto_origem(produto)
        
        return list(composicoes_dict.values())
    
    def set_error_flags_composicoes(self, agendamento:Agendamento = None):
        comp_list:list[Composicao] = self.return_comp_grouped(agendamento)
        for i in comp_list:
            i.set_flag_in_joined_comp()
        for i in agendamento.produtos:
            i.set_estoque_error_flag()

    def _restaurar_historico_transacoes(self, id_agend_bd: int, snap: dict):
        """
        Reinsere histórico (alteracoes/compras) casando pelas chaves estáveis.
        Ignora entradas sem correspondência (produto/comp não existe mais).
        """
        if not snap:
            return

        # Mapa de produtos novos: por id_prod_ml e por sku
        produtos_bd = self.db_controller.get_all_produtos_from_agendamento(id_agendamento=id_agend_bd) or []
        prod_by_ml = {}
        prod_by_sku = {}
        for p in produtos_bd:
            # p = (id_prod, id_agend_prod, id_prod_ml, sku_prod, ...)
            id_prod = p[0]
            id_prod_ml = p[2]
            sku_prod = p[3]
            if id_prod_ml:
                prod_by_ml[str(id_prod_ml)] = id_prod
            if sku_prod:
                prod_by_sku[str(sku_prod)] = id_prod

        # Mapa de comps novas
        comps_bd = self.db_controller.get_all_composicoes_from_agendamento(id_agend_bd=id_agend_bd) or []
        comp_by_full = {}   # (id_prod_ml, sku_comp, id_comp_tiny) -> id_comp
        comp_by_loose = {}  # (sku_comp, id_comp_tiny) -> id_comp (fallback)
        for c in comps_bd:
            # c = (id_comp, id_prod_comp, id_prod_ml, sku_prod, sku_comp, id_comp_tiny)
            id_comp = c[0]
            id_prod_ml = c[2]
            sku_comp = c[4]
            id_comp_tiny = c[5]
            if id_prod_ml and sku_comp and id_comp_tiny is not None:
                comp_by_full[(str(id_prod_ml), str(sku_comp), int(id_comp_tiny))] = id_comp
            if sku_comp and id_comp_tiny is not None:
                comp_by_loose[(str(sku_comp), int(id_comp_tiny))] = id_comp

        # Reinsere ALTERAÇÕES
        alteracoes_in = []
        for row in (snap.get("alteracoes") or []):
            # (id_prod_ml, sku_prod, sku_comp, id_comp_tiny, id_tiny, gtin_alt, sku_alt, nome_alt)
            id_prod_ml, sku_prod, sku_comp, id_comp_tiny, id_tiny, gtin_alt, sku_alt, nome_alt = row

            id_prod_new = prod_by_ml.get(str(id_prod_ml)) or prod_by_sku.get(str(sku_prod))
            if not id_prod_new:
                continue

            id_comp_new = None
            if sku_comp and id_comp_tiny is not None and id_prod_ml:
                id_comp_new = comp_by_full.get((str(id_prod_ml), str(sku_comp), int(id_comp_tiny)))
            if not id_comp_new and sku_comp and id_comp_tiny is not None:
                id_comp_new = comp_by_loose.get((str(sku_comp), int(id_comp_tiny)))

            if not id_comp_new:
                continue

            alteracoes_in.append((id_comp_new, id_prod_new, id_tiny, gtin_alt, sku_alt, nome_alt))

        if alteracoes_in:
            self.db_controller.insert_alteracao_in_bd(alteracoes_in)

        # Reinsere COMPRAS
        compras_in = []
        for row in (snap.get("compras") or []):
            # (id_prod_ml, sku_prod, sku_comp, id_comp_tiny, id_tiny, gtin_compra, sku_compra, nome_compra, quant_comprar)
            id_prod_ml, sku_prod, sku_comp, id_comp_tiny, id_tiny, gtin_compra, sku_compra, nome_compra, quant_comprar = row

            id_prod_new = prod_by_ml.get(str(id_prod_ml)) or prod_by_sku.get(str(sku_prod))
            if not id_prod_new:
                continue

            id_comp_new = None
            if sku_comp and id_comp_tiny is not None and id_prod_ml:
                id_comp_new = comp_by_full.get((str(id_prod_ml), str(sku_comp), int(id_comp_tiny)))
            if not id_comp_new and sku_comp and id_comp_tiny is not None:
                id_comp_new = comp_by_loose.get((str(sku_comp), int(id_comp_tiny)))

            if not id_comp_new:
                continue

            compras_in.append((id_comp_new, id_prod_new, id_tiny, gtin_compra, sku_compra, nome_compra, quant_comprar))

        if compras_in:
            self.db_controller.insert_compras_in_bd(compras_in)

    def update_empresa_colaborador_bd(self, agendamento:Agendamento = None):
        self.db_controller.update_empresa_colaborador_agend(agendamento.id_bd, agendamento.id_mktp, agendamento.empresa, agendamento.colaborador)
    

    def update_agendamento(self, agendamento:Agendamento = None):
        self.db_controller.update_agendamento(agendamento.id_bd, agendamento.id_agend_ml, agendamento.id_tipo, agendamento.empresa, agendamento.id_mktp, agendamento.colaborador, agendamento.centro_distribuicao)

    def update_quant_compra(self, id_comp:int = 0, quant:int = 0):
        self.db_controller.update_quant_total_compras(id_comp, quant)
        self.db_controller.clean_compras(id_comp)

    def return_agend_in_dict(self, agendamento:Agendamento = None):
        return agendamento.to_dict()
    
    def return_produtos_agend_in_dict(self, agendamento:Agendamento = None):
        return [i.to_dict() for i in agendamento.produtos]
    
    def return_comp_produtos_in_dict(self, produto:Produto = None):
        return [i.to_dict() for i in produto.composicoes]
    
    def return_comp_produtos_in_dict_for_api(self, produto:Produto = None, attrs:list = []):
        return [i.to_dict_for_api(attrs) for i in produto.composicoes]
    
    def return_all_in_dict(self, agendamento:Agendamento = None):
        temp_dict = self.return_agend_in_dict(agendamento)
        temp_dict['produtos'] = self.return_produtos_agend_in_dict(agendamento)
        for produto in temp_dict['produtos']:
            produto['composicao'] = self.return_comp_produtos_in_dict(self.search_produto(agendamento, 'id_bd', str(produto['id_bd'])))
        return temp_dict
    
    def return_joined_agend_in_dict(self, joined_agend:JoinedAgendamento = None):
        joined_agend_list = []
        for agendamento in joined_agend.agend_origem:
            joined_agend_list.append(self.return_all_in_dict(agendamento))
        return joined_agend_list
    
    def return_agend_in_tuple(self, agendamento:Agendamento = None):
        return agendamento.to_tuple()
    
    def return_produtos_agend_in_tuple(self, agendamento:Agendamento = None):
        return [i.to_tuple() for i in agendamento.produtos]
    
    def return_comp_produtos_in_tuple(self, produto:Produto = None):
        return [i.to_tuple() for i in produto.composicoes]
    
    def return_all_composicoes_to_tuple(self, agendamento:Agendamento = None):
        temp_list = []
        for produto in agendamento.produtos:
            temp_list += produto.return_composicao_in_tuple()
        return temp_list
    
    def return_composicoes_to_alteracao(self, comp_list:list[Composicao] = []):
        return [i.to_tuple_alteracao() for i in comp_list]

    def clear_agendamentos(self):
        self.agendamentos = []

    def test_connection(self):
        return self.db_controller.test_connection()
    
    
    def update_pdf_agendamento(self, 
                               id_bd: int, 
                               colaborador: str, 
                               empresa: int, 
                               id_mktp: int, 
                               id_tipo: int, 
                               pdf_path: str, 
                               new_id_agend_ml: str, 
                               centro_distribuicao: Optional[str] = None):
        try:
            # 1) carrega todos os agendamentos do DB em memória
            self.create_agendamento_from_bd_data()
            agendamento_original = self.search_agendamento("id_bd", str(id_bd))
            if not agendamento_original:
                return False, f"Agendamento com id_bd={id_bd} não encontrado."

            # --- INÍCIO DA CORREÇÃO ---
            # Guarda o centro de distribuição original antes de qualquer modificação
            centro_final = centro_distribuicao if centro_distribuicao is not None else agendamento_original.centro_distribuicao
            # --- FIM DA CORREÇÃO ---

            # 2) atualiza meta-dados em memória, incluindo o novo número do pedido
            agendamento_original.id_agend_ml = new_id_agend_ml
            agendamento_original.set_colaborador(colaborador)
            agendamento_original.set_empresa(empresa)
            agendamento_original.set_mktp(id_mktp)
            agendamento_original.set_tipo(id_tipo)
            # --- CORREÇÃO ---
            # Usa o valor original que acabamos de guardar
            agendamento_original.set_centro(centro_final)

            # 3) SNAPSHOTS (histórico de transações + histórico de transferência Conf/Exp)
            snap_hist = self.db_controller.snapshot_historico_transacoes(id_bd)
            snap_transf = self.db_controller.snapshot_hist_transferencia(id_bd)

            # limpa tabelas filhas que dependem de id_prod antigo (pra não sobrar lixo/orfão)
            self.db_controller.limpar_historico_transacoes(id_bd)

            # 3.1) RESET total - comp_agend e produtos_agend
            self.db_controller.delete_composicoes_by_agendamento(id_bd)
            self.db_controller.delete_produtos_by_agendamento(id_bd)

            # 4) reprocessa o PDF usando o novo id_agend_ml
            self.create_agendamento_from_pdf(
                pdf_path=pdf_path,
                id_agend_ml=new_id_agend_ml,
                id_tipo=id_tipo,
                empresa=empresa,
                id_mktp=id_mktp,
                # --- CORREÇÃO ---
                # Passa o valor original para o novo agendamento que será criado
                centro_distribuicao=centro_final,
                colaborador=colaborador
            )
            novo = self.agendamentos[-1]
            # mantém o mesmo id_bd
            self.set_id_bd_for_all(novo, id_bd)

            # 5) refaz integração com Tiny e reinserção no banco
            self.get_prod_data_tiny(novo)
            self.get_comp_tiny(novo)
            self.get_comp_data_tiny(novo)
            self.insert_produto_in_bd(novo)
            for tpl in self.return_all_produtos_from_agendamento(novo):
                produto = self.search_produto(novo, 'etiqueta', tpl[2])
                if produto:
                    produto.set_id_bd(tpl[0])
                    produto.set_id_bd_for_composicoes()
            self.set_error_flags_composicoes(novo)
            self.insert_composicao_in_bd(novo)

            # 5.1) RESTAURA histórico de transferência (Conf/Exp) e histórico de transações
            self.db_controller.restore_hist_transferencia(id_bd, snap_transf)
            self._restaurar_historico_transacoes(id_bd, snap_hist)

            # 6) finalmente atualiza o registro de agendamento com o novo número
            self.db_controller.update_agendamento(
                id_agend_bd=novo.id_bd,
                id_agend_ml=novo.id_agend_ml,
                id_agend_tipo=novo.id_tipo,
                empresa=novo.empresa,
                id_mktp=novo.id_mktp,
                colaborador=novo.colaborador,
                # --- CORREÇÃO ---
                # Garante que o valor final salvo no banco é o correto
                centro_distribuicao=novo.centro_distribuicao
            )

            return True, "Atualizado com sucesso."

        except Exception as e:
            return False, f"Erro ao atualizar agendamento: {str(e)}"

    def update_excel_agendamento(
        self,
        id_bd: int,
        colaborador: str,
        empresa: int,
        id_mktp: int,
        id_tipo: int,
        excel_path: str,
        centro_distribuicao: Optional[str] = None,
        fonte_dados: str = "db",   # <-- NOVO: "db" ou "tiny"
        pg_pool=None,             # <-- NOVO: obrigatório quando fonte_dados="db"
    ):
        """
        Atualiza um agendamento (Shopee / Excel) a partir de uma nova planilha,
        mantendo o mesmo número de pedido (id_agend_ml) já existente no banco.

        fonte_dados:
          - "tiny": busca id_tiny/gtin/imagens/composição direto no Tiny
          - "db":  busca em tiny.produtos e tiny.composicoes no PostgreSQL
        """
        try:
            # 1) Carrega agendamentos do BD em memória
            self.create_agendamento_from_bd_data()
            agendamento_original = self.search_agendamento("id_bd", str(id_bd))
            if not agendamento_original:
                return False, f"Agendamento com id_bd={id_bd} não encontrado."

            # 2) Mantém o número de pedido original
            original_id_agend_ml = agendamento_original.id_agend_ml

            # 3) Atualiza meta-dados em memória (SEM trocar o número do pedido)
            agendamento_original.colaborador = colaborador
            agendamento_original.empresa = empresa
            agendamento_original.id_mktp = id_mktp
            agendamento_original.id_tipo = id_tipo

            centro_final = (
                centro_distribuicao
                if centro_distribuicao is not None
                else agendamento_original.centro_distribuicao
            )
            agendamento_original.centro_distribuicao = centro_final

            # 4) SNAPSHOTS (histórico de transações + histórico de transferência Conf/Exp)
            snap_hist = self.db_controller.snapshot_historico_transacoes(id_bd)
            snap_transf = self.db_controller.snapshot_hist_transferencia(id_bd)

            # limpa tabelas filhas que dependem de id_prod antigo
            self.db_controller.limpar_historico_transacoes(id_bd)

            # 4.1) RESET total
            self.db_controller.delete_composicoes_by_agendamento(id_bd)
            self.db_controller.delete_produtos_by_agendamento(id_bd)

            # 5) Recria o agendamento EM MEMÓRIA a partir do Excel
            novo = self.create_agendamento_from_excel(
                excel_path=excel_path,
                id_tipo=id_tipo,
                empresa=empresa,
                id_mktp=id_mktp,
                colaborador=colaborador,
                upload_uuid=original_id_agend_ml,
            )
            novo.centro_distribuicao = centro_final

            # Usa o MESMO id_bd do agendamento original
            self.set_id_bd_for_all(novo, id_bd)

            # 6) Decide fonte de dados (Tiny vs Banco)
            fonte = (fonte_dados or "db").strip().lower()
            if fonte == "tiny":
                self.get_prod_data_tiny(novo)
                self.get_comp_tiny(novo)
                self.get_comp_data_tiny(novo)
            else:
                if not pg_pool:
                    raise Exception("pg_pool não informado (necessário quando fonte_dados='db').")
                self.get_prod_data_pg(novo, pg_pool)
                self.get_comp_pg(novo, pg_pool)

            # 7) Insere produtos novos no BD
            self.insert_produto_in_bd(novo)

            # 8) Recarrega produtos do BD e mapeia id_bd <-> objetos em memória (por SKU)
            produtos_bd = self.return_all_produtos_from_agendamento(novo)

            mapa_produtos_memoria: dict[str, list[Produto]] = {}
            for prod in novo.produtos:
                mapa_produtos_memoria.setdefault(prod.sku, []).append(prod)

            for tpl in produtos_bd:
                if len(tpl) < 5:
                    continue
                id_prod_bd = tpl[0]
                sku_prod_bd = tpl[4]

                if sku_prod_bd in mapa_produtos_memoria and mapa_produtos_memoria[sku_prod_bd]:
                    produto_obj = mapa_produtos_memoria[sku_prod_bd].pop(0)
                    produto_obj.set_id_bd(id_prod_bd)
                    produto_obj.set_id_bd_for_composicoes()

            # 9) FLAGS primeiro, depois INSERT das composições (pra salvar as flags no BD)
            self.set_error_flags_composicoes(novo)
            self.insert_composicao_in_bd(novo)

            # 9.1) RESTAURA histórico de transferência (Conf/Exp) e histórico de transações
            self.db_controller.restore_hist_transferencia(id_bd, snap_transf)
            self._restaurar_historico_transacoes(id_bd, snap_hist)

            # 10) Atualiza as informações do agendamento no BD
            self.db_controller.update_agendamento(
                id_agend_bd=agendamento_original.id_bd,
                id_agend_ml=agendamento_original.id_agend_ml,
                id_agend_tipo=agendamento_original.id_tipo,
                empresa=agendamento_original.empresa,
                id_mktp=agendamento_original.id_mktp,
                colaborador=agendamento_original.colaborador,
                centro_distribuicao=agendamento_original.centro_distribuicao,
            )

            return True, f"Agendamento atualizado com sucesso (Excel) via {fonte}."

        except Exception as e:
            print(f"Erro ao atualizar agendamento (Excel): {e}")
            return False, f"Erro ao atualizar agendamento: {e}"

    # ==========================================================
    #  PostgreSQL (tiny.produtos / tiny.composicoes)
    # ==========================================================
    def get_prod_data_pg(self, agendamento, pg_pool):
        """
        Preenche dados de produto usando Postgres:
          - tabela: tiny.produtos
          - sku: codigo_sku
          - gtin: gtin_ean
          - id_tiny: id
          - imagem: url_imagem_1 (fallback: url_imagem_externa_1)
        """
        if not agendamento or not getattr(agendamento, "produtos", None):
            return
        if not pg_pool:
            raise Exception("PG_POOL não foi passado para get_prod_data_pg().")

        skus = []
        for p in agendamento.produtos:
            sku = (getattr(p, "sku", None) or "").strip()
            if sku:
                skus.append(sku)

        if not skus:
            return

        skus_lc = [s.lower() for s in skus]

        from psycopg2 import OperationalError, InterfaceError

        conn = None
        rows = []

        try:
            for tentativa in (1, 2):
                conn = pg_pool.getconn()
                try:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(
                            """
                            SELECT
                                id,
                                codigo_sku,
                                gtin_ean,
                                tipo_do_produto,
                                estoque,
                                localizacao,
                                COALESCE(NULLIF(url_imagem_1, ''), NULLIF(url_imagem_externa_1, ''), '') AS imagem_url
                            FROM tiny.produtos
                            WHERE lower(codigo_sku) = ANY(%s)
                            """,
                            (skus_lc,)
                        )
                        rows = cur.fetchall() or []

                    break  # ok

                except (OperationalError, InterfaceError) as e:
                    # descarta conexão quebrada
                    try:
                        pg_pool.putconn(conn, close=True)
                    except Exception:
                        pass
                    conn = None

                    if tentativa == 2:
                        raise Exception(f"Falha no Postgres (conexão encerrada). Detalhe: {e}") from e

        finally:
            if conn is not None:
                try:
                    # fecha transação (evita idle in transaction)
                    conn.rollback()
                except Exception:
                    pass
                try:
                    pg_pool.putconn(conn)
                except Exception:
                    pass

        mapa = {}
        for r in rows:
            k = (r.get("codigo_sku") or "").strip().lower()
            if k:
                mapa[k] = r

        for p in agendamento.produtos:
            sku_lc = (getattr(p, "sku", None) or "").strip().lower()
            row = mapa.get(sku_lc)
            if not row:
                continue

            id_tiny = row.get("id")
            gtin = (row.get("gtin_ean") or "").strip()
            tipo = (row.get("tipo_do_produto") or "").strip().upper()
            img = (row.get("imagem_url") or "").strip()

            if hasattr(p, "set_id_tiny"):
                p.set_id_tiny(id_tiny)
            else:
                p.id_tiny = id_tiny

            if hasattr(p, "set_gtin"):
                p.set_gtin(gtin)
            else:
                p.gtin = gtin

            # --- KIT flag ---
            if tipo in ("K", "KIT"):
                if hasattr(p, "set_is_kit"):
                    p.set_is_kit("K")
                else:
                    p.is_kit = "K"
            else:
                # evita "vazar" kit de outro ciclo
                if hasattr(p, "set_is_kit"):
                    try:
                        p.set_is_kit(False)
                    except Exception:
                        pass
                else:
                    p.is_kit = False

            # --- imagem ---
            if img:
                if hasattr(p, "set_imagem_url"):
                    p.set_imagem_url(img)
                else:
                    p.imagem_url = img

            # --- estoque/localizacao (o que faltava) ---
            estoque_raw = row.get("estoque")
            try:
                estoque_val = int(float(estoque_raw or 0))
            except Exception:
                estoque_val = 0

            local_val = (row.get("localizacao") or "").strip()

            # tenta setters; se não existirem, seta atributo direto
            if hasattr(p, "set_estoque_tiny"):
                p.set_estoque_tiny(estoque_val)
            else:
                p.estoque_tiny = estoque_val

            if hasattr(p, "set_localizacao"):
                p.set_localizacao(local_val)
            else:
                p.localizacao = local_val

    def get_comp_pg(self, agendamento, pg_pool):
        """
        Cria composições em memória usando tiny.composicoes
        e já enriquece com dados do tiny.produtos (gtin/estoque/localizacao/imagem).
        """
        if not agendamento or not getattr(agendamento, "produtos", None):
            return
        if not pg_pool:
            raise Exception("PG_POOL não foi informado para get_comp_pg().")

        # kits presentes no agendamento
        kits = []
        for p in agendamento.produtos:
            sku = (getattr(p, "sku", None) or "").strip()
            if not sku:
                continue
            if getattr(p, "is_kit", False):
                kits.append(sku)

        # Para NÃO-KIT: composição simples (1x ele mesmo) COM estoque/localização do produto
        def _to_int(v, default=0):
            try:
                if v is None:
                    return default
                return int(float(v))
            except Exception:
                return default

        for p in agendamento.produtos:
            if not getattr(p, "is_kit", False):
                estoque_val = _to_int(getattr(p, "estoque_tiny", 0), 0)
                local_val = (getattr(p, "localizacao", "") or "").strip()

                self.insert_composicao(
                    produto=p,
                    fk_id_prod=p.id_bd,
                    nome=p.nome,
                    sku=p.sku,
                    id_tiny=p.id_tiny,
                    gtin=p.gtin,
                    unidades_por_kit=1,
                    unidades_de_kits=p.unidades,
                    estoque_tiny=estoque_val,
                    localizacao=local_val,
                    imagem_url=getattr(p, "imagem_url", "") or ''
                )

        if not kits:
            return

        kits_lc = [k.lower() for k in kits]

        from psycopg2 import OperationalError, InterfaceError

        conn = None
        try:
            # tenta 2x: se pegar conexão morta do pool, descarta e tenta outra
            for tentativa in (1, 2):
                conn = pg_pool.getconn()
                try:
                    # 1) Busca linhas de composição
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(
                            """
                            SELECT
                                sku_kit,
                                sku_comp,
                                produto_comp,
                                quantidade_comp,
                                id_comp
                            FROM tiny.composicoes
                            WHERE lower(sku_kit) = ANY(%s)
                            """,
                            (kits_lc,)
                        )
                        comp_rows = cur.fetchall() or []

                    if not comp_rows:
                        return

                    # 2) Busca dados dos componentes no catálogo
                    skus_comp = sorted({
                        (r.get("sku_comp") or "").strip().lower()
                        for r in comp_rows
                        if (r.get("sku_comp") or "").strip()
                    })
                    comp_map = {}

                    if skus_comp:
                        with conn.cursor(cursor_factory=RealDictCursor) as cur:
                            cur.execute(
                                """
                                SELECT
                                    id,
                                    codigo_sku,
                                    descricao,
                                    gtin_ean,
                                    estoque,
                                    localizacao,
                                    COALESCE(NULLIF(url_imagem_1, ''), NULLIF(url_imagem_externa_1, ''), '') AS imagem_url
                                FROM tiny.produtos
                                WHERE lower(codigo_sku) = ANY(%s)
                                """,
                                (skus_comp,)
                            )
                            prows = cur.fetchall() or []
                        for r in prows:
                            k = (r.get("codigo_sku") or "").strip().lower()
                            if k:
                                comp_map[k] = r

                    break  # deu tudo certo, sai do retry

                except (OperationalError, InterfaceError) as e:
                    # conexão morreu: NÃO devolve pro pool como "boa"
                    try:
                        pg_pool.putconn(conn, close=True)
                    except Exception:
                        pass
                    conn = None

                    if tentativa == 2:
                        raise Exception(f"Falha no Postgres (conexão encerrada). Detalhe: {e}") from e
                    # senão: tenta de novo com outra conexão

        finally:
            if conn is not None:
                try:
                    # fecha a transação aberta pelo psycopg2 (mesmo em SELECT)
                    conn.rollback()
                except Exception:
                    pass
                try:
                    pg_pool.putconn(conn)
                except Exception:
                    pass

        # Mapa de produtos do agendamento por SKU
        prod_by_sku = {}
        for p in agendamento.produtos:
            sku = (getattr(p, "sku", None) or "").strip().lower()
            if sku:
                prod_by_sku[sku] = p

        # 3) Cria as composições nos produtos KIT
        def _to_int(v, default=0):
            try:
                if v is None:
                    return default
                # Decimal, str "12.0", etc.
                return int(float(v))
            except Exception:
                return default

        for r in comp_rows:
            sku_kit = (r.get("sku_kit") or "").strip().lower()
            sku_comp_raw = (r.get("sku_comp") or "").strip()
            sku_comp_lc = sku_comp_raw.lower()

            if not sku_kit or not sku_comp_raw:
                continue

            prod_kit = prod_by_sku.get(sku_kit)
            if not prod_kit:
                continue

            qtd = _to_int(r.get("quantidade_comp"), 0)

            comp_info = comp_map.get(sku_comp_lc)

            if not comp_info:
                logger.warning(
                    "[PG COMP] Não achei sku_comp=%r no tiny.produtos.codigo_sku. (kit=%r)",
                    sku_comp_raw, r.get("sku_kit")
                )

            id_tiny_comp = (comp_info.get("id") if comp_info else None) or r.get("id_comp") or ""
            gtin_comp    = ((comp_info.get("gtin_ean") if comp_info else "") or "").strip()
            estoque_comp = _to_int((comp_info.get("estoque") if comp_info else None), 0)
            local_comp   = ((comp_info.get("localizacao") if comp_info else "") or "").strip()
            img_comp     = ((comp_info.get("imagem_url") if comp_info else "") or "").strip()
            nome_comp    = ((r.get("produto_comp") or (comp_info.get("descricao") if comp_info else "") or "")).strip()

            self.insert_composicao(
                produto=prod_kit,
                fk_id_prod=prod_kit.id_bd,
                nome=nome_comp,
                sku=sku_comp_raw,               # mantém original
                id_tiny=str(id_tiny_comp),
                gtin=gtin_comp,
                unidades_por_kit=qtd,
                unidades_de_kits=prod_kit.unidades,
                estoque_tiny=estoque_comp,      # <-- AGORA é int garantido
                localizacao=local_comp,
                imagem_url=img_comp
            )

    def get_comp_tiny(self, agendamento: Agendamento = None):
        """
        Busca as composições (kits) dos produtos do agendamento no Tiny.
        Tenta /produtos/{id}/kit; se vier vazio, faz fallback para /produtos/{id}
        procurando por 'composicoes' / 'estrutura' / 'componentes'.
        """
        for produto in agendamento.produtos:
            # Se NÃO for kit, cria composição simples (1x o próprio produto)
            if not getattr(produto, "is_kit", False):
                self.insert_composicao(
                    produto,
                    fk_id_prod=produto.id_bd,
                    nome=produto.nome,
                    sku=produto.sku,
                    id_tiny=produto.id_tiny,
                    gtin=produto.gtin,
                    unidades_por_kit=1,
                    unidades_de_kits=produto.unidades
                )
                continue

            itens_norm = []

            # 1) Tenta endpoint oficial de kit
            try:
                resp_kit = self.caller.make_call(f"produtos/{produto.id_tiny}/kit")
                time.sleep(0.85)
                if isinstance(resp_kit, list):
                    itens_norm = resp_kit
                elif isinstance(resp_kit, dict) and isinstance(resp_kit.get("itens"), list):
                    itens_norm = resp_kit["itens"]
            except Exception as e:
                logger.warning("[KIT] Falha em /kit para %s: %s", produto.sku, e)

            # 2) Fallback: pega do detalhe do produto
            if not itens_norm:
                try:
                    resp_det = self.caller.make_call(f"produtos/{produto.id_tiny}")
                    time.sleep(0.85)
                    data = resp_det.get("produto", resp_det) if isinstance(resp_det, dict) else {}

                    # a) Novo modelo: 'composicoes' -> [{ item_composicao: {..., quantidade } }]
                    composicoes = data.get("composicoes") or []
                    for comp in (composicoes if isinstance(composicoes, list) else []):
                        item = (comp or {}).get("item_composicao") or {}
                        if item:
                            itens_norm.append({
                                "produto": {
                                    "id": item.get("id"),
                                    "sku": item.get("codigo") or item.get("sku"),
                                    "descricao": item.get("descricao"),
                                },
                                "quantidade": item.get("quantidade", 1),
                            })

                    # b) Algumas contas expõem como 'estrutura' ou 'componentes'
                    if not itens_norm:
                        estrutura = data.get("estrutura") or {}
                        lista_estrutura = estrutura.get("itens") if isinstance(estrutura, dict) else None
                        candidatos = (
                            lista_estrutura if isinstance(lista_estrutura, list)
                            else data.get("componentes") if isinstance(data.get("componentes"), list)
                            else []
                        )
                        for it in candidatos:
                            # normaliza os campos comuns
                            prod_blob = it.get("produto", {}) if isinstance(it, dict) else {}
                            itens_norm.append({
                                "produto": {
                                    "id": prod_blob.get("id"),
                                    "sku": prod_blob.get("codigo") or prod_blob.get("sku"),
                                    "descricao": prod_blob.get("descricao") or prod_blob.get("nome"),
                                },
                                "quantidade": it.get("quantidade", 1),
                            })
                except Exception as e:
                    logger.warning("[KIT] Fallback detalhe falhou p/ %s: %s", produto.sku, e)

            # 3) Se ainda assim não achou, loga e segue
            if not itens_norm:
                logger.info("[KIT] Nenhuma composição encontrada p/ %s (id %s).",
                            produto.sku, produto.id_tiny)
                continue

            # 4) Cria as composições normalizadas
            for r in itens_norm:
                prod_r = r.get("produto") or {}
                q = r.get("quantidade", 1)
                try:
                    q = int(float(q))
                except Exception:
                    q = 1

                self.insert_composicao(
                    produto,
                    fk_id_prod=produto.id_bd,  # será corrigido depois por set_id_bd_for_composicoes()
                    nome=prod_r.get("descricao", ""),
                    sku=prod_r.get("sku", "") or prod_r.get("codigo", ""),
                    id_tiny=str(prod_r.get("id") or ""),
                    gtin="",  # GTIN e estoque virão no get_comp_data_tiny()
                    unidades_por_kit=q,
                    unidades_de_kits=produto.unidades
                )

            logger.debug("[KIT] %s → %d itens de composição.", produto.sku, len(produto.composicoes))

    def insert_agendamento_in_bd(self, agendamento: Agendamento):
        if self.db_controller.exists_agendamento_ml(agendamento.id_agend_ml):
            self.view.show_error(f"Já existe um agendamento com o número {agendamento.id_agend_ml}.")
            return False
        self.db_controller.insert_agendamento_in_bd(agendamento.to_tuple())
        return True

    def get_product_image_url(self, sku: str) -> str:
        """
        Busca a URL da imagem de um produto no Tiny a partir do SKU.
        Retorna uma string vazia se não encontrar.
        """
        imagem_url = ""
        if not sku:
            return imagem_url
            
        try:
            # Etapa 1: Buscar o ID do produto pelo SKU, considerando apenas produtos ativos
            params = {'codigo': sku, 'situacao': 'A'}
            resp_sku = self.caller.make_call("produtos", params_add=params)
            time.sleep(0.85)

            if resp_sku.get('itens') and len(resp_sku['itens']) > 0:
                id_tiny = resp_sku['itens'][0].get('id')
                
                if id_tiny:
                    # Etapa 2: Buscar os detalhes do produto pelo ID
                    resp_details = self.caller.make_call(f"produtos/{id_tiny}")
                    time.sleep(0.85)
                    
                    # Etapa 3: Extrair a URL do primeiro anexo, se existir
                    data = resp_details.get('produto', resp_details) if isinstance(resp_details, dict) else {}
                    anexos = (data or {}).get('anexos') or []
                    if anexos:
                        imagem_url = (anexos[0] or {}).get('url', "")
        except Exception as e:
            # Em um ambiente de produção, seria ideal logar este erro
            logger.exception("Erro ao buscar imagem para SKU %s", sku)
            return "" # Retorna vazio em caso de qualquer erro
            
        return imagem_url

    def excluir_agendamento_completo(self, id_agend_bd: int) -> bool:
        """
        Orquestra a exclusão de um agendamento e todos os seus dados relacionados.
        """
        try:
            self.db_controller.delete_agendamento_completo(id_agend_bd)
            return True
        except Exception as e:
            logger.exception("Erro ao excluir agendamento completo (ID: %s)", id_agend_bd)
            return False
    
    # --- EXPEDIÇÃO: iniciar/finalizar ---
    def iniciar_expedicao(self, id_agend_bd: int) -> datetime:
        """
        Marca o início da expedição no BD (se ainda não marcado) e
        retorna o timestamp usado.
        """
        if not self.db_controller:
            raise RuntimeError("DatabaseController não configurado no AgendamentoController.")

        # Usa timezone do servidor; ajuste se preferir tz explícita
        ts = datetime.now()
        # Atualiza se estiver nulo (sua query já tem '... IS NULL')
        self.db_controller.update_expedicao_inicio(id_agend_bd)
        return ts

    def finalizar_expedicao(self, id_agend_bd: int):
        agendamento = self.search_agendamento("id_bd", str(id_agend_bd))
        if not agendamento:
            # Se não estiver em memória, carrega do banco
            self.insert_agendamento(id_bd=id_agend_bd)
            agendamento = self.get_last_made_agendamento()
            self.create_agendamento_from_bd_data(agendamento)
        
        agendamento.set_tipo(2) # 2 = Finalizado
        self.update_agendamento(agendamento)
        self.db_controller.update_expedicao_fim(id_agend_bd)
    
    def gerar_e_salvar_relatorio_expedicao(self, agendamento_obj):
        """
        Busca o relatório de conferência, adiciona os dados da expedição
        e salva o relatório final e completo no banco de dados.
        """
        if not agendamento_obj:
            return

        # 1. Busca o relatório de conferência existente
        relatorio_str = self.db_controller.get_relatorio_by_agendamento_ml(agendamento_obj.id_agend_ml)
        
        # Converte o JSON para um dicionário Python. Se não existir, começa com um vazio.
        payload = json.loads(relatorio_str) if relatorio_str else {}

        # 2. Adiciona/Atualiza as informações da expedição
        inicio_exp = agendamento_obj.expedicao_inicio
        fim_exp = datetime.now() # O fim é o momento atual

        # Calcula a duração da expedição
        duracao_exp_str = "Não iniciado"
        if inicio_exp:
            duracao = fim_exp - inicio_exp
            duracao_exp_str = f"{duracao.seconds//3600:02d}h {(duracao.seconds%3600)//60:02d}m {duracao.seconds%60:02d}s"

        # Adiciona uma nova seção ao relatório para a expedição
        payload['InformacoesExpedicao'] = {
            "DataInicioExpedicao": inicio_exp.strftime("%d/%m/%Y %Hh %Mm %Ss") if inicio_exp else "Não registrado",
            "DataTerminoExpedicao": fim_exp.strftime("%d/%m/%Y %Hh %Mm %Ss"),
            "DuracaoExpedicao": duracao_exp_str
        }

        # 3. Adiciona os detalhes das caixas ao relatório
        caixas_data = self.db_controller.get_caixas_by_agendamento_ml(agendamento_obj.id_agend_ml)
        payload['RelatorioExpedicao'] = {
            "TotalCaixas": len(caixas_data),
            "Caixas": caixas_data # Salva a lista completa de caixas e seus itens
        }

        # Garante que as informações gerais também estejam presentes, caso não exista relatório anterior
        if 'Informacoes' not in payload:
            payload['Informacoes'] = {
                "Agendamento": agendamento_obj.id_agend_ml,
                "Empresa": {1:"Jaú Pesca",2:"Jaú Fishing",3:"L.T. Sports"}.get(agendamento_obj.empresa, ""),
            }
        if 'Colaboradores' not in payload:
            payload['Colaboradores'] = [{"Colaborador": agendamento_obj.colaborador}]


        # 4. Converte o dicionário completo de volta para uma string JSON
        relatorio_final_json = json.dumps(payload, ensure_ascii=False, indent=4) # indent=4 para facilitar a leitura no BD

        # 5. Salva o relatório final no banco de dados
        self.db_controller.salvar_relatorio(agendamento_obj.id_agend_ml, relatorio_final_json)