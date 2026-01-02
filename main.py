from flask import (
    Flask, render_template, request, flash, redirect, url_for, session,
    jsonify, send_from_directory, send_file, after_this_request, abort, Response
)
from flask import session as flask_session, request as flask_request, redirect as flask_redirect, url_for as flask_url_for

from base_jp_lab import Access, Caller
from classes import AgendamentoController, DatabaseController
from flask_cors import CORS
import pandas as pd
import os
import threading
from datetime import timedelta
from exceptions import ParametroInvalido, MetodoInvalido, LimiteRequests, ArquivoInvalido
# Remova SocketIO se não for usar agora:
# from flask_socketio import SocketIO, join_room, emit

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except ModuleNotFoundError:
    pass

## Configuração de desenvolvimento e produção
DEBUG=True  # Mude para False em produção
PORT= 44523 if DEBUG == True else 8345 # 8345 se produção
## FIM Configuração

from psycopg2.pool import ThreadedConnectionPool  # Para PostgreSQL (thread-safe)
PG_DSN = "postgresql://postgres:fa02a5fc917ea31de761c22fc956a0b2@192.168.15.121:5432/api"


UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf", "csv", "xlsx"}

app = Flask(__name__)
CORS(app)

# ✅ Secret + nome do cookie por ambiente (DEV vs PROD)
if DEBUG:
    app.secret_key = (os.getenv("AGW_SECRET_KEY_DEV") or "dev_test_key_change_me")
    session_cookie_name = os.getenv("AGW_SESSION_COOKIE_NAME_DEV", "agw_session_dev_agendamentosweb_v1")
else:
    app.secret_key = (os.getenv("AGW_SECRET_KEY_PROD") or "prod_test_key_change_me")
    session_cookie_name = os.getenv("AGW_SESSION_COOKIE_NAME_PROD", "agw_session_prod_agendamentosweb_v1")

app.config.update(
    SESSION_COOKIE_NAME=session_cookie_name,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=(not DEBUG),  # em prod (https) True
    SESSION_COOKIE_PATH="/",
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# -----------------------------------------------------------------------------
# Postgres pool "lazy" (cria conexões só quando o worker realmente usar)
# - Evita conexão pré-fork (uWSGI preload), que causa "server closed connection..."
# - Ativa keepalive para reduzir conexões stales
# -----------------------------------------------------------------------------
_pg_pool_lock = threading.Lock()
_pg_pool_real = None

def _get_pg_pool_real():
    global _pg_pool_real
    if _pg_pool_real is not None:
        return _pg_pool_real

    with _pg_pool_lock:
        if _pg_pool_real is None:
            _pg_pool_real = ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=PG_DSN,
                connect_timeout=5,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
                application_name="AgendamentosWeb",
            )
    return _pg_pool_real

class LazyPGPool:
    def getconn(self):
        return _get_pg_pool_real().getconn()

    def putconn(self, conn, close=False):
        return _get_pg_pool_real().putconn(conn, close=close)

    def closeall(self):
        p = _get_pg_pool_real()
        try:
            p.closeall()
        except Exception:
            pass

app.config["PG_POOL"] = LazyPGPool()

# Exporta também como variável para outros módulos poderem importar direto
PG_POOL = app.config["PG_POOL"]

# -------------------------------
# Proteção de rotas por login
# -------------------------------
@app.before_request
def require_login():
    open_endpoints = {
        'auth.login',
        'static',
        'retirado.api_bipar',
        'retirado.api_bipados_agend',
        'health_check',
        'healthz'
    }

    ep = flask_request.endpoint or ''
    path = flask_request.path or ''

    if ep not in open_endpoints and 'id_usuario' not in flask_session:
        path = flask_request.path or ""

        # ✅ API não redireciona (evita 200 com HTML do login em fetch)
        if path.startswith("/api/"):
            return jsonify(ok=False, error="Não autenticado"), 401

        return flask_redirect(flask_url_for('auth.login'))

# -------------------------------

# 1) conexão DB (mantenho como está; ideal: ler de env)
access = Access(
    "Bruno_Lallo",
    "ji}dx(v{M,z2j+f>[/}%_Vr-0?nI}W*@Dw68NnHJ+tMu&ZkF",
    "192.168.15.200",
    "3306",
    "jp_bd",
)

