# SYS Service — Implementation Plan v1

> **Plan cho:** [`PROPOSAL.md`](./PROPOSAL.md) v2 (Sys initial release)
> **Backlog tracker:** [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md)
> **Strategy:** Option A — mỗi phase = 1 PR riêng để dễ review/revert
> **Date:** 2026-05-09
> **Status:** Draft — chờ approve để bắt đầu P0

---

## Overview

| Phase | Goal | Branch | Effort (rough) | Blockers |
|---|---|---|---|---|
| **P0** | Scaffold service `sys` từ template | `feat/sys-scaffold` | 0.5 ngày | — |
| **P1** | Module `setting` + lib `@hydrabyte/sys-client` core | `feat/sys-setting` | 3-4 ngày | P0 merged |
| **P2** | Module `audit-log` + decorator/interceptor | `feat/sys-audit-log` | 2-3 ngày | P1 merged |
| **P3** | Pilot `iam` (1-2 setting + audit cho login/logout) | `feat/iam-sys-integration` | 1 ngày | P2 merged |
| **P4** | Soak 1-2 tuần ở prod | — | (passive) | P3 deployed |
| **P5** | Migrate `aiwm.configuration` → `sys.setting` | `feat/aiwm-config-migration` | 2 ngày | P4 ổn |
| **P6** | Rollout audit cho aiwm/cbm/mona/noti | `feat/sys-audit-rollout` | 2 ngày | P5 deployed |

**Tổng**: ~10-12 ngày active dev + 1-2 tuần soak.

---

## Branch & PR convention

- Mỗi phase 1 branch, branch off từ `main` mới nhất (sync trước theo CLAUDE.md)
- Commit message: theo convention hiện tại của repo (xem `git log` recent)
- PR description ref:
  ```
  Refs:
  - docs/sys/PROPOSAL.md (section X.Y)
  - docs/sys/PLAN_v1.md (Phase Pn)
  ```
- Mỗi PR self-contained: build pass, lint pass, manual smoke test pass
- Sau merge → update [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md): chuyển feature từ 📋 → ✅

---

## Phase P0 — Scaffold service `sys`

**Goal:** Service `sys` build/run được, `/health` trả 200, swagger hiển thị, **chưa có business logic**.

**Branch:** `feat/sys-scaffold`

**Pre-requisites:**
- `git pull` main mới nhất
- Verify schd thực tế đang dùng port 3006/3360-3369 (đã confirm trong discussion)

### Tasks

#### P0.1 — Clone template
- [ ] `cp -r services/template services/sys`
- [ ] Verify cấu trúc: `services/sys/{src/, project.json, Dockerfile, webpack.config.js, tsconfig.*.json}` đầy đủ
- **Verify**: `ls services/sys/` thấy file đầy đủ giống template

#### P0.2 — Rename references trong service files
- [ ] `services/sys/project.json`: `name`, `sourceRoot`, `cwd`, `outputPath` → `sys`
- [ ] `services/sys/tsconfig.app.json`: paths
- [ ] `services/sys/Dockerfile`: WORKDIR, COPY paths, healthcheck port (3007)
- [ ] `services/sys/docker-entrypoint.sh`: service name
- [ ] `services/sys/webpack.config.js`: entry/output
- [ ] `services/sys/src/main.ts`: logger name, port (3007 default)
- [ ] `services/sys/src/bootstrap-api.ts`, `bootstrap-worker.ts`: service name
- [ ] `services/sys/src/config/*.ts`: service-specific config
- [ ] `services/sys/src/app/app.module.ts`, `app-worker.module.ts`: chỉnh import path nếu cần
- **Verify**: `grep -rn "template" services/sys/ --include="*.ts" --include="*.json" --include="Dockerfile"` chỉ còn references hợp lệ (không có references tới service `template`)

#### P0.3 — Workspace-level config
- [ ] `tsconfig.base.json`: thêm path mapping nếu pattern hiện có
- [ ] Verify `nx.json` không cần đổi (project auto-discovered)
- [ ] `ecosystem.config.js`: thêm `core.sys.api00` (port 3370), `core.sys.api01` (3371), `core.sys.worker00` (fork mode)
- **Verify**: `nx show projects | grep sys` thấy `sys` xuất hiện

