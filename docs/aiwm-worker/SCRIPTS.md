# Deployment Scripts Documentation

## 📁 Files Overview

```
services/aiwm-worker/
├── deploy.sh              # Main deployment script (automated)
├── deploy-config.sh       # Configuration for deployment
├── install.sh             # Installation script (runs on worker node)
├── aiwm-worker.service    # Systemd service file
├── Dockerfile             # Docker image build
├── docker-compose.yml     # Docker Compose configuration
├── .env.example           # Environment configuration template
├── DEPLOYMENT.md          # Complete deployment guide
└── SCRIPTS.md             # This file
```

---

## 🚀 Quick Start

### Phương thức 1: Automated Deployment (Khuyến nghị)

```bash
# 1. Configure deployment settings
vim services/aiwm-worker/deploy-config.sh

# 2. Deploy to worker node
./services/aiwm-worker/deploy.sh 192.168.1.100 ubuntu

# 3. Configure credentials (if not provided in deploy command)
ssh ubuntu@192.168.1.100
sudo vim /opt/aiwm-worker/.env
# Edit NODE_ID and NODE_TOKEN

# 4. Restart service
sudo systemctl restart aiwm-worker

# 5. Check status
sudo systemctl status aiwm-worker
```

### Phương thức 2: Docker Deployment

```bash
# 1. Build image
cd services/aiwm-worker
docker build -t aiwm-worker:latest .

# 2. Configure .env
cp .env.example .env
vim .env  # Edit NODE_ID and NODE_TOKEN

# 3. Start container
docker-compose up -d

# 4. Check logs
docker-compose logs -f
```

---

## 📜 Script Details

### 1. deploy.sh

**Main deployment script** - Orchestrates the entire deployment process.

**Usage:**
```bash
./deploy.sh <worker-host> <ssh-user> [node-id] [node-token]
```

**Examples:**
```bash
# Without credentials (will prompt for manual configuration)
./deploy.sh 192.168.1.100 ubuntu

# With credentials (fully automated)
./deploy.sh 192.168.1.100 ubuntu gpu-node-01 eyJhbGc...

# Deploy to multiple hosts
for host in 192.168.1.{100..105}; do
  ./deploy.sh $host ubuntu &
done
wait
```

**What it does:**
1. ✅ Builds aiwm-worker service
2. ✅ Creates deployment package
3. ✅ Uploads to worker node
4. ✅ Runs installation script
5. ✅ Configures .env (if credentials provided)
6. ✅ Starts systemd service
7. ✅ Verifies deployment
8. ✅ Shows logs and status

**Requirements:**
- SSH access to worker node
- sudo privileges on worker node
- Network connectivity

---

### 2. deploy-config.sh

**Configuration file** - Contains deployment settings.

**Edit before deployment:**
```bash
vim services/aiwm-worker/deploy-config.sh
```

**Key settings:**
```bash
# Controller
CONTROLLER_HOST="10.10.0.100"
CONTROLLER_PORT="3003"

# Deployment
DEPLOY_DIR="/opt/aiwm-worker"
SERVICE_USER="aiwm-worker"
NODE_VERSION="20"

# Service
HEARTBEAT_INTERVAL="30000"
METRICS_INTERVAL="60000"
LOG_LEVEL="info"

# Backup
BACKUP_ENABLED="true"
BACKUP_KEEP_DAYS="7"
```

---

### 3. install.sh

**Installation script** - Runs on worker node to install the service.

**Normally called by deploy.sh**, but can be run manually:

```bash
# Upload package to worker node
scp aiwm-worker-package.tar.gz user@worker-node:/tmp/

# SSH to worker node
ssh user@worker-node

# Extract and install
cd /tmp
tar xzf aiwm-worker-package.tar.gz
cd aiwm-worker
sudo ./install.sh
```

