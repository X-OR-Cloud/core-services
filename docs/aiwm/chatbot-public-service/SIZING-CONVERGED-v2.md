# Sizing Plan — Chatbot HCC v2 (Converged Infrastructure)

**Phiên bản:** 2.0
**Ngày:** 2026-04-06

---

## 1. Tổng Quan

### Mục tiêu

Sizing hệ thống chatbot hành chính công 20,000 CCU trên **cụm 5 máy chủ vật lý converged** (4 active + 1 dự phòng), triển khai qua VM, air-gap, single DC.

### Cấu hình mỗi node

| Thông số | Giá trị |
|---|---|
| CPU | 2 × 56 cores = 112 cores/node |
| RAM | 2,048 GB (2 TB) |
| GPU VRAM | 1,128 GB |
| Network | 10/25 GbE Ethernet |
| Virtualization | VM (KVM/VMware) |

### Tổng tài nguyên cụm

| Thông số | 5 nodes (tổng) | 4 nodes (active) |
|---|---|---|
| vCPU | 560 | 448 |
| RAM | 10,240 GB | 8,192 GB |
| GPU VRAM | 5,640 GB | 4,512 GB |

---

## 2. Workload (Đã Hiệu Chỉnh)

### 2.1 Thông số hiệu chỉnh

| Thông số | v1 | v2 | Lý do hiệu chỉnh |
|---|---|---|---|
| Active rate | 70% | **85%** | Peak giờ hành chính (8h–11h, 13h–16h) |
| Active users | 14,000 | **17,000** | 20,000 × 85% |
| Message rate | 1 msg / 3–5 phút | **1 msg / 1.5–2 phút** | Tính follow-up nhanh, hỏi thêm chi tiết |
| RPS (peak) | ~100 | **~190** | 17,000 / 90s |
| HA buffer | 50% | **70%** | n+1 node dự phòng |
| KV cache | Không tính | **Tính đầy đủ** | vLLM thực tế cần ~40–50GB thêm/instance |

### 2.2 Token Throughput

| Thông số | Giá trị |
|---|---|
| Input tokens/request | ~3,000 |
| Output tokens/request | ~500 |
| Peak output throughput | 190 RPS × 500 = **95,000 tokens/s** |

---

## 3. Phân Bổ Tài Nguyên

### 3.1 Tổng yêu cầu vs capacity

| Thông số | Yêu cầu | Ngưỡng 30–70% | Tổng (5 nodes) | Utilization |
|---|---|---|---|---|
| vCPU | **520** | 750 | 560* | ~69% (trên 5 nodes) |
| RAM | **4,350 GB** | 6,220 GB | 10,240 GB | ~42% |
| GPU VRAM | **2,350 GB** | 3,360 GB | 5,640 GB | ~42% |

> *vCPU 520 yêu cầu < 560 physical cores. Với hyperthreading (nếu bật): 1,120 vCPU available → utilization ~46%.

### 3.2 Phân bổ theo VM role

| VM Role | Số lượng | vCPU/VM | RAM/VM | GPU VRAM/VM | Tổng vCPU | Tổng RAM | Tổng GPU |
|---|---|---|---|---|---|---|---|
| Controller (AIWM+IAM+MONA+CBM) | 3 | 24 | 48 GB | 0 | 72 | 144 GB | 0 |
| Agent Worker (AIWM agt) | 8 | 12 | 24 GB | 0 | 96 | 192 GB | 0 |
| Queue/Cache | 3 | 8 | 48 GB | 0 | 24 | 144 GB | 0 |
| Database | 3 | 16 | 96 GB | 0 | 48 | 288 GB | 0 |
| VectorDB | 3 | 8 | 48 GB | 0 | 24 | 144 GB | 0 |
| vLLM Inference (Qwen3-72B) | 20 | 8 | 16 GB | 112 GB | 160 | 320 GB | 2,240 GB |
| Embedding (BGE-M3) | 2 | 4 | 8 GB | 55 GB | 8 | 16 GB | 110 GB |
| Load Balancer | 2 | 4 | 8 GB | 0 | 8 | 16 GB | 0 |
| Monitoring/Ops | 2 | 8 | 32 GB | 0 | 16 | 64 GB | 0 |
| OS/Hypervisor overhead (per node) | 5 | ~13 | ~45 GB | 0 | 64 | 222 GB | 0 |
| **Tổng** | | | | | **520** | **1,550 GB** | **2,350 GB** |


---

## 4. Chi Tiết Từng VM Role

### 4.1 Controller VMs (×3)

Mỗi VM chạy 4 services: AIWM (api) + IAM + MONA + CBM

| Thông số | Giá trị |
|---|---|
| vCPU | 24 |
| RAM | 48 GB |
| Disk | 100 GB SSD |
| WebSocket connections | ~6,700/VM |
| Services | aiwm-api (:3003), iam (:3001), mona (:3005), cbm (:3004) |

### 4.2 Agent Worker VMs (×8)

Mỗi VM chạy 3 AIWM agt instances

