from .AgendamentoModel import Agendamento
from .JoinedComposicaoModel import JoinedComposicao
from .ComposicaoModel import Composicao

class JoinedAgendamento:
    def __init__(self):
        self.agend_origem = []
        self.produtos = []
        self.joined_comps = []

    def insert_agendamento(self, agendamento:Agendamento = None):
        self.agend_origem.append(agendamento)

    def set_produtos(self):
        if len(self.agend_origem) > 0:
            for agend in self.agend_origem:
                self.produtos += agend.produtos

    def return_comp_grouped(self) -> list[Composicao]:
        composicoes_dict = {}
        
        for produto in self.produtos:
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
        