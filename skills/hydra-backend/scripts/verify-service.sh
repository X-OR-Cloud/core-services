#!/bin/bash
# Verify a Hydra service builds and runs correctly
# Usage: ./verify-service.sh <service-name> [port]

SERVICE=${1:?Usage: verify-service.sh <service-name> [port]}
PORT=${2:-3000}
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "/root/.openclaw/workspace/hydra-services")

echo "🔍 Verifying service: $SERVICE"
echo "================================"

# 1. Build
echo -e "\n📦 Building..."
cd "$REPO_ROOT" || exit 1
npx nx run "$SERVICE:build" 2>&1
BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
  echo "❌ Build FAILED (exit code $BUILD_EXIT)"
  exit 1
fi
echo "✅ Build OK"

# 2. Check dist exists
MAIN_JS="$REPO_ROOT/dist/services/$SERVICE/main.js"
if [ ! -f "$MAIN_JS" ]; then
  echo "❌ dist/services/$SERVICE/main.js not found"
  exit 1
fi
echo "✅ Dist output exists"

# 3. Quick start test (start, wait, check health, kill)
echo -e "\n🚀 Starting service on port $PORT..."
source "$REPO_ROOT/.env" 2>/dev/null
export $(grep -v '^#' "$REPO_ROOT/.env" | xargs) 2>/dev/null
node "$MAIN_JS" &
PID=$!
sleep 5

# 4. Health check
echo "🏥 Checking health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health" 2>/dev/null)
kill $PID 2>/dev/null
wait $PID 2>/dev/null

if [ "$HEALTH" = "200" ]; then
  echo "✅ Health check OK (HTTP 200)"
else
  echo "❌ Health check FAILED (HTTP $HEALTH)"
  exit 1
fi

echo -e "\n================================"
echo "✅ Service '$SERVICE' verified successfully!"