#### P0.4 — Cấu hình DB & Redis
- [ ] `services/sys/src/config/database.config.ts`: connect tới `core-sys` DB (dùng `MONGODB_URI` từ root `.env` + database name)
- [ ] `services/sys/src/config/redis.config.ts`: shared Redis (giống các service khác)
- [ ] Tạo DB `core-sys` (auto-create khi connect lần đầu)
- **Verify**: app startup không lỗi connection

#### P0.5 — Remove unneeded từ template
- [ ] Xóa `services/sys/src/modules/report/` (template-only example)
- [ ] Xóa các queue producer/processor mẫu (giữ skeleton để P1/P2 thêm)
- [ ] Update `app.module.ts`, `app-worker.module.ts` bỏ import của module xóa
- **Verify**: `grep -rn "ReportModule\|ReportService" services/sys/` không còn match

#### P0.6 — Skeleton modules
- [ ] Tạo `services/sys/src/modules/setting/` với file rỗng + module export (chưa logic)
  - `setting.module.ts` (empty NestJS module)
  - `setting.schema.ts` (chỉ có Setting class extends BaseSchema, các field cơ bản — chi tiết ở P1)
- [ ] Tạo `services/sys/src/modules/audit-log/` tương tự
- [ ] Wire 2 module vào `app.module.ts`
- **Verify**: `nx run sys:build` pass

#### P0.7 — Service-specific docs
- [ ] Tạo `services/sys/CLAUDE.md` theo format AIWM/SCHD CLAUDE.md
  - Service overview, port, modes
  - Modules table (placeholder, sẽ fill khi P1/P2)
  - Reference tới `docs/sys/PROPOSAL.md`, `docs/sys/PLAN_v1.md`, `docs/sys/FEATURE_BACKLOG.md`
- [ ] Update **root `CLAUDE.md`** services table:
  - Thêm row `sys | 3007 | 3370–3379 | System utilities — settings, audit-log`
  - Fix row `schd` đang stale: hiện ghi 3009/3390-3399, thực tế 3006/3360-3369
- [ ] Update `docs/PORT-ALLOCATION.md`:
  - Thêm sys section
  - Fix schd entry
  - Remove các service đã xóa (vsm, pag, aivp, vbx, lcm) khỏi port table
- **Verify**: docs khớp với thực tế

#### P0.8 — Verification suite
- [ ] `nx run sys:build` pass
- [ ] `nx lint sys` pass
- [ ] `nx run sys:api` start, log không có error
- [ ] `curl http://localhost:3007/health` → 200 OK
- [ ] Swagger: `open http://localhost:3007/api-docs` hiển thị
- [ ] TypeScript full check (script trong CLAUDE.md) → no errors
- [ ] `grep -rn "template" services/sys/ --include="*.ts" --include="*.json"` clean

#### P0.9 — Versioning & changelog
- [ ] `npm version minor --no-git-tag-version` (new service = minor bump)
- [ ] Tạo `docs/change-logs/v{version}.md`:
  ```markdown
  # v{version} — 2026-MM-DD
  ## Features
  - **sys**: scaffold service mới (port 3007 dev, 3370–3379 prod) cho tập trung settings và audit-log
  ## Notes
  - Fix port allocation docs: schd thực tế dùng 3006/3360–3369
  ```
- [ ] Stage `package.json` + changelog cùng commit P0

### Success criteria
✅ Service `sys` chạy được, `/health` OK, swagger hiển thị, build/lint pass, không có code chết từ template, docs đã update.

❌ **KHÔNG được merge P0 nếu**: còn references `template`, build fail, hoặc docs (PORT-ALLOCATION, CLAUDE.md) chưa khớp.

---

## Phase P1 — Module `setting` + lib `@hydrabyte/sys-client` core

**Goal:** UI CRUD setting hoạt động, lib có thể đọc setting (cả non-sensitive và sensitive) từ service consumer khác, 5 safety guards verified bằng test.

