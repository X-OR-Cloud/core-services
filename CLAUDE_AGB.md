# CLAUDE_AGB.md — Air-Gap Builder Agent

Hướng dẫn chuyên biệt cho agent đóng gói container images và LLM model weights để triển khai hệ thống `hydra-services` vào môi trường **air-gap Kubernetes với GPU A100 40GB**.

---

## Role & Constraints

**Làm:**
- Pull container images từ public registries
- Build NestJS service images từ monorepo NX
- Export images thành file `.tar.gz`
- Download LLM model weights từ HuggingFace
- Tạo manifest với sha256 + size
- Báo cáo tiến độ và blockers

**Không làm:**
- Sửa source code của bất kỳ service nào
- Commit hay push git
- Deploy lên bất kỳ môi trường nào
- Thay đổi config của services

**Khi gặp lỗi:** dừng lại, báo cụ thể, chờ hỗ trợ. Không retry quá 2 lần cùng một lệnh.

---

## Environment

- OS: Ubuntu 24.04
- Repo root: thư mục hiện tại khi agent được invoke
- Output: `./air-gap-builder/artifacts/`
- Build log: `./air-gap-builder/build.log`

### Tools cần có

```bash
docker info                          # Docker daemon đang chạy
node --version                       # Node.js >= 20
npx nx --version                     # NX available
python3 -m pip show huggingface-hub  # hoặc pip install huggingface-hub
df -h .                              # kiểm tra disk
```

---

## Workflow — 5 Phases

Chạy **tuần tự**. Sau mỗi phase: ghi log, kiểm tra disk còn trống.

```
Phase 0  →  Preflight check
Phase 1  →  Infrastructure images     (~2 GB,  ~10 phút)
Phase 2  →  Build NestJS service images (~1.5 GB, ~30 phút)
Phase 3  →  GPU + LLM framework images (~50 GB, ~2-4 giờ)
Phase 4  →  LLM model weights         (~64 GB, ~3-6 giờ)
Phase 5  →  Manifest + verification
```

---

## Phase 0 — Preflight

Kiểm tra trước khi bắt đầu. Thiếu bất kỳ điều kiện nào → báo và dừng.

```bash
# 1. Docker
docker info || { echo "BLOCKED: Docker not running"; exit 1; }

# 2. Disk — cần >= 300 GB
AVAIL=$(df -BG . | awk 'NR==2{gsub("G",""); print $4}')
[ "$AVAIL" -lt 300 ] && echo "BLOCKED: Only ${AVAIL}GB free, need 300GB" && exit 1

# 3. NX
npx nx --version || { echo "BLOCKED: NX not available, run: npm install"; exit 1; }

# 4. NGC credentials (cảnh báo, không block — chỉ fail khi đến Phase 3)
docker login nvcr.io --get-login 2>/dev/null || echo "WARN: Not logged in to nvcr.io — k8s-device-plugin and tritonserver will fail"

# 5. HuggingFace token (cảnh báo — chỉ fail khi Gemma ở Phase 4)
huggingface-cli whoami 2>/dev/null || echo "WARN: HF not authenticated — Gemma 4 27B will fail"

# 6. Tạo output dirs
mkdir -p ./air-gap-builder/artifacts/images/{infra,services,gpu}
mkdir -p ./air-gap-builder/artifacts/models
```

---

## Phase 1 — Infrastructure Images

Output: `./air-gap-builder/artifacts/images/infra/`

```bash
OUT="./air-gap-builder/artifacts/images/infra"

pull_and_save() {
  local img="$1"
  local filename=$(echo "$img" | tr '/: ' '---').tar.gz
  echo "[$(date '+%F %T')] Pulling $img" | tee -a ./air-gap-builder/build.log
  docker pull "$img" || { echo "FAILED: docker pull $img"; exit 1; }
  echo "[$(date '+%F %T')] Saving → $filename" | tee -a ./air-gap-builder/build.log
  docker save "$img" | gzip > "$OUT/$filename"
  echo "[$(date '+%F %T')] Done: $(du -sh $OUT/$filename | cut -f1)" | tee -a ./air-gap-builder/build.log
}

pull_and_save "node:20-alpine3.21"
pull_and_save "mongo:8.0"
pull_and_save "redis:7.4-alpine"
pull_and_save "qdrant/qdrant:v1.14.0"
pull_and_save "chrislusf/seaweedfs:4.20"
pull_and_save "nginx:1.27-alpine"
pull_and_save "alpine:3.21"
pull_and_save "busybox:1.37"
```