**What it does:**
1. ✅ Checks/installs Node.js
2. ✅ Creates service user (aiwm-worker)
3. ✅ Creates directories (/opt/aiwm-worker)
4. ✅ Backs up existing installation
5. ✅ Copies application files
6. ✅ Sets permissions
7. ✅ Installs systemd service
8. ✅ Adds user to docker group
9. ✅ Checks for GPU

---

### 4. aiwm-worker.service

**Systemd service file** - Manages the worker as a system service.

**Installed to:** `/etc/systemd/system/aiwm-worker.service`

**Features:**
- ✅ Automatic restart on failure
- ✅ Graceful shutdown (SIGTERM)
- ✅ Security hardening
- ✅ Resource limits
- ✅ Logging to journald

**Service management:**
```bash
# Start
sudo systemctl start aiwm-worker

# Stop
sudo systemctl stop aiwm-worker

# Restart
sudo systemctl restart aiwm-worker

# Status
sudo systemctl status aiwm-worker

# Logs
sudo journalctl -u aiwm-worker -f

# Enable auto-start
sudo systemctl enable aiwm-worker
```

---

## 🔧 Advanced Usage

### Deploy with custom configuration

```bash
# Override default settings
DEPLOY_DIR=/custom/path \
SERVICE_USER=custom-user \
./deploy.sh 192.168.1.100 ubuntu
```

### Deploy to multiple nodes in parallel

Create `deploy-batch.sh`:
```bash
#!/bin/bash

NODES=(
  "192.168.1.100:gpu-node-01"
  "192.168.1.101:gpu-node-02"
  "192.168.1.102:gpu-node-03"
)

for node in "${NODES[@]}"; do
  IFS=':' read -r host node_id <<< "$node"

  # Get token for this node
  TOKEN=$(curl -s -X POST \
    http://10.10.0.100:3003/api/nodes/${node_id}/token \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    | jq -r '.token')

  # Deploy
  ./deploy.sh $host ubuntu $node_id $TOKEN &
done

wait
echo "All nodes deployed!"
```

### Rollback to previous version

```bash
ssh user@worker-node

# Stop service
sudo systemctl stop aiwm-worker

# Restore from backup
sudo cp /opt/aiwm-worker/backup/backup_20251113_100000.tar.gz /tmp/
cd /opt/aiwm-worker
sudo tar xzf /tmp/backup_20251113_100000.tar.gz

# Start service
sudo systemctl start aiwm-worker
```

### Health check script

Create `check-health.sh`:
```bash
#!/bin/bash

NODES=(
  "192.168.1.100"
  "192.168.1.101"
  "192.168.1.102"
)

for node in "${NODES[@]}"; do
  echo "Checking $node..."

  # Check service status
  STATUS=$(ssh user@$node "sudo systemctl is-active aiwm-worker")

  # Check connection
  LOGS=$(ssh user@$node "sudo journalctl -u aiwm-worker --since '1 minute ago' | grep -c 'registered successfully'")

  if [ "$STATUS" = "active" ] && [ "$LOGS" -gt 0 ]; then
    echo "✅ $node - OK"
  else
    echo "❌ $node - FAILED"
  fi
done
```

---

## 🐛 Troubleshooting Scripts

### Check deployment status

```bash
./check-deployment.sh <worker-host> <ssh-user>
```

Create this script:
```bash
#!/bin/bash
HOST=$1
USER=$2

echo "=== Service Status ==="
ssh $USER@$HOST "sudo systemctl status aiwm-worker"

echo ""
echo "=== Recent Logs ==="
ssh $USER@$HOST "sudo journalctl -u aiwm-worker -n 20 --no-pager"

echo ""
echo "=== Process Info ==="
ssh $USER@$HOST "ps aux | grep aiwm-worker"

echo ""
echo "=== Environment ==="
ssh $USER@$HOST "sudo cat /opt/aiwm-worker/.env | grep -v TOKEN"
```

### Collect diagnostics

```bash
./collect-diagnostics.sh <worker-host> <ssh-user>
```