**Branch:** `feat/sys-setting`

**Pre-requisites:** P0 merged.

### Tasks

#### P1.1 — Setting schema & enums
- [ ] `services/sys/src/modules/setting/setting.schema.ts`: schema đầy đủ theo PROPOSAL §4.1 (bao gồm `sensitive`, `encrypted`, `iv`, `authTag`, `keyVersion` nullable cho future Level 2)
- [ ] `libs/shared/src/enums/setting-key.enum.ts`: migrate `ConfigKey` từ aiwm hoặc tạo mới `SettingKey` (giữ values hiện tại để dual-read được P5)
- [ ] `services/sys/src/modules/setting/constants/setting-metadata.ts`: migrate `CONFIG_METADATA` + thêm field `cacheTtlSec`, `staleTtlSec`, `sensitive`
- [ ] Indexes theo PROPOSAL §4.1
- **Verify**: schema compile, indexes apply khi connect Mongo

#### P1.2 — Setting DTOs
- [ ] `setting.dto.ts`: `CreateSettingDto`, `UpdateSettingDto`, `InitializeSettingsDto`, `RevealSettingDto`
- [ ] Validation rules với class-validator
- **Verify**: tsc pass

#### P1.3 — Setting service (CRUD + RBAC)
- [ ] `setting.service.ts` extends `BaseService<Setting>`
- [ ] Methods: `findAll`, `findByKey`, `createOrUpdate`, `updateByKey`, `deleteByKey`, `revealByKey`, `initializeAll`, `initializeAllInternal` — port từ aiwm.configuration với điều chỉnh
- [ ] RBAC matrix theo PROPOSAL §4.5 (universe.owner / org.owner)
- [ ] Validation theo metadata (giữ logic hiện tại)
- **Verify**: unit test cho từng method (nếu test infra ready) hoặc manual smoke

#### P1.4 — Pub/sub publisher
- [ ] Inject Redis publisher
- [ ] Sau mỗi `createOrUpdate`/`updateByKey`/`deleteByKey` → publish `sys:setting:invalidate` với payload theo PROPOSAL §4.6
- [ ] Khi metadata reload (rare) → publish `sys:metadata:invalidate`
- **Verify**: redis-cli `subscribe sys:setting:invalidate` thấy event khi update qua API

#### P1.5 — Setting controller (UI endpoints)
- [ ] `setting.controller.ts` với routes theo PROPOSAL §4.4 "UI quản trị"
- [ ] Sensitive `GET /:key` trả `***` (trừ universe.owner xem reveal qua endpoint riêng)
- [ ] `POST /:key/reveal` cho universe.owner — return plaintext + ghi audit
- [ ] Swagger decorators đầy đủ
- **Verify**: swagger hiển thị, manual test với postman/curl

#### P1.6 — Internal endpoints + guards
- [ ] `setting-internal.controller.ts`: `GET /settings/internal/:key`, `GET /settings/internal/secret/:key`, `POST /settings/internal/reload-pubsub`
- [ ] `services/sys/src/guards/cidr-allowlist.guard.ts`: implement theo PROPOSAL §7.2, dùng `ip-range-check` lib
- [ ] `services/sys/src/guards/internal-api-key.guard.ts`: constant-time compare
- [ ] `services/sys/src/guards/rate-limit.guard.ts`: Redis-based, áp dụng cho `/internal/secret/*`
- [ ] Wire 3 guards vào internal endpoints theo thứ tự CIDR → APIKey → RateLimit
- [ ] `app.set('trust proxy', ...)` trong `main.ts`
- **Verify**:
  - Request từ IP ngoài allowlist → 403 + audit
  - Request thiếu `X-Internal-API-Key` → 401 + audit
  - 11 requests trong 1 phút cho `/internal/secret/:key` từ 1 IP → 429 cho request thứ 11

#### P1.7 — Public metadata endpoint
- [ ] `GET /settings/metadata`, `GET /settings/metadata/:key` — no auth, trả `CONFIG_METADATA`
- **Verify**: curl không có JWT → 200 OK

