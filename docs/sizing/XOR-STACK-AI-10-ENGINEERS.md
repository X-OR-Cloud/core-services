---
title: Đề Xuất Sizing Hạ Tầng — X-OR Stack AI (10 Kỹ Sư)
version: 1.0
date: 2026-04-15
audience: Trung tâm Hạ tầng — Khách hàng
---

# Đề Xuất Sizing Hạ Tầng — Nền Tảng X-OR Stack AI

**Phạm vi phục vụ:** 10 kỹ sư sử dụng đồng thời, nghiệp vụ quản lý / tối ưu / kiểm soát dữ liệu và kiểm thử phần mềm.

**Phiên bản:** 1.0 · **Ngày:** 2026-04-15

---

## 1. Mục Tiêu

Tài liệu này đề xuất cấu hình hạ tầng tối thiểu để triển khai nền tảng **X-OR Stack AI** phục vụ một đội 10 kỹ sư, với các nhóm nghiệp vụ chính:

- **Data Engineering:** quản lý, làm sạch, chuẩn hóa, kiểm soát chất lượng dữ liệu.
- **Data Optimization:** phân tích, sinh truy vấn, tối ưu schema và pipeline.
- **Software Testing:** sinh test case, review code, phân tích log, hỗ trợ debug.
- **Knowledge Management:** tra cứu tài liệu nội bộ bằng RAG (Retrieval-Augmented Generation).

Hạ tầng được thiết kế chạy **on-premise**, **air-gap** (không phụ thuộc dịch vụ bên ngoài), triển khai qua máy ảo (VM) trên một máy chủ vật lý duy nhất có GPU.

---

## 2. Kiến Trúc Tổng Thể

### 2.1 Mô hình kiến trúc logic

```
        ┌──────────────────────────────────────────────┐
        │           Người dùng (10 kỹ sư)              │
        │      Web UI · IDE Plugin · CLI Tools          │
        └────────────────────┬─────────────────────────┘
                             │ HTTPS / WebSocket
        ┌────────────────────▼─────────────────────────┐
        │           Reverse Proxy / Load Balancer      │
        │              (TLS termination, routing)      │
        └────────────────────┬─────────────────────────┘
                             │
        ┌────────────────────▼─────────────────────────┐
        │           X-OR STACK AI — CORE SERVICES      │
        │                                              │
        │   • IAM   — xác thực, phân quyền, audit log  │
        │   • CBM   — quản lý dự án, tài liệu, task    │
        │   • AIWM  — điều phối agent, tool-calling,   │
        │             workflow, RAG, knowledge base    │
        │   • MONA  — giám sát, metrics, log, tracing  │
        │                                              │
        │   (API Gateway · Agent Orchestrator ·        │
        │    Document Processor · Job Queue Worker)    │
        └──┬─────────────────┬────────────────────┬────┘
           │                 │                    │
    ┌──────▼──────┐   ┌──────▼──────┐      ┌──────▼──────┐
    │  Inference  │   │  Embedding  │      │  Data Layer │
    │   Engine    │   │    Engine   │      │             │
    │  (Gemma 4)  │   │  (BGE / E5) │      │  • Database │
    │             │   │             │      │  • VectorDB │
    │  GPU: A100  │   │             │      │  • Object   │
    │    40GB     │   │             │      │    Storage  │
    └─────────────┘   └─────────────┘      │  • Cache /  │
                                           │    Queue    │
                                           └─────────────┘
```

### 2.2 Diễn giải thành phần

| # | Thành phần | Vai trò |
|---|---|---|
| 1 | **Reverse Proxy / Load Balancer** | Tiếp nhận kết nối từ người dùng, xử lý TLS, định tuyến tới service phía sau, cân tải giữa 2 node ứng dụng. |
| 2 | **Core Services (X-OR Stack AI)** | Cụm các service lõi của nền tảng, bao gồm:<br>• **IAM** — xác thực (JWT), phân quyền (RBAC), audit log, quản lý tài khoản.<br>• **CBM** — quản lý dự án, tài liệu, công việc, cộng tác nội bộ.<br>• **AIWM** — điều phối AI agent, tool-calling, workflow nhiều bước, RAG, knowledge base.<br>• **MONA** — giám sát, thu thập metrics, log, tracing phục vụ vận hành.<br>Bên trong mỗi service có API Gateway, Agent Orchestrator, Document Processor, Job Queue Worker. |
| 3 | **Inference Engine** | Chạy model LLM (Gemma 4) trên GPU; phục vụ sinh văn bản, sinh code, phân tích. |
| 4 | **Embedding Engine** | Chuyển văn bản / tài liệu / code thành vector phục vụ tìm kiếm ngữ nghĩa (RAG). |
| 5 | **Database** | Lưu metadata người dùng, lịch sử hội thoại, cấu hình agent, trạng thái job. |
| 6 | **VectorDB** | Lưu và tìm kiếm embedding (semantic search) cho knowledge base và code base. |
| 7 | **Object Storage** | Lưu file gốc: tài liệu, dataset, artifact test, log file. |
| 8 | **Cache / Queue** | Cache phiên làm việc, hàng đợi job bất đồng bộ (ingest, embedding, long-running task). |

