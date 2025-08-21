#!/bin/bash
# Nome da imagem com o endereço do repositório privado
IMAGE_NAME="192.168.15.102:5000/agendamentos-web:latest"
echo "⏳ Buildando imagem Docker..."
docker build -t $IMAGE_NAME .
echo "✅ Build finalizado. Enviando para o registry..."
docker push $IMAGE_NAME
echo "🚀 Imagem enviada com sucesso: $IMAGE_NAME"
