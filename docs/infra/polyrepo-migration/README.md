# Polyrepo Migration Plan

Chuyển đổi từ monorepo sang polyrepo để các agent có thể maintain độc lập từng service mà không gây version conflict hay code desync.

## Motivation

- Nhiều agent maintain song song → conflict trên `package.json` version
- Agent làm việc trên stale code không biết service khác đã thay đổi `libs/`
- `libs/base`, `libs/shared`, `libs/sys-client` đã stable (~1–2 commit/tháng, toàn additive)

## Repo Map

| Repo mới | Nội dung | Package published |
|---|---|---|
| `core-libs` | `libs/base` + `libs/shared` + `libs/sys-client` | `@x-or-cloud/base`, `@x-or-cloud/shared`, `@x-or-cloud/sys-client` |
| `core-sys` | `services/sys/` | — |
| `core-noti` | `services/noti/` | — |
| `core-schd` | `services/schd/` | — |
| `core-mona` | `services/mona/` | — |
| `core-iam` | `services/iam/` | — |
| `core-cbm` | `services/cbm/` | — |
| `core-aiwm` | `services/aiwm/` | — |

> **Package scope:** `@x-or-cloud/*` — match GitHub org `X-OR-Cloud`. Toàn bộ `@hydrabyte/` import trong service code đã được replace khi migrate.

## Registry

**GitHub Packages** — `https://npm.pkg.github.com`

- Private, free với GitHub org
- Auth qua PAT hoặc `GITHUB_TOKEN`
- Mọi consumer repo cần `.npmrc` với auth token

## Phases

| Phase | Mô tả | Docs |
|---|---|---|
| **1** | Setup `core-libs` repo + publish lần đầu | [phase-1-lib-repo.md](./phase-1-lib-repo.md) |
| **2** | Pilot migrate 1 service (`core-sys`) | [phase-2-service-migration.md](./phase-2-service-migration.md) |
| **3** | Migrate 6 service còn lại | [phase-2-service-migration.md](./phase-2-service-migration.md) |
| **4** | Cleanup: server, pm2, archive monorepo | [phase-4-cleanup.md](./phase-4-cleanup.md) |

## Status

| Item | Status |
|---|---|
| Quyết định kiến trúc | ✅ Done |
| GitHub PAT setup (fine-grained + classic) | ✅ Done |
| `core-libs` repo | ✅ Done |
| Publish `@x-or-cloud/base@1.0.1` | ✅ Done |
| Publish `@x-or-cloud/shared@1.0.1` | ✅ Done |
| Publish `@x-or-cloud/sys-client@1.0.1` | ✅ Done |
| Pilot: `core-sys` | ✅ Done |
| `core-noti` | ✅ Done |
| `core-schd` | ✅ Done |
| `core-mona` | ✅ Done |
| `core-iam` | ✅ Done |
| `core-cbm` | ✅ Done |
| `core-aiwm` | ✅ Done |
| Cleanup monorepo | ⬜ Pending |
