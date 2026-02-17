#!/bin/bash
# PAG Service Control Script
# Usage: pag-ctl.sh {start|stop|restart|status|deploy|logs}

set -e

API_PORTS="3360 3361"
WORKER_IDS="1 2 3"
WORK_DIR="/root/.openclaw/workspace/hydra-services"

api_units() {
  for p in $API_PORTS; do echo "pag-api@${p}.service"; done
}

worker_units() {
  for w in $WORKER_IDS; do echo "pag-worker@${w}.service"; done
}

all_units() {
  api_units
  worker_units
}

case "$1" in
  start)
    echo "▶ Starting PAG services..."
    systemctl start $(all_units)
    echo "✅ All PAG services started"
    ;;
  stop)
    echo "⏹ Stopping PAG services..."
    systemctl stop $(all_units)
    echo "✅ All PAG services stopped"
    ;;
  restart)
    echo "🔄 Rolling restart PAG services..."
    # Restart workers first (one by one for zero-downtime)
    for w in $WORKER_IDS; do
      echo "  Restarting pag-worker@${w}..."
      systemctl restart "pag-worker@${w}.service"
      sleep 2
    done
    # Then restart APIs (one by one — LB handles failover)
    for p in $API_PORTS; do
      echo "  Restarting pag-api@${p}..."
      systemctl restart "pag-api@${p}.service"
      sleep 2
    done
    echo "✅ Rolling restart complete"
    ;;
  status)
    echo "📊 PAG Service Status:"
    echo ""
    echo "=== API Instances ==="
    for p in $API_PORTS; do
      systemctl status "pag-api@${p}.service" --no-pager -l 2>/dev/null | head -5 || echo "pag-api@${p}: not found"
      echo ""
    done
    echo "=== Worker Instances ==="
    for w in $WORKER_IDS; do
      systemctl status "pag-worker@${w}.service" --no-pager -l 2>/dev/null | head -5 || echo "pag-worker@${w}: not found"
      echo ""
    done
    ;;
  enable)
    echo "🔗 Enabling PAG services for auto-start..."
    systemctl enable $(all_units)
    echo "✅ All PAG services enabled"
    ;;
  disable)
    echo "🔗 Disabling PAG auto-start..."
    systemctl disable $(all_units)
    echo "✅ All PAG services disabled"
    ;;
  deploy)
    echo "🚀 Building and deploying PAG..."
    cd "$WORK_DIR"
    echo "  Building..."
    npx nx run pag:build 2>&1 | tail -5
    echo "  Rolling restart..."
    $0 restart
    echo "✅ Deploy complete"
    ;;
  logs)
    UNIT="${2:-pag-api@3360}"
    echo "📋 Logs for ${UNIT}:"
    journalctl -u "${UNIT}.service" -f --no-pager
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|enable|disable|deploy|logs [unit]}"
    echo ""
    echo "Units: pag-api@3360, pag-api@3361, pag-worker@1, pag-worker@2, pag-worker@3"
    exit 1
    ;;
esac
