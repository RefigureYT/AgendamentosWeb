from main import app, render_template, session

""" Leva para a página 'index' e cria varíaveis na sessão """
@app.route('/')
def homepage():
    session['id_agendamento'] = ''
    session['agend_process_done'] = False
    session['estoque_tiny_done'] = False
    return render_template('index.html')