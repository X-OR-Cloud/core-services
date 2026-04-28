# Air-Gap Builder

Thư mục làm việc của agent đóng gói container images và LLM model weights để triển khai vào môi trường air-gap Kubernetes.

## Cấu trúc

```
air-gap-builder/
├── CLAUDE.md               ← hướng dẫn cho agent khi ở trong thư mục này
├── README.md               ← file này
└── artifacts/              ← OUTPUT — gitignored, không commit
    ├── images/
    │   ├── infra/          ← infrastructure images (.tar.gz)
    │   ├── services/       ← NestJS service images (.tar.gz)
    │   └── gpu/            ← CUDA + LLM framework images (.tar.gz)
    ├── models/             ← LLM model weights (HuggingFace format)
    └── manifest.json       ← sha256 + size của từng artifact
```

## Sử dụng

Agent được invoke từ **repo root** với file hướng dẫn `CLAUDE_AGB.md`:

```bash
cd /opt/hydra-services
claude --config CLAUDE_AGB.md
```

Xem [CLAUDE_AGB.md](../CLAUDE_AGB.md) để biết đầy đủ workflow 5 phases.

## Yêu cầu trước khi chạy

- [ ] Docker đang chạy
- [ ] Disk ≥ 300 GB free tại `/opt` hoặc nơi lưu artifacts
- [ ] NVIDIA NGC API key (`docker login nvcr.io`)
- [ ] HuggingFace token đã accept Gemma license (`huggingface-cli login`)
- [ ] Node.js ≥ 20 + npm (để chạy NX build)

## Kích thước dự kiến

| Nhóm | Compressed |
|------|-----------|
| Infrastructure images | ~2 GB |
| NestJS service images | ~1.5 GB |
| GPU + LLM framework images | ~50 GB |
| LLM model weights | ~64 GB |
| **Tổng** | **~120 GB** |