| Thông số | Giá trị |
|---|---|
| vCPU | 12 |
| RAM | 24 GB |
| Disk | 50 GB SSD |
| AIWM agt instances/VM | 3 |
| Tổng agt processes | 24 (8 × 3) |
| Capacity | ~12,000–24,000 concurrent sessions |

**Tính toán:**

```
Target: 17,000 active sessions
Per process: ~500–1,000 sessions
Processes cần: 17,000 / 500 = 34 (worst) → 17 (best)
Config: 8 VMs × 3 = 24 processes → 12,000–24,000 capacity
```

### 4.3 Data Layer VMs

**Queue/Cache (×3)**

| Thông số | Giá trị |
|---|---|
| vCPU | 8 |
| RAM | 48 GB |
| Disk | 100 GB SSD |
| Mode | Cluster (3 primary + 3 replica) hoặc Sentinel |
| Dùng cho | Message queue, Socket.IO adapter, session cache |

**Database (×3)**

| Thông số | Giá trị |
|---|---|
| vCPU | 16 |
| RAM | 96 GB |
| Disk | 500 GB NVMe |
| Mode | ReplicaSet (1 primary, 2 secondary) |
| Write concern | majority |

**VectorDB (×3)**

| Thông số | Giá trị |
|---|---|
| vCPU | 8 |
| RAM | 48 GB |
| Disk | 200 GB SSD |
| Mode | 3-node cluster, replication factor 2 |

### 4.4 GPU Inference VMs

**vLLM — Qwen3-72B FP8 (×20 instances)**

| Thông số | Giá trị |
|---|---|
| vCPU | 8 |
| RAM | 16 GB |
| GPU VRAM (passthrough) | 112 GB (72GB model + 40GB KV cache) |
| Throughput/instance | ~1,800 tokens/s |
| Tổng throughput | 20 × 1,800 = **36,000 tokens/s** |
| Max RPS | 36,000 / 500 = **~72 RPS sustained** (generation) |

> **Lưu ý:** 72 RPS sustained generation < 190 RPS peak. Tuy nhiên do batching (max_num_seqs=128), thực tế vLLM xử lý ~150–190 concurrent requests với continuous batching. Peak 190 RPS là request arrival rate, không phải concurrent generation rate.

**Embedding — BGE-M3 (×2 instances)**

| Thông số | Giá trị |
|---|---|
| vCPU | 4 |
| RAM | 8 GB |
| GPU VRAM | 55 GB |
| Mode | Active-Active, LB round-robin |

### 4.5 Load Balancer VMs (×2)

| Thông số | Giá trị |
|---|---|
| vCPU | 4 |
| RAM | 8 GB |
| Disk | 50 GB SSD |
| Mode | Active-Passive (Keepalived VIP) |
| Software | HAProxy / NGINX |

### 4.6 Monitoring/Ops VMs (×2)

| Thông số | Giá trị |
|---|---|
| vCPU | 8 |
| RAM | 32 GB |
| Disk | 500 GB SSD |
| Stack | Prometheus + Grafana + Loki (air-gap) |

---

## 5. GPU VRAM Breakdown

### 5.1 Per-instance VRAM

| Component | Qwen3-72B FP8 | BGE-M3 |
|---|---|---|
| Model weights | 72 GB | 2 GB |
| KV cache (max_num_seqs=128) | ~35 GB | N/A |
| CUDA overhead + activations | ~5 GB | ~1 GB |
| **Tổng/instance** | **~112 GB** | **~3 GB** |

> Embedding VM dùng 55 GB VRAM để dự phòng cho batched embedding requests lớn và future model upgrade.

### 5.2 Tổng VRAM

| Hạng mục | Instances | VRAM/instance | Tổng |
|---|---|---|---|
| vLLM (Qwen3-72B) | 20 | 112 GB | 2,240 GB |
| Embedding (BGE-M3) | 2 | 55 GB | 110 GB |
| **Tổng yêu cầu** | | | **2,350 GB** |
| Tổng available (5 nodes) | | | 5,640 GB |
| **Utilization** | | | **42%** |

### 5.3 GPU Passthrough Layout (per physical node)

Mỗi node có 1,128 GB GPU VRAM. Phân bổ trên 4 active nodes:

```
Node 1: 5× vLLM (560 GB) + 1× Embedding (55 GB) = 615 GB / 1,128 GB (55%)
Node 2: 5× vLLM (560 GB)                         = 560 GB / 1,128 GB (50%)
Node 3: 5× vLLM (560 GB)                         = 560 GB / 1,128 GB (50%)
Node 4: 5× vLLM (560 GB) + 1× Embedding (55 GB) = 615 GB / 1,128 GB (55%)
Node 5: STANDBY (dự phòng)
```

---

## 6. VM Placement (per Physical Node)

### Node 1

| VM | vCPU | RAM | GPU VRAM |
|---|---|---|---|
| Controller-1 | 24 | 48 GB | — |
| Agent-Worker-1 | 12 | 24 GB | — |
| Agent-Worker-2 | 12 | 24 GB | — |
| Queue/Cache-1 | 8 | 48 GB | — |
| vLLM-1~5 | 40 | 80 GB | 560 GB |
| Embedding-1 | 4 | 8 GB | 55 GB |
| LB-1 | 4 | 8 GB | — |
| OS/Hypervisor | 13 | 45 GB | — |
| **Tổng** | **117** | **285 GB** | **615 GB** |

