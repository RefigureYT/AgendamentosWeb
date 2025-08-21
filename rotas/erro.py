from main import app, render_template, ParametroInvalido, MetodoInvalido, LimiteRequests, ArquivoInvalido

def error_handler(err):
    err_txt = err.description.split('///')
    return render_template("erro.html", erro_title=err_txt[0], erro_msg_primary=err_txt[1], erro_msg_secondary=err_txt[2], erro_code=err.code)

app.register_error_handler(ParametroInvalido, error_handler)
app.register_error_handler(MetodoInvalido, error_handler)
app.register_error_handler(LimiteRequests, error_handler)
app.register_error_handler(ArquivoInvalido, error_handler)