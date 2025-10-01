# classes/services/SpreadsheetService.py
import pandas as pd
import os
from typing import List, Dict

class SpreadsheetService:
    """Manipula a leitura e processamento de planilhas (Excel, CSV Magalu, etc.)."""

    @staticmethod
    def parse_spreadsheet_to_dict(path: str) -> List[Dict]:
        """
        Detecta o tipo de arquivo e retorna uma lista de dicts normalizados.
        - .xlsx/.xls: fluxo genérico de marketplace (agrupa duplicatas etc.)
        - .csv     : fluxo Magalu (colunas fixas SKU, Nome do Produto, Pedidos Finalizados, mandar)
        """
        ext = os.path.splitext(path)[1].lower()

        if ext in (".xls", ".xlsx"):
            df = pd.read_excel(path, engine="openpyxl")

            # 1) Renomear (inclui Etiqueta Full)
            df = df.rename(columns={
                'ID do Item':        'item_id',
                'Produto':           'produto',
                'ID da Variação':    'variacao_id',
                'Nome da Variação':  'nome_variacao',
                'SKU da Variação':   'sku_variacao',
                'SKU Principle':     'sku_principal',
                'Unidades (Pedido pago)': 'unidades',
                'Etiqueta Full':     'id_prod_ml'  # mantém isso
            })


            # 2) Normalizações básicas
            df = df[df['unidades'].notna()]
            if 'id_prod_ml' not in df.columns:
                df['id_prod_ml'] = ''
            df['id_prod_ml'] = df['id_prod_ml'].fillna('').astype(str).str.strip()

            # 3) Agrupar preservando id_prod_ml (pega o primeiro do grupo)
            df_agg = (
                df.groupby(
                    ['item_id', 'sku_variacao', 'sku_principal', 'produto', 'nome_variacao'],
                    as_index=False
                )
                .agg({
                    'unidades': 'sum',
                    'id_prod_ml': 'first'  # <--- PRESERVA A ETIQUETA
                })
            )

            return df_agg.to_dict(orient='records')

        elif ext == ".csv":
            # fluxo específico para CSV Magalu
            try:
                df = pd.read_csv(path, sep=';')
            except UnicodeDecodeError:
                df = pd.read_csv(path, sep=';', encoding='latin-1')

            # renomeia colunas para o nosso esquema
            df = df.rename(columns={
                'SKU': 'sku',
                'Nome do Produto': 'produto',
                'mandar': 'unidades'
            })

            # mantém só o que importa
            df = df[['sku', 'produto', 'unidades']]

            # preenche strings faltantes e força tudo como texto
            df['sku']     = df['sku'].fillna('').astype(str)
            df['produto'] = df['produto'].fillna('').astype(str)

            # converte unidades para número, invalidando o que não for
            df['unidades'] = pd.to_numeric(df['unidades'], errors='coerce')

            # joga fora linhas sem unidades válidas (>0)
            df = df[df['unidades'].notna() & (df['unidades'] > 0)]

            # agora é seguro converter para int
            df['unidades'] = df['unidades'].astype(int)

            return df.to_dict(orient='records')


        else:
            raise ValueError(f"Formato não suportado pelo parser: {ext}")
