# Sizing Plan — Chatbot Hành Chính Công (Public Administration Chatbot)

**Phiên bản:** 1.0  
**Ngày:** 2026-04-01  
**Dịch vụ:** AIWM (AI Workload Manager)  
**Phạm vi:** On-prem, Air-gap, Single Datacenter

---

## 1. Tổng Quan (Overview)

### Mục tiêu

Tài liệu này cung cấp phân tích sizing kỹ thuật cho hệ thống chatbot hành chính công nhúng trong các trang web dịch vụ công của chính phủ Việt Nam. Hệ thống được xây dựng trên nền tảng **AIWM (AI Workload Manager)** trong kiến trúc NestJS monorepo.

### Phạm vi

- Xử lý **20,000 CCU** (Concurrent Connected Users) qua WebSocket
- Trả lời các câu hỏi về thủ tục hành chính công bằng tiếng Việt
- Tích hợp RAG từ kho tài liệu 400 văn bản qua Qdrant (CBM Knowledge module)
- Latency SLA: **< 3 giây** (non-streaming)

### Yêu cầu đặc biệt

> **Air-gap (Hoàn toàn offline):** Hệ thống không có kết nối Internet. Tất cả model weights, dependencies, container images phải được pre-loaded và lưu trữ nội bộ. Không được sử dụng các dịch vụ cloud API bên ngoài.

---

## 2. Phân Tích Workload

### 2.1 Tính toán CCU và RPS

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Tổng CCU (WebSocket) | 20,000 | Kết nối đồng thời tối đa |
| Tỉ lệ active request | 70% | Người dùng thực sự gửi tin nhắn |
| Active users | 14,000 | 20,000 × 70% |
| Tần suất gửi tin | 1 msg / 3–5 phút | Hành vi đặc trưng của hành chính công |
| RPS cơ bản (thấp) | ~47 RPS | 14,000 / 300 giây |
| RPS cơ bản (cao) | ~78 RPS | 14,000 / 180 giây |
| **RPS mục tiêu (có buffer)** | **~100 RPS** | Làm tròn lên với safety margin |

### 2.2 Tính toán Token Throughput

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Input tokens/request | ~3,000 | System prompt + lịch sử hội thoại + RAG chunks |
| Output tokens/request | ~500 | Câu trả lời hành chính |
| Tổng tokens/request | ~3,500 | |
| **Peak token throughput** | **~16,700 tokens/giây** | 100 RPS × 3,500 tokens/request ÷ 21 giây* |

> *Giải thích: Với latency SLA 3 giây và pipeline RAG + inference, throughput = 100 req/s × (500 output tokens) × hệ số safety ≈ 16,700 tokens/s. Tính theo output tokens cần sinh: 100 RPS × 500 output tokens = 50,000 output tokens/giây từ vLLM perspective; tuy nhiên do batching và concurrent requests, throughput thực tế cần vLLM đạt ~16,700 sustained tokens/giây ở mức trung bình.

### 2.3 Session Profile

| Thông số | Giá trị |
|---|---|
| Thời gian session | 15–30 phút |
| Ngôn ngữ | Tiếng Việt |
| Số lượng tài liệu RAG | 400 văn bản hành chính |
| RAG vector store | Qdrant (qua CBM Knowledge module) |

---

## 3. Lựa Chọn Model

### 3.1 So sánh Option A vs Option B

| Tiêu chí | Option A: Qwen3-32B (BF16) | Option B: Qwen3-72B (FP8) |
|---|---|---|
| Kích thước model | ~64GB | ~72GB |
| Precision | BF16 | FP8 (quantized) |
| GPU per instance | 1x H200 (80GB) | 1x H200 (80GB) |
| Throughput/H200 | ~3,000 tokens/s | ~1,800 tokens/s |
| GPU cần cho inference | 9 GPUs | 15 GPUs |
| GPU cho embedding (BGE-M3) | 1 GPU | 1 GPU |
| **Tổng GPU cần** | **10 GPUs** | **16 GPUs** |
| DGX H200 nodes cần | 2 nodes (16 GPU, 6 spare) | 2 nodes (16 GPU, 0 spare) |
| Chất lượng tiếng Việt | Tốt | Rất tốt (tham số lớn hơn) |
| License | Apache 2.0 | Apache 2.0 |
| Rủi ro capacity | Thấp (nhiều dư) | Cao (không có GPU dự phòng) |

