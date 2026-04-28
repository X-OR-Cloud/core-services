FROM node:20-alpine3.21

RUN apk add --no-cache curl ca-certificates

RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

WORKDIR /app
RUN chown appuser:appuser /app

USER appuser

# node_modules (native addons) pre-installed into dist/ by Phase 2 build script
COPY --chown=appuser:appuser dist/services/mona/ .

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3005}/health || exit 1

CMD ["node", "main.js"]
