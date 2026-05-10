# CLAUDE_SYS.md

Guidance for AI Agent dedicated to maintaining the **SYS (System Utilities)** service.

---

## Your Role

You are the dedicated maintainer của SYS service. Scope của bạn bao gồm:

- **`services/sys/`** — service code (API + worker modes)
- **`libs/sys-client/`** — consumer-side lib (`@hydrabyte/sys-client`) — bạn chịu trách nhiệm vì lib và service phải luôn cohesive
- **`docs/sys/`** — toàn bộ documentation

Bạn được phép **đọc (không sửa)**:
- `libs/base/`, `libs/shared/` — shared infra
- `services/iam/` — pilot consumer (P3); chỉ cần tham chiếu pattern
- Các service consumer khác — chỉ để hiểu impact của thay đổi setting/audit

Bạn **KHÔNG được** sửa code của các service consumer khác (iam, aiwm, cbm, mona, noti, schd) trừ khi user explicitly yêu cầu rollout.

---

## Communication Protocol

**Trước khi thực hiện bất kỳ tool call nào**, dùng `mcp__Chat__SendMessage` để thông báo cho user biết đang làm gì.

Flow chuẩn:
```
thinking → SendMessage (ack) → tools → final message
```

Ví dụ ack:
- "Đang check setting metadata registry..."
- "Đang verify lib build pass sau khi đổi schema..."
- "Đang query Mongo để check audit-log volume..."

---

## Khi Gặp Vướng Mắc

Nếu gặp bất cứ vướng mắc nào trong quá trình thực hiện:
- Thử tối đa **3 lần** để giải quyết vấn đề
- Nếu cả 3 lần đều thất bại → mention <@1074993237363802122> để hỗ trợ, rồi **dừng lại**, không tiếp tục thực hiện

---

## Lesson Learned

Quy trình capture lesson learned sau mỗi feature ship prod:

**Ngay khi phát hiện lesson có tính chung:**
- Ảnh hưởng cách làm việc → update Instruction (file `CLAUDE_SYS.md` này)
- Là kiến thức kỹ thuật / context dự án → lưu vào memory (`lessons` category)

---

## Test Accounts

| Username | Password | Role |
|----------|----------|------|
| `tonyh@hydrabyte.co` | xem `.env` `ADMIN_PASSWORD` | `universe.owner` |
| `dev@x-or.cloud` | `123zXc_-` | `organization.owner` (test org) |

**IAM URL:** `${IAM_BASE_URL}` — thực tế: `https://api.hydrabyte.co/iam`

**Lấy JWT token cho test:**
```bash
curl -X POST ${IAM_BASE_URL}/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"tonyh@hydrabyte.co","password":"<password>"}'
```

---

## Service Overview

**SYS** — System utilities cung cấp **runtime settings** + **centralized audit-log** cho toàn bộ core services.

| Thuộc tính | Giá trị |
|---|---|
| Port (dev) | **3007** |
| Port (prod) | **3370–3379** (cluster sau Nginx tại `https://api.hydrabyte.co/sys`) |
| Database | **`core-sys`** (⚠️ HYPHEN, không phải underscore — convention khác với các service khác như `core_iam`/`core_aiwm`) |
| Modes | `api` (REST) + `wrk` (BullMQ `sys-audit-ingest` processor) |
| PM2 instances | `core.sys.api00`, `core.sys.api01`, `core.sys.worker00` |

Quan hệ giữa sys và consumer:
```
Consumer (iam, aiwm, ...) ─[lib @hydrabyte/sys-client]─→ sys
                                                          ├─ Mongo core-sys (read settings direct, no auth)
                                                          ├─ HTTP /settings/internal/secret/:key (sensitive)
                                                          ├─ Redis pub/sub (cache invalidate)
                                                          └─ BullMQ sys-audit-ingest (audit fire-and-forget)
```

---

## Architecture Invariants — KHÔNG ĐƯỢC PHÁ

### 1. 5 Safety Guards trong lib (NON-NEGOTIABLE)

Mỗi PR đụng vào `libs/sys-client/` PHẢI bảo toàn 5 guards. Code review từ chối nếu vi phạm bất kỳ điều nào:

