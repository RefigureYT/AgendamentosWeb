from werkzeug.exceptions import HTTPException

class ParametroInvalido(HTTPException):
    code = 1
    description = "Parâmetro inválido///Sempre navegue pelo site através dos botões disponíveis!///Caso não tenha alterado a URL, entre em contato com um supervisor e informe o código do erro."
    # ? "///" está sendo usádo para que possamos separar essa string futuramente
    
class MetodoInvalido(HTTPException):
    code = 2
    description = "Método inválido///Método não pode ser usado nesse endpoint.///Navegue sempre por dentro do site, não utilize outras ferramentas para extrair dados!"
    
class LimiteRequests(HTTPException):
    code = 3
    description = "Muitos requests///Muitos requests foram feitos e a API te desconectou.///Espere alguns segundos e tente novamente."
    
class ArquivoInvalido(HTTPException):
    code = 4
    description = "Arquivo inválido///Algo no arquivo não o deixa ser baixado.///Insira apenas PDFs de agendamento do Mercado Livre."