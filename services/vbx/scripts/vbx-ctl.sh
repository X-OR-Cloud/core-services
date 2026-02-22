#!/bin/bash
# VBX Service Management Script
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

case "${1}" in
  start)
    echo "▶️  Starting VBX services..."
    systemctl start vbx-api@3370 vbx-api@3371 vbx-worker@1
    echo "✅ Started"
    ;;
  stop)
    echo "⏹  Stopping VBX services..."
    systemctl stop vbx-api@3370 vbx-api@3371 vbx-worker@1
    echo "✅ Stopped"
    ;;
  restart)
    echo "🔄 Rolling restart VBX services..."
    systemctl restart vbx-worker@1
    sleep 2
    systemctl restart vbx-api@3370
    sleep 2
    systemctl restart vbx-api@3371
    echo "✅ Rolling restart complete"
    ;;
  status)
    echo "📊 VBX Service Status:"
    echo ""
    echo "=== API Instances ==="
    systemctl status vbx-api@3370 --no-pager -l 2>/dev/null | head -6
    echo ""
    systemctl status vbx-api@3371 --no-pager -l 2>/dev/null | head -6
    echo ""
    echo "=== Worker ==="
    systemctl status vbx-worker@1 --no-pager -l 2>/dev/null | head -6
    ;;
  deploy)
    echo "🚀 Building and deploying VBX..."
    echo "  Building..."
    npx nx run vbx:build 2>&1 | tail -3
    echo "  Rolling restart..."
    bash "$0" restart
    echo "✅ Deploy complete"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|deploy}"
    exit 1
    ;;
esac