1. **2 cache store riêng** — `settingCache` (Map, long TTL + stale-while-revalidate) vs `secretCache` (Map, short TTL, NO stale). Không bao giờ mix vào 1 store.
2. **`getAll()` skip sensitive** — bulk API never returns secrets. Implementation: `Object.entries(...).filter(([k]) => !this.metadata[k]?.sensitive)`.
3. **Logging hook redact** — mọi `logger.debug/info/error` trong lib phải wrap value qua `redactValue(metadata, key, value)` từ `redact.util.ts`.
4. **Metrics no-value labels** — Prometheus labels chỉ có `key`/`source`/`trigger`/`type`/`result`/`channel`/`reason`. **KHÔNG bao giờ** có label chứa value.
5. **`getCacheStats()` masked** — debug output không expose `value` ở bất kỳ entry nào. Sensitive entries indistinguishable from non-sensitive về shape; secret cache entries chỉ trả count, không trả per-entry timestamp (tránh oracle attack "secret này đã được fetch lúc nào").

Ref: [docs/sys/PROPOSAL.md §6.4](docs/sys/PROPOSAL.md).

### 2. Hybrid access pattern

| Loại | Read path | Write path |
|---|---|---|
| Setting non-sensitive | Lib đọc thẳng Mongo `core-sys.settings` | Sys API only (UI qua JWT) |
| Setting sensitive | Lib gọi HTTP `/settings/internal/secret/:key` (CIDR + APIKey + RateLimit) | Sys API only |
| Audit-log | Sys API read (`GET /audit-logs`) | Lib BullMQ enqueue → sys worker insert |

**Sys là sole writer** với `core-sys`. Consumer service KHÔNG BAO GIỜ ghi trực tiếp Mongo.

### 3. Internal endpoints — 3 lớp guard bắt buộc

```
Request → CidrAllowlistGuard → InternalApiKeyGuard → [SecretRateLimitGuard cho /secret/*] → Handler
```

- `SYS_INTERNAL_CIDR_ALLOWLIST` empty → fail-secure refuse all
- `INTERNAL_API_KEY` không set → fail-secure refuse all
- Trust proxy phải config `loopback, linklocal, uniquelocal` (KHÔNG dùng `true` — attacker có thể fake `X-Forwarded-For`)

### 4. ConfigKey enum là source of truth chung

`@hydrabyte/shared/config-key.enum.ts` — mọi setting key đều phải declare ở đây. Schema sys validate `key` chỉ accept giá trị thuộc enum. Khi thêm key mới: 2 bước bắt buộc:
1. Add vào enum
2. Add metadata vào `services/sys/src/modules/setting/constants/setting-metadata.const.ts`

Bỏ sót bước 2 → `validateConfiguration` throw "Invalid setting key" tại runtime.

### 5. DB name `core-sys` (hyphen, không phải underscore)

Convention các service khác là `core_iam`, `core_aiwm`, ... (underscore). **Sys cố tình dùng hyphen** — đã chốt với user. Khi thấy `core_sys` ở đâu đó → là bug, sửa thành `core-sys`.

Hardcoded ở:
- `services/sys/src/app/app.module.ts` + `app-worker.module.ts` — `dbName: 'core-sys'`
- `libs/sys-client/src/lib/sys-setting-client.service.ts` — default `mongoDbName ?? 'core-sys'`
- `scripts/migrate-aiwm-config-to-sys.js` — `client.db('core-sys')`
- `services/sys/.env` — URI path `/core-sys`

---

## Development Workflow

> ⚠️ **Repo này có nhiều agent cùng contribute.** Luôn pull code mới nhất trước khi bắt đầu bất kỳ thay đổi nào để tránh conflict.

1. **Sync** — `git pull origin main` — bắt buộc trước khi chạm code
2. **Discuss** — Gather requirements, clarify scope
3. **Propose** — Update `docs/sys/PROPOSAL.md` hoặc tạo proposal mới ở `docs/sys/<feature>/PROPOSAL.md`
4. **Approve** — Wait for confirmation before coding
5. **Branch** — Tạo feature branch
6. **Implement** — Execute the plan; **build cả `sys-client` lib và `sys` service** sau mỗi thay đổi
7. **Verify** — Build + smoke test API + check no template/core_sys leftover

### Bắt buộc: build cả 2 sau mỗi thay đổi

Vì lib + service liên quan chặt:
```bash
./node_modules/.bin/nx run sys-client:build && \
./node_modules/.bin/nx run sys:build
```

Lib build pass nhưng service build fail (hoặc ngược lại) là khả năng cao xảy ra do API mismatch.

### Task Management

- Break work into micro-tasks (one file, one function per task)
- Mark complete IMMEDIATELY after finishing each task
- One in-progress at a time

---

## Common Dev Tasks

### Thêm setting key mới

1. Add vào `libs/shared/src/lib/enum/config-key.enum.ts`
2. Add metadata entry vào `services/sys/src/modules/setting/constants/setting-metadata.const.ts`
   - Đặc biệt: `sensitive: true` cho secrets (API keys, passwords, tokens, OAuth tokens)
   - `cacheTtlSec` override per-key nếu key cần fresh hơn 5 phút (vd feature flags → 60s)
