#!/bin/bash
set -euo pipefail

IP="192.168.15.121"
REG_PORT="5000"          # Porta do Registry
NAME="agendamentos-web"
VERSION="latest"
IMAGE_NAME="${IP}:${REG_PORT}/${NAME}:${VERSION}"
APP_PORT="8345"          # Porta do app Flask

# ---------------- Guardas anti-debug antes do build ----------------
if [[ "${ALLOW_DEBUG:-0}" != "1" ]]; then
    echo "🔍 Verificando flags de DEBUG no código e configs..."

    # 1) debug=True em chamadas .run(...)
    if grep -RInE '^[[:space:]]*[^#]*\.(run)\([^)]*debug[[:space:]]*=[[:space:]]*True' . --include='*.py' 2>/dev/null; then
        echo "❌ Abortado: encontrado 'debug=True' em chamada .run(...)." ; exit 12
    fi

    # 2) app.debug = True em qualquer lugar
    if grep -RInE '^[[:space:]]*[^#]*app\.debug[[:space:]]*=[[:space:]]*True' . --include='*.py' 2>/dev/null; then
        echo "❌ Abortado: encontrado 'app.debug = True' no código." ; exit 13
    fi

    # 3) FLASK_DEBUG=1 ou FLASK_ENV=development em arquivos de build/deploy
    if grep -RInE 'FLASK_DEBUG[[:space:]]*=[[:space:]]*1|FLASK_ENV[[:space:]]*=[[:space:]]*development' . \
        --include='Dockerfile' --include='.env*' --include='docker-compose*.yml' --include='docker-compose*.yaml' 2>/dev/null; then
        echo "❌ Abortado: encontrado FLASK_DEBUG=1 ou FLASK_ENV=development em arquivos de deploy." ; exit 14
    fi

    echo "✅ Nenhum indicador de debug encontrado. Prosseguindo com o build."
    else
    echo "⚠️  ALLOW_DEBUG=1 definido — ignorando verificações de debug (uso consciente!)."
    fi
# -------------------------------------------------------------------

echo "⏳ Iniciando build da imagem: ${IMAGE_NAME}..."
docker build -t "${IMAGE_NAME}" .
echo "✅ Build finalizado."

echo "📦 Enviando imagem para o registry privado em ${IP}:${REG_PORT}..."
docker push "${IMAGE_NAME}"
echo "🚀 Enviado com sucesso!"

echo
echo "🔗 Para rodar o container do app:"
echo "    docker run -d --name ${NAME} -p ${APP_PORT}:${APP_PORT} ${IMAGE_NAME}"
