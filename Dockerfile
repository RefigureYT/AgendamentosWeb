FROM python:3.12.7

# Instalação de dependências do sistema operacional
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    python3-dev \
    build-essential \
    ghostscript \
&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
# Atualiza o pip e instala as dependências do requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


COPY . /app
# Instala seu pacote local
RUN pip install --no-cache-dir ./base_jp_lab
RUN pip install --no-cache-dir uwsgi ghostscript

EXPOSE 8345

# CMD ["gunicorn", "-w", "4", "-k", "gevent", "-b", "0.0.0.0:8345", "main:app"]

# Comando para iniciar a aplicação com uWSGI
# Você precisará ajustar 'main:app' para o caminho correto do seu aplicativo WSGI.
# Por exemplo, se sua aplicação Flask/Django é um objeto chamado 'app' dentro de 'main.py',
# então 'main:app' está correto.

CMD ["uwsgi", "--http", ":8345", "--module", "main", "--callable", "app", "--master", "--processes", "1", "--threads", "1", "--enable-threads", "--vacuum", "--buffer-size", "20971520", "--harakiri", "300"]
# "--buffer-size", "20971520" (Tamanho do arquivo definido até 20MB)
# "--harakiri", "300" (Timeout definido para 5 minutos)