# Telegram ↔ WhatsApp Bridge - Dockerfile
# This creates a Docker image that can run on your Raspberry Pi

# Use Node.js LTS (Long Term Support) on Alpine Linux for smaller image size
# Alpine is a minimal Linux distribution perfect for Docker containers
FROM node:20-alpine

# Install Chromium, Python, and build dependencies
# WhatsApp Web requires a browser (Chromium) to work
# Python and build tools are needed to compile native Node.js modules
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++

# Tell Puppeteer to skip downloading Chrome (we already have Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
# This is where our application code will live inside the container
WORKDIR /app

# Copy package files first (for better Docker layer caching)
# Docker caches layers, so if package.json doesn't change, npm install is skipped
COPY package.json package-lock.json* ./

# Install dependencies
# Note: Some packages (bufferutil, utf-8-validate) compile native code
# This requires Python and build tools installed above
RUN npm ci --omit=dev

# Copy application code
# This copies all our JavaScript files into the container
COPY index.js ./
COPY test-telegram.js ./
COPY test-whatsapp.js ./
COPY get-friend-id.js ./

# Create directory for session files
# These directories will store Telegram and WhatsApp authentication sessions
RUN mkdir -p .wwebjs_auth .wwebjs_cache && \
    chown -R node:node /app

# Switch to non-root user for security
# Running as root in containers is a security risk
USER node

# Expose no ports (this app doesn't serve HTTP)
# It only connects outbound to Telegram and WhatsApp servers

# Health check: Verify the process is still running
# Docker will restart the container if this fails
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD pgrep -f "node index.js" || exit 1

# Command to run the application
# This is what executes when the container starts
CMD ["node", "index.js"]