---

## Phase 2 — Build NestJS Service Images

### Tổng quan repo

```
hydra-services/              ← repo root (cũng là Docker build context)
├── services/
│   ├── template/            ← reference service
│   ├── iam/                 ← Identity & Access Management
│   ├── noti/                ← Notifications + WebSocket
│   ├── aiwm/                ← AI Workload Manager (8 modes)
│   ├── cbm/                 ← Core Business Management
│   ├── mona/                ← Monitoring & Analytics
│   ├── aivp/                ← AI Video Processing
│   ├── pag/                 ← Personal Agent Gateway
│   ├── schd/                ← Scheduler
│   └── vbx/                 ← Video Box
├── libs/
│   ├── base/                ← @core/base (BaseSchema, BaseService, guards)
│   └── shared/              ← @core/shared (constants, enums, logger)
└── dist/services/<name>/    ← webpack build output (main.js + package.json)
```

### Build system

Tất cả services dùng **webpack via NX**. Build output về `dist/services/<service>/` tại repo root.

```bash
# Build từng service
nx run <service>:build

# Kết quả:
# dist/services/<service>/main.js       ← bundled app
# dist/services/<service>/package.json  ← production deps (nếu generatePackageJson: true)
```

**Quan trọng:** Docker build context phải là **repo root**, không phải thư mục service, vì Dockerfile reference đến `dist/services/<service>/`.

### Service modes (entrypoints)

| Service | Modes / Entrypoints | Notes |
|---------|-------------------|-------|
| template | api, wrk | - |
| iam | api | - |
| noti | serve | - |
| aiwm | api, mcp, wrk, agt, con, aws, nws, cws | 8 modes — 1 image, dùng MODE env var |
| cbm | api, emb, rtc | - |
| mona | api | - |
| aivp | api | - |
| pag | api, wrk | dist có: main.js, api.main.js, worker.main.js |
| schd | api, wrk | - |
| vbx | api | - |

### License — bắt buộc set trước khi build

Services có LicenseGuard (`aiwm`, `iam`, `cbm`, `mona`) cần `LICENSE_SECRET` baked vào binary lúc `nx build`. **Không set = license mặc định permanent (không có expiry check).**

```bash
# Bước 0a: Lấy secret của customer từ customers.json
node licenses/gen-license.js <customer-slug> <YYYY-MM-DD>
# Output gồm:
#   LICENSE_SECRET=<hex>          ← dùng cho bước build
#   Nội dung file .license        ← deploy vào cwd của service khi chạy

# Bước 0b: Export trước khi build (bắt buộc dùng --skip-nx-cache)
export LICENSE_SECRET=<hex-từ-bước-trên>
```

> **Lưu ý:** NX cache lưu kết quả build theo input hash. Nếu `LICENSE_SECRET` thay đổi mà không dùng `--skip-nx-cache`, NX sẽ dùng lại binary cũ — secret sẽ KHÔNG được cập nhật.

### Quy trình build mỗi service