> **Lưu ý thuật ngữ:** các thành phần Database / VectorDB / Object Storage / Cache / Queue được mô tả chung theo vai trò; sản phẩm cụ thể sẽ được chọn ở giai đoạn triển khai, phù hợp với tiêu chuẩn của Trung tâm Hạ tầng.

### 2.3 Mô hình vật lý / hạ tầng triển khai

Cụm được triển khai trên **2 máy chủ vật lý (node)** đứng sau Load Balancer, trong đó **chỉ 1 node được trang bị GPU** để chạy Inference Engine. Cả 2 node đều chạy đầy đủ core services để đảm bảo tính sẵn sàng (HA active-active) cho tầng ứng dụng.

```
                    ┌──────────────────────────┐
                    │    Người dùng (10 KS)    │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Load Balancer (VIP)     │
                    │  (HA: active-passive)    │
                    └──────┬────────────┬──────┘
                           │            │
               ┌───────────▼──┐      ┌──▼───────────┐
               │   NODE 01    │      │   NODE 02    │
               │  (GPU node)  │      │  (CPU node)  │
               │              │      │              │
               │ • IAM        │      │ • IAM        │
               │ • CBM        │      │ • CBM        │
               │ • AIWM       │      │ • AIWM       │
               │ • MONA       │      │ • MONA       │
               │ • Inference  │      │ • Embedding  │
               │   (A100 40G) │      │ • Doc Proc.  │
               │ • Data Layer │      │ • Data Layer │
               │   (primary)  │      │  (secondary) │
               └──────────────┘      └──────────────┘
                        │                    │
                        └──── Replication ───┘
```

**Bảng cấu hình tổng yêu cầu** *(chia đều cho 2 node, chỉ Node 01 có GPU)*:

| Thành phần | Node 01 | Node 02 | **Tổng cụm** |
|---|---|---|---|
| Vai trò | Core services + Inference GPU + Data primary | Core services + Embedding + Doc Proc + Data secondary | — |
| CPU | 20 core | 20 core | **40 core** |
| RAM | 32 GB | 32 GB | **64 GB** |
| SSD Storage | 600 GB | 600 GB | **1.2 TB** |
| GPU | **1 × NVIDIA A100 40GB** | — | 1 × A100 40GB |
| **Hệ điều hành** | **Ubuntu Server 24.04 LTS** | **Ubuntu Server 24.04 LTS** | — |
| Runtime triển khai | VM (KVM/libvirt) **hoặc** Container (Docker / Podman / Kubernetes) | VM (KVM/libvirt) **hoặc** Container (Docker / Podman / Kubernetes) | — |

> **Ghi chú về hình thức triển khai:** Các workload trong tài liệu này có thể được đóng gói dưới dạng **VM** hoặc **Container** tùy theo chuẩn vận hành của Trung tâm Hạ tầng. Các bảng "VM" ở Mục 3 nên được hiểu là **đơn vị workload** (workload unit) — có thể ánh xạ 1-1 thành VM, hoặc thành Pod/Container với cùng mức tài nguyên CPU/RAM/Disk đã đề xuất. Khi chọn triển khai bằng Container, cần đáp ứng thêm:
>
> - **Container runtime:** Docker Engine ≥ 24 / containerd ≥ 1.7 / Podman ≥ 4, hoặc Kubernetes ≥ 1.28.
> - **NVIDIA Container Toolkit** (`nvidia-container-toolkit`) cài trên Node 01 để container truy cập được GPU A100 (`--gpus all` hoặc `nvidia.com/gpu` resource trong Kubernetes).
> - **NVIDIA Driver** tương thích với CUDA 12.x trên Node 01 (driver ≥ 535).
> - **GPU Device Plugin** (nếu dùng Kubernetes) để scheduler nhận biết và cấp phát GPU cho pod Inference.
> - **Persistent Volume** cho các workload dữ liệu (Database, VectorDB, Object Storage) — dùng local-path hoặc CSI driver theo chuẩn của Trung tâm Hạ tầng.
> - **Network plugin** hỗ trợ cách ly theo VLAN/NetworkPolicy để giữ nguyên mô hình 4 subnet ở Mục 2.4.

