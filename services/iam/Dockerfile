FROM node:20-alpine3.21

RUN apk add --no-cache curl ca-certificates

# Create non-root user trước để dùng --chown trong COPY (tránh chown -R chậm)
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

WORKDIR /app
RUN chown appuser:appuser /app

USER appuser

# Install dependencies as appuser (files owned by appuser ngay từ đầu)
COPY --chown=appuser:appuser package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts

# Copy webpack bundle
COPY --chown=appuser:appuser dist/services/iam/ .

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3001}/health || exit 1

CMD ["node", "main.js"]
