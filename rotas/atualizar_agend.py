from main import app, redirect, url_for, request, caller
from collections import Counter

""" Faz o BackEnd atualizar partes de um kit que foram alterados no tiny """
# NÃO FOI REPASSADO PARA A NOVA INFRA
@app.route('/atualizar')
def atualizar_agend():
    bd_data = caller.access.custom_select_query(f'SELECT  p.id_prod_tiny, c.id_comp_tiny FROM comp_agend c JOIN produtos_agend p WHERE id_prod_comp = {request.args['prod_id']} AND c.id_prod_comp = p.id_prod;')
    id_tiny = bd_data[0][0]
    ids_comp = [int(i[1]) for i in bd_data]
    resp = caller.make_call(f'produtos/{id_tiny}/kit')
    ids_kit = [i['produto']['id'] for i in resp]
    if Counter(ids_comp) == Counter(ids_kit):
        print("TUDO IGUAL")
    else:
        print(ids_comp)
        print(ids_kit)
        remove = [(i, request.args['prod_id']) for i in ids_comp if i not in ids_kit]
        caller.access.custom_i_u_query('UPDATE comp_agend SET substituido_comp = 1 WHERE id_comp_tiny = %s AND id_prod_comp = %s', remove)
    return redirect(url_for('retirado_estoque', id=request.args['id'], tipo=request.args['tipo']))