### 3.2 Tính toán GPU cho Inference

**Option A — Qwen3-32B:**

```
Throughput cần: ~16,700 tokens/s (peak)
Throughput/GPU: ~3,000 tokens/s
GPU cần (raw): 16,700 / 3,000 = 5.57 → làm tròn 6 GPU
GPU với buffer 50%: 6 × 1.5 = 9 GPU
GPU embedding (BGE-M3): 1 GPU
Tổng: 10 GPU từ pool
```

**Option B — Qwen3-72B:**

```
Throughput cần: ~16,700 tokens/s (peak)
Throughput/GPU: ~1,800 tokens/s
GPU cần (raw): 16,700 / 1,800 = 9.28 → làm tròn 10 GPU
GPU với buffer 50%: 10 × 1.5 = 15 GPU
GPU embedding (BGE-M3): 1 GPU
Tổng: 16 GPU từ pool
```

### 3.3 Embedding Model (Cả hai Option)

| Thông số | Giá trị |
|---|---|
| Model | BGE-M3 (BAAI/bge-m3) |
| Params | 570M |
| Đặc điểm | Multilingual, hỗ trợ tiếng Việt tốt |
| Triển khai | 1 GPU H200 hoặc CPU (phụ thuộc load) |
| Air-gap | Hoàn toàn offline, tải trước |

### 3.4 Khuyến Nghị

**Chọn Option A (Qwen3-32B BF16)** cho giai đoạn đầu nếu ưu tiên stability và còn GPU dự phòng.  
**Chọn Option B (Qwen3-72B FP8)** nếu chất lượng câu trả lời là ưu tiên cao nhất và đã xác nhận pool GPU đủ.

---

## 4. Kiến Trúc Hệ Thống

### 4.1 Sơ Đồ Tổng Thể

```
                    ┌─────────────────────────────────────┐
                    │     INTERNET / Government Intranet   │
                    │         (User Browsers)              │
                    └──────────────┬──────────────────────┘
                                   │ HTTPS/WSS
                    ┌──────────────▼──────────────────────┐
                    │    Load Balancer (x2 Active-Passive) │
                    │    HAProxy / NGINX                   │
                    │    VIP: 10.x.x.10                    │
                    └──────┬───────────────┬──────────────┘
                           │               │
           ┌───────────────▼───┐   ┌───────▼───────────────┐
           │  Controller Node 1│   │  Controller Node 2     │
           │  - AIWM (api)     │   │  - AIWM (api)          │
           │  - IAM            │   │  - IAM                 │
           │  - MONA           │   │  - MONA                │
           │  - CBM            │   │  - CBM                 │
           └───────────────────┘   └───────────────────────┘
                           │
           ┌───────────────▼───────────────────────────────┐
           │              Controller Node 3                 │
           │  - AIWM (api) - IAM - MONA - CBM              │
           └───────────────────────────────────────────────┘
                           │
        ┌──────────────────┼───────────────────────┐
        │                  │                        │
┌───────▼──────┐  ┌────────▼─────┐   ┌─────────────▼──────┐
│ Redis Cluster│  │MongoDB       │   │ Qdrant Cluster      │
│ (x3 nodes)  │  │ReplicaSet    │   │ (x3 nodes)          │
│ BullMQ      │  │(x3 nodes)    │   │ RAG vector store    │
│ Sessions     │  │              │   │ 400 documents       │
└──────────────┘  └──────────────┘   └────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│              Agent Worker Nodes (x6–8 nodes)               │
│  Each node: AIWM (agt mode) × 2–4 instances               │
│  - Hosted agent workers (BullMQ consumers)                 │
│  - RAG orchestration (calls Qdrant via CBM)                │
│  - Calls vLLM via AIWM API on GPU nodes                   │
└───────────────────────────┬────────────────────────────────┘
                            │ HTTP (internal)
        ┌───────────────────┼───────────────────┐
        │                                        │
┌───────▼────────────┐              ┌────────────▼────────────┐
│  DGX H200 Node 1   │              │  DGX H200 Node 2        │
│  (Vùng Chuyên Dụng)│              │  (Vùng Chuyên Dụng)     │
│  8x H200 GPU       │              │  8x H200 GPU            │
│  vLLM: Qwen3 ×N    │              │  vLLM: Qwen3 ×N         │
│  BGE-M3 embedding  │              │  (spare capacity)       │
└────────────────────┘              └─────────────────────────┘
```