```bash
SERVICE="iam"   # thay bằng service cần build

# Bước 1: NX build (với LICENSE_SECRET nếu service có LicenseGuard)
echo "[$(date '+%F %T')] Building $SERVICE" | tee -a ./air-gap-builder/build.log
nx run $SERVICE:build --skip-nx-cache
[ $? -ne 0 ] && echo "FAILED: nx build $SERVICE" && exit 1

# Bước 2: Kiểm tra output
ls dist/services/$SERVICE/
# Phải có main.js. Nếu không có → báo lỗi

# Bước 3: Cài native deps vào dist/ (chạy trên máy build — có internet)
# Webpack bundled tất cả JS deps. Bước này chỉ cài native addons (bcrypt.node, v.v.)
# node_modules sẽ được COPY vào Docker image → không cần npm ci trong Dockerfile.
(cd dist/services/$SERVICE && npm install --ignore-scripts --production --no-audit --no-fund --quiet) \
  || echo "WARN: npm install in dist/$SERVICE failed (có thể không có native deps)"

# Bước 4: Docker build (context = repo root)
docker build \
  -f services/$SERVICE/Dockerfile \
  -t hydra/$SERVICE:latest \
  .

# Bước 5: Export
docker save hydra/$SERVICE:latest | gzip \
  > ./air-gap-builder/artifacts/images/services/$SERVICE.tar.gz
```

### Dockerfile template

Tất cả services đã có Dockerfile sẵn. Template tham khảo nếu cần tạo mới:

```dockerfile
FROM node:20-alpine3.21

RUN apk add --no-cache curl ca-certificates

RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

WORKDIR /app
RUN chown appuser:appuser /app

USER appuser

# node_modules (native addons) đã được npm install vào dist/ bởi Phase 2 build script
# Không cần npm ci trong Docker → image build hoàn toàn offline
COPY --chown=appuser:appuser dist/services/<SERVICE_NAME>/ .

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-<PORT>}/health || exit 1

CMD ["node", "main.js"]
```

**Entrypoint pattern cho multi-mode (single main.js đọc MODE):**
```dockerfile
COPY --chown=appuser:appuser services/<service>/docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
```
```sh
#!/bin/sh
exec node main.js "${MODE:-api}"
```

**Entrypoint pattern cho multi-entry (pag, vbx — có api.main.js + worker.main.js):**
```sh
#!/bin/sh
case "${MODE:-api}" in
  wrk) exec node worker.main.js ;;
  *)   exec node api.main.js ;;
esac
```

### Chạy tất cả services

```bash
SERVICES="template iam noti aiwm cbm mona aivp pag schd vbx"
OUT="./air-gap-builder/artifacts/images/services"

# Services có LicenseGuard — phải export LICENSE_SECRET trước
LICENSE_SERVICES="aiwm iam cbm mona"

for SERVICE in $SERVICES; do
  echo "[$(date '+%F %T')] === $SERVICE ===" | tee -a ./air-gap-builder/build.log

  # Kiểm tra LICENSE_SECRET nếu service cần
  if echo "$LICENSE_SERVICES" | grep -qw "$SERVICE" && [ -z "$LICENSE_SECRET" ]; then
    echo "BLOCKED: $SERVICE requires LICENSE_SECRET. Run: export LICENSE_SECRET=<hex>"
    exit 1
  fi

  nx run $SERVICE:build --skip-nx-cache

  if [ ! -f "dist/services/$SERVICE/main.js" ] && [ ! -f "dist/services/$SERVICE/api.main.js" ]; then
    echo "WARN: dist/services/$SERVICE/ — no entry file found"
    ls dist/services/$SERVICE/ 2>/dev/null
  fi

  # Cài native deps vào dist/ để Docker build không cần internet
  (cd dist/services/$SERVICE && npm install --ignore-scripts --production --no-audit --no-fund --quiet 2>/dev/null) || true

  docker build -f services/$SERVICE/Dockerfile -t hydra/$SERVICE:latest . \
    || { echo "FAILED: docker build $SERVICE"; continue; }

  docker save hydra/$SERVICE:latest | gzip > "$OUT/$SERVICE.tar.gz"
  echo "[$(date '+%F %T')] $SERVICE → $(du -sh $OUT/$SERVICE.tar.gz | cut -f1)" \
    | tee -a ./air-gap-builder/build.log
done
```

---

## Phase 3 — GPU & LLM Framework Images

Output: `./air-gap-builder/artifacts/images/gpu/`

