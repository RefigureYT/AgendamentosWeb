from flask import (
    Flask,
    render_template,
    request,
    flash,
    redirect,
    url_for,
    session,
    jsonify,
    send_from_directory,
    send_file,
    after_this_request,
    abort,
    Response
)
from flask import session as flask_session, request as flask_request, redirect as flask_redirect, url_for as flask_url_for

from base_jp_lab import Access, Caller
from classes import AgendamentoController, DatabaseController
from flask_cors import CORS
import pandas as pd
from exceptions import (
    ParametroInvalido,
    MetodoInvalido,
    LimiteRequests,
    ArquivoInvalido
)
from flask_socketio import SocketIO, join_room, emit

# … suas constantes de upload e secret key …
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf", "csv", "xlsx"}

app = Flask(__name__)
CORS(app)

app.secret_key = "test_key"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# -------------------------------
# Proteção de rotas por login
# -------------------------------
@app.before_request
def require_login():
    # libera apenas login, estáticos e nossas APIs REST de bipagem
    open_endpoints = {
        'auth.login',               # rota de login
        'static',                   # arquivos estáticos
        'retirado.api_bipar',       # POST /api/bipar
        'retirado.api_bipados_agend'# GET  /api/bipados/<id_agend>
    }
    ep = flask_request.endpoint or ''
    if ep not in open_endpoints and 'id_usuario' not in flask_session:
        return flask_redirect(flask_url_for('auth.login'))
# -------------------------------

# 1) cria a instância de Access (MySQL) — ela já gerencia o pool
access = Access(
    "Bruno_Lallo",
    "ji}dx(v{M,z2j+f>[/}%_Vr-0?nI}W*@Dw68NnHJ+tMu&ZkF",
    "192.168.15.200",
    "3306",
    "jp_bd",
)

# 2) passa essa instância para o Caller (não a classe!)
caller = Caller(access, "tiny")

# 3) cria os controllers usando a mesma instância de Access
db_controller         = DatabaseController(access)
agendamento_controller = AgendamentoController(db_controller, caller)

# registra blueprint de autenticação
from rotas.auth import bp_auth
app.register_blueprint(bp_auth)

# registra blueprint de retirada de estoque (bipagem)
from rotas.retiradoEstoque import bp_retirado
app.register_blueprint(bp_retirado)

from rotas.embalar import bp_embalar
app.register_blueprint(bp_embalar)

# registra as demais rotas da sua aplicação (homepage, agendamentos, etc.)
from rotas import *

if __name__ == "__main__":
    # veja seu mapa de URLs já com retiradoEstoque registrado
    # print(app.url_map)
    app.run(host='0.0.0.0', port=8345, debug=True)
