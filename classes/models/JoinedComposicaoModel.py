from .ComposicaoModel import Composicao
from .ProdutoModel import Produto

class JoinedComposicao:
    """ Classe feita para gerenciar os dados da união de várias composições """
    def __init__(self,
                sku:str = '',
                id_tiny:str = '',
                estoque_tiny:int = 0):
        self.sku = sku
        self.id_tiny = id_tiny
        self.estoque_tiny = estoque_tiny
        self.unidades_totais:int = 0
        self.comp_origem:list[Composicao] = []
        self.produto_origem:list[Produto] = []
        self.estoque_error_flag:str = ''

    def __repr__(self):
        return f"\n\t -- Junção de Composicões -- \
                    \n\t\tSKU: {self.sku}\
                    \n\t\tUnidades Totais: {self.unidades_totais}"
    
    def to_dict(self):
        return {
                "sku": self.sku,
                "id_tiny": self.id_tiny,
                "unidades_totais": self.unidades_totais,
                "composicao": [i.to_dict() for i in self.comp_origem],
                "produtos_origem": [i.to_dict() for i in self.produto_origem],
                "estoque_error_flag": self.estoque_error_flag
            }

    def insert_comp_origem(self, composicao:Composicao = None):
        self.comp_origem.append(composicao)

    def insert_produto_origem(self, produto:Produto = None):
        self.produto_origem.append(produto)

    def set_flag_in_joined_comp(self):
        joined_comp_flag = ''
        if self.unidades_totais > self.estoque_tiny:
            joined_comp_flag = 'red'
        elif self.unidades_totais < self.estoque_tiny:
            joined_comp_flag = 'green'

        if joined_comp_flag == 'green':
            for i in self.comp_origem:
                i.set_estoque_error_flag('green')
        else:
            for composicao in self.comp_origem:
                if composicao.unidades_totais > composicao.estoque_tiny:
                    composicao.set_estoque_error_flag('red')
                elif composicao.unidades_totais == composicao.estoque_tiny:
                    composicao.set_estoque_error_flag('yellow')            