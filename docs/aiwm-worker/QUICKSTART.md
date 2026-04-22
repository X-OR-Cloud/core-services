# AIWM Worker - Quick Start Guide

## ⚡ Deploy trong 3 bước

### Bước 1: Tạo Node và Token trên Controller

```bash
# 1.1. Tạo node
curl -X POST http://10.10.0.100:3003/api/nodes \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "gpu-node-01",
    "name": "GPU Worker 01",
    "role": "gpu",
    "status": "active"
  }'

# 1.2. Generate token
curl -X POST http://10.10.0.100:3003/api/nodes/gpu-node-01/token \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn": 2592000}' \
  | jq -r '.token'

# Copy token này: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Bước 2: Configure và Deploy

```bash
# 2.1. Edit config (optional)
vim services/aiwm-worker/deploy-config.sh

# 2.2. Deploy to worker node
cd services/aiwm-worker
./deploy.sh 192.168.1.100 ubuntu gpu-node-01 eyJhbGc...

# Hoặc deploy không kèm credentials (sẽ config manual sau)
./deploy.sh 192.168.1.100 ubuntu
```

### Bước 3: Verify

```bash
# 3.1. Check service status
ssh ubuntu@192.168.1.100 'sudo systemctl status aiwm-worker'

# 3.2. View logs
ssh ubuntu@192.168.1.100 'sudo journalctl -u aiwm-worker -f'

# 3.3. Verify on controller
curl http://10.10.0.100:3003/api/nodes/gpu-node-01 | jq '.status'
# Should return: "online"
```

---

## 🐳 Deploy với Docker

```bash
# 1. Copy files to worker node
scp -r services/aiwm-worker ubuntu@192.168.1.100:/opt/

# 2. SSH to worker
ssh ubuntu@192.168.1.100

# 3. Configure
cd /opt/aiwm-worker
cp .env.example .env
vim .env  # Edit NODE_ID and NODE_TOKEN

# 4. Start
docker-compose up -d

# 5. Check logs
docker-compose logs -f
```

---

## 🔧 Quản lý Service

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

# Enable auto-start on boot
sudo systemctl enable aiwm-worker
```

---

## 🚨 Troubleshooting

### Worker không kết nối

```bash
# 1. Check logs
sudo journalctl -u aiwm-worker -n 50

# 2. Check network
ping 10.10.0.100
telnet 10.10.0.100 3003

# 3. Verify .env
sudo cat /opt/aiwm-worker/.env

# 4. Test token (decode tại jwt.io)
# Check: token chưa expired, NODE_ID đúng
```

### GPU không detect

```bash
# Check nvidia-smi
nvidia-smi

# Update path trong .env
NVIDIA_SMI_PATH=/usr/local/cuda/bin/nvidia-smi
sudo systemctl restart aiwm-worker
```

### Service không start

```bash
# Check logs
sudo journalctl -u aiwm-worker -xe

# Verify Node.js
node -v  # Should be 18+ or 20+

# Check permissions
ls -la /opt/aiwm-worker
sudo chown -R aiwm-worker:aiwm-worker /opt/aiwm-worker
```

---

## 📋 Deploy Multiple Nodes

```bash
# deploy-all.sh
#!/bin/bash

NODES=(
  "192.168.1.100:gpu-node-01"
  "192.168.1.101:gpu-node-02"
  "192.168.1.102:gpu-node-03"
)

for node in "${NODES[@]}"; do
  IFS=':' read -r host node_id <<< "$node"

  # Generate token
  TOKEN=$(curl -s -X POST \
    http://10.10.0.100:3003/api/nodes/${node_id}/token \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"expiresIn": 2592000}' \
    | jq -r '.token')

  # Deploy
  ./deploy.sh $host ubuntu $node_id $TOKEN &
done

wait
echo "✅ All nodes deployed!"
```

---

## 📚 Documentation

- **Complete Guide**: `DEPLOYMENT.md` - Chi tiết đầy đủ
- **Scripts Reference**: `SCRIPTS.md` - Hướng dẫn scripts
- **Service Info**: `README.md` - Thông tin service
- **Environment**: `.env.example` - Cấu hình example

---

## ✅ Success Checklist

Deploy thành công khi:
- [x] Service status = `active (running)`
- [x] Logs show: `"Node registered successfully"`
- [x] Controller shows node status = `"online"`
- [x] Heartbeat messages arriving every 30s
- [x] Metrics messages arriving every 60s
- [x] GPU detected (nếu có): logs show GPU info

---

**Need Help?** Check `DEPLOYMENT.md` for detailed troubleshooting
