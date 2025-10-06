import os
import pandas as pd
from typing import List, Dict, Any

class SpreadsheetService:
    """Manipula a leitura e processamento de planilhas (Excel, CSV Magalu, etc.)."""

    @staticmethod
    def parse_spreadsheet_to_dict(path: str) -> List[Dict[str, Any]]:
        """
        Retorna uma lista de dicts com esquema unificado:
        {
          item_id, sku, sku_variacao, sku_principal,
          produto, nome_variacao, unidades (int), id_prod_ml
        }
        """
        ext = os.path.splitext(path)[1].lower()

        if ext in (".xls", ".xlsx"):
            # ---- Excel (marketplaces) ----
            try:
                df = pd.read_excel(path, engine="openpyxl")
            except Exception:
                df = pd.read_excel(path)

            # normaliza nomes (lower)
            norm = {c: str(c).strip().lower() for c in df.columns}
            df.rename(columns={orig: norm for orig, norm in norm.items()}, inplace=True)

            def pick(*cands):
                for c in cands:
                    if c in df.columns:
                        return c
                return None

            col_item_id      = pick('id do item', 'item_id', 'itemid')
            col_produto      = pick('produto', 'nome do produto', 'product')
            col_variacao_id  = pick('id da variação', 'id da variacao', 'variacao_id')
            col_nome_var     = pick('nome da variação', 'nome da variacao', 'nome_variacao')
            col_sku_var      = pick('sku da variação', 'sku da variacao', 'sku_variacao', 'sku')
            col_sku_princ    = pick('sku principle', 'sku principal', 'sku_principal')
            col_unidades     = pick('unidades (pedido pago)', 'unidades', 'qtd', 'quantidade', 'mandar')
            col_etiqueta     = pick('etiqueta #', 'etiqueta#', 'etiqueta', 'etiqueta full', 'id_prod_ml')

            if col_unidades is None:
                raise ValueError("Coluna de quantidade não encontrada no Excel.")

            df = df[df[col_unidades].notna()].copy()

            # unidades -> int robusto (suporta "1.234" / "1,5")
            df['_unidades'] = (
                pd.to_numeric(
                    df[col_unidades].astype(str)
                    .str.replace('.', '', regex=False)    # milhar
                    .str.replace(',', '.', regex=False),  # decimal
                    errors='coerce'
                ).fillna(0).astype(int)
            )

            # id_prod_ml da coluna Etiqueta (preferência), com fallback
            if col_etiqueta is not None:
                df['_id_prod_ml'] = (
                    df[col_etiqueta].astype(str)
                    .apply(lambda s: s.split('#')[-1].strip() if '#' in s else s.strip())
                )
            else:
                df['_id_prod_ml'] = ''  # será vazio se não existir no Excel

            # agrega por chaves presentes
            group_cols = [c for c in [col_item_id, col_sku_var, col_sku_princ, col_produto, col_nome_var] if c]
            if group_cols:
                df_agg = df.groupby(group_cols, as_index=False).agg({
                    '_unidades': 'sum',
                    '_id_prod_ml': 'first'
                })
            else:
                # sem colunas-chave, evita groupby
                df_agg = df.copy()
                df_agg['_id_prod_ml'] = df_agg['_id_prod_ml']
                df_agg['_unidades']   = df_agg['_unidades']

            # sku canônico: prioriza variação > principal
            def canonical_sku(row):
                if col_sku_var and str(row.get(col_sku_var, '')).strip():
                    return str(row[col_sku_var]).strip()
                if col_sku_princ and str(row.get(col_sku_princ, '')).strip():
                    return str(row[col_sku_princ]).strip()
                return ''

            out = []
            for _, r in df_agg.iterrows():
                out.append({
                    'item_id':      (str(r[col_item_id]).strip() if col_item_id and pd.notna(r.get(col_item_id)) else ''),
                    'sku':          canonical_sku(r),
                    'sku_variacao': (str(r[col_sku_var]).strip() if col_sku_var and pd.notna(r.get(col_sku_var)) else ''),
                    'sku_principal':(str(r[col_sku_princ]).strip() if col_sku_princ and pd.notna(r.get(col_sku_princ)) else ''),
                    'produto':      (str(r[col_produto]).strip() if col_produto and pd.notna(r.get(col_produto)) else ''),
                    'nome_variacao':(str(r[col_nome_var]).strip() if col_nome_var and pd.notna(r.get(col_nome_var)) else ''),
                    'unidades':     int(r['_unidades']),
                    'id_prod_ml':   str(r['_id_prod_ml']).strip(),
                })
            return out

        elif ext == ".csv":
            # ---- CSV Magalu ----
            try:
                df = pd.read_csv(path, sep=';')
            except UnicodeDecodeError:
                df = pd.read_csv(path, sep=';', encoding='latin-1')

            norm = {c: str(c).strip().lower() for c in df.columns}
            df.rename(columns={orig: norm for orig, norm in norm.items()}, inplace=True)

            col_sku      = 'sku' if 'sku' in df.columns else None
            col_produto  = 'nome do produto' if 'nome do produto' in df.columns else ('produto' if 'produto' in df.columns else None)
            col_unidades = 'mandar' if 'mandar' in df.columns else ('unidades' if 'unidades' in df.columns else None)

            if not all([col_sku, col_produto, col_unidades]):
                raise ValueError("CSV Magalu precisa de: SKU, Nome do Produto, e mandar/unidades.")

            df['_unidades'] = pd.to_numeric(df[col_unidades], errors='coerce').fillna(0).astype(int)
            df = df[df['_unidades'] > 0].copy()

            out = [{
                'item_id':      '',
                'sku':          str(r[col_sku]).strip(),
                'sku_variacao': '',
                'sku_principal':'',
                'produto':      str(r[col_produto]).strip(),
                'nome_variacao':'',
                'unidades':     int(r['_unidades']),
                'id_prod_ml':   ''  # CSV padrão não traz Etiqueta
            } for _, r in df.iterrows()]
            return out

        else:
            raise ValueError(f"Formato não suportado pelo parser: {ext}")
