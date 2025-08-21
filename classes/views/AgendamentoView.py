from classes.models import Agendamento, Produto, Composicao
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
                entrada:datetime = datetime.now()):
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
        self.entrada = entrada

        self.produtos:list[Produto] = []

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

    def return_produtos_in_tuple(self):
        """ Retorna todos os produtos em tuples """
        return [produto.to_tuple() for produto in self.produtos]
    
    def return_all_composicoes_in_tuple(self):
        """ Retorna todas as composições em tuples """
        temp_list = []
        for produto in self.produtos:
            temp_list += produto.return_composicao_in_tuple()
        return temp_list

from classes.models import Agendamento, Produto, Composicao

class AgendamentoView:
    def display_agendamento(self, agendamento:Agendamento = None):
        print(agendamento)

    def display_produto(self, produto:Produto = None):
        print(produto)

    def display_all_produtos(self, agendamento:Agendamento = None):
        for produto in agendamento.produtos:
            print(produto)

    def display_composicao(self, composicao:Composicao = None):
        print(composicao)

    def display_all_composicoes(self, produto:Produto = None):
        for composicao in produto.composicoes:
            print(composicao)

    def display_all_in_agend(self, agendamento:Agendamento = None):
        print(agendamento)
        for produto in agendamento.produtos:
            print(produto)
            for composicao in produto.composicoes:
                print(composicao)

    def show_agendamento_created(self, agendamento:Agendamento = None):
        print(f"Agendamento criado com sucesso\n ID do agendamento: {agendamento.id_agend_ml}")
        print(f"Contém {len(agendamento.produtos)} produtos")
        
    def show_error(self, message):
        print(f"Error: {message}")