#### P1.8 — Migration script (optional cho P1, BẮT BUỘC cho P5)
- [ ] Tạo `scripts/migrate-aiwm-config-to-sys.js` skeleton (chưa run, chỉ chuẩn bị)
- **Verify**: script syntax OK, chưa execute

#### P1.9 — Lib `@hydrabyte/sys-client` — structure
- [ ] Tạo `libs/sys-client/` theo Nx lib pattern (giống `libs/base`, `libs/shared`)
- [ ] `libs/sys-client/project.json`, `tsconfig.lib.json`, `package.json`
- [ ] Export tên: `@hydrabyte/sys-client`
- [ ] Update `tsconfig.base.json` paths
- **Verify**: import từ service template thử được (`import { SysSettingClient } from '@hydrabyte/sys-client'`)

#### P1.10 — Lib SysClientModule + config
- [ ] `SysClientModule.forRoot({ sysApiUrl, internalApiKey, serviceName, metricsEnabled, auditEnabled })`
- [ ] Inject Redis (subscriber + publisher), Mongo connection (cho non-sensitive direct read), HTTP client
- **Verify**: import vào app module 1 service consumer pilot, không lỗi

#### P1.11 — Lib SysSettingClient — non-sensitive path (Mongo direct)
- [ ] `_getSetting()`: kết nối Mongo `core-sys.settings`, query với `{ key, scope, owner.orgId }` lookup priority
- [ ] In-memory `settingCache: Map<string, CacheEntry>`
- [ ] TTL check + stale-while-revalidate logic
- [ ] OnModuleInit warm cache
- **Verify**: lib test (hoặc service consumer test) đọc setting thấy cache hit log đúng

#### P1.12 — Lib SysSettingClient — sensitive path (HTTP)
- [ ] `_getSensitive()`: HTTP `GET /settings/internal/secret/:key` với `X-Internal-API-Key` header
- [ ] Separate `secretCache: Map`, TTL ngắn hơn, không stale-while-revalidate
- **Verify**: với 1 setting sensitive=true, lib gọi qua HTTP (verify qua sys log thấy request)

#### P1.13 — Lib SysSettingClient — unified API + metadata routing
- [ ] `metadataCache`: load từ `GET /settings/metadata` lúc OnModuleInit
- [ ] `get(key, orgId)` route: `metadata[key].sensitive ? _getSensitive : _getSetting`
- [ ] `getString`/`getNumber`/`getBoolean`/`getOrDefault`: wrapper trên `get()`
- [ ] `has`, `reloadKey`, `reloadAll`
- **Verify**: caller chỉ gọi `sys.get(key, orgId)` cho cả 2 loại key, lib route đúng

#### P1.14 — Lib pub/sub subscriber
- [ ] Subscribe `sys:setting:invalidate` → invalidate cache entry
- [ ] Subscribe `sys:metadata:invalidate` → reload metadata
- [ ] Pub/sub disconnect handler: log warning, không throw, TTL fallback đảm nhiệm
- **Verify**: update setting qua sys API → service consumer reflect value mới (timing < 1s)

#### P1.15 — 5 Safety Guards (CRITICAL)
- [ ] **Guard 1**: 2 cache store riêng — verify bằng code review
- [ ] **Guard 2**: `getAll()` skip sensitive — viết test case `expect(result).not.toHaveProperty('sensitive_key')`
- [ ] **Guard 3**: Logging hook redact — wrapper `redactValue(key, value)`, dùng cho tất cả logger calls trong lib
- [ ] **Guard 4**: Metrics no-value labels — review metric definitions
- [ ] **Guard 5**: `getCacheStats()` mask sensitive — test case verify output không có `value` field
- [ ] CI test verify cả 5 guards (placeholder nếu CI infra chưa ready, ít nhất manual checklist)
- **Verify**: tất cả 5 guards có evidence (test/code review note)