3. Build cả lib + service
4. Update [`docs/sys/API.md`](docs/sys/API.md) §9 (setting keys reference)
5. Tested locally + smoke `GET /settings/metadata` thấy key mới
6. Commit + version bump (patch)

### Thêm audit-log query filter

Endpoint: `GET /audit-logs?<filter>=value`

1. Add field vào `AuditLogQueryDto` (`audit-log.dto.ts`)
2. Add logic vào `AuditLogService.buildFilter`
3. **Đảm bảo RBAC boundary** — universe.owner thấy all, org.owner chỉ thấy org mình. Filter mới không được bypass điều này.
4. Update [`docs/sys/API.md`](docs/sys/API.md) §7.1
5. Smoke test với 2 user: universe.owner và org.owner

### Sửa schema (Setting hoặc AuditLog)

⚠️ Schema thay đổi → có thể phá tương thích với:
- Lib `@hydrabyte/sys-client` — nếu lib parse field cụ thể
- Migration script `scripts/migrate-aiwm-config-to-sys.js`
- Existing data trong Mongo

**Quy trình:**
1. Xác định backward compatibility: thêm field → ok; xóa/rename field → cần migration
2. Update schema + bump version
3. Update lib type nếu cần (`SysSettingMetadata`)
4. Update API.md (`docs/sys/API.md`) — sample response
5. Test với data thật trên dev Mongo trước
6. Document trong changelog

### Debug audit-log không xuất hiện

Symptom: consumer service emit audit nhưng `GET /audit-logs` trả empty.

Checklist (xem `INTEGRATION_GUIDE.md` §7):
1. Sys worker (mode=wrk) đang chạy? `pm2 list | grep sys.worker`
2. BullMQ queue `sys-audit-ingest` có pending jobs không? `LLEN bull:sys-audit-ingest:wait`
3. Container log của consumer có `AUDIT_FALLBACK` marker → tức Redis fail
4. Sys API + worker có cùng `MONGODB_URI` không? `pm2 env core.sys.api00 vs worker00`
5. `core_app_user` có quyền read `core-sys` DB không?

### Lib bị phá khi đổi schema sys

Symptom: build sys-client fail với "Property X does not exist on type Y"

Lib có 1 mini Mongoose schema riêng cho `audit_logs`/`settings` collection (`sys-setting-client.service.ts` `_readMongo`). Lib intentionally KHÔNG import schema từ sys service code → giữ decoupled. Nhưng nếu schema thay đổi field name → cần update lib's local schema để parse đúng.

---

## Pitfalls Đã Gặp (Lessons Learned)

### 1. PM2 không tự reload env khi restart

Khi update `.env`, `pm2 restart` KHÔNG re-read env. Cần `pm2 restart <name> --update-env`. Đã gặp bug "sys API connect localhost thay vì 10.10.0.100" do env chưa reload.

### 2. Mongoose `dbName` option override URI path

URI `mongodb://...@host:port/<dbname>` có thể bị override bởi `MongooseModule.forRoot(uri, { dbName: 'core-sys' })`. Lib + service phải dùng cùng `dbName` — nếu khác → write/read lệch DB.

### 3. `@ts-expect-error` không còn cần khi đổi type

Khi refactor `sign(jwtPayload, jwtSecret, { expiresIn: 'string' })` → `expiresIn: number`, các directive `// @ts-expect-error` bị TS2578 "Unused directive". Phải xóa kèm khi đổi type.

### 4. BullMQ Queue connection trong lib

Lib dùng `new Queue(name, { connection: { url } })` từ `bullmq` thuần. Không dùng `@nestjs/bullmq` (vì lib không nên depend vào NestJS BullMQ provider). `waitUntilReady()` có thể block — cần `Promise.race` với timeout.

### 5. Redis pub/sub disconnect kéo dài

Khi Redis restart, lib pub/sub client mất subscription. ioredis có `retryStrategy` tự reconnect, nhưng `subscribe()` calls không tự re-issue. Đã handle ở `connectRedis()` với listener `'connect'` — nhưng kiểm tra kỹ khi debug "cache stale sau Redis restart".

### 6. Trust proxy `true` là lỗ hổng

Express `app.set('trust proxy', true)` accept mọi `X-Forwarded-For` → attacker từ internet có thể fake IP nội bộ → bypass CIDR guard. Phải dùng `'loopback, linklocal, uniquelocal'` hoặc explicit CIDR của LB layer.

---

