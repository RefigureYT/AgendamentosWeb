import mysql.connector

class Database:
    def __init__(self, user:str, password:str, host:str, port:str, name:str):
        self.user = user
        self.password = password
        self.host = host
        self.port = port
        self.name = name
        self.con = None
        self.cursor = None
    
    def __enter__(self):
        self.con = mysql.connector.connect(
            host=self.host, 
            user = self.user,
            password=self.password,
            database=self.name,
            port=self.port)
        self.cursor = self.con.cursor()

    def __exit__(self, exc_type, exc_value, exc_traceback):
        self.cursor.close()
        self.con.close()

        self.cursor = None
        self.con = None

    def custom_select_query(self, query:str) -> list|dict:
        """
        Processa uma query inteiramente feita pelo usuário
        
        Args
        ----------
            query (str): Query feita pelo usuário.
        """
        if self.con is not None:
            self.con.cursor.execute(query)
            return_val = self.con.cursor.fetchall()
            return return_val
        
    def custom_i_u_query(self, query:str, data:list) -> None:
        """
        Insere ou altera dados no banco baseado na query e nos dados enviados pelo usuário
        
        Args
        ----------
            query (str): Query feita pelo usuário.
            data (list): Lista com os dados que serão inseridos
        """
        self.con.cursor.executemany(query, data)
        self.con.db.commit()
        print('Dados inseridos/alterados')
        return