### 2.4 Quy hoạch dải mạng nội bộ

Đề xuất chia **4 VLAN / subnet** riêng cho từng nhóm chức năng, đảm bảo cách ly lưu lượng và kiểm soát truy cập dễ dàng:

| VLAN | Tên | Dải IP đề xuất | Mục đích | Thành phần thuộc dải |
|---|---|---|---|---|
| 10 | **USER-ACCESS** | `10.10.10.0/24` | Truy cập sử dụng dịch vụ từ người dùng cuối | Load Balancer VIP, Reverse Proxy, endpoint Web UI / API public nội bộ |
| 20 | **CORE-SERVICE** | `10.10.20.0/24` | Các dịch vụ lõi của nền tảng | VM IAM, CBM, AIWM, MONA, Inference Engine, Embedding Engine, Document Processor |
| 30 | **DATA** | `10.10.30.0/24` | Tầng dữ liệu (data service) | Database, VectorDB, Object Storage, Cache / Queue |
| 40 | **OPS-MONITOR** | `10.10.40.0/24` | Giám sát vận hành hệ thống | Metrics collector, log aggregator, tracing, dashboard vận hành, SSH bastion |

**Nguyên tắc định tuyến / firewall:**

- `USER-ACCESS` chỉ được phép mở kết nối tới `CORE-SERVICE` qua các port dịch vụ (HTTPS/WS).
- `CORE-SERVICE` được phép mở kết nối tới `DATA` qua port của database/vectordb/cache/queue.
- `DATA` **không** chủ động mở kết nối ra các dải khác (chỉ nhận kết nối).
- `OPS-MONITOR` được phép đọc (scrape metrics, pull log) từ mọi dải, nhưng không cho phép chiều ngược lại.
- Quản trị hệ thống (SSH) chỉ qua bastion trong `OPS-MONITOR`.

---

## 3. Phân Bổ Workload Trên 2 Node

Xem cấu hình máy chủ vật lý ở **Mục 2.3**. Dưới đây là phân bổ các **workload unit** chạy trên 2 node. Mỗi workload unit có thể được triển khai dưới dạng **VM** hoặc **Container** theo lựa chọn của Trung tâm Hạ tầng (xem ghi chú ở Mục 2.3).

### 3.1 Node 01 (GPU node)

| # | Workload | vCPU | RAM | Disk | GPU | Vai trò |
|---|---|---:|---:|---:|---:|---|
| 1 | Core Services A (IAM + CBM + AIWM + MONA) | 4 | 6 GB | 50 GB | — | Cụm service lõi (instance A) — chạy active-active với Node 02 |
| 2 | **Inference Engine** | 6 | 8 GB | 100 GB | **A100 40GB (passthrough)** | Chạy Gemma 4 |
| 3 | Document Processor | 2 | 3 GB | 50 GB | — | OCR, ETL tài liệu |
| 4 | Database (primary) | 2 | 4 GB | 150 GB | — | Metadata, lịch sử |
| 5 | VectorDB (primary) | 2 | 4 GB | 150 GB | — | Index vector |
| 6 | Cache / Queue / Object Storage (A) | 2 | 3 GB | 50 GB | — | Dịch vụ dữ liệu phụ trợ |
| | Dự phòng OS + hypervisor | 2 | 4 GB | 50 GB | — | |
| | **Tổng Node 01** | **20** | **32 GB** | **~600 GB** | **1 × A100 40GB** | |

### 3.2 Node 02 (CPU node)