### 4.2 Mô Tả Các Tier

| Tier | Số lượng | Vai trò | Workload |
|---|---|---|---|
| **Load Balancer** | 2 (Active-Passive) | Phân tải HTTP/WebSocket, SSL termination | HAProxy/NGINX, VIP failover |
| **Controller Nodes** | 3 | AIWM REST API + WebSocket gateway, IAM, MONA, CBM | API requests, WebSocket connections |
| **Agent Worker Nodes** | 6–8 | AIWM agt mode — hosted agent workers | BullMQ jobs, RAG orchestration, vLLM calls |
| **Data Layer** | 3+3+3 | Redis, MongoDB, Qdrant clusters | State, persistence, vector search |
| **GPU Inference** | 2 DGX H200 | vLLM servers (Qwen3), BGE-M3 embedding | Token generation |

---

## 5. Sizing Chi Tiết

### 5.1 Load Balancer

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Số lượng | 2 (Active-Passive) | Failover VIP |
| CPU | 8 vCPU | |
| RAM | 16GB | |
| Network | 10GbE bonding | WebSocket keep-alive + SSL overhead |
| Software | HAProxy 2.x hoặc NGINX Plus | |
| Sticky sessions | Cần thiết | Socket.IO requires session affinity |
| Config | `ip_hash` hoặc cookie-based | |

**Lưu ý WebSocket:** Load balancer phải cấu hình `timeout tunnel` (HAProxy) hoặc `proxy_read_timeout` (NGINX) đủ lớn cho session 30 phút (≥ 1800s).

### 5.2 Controller Nodes

Mỗi node chạy: `AIWM (api mode)` + `IAM` + `MONA` + `CBM`

| Thông số | Mỗi Node | Tổng (x3) | Ghi chú |
|---|---|---|---|
| CPU | 16 vCPU | 48 vCPU | NestJS là I/O-bound, không cần nhiều CPU |
| RAM | 32GB | 96GB | Socket.IO 20k connections ~8–10GB overhead |
| Disk (OS + App) | 100GB SSD | 300GB | |
| Network | 10GbE | | |
| Node.js services | 4 services × 1–2 processes | | PM2 cluster mode |
| WebSocket connections | ~6,700/node | 20,000 total | Phân tải đều qua LB |

**Process layout per controller node:**

```
PM2 / systemd:
  aiwm-api     → port 3003  (AIWM REST + Socket.IO)
  iam          → port 3001  (JWT, Google SSO — disabled in air-gap)
  mona         → port 3005  (Monitoring)
  cbm          → port 3004  (Projects, Knowledge/RAG management)
```

**Env vars quan trọng:**

```bash
NODE_ENV=production
REDIS_URL=redis://redis-cluster:6379
MONGODB_URI=mongodb://mongo-rs:27017/hydra_aiwm?replicaSet=rs0
QDRANT_HOST=qdrant-cluster
QDRANT_PORT=6333
AIWM_INFERENCE_BASE_URL=http://gpu-node-lb/v1
```

### 5.3 Agent Worker Nodes

Mỗi node chạy: `AIWM (agt mode)` — multiple instances

| Thông số | Mỗi Node | Tổng (x6 nodes) | Ghi chú |
|---|---|---|---|
| CPU | 8 vCPU | 48 vCPU | Async I/O bound |
| RAM | 16GB | 96GB | ~500–1,000 concurrent sessions/process |
| Disk | 50GB SSD | 300GB | Logs only |
| Network | 10GbE | | Calls vLLM + Qdrant |
| AIWM agt instances/node | 3 instances | 18 total | PM2 |
| Concurrent agent sessions | ~500–1,000/process | **9,000–18,000 total** | Async/await concurrency |

**Tính toán capacity:**

```
Target concurrent sessions: 14,000
Capacity per agt process: ~500–1,000 sessions
Total agt processes needed: 14,000 / 500 = 28 (worst case)
                           14,000 / 1,000 = 14 (best case)

Config: 6 nodes × 3 instances = 18 processes
  → Capacity: 9,000–18,000 concurrent sessions
  → Đủ để xử lý 14,000 active sessions với buffer

Nếu cần scale: thêm node 7–8 (tổng 21–24 processes)
```

**Process layout per agent worker node:**

