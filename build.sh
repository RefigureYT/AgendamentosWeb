#!/bin/bash
set -euo pipefail

IP="192.168.15.121"
REG_PORT="5000"          # Porta do Registry
NAME="agendamentos-web"
VERSION="latest"
IMAGE_NAME="${IP}:${REG_PORT}/${NAME}:${VERSION}"
APP_PORT="8345"          # Porta do app Flask

echo "⏳ Iniciando build da imagem: ${IMAGE_NAME}..."
docker build -t "${IMAGE_NAME}" .
echo "✅ Build finalizado."

echo "📦 Enviando imagem para o registry privado em ${IP}:${REG_PORT}..."
docker push "${IMAGE_NAME}"
echo "🚀 Enviado com sucesso!"

echo
echo "🔗 Para rodar o container do app:"
echo "    docker run -d --name ${NAME} -p ${APP_PORT}:${APP_PORT} ${IMAGE_NAME}"
