# agendamentos_web/classes/models/AgendamentoModel.py

from .ProdutoModel import Produto
from datetime import datetime

class Agendamento:
    """ Classe feita para gerenciar os dados de um agendamento """
    def __init__(self, 
                id_bd:int = 0, 
                id_agend_ml:str = '', 
                id_tipo:int = 0,
                empresa:int = 0,
                id_mktp:int = 0,
                colaborador = '',
                entrada:datetime = datetime.now(),
                centro_distribuicao: str = ''):
        """
        Instancia um objeto da classe Agendamento

        Args
        -----------    
            id_bd (int): ID da composição no Banco de dados.
            id_agend_ml (str): ID do agendamento no ML.
            id_tipo (int): ID do tipo do agendamento.
            empresa (int): ID da empresa do agendamento.
            colaborador (str): Nome do colaborador.

        Vars
        -----------
            produtos (list[Produto]): Lista com todos os produtos do agendamento.
        """
        self.id_bd = id_bd
        self.id_agend_ml = id_agend_ml
        self.id_tipo = id_tipo
        self.empresa = empresa
        self.id_mktp = id_mktp
        self.colaborador = colaborador
        self.centro_distribuicao = centro_distribuicao
        if isinstance(entrada, str):
            try:
                # Tenta converter a string para datetime (ajuste o formato se o do seu BD for diferente)
                self.entrada = datetime.strptime(entrada, '%Y-%m-%d %H:%M:%S')
            except (ValueError, TypeError):
                # Se a conversão falhar, usa a data/hora atual como fallback.
                self.entrada = datetime.now()
        elif entrada is None:
            # Se a entrada for None (valor padrão ou do BD), usa a data/hora atual.
            self.entrada = datetime.now()
        else:
            # Se já for um objeto datetime, apenas o atribui.
            self.entrada = entrada


        self.produtos:list[Produto] = []
        self.expedicao_inicio = None
        self.expedicao_fim = None
        
    def __repr__(self):
        """ Formata como o objeto deve ser transformado em uma string """
        return f"Agendamento\
                \n\tID BD: {self.id_bd}\
                \n\tID agendamento: {self.id_agend_ml}\
                \n\tID tipo: {self.id_tipo}"

    def to_dict(self):
        """ Transforma o objeto num dicionário """
        return {
            "id_bd": self.id_bd,
            "id_agend_ml": self.id_agend_ml,
            "id_tipo": self.id_tipo,
            "empresa": self.empresa,
            "id_mktp": self.id_mktp,
            "colaborador": self.colaborador,
            "entrada_agend": self.entrada,
            "produtos": []
        }
    
    def to_tuple(self):
        """ Transforma o objeto num tuple """
        return (
            self.id_agend_ml,
            self.id_tipo,
            self.empresa,
            self.id_mktp,
            self.colaborador,
            self.centro_distribuicao,
            self.entrada
        )

    def insert_produto(self, produto_obj:Produto = None):
        """ Insere um produto ao agendamento """
        self.produtos.append(produto_obj)

    def search_produto(self, att_name:str = '', att_value:str = ''):
        """ Busca por um produto baseado em um atributo e um valor """
        return next((i for i in self.produtos if getattr(i, att_name) == att_value), None)
    
    def set_id_bd(self, id_bd:int = 0):
        """ Insere o id do agendamento """
        self.id_bd = id_bd

    def set_colaborador(self, colaborador:str = ''):
        """ Insere o colaborador do agendamento """
        self.colaborador = colaborador

    def set_empresa(self, empresa:int = 0):
        """ Insere o id da empresa do agendamento """
        self.empresa = empresa
        
    def set_mktp(self, id_mktp:int = 0):
        """ Insere o id da empresa do agendamento """
        self.id_mktp = id_mktp
        
    def set_id_agend_for_produtos(self):
        """ Insere o id do agendamento a todos os produtos dentro dele """
        for produto in self.produtos:
            produto.set_id_agend(self.id_bd)
            
    def set_tipo(self, tipo:int = 0):
        """ Insere o tipo do agendamento """
        self.id_tipo = tipo

    # --- CORREÇÃO ADICIONADA AQUI ---
    def set_centro(self, centro_distribuicao: str = ''):
        """ Insere o centro de distribuição do agendamento """
        self.centro_distribuicao = centro_distribuicao
    # --- FIM DA CORREÇÃO ---

    def return_produtos_in_tuple(self):
        """ Retorna todos os produtos em tuples """
        return [produto.to_tuple() for produto in self.produtos]
    
    def return_all_composicoes_in_tuple(self):
        """ Retorna todas as composições em tuples """
        temp_list = []
        for produto in self.produtos:
            temp_list += produto.return_composicao_in_tuple()
        return temp_list
    
    def update_pdf_agendamento(self, id_bd: int, pdf_path: str):
        """
        Atualiza o PDF de um agendamento existente, deletando dados antigos
        e inserindo os novos a partir do novo PDF.
        """
        try:
            # 1. Confirma que o agendamento existe
            agend_data = self.db_controller.get_agendamento_by_bd_id(id_bd)
            if not agend_data:
                raise ValueError(f"Agendamento com ID {id_bd} não encontrado.")

            agendamento = Agendamento(id_bd=id_bd) # Objeto simplificado para o processo

            # 2. Deleta produtos e composições antigos (importante a ordem)
            self.db_controller.delete_composicoes_by_agend_id(id_bd)
            self.db_controller.delete_produtos_by_agend_id(id_bd)

            # 3. Processa o novo PDF
            product_data_list = self.pdf_service.parse_pdf_to_dict(pdf_path)
            
            for product_data in product_data_list:
                produto = Produto(
                    id_agend=agendamento.id_bd, # Vincula ao agendamento existente
                    id_ml=product_data.get('id_ml', ''),
                    sku=product_data.get('sku', ''),
                    nome=product_data.get('nome', ''),
                    unidades=product_data.get('unidades', 0),
                    gtin=product_data.get('codigo_uni', ''),
                    etiqueta=product_data.get('etiqueta', '')
                )
                agendamento.insert_produto(produto)

            # 4. Busca dados do Tiny para os novos produtos
            self.get_prod_data_tiny(agendamento)
            self.get_comp_tiny(agendamento)
            self.get_comp_data_tiny(agendamento)

            # 5. Insere os novos produtos e composições no BD
            self.insert_produto_in_bd(agendamento)
            
            # Recarrega o agendamento com os produtos recém-inseridos para obter os IDs
            # corretos, necessários para inserir as composições.
            agendamento.produtos = [] # Limpa a lista temporária
            self.create_agendamento_from_bd_data(agendamento)
            
            self.insert_composicao_in_bd(agendamento)

            # 6. Atualiza as flags de erro de estoque
            self.set_error_flags_composicoes(agendamento)
            
            return True, "PDF atualizado com sucesso."

        except Exception as e:
            self.view.show_error(f"Falha ao atualizar o PDF do agendamento: {str(e)}")
            return False, f"Falha ao atualizar o PDF: {str(e)}"