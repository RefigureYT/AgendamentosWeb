import os, json, time, uuid, threading, traceback

from pathlib import Path

# Raiz do app (…/AgendamentosWeb)
APP_ROOT = Path(__file__).resolve().parents[1]

# Diretório das tarefas, preferencialmente persistente (volume)
# Dica: exporte TASKS_DIR=/app/runtime/tasks no serviço Docker
TASKS_DIR = os.environ.get("TASKS_DIR", str(APP_ROOT / "runtime" / "tasks"))

def _ensure_dir():
    os.makedirs(TASKS_DIR, exist_ok=True)

def _task_path(task_id: str) -> str:
    _ensure_dir()
    return os.path.join(TASKS_DIR, f"{task_id}.json")

def _write(task_id: str, data: dict) -> None:
    p = _task_path(task_id)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, p)

def _read(task_id: str) -> dict:
    p = _task_path(task_id)
    if not os.path.exists(p):
        return {"status": "nao_encontrado", "message": "Tarefa não encontrada"}
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"status": "erro", "message": "Falha ao ler status"}

def create_task(target, *, args: tuple = (), kwargs: dict = None, meta: dict = None) -> str:
    """
    Cria task em thread daemon e persiste status em disco (cross-process).
    """
    kwargs = kwargs or {}
    task_id = uuid.uuid4().hex
    _write(task_id, {
        "status": "queued",
        "message": "Fila criada",
        "created_at": time.time(),
        **(meta or {})
    })

    def _runner():
        _write(task_id, {**_read(task_id), "status": "running", "message": "Processando..."})
        try:
            result = target(task_id, *args, **kwargs)
            payload = _read(task_id)
            payload.update({"status": "success", "message": "Concluído", **(result or {})})
            _write(task_id, payload)
        except Exception as e:
            tb = traceback.format_exc(limit=5)
            _write(task_id, {"status": "error", "message": str(e), "trace": tb})

    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    return task_id

def get_task(task_id: str) -> dict:
    return _read(task_id)