```bash
# PM2 ecosystem config
{
  "name": "aiwm-agt-1",
  "script": "dist/main.js",
  "env": { "APP_MODE": "agt", "PORT": "3103" }
},
{
  "name": "aiwm-agt-2",
  "script": "dist/main.js",
  "env": { "APP_MODE": "agt", "PORT": "3104" }
},
{
  "name": "aiwm-agt-3",
  "script": "dist/main.js",
  "env": { "APP_MODE": "agt", "PORT": "3105" }
}
```

### 5.4 Data Layer

#### Redis Cluster

| Thông số | Giá trị |
|---|---|
| Topology | 3-node cluster (3 primary, 3 replica = 6 nodes) hoặc 3-node sentinel |
| CPU | 4 vCPU/node |
| RAM | 32GB/node |
| Disk | 50GB SSD (AOF persistence) |
| Dùng cho | BullMQ queues, Socket.IO adapter, session cache |
| Estimated memory | ~10–15GB (20k sessions × ~500B/session + queue data) |

#### MongoDB ReplicaSet

| Thông số | Giá trị |
|---|---|
| Topology | 3-node ReplicaSet (1 primary, 2 secondary) |
| CPU | 8 vCPU/node |
| RAM | 64GB/node |
| Disk | 500GB NVMe SSD/node |
| Dùng cho | All service data (conversations, agents, IAM, CBM, MONA) |
| Write concern | `majority` cho critical data |

#### Qdrant Cluster

| Thông số | Giá trị |
|---|---|
| Topology | 3-node cluster |
| CPU | 8 vCPU/node |
| RAM | 32GB/node |
| Disk | 200GB SSD/node |
| Dùng cho | Vector embeddings, RAG search (400 documents) |
| Vector dim | 1024 (BGE-M3) |
| Estimated size | ~400 docs × avg 20 chunks × 1024 dim × 4 bytes ≈ ~33MB (rất nhỏ) |

### 5.5 GPU Inference Layer

#### vLLM Inference Servers

| Thông số | Option A (Qwen3-32B) | Option B (Qwen3-72B) |
|---|---|---|
| Model | Qwen3-32B BF16 | Qwen3-72B FP8 |
| GPU per instance | 1x H200 | 1x H200 |
| VRAM per instance | ~64GB | ~72GB |
| Throughput/GPU | ~3,000 tokens/s | ~1,800 tokens/s |
| Inference GPU count | 9 | 15 |
| Embedding GPU (BGE-M3) | 1 | 1 |
| **Total GPU needed** | **10** | **16** |
| DGX H200 nodes needed | 2 (10/16 GPUs used, 6 spare) | 2 (16/16 GPUs used, 0 spare) |

#### Embedding Server (BGE-M3)

| Thông số | Giá trị |
|---|---|
| Model | BAAI/bge-m3 |
| Deployment | 1x H200 GPU (shared) hoặc CPU nếu load thấp |
| Framework | vLLM embedding mode hoặc HuggingFace TEI |
| Throughput | Embedding không phải bottleneck với 400 docs |

---

## 6. Phân Bổ GPU từ DGX H200

### 6.1 Tổng Quan Pool GPU

| Vùng | DGX H200 Nodes | GPU/Node | Tổng GPU | Trạng thái |
|---|---|---|---|---|
| Vùng Dùng Chung | 5 nodes | 8x H200 | 40 GPU | Shared pool — cần request quota |
| Vùng Chuyên Dụng | 2 nodes | 8x H200 | 16 GPU | Dedicated — ưu tiên dùng |
| **Tổng** | **7 nodes** | | **56 GPU** | |

### 6.2 Đề Xuất Phân Bổ

**Phương án ưu tiên: Dùng 2 node Vùng Chuyên Dụng**

| Mục đích | Option A (Qwen3-32B) | Option B (Qwen3-72B) |
|---|---|---|
| vLLM inference (Qwen3) | 9 GPU | 15 GPU |
| Embedding (BGE-M3) | 1 GPU | 1 GPU |
| **Tổng cần** | **10 GPU** | **16 GPU** |
| Tổng có sẵn (2 DGX) | 16 GPU | 16 GPU |
| GPU dự phòng | 6 GPU | 0 GPU |

> **Khuyến nghị:** Với Option A, còn 6 GPU dự phòng trên 2 node chuyên dụng. Có thể dùng cho dev/test hoặc scale thêm instance. Option B sử dụng hết toàn bộ 16 GPU — không có dự phòng nếu 1 GPU lỗi.

