from base_jp_lab import Access
from datetime import datetime
class DatabaseController:
    def __init__(self, access_obj:Access = None):
        self.access = access_obj

    def get_all_agendamentos(self):
        return self.access.custom_select_query("SELECT * FROM agendamento")
    
    def get_agendamento_by_bd_id(self, id_agend_bd:int = 0):
        return self.access.custom_select_query("SELECT * FROM agendamento WHERE id_agend = %s", (id_agend_bd,))
        
    def insert_agendamento_in_bd(self, agendamento_tuple:tuple = ()):
        self.access.custom_i_u_query(
        "INSERT INTO agendamento (id_agend_ml, id_tipo_agend, empresa_agend, id_mktp, colaborador_agend, centro_distribuicao, entrada_agend) VALUES (%s, %s, %s, %s, %s, %s, %s);",
        [agendamento_tuple])

    def insert_produto_in_bd(self, produtos:list[tuple] = []):
        self.access.custom_i_u_query("INSERT INTO produtos_agend (id_agend_prod, id_prod_ml, id_prod_tiny, sku_prod, gtin_prod, unidades_prod, e_kit_prod, nome_prod, estoque_flag_prod, imagem_url_prod) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);", produtos)

    def insert_composicao_in_bd(self, composicoes:list[tuple] = []):
        self.access.custom_i_u_query("INSERT INTO comp_agend (id_prod_comp, id_comp_tiny, gtin_comp, sku_comp, nome_comp, unidades_por_kit_comp, unidades_totais_comp, estoque_tiny_comp, localizacao_comp, estoque_flag_comp, imagem_url_comp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);", composicoes)

    def insert_alteracao_in_bd(self, composicoes:list[tuple] = []):
        print(composicoes)
        self.access.custom_i_u_query("INSERT IGNORE INTO alteracoes_agend (id_comp_alt, id_prod_alt, id_tiny, gtin_alt, sku_alt, nome_alt) VALUES (%s, %s, %s, %s, %s, %s);", composicoes)

    def insert_compras_in_bd(self, composicoes:list[tuple] = []):
        print(composicoes)
        self.access.custom_i_u_query("INSERT INTO compras_agend (id_comp_compra, id_prod_compra, id_tiny, gtin_compra, sku_compra, nome_compra, quant_comprar) VALUES (%s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE quant_comprar = (quant_comprar + VALUES(quant_comprar));", composicoes)

    def update_empresa_colaborador_agend(self, id_agend_bd:int = 0, id_mktp:int = 0, empresa:int = 0, colaborador:str = ''):
        self.access.custom_i_u_query("UPDATE agendamento SET empresa_agend = %s, id_mktp = %s, colaborador_agend = %s WHERE id_agend = %s;", [(empresa, id_mktp, colaborador, id_agend_bd)])

    def update_agendamento(self, id_agend_bd:int = 0, id_agend_ml:str = '', id_agend_tipo:int = 0, empresa:int = 0, id_mktp:int = 0, colaborador:str = '', centro_distribuicao:str = ''):
        self.access.custom_i_u_query(
            "UPDATE agendamento SET id_agend_ml = %s, id_tipo_agend = %s, empresa_agend = %s, id_mktp = %s, colaborador_agend = %s, centro_distribuicao = %s WHERE id_agend = %s;",
            (id_agend_ml, id_agend_tipo, empresa, id_mktp, colaborador, centro_distribuicao, id_agend_bd)
        )
        
    def get_composicao_imagem_and_tiny_by_id(self, id_comp: int):
        return self.access.custom_select_query(
            "SELECT imagem_url_comp, id_comp_tiny FROM comp_agend WHERE id_comp = %s LIMIT 1;",
            (id_comp,)
        )

    def update_composicao_imagem(self, id_comp: int, url: str):
        self.access.custom_i_u_query(
            "UPDATE comp_agend SET imagem_url_comp = %s WHERE id_comp = %s;",
            [(url, id_comp)]
        )

    def update_quant_total_compras(self, id_comp:int = 0, quant:id = 0):
        self.access.custom_i_u_query("UPDATE compras_agend SET quant_comprar = quant_comprar - %s WHERE id_compra = %s;", [(quant, id_comp)])

    def clean_compras(self, id_comp:int = 0):
        self.access.custom_i_u_query("DELETE FROM compras_agend WHERE id_compra = %s AND quant_comprar <= 0;", [(id_comp,)])

    # ADICIONAR CONDIÇÃO PARA CASO NADA SEJA ENCONTRADO

    def get_last_agendamento(self):
        return self.access.custom_select_query("SELECT * FROM agendamento ORDER BY id_agend DESC LIMIT 1;")[0]
    
    def get_last_produto(self):
        return self.access.custom_select_query("SELECT * FROM produtos_agend ORDER BY id_prod DESC LIMIT 1;")[0]
    
    def get_last_composicao(self):
        return self.access.custom_select_query("SELECT * FROM comp_agend ORDER BY id_comp DESC LIMIT 1;")[0]
    
    def get_all_produtos_from_agendamento(self, id_agendamento:int = 0):
        return self.access.custom_select_query("SELECT * FROM produtos_agend WHERE id_agend_prod = %s;", (id_agendamento,))
    
    def get_all_composicoes_from_produto(self, id_produto:int = 0):
        return self.access.custom_select_query("SELECT * FROM comp_agend WHERE id_prod_comp = %s;", (id_produto,))
    
    def _placeholders(self, n: int) -> str:
        return ", ".join(["%s"] * n)

    def get_all_composicoes_from_agendamento(self, id_agend_bd: int):
        """
        Retorna comps do agendamento com chaves para mapear histórico:
        (id_comp, id_prod_comp, id_prod_ml, sku_prod, sku_comp, id_comp_tiny)
        """
        query = """
            SELECT
                c.id_comp,
                c.id_prod_comp,
                p.id_prod_ml,
                p.sku_prod,
                c.sku_comp,
                c.id_comp_tiny
            FROM comp_agend c
            JOIN produtos_agend p ON p.id_prod = c.id_prod_comp
            WHERE p.id_agend_prod = %s;
        """
        return self.access.custom_select_query(query, (id_agend_bd,))

    def snapshot_historico_transacoes(self, id_agend_bd: int):
        """
        Snapshot do histórico que depende de id_prod/id_comp, mas guardando chaves estáveis
        para reencaixar depois (id_prod_ml/sku_prod + sku_comp/id_comp_tiny).
        """
        # ALTERAÇÕES
        q_alt = """
            SELECT
                p.id_prod_ml,
                p.sku_prod,
                c.sku_comp,
                c.id_comp_tiny,
                al.id_tiny,
                al.gtin_alt,
                al.sku_alt,
                al.nome_alt
            FROM alteracoes_agend al
            JOIN produtos_agend p ON p.id_prod = al.id_prod_alt
            LEFT JOIN comp_agend c ON c.id_comp = al.id_comp_alt
            WHERE p.id_agend_prod = %s;
        """
        alteracoes = self.access.custom_select_query(q_alt, (id_agend_bd,))

        # COMPRAS
        q_cmp = """
            SELECT
                p.id_prod_ml,
                p.sku_prod,
                c.sku_comp,
                c.id_comp_tiny,
                ca.id_tiny,
                ca.gtin_compra,
                ca.sku_compra,
                ca.nome_compra,
                ca.quant_comprar
            FROM compras_agend ca
            JOIN produtos_agend p ON p.id_prod = ca.id_prod_compra
            LEFT JOIN comp_agend c ON c.id_comp = ca.id_comp_compra
            WHERE p.id_agend_prod = %s;
        """
        compras = self.access.custom_select_query(q_cmp, (id_agend_bd,))

        return {"alteracoes": alteracoes, "compras": compras}

    def limpar_historico_transacoes(self, id_agend_bd: int):
        """
        Remove histórico dependente dos produtos do agendamento (sem apagar o agendamento).
        """
        ids = self.access.custom_select_query(
            "SELECT id_prod FROM produtos_agend WHERE id_agend_prod = %s;",
            (id_agend_bd,)
        )
        id_produtos = [row[0] for row in (ids or [])]

        if not id_produtos:
            return

        ph = self._placeholders(len(id_produtos))

        self.access.custom_i_u_query(
            f"DELETE FROM alteracoes_agend WHERE id_prod_alt IN ({ph})",
            [id_produtos]
        )
        self.access.custom_i_u_query(
            f"DELETE FROM compras_agend WHERE id_prod_compra IN ({ph})",
            [id_produtos]
        )

    # ==========================================================
    #  SNAPSHOT / RESTORE do "histórico de transferência"
    #  (Conf/Exp + lançamentos + qtd movida + substituição)
    # ==========================================================
    def snapshot_hist_transferencia(self, id_agend_bd: int) -> dict:
        """
        Captura APENAS o histórico que você quer preservar ao dar "reset" em comp_agend.
        Chaves para reencaixe: id_prod_ml/sku_prod + sku_comp + id_comp_tiny.
        """
        q = """
            SELECT
                p.id_prod_ml,
                p.sku_prod,
                c.sku_comp,
                c.id_comp_tiny,
                c.substituido_comp,
                c.lanc_conf_s,
                c.lanc_conf_e,
                c.status_conf,
                c.qtd_mov_conf,
                c.lanc_exp_s,
                c.lanc_exp_e,
                c.status_exp,
                c.qtd_mov_exp
            FROM comp_agend c
            JOIN produtos_agend p ON p.id_prod = c.id_prod_comp
            WHERE p.id_agend_prod = %s;
        """
        rows = self.access.custom_select_query(q, (id_agend_bd,)) or []
        return {"comps": rows}

    def restore_hist_transferencia(self, id_agend_bd: int, snap: dict):
        """
        Reencaixa o histórico da snapshot nas comps recém recriadas.
        Ignora itens que não existirem mais no novo upload.
        """
        if not snap or not snap.get("comps"):
            return

        # comps novas (para achar o id_comp novo)
        q_new = """
            SELECT
                c.id_comp,
                p.id_prod_ml,
                p.sku_prod,
                c.sku_comp,
                c.id_comp_tiny
            FROM comp_agend c
            JOIN produtos_agend p ON p.id_prod = c.id_prod_comp
            WHERE p.id_agend_prod = %s;
        """
        new_rows = self.access.custom_select_query(q_new, (id_agend_bd,)) or []

        # mapas de match (prioridade alta -> baixa)
        by_full = {}   # (id_prod_ml, sku_comp, id_comp_tiny) -> id_comp
        by_mid  = {}   # (sku_prod,   sku_comp, id_comp_tiny) -> id_comp
        by_low  = {}   # (sku_comp,   id_comp_tiny)          -> id_comp

        for (id_comp, id_prod_ml, sku_prod, sku_comp, id_comp_tiny) in new_rows:
            if id_prod_ml and sku_comp and id_comp_tiny is not None:
                by_full[(str(id_prod_ml), str(sku_comp), str(id_comp_tiny))] = id_comp
            if sku_prod and sku_comp and id_comp_tiny is not None:
                by_mid[(str(sku_prod), str(sku_comp), str(id_comp_tiny))] = id_comp
            if sku_comp and id_comp_tiny is not None:
                by_low[(str(sku_comp), str(id_comp_tiny))] = id_comp

        updates = []
        for row in snap["comps"]:
            (
                id_prod_ml, sku_prod, sku_comp, id_comp_tiny,
                substituido_comp,
                lanc_conf_s, lanc_conf_e, status_conf, qtd_mov_conf,
                lanc_exp_s,  lanc_exp_e,  status_exp,  qtd_mov_exp
            ) = row

            target_id = None
            if id_prod_ml and sku_comp and id_comp_tiny is not None:
                target_id = by_full.get((str(id_prod_ml), str(sku_comp), str(id_comp_tiny)))
            if not target_id and sku_prod and sku_comp and id_comp_tiny is not None:
                target_id = by_mid.get((str(sku_prod), str(sku_comp), str(id_comp_tiny)))
            if not target_id and sku_comp and id_comp_tiny is not None:
                target_id = by_low.get((str(sku_comp), str(id_comp_tiny)))

            if not target_id:
                continue

            updates.append((
                substituido_comp,
                lanc_conf_s, lanc_conf_e, status_conf, qtd_mov_conf,
                lanc_exp_s,  lanc_exp_e,  status_exp,  qtd_mov_exp,
                target_id
            ))

        if updates:
            q_up = """
                UPDATE comp_agend
                SET
                    substituido_comp = %s,
                    lanc_conf_s      = %s,
                    lanc_conf_e      = %s,
                    status_conf      = %s,
                    qtd_mov_conf     = %s,
                    lanc_exp_s       = %s,
                    lanc_exp_e       = %s,
                    status_exp       = %s,
                    qtd_mov_exp      = %s
                WHERE id_comp = %s;
            """
            self.access.custom_i_u_query(q_up, updates)

    def get_all_agendamentos_in_alteracoes(self):
        return self.access.custom_select_query("SELECT DISTINCT a.*\
                                                 FROM alteracoes_agend al\
                                                 JOIN produtos_agend p\
                                                 JOIN agendamento a\
                                                 ON al.id_prod_alt = p.id_prod AND p.id_agend_prod = a.id_agend;")
    
    def get_produtos_from_alteracoes(self, id_agendamento:int = 0):
        return self.access.custom_select_query("SELECT DISTINCT p.*\
                                                 FROM alteracoes_agend al\
                                                 JOIN produtos_agend p\
                                                 JOIN agendamento a\
                                                 ON al.id_prod_alt = p.id_prod AND p.id_agend_prod = a.id_agend\
                                                 WHERE a.id_agend = %s;", (id_agendamento,))
    
    def get_composicao_from_alteracoes(self, id_produto:int = 0):
        return self.access.custom_select_query("SELECT DISTINCT c.*\
                                                 FROM alteracoes_agend al\
                                                 JOIN produtos_agend p\
                                                 JOIN agendamento a\
                                                 JOIN comp_agend c\
                                                 ON al.id_prod_alt = p.id_prod AND p.id_agend_prod = a.id_agend AND al.id_comp_alt = c.id_comp\
                                                 WHERE p.id_prod = %s;", (id_produto,))
    
    def get_all_agendamentos_in_compras(self):
        return self.access.custom_select_query("SELECT DISTINCT a.*\
                                                 FROM compras_agend ca\
                                                 JOIN produtos_agend p\
                                                 JOIN agendamento a\
                                                 ON ca.id_prod_compra = p.id_prod AND p.id_agend_prod = a.id_agend;")
    
    def get_produtos_from_compras(self, id_agendamento:int = 0):
        return self.access.custom_select_query("SELECT DISTINCT p.*\
                                                 FROM compras_agend ca\
                                                 JOIN produtos_agend p\
                                                 JOIN agendamento a\
                                                 ON ca.id_prod_compra = p.id_prod AND p.id_agend_prod = a.id_agend\
                                                 WHERE a.id_agend = %s;", (id_agendamento,))
    
    def get_composicao_from_compras(self, id_produto:int = 0):
        return self.access.custom_select_query("SELECT DISTINCT c.*\
                                                 FROM compras_agend ca\
                                                 JOIN produtos_agend p\
                                                 JOIN agendamento a\
                                                 JOIN comp_agend c\
                                                 ON ca.id_prod_compra = p.id_prod AND p.id_agend_prod = a.id_agend AND ca.id_comp_compra = c.id_comp\
                                                 WHERE p.id_prod = %s;", (id_produto,))
        
    def get_composicoes_from_compras(self):
        return self.access.custom_select_query("SELECT * FROM compras_agend;")
    
    def insert_excel_upload(self, upload_tuple: tuple):
        """Insere um registro de upload de Excel"""
        self.access.custom_i_u_query(
            "INSERT INTO excel_uploads (uuid, filename) VALUES (%s, %s);",
            [upload_tuple]
        )

    def get_excel_upload(self, uuid: str):
        """Busca um registro de upload pelo uuid"""
        return self.access.custom_select_query(
            "SELECT * FROM excel_uploads WHERE uuid = %s;", (uuid,)
        )[0]

    def test_connection(self):
        return self.access

    def delete_alteracoes_by_agendamento(self, id_agendamento: int):
        return self.access.custom_i_u_query(
            """
            DELETE al
            FROM alteracoes_agend al
            JOIN produtos_agend p ON p.id_prod = al.id_prod_alt
            WHERE p.id_agend_prod = %s;
            """,
            [(id_agendamento,)]
        )

    def delete_compras_by_agendamento(self, id_agendamento: int):
        return self.access.custom_i_u_query(
            """
            DELETE ca
            FROM compras_agend ca
            JOIN produtos_agend p ON p.id_prod = ca.id_prod_compra
            WHERE p.id_agend_prod = %s;
            """,
            [(id_agendamento,)]
        )

    def delete_composicoes_by_agendamento(self, id_agendamento: int):
        return self.access.custom_i_u_query(
            """
            DELETE FROM comp_agend 
            WHERE id_prod_comp IN (
                SELECT id_prod 
                FROM produtos_agend 
                WHERE id_agend_prod = %s
            );
            """,
            [(id_agendamento,)]
        )

    def delete_produtos_by_agendamento(self, id_agendamento: int):
        return self.access.custom_i_u_query(
            "DELETE FROM produtos_agend WHERE id_agend_prod = %s;",
            [(id_agendamento,)]
        )
            
    def exists_agendamento_ml(self, ml_id: str) -> bool:
        """Verifica se um agendamento com um id_agend_ml específico já existe."""
        # CORREÇÃO: Usa um placeholder (%s) em vez de f-string para segurança.
        sql = f"SELECT 1 FROM agendamento WHERE id_agend_ml = %s LIMIT 1"
        return bool(self.access.custom_select_query(sql, (ml_id,)))

    def delete_agendamento_completo(self, id_agend_bd: int) -> bool:
        """
        Exclusão COMPLETA e segura (transação única) de um agendamento e tudo que é
        derivado dele nas tabelas do jp_bd.

        Importante:
        - id_agend_bd (INT) = agendamento.id_agend
        - id_agend_ml (VARCHAR) = agendamento.id_agend_ml
        - Tabelas agendamento_produto_bipagem* usam coluna chamada id_agend_ml, mas no dump ela é INT
          e representa o id_agend_bd (não o VARCHAR do ML).
        """

        if not self.access:
            raise RuntimeError("Access não configurado no DatabaseController.")

        con = getattr(self.access, "con", None)
        if not con:
            raise RuntimeError("Conexão (self.access.con) não disponível para transação segura.")

        con.start_con()
        db = con.db
        cur = con.cursor

        try:
            # Transação única (sem commits parciais)
            db.start_transaction()

            # Lock do agendamento alvo para evitar corrida enquanto deleta
            cur.execute(
                "SELECT id_agend_ml FROM agendamento WHERE id_agend = %s FOR UPDATE;",
                (id_agend_bd,)
            )
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Agendamento (id_agend={id_agend_bd}) não encontrado.")

            id_agend_ml = row[0]

            # ==========================================================
            # 1) Tabelas que dependem do id_agend_bd (INT)
            # ==========================================================

            # (a) bipagem / equivalentes (coluna id_agend_ml = INT no dump, na prática é id_agend_bd)
            cur.execute("DELETE FROM agendamento_produto_bipagem_equivalentes WHERE id_agend_ml = %s;", (id_agend_bd,))
            cur.execute("DELETE FROM agendamento_produto_bipagem WHERE id_agend_ml = %s;", (id_agend_bd,))

            # (b) sistema antigo de caixas (se existir no seu ambiente)
            # apaga itens das caixas daquele agendamento
            cur.execute(
                """
                DELETE ci
                FROM caixa_itens ci
                JOIN caixas c ON c.id = ci.caixa_id
                WHERE c.agendamento_id = %s;
                """,
                (id_agend_bd,)
            )
            # apaga as caixas do agendamento
            cur.execute("DELETE FROM caixas WHERE agendamento_id = %s;", (id_agend_bd,))

            # ==========================================================
            # 2) Tabelas que dependem do id_agend_ml (VARCHAR)
            # ==========================================================
            if id_agend_ml:
                # expedição / embalagem
                cur.execute("DELETE FROM expedicao_caixas_bipadas WHERE id_agend_ml = %s;", (id_agend_ml,))
                cur.execute("DELETE FROM embalagem_bipados WHERE id_agend_ml = %s;", (id_agend_ml,))

                # pallets (itens -> pallets)
                cur.execute("DELETE FROM embalagem_pallet_itens WHERE id_agend_ml = %s;", (id_agend_ml,))
                cur.execute("DELETE FROM embalagem_pallets WHERE id_agend_ml = %s;", (id_agend_ml,))

                # caixas (itens -> caixas)
                # (mesmo que exista FK com CASCADE, deletar itens antes deixa robusto)
                cur.execute("DELETE FROM embalagem_caixa_itens WHERE id_agend_ml = %s;", (id_agend_ml,))
                cur.execute("DELETE FROM embalagem_caixas WHERE id_agend_ml = %s;", (id_agend_ml,))

                # relatório do agendamento
                cur.execute("DELETE FROM relatorio_agend WHERE id_agend_ml = %s;", (id_agend_ml,))

            # JSON do agendamento (usa os dois em ambientes diferentes)
            cur.execute(
                "DELETE FROM agendamento_json WHERE id_agend = %s OR id_agend_ml = %s;",
                (id_agend_bd, id_agend_ml)
            )

            # ==========================================================
            # 2.1) Equivalências (confirmado: 100% por agendamento)
            # - Faz checagens para não quebrar em ambientes com schema diferente
            # ==========================================================
            def _table_exists(table_name: str) -> bool:
                # MySQL: checa no schema atual
                cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = DATABASE()
                      AND table_name = %s
                    LIMIT 1;
                    """,
                    (table_name,)
                )
                return cur.fetchone() is not None

            def _has_col(table_name: str, col_name: str) -> bool:
                # MySQL: checa no schema atual
                cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = DATABASE()
                      AND table_name = %s
                      AND column_name = %s
                    LIMIT 1;
                    """,
                    (table_name, col_name)
                )
                return cur.fetchone() is not None

            if _table_exists("equivalencias_produtos"):
                conds = []
                params = []

                if _has_col("equivalencias_produtos", "id_agend"):
                    conds.append("id_agend = %s")
                    params.append(id_agend_bd)

                if id_agend_ml and _has_col("equivalencias_produtos", "id_agend_ml"):
                    conds.append("id_agend_ml = %s")
                    params.append(id_agend_ml)

                # Só executa se achou pelo menos uma coluna válida
                if conds:
                    cur.execute(
                        f"DELETE FROM equivalencias_produtos WHERE {' OR '.join(conds)};",
                        tuple(params)
                    )

            # ==========================================================
            # 3) Histórico / comps / produtos (via JOIN para não estourar IN)
            # ==========================================================
            cur.execute(
                """
                DELETE al
                FROM alteracoes_agend al
                JOIN produtos_agend p ON p.id_prod = al.id_prod_alt
                WHERE p.id_agend_prod = %s;
                """,
                (id_agend_bd,)
            )

            cur.execute(
                """
                DELETE ca
                FROM compras_agend ca
                JOIN produtos_agend p ON p.id_prod = ca.id_prod_compra
                WHERE p.id_agend_prod = %s;
                """,
                (id_agend_bd,)
            )

            cur.execute(
                """
                DELETE c
                FROM comp_agend c
                JOIN produtos_agend p ON p.id_prod = c.id_prod_comp
                WHERE p.id_agend_prod = %s;
                """,
                (id_agend_bd,)
            )

            cur.execute("DELETE FROM produtos_agend WHERE id_agend_prod = %s;", (id_agend_bd,))

            # ==========================================================
            # 4) Por último: agendamento
            # ==========================================================
            cur.execute("DELETE FROM agendamento WHERE id_agend = %s;", (id_agend_bd,))

            db.commit()
            return True

        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            raise

        finally:
            try:
                con.close_con()
            except Exception:
                pass
    
    def update_expedicao_inicio(self, id_agend_bd: int):
        if not self.access:
            raise RuntimeError("Access não configurado no DatabaseController.")
        self.access.custom_i_u_query(
            "UPDATE agendamento SET expedicao_inicio = NOW() WHERE id_agend = %s AND expedicao_inicio IS NULL;",
            [(id_agend_bd,)]
        )
        
    def update_expedicao_fim(self, id_agend_bd: int):
        if not self.access:
            raise RuntimeError("Access não configurado no DatabaseController.")
        self.access.custom_i_u_query(
            "UPDATE agendamento SET expedicao_fim = NOW() WHERE id_agend = %s;",
            [(id_agend_bd,)]
        )
        
    def get_relatorio_by_agendamento_ml(self, id_agend_ml: str):
        """ Busca um relatório existente na tabela pelo id_agend_ml. """
        query = "SELECT relatorio FROM relatorio_agend WHERE id_agend_ml = %s;"
        result = self.access.custom_select_query(query, (id_agend_ml,))
        # Retorna o conteúdo do JSON (primeira coluna da primeira linha) ou None se não encontrar
        return result[0][0] if result else None

    def salvar_relatorio(self, id_agend_ml: str, relatorio_json: str):
        """ Insere ou atualiza o relatório de um agendamento. """
        query = """
            INSERT INTO relatorio_agend (id_agend_ml, relatorio) 
            VALUES (%s, %s) 
            ON DUPLICATE KEY UPDATE relatorio = VALUES(relatorio);
        """
        self.access.custom_i_u_query(query, [(id_agend_ml, relatorio_json)])
    
    def get_caixas_by_agendamento_ml(self, id_agend_ml: str) -> list:
        """
        Busca todas as caixas e seus respectivos itens para um determinado agendamento.
        Retorna uma lista de dicionários, onde cada dicionário representa uma caixa.
        """
        # Primeiro, busca todas as caixas do agendamento
        query_caixas = "SELECT caixa_num FROM embalagem_caixas WHERE id_agend_ml = %s ORDER BY caixa_num"
        caixas_result = self.access.custom_select_query(query_caixas, (id_agend_ml,))
        
        # Converte a lista de tuplas para uma lista simples de números de caixa
        numeros_caixas = [row[0] for row in caixas_result]
        
        resultado_final = []
        if not numeros_caixas:
            return resultado_final

        # Para cada caixa, busca seus itens
        for num in numeros_caixas:
            query_itens = """
                SELECT sku, quantidade 
                FROM embalagem_caixa_itens 
                WHERE id_agend_ml = %s AND caixa_num = %s
            """
            itens_result = self.access.custom_select_query(query_itens, (id_agend_ml, num))
            
            itens_da_caixa = [
                {"sku": item[0], "quantidade": item[1]} for item in itens_result
            ]
            
            resultado_final.append({
                "caixa_num": num,
                "itens": itens_da_caixa
            })
            
        return resultado_final
    
    def set_expedicao_inicio(self, id_agend_bd: int, ts: datetime) -> None:
        """
        Define explicitamente o timestamp de início de expedição para um agendamento.
        Compatível com MySQL (placeholders %s) e com seu wrapper custom_i_u_query.
        """
        self.access.custom_i_u_query(
            "UPDATE agendamento SET expedicao_inicio = %s WHERE id_agend = %s;",
            [(ts, id_agend_bd)]
        )


    def set_expedicao_fim(self, id_agend_bd: int, ts: datetime) -> None:
        """
        Define explicitamente o timestamp de término de expedição para um agendamento.
        Compatível com MySQL (placeholders %s) e com seu wrapper custom_i_u_query.
        """
        self.access.custom_i_u_query(
            "UPDATE agendamento SET expedicao_fim = %s WHERE id_agend = %s;",
            [(ts, id_agend_bd)]
        )