> vCPU 117 > 112 cores: cần hyperthreading hoặc overcommit nhẹ (~1.05:1).

### Node 2

| VM | vCPU | RAM | GPU VRAM |
|---|---|---|---|
| Controller-2 | 24 | 48 GB | — |
| Agent-Worker-3 | 12 | 24 GB | — |
| Agent-Worker-4 | 12 | 24 GB | — |
| Database-1 | 16 | 96 GB | — |
| vLLM-6~10 | 40 | 80 GB | 560 GB |
| Monitoring-1 | 8 | 32 GB | — |
| OS/Hypervisor | 13 | 45 GB | — |
| **Tổng** | **125** | **349 GB** | **560 GB** |

### Node 3

| VM | vCPU | RAM | GPU VRAM |
|---|---|---|---|
| Controller-3 | 24 | 48 GB | — |
| Agent-Worker-5 | 12 | 24 GB | — |
| Agent-Worker-6 | 12 | 24 GB | — |
| Database-2 | 16 | 96 GB | — |
| VectorDB-1 | 8 | 48 GB | — |
| vLLM-11~15 | 40 | 80 GB | 560 GB |
| OS/Hypervisor | 13 | 45 GB | — |
| **Tổng** | **125** | **365 GB** | **560 GB** |

### Node 4

| VM | vCPU | RAM | GPU VRAM |
|---|---|---|---|
| Agent-Worker-7 | 12 | 24 GB | — |
| Agent-Worker-8 | 12 | 24 GB | — |
| Queue/Cache-2 | 8 | 48 GB | — |
| Queue/Cache-3 | 8 | 48 GB | — |
| Database-3 | 16 | 96 GB | — |
| VectorDB-2 | 8 | 48 GB | — |
| VectorDB-3 | 8 | 48 GB | — |
| vLLM-16~20 | 40 | 80 GB | 560 GB |
| Embedding-2 | 4 | 8 GB | 55 GB |
| LB-2 | 4 | 8 GB | — |
| Monitoring-2 | 8 | 32 GB | — |
| OS/Hypervisor | 13 | 45 GB | — |
| **Tổng** | **141** | **509 GB** | **615 GB** |

### Node 5 — STANDBY

Dự phòng. Khi 1 node fail → migrate VMs từ node lỗi sang Node 5.

---

## 7. HA & Failure Scenarios

### n+1 Dự phòng

| Scenario | Impact | Recovery |
|---|---|---|
| Node 1 fail | Mất 5 vLLM + 1 Embedding + 1 Controller + 2 Worker + 1 Queue/Cache + 1 LB | Migrate VMs sang Node 5 |
| Node 2 fail | Mất 5 vLLM + 1 Controller + 2 Worker + 1 Database + 1 Monitoring | Migrate VMs sang Node 5 |
| Node 3 fail | Mất 5 vLLM + 1 Controller + 2 Worker + 1 Database + 1 VectorDB | Migrate VMs sang Node 5 |
| Node 4 fail | Mất 5 vLLM + 1 Embedding + 2 Worker + 2 Queue/Cache + 1 Database + 2 VectorDB + 1 LB + 1 Monitoring | Migrate VMs sang Node 5 |

**Worst case (bất kỳ 1 node fail):**
- vLLM giảm từ 20 → 15 instances = 75% throughput → vẫn đủ cho ~142 RPS (> baseline 100 RPS)
- Data layer: Database/Queue/VectorDB cluster vẫn hoạt động (2/3 nodes còn lại)
- Controller: 2/3 nodes còn lại

### RTO/RPO

| Component | RTO | RPO |
|---|---|---|
| VM migration (cold) | < 5 phút | 0 (shared storage) / < 5s (local) |
| VM migration (live, nếu planned) | < 30s | 0 |
| Database failover | < 30s | < 5s |
| Queue/Cache failover | < 30s | < 1s |
| vLLM restart | < 60s | N/A (stateless) |

---

## 8. Tổng Hợp

### Bill of Resources — Final

| Thông số | Yêu cầu | Ngưỡng 30–70% | Available (5 nodes) | Status |
|---|---|---|---|---|
| **vCPU** | **520** | 750 | 560 (HT off) / 1,120 (HT on) | OK (HT on) |
| **RAM** | **4,350 GB** | 6,220 GB | 10,240 GB | OK |
| **GPU VRAM** | **2,350 GB** | 3,360 GB | 5,640 GB | OK |

### Tổng VM count

| Role | Count |
|---|---|
| Controller | 3 |
| Agent Worker | 8 |
| Queue/Cache | 3 |
| Database | 3 |
| VectorDB | 3 |
| vLLM Inference | 20 |
| Embedding | 2 |
| Load Balancer | 2 |
| Monitoring | 2 |
| **Tổng** | **46 VMs** |

---

*Ngày soạn: 2026-04-06 | Phiên bản: 2.0*