| # | Workload | vCPU | RAM | Disk | GPU | Vai trò |
|---|---|---:|---:|---:|---:|---|
| 1 | Load Balancer / Reverse Proxy | 2 | 2 GB | 30 GB | — | LB VIP, TLS, routing |
| 2 | Core Services B (IAM + CBM + AIWM + MONA) | 4 | 6 GB | 50 GB | — | Cụm service lõi (instance B) |
| 3 | Embedding Engine | 2 | 3 GB | 50 GB | — | Sinh embedding (CPU) |
| 4 | Document Processor | 2 | 3 GB | 50 GB | — | OCR, ETL tài liệu |
| 5 | Database (secondary) | 2 | 4 GB | 150 GB | — | Replica metadata |
| 6 | VectorDB (secondary) | 2 | 4 GB | 150 GB | — | Replica vector |
| 7 | Cache / Queue / Object Storage (B) | 2 | 3 GB | 50 GB | — | Dịch vụ dữ liệu phụ trợ |
| 8 | Monitoring / Logging | 2 | 3 GB | 20 GB | — | Metrics, log, tracing (MONA ops) |
| | Dự phòng OS + hypervisor | 2 | 4 GB | 50 GB | — | |
| | **Tổng Node 02** | **20** | **32 GB** | **~600 GB** | — | |

### 3.3 Tổng hợp 2 node

| Chỉ số | Node 01 | Node 02 | **Tổng cụm** | **Ngưỡng** | Trạng thái |
|---|---:|---:|---:|---:|:---:|
| vCPU | 20 | 20 | **40** | 40 core | ✅ |
| RAM | 32 GB | 32 GB | **64 GB** | 64 GB | ✅ |
| SSD | ~600 GB | ~600 GB | **~1.2 TB** | 1.2 TB | ✅ |

> **Ghi chú:**
> - Cả 2 node cùng chạy Core Services ở chế độ **active-active** phía sau Load Balancer. Data Layer (Database / VectorDB) chạy ở chế độ **primary–secondary** với replication chéo giữa hai node, đảm bảo HA cơ bản.
> - Vì ngưỡng RAM rất chặt (64 GB cho cả cụm), các workload được cấp phát ở mức tối thiểu để vận hành ổn định cho 10 người dùng đồng thời. Khi tải tăng hoặc cần mở rộng số người dùng, khuyến nghị nâng RAM lên tối thiểu 96–128 GB / cụm.
> - Workload Inference được ưu tiên RAM cao nhất (12 GB) để đảm bảo độ ổn định của serving engine và page cache cho model weights khi load từ disk lên VRAM.

---

## 4. Công Thức Tính GPU — A100 40GB Phục Vụ 10 Người Dùng

Đây là phần trọng yếu để Trung tâm Hạ tầng kiểm chứng rằng **1 GPU A100 40GB** là đủ cho 10 kỹ sư sử dụng liên tục.

### 4.1 Lựa chọn model

Nền tảng sử dụng **Gemma 4** (Google DeepMind) — họ model mã nguồn mở mới nhất (2026). Trong 4 biến thể (E2B, E4B, 31B dense, 26B A4B MoE), lựa chọn đề xuất:

> **Gemma 4 — 26B A4B** *(Mixture-of-Experts, 4B tham số kích hoạt trên mỗi token, tổng 26B tham số, context window 256K)*

**Lý do:**

- **Chất lượng ở mức model 26B** — đủ mạnh cho nghiệp vụ code và data engineering.
- **Chi phí compute tương đương model 4B** vì kiến trúc MoE chỉ kích hoạt một phần expert cho mỗi token ⇒ throughput cao, độ trễ thấp.
- **Context 256K token** — đủ để đưa toàn bộ module code, schema database hoặc log dài vào prompt mà không cần cắt nhỏ.
- **Hỗ trợ quantization** (GGUF, bitsandbytes, INT8/INT4) ⇒ giảm VRAM mà giữ chất lượng.

### 4.2 Công thức tính VRAM

VRAM của GPU khi chạy inference LLM được tính theo công thức:

```
VRAM_total = VRAM_weights + VRAM_kv_cache + VRAM_activation + VRAM_overhead
```

Trong đó:

| Thành phần | Công thức | Ý nghĩa |
|---|---|---|
| `VRAM_weights` | `P × bytes_per_param` | Trọng số model; `P` = số tham số, `bytes_per_param` phụ thuộc quantization (FP16=2, INT8=1, INT4=0.5) |
| `VRAM_kv_cache` | `2 × n_layers × n_heads × d_head × (L_ctx) × batch × bytes_per_elem` | Bộ nhớ lưu key/value của context đã sinh; tăng tuyến tính theo độ dài context và số request đồng thời |
| `VRAM_activation` | ~5–10% tổng | Tensor trung gian khi forward pass |
| `VRAM_overhead` | ~1–2 GB | CUDA runtime, kernel cache |

### 4.3 Áp dụng cho Gemma 4 — 26B A4B trên A100 40GB

