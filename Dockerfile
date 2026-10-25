# Multi-stage production container for Flock Energy API Wrapper
FROM node:24-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Environment defaults
ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/api/v1/health || exit 1

# Execute service
USER node
CMD ["node", "src/index.js"]
