from main import app, render_template

@app.route('/reservados')
def reservados():
    # aqui você pode buscar os "reservados" no banco e passar ao template
    dados_reservados = []  # substitua pela sua lógica
    return render_template('reservados.html', dados=dados_reservados)