#### P1.16 — Observability — metrics
- [ ] Implement 9 Prometheus metrics theo PROPOSAL §8.1
- [ ] Expose `/metrics` endpoint trên service consumer (gated `SYS_CLIENT_METRICS_ENABLED`)
- [ ] Mỗi `get()` call → record `sys_setting_get_duration_seconds`, `sys_cache_hit_total`
- [ ] Mỗi reload → `sys_cache_reload_total{trigger=...}`
- [ ] Pub/sub event lag → `sys_pubsub_lag_seconds` (delta từ `updatedAt` payload)
- **Verify**: scrape `/metrics`, thấy metrics với labels đúng, no value labels

#### P1.17 — Debug endpoint
- [ ] `/sys-client/stats` trên service consumer, gated `DEBUG=true` hoặc `INTERNAL_API_KEY`
- [ ] Output theo PROPOSAL §8.3 (sensitive entries không có value)
- **Verify**: endpoint trả đúng format

#### P1.18 — Pilot validation: dùng lib từ template service
- [ ] Trong template (hoặc service test riêng), import `@hydrabyte/sys-client`
- [ ] Tạo 2 setting test: 1 non-sensitive (`test.public_value`), 1 sensitive (`test.secret_value`)
- [ ] Gọi `sys.get('test.public_value', orgId)` → đo cache hit rate sau warm
- [ ] Gọi `sys.get('test.secret_value', orgId)` → verify đi qua HTTP (sys log thấy)
- [ ] Update setting qua sys API → verify pub/sub invalidate (cache hit count reset)
- **Verify**: end-to-end flow OK

#### P1.19 — Versioning & changelog
- [ ] `npm version minor`
- [ ] Changelog: features setting module + lib

### Success criteria
✅ UI CRUD setting hoạt động, lib có thể đọc cả 2 loại key, pub/sub invalidation < 1s, 5 safety guards verified, metrics expose đúng, debug endpoint hoạt động.

---

## Phase P2 — Module `audit-log` + decorator/interceptor

**Goal:** 1 service ghi audit qua decorator + explicit, query được từ UI sys.

**Branch:** `feat/sys-audit-log`

**Pre-requisites:** P1 merged.

### Tasks

#### P2.1 — Audit-log schema & DTOs
- [ ] `audit-log.schema.ts` theo PROPOSAL §5.1 (đầy đủ field gồm `keyType`)
- [ ] Indexes theo PROPOSAL §5.1
- [ ] DTOs cho create + search query
- **Verify**: schema compile, indexes apply

#### P2.2 — Sanitization utility
- [ ] `services/sys/src/modules/audit-log/utils/sanitize.ts`:
  - Strip sensitive fields theo `SENSITIVE_FIELDS` constant
  - Per-field truncate (1KB / giữ 256)
  - Total payload cap (4KB)
- [ ] `libs/sys-client/src/utils/sanitize.ts`: cùng logic, share qua lib export hoặc duplicate (để client-side strip trước khi enqueue)
- [ ] Threshold đọc từ setting `sys.audit.truncate_*` (fallback default nếu sys chưa available)
- **Verify**: unit test với input có password/token/long string → output đúng format

#### P2.3 — Audit service
- [ ] `audit-log.service.ts`: `findAll` (search/filter/pagination), `findById`, `create`, `getStats` (aggregate count)
- [ ] RBAC: universe.owner xem all, org.owner chỉ xem `actor.orgId === ctx.orgId`
- **Verify**: unit/manual test query

#### P2.4 — Audit controller (UI)
- [ ] `GET /audit-logs`, `GET /audit-logs/:id`, `GET /audit-logs/stats`
- [ ] Filters: service, resource, action, actor.userId, actor.orgId, occurredAt range, correlationId
- **Verify**: swagger + manual query

#### P2.5 — BullMQ ingest queue + worker
- [ ] `services/sys/src/queues/processors/audit-ingest.processor.ts`:
  - Consume queue `sys-audit-ingest`
  - Batch 50 events hoặc 100ms (whichever first) → `insertMany`
  - Worker chạy ở mode `wrk`
- [ ] Queue config trong `services/sys/src/config/queue.config.ts`
- [ ] Wire `AuditIngestProcessor` vào `app-worker.module.ts`
- **Verify**: enqueue 100 events → tất cả insert vào Mongo

