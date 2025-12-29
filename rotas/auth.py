# rotas/auth.py
from flask import (
    Blueprint,
    render_template,
    request,
    redirect,
    url_for,
    session,
    flash
)
from hashlib import sha256
from base_jp_lab import Access

bp_auth = Blueprint(
    'auth',
    __name__,
    template_folder='../templates'   # ajusta se necessário
)

# instância de acesso; se preferir, mova para um arquivo de config comum
access = Access(
    "Bruno_Lallo",
    "ji}dx(v{M,z2j+f>[/}%_Vr-0?nI}W*@Dw68NnHJ+tMu&ZkF",
    "192.168.15.200",
    "3306",
    "jp_bd",
)

def render_error_page(error_title, error_msg, referrer):
    return render_template(
        'error_page.html',
        error_title=error_title,
        error_msg=error_msg,
        referrer=referrer
    )

@bp_auth.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')

    usuario = request.form.get('usuario', '').strip()
    senha    = request.form.get('senha', '')

    rows = access.custom_select_query(
        "SELECT id_usuario, nome_usuario, nome_display_usuario, senha_usuario, role "
        "FROM usuarios WHERE nome_usuario = %s",
        (usuario,)
    )

    # Se não encontrou ou a senha não bate, retorna o mesmo erro genérico
    if not rows or sha256(senha.encode()).hexdigest() != rows[0][3]:
        return render_template('login.html', login_error="Usuário ou senha incorretos")

    # Autenticação ok
    user_id, _, display_name, _, role = rows[0]
    session.clear()
    session.permanent = True  # ✅ usa PERMANENT_SESSION_LIFETIME do main.py
    session['id_usuario']           = user_id
    session['nome_display_usuario'] = display_name
    session['role'] = role
    return redirect(url_for('homepage'))


@bp_auth.route('/logout')
def logout():
    session.clear()
    flash('Você saiu do sistema.', 'info')
    return redirect(url_for('auth.login'))
