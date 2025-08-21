from main import app, db_controller, render_template
import pandas as pd, os

@app.route('/view-excel/<uuid>')
def show_excel(uuid):
    rec = db_controller.get_excel_upload(uuid)
    _, _, filename, _ = rec
    path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    df = pd.read_excel(path, engine='openpyxl')
    html = df.to_html(classes='table table-striped table-hover', index=False)
    return render_template('view_excel.html', filename=filename, data_table=html)