#### P2.6 — Internal endpoint cho audit ingest (alt cho BullMQ)
- [ ] `POST /audit-logs/internal` (CIDR + APIKey guards)
- [ ] Nhận batch, sanitize, insertMany
- **Verify**: curl với header đúng → 201, record xuất hiện

#### P2.7 — Lib SysAuditClient — fire-and-forget
- [ ] `audit.log(event)`: validate, sanitize, push BullMQ → return ngay
- [ ] `audit.logBatch(events)`: cùng pattern
- [ ] Auto-fill `service` từ `SysClientModule` config
- [ ] Fallback nếu Redis down: log stdout marker `AUDIT_FALLBACK` + payload
- **Verify**: gọi `audit.log()` không block (đo latency < 1ms)

#### P2.8 — `@Audit()` decorator
- [ ] `libs/sys-client/src/decorators/audit.decorator.ts`: `Audit(config: AuditConfig)`
- [ ] Type `AuditConfig`: `{ resource, action, captureBefore? }`
- **Verify**: TypeScript autocomplete hoạt động

#### P2.9 — `AuditInterceptor`
- [ ] `libs/sys-client/src/interceptors/audit.interceptor.ts`:
  - Đọc metadata từ `@Audit()`
  - Capture: actor (từ `req.user`), correlationId, requestPayload (sanitized), startTime
  - Sau handler success: capture responseSummary (id, status, size), result='success', durationMs → enqueue
  - Catch error: result='failure', errorMessage, errorCode → enqueue + rethrow
- [ ] Auto-extract actor logic: hỗ trợ user JWT, agent JWT, anonymous token, fallback `'system'`
- **Verify**: gắn `@Audit({...})` vào 1 endpoint trong template, gọi → audit record xuất hiện đầy đủ field

#### P2.10 — `captureBefore: true` flow
- [ ] Document trong PROPOSAL/code: `captureBefore` cần config service lookup → đề xuất giữ đơn giản P2: chỉ cần `before` từ middleware đọc DB, **không tự động hóa magic** (để 💡 backlog)
- [ ] Thay vào đó: `@Audit({ resource, action, beforeProvider: 'fetchById' })` chỉ là pass-through, caller tự handle bằng explicit log nếu phức tạp
- **Quyết định P2**: chưa làm `captureBefore`, đẩy backlog; decorator chỉ capture sau handler.

#### P2.11 — `'system'` orgId support
- [ ] Khi không có `req.user`/`req.context` (cron, internal call) → actor.orgId = `'system'`
- [ ] Validation chấp nhận `'system'` như string đặc biệt (không phải ObjectId)
- **Verify**: test case audit từ scheduled job → record hợp lệ

#### P2.12 — Pilot test trong template
- [ ] Gắn `@Audit()` vào 1-2 endpoint test
- [ ] Gọi explicit `auditClient.log()` từ 1 service method
- [ ] Verify cả 2 records xuất hiện ở UI sys, sanitize đúng
- **Verify**: end-to-end OK

#### P2.13 — Metrics audit
- [ ] `sys_audit_enqueue_total{service, action, result}`
- [ ] `sys_audit_enqueue_failed_total{reason}`
- **Verify**: scrape thấy metrics

#### P2.14 — Versioning & changelog
- [ ] `npm version minor`

### Success criteria
✅ Audit ghi qua cả decorator và explicit, sanitize/truncate đúng, query/filter từ UI hoạt động, BullMQ batching ổn định, fallback log khi Redis down test được.

---

## Phase P3 — Pilot `iam`

**Goal:** iam dùng sys cho 1-2 setting (chuyển từ env) + ghi audit cho user.create/login/logout.

**Branch:** `feat/iam-sys-integration`

**Pre-requisites:** P2 merged + deployed staging.

### Tasks

#### P3.1 — Chọn setting để migrate
- [ ] Identify 2 settings trong iam đang đọc từ env, vd:
  - `iam.jwt.access_ttl_sec` (số giây)
  - `iam.password.min_length` (number)
