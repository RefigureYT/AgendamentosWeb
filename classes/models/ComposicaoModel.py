class Composicao:
    """ Classe feita para gerenciar os dados de uma composição """
    def __init__(self, 
                id_bd:int = 0, 
                fk_id_prod:int = 0, 
                nome:str = '', 
                sku:str = '',
                prod_sku:str = '',
                id_tiny:str = '',
                gtin:str = '',
                prod_gtin:str = '',
                unidades_por_kit:int = 0,
                unidades_de_kits:int = 0,
                estoque_tiny:int = 0,
                localizacao:str = '',
                estoque_error_flag:str = '',
                imagem_url:str = ''):
        """
        Instancia um objeto da classe Composicao

        Args
        -----------   
            id_bd (int): ID da composição no Banco de dados.
            fk_id_prod (int): ID do produto no Banco de dados.
            nome (str): Nome da composição.
            sku (str): Sku da composição.
            prod_sku (str): Sku do produto que é pai dessa composição.
            id_tiny (str): ID da composição no Tiny.
            gtin (str): GTIN/EAN da composição.
            prod_gtin (Str): GTIN/EAN do produto que é pai dessa composição.
            unidades_por_kit (int): Unidades da composição por unidade do produto.
            unidades_de_kits (int): Unidades do produto.
            etiqueta (str): Etiqueta da composição.
            estoque_error_flag (str): Bandeira que diz se há algum erro na quantia de estoque.
            imagem_url (str): Imagem do anuncio do produto

        Vars
        -----------
            unidades_totais (int): Quantidade total de unidades da composição (un. por kit * un. de kits)
        """
        self.id_bd = id_bd
        self.fk_id_prod = fk_id_prod
        self.nome = nome
        self.sku = sku
        self.prod_sku = prod_sku
        self.id_tiny = id_tiny
        self.gtin = gtin
        self.prod_gtin = prod_gtin
        self.unidades_por_kit = unidades_por_kit  
        self.unidades_de_kits = unidades_de_kits
        self.unidades_totais:int = unidades_de_kits * unidades_por_kit 
        self.estoque_tiny = estoque_tiny
        self.localizacao = localizacao
        self.estoque_error_flag = estoque_error_flag
        self.imagem_url = imagem_url

    def __repr__(self):
        """ Formata como o objeto deve ser transformado em uma string """
        return f"\n\t -- Composicão -- \
                \n\t\tID BD: {self.id_bd}\
                \n\t\tID Prod BD: {self.fk_id_prod}\
                \n\t\tNome: {self.nome}\
                \n\t\tSKU: {self.sku}\
                \n\t\tGTIN: {self.gtin}\
                \n\t\tLocalização: {self.localizacao}\
                \n\t\tUnidades por kit: {self.unidades_por_kit}\
                \n\t\tUnidades de Kit: {self.unidades_de_kits}\
                \n\t\tUnidades Totais: {self.unidades_totais}"
                
    
    def to_dict(self):
        """ Transforma o objeto num dicionário """
        return {
            "id_bd": self.id_bd,
            "fk_id_prod": self.fk_id_prod,
            "nome": self.nome,
            "sku": self.sku,
            "id_tiny": self.id_tiny,
            "gtin": self.gtin,
            "unidades_por_kit": self.unidades_por_kit,
            "unidades_de_kits": self.unidades_de_kits,
            "unidades_totais": self.unidades_totais,
            "estoque_tiny": self.estoque_tiny,
            "localizacao": self.localizacao,
            "estoque_error_flag": self.estoque_error_flag,
            "imagem_url": self.imagem_url
        }
        
    def to_dict_for_api(self, attrs:list = []):
        temp_dict = {}
        for attr in attrs:
            temp_dict.update({attr: getattr(self, attr)})
        return temp_dict
        
    def to_tuple(self):
        """ Transforma o objeto num tuple """
        return (
            self.fk_id_prod,
            self.id_tiny,
            self.gtin,
            self.sku,
            self.nome,
            self.unidades_por_kit,
            self.unidades_totais, 
            self.estoque_tiny, 
            self.localizacao,
            self.estoque_error_flag,
            self.imagem_url
        )
    
    def to_tuple_alteracao(self):
        """ Transforma o objeto num tuple para enviar à tabela de alteração """
        return (
            self.id_bd,
            self.fk_id_prod,
            self.id_tiny,
            self.gtin,
            self.sku,
            self.nome
            )
        
    def to_tuple_compra(self):
        """ Transforma o objeto num tuple para enviar à tabela de compras """
        return (
            self.id_bd,
            self.fk_id_prod,
            self.id_tiny,
            self.gtin,
            self.sku,
            self.nome,
            self.unidades_totais
            )

    def set_gtin(self, gtin:str = ''):
        """ Insere o GTIN da composição """
        if gtin != '':
            self.gtin = gtin
        else:
            self.gtin = "GTIN/EAN não encontrado"

    def set_unidades_por_kit(self, unidades_por_kit:int = 0):
        """ Insere a quantidade de unidades por kit da composição """
        self.unidades_por_kit = unidades_por_kit

    def set_estoque_tiny(self, estoque_tiny:int = 0):
        """ Insere o estoque do tiny da composição """
        self.estoque_tiny = estoque_tiny

    def set_id_bd(self, id_bd:int = 0):
        """ Insere o ID da composição """
        self.id_bd = id_bd

    def set_fk_id_prod(self, fk_id_prod:int = 0):
        """ Insere o ID do produto pai da composição """
        self.fk_id_prod = fk_id_prod
    
    def set_localizacao(self, localizacao:str = ''):
        self.localizacao = localizacao

    def set_estoque_error_flag(self, estoque_error_flag):
        """ Insere a bandeira de estoque da composição """
        if estoque_error_flag in ['green', 'yellow', 'red']:
            self.estoque_error_flag = estoque_error_flag
        else:
            print("Valor de bandeira inválido")
            return
    
    def set_imagem_url(self, url: str): # NOVO MÉTODO
        """ Define a URL da imagem para esta composição. """
        self.imagem_url = url if url else ''