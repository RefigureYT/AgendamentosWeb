from main import app, request, pd, send_from_directory, redirect, url_for, ParametroInvalido
import datetime

@app.route("/compra-planilha/<extensao>", methods=['POST'])
def compra_para_csv(extensao):
    if extensao == 'excel' or extensao == 'csv' or extensao == 'pdf':
        filename = f'compras-{datetime.datetime.today().strftime('%d-%m-%Y')}.{'csv' if extensao == 'csv' else 'xlsx'}'
        df = pd.DataFrame(eval(request.form['dados']))
        if extensao == 'csv':
            df.to_csv(f'temp/{filename}', index=False, encoding='utf-8')
        elif extensao == 'excel':
            df.to_excel(f'temp/{filename}', index=False)
        elif extensao == 'pdf':
            return 'IMPLEMENTAÇÃO AINDA NÃO FEITA' # TODO Implementar construção e download de PDF
        else:
            raise ParametroInvalido()
        return redirect(url_for('download_compra', filename=filename))
    else:
        return redirect(url_for('erro', error_title='Teste', error_msg='Teste-MSG'))
    
@app.route("/download-compra/<filename>")
def download_compra(filename):
    file = send_from_directory('temp', filename)
    return file

# TODO Limpar arquivos criados após o envio. FONTE: https://stackoverflow.com/questions/53747258/flask-send-file-not-sending-file