- [ ] Thêm vào `SettingKey` enum + metadata
- [ ] Seed default value vào `core-sys.settings` scope=global

#### P3.2 — Iam dùng sys-client
- [ ] Import `SysClientModule.forRoot(...)` vào iam app module
- [ ] Replace `process.env.JWT_ACCESS_TTL` → `await sys.getNumber('iam.jwt.access_ttl_sec', orgId)`
- [ ] Tương tự cho password.min_length
- [ ] Verify cache hit rate cao (1 service start, < 5 read/min)

#### P3.3 — Audit cho login/logout/user.create
- [ ] Gắn `@Audit({ resource: 'user', action: 'login' })` vào `POST /auth/login`
- [ ] `@Audit({ resource: 'user', action: 'logout' })` vào `POST /auth/logout`
- [ ] `@Audit({ resource: 'user', action: 'create' })` vào `POST /users`
- [ ] Test login fail (sai password) → audit `result='failure'`, `errorMessage` không leak password

#### P3.4 — Verify cross-service
- [ ] Trong UI sys, query audit `service=iam` → thấy events
- [ ] Update setting qua UI sys → iam reflect (verify qua next request dùng value mới)
- [ ] `/sys-client/stats` của iam → cache hit, pub/sub events đúng

#### P3.5 — Versioning & changelog

### Success criteria
✅ Iam đọc setting từ sys không downtime, audit log cross-service hoạt động end-to-end, `'system'` orgId không xuất hiện ngoài kỳ vọng (login phải có orgId user).

---

## Phase P4 — Soak

**Goal:** Quan sát 1-2 tuần ở prod, tune nếu cần.

**No branch — passive monitoring.**

### Tasks
- [ ] Setup dashboard mona theo dõi 9 metrics
- [ ] Hằng ngày check `pubsub_missed_ratio`, `cache_hit_ratio`, `audit_enqueue_failed_ratio`
- [ ] Nếu `pubsub_missed > 1%`: investigate (Redis health, network)
- [ ] Nếu `cache_hit < 80%`: cân nhắc tăng TTL
- [ ] Nếu metrics ổn 1-2 tuần → green light P5

### Success criteria
✅ Không có alert fire bất ngờ, không có data drift report, latency p99 ổn.

---

## Phase P5 — Migrate `aiwm.configuration` → `sys.setting`

**Goal:** AIWM bỏ module `configuration`, đọc setting qua sys-client. Không downtime.

**Branch:** `feat/aiwm-config-migration`

**Pre-requisites:** P4 ổn định.

### Tasks

#### P5.1 — Migration script
- [ ] Hoàn thiện `scripts/migrate-aiwm-config-to-sys.js`:
  - Connect cả `core_aiwm` và `core-sys`
  - Read all `core_aiwm.configurations` (non-deleted)
  - Map sang schema mới (set `sensitive=false` mặc định cho keys không phải secret)
  - Insert vào `core-sys.settings` (skip nếu key+scope+orgId đã tồn tại)
  - Dry-run mode + apply mode
  - Log report: total, inserted, skipped, errors
- [ ] Run dry-run trên prod snapshot

#### P5.2 — AIWM dual-read mode (1 tuần)
- [ ] Trong AIWM: replace `ConfigService.get()` calls bằng `sys.get()`
- [ ] Lib `@hydrabyte/sys-client` thêm fallback option `legacyConfigSource`:
  - Nếu key không có ở `core-sys` → fallback đọc `core_aiwm.configurations`
  - Log warning để track keys chưa migrate
- [ ] Deploy AIWM với dual-read enabled

#### P5.3 — Run migration trên prod
- [ ] Run migrate script (apply mode)
- [ ] Verify count: `core-sys.settings.count() ≈ core_aiwm.configurations.count()`
- [ ] Spot check 10 keys: value, scope, orgId khớp

#### P5.4 — Soak dual-read 3-7 ngày
- [ ] Theo dõi log AIWM: số lần fallback `legacyConfigSource` triggered
- [ ] Ngày 1 nên có vài lần (cache aiwm trước migrate), giảm dần về 0