**a) Trọng số model (`VRAM_weights`)**

| Quantization | Công thức | Kết quả |
|---|---|---|
| FP16 (bf16) | 26 × 10⁹ × 2 byte | ≈ **52 GB** ❌ (vượt 40 GB) |
| INT8 | 26 × 10⁹ × 1 byte | ≈ **26 GB** ✅ |
| INT4 (Q4_K_M) | 26 × 10⁹ × 0.5 byte | ≈ **13 GB** ✅ |

➡️ **Chọn INT8** để cân bằng chất lượng và bộ nhớ. `VRAM_weights ≈ 26 GB`.

**b) KV cache (`VRAM_kv_cache`)**

Kiến trúc MoE của Gemma 4 26B A4B có các tham số tiêu biểu:
`n_layers ≈ 32`, `n_kv_heads ≈ 8`, `d_head ≈ 128`, KV dtype = FP16 (2 byte).

Bộ nhớ KV cache trên **mỗi token**:

```
kv_per_token = 2 × n_layers × n_kv_heads × d_head × bytes_per_elem
             = 2 × 32 × 8 × 128 × 2
             ≈ 131 KB / token
```

Giả định vận hành thực tế của 10 kỹ sư:

| Giả định | Giá trị |
|---|---|
| Độ dài context trung bình / phiên | 8,000 token (prompt + output đang sinh) |
| Số phiên đồng thời tối đa | 10 (mỗi kỹ sư 1 phiên đang sinh) |
| Tổng token đang giữ trong KV cache | 10 × 8,000 = **80,000 token** |

```
VRAM_kv_cache = 80,000 × 131 KB
              ≈ 10.5 GB
```

**c) Activation + overhead**

```
VRAM_activation + VRAM_overhead ≈ 2 GB
```

**d) Tổng VRAM sử dụng**

```
VRAM_total = 26 GB (weights INT8)
           + 10.5 GB (KV cache, 10 phiên × 8K token)
           + 2 GB (activation + overhead)
           ≈ 38.5 GB
```

➡️ **Còn dư ~1.5 GB** trong tổng 40 GB của A100 ⇒ vừa vặn cho 10 người dùng liên tục ở context 8K.

### 4.4 Phân tích throughput (đáp ứng “liên tục”)

**Giả định hành vi:**

| Chỉ số | Giá trị |
|---|---|
| Số kỹ sư đồng thời | 10 |
| Số request / kỹ sư / giờ (peak) | ~30 (1 request mỗi 2 phút) |
| Tổng request / giờ | 300 |
| Token sinh trung bình / request | 500 token |
| Tổng token sinh / giờ | 150,000 |
| Token sinh / giây trung bình | ~42 tok/s |

**Throughput của A100 40GB chạy Gemma 4 26B A4B (INT8, vLLM + continuous batching):**

| Chỉ số | Giá trị tham chiếu |
|---|---|
| Throughput đơn request | ~60–80 tok/s |
| Throughput tổng (batch 8–16) | ~500–900 tok/s |

➡️ Nhu cầu **~42 tok/s trung bình** (đỉnh ~150 tok/s) << **~700 tok/s** mà GPU có thể cung cấp.

**Kết luận:** 1 × A100 40GB **dư công suất** để phục vụ 10 kỹ sư sử dụng liên tục với model Gemma 4 26B A4B quantized INT8. Hệ số an toàn ≈ **4–5 lần** so với peak.

### 4.5 Biên an toàn & kịch bản mở rộng

| Kịch bản | Tác động | Giải pháp |
|---|---|---|
| Tăng context trung bình lên 16K | KV cache tăng gấp đôi (~21 GB) ⇒ tổng ~49 GB (vượt) | Hạ quantization xuống INT4 (`weights ≈ 13 GB`) ⇒ tổng ~36 GB ✅ |
| Số người dùng tăng lên 20 | KV cache × 2, throughput yêu cầu × 2 | Dùng INT4 + bổ sung thêm 1 × A100 40GB |
| Nghiệp vụ cần model lớn hơn | — | Chuyển sang A100 80GB hoặc H100 |

---

## 5. Ước Lượng Lưu Trữ