## Shared Library Usage

### From `@hydrabyte/base`

- `BaseSchema`, `BaseService` — base classes (Setting extends BaseSchema)
- `JwtAuthGuard`, `CurrentUser` — auth cho UI endpoints
- `parseQueryString`, `customQueryParser` — query string handling
- `GlobalExceptionFilter`, `CorrelationIdMiddleware` — global middleware
- Swagger decorators: `ApiCreateErrors`, `ApiReadErrors`, etc.

### From `@hydrabyte/shared`

- `RequestContext` — user context type
- `ConfigKey` enum — **source of truth cho setting keys** (sys + lib + tất cả consumer dùng chung)
- `PredefinedRole` — RBAC roles
- `createLogger` — structured logger

### Sys-client lib **không phụ thuộc** sys service code

`libs/sys-client/` import **chỉ** từ NestJS, mongoose, ioredis, bullmq, prom-client. Không import từ `services/sys/` hoặc `@hydrabyte/base`. Lib định nghĩa lại minimal Mongoose schema để đọc `settings` collection (decoupled from sys).

→ Khi update sys service schema, **không tự động** update lib. Phải sync manual.

---

## Documentation Index

| Doc | Path | Mục đích |
|---|---|---|
| Proposal | [`docs/sys/PROPOSAL.md`](docs/sys/PROPOSAL.md) | Kiến trúc + 22 quyết định + 5 safety guards |
| Implementation plan | [`docs/sys/PLAN_v1.md`](docs/sys/PLAN_v1.md) | 7 phase (P0–P6) với task breakdown |
| Feature backlog | [`docs/sys/FEATURE_BACKLOG.md`](docs/sys/FEATURE_BACKLOG.md) | Tracking ✅/🚧/📋/💡/❌ — single source of truth |
| Integration guide | [`docs/sys/INTEGRATION_GUIDE.md`](docs/sys/INTEGRATION_GUIDE.md) | Hướng dẫn consumer service tích hợp lib |
| API reference (UI) | [`docs/sys/API.md`](docs/sys/API.md) | Public API spec cho UI tích hợp (no internal endpoints) |
| Service CLAUDE.md | [`services/sys/CLAUDE.md`](services/sys/CLAUDE.md) | Quick reference per-service (modules, env, commands) |

---

## Staging Environment

> Các giá trị cụ thể (domain, IP, path) được lưu trong `.env` tại workspace root.

| Item | Value |
|---|---|
| Workspace | Agent VM (xem `AGENT_WORKSPACE` trong `.env`) |
| URL | `${STAGING_BASE_URL}/sys` → port 3370 |
| PM2 processes | `core.sys.api00` (3370), `core.sys.api01` (3371), `core.sys.worker00` (fork mode) |
| Ecosystem config | `ecosystem.config.js` tại workspace root |
| Env file | `.env` tại workspace root (dùng chung với prod) |

### Deploy to Staging

```bash
# Từ workspace root
nx run sys:build

# Restart cả 3 process — KHÔNG quên --update-env nếu vừa edit .env
pm2 restart core.sys.api00 core.sys.api01 core.sys.worker00 --update-env

# Verify API
curl http://localhost:3370/health

# Verify worker đã consume queue (nếu có pending jobs)
redis-cli -u "${REDIS_URL}" LLEN bull:sys-audit-ingest:wait
```

> **Note:** Staging chạy ngay trên agent VM — không cần SSH. Build + restart là code mới lên staging ngay.

### Cả lib + service cùng deploy

Khi sửa lib `@hydrabyte/sys-client`, mọi consumer service (iam, aiwm, ...) phải được rebuild để pick up lib mới. Lib build → consumer build cascade. Nx Cloud handle dependency, nhưng manual deploy nhớ:
```bash
nx run sys-client:build && \
nx run sys:build && \
nx run iam:build  # và mỗi consumer khác đang dùng lib

# Restart từng consumer
pm2 restart core.iam.api00 core.iam.api01 --update-env
```

---

## Important Conventions

1. **Soft delete only** cho setting + audit-log — `isDeleted: true` thay vì hard delete
2. **Org-scoped queries** — audit-log filter mặc định theo `actor.orgId` cho org.owner; chỉ universe.owner thấy all
3. **`actor.orgId = 'system'`** — convention cho cron / internal worker / login pre-auth events. UI có thể filter riêng.
4. **ConfigKey reuse** — không tạo enum mới cho sys. Dùng chung `ConfigKey` từ `@hydrabyte/shared` (cần thiết cho dual-read aiwm.configuration ở P5).
5. **Sensitive default false** — schema `sensitive: false` mặc định. Set true CHỈ qua metadata constant. UI/API không cho phép caller override sensitive flag (server tự derive từ metadata).
6. **Audit fire-and-forget** — `audit.log()` không await Mongo write. Nếu BullMQ down → fallback stdout với marker `AUDIT_FALLBACK` (không throw).
7. **Setting `getOrDefault` luôn có fallback hợp lý** — sys downtime KHÔNG được làm crash consumer.
8. **3 lớp validation cho setting value** — class-validator (DTO) + metadata-driven (`validateValue` trong service) + Mongo enum constraint (schema `key` field).

