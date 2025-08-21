from .ComposicaoModel import Composicao

class Produto:
    """ Classe feita para gerenciar os dados de um produto """
    def __init__(self, 
                id_agend:int = 0,
                id_bd:int = 0,
                id_tiny:str = '',
                id_ml:str = '',
                nome:str = '',
                sku:str = '',
                gtin:str = '',
                etiqueta:str = '',
                unidades:int = 0,
                estoque_error_flag:str = '',
                imagem_url:str = ''):
        """
        Instancia um objeto da classe Produto

        Args
        -----------   
            id_agend (int): ID do agendamento no Banco de dados.
            id_bd (int): ID do produto no Banco de dados.
            id_tiny (str): ID do produto no Tiny.
            id_ml (str): ID do produto no ML.
            nome (str): Nome do produto.
            sku (str): Sku do produto.
            gtin (str): GTIN/EAN do produto.
            etiqueta (str): Etiqueta do produto.
            unidades (int): Unidades do produto.
            estoque_error_flag (str): Bandeira que diz se há algum erro na quantia de estoque.

        Vars
        -----------
            is_kit (bool): É ou não um kit
        """
        self.id_agend = id_agend
        self.id_bd = id_bd
        self.id_tiny = id_tiny
        self.id_ml = id_ml
        self.nome = nome
        self.sku = sku
        self.gtin = gtin
        self.etiqueta = etiqueta
        self.unidades = unidades
        self.estoque_error_flag = estoque_error_flag
        self.is_kit:bool = False 
        self.imagem_url = imagem_url

        self.composicoes:list[Composicao] = []

    def __repr__(self):
        """ Formata como o objeto deve ser transformado em uma string """
        return f"\n -- Produto -- \
                \n\tID BD: {self.id_bd}\
                \n\tID Agend BD: {self.id_agend}\
                \n\tID Tiny: {self.id_tiny}\
                \n\tNome: {self.nome}\
                \n\tSKU: {self.sku}\
                \n\tGTIN: {self.gtin}\
                \n\tEtiqueta: {self.etiqueta}\
                \n\tÉ kit: {self.is_kit}\
                \n\tUnidades: {self.unidades}"
    
    def to_dict(self):
        """ Transforma o objeto num dicionário """
        return {
            "id_bd": self.id_bd,
            "id_tiny": self.id_tiny,
            "id_ml": self.id_ml,
            "nome": self.nome,
            "sku": self.sku,
            "gtin": self.gtin,
            "etiqueta": self.etiqueta,
            "unidades": self.unidades,
            "estoque_error_flag": self.estoque_error_flag,
            "imagem_url": self.imagem_url,
            "composicao": []
        }
    
    def to_tuple(self):
        """ Transforma o objeto num tuple """
        return (
            self.id_agend,
            self.id_ml,
            self.id_tiny,
            self.sku,
            self.gtin,
            self.unidades,
            self.is_kit, 
            self.nome, 
            self.estoque_error_flag,
            self.imagem_url
        )
    
    
    def set_id_tiny(self, id_tiny:str = ''):
        """ Insere o id do produto no Tiny """
        self.id_tiny = id_tiny

    def set_gtin(self, gtin:str = ''):
        """ Insere o GTIN/EAN """
        if gtin != '':
            self.gtin = gtin
        else:
            self.gtin = "GTIN/EAN não encontrado"

    def set_is_kit(self, is_kit:bool = False):
        """ Insere se é ou não um kit  """
        if is_kit == 'K':
            self.is_kit = True
        else:
            self.is_kit = False

    def insert_composicao(self, composicao_obj:Composicao = None):
        """ Insere uma composição no objeto """
        self.composicoes.append(composicao_obj)

    def search_composicao(self, att_name:str = '', att_value:str = ''):
        """ Busca por uma composição baseado em um atributo e um valor """
        return next((i for i in self.composicoes if getattr(i, att_name) == att_value), None)
    
    def set_id_bd(self, id_bd:int = 0):
        """ Insere o id do produto no banco de dados """
        self.id_bd = id_bd

    def set_id_agend(self, id_agend:int = 0):
        """ Insere o id do agendamento """
        self.id_agend = id_agend

    def set_estoque_error_flag(self):
        """ Vê as bandeiras em sua composição e, a partir delas, decide qual será a sua """
        flags = [i.estoque_error_flag for i in self.composicoes]
        if 'red' in flags:
            self.estoque_error_flag = 'red'
        elif 'yellow' in flags:
            self.estoque_error_flag = 'yellow'
        else:
            self.estoque_error_flag = 'green'

    def set_imagem_url(self, url: str): # <-- NOVO MÉTODO
        """ Define a URL da imagem para este produto. """
        self.imagem_url = url if url else ''
        
    def set_id_bd_for_composicoes(self):
        """ Insere o id_bd do produto em todas as suas composições """
        for composicao in self.composicoes:
            composicao.set_fk_id_prod(self.id_bd)
    
    def return_composicao_in_tuple(self):
        """ Retorna toda a composição do produto numa lista de tuples """
        return [comp.to_tuple() for comp in self.composicoes]
