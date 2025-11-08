#!/bin/bash

# Telegram ↔ WhatsApp Bridge - Deployment Script
# This script builds a multi-platform Docker image and pushes to Docker Hub
# Watchtower on your Pi will automatically pull and deploy the update

set -e  # Exit on any error

echo "🚀 Building and deploying Telegram-WhatsApp Bridge..."
echo ""

# Load .env file if it exists
if [ -f .env ]; then
    echo "📄 Loading configuration from .env file..."
    export $(grep -v '^#' .env | grep 'YOUR_DOCKERHUB_USERNAME' | xargs)
fi

# Check if YOUR_DOCKERHUB_USERNAME is set
if [ -z "$YOUR_DOCKERHUB_USERNAME" ]; then
    echo "❌ Error: YOUR_DOCKERHUB_USERNAME is not set"
    echo ""
    echo "Please add it to your .env file:"
    echo "   YOUR_DOCKERHUB_USERNAME=your_username"
    echo ""
    echo "Or set it as environment variable:"
    echo "   export YOUR_DOCKERHUB_USERNAME=\"your_username\""
    echo "   ./deploy.sh"
    echo ""
    exit 1
fi

echo "✅ Docker Hub username: $YOUR_DOCKERHUB_USERNAME"

# Check if Docker buildx is available
if ! docker buildx version > /dev/null 2>&1; then
    echo "❌ Error: Docker buildx is not available"
    echo "   Install it with: docker buildx install"
    exit 1
fi

# Check if Docker credentials exist (more reliable than 'docker info')
if [ ! -f ~/.docker/config.json ] || ! grep -q "auths" ~/.docker/config.json; then
    echo "⚠️  Not logged in to Docker Hub"
    echo "   Run: docker login"
    exit 1
fi

echo "✅ Docker Hub credentials found"

echo "📦 Building multi-platform image..."
echo "   Platforms: linux/arm64 (Raspberry Pi), linux/amd64 (x86)"
echo "   Image: docker.io/${YOUR_DOCKERHUB_USERNAME}/tgwabridge:latest"
echo ""

# Build and push multi-platform Docker image
# --platform: Build for both ARM64 (Pi) and AMD64 (regular PCs)
# --push: Automatically push to Docker Hub after building
# -t: Tag the image
# IMPORTANT: Replace YOUR_DOCKERHUB_USERNAME with your actual Docker Hub username
docker buildx build \
    --platform linux/arm64,linux/amd64 \
    -t docker.io/${YOUR_DOCKERHUB_USERNAME}/tgwabridge:latest \
    --push \
    .

echo ""
echo "✅ Build and push completed successfully!"
echo ""
echo "🔄 Watchtower will automatically:"
echo "   1. Detect the new image on Docker Hub"
echo "   2. Pull it to your Raspberry Pi"
echo "   3. Stop the old container"
echo "   4. Start the new container"
echo "   5. Clean up old images"
echo ""
echo "⏱️  This usually takes 1-2 minutes."
echo "📊 Check status on Pi: docker-compose logs -f"
echo ""
echo "🎉 Deployment initiated!"