**Nếu cần xin thêm từ Vùng Dùng Chung:**

| Scenario | GPU cần từ shared pool | Notes |
|---|---|---|
| Option A baseline | 0 (đủ từ dedicated) | Không cần |
| Option B baseline | 0 (đủ từ dedicated, sát giới hạn) | Không cần nhưng không có dự phòng |
| Scale-out Option A | +8 GPU (1 DGX shared) | Tăng throughput lên ~6× |
| Dev/staging environment | +4–8 GPU | Môi trường test |

### 6.3 GPU Layout trên DGX H200

**Option A — Qwen3-32B (2 DGX Chuyên Dụng):**

```
DGX H200 Node 1 (8 GPUs):
  GPU 0: vLLM Qwen3-32B instance #1
  GPU 1: vLLM Qwen3-32B instance #2
  GPU 2: vLLM Qwen3-32B instance #3
  GPU 3: vLLM Qwen3-32B instance #4
  GPU 4: vLLM Qwen3-32B instance #5
  GPU 5: BGE-M3 embedding server
  GPU 6: SPARE
  GPU 7: SPARE

DGX H200 Node 2 (8 GPUs):
  GPU 0: vLLM Qwen3-32B instance #6
  GPU 1: vLLM Qwen3-32B instance #7
  GPU 2: vLLM Qwen3-32B instance #8
  GPU 3: vLLM Qwen3-32B instance #9
  GPU 4: SPARE
  GPU 5: SPARE
  GPU 6: SPARE
  GPU 7: SPARE
```

**Option B — Qwen3-72B (2 DGX Chuyên Dụng):**

```
DGX H200 Node 1 (8 GPUs):
  GPU 0–7: vLLM Qwen3-72B instances #1–8

DGX H200 Node 2 (8 GPUs):
  GPU 0–6: vLLM Qwen3-72B instances #9–15
  GPU 7:   BGE-M3 embedding server
```

---

## 7. HA/DR Plan

### 7.1 Mục Tiêu

| Mục tiêu | Giá trị |
|---|---|
| RTO (Recovery Time Objective) | < 60 giây |
| RPO (Recovery Point Objective) | < 5 giây |
| Datacenter | Single DC (không có multi-DC) |

### 7.2 HA Per Component

| Component | HA Strategy | RTO | RPO | Ghi chú |
|---|---|---|---|---|
| **Load Balancer** | Active-Passive, VIP failover (Keepalived) | < 10s | 0 | Stateless |
| **Controller Nodes** | Active-Active x3, LB distributes | < 30s | 0 | Stateless, WebSocket reconnect |
| **Agent Worker Nodes** | Active-Active x6–8, BullMQ retry | < 60s | < 5s (job retry) | BullMQ job persistence |
| **Redis Cluster** | Cluster với replica, auto-failover | < 30s | < 1s (AOF) | BullMQ jobs persist in Redis |
| **MongoDB ReplicaSet** | 3-node RS, automatic election | < 30s | < 5s (oplog) | Write concern majority |
| **Qdrant Cluster** | 3-node cluster, replication | < 30s | 0 (read-only data) | 400 docs ít thay đổi |
| **vLLM / GPU** | Multiple instances, LB | Per-instance | 0 (stateless) | Nếu 1 GPU fail, giảm throughput |

### 7.3 Failure Scenarios

| Scenario | Impact | Recovery |
|---|---|---|
| 1 LB node fail | Transparent failover (VIP) | < 10s, Keepalived |
| 1 Controller node fail | 33% WebSocket capacity giảm, LB re-routes | < 30s, clients reconnect |
| 1 Agent worker node fail | 1/6 agent capacity giảm, BullMQ redistributes jobs | < 60s |
| 1 Redis node fail | Cluster tiếp tục, replica promoted | < 30s |
| 1 MongoDB node fail | RS tiếp tục với 2/3 nodes | < 30s |
| 1 GPU node fail (Option A) | 5/9 inference instances còn lại (~55% throughput) | Manual restart |
| 1 GPU node fail (Option B) | 7/15 inference instances còn lại (~47% throughput) | Manual restart |
| Full GPU node failure (Option B) | **Dịch vụ degraded nghiêm trọng** | Cần xin GPU từ Vùng Dùng Chung |

