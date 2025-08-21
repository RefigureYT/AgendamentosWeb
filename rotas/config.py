from main import app, render_template

""" Leva para a página 'config' """
@app.route('/config')
def config():
    return render_template('config.html')