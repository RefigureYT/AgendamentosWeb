# PdfService.py
import pandas as pd
import camelot
import os
from typing import List, Dict

class PdfService:
    """Handles all PDF parsing and raw data extraction"""
    
    TEMP_FOLDER = 'temp'
    
    @staticmethod
    def parse_pdf_to_dict(pdf_path: str) -> list[Dict]:
        """Extract product data from PDF and return as list of dicts"""
        try:
            # Read PDF tables
            tables = camelot.read_pdf(pdf_path, pages='all')
            tables.export('temp/pdf_data.csv', f='csv')
            
            # Combine tables
            dfs = []
            for i in range(1, tables.n + 1):
                df = pd.read_csv(f'temp/pdf_data-page-{i}-table-1.csv', thousands=',')
                dfs.append(df)
                os.remove(f'temp/pdf_data-page-{i}-table-1.csv')
            
            combined_df = pd.concat(dfs, ignore_index=True)
            
            # Parse into product dictionaries
            products = []
            for _, row in combined_df.iterrows():
                product_str = row['PRODUTO'].replace('\n', ' ').replace(' ', ',')
                parts = product_str.split(',')
                
                product_data = {
                    'id_ml': parts[2],
                    'codigo_uni': parts[5],
                    'sku': parts[7],
                    'nome': ' '.join(parts[8:]).replace(',', ' ').strip(),
                    'unidades': row['UNIDADES'],
                    'etiqueta': row['ETIQUETA #'].split('#')[1]
                }
                products.append(product_data)
            
            os.remove(pdf_path)
            return products
            
        except Exception as e:
            raise ValueError(f"PDF parsing failed: {str(e)}")