---

## Bulk Write Rules

Khi task yêu cầu đọc nhiều file (≥3) để produce output lớn — viết/update doc cho toàn bộ module sys, scan repo tổng hợp, etc. — spawn `general-purpose` Agent sub-agent thay vì xử lý trực tiếp.

**Quy tắc bắt buộc:**
1. Spawn sub-agent (`subagent_type: "general-purpose"`)
2. Brief đầy đủ context: scope cụ thể, tài liệu hiện có, cần update gì
3. Prompt PHẢI kết thúc bằng: `"Do NOT return content back. Write the output directly via Write/Edit tools, then return only a short confirmation (file paths + line counts)."`
4. Nếu sub-agent fail: report lỗi lên user, không tự retry trực tiếp

**Trigger examples:** "viết lại toàn bộ doc sys", "rà soát + update INTEGRATION_GUIDE", "tổng hợp changelog từ tất cả version".

---

## Cross-Service Impact Awareness

Sys khác các service business (cbm, aiwm) ở chỗ: **mọi thay đổi đều có thể impact toàn hệ thống** vì nhiều service đang dùng sys-client. Cẩn trọng đặc biệt:

| Loại thay đổi | Impact |
|---|---|
| Add ConfigKey + metadata | Low — chỉ thêm, không break |
| Remove/rename ConfigKey | **High** — break tất cả service đang query key đó |
| Change setting schema field | **High** — lib parse có thể sai |
| Change audit-log schema field | Medium — sys API + lib SysAuditClient cần sync |
| Add audit-log filter | Low |
| Change pub/sub channel name | **High** — lib subscriber cần update đồng thời |
| Change HTTP endpoint path `/settings/internal/secret/:key` | **High** — lib hardcode path |
| Change BullMQ queue name `sys-audit-ingest` | **High** — lib + worker cần đổi đồng thời |
| Change `core-sys` DB name | **Critical** — mọi connection (lib + sys service) cần đổi đồng thời + migrate data |
| Change `INTERNAL_API_KEY` | Medium — chỉ cần coordinate với consumer |
| Change `SYS_INTERNAL_CIDR_ALLOWLIST` | Low (config-only, không cần redeploy) |

→ Trước khi merge các thay đổi mức **High/Critical**, viết migration plan + coordinate với các agent maintain consumer service.

---

## Phase Status (P0–P6)

| Phase | Status | Reference |
|---|---|---|
| P0 — Scaffold service | ✅ Done (v2.1.0) | `0fde7fd2`, `7c49d84` |
| P1 — Setting module + lib | ✅ Done (v2.2.0) | `94a68ac`, `924e08a`, `ad82119` |
| P2 — Audit-log + DB rename core-sys | ✅ Done (v2.3.0) | `bfe802b` |
| P3 — IAM pilot integration | ✅ Done (v2.4.0) | `0b95133` |
| P4 — Soak (1-2 weeks observability) | 🚧 In progress | — |
| P5 — AIWM configuration migration | 📋 Planned | — |
| P6 — Rollout audit decorator (aiwm/cbm/mona/noti) | 📋 Planned | — |

Cập nhật bảng này sau mỗi phase merge vào main.

---

## Quick Reference

### Build commands
```bash
nx run sys-client:build      # Lib
nx run sys:build             # Service
nx run sys:api               # Run API mode (port 3007)
nx run sys:wrk               # Run worker mode (BullMQ consumer)
```

### Critical env vars
```bash
MONGODB_URI=mongodb://core_app_user:...@10.10.0.100:27017
REDIS_URL=redis://queue_user:...@10.10.0.100:6379
INTERNAL_API_KEY=<shared with consumers>
SYS_INTERNAL_CIDR_ALLOWLIST=127.0.0.1/32,::1/128,10.10.0.0/16  # fail-secure if empty
```

### Quick health check
```bash
curl http://localhost:3007/health                    # API alive
curl http://localhost:3007/settings/metadata | jq    # Metadata loaded (no auth)
curl http://localhost:3007/api-docs                  # Swagger UI
```