**Lưu ý:** `nvcr.io` images yêu cầu `docker login nvcr.io` với NGC API key. Nếu chưa đăng nhập → báo và yêu cầu hỗ trợ.

```bash
OUT="./air-gap-builder/artifacts/images/gpu"

# CUDA base images
docker pull nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04
docker save nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 | gzip > "$OUT/cuda-12.4.1-cudnn-ubuntu22.04.tar.gz"

docker pull nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04
docker save nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04 | gzip > "$OUT/cuda-12.6.3-cudnn-ubuntu22.04.tar.gz"

# LLM Inference — vLLM (primary)
docker pull vllm/vllm-openai:v0.8.4
docker save vllm/vllm-openai:v0.8.4 | gzip > "$OUT/vllm-v0.8.4.tar.gz"

docker pull vllm/vllm-openai:gemma4
docker save vllm/vllm-openai:gemma4 | gzip > "$OUT/vllm-gemma4.tar.gz"

# TGI (fallback)
docker pull ghcr.io/huggingface/text-generation-inference:3.3.5
docker save ghcr.io/huggingface/text-generation-inference:3.3.5 | gzip > "$OUT/tgi-3.3.5.tar.gz"

# LMDeploy (fallback, tối ưu A100)
docker pull openmmlab/lmdeploy:v0.7.2-cu12
docker save openmmlab/lmdeploy:v0.7.2-cu12 | gzip > "$OUT/lmdeploy-v0.7.2-cu12.tar.gz"

# LocalAI (lightweight)
docker pull localai/localai:v2.22.1-cublas-cuda12-core
docker save localai/localai:v2.22.1-cublas-cuda12-core | gzip > "$OUT/localai-v2.22.1-cuda12.tar.gz"

# NGC images — cần docker login nvcr.io
docker pull nvcr.io/nvidia/k8s-device-plugin:v0.17.0
docker save nvcr.io/nvidia/k8s-device-plugin:v0.17.0 | gzip > "$OUT/nvidia-k8s-device-plugin-v0.17.0.tar.gz"

docker pull nvcr.io/nvidia/tritonserver:25.01-trtllm-python-py3
docker save nvcr.io/nvidia/tritonserver:25.01-trtllm-python-py3 | gzip > "$OUT/tritonserver-25.01-trtllm.tar.gz"
```

---

## Phase 4 — LLM Model Weights

Output: `./air-gap-builder/artifacts/models/`

```bash
pip install huggingface-hub
OUT="./air-gap-builder/artifacts/models"

# Qwen3.6-35B-A3B — Apache 2.0, no license gate
huggingface-cli download Qwen/Qwen3.6-35B-A3B-Instruct \
  --local-dir "$OUT/qwen3.6-35b-a3b"

# Qwen3-Embedding-8B — Apache 2.0
huggingface-cli download Qwen/Qwen3-Embedding-8B \
  --local-dir "$OUT/qwen3-embedding-8b"

# DeepSeek-R1 32B Distill — MIT
huggingface-cli download deepseek-ai/DeepSeek-R1-Distill-Qwen-32B \
  --local-dir "$OUT/deepseek-r1-distill-qwen-32b"

# Gemma 4 27B — cần HF_TOKEN + đã accept license
# Nếu chưa accept: https://huggingface.co/google/gemma-4-27b-it
huggingface-cli whoami || { echo "BLOCKED: huggingface-cli login first"; exit 1; }
huggingface-cli download google/gemma-4-27b-it \
  --local-dir "$OUT/gemma-4-27b-it"
```

**VRAM khi inference (A100 40GB):**
- Gemma 4 27B: ~16 GB BF16 (MoE — không cần quantize)
- Qwen3.6-35B: ~15 GB BF16 (MoE — không cần quantize)
- DeepSeek-R1 32B: ~32 GB BF16 hoặc ~20 GB AWQ INT4 (Dense — cần quyết định trước khi deploy)
- Qwen3-Embedding-8B: ~8 GB BF16

---

## Phase 5 — Manifest & Verification

Tạo `./air-gap-builder/artifacts/manifest.json`:

```bash
#!/bin/bash
OUT="./air-gap-builder/artifacts"
MANIFEST="$OUT/manifest.json"

echo "Generating manifest..."
python3 - <<'EOF'
import json, hashlib, os
from pathlib import Path
from datetime import datetime

OUT = Path("./air-gap-builder/artifacts")
result = {
    "generated": datetime.utcnow().isoformat() + "Z",
    "images": {},
    "models": {}
}

# Images
for f in sorted(OUT.rglob("*.tar.gz")):
    sha = hashlib.sha256(f.read_bytes()).hexdigest()
    size_mb = round(f.stat().st_size / 1024 / 1024, 1)
    key = str(f.relative_to(OUT))
    result["images"][key] = {"sha256": sha, "size_mb": size_mb}

# Models (list dirs, tổng size)
models_dir = OUT / "models"
if models_dir.exists():
    for d in sorted(models_dir.iterdir()):
        if d.is_dir():
            total = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
            result["models"][d.name] = {"size_gb": round(total / 1024**3, 2)}

(OUT / "manifest.json").write_text(json.dumps(result, indent=2))
print("manifest.json created")
print(f"Total images: {len(result['images'])}")
print(f"Total models: {len(result['models'])}")
EOF
```

---

## Progress Logging

Ghi tất cả vào `./air-gap-builder/build.log`. Format chuẩn:

```
[2026-04-27 10:00:00] Phase 0 — Preflight: PASS (disk: 450GB free)
[2026-04-27 10:00:10] Phase 1 — Pulling node:20-alpine3.21
[2026-04-27 10:01:05] Phase 1 — Saved: infra/node-20-alpine3.21.tar.gz (38MB)
[2026-04-27 10:15:00] Phase 1 — COMPLETE (8 images, 1.8GB total)
[2026-04-27 10:15:01] Phase 2 — Building iam
...
```

---

## Error Handling & Báo cáo

Khi gặp lỗi, **dừng ngay** và báo theo format:

```
🚧 Air-Gap Builder — Blocked

Phase:   <tên phase + service/image đang xử lý>
Lỗi:     <error message nguyên văn>
Nguyên nhân: <phân tích ngắn gọn>
Cần:     <hành động cụ thể để unblock>
```

**Các lỗi phổ biến:**

| Lỗi | Nguyên nhân | Cần làm |
|-----|------------|---------|
| `unauthorized` khi pull nvcr.io | Chưa login NGC | `docker login nvcr.io` với NGC API key |
| `403` khi download Gemma | Chưa accept license | Vào https://huggingface.co/google/gemma-4-27b-it accept |
| `no space left on device` | Hết disk | Báo cần thêm dung lượng |
| `nx: command not found` | Node deps thiếu | `npm install` từ repo root |
| `Cannot find module` sau NX build | Build lỗi | Báo service + full error log |
| `docker build` fail | Dockerfile sai hoặc dist thiếu | Kiểm tra `dist/services/<service>/`, báo output |

---

## Checklist cuối

Sau khi hoàn thành tất cả 5 phases, verify:

```bash
# Đếm images
ls air-gap-builder/artifacts/images/infra/*.tar.gz | wc -l    # nên = 8
ls air-gap-builder/artifacts/images/services/*.tar.gz | wc -l # nên = 12
ls air-gap-builder/artifacts/images/gpu/*.tar.gz | wc -l      # nên = 9

# Kiểm tra models
ls air-gap-builder/artifacts/models/

# Tổng kích thước
du -sh air-gap-builder/artifacts/

# Manifest tồn tại
cat air-gap-builder/artifacts/manifest.json | python3 -m json.tool > /dev/null && echo "manifest OK"
```

Báo cáo tổng kết qua Discord khi hoàn thành:

```
✅ Air-Gap Builder — Complete

Images:   <N> files, <X> GB
Models:   <N> models, <Y> GB  
Total:    <Z> GB
Log:      air-gap-builder/build.log
Manifest: air-gap-builder/artifacts/manifest.json

Ready to transfer to air-gap environment.
```
