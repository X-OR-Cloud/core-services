# AIWM Worker - Deployment Guide

Hướng dẫn triển khai **aiwm-worker** lên GPU worker nodes.

## 📋 Yêu cầu hệ thống

### Worker Node:
- **OS**: Linux (Ubuntu 20.04+, CentOS 8+) hoặc macOS
- **Node.js**: 18+ hoặc 20+
- **RAM**: Tối thiểu 2GB
- **Disk**: Tối thiểu 10GB
- **Network**: Kết nối được tới AIWM Controller

### Optional (tùy workload):
- **Docker**: 24.0+ (cho deployment management)
- **NVIDIA GPU**: GPU với nvidia-smi (cho GPU workload)
- **CUDA**: 11.0+ (nếu có GPU)

---

## 🚀 Phương thức triển khai

### **1. Direct Deployment (Khuyến nghị cho development)**

Triển khai trực tiếp file build lên worker node.

#### Bước 1: Build trên máy development
```bash
# Tại thư mục gốc monorepo
npx nx build aiwm-worker

# Tạo ra: dist/services/aiwm-worker/main.js
```

#### Bước 2: Sử dụng script deploy tự động
```bash
# Edit deployment config
vim services/aiwm-worker/deploy-config.sh

# Deploy lên worker node
./services/aiwm-worker/deploy.sh <worker-host> <ssh-user>

# Ví dụ:
./services/aiwm-worker/deploy.sh 192.168.1.100 ubuntu
./services/aiwm-worker/deploy.sh gpu-worker-01 root
```

Script sẽ tự động:
- ✅ Build worker service
- ✅ Copy file lên worker node
- ✅ Cài đặt Node.js dependencies
- ✅ Cấu hình systemd service
- ✅ Start service
- ✅ Verify kết nối

---

### **2. Docker Deployment (Khuyến nghị cho production)**

Triển khai dưới dạng Docker container.

#### Bước 1: Build Docker image
```bash
# Tại thư mục services/aiwm-worker
docker build -t aiwm-worker:latest .

# Hoặc dùng docker-compose
docker-compose build
```

#### Bước 2: Push lên registry (optional)
```bash
# Tag image
docker tag aiwm-worker:latest registry.company.com/aiwm-worker:1.0.0

# Push
docker push registry.company.com/aiwm-worker:1.0.0
```

#### Bước 3: Deploy trên worker node
```bash
# Copy docker-compose.yml và .env lên worker
scp docker-compose.yml .env user@worker-node:/opt/aiwm-worker/

# SSH vào worker
ssh user@worker-node

# Start container
cd /opt/aiwm-worker
docker-compose up -d

# Check logs
docker-compose logs -f
```

---

### **3. Systemd Service (Production - Native)**

Chạy như system service với systemd.

#### Bước 1: Copy files
```bash
# Deploy files
./services/aiwm-worker/deploy.sh <worker-host> <user>
```

#### Bước 2: Install systemd service (tự động trong script)
```bash
# Systemd service đã được tạo tại:
# /etc/systemd/system/aiwm-worker.service

# Kiểm tra status
sudo systemctl status aiwm-worker

# View logs
sudo journalctl -u aiwm-worker -f
```

#### Quản lý service:
```bash
# Start
sudo systemctl start aiwm-worker

# Stop
sudo systemctl stop aiwm-worker

# Restart
sudo systemctl restart aiwm-worker

# Enable auto-start on boot
sudo systemctl enable aiwm-worker

# Disable auto-start
sudo systemctl disable aiwm-worker
```

---

## 🔑 Cấu hình Token

### Bước 1: Tạo Node trên Controller
```bash
curl -X POST http://10.10.0.100:3003/api/nodes \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "gpu-node-01",
    "name": "GPU Worker Node 01",
    "role": "gpu",
    "status": "active",
    "location": "Datacenter A, Rack 5"
  }'
```

### Bước 2: Generate Token
```bash
curl -X POST http://10.10.0.100:3003/api/nodes/gpu-node-01/token \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "expiresIn": 2592000,
    "description": "Production GPU Node 01 - 30 days"
  }'
```

Response:
```json
{
  "nodeId": "gpu-node-01",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-12-13T00:00:00Z",
  "expiresIn": 2592000
}
```

### Bước 3: Cấu hình .env trên Worker
```bash
# /opt/aiwm-worker/.env
NODE_ID=gpu-node-01
NODE_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CONTROLLER_WS_URL=ws://10.10.0.100:3003/ws/node
NODE_NAME=gpu-worker-01
```

---

## 📊 Monitoring & Health Check

### Check Worker Status
```bash
# Systemd
sudo systemctl status aiwm-worker

# Docker
docker ps | grep aiwm-worker
docker logs aiwm-worker

# Process
ps aux | grep aiwm-worker
```

### View Logs
```bash
# Systemd
sudo journalctl -u aiwm-worker -f --since "10 minutes ago"

# Docker
docker-compose logs -f --tail=100

# Direct
tail -f /var/log/aiwm-worker/worker.log
```

### Connection Status
```bash
# Check if connected to controller
curl http://10.10.0.100:3003/api/nodes/gpu-node-01

# Should show: status = "online"
```

### Health Metrics
Worker tự động gửi:
- **Heartbeat**: Every 30 seconds
- **Metrics**: Every 60 seconds

Kiểm tra trên controller:
```bash
curl http://10.10.0.100:3003/api/nodes/gpu-node-01/metrics
```

---

## 🔧 Troubleshooting

### Worker không kết nối được

**1. Kiểm tra network:**
```bash
# Ping controller
ping 10.10.0.100

# Test WebSocket port
telnet 10.10.0.100 3003

# Test HTTP endpoint
curl http://10.10.0.100:3003/api/health
```