#### P5.5 — Cutover
- [ ] Disable `legacyConfigSource` trong AIWM config
- [ ] Deploy → verify aiwm vẫn hoạt động bình thường

#### P5.6 — Cleanup
- [ ] Xóa module `services/aiwm/src/modules/configuration/`
- [ ] Xóa các import liên quan
- [ ] **KHÔNG xóa collection `core_aiwm.configurations`** ngay — giữ 30 ngày để rollback nếu phát hiện vấn đề
- [ ] Tạo task backlog: "Drop `core_aiwm.configurations` collection sau 30 ngày"

#### P5.7 — Versioning & changelog (major bump nếu coi đây là breaking)

### Success criteria
✅ AIWM không downtime, không lỗi config-related sau cutover 1 tuần. Code aiwm gọn hơn ~600 LOC.

---

## Phase P6 — Rollout audit cho aiwm/cbm/mona/noti

**Goal:** Cross-service audit log đầy đủ.

**Branch:** `feat/sys-audit-rollout`

### Tasks
Cho mỗi service (aiwm, cbm, mona, noti):
- [ ] Identify 3-5 action quan trọng (vd `agent.create`, `document.delete`, `notification.send`, `report.export`)
- [ ] Gắn `@Audit()` decorator
- [ ] Test endpoint → verify audit record
- [ ] Update FEATURE_BACKLOG.md đánh dấu service đã rollout

### Success criteria
✅ UI sys query audit cho mỗi service đều có data, các action critical đều được track.

---

## Risks & Rollback strategy

| Phase | Risk | Mitigation | Rollback |
|---|---|---|---|
| P0 | Webpack/Docker config sai → service không start | Verify trên dev local trước commit | Revert PR |
| P1 | Pub/sub không hoạt động → setting stale | TTL safety net + structured log; debug endpoint | Disable pub/sub, lib chỉ dùng TTL |
| P1 | 5 safety guards có hole → leak sensitive | Code review checklist, test case bắt buộc | Hotfix patch lib version |
| P2 | BullMQ queue overflow → audit miss | Worker batch size tunable, alert `queue_full` | Fallback log stdout → recover thủ công |
| P3 | Iam dùng sys cho JWT TTL → sys down → token issue | Cache warm + TTL 5 phút → sys down vài phút không ảnh hưởng. `getOrDefault` luôn có fallback hardcoded | Tạm hardcode trong code nếu sys down kéo dài |
| P5 | Migration miss key → aiwm break | Dry-run trước, dual-read 1 tuần | Re-enable `legacyConfigSource` ngay |
| P5 | Schema mismatch (`sensitive` field default) | Default `false` an toàn cho aiwm config hiện tại | Update từng key thủ công sau migrate |

---

## Pre-merge checklist (mỗi PR)

- [ ] `git pull` main mới nhất
- [ ] `nx build <service>` pass
- [ ] `nx lint <service>` pass
- [ ] TypeScript full check (per CLAUDE.md script)
- [ ] Manual smoke test: ít nhất golden path
- [ ] Update `FEATURE_BACKLOG.md` (đổi 📋 → ✅ cho features hoàn thành)
- [ ] `npm version <patch|minor|major>` + changelog file
- [ ] Commit với Co-Authored-By footer
- [ ] PR description ref tới PROPOSAL section + PLAN phase

---

## Open execution questions

1. **CI infra cho test 5 safety guards**: repo có jest/test setup chưa? Nếu chưa, P1.15 sẽ là manual checklist + code review note. Em sẽ check trong P0 và confirm.

2. **Thời điểm P3 deploy**: anh muốn deploy iam pilot ra prod ngay sau P2 merge, hay staging trước rồi mới prod sau soak?

3. **Migration script ngôn ngữ**: dùng JS/Node thuần hay viết Nx target `nx run sys:migrate-aiwm-config`? Em nghiêng về Nx target để consistent.

4. **`SYS_API_URL` discovery**: hardcode `http://sys:3007` trong env mỗi service consumer, hay qua config trung tâm? P3 sẽ phải quyết.

Anh trả lời 4 câu này → em bắt đầu **P0** ngay.