| Dữ liệu | Dung lượng dự kiến | Ghi chú |
|---|---|---|
| Database (metadata, lịch sử hội thoại) | ~30 GB | Đủ cho ~12 tháng vận hành 10 kỹ sư |
| VectorDB (embedding index) | ~100 GB | ~500K document × vector + index |
| Object Storage (file gốc, dataset, log) | ~300 GB | Tài liệu kỹ thuật, source code, test artifact |
| Model weights (Gemma 4 + embedding) | ~50 GB | Cache model cục bộ cho Inference |
| Log & metrics (30 ngày) | ~50 GB | |
| OS + binary + backup ngắn hạn | ~200 GB | |
| **Tổng dung lượng cần** | **~730 GB dữ liệu nghiệp vụ** | Nằm trong ngưỡng 1.2 TB SSD tổng của cụm |

> Khi dung lượng Object Storage / VectorDB chạm ngưỡng, khuyến nghị mở rộng SSD hoặc gắn thêm volume dữ liệu ngoài (NAS/SAN) cho tầng Object Storage.

---

## 6. Yêu Cầu Mạng & Bảo Mật

| Hạng mục | Yêu cầu |
|---|---|
| Băng thông nội bộ | ≥ 10 Gbps giữa các VM (virtual switch) |
| Băng thông truy cập người dùng | ≥ 1 Gbps từ LAN doanh nghiệp |
| Cách ly mạng | VLAN riêng cho hạ tầng X-OR Stack AI |
| Chứng chỉ TLS | TLS 1.3 cho toàn bộ endpoint |
| Kiểm soát truy cập | Tích hợp với hệ thống xác thực nội bộ (LDAP/SSO nếu có) |
| Nhật ký kiểm toán | Lưu tối thiểu 180 ngày |
| Sao lưu | Backup hằng ngày, khôi phục điểm trong 7 ngày |

---

## 7. Tóm Tắt Yêu Cầu Cấp Phát

| Hạng mục | Số lượng | Ghi chú |
|---|---|---|
| **Tài nguyên tổng** | **40 core CPU · 64 GB RAM · 1.2 TB SSD** | Chia đều cho 2 node (mỗi node 20 core / 32 GB / 600 GB) |
| **Máy chủ vật lý** | **2 node** | Node 01 có thêm 1 × A100 40GB |
| **Hệ điều hành** | Ubuntu Server 24.04 LTS | Trên cả 2 node |
| **Workload unit** | **13** (VM hoặc Container) | Node 01: 6 · Node 02: 7 — triển khai VM hoặc Container theo chuẩn của Trung tâm Hạ tầng |
| **GPU** | **1 × NVIDIA A100 40GB** | Passthrough cho VM Inference trên Node 01 |
| **VLAN / subnet** | 4 | USER-ACCESS, CORE-SERVICE, DATA, OPS-MONITOR (xem Mục 2.4) |
| **Địa chỉ IP nội bộ** | ~20 | Các VM + VIP + bastion |
| **Tên miền nội bộ** | 1 | Ví dụ `xorstack.internal` |
| **Chứng chỉ TLS** | 1 wildcard | `*.xorstack.internal` |

---

## 8. Phụ Lục — Giải Thích Các Thuật Ngữ Chính

| Thuật ngữ | Giải thích ngắn |
|---|---|
| **LLM** (Large Language Model) | Model ngôn ngữ lớn, lõi sinh văn bản / code. |
| **RAG** (Retrieval-Augmented Generation) | Kỹ thuật tra cứu tài liệu nội bộ rồi đưa vào prompt để model trả lời chính xác theo dữ liệu của tổ chức. |
| **Embedding** | Biểu diễn vector của văn bản / code, dùng để tìm kiếm ngữ nghĩa. |
| **VectorDB** | Cơ sở dữ liệu chuyên lưu và tìm kiếm embedding. |
| **KV cache** | Bộ nhớ lưu key/value của các token đã sinh, giúp model không phải tính lại khi sinh tiếp. |
| **Quantization** | Kỹ thuật nén trọng số model (FP16 → INT8 / INT4) để giảm VRAM, đánh đổi chất lượng rất nhỏ. |
| **MoE** (Mixture-of-Experts) | Kiến trúc model chia thành nhiều expert, mỗi token chỉ kích hoạt một phần ⇒ compute thấp, chất lượng cao. |
| **Tool-calling** | Cơ chế cho phép agent gọi công cụ bên ngoài (query DB, chạy test, đọc file…) thay vì chỉ sinh văn bản. |
| **Continuous batching** | Kỹ thuật của inference engine gộp nhiều request đang sinh vào cùng một batch GPU để tăng throughput. |

---

*Tài liệu soạn bởi đội kỹ thuật X-OR Stack AI · Phiên bản 1.0 · Ngày 2026-04-15*