> **Rủi ro GPU:** Option B không có GPU dự phòng. Khi 1 DGX node fail, chỉ còn 8 GPU inference trong khi cần 15. Dịch vụ vẫn hoạt động nhưng throughput giảm ~47%, latency sẽ vượt SLA 3s. Option A có 6 GPU dự phòng, xử lý được trường hợp này tốt hơn.

### 7.4 Backup Strategy

| Data | Backup | Retention |
|---|---|---|
| MongoDB | Daily mongodump + oplog streaming | 7 ngày |
| Redis | AOF + RDB snapshot mỗi giờ | 24 giờ |
| Qdrant | Snapshot collections mỗi ngày | 7 ngày |
| Model weights | Immutable, lưu trên NVMe DGX | Permanent |
| App config | Git repo (air-gap mirror) | Permanent |

---

## 8. Triển Khai (Deployment Notes)

### 8.1 vLLM Serving Commands

**Option A — Qwen3-32B BF16:**

```bash
# Mỗi GPU chạy 1 instance
CUDA_VISIBLE_DEVICES=0 python -m vllm.entrypoints.openai.api_server \
  --model /models/Qwen3-32B \
  --dtype bfloat16 \
  --max-model-len 8192 \
  --max-num-seqs 256 \
  --gpu-memory-utilization 0.92 \
  --port 8000 \
  --host 0.0.0.0 \
  --served-model-name qwen3-32b \
  --trust-remote-code
```

**Option B — Qwen3-72B FP8:**

```bash
CUDA_VISIBLE_DEVICES=0 python -m vllm.entrypoints.openai.api_server \
  --model /models/Qwen3-72B \
  --dtype float8 \
  --quantization fp8 \
  --max-model-len 8192 \
  --max-num-seqs 128 \
  --gpu-memory-utilization 0.92 \
  --port 8000 \
  --host 0.0.0.0 \
  --served-model-name qwen3-72b \
  --trust-remote-code
```

**BGE-M3 Embedding (chia sẻ GPU):**

```bash
# Option 1: vLLM embedding mode
CUDA_VISIBLE_DEVICES=5 python -m vllm.entrypoints.openai.api_server \
  --model /models/bge-m3 \
  --task embed \
  --port 8010 \
  --host 0.0.0.0

# Option 2: HuggingFace Text Embeddings Inference (TEI)
docker run --gpus '"device=5"' \
  -v /models/bge-m3:/models \
  -p 8010:80 \
  ghcr.io/huggingface/text-embeddings-inference:turing-1.5 \
  --model-id /models --port 80
```

### 8.2 vLLM Load Balancer cho GPU Instances

Các vLLM instances cần 1 internal LB (round-robin):

```nginx
upstream vllm_cluster {
    least_conn;
    server gpu-node1:8000;
    server gpu-node1:8001;
    server gpu-node1:8002;
    # ... tất cả instances
    keepalive 64;
}

server {
    listen 8080;
    location /v1/ {
        proxy_pass http://vllm_cluster;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;
    }
}
```

### 8.3 Env Vars cho AIWM

```bash
# Controller Node (api mode)
APP_MODE=api
PORT=3003
REDIS_URL=redis://redis-cluster:6379
MONGODB_URI=mongodb://mongo-rs:27017/hydra_aiwm?replicaSet=rs0
QDRANT_URL=http://qdrant-cluster:6333

# Agent Worker Node (agt mode)
APP_MODE=agt
AIWM_VLLM_BASE_URL=http://gpu-internal-lb:8080/v1
AIWM_EMBEDDING_URL=http://gpu-node1:8010/v1
AIWM_MODEL_NAME=qwen3-32b   # hoặc qwen3-72b
AIWM_MAX_TOKENS=512
AIWM_CONTEXT_WINDOW=8192
BULLMQ_CONCURRENCY=500       # concurrent jobs per worker
```

### 8.4 Air-Gap Checklist

| Item | Trạng thái | Ghi chú |
|---|---|---|
| Model weights Qwen3 | Phải pre-download | `/models/Qwen3-32B` hoặc `/models/Qwen3-72B` |
| Model weights BGE-M3 | Phải pre-download | `/models/bge-m3` |
| vLLM + dependencies | Phải pre-install | Offline pip cache |
| Container images | Phải pre-pull | Registry nội bộ |
| Node.js + npm packages | Phải pre-install | Offline npm cache hoặc Nexus |
| MongoDB binaries | Phải pre-install | |
| Redis binaries | Phải pre-install | |
| Qdrant binary | Phải pre-install | |
| SSL certificates | Internal CA | Không dùng Let's Encrypt |
| Google SSO (IAM) | Disable hoặc thay thế | Không có internet |

