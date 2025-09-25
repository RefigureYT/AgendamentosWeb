from classes.models import Agendamento, Produto, Composicao, JoinedComposicao, JoinedAgendamento
from classes.views import AgendamentoView
from classes.services import PdfService, SpreadsheetService
from .DatabaseController import DatabaseController
from datetime import datetime
import time
from base_jp_lab import Caller
from uuid import uuid4

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

    def insert_agendamento_in_bd(self, agendamento:Agendamento = None):
        self.db_controller.insert_agendamento_in_bd(agendamento.to_tuple())

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
                        estoque_error_flag:str = ''):
        composicao = Composicao(id_bd=id_bd, fk_id_prod=fk_id_prod, nome=nome, sku=sku, prod_sku=produto.sku, id_tiny=id_tiny, gtin=gtin, prod_gtin=produto.gtin, unidades_por_kit=unidades_por_kit, unidades_de_kits=unidades_de_kits, estoque_tiny=estoque_tiny, localizacao=localizacao, estoque_error_flag=estoque_error_flag)
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
                                    centro_distribuicao: None) -> Agendamento:
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
            for row in rows:
                # --- fluxo Excel (.xlsx/.xls) ---
                if 'sku_variacao' in row:
                    sku       = row['sku_variacao'] if row['sku_variacao'] != '-' else (row.get('sku_principal') or 'SKU não encontrado')
                    nome      = row.get('produto', '')
                    unidades  = int(row.get('unidades', 0))
                    id_ml     = str(row.get('item_id', ''))
                # --- fluxo CSV Magalu (.csv) ---
                elif 'sku' in row:
                    sku       = row['sku']
                    nome      = row.get('produto', '')
                    unidades  = int(row.get('unidades', 0))
                    id_ml     = ''
                else:
                    # linha inesperada: pula
                    continue

                produto = Produto(
                    id_ml     = id_ml,
                    nome      = nome,
                    sku       = sku,
                    unidades  = unidades
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
                                        estoque_error_flag=comp_bd[10])
                    
    def create_agendamento_for_alteracao(self):
        db_resp = self.db_controller.get_all_agendamentos_in_alteracoes()
        for resp in db_resp:
            self.insert_agendamento(resp[0], resp[1], resp[2], resp[3], resp[4], resp[5], resp[6])
            agendamento = self.get_last_made_agendamento()

            produtos = self.get_produtos_from_alteracoes(agendamento)
            print(produtos)
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
                                        estoque_error_flag=comp_bd[9])
                    
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
                                        estoque_error_flag=comp_bd[9])
                    
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
        return self.agendamentos[-1]
    
    def get_last_made_agendamento_in_bd(self):
        return self.db_controller.get_last_agendamento()

    def get_agendamento_by_id(self, agendamento:Agendamento = None):
        return self.db_controller.get_agendamento_by_bd_id(agendamento.id_bd)

    def get_prod_data_tiny(self, agendamento:Agendamento = None):
        for produto in agendamento.produtos:
            # Faz a chamada à API
            resp = self.caller.make_call('produtos', params_add={'codigo': produto.sku})
            time.sleep(1.25)

            # --- CORREÇÃO INÍCIO ---
            # Verifica se a resposta é um dicionário e se contém a chave 'itens'
            if isinstance(resp, dict) and 'itens' in resp:
                itens = resp['itens']
                if len(itens) == 1 : 
                    produto.set_gtin(itens[0].get('gtin'))
                    produto.set_id_tiny(itens[0].get('id'))
                    produto.set_is_kit(itens[0].get('tipo'))
                elif len(itens) > 1:
                    item_ativo = next((i for i in itens if i.get('situacao') == 'A'), None)
                    if item_ativo is not None:
                        produto.set_gtin(item_ativo.get('gtin'))
                        produto.set_id_tiny(item_ativo.get('id'))
                        produto.set_is_kit(item_ativo.get('tipo'))
            else:
                # Se a chamada falhou, loga um aviso e continua para o próximo produto
                print(f"AVISO: Falha ao buscar dados do produto com SKU {produto.sku} no Tiny. Resposta: {resp}")
            # --- CORREÇÃO FIM ---


    def get_comp_tiny(self, agendamento:Agendamento = None):
        for produto in agendamento.produtos:
            if produto.is_kit:
                resp = self.caller.make_call(f'produtos/{produto.id_tiny}/kit')
                time.sleep(1.25)
                for r_comp in resp:
                    self.insert_composicao(produto, fk_id_prod=produto.id_bd, nome=r_comp['produto']['descricao'], sku=r_comp['produto']['sku'], id_tiny=r_comp['produto']['id'], unidades_por_kit=r_comp['quantidade'], unidades_de_kits=produto.unidades)
            else:
                self.insert_composicao(produto, 0, produto.id_bd, produto.nome, produto.sku, produto.id_tiny, produto.gtin, 1, produto.unidades, 0, '')


    def get_comp_data_tiny(self, agendamento:Agendamento = None):
        composicoes_dict = self.get_all_composicoes_grouped(agendamento)
        for id_tiny in composicoes_dict:
            resp = self.caller.make_call(f'produtos/{id_tiny}')
            time.sleep(1.25)
            
            # --- CORREÇÃO INÍCIO ---
            # Verifica se a resposta da API foi bem-sucedida (é um dicionário)
            if not isinstance(resp, dict):
                print(f"AVISO: Falha ao buscar dados da composição com id_tiny {id_tiny}. Resposta: {resp}")
                # Pula para a próxima iteração do loop
                continue

            gtin_value = resp.get('gtin')
            estoque_info = resp.get('estoque')

            # Aplica os valores para todas as composições com o mesmo id_tiny
            for composicao in composicoes_dict[id_tiny]:
                composicao.set_gtin(gtin_value if gtin_value is not None else '')

                if estoque_info:
                    composicao.set_estoque_tiny(estoque_info.get('quantidade', 0))
                    composicao.set_localizacao(estoque_info.get('localizacao', ''))
                else:
                    composicao.set_estoque_tiny(0)
                    composicao.set_localizacao('Indefinido')
            # --- CORREÇÃO FIM ---

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
    
    def return_all_produtos_from_agendamento(self, agendamento:Agendamento = None):\
        return self.db_controller.get_all_produtos_from_agendamento(agendamento.id_bd)

    def return_all_composicoes_from_produto(self, produto:Produto = None):
        return self.db_controller.get_all_composicoes_from_produto(produto.id_bd)

    def return_comp_grouped(self, agendamento:Agendamento = None) -> list[Composicao]:
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

    def update_empresa_colaborador_bd(self, agendamento:Agendamento = None):
        self.db_controller.update_empresa_colaborador_agend(agendamento.id_bd, agendamento.empresa, agendamento.colaborador)
    

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
    
    
    def update_pdf_agendamento(self, id_bd: int, colaborador: str, empresa: int, id_mktp: int, id_tipo: int, pdf_path: str, new_id_agend_ml: str, centro_distribuicao: None):
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

            # 3) limpa produtos e composições antigas do banco
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
            time.sleep(1.25)

            if resp_sku.get('itens') and len(resp_sku['itens']) > 0:
                id_tiny = resp_sku['itens'][0].get('id')
                
                if id_tiny:
                    # Etapa 2: Buscar os detalhes do produto pelo ID
                    resp_details = self.caller.make_call(f"produtos/{id_tiny}")
                    time.sleep(1.25)
                    
                    # Etapa 3: Extrair a URL do primeiro anexo, se existir
                    if resp_details.get('anexos') and len(resp_details['anexos']) > 0:
                        print(resp_details)
                        imagem_url = resp_details['anexos'][0].get('url', "")
        except Exception as e:
            # Em um ambiente de produção, seria ideal logar este erro
            print(f"CONTROLADOR: Erro ao buscar imagem para o SKU {sku}: {e}")
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
            print(f"Erro ao excluir agendamento completo (ID: {id_agend_bd}): {e}")
            return False