```bash
#!/bin/bash
HOST=$1
USER=$2
OUTPUT_DIR="diagnostics_${HOST}_$(date +%Y%m%d_%H%M%S)"

mkdir -p $OUTPUT_DIR

# Collect information
ssh $USER@$HOST "sudo systemctl status aiwm-worker" > $OUTPUT_DIR/service-status.txt
ssh $USER@$HOST "sudo journalctl -u aiwm-worker -n 500" > $OUTPUT_DIR/logs.txt
ssh $USER@$HOST "cat /etc/os-release" > $OUTPUT_DIR/os-info.txt
ssh $USER@$HOST "node -v && npm -v" > $OUTPUT_DIR/node-info.txt
ssh $USER@$HOST "nvidia-smi" > $OUTPUT_DIR/gpu-info.txt 2>/dev/null || echo "No GPU" > $OUTPUT_DIR/gpu-info.txt
ssh $USER@$HOST "docker version" > $OUTPUT_DIR/docker-info.txt 2>/dev/null || echo "No Docker" > $OUTPUT_DIR/docker-info.txt

tar czf ${OUTPUT_DIR}.tar.gz $OUTPUT_DIR/
echo "Diagnostics saved to ${OUTPUT_DIR}.tar.gz"
```

---

## 📊 Monitoring Scripts

### Monitor worker status

```bash
./monitor-workers.sh
```

```bash
#!/bin/bash

CONTROLLER="http://10.10.0.100:3003"
ADMIN_TOKEN="your-admin-token"

while true; do
  clear
  echo "=== AIWM Worker Status ==="
  echo "Time: $(date)"
  echo ""

  curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    $CONTROLLER/api/nodes | \
    jq -r '.[] | "\(.nodeId)\t\(.status)\t\(.lastSeenAt)"' | \
    column -t

  sleep 10
done
```

---

## 🔐 Security Best Practices

### Secure token distribution

```bash
# Use encrypted file for tokens
gpg --encrypt --recipient admin@company.com tokens.txt

# On worker node
gpg --decrypt tokens.txt.gpg | grep NODE_ID=gpu-node-01
```

### Automated token rotation

```bash
#!/bin/bash
# rotate-token.sh

NODE_ID=$1
CONTROLLER="http://10.10.0.100:3003"
ADMIN_TOKEN="your-admin-token"

# Generate new token
NEW_TOKEN=$(curl -s -X POST \
  $CONTROLLER/api/nodes/$NODE_ID/token \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"expiresIn": 2592000}' | jq -r '.token')

# Update on worker node
ssh user@worker-node "sudo sed -i 's/NODE_TOKEN=.*/NODE_TOKEN=$NEW_TOKEN/' /opt/aiwm-worker/.env"
ssh user@worker-node "sudo systemctl restart aiwm-worker"

echo "Token rotated for $NODE_ID"
```

---

## 📝 Checklist

### Pre-deployment
- [ ] Node.js 18+ installed on worker node (or will be installed)
- [ ] SSH access configured
- [ ] Firewall rules allow connection to controller
- [ ] NODE_ID created on controller
- [ ] NODE_TOKEN generated
- [ ] `deploy-config.sh` configured

### Deployment
- [ ] Run `./deploy.sh <host> <user> [node-id] [token]`
- [ ] Verify service started: `sudo systemctl status aiwm-worker`
- [ ] Check logs for connection: `sudo journalctl -u aiwm-worker -f`
- [ ] Verify node online on controller

### Post-deployment
- [ ] Monitor for 5-10 minutes
- [ ] Check heartbeat and metrics arriving
- [ ] Test sending command from controller
- [ ] Document node information
- [ ] Set up monitoring alerts

---

## 📞 Support

Nếu gặp vấn đề:
1. Check `DEPLOYMENT.md` for detailed troubleshooting
2. Run diagnostic scripts
3. Check logs: `sudo journalctl -u aiwm-worker -f`
4. Verify network connectivity
5. Check .env configuration

---

**Version**: 1.0.0
**Last Updated**: 2025-11-13
