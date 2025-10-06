# PdfService.py
import os
import pandas as pd
import camelot
from typing import Dict, List

class PdfService:
    """Handles all PDF parsing and raw data extraction"""
    TEMP_FOLDER = 'temp'

    @staticmethod
    def parse_pdf_to_dict(pdf_path: str, delete_pdf: bool = False) -> List[Dict]:
        """
        Extract product data from PDF and return as list of dicts.

        - Tenta usar colunas 'PRODUTO', 'UNIDADES' e 'ETIQUETA #' (ou variações).
        - Faz fallback para parsing do texto de 'PRODUTO' quando necessário.
        """
        try:
            os.makedirs(PdfService.TEMP_FOLDER, exist_ok=True)

            # Lê o PDF e exporta CSVs temporários (mantém seu fluxo atual)
            tables = camelot.read_pdf(pdf_path, pages='all')
            if tables.n == 0:
                raise ValueError("Nenhuma tabela reconhecida no PDF.")

            base = os.path.join(PdfService.TEMP_FOLDER, 'pdf_data')
            tables.export(base + '.csv', f='csv')

            # Junta todas as páginas
            dfs = []
            for i in range(1, tables.n + 1):
                csv_path = f'{PdfService.TEMP_FOLDER}/pdf_data-page-{i}-table-1.csv'
                if not os.path.exists(csv_path):
                    # Em alguns PDFs o índice pode variar; ignore se faltar
                    continue
                df = pd.read_csv(csv_path, thousands=',')
                dfs.append(df)
                os.remove(csv_path)

            if not dfs:
                raise ValueError("Falha ao montar DataFrame: nenhum CSV intermediário gerado.")

            combined_df = pd.concat(dfs, ignore_index=True)

            # Normaliza nomes de colunas (case-insensitive)
            norm_map = {c: str(c).strip().upper().replace('  ', ' ') for c in combined_df.columns}
            inv_map = {v: k for k, v in norm_map.items()}  # valor normalizado -> nome original

            def get_col(*candidates: str):
                for cand in candidates:
                    if cand in inv_map:
                        return inv_map[cand]
                return None

            col_produto  = get_col('PRODUTO')
            col_unidades = get_col('UNIDADES', 'QTD', 'QUANTIDADE')
            col_etiqueta = get_col('ETIQUETA #', 'ETIQUETA#', 'ETIQUETA')

            if col_produto is None:
                raise ValueError("Coluna 'PRODUTO' não encontrada no PDF.")

            products: List[Dict] = []

            for _, row in combined_df.iterrows():
                raw_prod = str(row.get(col_produto, '') or '')
                # Original: substitui quebras por espaço e espaços por vírgula, depois split
                product_str = raw_prod.replace('\n', ' ').replace(' ', ',')
                parts = product_str.split(',')

                # Campos com fallback seguro
                id_ml = parts[2] if len(parts) > 2 else ''
                codigo_uni = parts[5] if len(parts) > 5 else ''
                sku = parts[7] if len(parts) > 7 else ''
                nome = ' '.join(parts[8:]).replace(',', ' ').strip() if len(parts) > 8 else raw_prod.strip()

                # UNIDADES
                unidades_val = 0
                if col_unidades is not None:
                    try:
                        unidades_val = int(str(row[col_unidades]).strip().replace(',', ''))
                    except Exception:
                        # tenta como float, depois int
                        try:
                            unidades_val = int(float(str(row[col_unidades]).replace(',', '.')))
                        except Exception:
                            unidades_val = 0

                # ETIQUETA (preferir coluna explícita; fallback para parts[2])
                etiqueta_val = id_ml
                if col_etiqueta is not None:
                    etq_raw = str(row[col_etiqueta])
                    # se vier no formato "ETIQUETA #12345"
                    if '#' in etq_raw:
                        etiqueta_val = etq_raw.split('#')[-1].strip()
                    else:
                        etiqueta_val = etq_raw.strip() or id_ml

                product_data = {
                    'id_ml': id_ml,
                    'codigo_uni': codigo_uni,
                    'sku': sku,
                    'nome': nome,
                    'unidades': unidades_val,
                    'etiqueta': etiqueta_val,
                }

                products.append(product_data)

            if delete_pdf and os.path.exists(pdf_path):
                os.remove(pdf_path)

            return products

        except Exception as e:
            raise ValueError(f"PDF parsing failed: {str(e)}")
