from main import app, agendamento_controller, jsonify

@app.route("/health")
def health_check():
    try:
        # Test database connection
        agendamento_controller.test_connection()
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500