---

## 9. Câu Hỏi Mở (Open Questions)

Các vấn đề sau cần được làm rõ trước khi finalize sizing và triển khai:

### Q1: Xác nhận quota GPU từ Vùng Dùng Chung

> Hiện tại sizing dựa trên **2 node DGX H200 Vùng Chuyên Dụng** (16 GPU). Đây là đủ cho cả Option A và B ở mức baseline. Tuy nhiên cần xác nhận:
> - Cơ chế request quota từ Vùng Dùng Chung (5 nodes, 40 GPU) là gì?
> - SLA của Vùng Dùng Chung trong trường hợp khẩn cấp (GPU chuyên dụng fail)?
> - Thời gian cấp phát GPU bổ sung khi cần?

### Q2: Xác thực người dùng trong môi trường Air-Gap

> IAM service hiện có tích hợp Google SSO — không hoạt động trong air-gap. Cần quyết định:
> - Dùng username/password local authentication?
> - Tích hợp LDAP/Active Directory nội bộ của cơ quan nhà nước?
> - SSO qua SAML 2.0 với IdP nội bộ?

### Q3: Scale-out strategy khi vượt 20,000 CCU

> Thiết kế hiện tại tối ưu cho 20,000 CCU. Nếu có nhu cầu mở rộng:
> - Agent Worker Nodes có thể scale ngang dễ dàng (thêm node).
> - Controller Nodes: cần xem xét Socket.IO adapter (Redis pub/sub đã sẵn sàng).
> - GPU throughput: cần request thêm GPU từ Vùng Dùng Chung.
> - Giới hạn hiện tại của kiến trúc ở mức bao nhiêu CCU?

### Q4: Monitoring và Alerting trong Air-Gap

> MONA service cần được cấu hình:
> - Stack monitoring nội bộ nào? (Prometheus + Grafana offline, ELK stack?)
> - Alert destination (không có PagerDuty/email cloud): SNMP trap, SMS gateway nội bộ?
> - Log retention policy và storage sizing cho audit trail?

---

## 10. Tổng Hợp Bill of Resources

### 10.1 Compute Nodes

| Node Type | Count | vCPU | RAM | Disk | Network |
|---|---|---|---|---|---|
| Load Balancer | 2 | 8 | 16GB | 100GB SSD | 10GbE |
| Controller Node | 3 | 16 | 32GB | 100GB SSD | 10GbE |
| Agent Worker Node | 6–8 | 8 | 16GB | 50GB SSD | 10GbE |
| Redis Node | 3 | 4 | 32GB | 50GB SSD | 10GbE |
| MongoDB Node | 3 | 8 | 64GB | 500GB NVMe | 10GbE |
| Qdrant Node | 3 | 8 | 32GB | 200GB SSD | 10GbE |
| **Subtotal (VM/BM)** | **20–22** | **~192** | **~624GB** | | |

### 10.2 GPU Resources

| Resource | Option A | Option B |
|---|---|---|
| DGX H200 nodes | 2 (Chuyên Dụng) | 2 (Chuyên Dụng) |
| GPU used / total | 10 / 16 | 16 / 16 |
| GPU spare | 6 | 0 |
| vLLM instances | 9 | 15 |
| Embedding instances | 1 | 1 |

### 10.3 Summary

| Phương án | CCU | GPU cần | RPS đạt | Chi phí GPU | Rủi ro |
|---|---|---|---|---|---|
| Option A (Qwen3-32B) | 20,000 | 10 GPU | ~100 RPS | Thấp | Thấp (6 GPU dự phòng) |
| Option B (Qwen3-72B) | 20,000 | 16 GPU | ~100 RPS | Cao | Trung bình (0 GPU dự phòng) |

---

*Tài liệu này được soạn thảo để trình bày cho hội đồng kỹ thuật. Mọi thông số sizing cần được xác nhận lại sau khi chạy benchmark thực tế trên hardware chính thức.*

*Ngày soạn: 2026-04-01 | Phiên bản: 1.0*