**2. Kiểm tra token:**
```bash
# Verify token không expired
# Decode JWT: https://jwt.io

# Test với token mới
curl -X POST http://10.10.0.100:3003/api/nodes/gpu-node-01/token \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"expiresIn": 86400}'
```

**3. Kiểm tra logs:**
```bash
sudo journalctl -u aiwm-worker -n 100 --no-pager

# Tìm lỗi:
# - TOKEN_EXPIRED
# - TOKEN_INVALID
# - NODE_NOT_FOUND
# - Connection error
```

### GPU không được detect

**1. Kiểm tra nvidia-smi:**
```bash
nvidia-smi

# Nếu lỗi "command not found"
which nvidia-smi

# Update NVIDIA_SMI_PATH trong .env
NVIDIA_SMI_PATH=/usr/local/cuda/bin/nvidia-smi
```

**2. Kiểm tra permissions:**
```bash
# Worker user phải chạy được nvidia-smi
sudo usermod -aG video aiwm-worker
```

### Docker commands fail

**1. Kiểm tra Docker:**
```bash
docker version

# Worker user phải trong docker group
sudo usermod -aG docker aiwm-worker

# Restart service sau khi thêm group
sudo systemctl restart aiwm-worker
```

**2. Kiểm tra socket:**
```bash
ls -la /var/run/docker.sock

# Permissions phải đúng
sudo chmod 666 /var/run/docker.sock  # Temporary
```

### Worker bị disconnect liên tục

**1. Kiểm tra firewall:**
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow from 10.10.0.100 to any port 3003

# CentOS/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="10.10.0.100" port port="3003" protocol="tcp" accept'
```

**2. Kiểm tra network stability:**
```bash
# Monitor connection
while true; do
  date
  nc -zv 10.10.0.100 3003
  sleep 5
done
```

**3. Tăng reconnection attempts:**
```bash
# Trong code, reconnection đã set = Infinity
# Check logs xem lý do disconnect
```

---

## 🔄 Update & Rollback

### Update Worker
```bash
# Build version mới
npx nx build aiwm-worker

# Deploy update
./services/aiwm-worker/deploy.sh <worker-host> <user>

# Hoặc với Docker
docker-compose pull
docker-compose up -d
```

### Rollback
```bash
# Systemd - restore backup
sudo cp /opt/aiwm-worker/backup/main.js /opt/aiwm-worker/
sudo systemctl restart aiwm-worker

# Docker - rollback image
docker-compose down
docker tag aiwm-worker:previous aiwm-worker:latest
docker-compose up -d
```

---

## 📈 Scaling

### Thêm nhiều Worker Nodes

**1. Chuẩn bị nodes:**
```bash
# List các GPU nodes
gpu-node-01: 192.168.1.101 (4x RTX 4090)
gpu-node-02: 192.168.1.102 (4x RTX 4090)
gpu-node-03: 192.168.1.103 (8x A100)
```

**2. Deploy parallel:**
```bash
# Script deploy nhiều nodes
for node in gpu-node-01 gpu-node-02 gpu-node-03; do
  ./services/aiwm-worker/deploy.sh $node ubuntu &
done
wait

echo "All nodes deployed!"
```

**3. Verify:**
```bash
# Check all nodes online
curl http://10.10.0.100:3003/api/nodes | jq '.[] | {nodeId, status}'
```

---

## 🔐 Security Best Practices

### 1. Token Management
- ✅ Token nên expire trong 30-90 ngày
- ✅ Rotate token định kỳ
- ✅ Không commit token vào git
- ✅ Dùng secrets manager (HashiCorp Vault, AWS Secrets)

### 2. Network Security
- ✅ Chỉ mở port cần thiết
- ✅ Dùng firewall rules
- ✅ Consider VPN/private network
- ✅ Dùng WSS (WebSocket Secure) trong production

### 3. File Permissions
```bash
# .env file
chmod 600 /opt/aiwm-worker/.env
chown aiwm-worker:aiwm-worker /opt/aiwm-worker/.env

# Application directory
chmod 750 /opt/aiwm-worker
chown -R aiwm-worker:aiwm-worker /opt/aiwm-worker
```

### 4. Run as Non-Root User
```bash
# Create dedicated user
sudo useradd -r -s /bin/false -d /opt/aiwm-worker aiwm-worker

# Service runs as this user (already in systemd file)
```

---

## 📝 Checklist

### Pre-Deployment
- [ ] Worker node đã cài Node.js 18+
- [ ] Worker node có kết nối tới controller
- [ ] Đã tạo node và generate token trên controller
- [ ] Đã cấu hình .env với NODE_ID và NODE_TOKEN
- [ ] (Optional) Đã cài Docker nếu cần
- [ ] (Optional) Đã kiểm tra nvidia-smi nếu có GPU

### Deployment
- [ ] Build worker: `npx nx build aiwm-worker`
- [ ] Deploy: `./deploy.sh <host> <user>`
- [ ] Verify service started: `sudo systemctl status aiwm-worker`
- [ ] Check logs: `sudo journalctl -u aiwm-worker -f`
- [ ] Verify connection: Worker logs show "Node registered successfully"

### Post-Deployment
- [ ] Check node status online trên controller
- [ ] Verify heartbeat đang gửi (check controller logs)
- [ ] Test gửi command từ controller
- [ ] Monitor metrics collection
- [ ] Document node info (IP, GPUs, location)
- [ ] Setup monitoring alerts

---

## 📞 Support

- **Documentation**: `services/aiwm-worker/README.md`
- **Issues**: Report tại GitHub issues
- **Logs**: `sudo journalctl -u aiwm-worker -f`

---

**Version**: 1.0.0
**Last Updated**: 2025-11-13