# 2) Caller Tiny usando a MESMA instância de Access
caller = Caller(access, "tiny")

# # =====================================================================
# # === INÍCIO DO CÓDIGO DE TESTE (TEMPORÁRIO) \===
# # =====================================================================
# print("\n--- SIMULANDO TOKEN EXPIRADO ---")
# # Força um token inválido no header da sessão do Caller.
# # Isso fará com que a primeira requisição falhe com erro 403.
# caller.session.headers.update({'Authorization': 'Bearer aaaa'}) 
# print(f"Header de autorização foi forçado para: {caller.session.headers['Authorization']}")
# print("--- FIM DA SIMULAÇÃO ---\n")
# # =====================================================================
# # === FIM DO CÓDIGO DE TESTE ===
# # =====================================================================


# 3) Controllers
db_controller = DatabaseController(access)
agendamento_controller = AgendamentoController(db_controller, caller)

app.config.update({
    'ACCESS': access,
    'CALLER': caller,
    'AG_CTRL': agendamento_controller,
    'DB_CTRL': db_controller
})

# Blueprints
from rotas.auth import bp_auth
app.register_blueprint(bp_auth)

from rotas.retiradoEstoque import bp_retirado
app.register_blueprint(bp_retirado)

from rotas.embalar import bp_embalar
app.register_blueprint(bp_embalar)

# >>> recupera funcionalidades antigas <<<
from rotas.expedicao import bp_expedicao
app.register_blueprint(bp_expedicao)

from rotas.despacho import bp_despacho
app.register_blueprint(bp_despacho)

from rotas.relatorio import bp_relatorio
app.register_blueprint(bp_relatorio)

# Demais rotas (home, agendamentos, etc.)
from rotas import *

if __name__ == "__main__":
    # debug opcional; ajuste a gosto
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
    
# -----------------------------------------------------------------------------
# SOBRE O USO DE SocketIO (opcional)
# -----------------------------------------------------------------------------
# O que é:
#   - Flask-SocketIO habilita comunicação em tempo real (WebSocket/fallbacks).
#   - Útil para: progresso ao vivo, notificações instantâneas, contadores, sala
#     de "expedição" recebendo eventos de bipagem, etc.
#
# Quando manter:
#   - Só se você TIVER eventos em tempo real (emit/on) no back e front.
#   - Se hoje não há nenhum "emit"/"socketio.on" no projeto, você pode REMOVER
#     os imports e o run com SocketIO sem prejuízo.
#
# O que fazer AGORA:
#   • NÃO vai usar tempo real agora:
#       - Remova: `from flask_socketio import SocketIO, join_room, emit`
#       - Mantenha: `app.run(host="0.0.0.0", port=8345, debug=True)`
#
#   • Vai usar tempo real (dev/local):
#       1) from flask_socketio import SocketIO
#       2) socketio = SocketIO(app, cors_allowed_origins="*")  # em prod, restrinja CORS!
#       3) Substitua o app.run(...) por:
#             socketio.run(app, host="0.0.0.0", port=8345, debug=True)
#
#   • Deploy em produção com tempo real:
#       - Use Gunicorn com eventlet (ou gevent) para suportar WebSockets:
#           gunicorn -k eventlet -w 1 -b 0.0.0.0:8345 main:app
#         (assumindo que seu arquivo é main.py e o objeto Flask se chama `app`)
#
#       - VÁRIOS workers/containers? Use fila (Redis) para sincronizar eventos:
#           socketio = SocketIO(app, message_queue="redis://redis:6379/0",
#                                cors_allowed_origins=["https://seu-dominio"])
#           gunicorn -k eventlet -w 4 -b 0.0.0.0:8345 main:app
#
#       - Observações:
#           • Prefira eventlet/gevent; uWSGI padrão não lida bem com WebSockets.
#           • Defina `app.secret_key` via variável de ambiente em produção.
#           • Restrinja CORS (NÃO deixe "*" em prod).
#
# Resumo:
#   - Se não houver necessidade de "tempo real" agora, remova SocketIO e siga
#     com `app.run(...)`. Se precisar no futuro, ative conforme indicado acima.
# -----------------------------------------------------------------------------