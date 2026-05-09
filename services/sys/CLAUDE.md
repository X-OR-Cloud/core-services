# CLAUDE.md - SYS Service

## Service Overview

SYS (System Utilities) là service cung cấp **runtime settings** và **centralized audit-log** cho toàn bộ core services. Port 3007 (dev), 3370–3379 (prod).

Multi-mode: API (REST cho UI quản trị + internal endpoints cho service consumer) + Worker (BullMQ `sys-audit-ingest` processor).

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Setting | `src/modules/setting/` | Key-value runtime configuration (cả non-sensitive và sensitive). Migrate từ `aiwm.configuration` ở P5 |
| Audit-log | `src/modules/audit-log/` | Centralized audit trail. Service consumer ghi qua `@hydrabyte/sys-client` lib (BullMQ fire-and-forget) |

> **Trạng thái hiện tại (P0)**: 2 module đang ở dạng skeleton (chỉ có schema). Full implementation sẽ landed ở P1 (setting) và P2 (audit-log).

## Module-Specific Documentation

Khi làm việc với module cụ thể, đọc tài liệu tương ứng:

- **Setting module**: Read [`docs/sys/PROPOSAL.md`](../../docs/sys/PROPOSAL.md) §4
- **Audit-log module**: Read [`docs/sys/PROPOSAL.md`](../../docs/sys/PROPOSAL.md) §5
- **Lib `@hydrabyte/sys-client`**: Read [`docs/sys/PROPOSAL.md`](../../docs/sys/PROPOSAL.md) §6
- **Security (CIDR + APIKey + RateLimit)**: Read [`docs/sys/PROPOSAL.md`](../../docs/sys/PROPOSAL.md) §7
- **Roadmap & feature tracking**: Read [`docs/sys/FEATURE_BACKLOG.md`](../../docs/sys/FEATURE_BACKLOG.md)
- **Implementation phases**: Read [`docs/sys/PLAN_v1.md`](../../docs/sys/PLAN_v1.md)

## Key Architecture Patterns

### Hybrid client access (Phương án C)

Service consumer KHÔNG gọi sys API cho mỗi setting read. Thay vào đó:

```
Non-sensitive setting:  lib đọc thẳng Mongo `core_sys.settings` + cache + pub/sub invalidate
Sensitive setting:      lib gọi HTTP `/settings/internal/secret/:key` + INTERNAL_API_KEY + audit per-read
Audit-log:              lib enqueue BullMQ `sys-audit-ingest` (fire-and-forget) → sys worker batch insert
```

**Sys là sole writer** với `core_sys`. Service consumer chỉ đọc setting trực tiếp Mongo cho non-sensitive.

### 5 Safety Guards (NON-NEGOTIABLE) trong lib

Bất kỳ thay đổi nào ở `libs/sys-client/` PHẢI bảo toàn 5 guards (xem PROPOSAL §6.4):

1. **2 cache store riêng** — `settingCache` (long TTL) vs `secretCache` (short TTL, no stale-while-revalidate)
2. **`getAll()` skip sensitive** — không bao giờ trả secret qua bulk API
3. **Logging hook redact** — `redactValue(key, value)` cho mọi log call
4. **Metrics no-value labels** — Prometheus labels chỉ có `key`/`source`/`trigger`, KHÔNG có value
5. **`getCacheStats()` mask sensitive** — debug output không expose có/không có value

### Internal endpoints — 3 lớp guard

```
Request → CidrAllowlistGuard → InternalApiKeyGuard → RateLimitGuard → Handler
```

CIDR allowlist qua env `SYS_INTERNAL_CIDR_ALLOWLIST` (fail-secure khi trống). Trust proxy phải config đúng.

## Commands

```bash
nx run sys:api    # API mode (REST endpoints, port 3007 dev)
nx run sys:wrk    # Worker mode (BullMQ audit-ingest processor)
nx run sys:build  # Build
nx lint sys       # Lint
```

## Environment Variables

```bash
# Required
MONGODB_URI=mongodb://host:27017
REDIS_HOST=host
REDIS_PORT=6379
REDIS_PASSWORD=<pass>           # If Redis auth enabled

# Internal endpoints security (REQUIRED for /settings/internal/* và /audit-logs/internal/*)
SYS_INTERNAL_CIDR_ALLOWLIST=10.10.0.0/16,127.0.0.1/32,::1/128   # Comma-separated CIDR; empty → refuse all
INTERNAL_API_KEY=<random-32-byte>

# Optional
PORT=3007                        # HTTP server port (api mode)
MODE=api|wrk                     # Run mode (default: api)
NODE_ENV=development|production
```

## Database

| Database | Collection | Schema | Note |
|----------|-----------|--------|------|
| `core_sys` | `settings` | `Setting` (BaseSchema) | P1 — full schema, indexes |
| `core_sys` | `audit_logs` | `AuditLog` (BaseSchema) | P2 — full schema, indexes |

Connection string từ root `.env` (`MONGODB_URI`).

## PM2 Production Deployment

| Instance | Port | Mode |
|----------|------|------|
| `core.sys.api00` | 3370 | API |
| `core.sys.api01` | 3371 | API |
| `core.sys.worker00` | — | Worker (fork mode) |

## Trust Proxy

`main.ts` phải config `app.set('trust proxy', ...)` đúng để `req.ip` reflect client IP thật (không phải IP của Nginx/LB). Sai config → CIDR guard có thể bị bypass qua fake `X-Forwarded-For`.
