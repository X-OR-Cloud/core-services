# Air-Gap Kubernetes — Danh Sách Container Images & LLM Models

> Tài liệu này liệt kê toàn bộ container images và LLM models cần chuẩn bị để triển khai
> hệ thống hydra-services vào môi trường air-gap Kubernetes với GPU A100 40GB.
>
> Ngày cập nhật: 21/04/2026

---

## Mục lục

1. [Container Images — NestJS Runtime](#1-container-images--nestjs-runtime)
2. [Container Images — Infrastructure](#2-container-images--infrastructure)
3. [Container Images — Object Storage](#3-container-images--object-storage)
4. [Container Images — GPU & CUDA](#4-container-images--gpu--cuda)
5. [Container Images — LLM Inference Frameworks](#5-container-images--llm-inference-frameworks)
6. [Container Images — Ops Support](#6-container-images--ops-support)
7. [LLM Models](#7-llm-models)
8. [Embedding Model](#8-embedding-model)
9. [Hướng dẫn Pull & Export](#9-hướng-dẫn-pull--export)

---

## 1. Container Images — NestJS Runtime

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `node` | `20-alpine3.21` | ~130 MB | https://hub.docker.com/_/node |

**Mục đích:** Base image để build và chạy tất cả NestJS microservices trong monorepo (template, iam, noti, aiwm, cbm, mona, schd). Alpine variant để giảm kích thước image. Cần cài thêm `curl`, `bash`, `ca-certificates` khi build Dockerfile cho từng service.

---

## 2. Container Images — Infrastructure

### MongoDB

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `mongo` | `8.0` | ~800 MB | https://hub.docker.com/_/mongo |

**Mục đích:** Database chính của toàn hệ thống. Mỗi service sử dụng một database riêng biệt theo quy ước `{DatabaseNamePrefix}{serviceName}`. Phiên bản 8.0 đang được sử dụng trong môi trường production hiện tại (endpoint: `10.10.0.100:27017`).

---

### Redis

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `redis` | `7.4-alpine` | ~40 MB | https://hub.docker.com/_/redis |

**Mục đích:** Shared instance dùng cho 3 mục đích đồng thời: (1) BullMQ job queue cho async processing, (2) Socket.IO adapter cho WebSocket clustering, (3) caching layer. Alpine variant để tiết kiệm tài nguyên.

---

### Qdrant

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `qdrant/qdrant` | `v1.14.0` | ~200 MB | https://hub.docker.com/r/qdrant/qdrant |

**Mục đích:** Vector database lưu trữ embeddings cho các tính năng AI của service `aiwm`. Được dùng trong RAG pipeline, semantic search, và memory của các AI agents. Endpoint hiện tại: `10.10.0.100:6333`.

---

## 3. Container Images — Object Storage

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `chrislusf/seaweedfs` | `4.20` | ~100 MB | https://hub.docker.com/r/chrislusf/seaweedfs |

**Mục đích:** S3-compatible object storage tự host — thay thế cho MinIO (vấn đề AGPL-3.0 license). Dùng để lưu trữ file upload, model artifacts, documents của service `cbm`. SeaweedFS có S3 gateway tương thích hoàn toàn, Apache 2.0 license, viết bằng Go nên nhẹ và dễ vận hành trên Kubernetes.

> **Lý do chọn SeaweedFS thay MinIO:** MinIO đổi sang AGPL-3.0 từ 2021, có thể xung đột với môi trường enterprise/closed-source. SeaweedFS là Apache 2.0, production-ready từ 2012, có Helm chart sẵn cho K8s.

---

## 4. Container Images — GPU & CUDA

### NVIDIA CUDA Base Images

| Image | Tag | Size | Min Driver | Dùng với |
|-------|-----|------|-----------|---------|
| `nvidia/cuda` | `12.6.3-cudnn-runtime-ubuntu22.04` | ~5.5 GB | 560.35.03 | vLLM 0.8.4+, PyTorch 2.5+ |
| `nvidia/cuda` | `12.4.1-cudnn-runtime-ubuntu22.04` | ~5.2 GB | 550.54.14 | **Recommended default** — vLLM 0.8.x, PyTorch 2.3-2.4 |
| `nvidia/cuda` | `12.2.2-cudnn8-runtime-ubuntu22.04` | ~4.8 GB | 535.54.03 | LMDeploy, TensorFlow 2.14-2.15 |
| `nvidia/cuda` | `12.1.1-cudnn8-runtime-ubuntu22.04` | ~4.7 GB | 530.30.02 | TGI 3.x, PyTorch 2.1-2.2 |
| `nvidia/cuda` | `11.8.0-cudnn8-runtime-ubuntu22.04` | ~4.2 GB | 520.61.05 | Legacy pipelines, Triton 22-23 |

Docker Hub: https://hub.docker.com/r/nvidia/cuda

**Mục đích:** Base image để build custom container chạy trên GPU A100. Chọn tag theo framework sẽ sử dụng. Nếu không biết driver version trên node của khách hàng, chọn `12.4.1` — có compatibility rộng nhất với ecosystem hiện tại.

> **Lưu ý A100:** NVIDIA A100 là GPU kiến trúc Ampere (SM 8.0), hỗ trợ CUDA từ 11.0 trở lên. Tag `devel` dùng khi cần compile kernel, tag `runtime` đủ cho inference.

---

### NVIDIA K8s Device Plugin

| Image | Tag | Size | Registry |
|-------|-----|------|---------|
| `nvcr.io/nvidia/k8s-device-plugin` | `v0.17.0` | ~200 MB | https://catalog.ngc.nvidia.com/orgs/nvidia/containers/k8s-device-plugin |

**Mục đích:** DaemonSet plugin bắt buộc để Kubernetes nhận diện và expose GPU A100 cho các Pod. Không có image này, K8s không thể schedule workload lên GPU node. Cần deploy trước khi chạy bất kỳ LLM inference workload nào.

---

## 5. Container Images — LLM Inference Frameworks

### vLLM (Primary — Khuyến nghị)

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `vllm/vllm-openai` | `v0.8.4` | ~12.6 GB | https://hub.docker.com/r/vllm/vllm-openai |
| `vllm/vllm-openai` | `gemma4` | ~12.6 GB | https://hub.docker.com/r/vllm/vllm-openai |

**Mục đích:** Framework inference LLM hiệu năng cao, là lựa chọn chính cho production. Cung cấp OpenAI-compatible API (`/v1/chat/completions`, `/v1/completions`, `/v1/models`) — tương thích trực tiếp với Vercel AI SDK và LangChain đang dùng trong `aiwm`. Hỗ trợ PagedAttention, FlashAttention-2, quantization AWQ/GPTQ/FP8, tool use/function calling. A100 là GPU target chính của dự án vLLM.

> **Lưu ý:** Tag `gemma4` được tối ưu riêng cho Gemma 4, nên pull cả hai tag.

---

### Text Generation Inference — TGI (Fallback)

| Image | Tag | Size | Registry |
|-------|-----|------|---------|
| `ghcr.io/huggingface/text-generation-inference` | `3.3.5` | ~9.3 GB | https://github.com/huggingface/text-generation-inference/pkgs/container/text-generation-inference |

**Mục đích:** HuggingFace's inference server, fallback khi vLLM không tương thích với model cụ thể. Hỗ trợ continuous batching, Flash Attention, quantization. OpenAI-compatible API ở mức partial. Hiện đang ở maintenance mode (chỉ nhận bug fix, không có feature mới).

---

### LMDeploy (Fallback — Tối ưu A100)

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `openmmlab/lmdeploy` | `v0.7.2-cu12` | ~9 GB | https://hub.docker.com/r/openmmlab/lmdeploy |

**Mục đích:** Framework của Shanghai AI Lab, tối ưu đặc biệt cho A100 (SM 8.0) với TurboMind engine. Throughput cao hơn vLLM trên một số model Qwen/InternLM. Dùng khi cần squeeze maximum performance từ A100. Hỗ trợ W4A16 (AWQ), W8A8, FP16, BF16 và tool calling từ v0.5+.

---

### LocalAI (Lightweight Alternative)

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `localai/localai` | `v2.22.1-cublas-cuda12-core` | ~4 GB | https://hub.docker.com/r/localai/localai |

**Mục đích:** Framework nhẹ nhất trong danh sách (~3-5GB), dùng llama.cpp với cuBLAS backend. Phù hợp khi cần chạy GGUF quantized models hoặc tài nguyên hạn chế. Full OpenAI API compatibility. Tag `-core` không bundle sẵn model.

---

### Triton Inference Server (Enterprise Scale)

| Image | Tag | Size | Registry |
|-------|-----|------|---------|
| `nvcr.io/nvidia/tritonserver` | `25.01-trtllm-python-py3` | ~20 GB | https://catalog.ngc.nvidia.com/orgs/nvidia/containers/tritonserver |

**Mục đích:** NVIDIA's enterprise-grade inference server, dùng khi cần multi-model serving, ensemble pipeline, hoặc dynamic batching ở scale lớn. TurboMind engine cho maximum A100 throughput. Không native OpenAI API — cần shim plugin.

> **Lưu ý quan trọng:** `nvcr.io` yêu cầu **NVIDIA NGC API key** để pull. Cần xử lý authentication trước khi đưa vào môi trường air-gap.

---

## 6. Container Images — Ops Support

### Nginx

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `nginx` | `1.27-alpine` | ~40 MB | https://hub.docker.com/_/nginx |

**Mục đích:** Reverse proxy và ingress cho các service. Dùng làm API gateway nội bộ, load balancer, hoặc static file server. Alpine variant để giảm attack surface.

---

### Alpine

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `alpine` | `3.21` | ~5 MB | https://hub.docker.com/_/alpine |

**Mục đích:** Base image cho init containers và sidecar containers trong K8s. Dùng để chạy các script khởi tạo (database migration, config seeding) trước khi main container start.

---

### BusyBox

| Image | Tag | Size | Docker Hub |
|-------|-----|------|-----------|
| `busybox` | `1.37` | ~4 MB | https://hub.docker.com/_/busybox |

**Mục đích:** Minimal toolbox cho debug và troubleshooting trong K8s. Dùng trong init containers để kiểm tra connectivity (`wget`, `nc`) trước khi service start, hoặc ephemeral debug pod.

---

## 7. LLM Models

> Tất cả models chạy trên **A100 40GB VRAM**. Serve qua vLLM với OpenAI-compatible API.
> Use case: tool/function calling, chain-of-thought reasoning, Ubuntu sysadmin, Oracle DB/SQL, software testing/QA.

---

### Gemma 4 27B (Google)

| Thuộc tính | Giá trị |
|-----------|--------|
| Ollama | `gemma4:27b` |
| HuggingFace | `google/gemma-4-27b-it` |
| vLLM tag đặc biệt | `vllm/vllm-openai:gemma4` |
| Kiến trúc | MoE (Mixture of Experts) — 26B params, chỉ activate 3.8B tại một thời điểm |
| VRAM thực tế | ~14–16 GB (BF16, nhờ MoE) — **không cần quantize trên A100 40GB** |
| Tool use | Native function calling |
| Context | 128K tokens |
| License | Gemma Terms of Use |
| Release | 02/04/2026 |

**Điểm mạnh:** Kiến trúc MoE cực kỳ hiệu quả — chạy được BF16 full precision trên A100 40GB. Multimodal (text + image). Mạnh về Linux/Ubuntu knowledge, Google training data phong phú về technical documentation. Tốt nhất trong 3 models cho sysadmin tasks.

---

### Qwen3.6-35B-A3B (Alibaba)

| Thuộc tính | Giá trị |
|-----------|--------|
| Ollama | `qwen3.6:35b` |
| HuggingFace | `Qwen/Qwen3.6-35B-A3B-Instruct` |
| Kiến trúc | MoE — 35B params, activate 3B |
| VRAM thực tế | ~12–15 GB (BF16, MoE) — **không cần quantize** |
| Tool use | Native, agentic coding |
| Context | 128K tokens |
| License | Apache 2.0 |
| Release | 04/2026 |

**Điểm mạnh:** Thế hệ mới nhất của Qwen, cải thiện đáng kể về agentic coding và thinking preservation. MoE architecture nhẹ, throughput cao. Mạnh nhất trong 3 models cho software testing, code generation, và Oracle SQL. Apache 2.0 — không lo vấn đề license trong môi trường enterprise.

---

### DeepSeek-R1 32B

| Thuộc tính | Giá trị |
|-----------|--------|
| Ollama | `deepseek-r1:32b` |
| HuggingFace | `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B` |
| Kiến trúc | Dense 32B (distilled từ DeepSeek-R1 671B) |
| VRAM thực tế | ~20 GB (AWQ INT4) hoặc ~32 GB (BF16) |
| Quantization | AWQ INT4 nếu dùng cùng models khác; BF16 nếu chạy độc lập |
| Tool use | Partial — reasoning-first, cần prompt engineering cho function calling |
| Context | 128K tokens |
| License | MIT |
| Update | R1-0528: AIME 2025 đạt 87.5% |

**Điểm mạnh:** Chain-of-thought reasoning tốt nhất trong 3 models, dùng `<think>` scratchpad hiển thị quá trình suy luận. Phù hợp nhất cho các tác vụ phức tạp đòi hỏi multi-step reasoning: phân tích lỗi hệ thống, debug database query, thiết kế test strategy.

> **Lưu ý VRAM:** DeepSeek-R1 32B là model Dense (không phải MoE), cần ~32GB BF16. Nếu chạy song song với models khác trên cùng GPU cần dùng AWQ INT4 (~20GB).

---

### Tóm tắt 3 Models

| Model | VRAM | Tool Use | Mạnh nhất |
|-------|------|----------|-----------|
| Gemma 4 27B | ~16 GB (BF16) | Native | Sysadmin, Linux, technical docs |
| Qwen3.6-35B-A3B | ~15 GB (BF16) | Native | Software testing, Oracle SQL, coding |
| DeepSeek-R1 32B | ~32 GB (BF16) / ~20 GB (INT4) | Partial | Chain-of-thought reasoning, debugging |

---

## 8. Embedding Model

> **Gemma 4 27B, Qwen3.6, DeepSeek-R1 đều không hỗ trợ text embedding** — đây là general-purpose LLMs, không có embedding API. Cần dedicated embedding model riêng cho RAG pipeline của Qdrant.

---

### Qwen3-Embedding-8B (Khuyến nghị)

| Thuộc tính | Giá trị |
|-----------|--------|
| HuggingFace | `Qwen/Qwen3-Embedding-8B` |
| Ollama | `qwen3-embedding:8b` |
| VRAM | ~8 GB (BF16) — chạy thoải mái song song với inference models |
| MTEB Multilingual Score | 70.58 — **#1 leaderboard** tính đến Q1/2026 |
| Context | 32K tokens |
| Output dimensions | 32 đến 7,168 (Matryoshka learning — flexible) |
| Ngôn ngữ | 100+ ngôn ngữ + programming languages |
| License | Apache 2.0 |

**Mục đích:** Tạo vector embeddings cho RAG pipeline — convert documents (tài liệu kỹ thuật Oracle, Ubuntu manuals, test specs) thành vectors lưu vào Qdrant. Khi user query, model tạo embedding của query để semantic search trong Qdrant, trước khi đưa context vào LLM.

**Lý do chọn:**
- #1 MTEB Multilingual leaderboard — phù hợp với nội dung tiếng Việt + tiếng Anh
- Apache 2.0, cùng ecosystem với Qwen3.6 đang dùng
- 8B size nhỏ, không chiếm nhiều VRAM — có thể chạy song song với inference model trên A100 40GB
- Hỗ trợ cả tiếng Việt, tiếng Anh, SQL, code

---

## 9. Hướng dẫn Pull & Export

### Bước 1 — Pull tất cả images (trên bastion node có internet)

```bash
# === NestJS Runtime ===
docker pull node:20-alpine3.21

# === Infrastructure ===
docker pull mongo:8.0
docker pull redis:7.4-alpine
docker pull qdrant/qdrant:v1.14.0

# === Object Storage ===
docker pull chrislusf/seaweedfs:4.20

# === CUDA Base (chọn theo driver version của KH) ===
docker pull nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04   # recommended
docker pull nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04   # nếu driver >= 560

# === GPU K8s Plugin ===
docker pull nvcr.io/nvidia/k8s-device-plugin:v0.17.0       # cần NGC API key

# === LLM Inference ===
docker pull vllm/vllm-openai:v0.8.4
docker pull vllm/vllm-openai:gemma4                        # tag tối ưu cho Gemma 4
docker pull ghcr.io/huggingface/text-generation-inference:3.3.5
docker pull openmmlab/lmdeploy:v0.7.2-cu12
docker pull localai/localai:v2.22.1-cublas-cuda12-core
docker pull nvcr.io/nvidia/tritonserver:25.01-trtllm-python-py3  # cần NGC API key

# === Ops Support ===
docker pull nginx:1.27-alpine
docker pull alpine:3.21
docker pull busybox:1.37
```

### Bước 2 — Export images thành file

```bash
# Export từng image
docker save node:20-alpine3.21 | gzip > node-20-alpine3.21.tar.gz
docker save mongo:8.0 | gzip > mongo-8.0.tar.gz
docker save redis:7.4-alpine | gzip > redis-7.4-alpine.tar.gz
docker save qdrant/qdrant:v1.14.0 | gzip > qdrant-v1.14.0.tar.gz
docker save chrislusf/seaweedfs:4.20 | gzip > seaweedfs-4.20.tar.gz
docker save nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 | gzip > cuda-12.4.1.tar.gz
docker save vllm/vllm-openai:v0.8.4 | gzip > vllm-v0.8.4.tar.gz
docker save ghcr.io/huggingface/text-generation-inference:3.3.5 | gzip > tgi-3.3.5.tar.gz
docker save openmmlab/lmdeploy:v0.7.2-cu12 | gzip > lmdeploy-v0.7.2.tar.gz
docker save nginx:1.27-alpine | gzip > nginx-1.27-alpine.tar.gz
```

### Bước 3 — Import vào private registry của khách hàng

```bash
# Load image từ file
docker load < node-20-alpine3.21.tar.gz

# Re-tag theo registry nội bộ của KH
docker tag node:20-alpine3.21 registry.internal.customer.com/library/node:20-alpine3.21

# Push vào private registry
docker push registry.internal.customer.com/library/node:20-alpine3.21
```

### Bước 4 — Download LLM model weights (trên bastion node)

```bash
pip install huggingface-hub

# Gemma 4 27B (cần accept Google Gemma license trên HuggingFace)
huggingface-cli download google/gemma-4-27b-it \
  --local-dir /models/gemma-4-27b-it

# Qwen3.6-35B-A3B
huggingface-cli download Qwen/Qwen3.6-35B-A3B-Instruct \
  --local-dir /models/qwen3.6-35b

# DeepSeek-R1 32B (AWQ quantized — ~20GB)
huggingface-cli download deepseek-ai/DeepSeek-R1-Distill-Qwen-32B \
  --local-dir /models/deepseek-r1-32b

# Qwen3 Embedding 8B
huggingface-cli download Qwen/Qwen3-Embedding-8B \
  --local-dir /models/qwen3-embedding-8b
```

> Model weights copy vào **shared PVC** (SeaweedFS hoặc NFS) để tất cả inference pods mount được.

---

### Checklist trước khi vào air-gap

- [ ] Có NVIDIA NGC API key để pull `nvcr.io` images (k8s-device-plugin, tritonserver)
- [ ] Đã accept Gemma license trên HuggingFace (`google/gemma-4-27b-it`)
- [ ] Xác nhận driver version trên K8s nodes của KH để chọn đúng CUDA tag
- [ ] Xác nhận private registry endpoint của KH (Harbor, Nexus, ECR private, v.v.)
- [ ] Đủ dung lượng disk: images ~90 GB (compressed), model weights ~64 GB → tổng ~200 GB sau khi unpack
