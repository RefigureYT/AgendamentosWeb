from main import app, render_template

DB_CONFIG = {
    "host": "192.168.15.200",
    "port": 3306,
    "user": "Bruno_Lallo",
    "password": "ji}dx(v{M,z2j+f>[/}%_Vr-0?nI}W*@Dw68NnHJ+tMu&ZkF",
    "database": "jp_bd",
    "autocommit": True,
}

""" Leva para a página 'config' """
@app.route('/config')
def config():
    return render_template('config.html')