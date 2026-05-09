# SYS Service — Feature Backlog

> Single source of truth cho mọi feature của `sys` service: đã có, đang làm, sẽ làm, và ý tưởng tương lai.
>
> **Quan hệ với các doc khác:**
> - **`FEATURE_BACKLOG.md`** (file này) — tracking toàn bộ, cập nhật sau mỗi release
> - **`PROPOSAL_*.md`** — đề xuất cho 1 nhóm feature sẽ release cùng nhau
> - **`PLAN_*.md`** — kế hoạch implementation chi tiết cho 1 proposal cụ thể
>
> **Workflow**: idea → 💡 Backlog → đưa vào Proposal → viết Plan → 🚧 In progress → ✅ Done → update file này
>
> **Last updated:** 2026-05-09

---

## Status legend

| Icon | Status | Ý nghĩa |
|---|---|---|
| ✅ | Done | Đã deploy production, đang chạy |
| 🚧 | In Progress | Đang implement (theo Plan hiện tại) |
| 📋 | Planned | Đã chốt scope, có Proposal/Plan, chưa start |
| 💡 | Backlog | Ý tưởng được ghi nhận, chưa commit timeline |
| ❌ | Rejected | Đã cân nhắc và quyết định không làm (kèm lý do) |

---

## 📦 Active proposals

| Proposal | Trạng thái | Modules trong scope |
|---|---|---|
| [`PROPOSAL.md`](./PROPOSAL.md) — Sys v1 (initial release) | 📋 Planned | `setting` (Level 1) + `audit-log` |

---

## Module: `setting`

### Core capabilities

| Status | Feature | Notes |
|---|---|---|
| 📋 | CRUD setting (REST API) | Trong [`PROPOSAL.md`](./PROPOSAL.md) §4.4 |
| 📋 | Scope `global` + `org` với lookup priority org → global → default | §4.2 |
| 📋 | Metadata-driven validation (dataType, min/max, enum, pattern) | §4.3 — kế thừa từ `aiwm.configuration` |
| 📋 | Bulk initialize cho org mới | §4.4 — `POST /settings/initialize` |
| 📋 | Public metadata endpoint (no auth) | §4.4 — `GET /settings/metadata` |
| 📋 | RBAC matrix (universe.owner / org.owner) | §4.5 |
| 📋 | Pub/sub invalidation channel `sys:setting:invalidate` | §4.6 |
| 📋 | Soft delete | Inherit BaseSchema |

### Security — Sensitive value (Level 1)

| Status | Feature | Notes |
|---|---|---|
| 📋 | `sensitive: boolean` flag trong schema | §4.1 |
| 📋 | UI mask `***`, `getAll()` skip, log redact | §6.4 (5 safety guards) |
| 📋 | Endpoint `POST /settings/:key/reveal` (universe.owner) | §4.4 |
| 📋 | Endpoint `GET /settings/internal/secret/:key` với CIDR + APIKey + RateLimit | §4.4, §7 |
| 📋 | Audit per-read cho sensitive key | §6.3 |

### Security — Encryption at rest (Level 2)

| Status | Feature | Notes |
|---|---|---|
| 📋 | Schema fields chừa sẵn: `encrypted`, `iv`, `authTag`, `keyVersion` | §4.1 — chừa P1 để future không migrate |
| 💡 | AES-256-GCM encryption với master key bootstrap (`SYS_MASTER_KEY` env) | Future release. Trigger: khi cần lưu OpenAI API key, SMTP password, JWT secret vào sys |
| 💡 | Master key rotation flow (2 keys song song trong window) | Cùng release với encryption |
| 💡 | Endpoint `POST /settings/rotate-master` | Cùng release với encryption |

### Security — Full KMS (Level 3)

| Status | Feature | Notes |
|---|---|---|
| ❌ | Envelope encryption (DEK + KEK) | Rejected — quá phức tạp, dùng Vault/AWS KMS thay vì tự build |
| ❌ | HSM-backed master key | Rejected — không có nhu cầu compliance hiện tại |
| ❌ | BYOK per tenant | Rejected — out of scope |
| 💡 | Integrate HashiCorp Vault làm backend cho secret | Future, khi nhu cầu compliance/scale tăng |

---

## Module: `audit-log`

### Core capabilities

| Status | Feature | Notes |
|---|---|---|
| 📋 | Schema có `service`, `resource`, `action`, `resourceId`, `actor`, `before/after`, `requestPayload`, `responseSummary`, `result`, `errorMessage`, `errorCode`, `correlationId`, `occurredAt`, `durationMs`, `keyType` | [`PROPOSAL.md`](./PROPOSAL.md) §5.1 |
| 📋 | REST API search/filter/pagination cho UI | §5.3 |
| 📋 | Aggregate stats endpoint | §5.3 |
| 📋 | BullMQ ingest worker (mode=wrk), batching 50/100ms | §5.4 |
| 📋 | Fallback log stdout với marker `AUDIT_FALLBACK` khi Redis down | §5.4 |
| 📋 | Internal endpoint `POST /audit-logs/internal` (CIDR + APIKey) | §5.3 |

### Sanitization

| Status | Feature | Notes |
|---|---|---|
| 📋 | Strip sensitive fields (`password`, `token`, `apiKey`, ...) | §5.2 — list configurable qua setting |
| 📋 | Per-field truncate 1KB (giữ 256 chars + `originalLength`) | §5.2 |
| 📋 | Total payload size cap 4KB | §5.2 |
| 📋 | Threshold configurable qua setting | §5.2 |
| 💡 | **PII partial mask** (vd email → `t***@example.com`, phone partial) | Chưa làm — release sau khi core stable |
| 💡 | PII detection tự động (regex/ML cho SSN, credit card) | Future — phức tạp, có thể tích hợp với module `pii` của AIWM |

### Retention & archival

| Status | Feature | Notes |
|---|---|---|
| 💡 | **Retention policy** (auto delete cũ hơn N ngày) | **Chưa làm** — đưa vào release sau khi volume audit tăng đủ lớn để cần. Trigger: collection > 1M docs hoặc disk usage cảnh báo |
| 💡 | Setting `sys.audit.retention_days` configurable | Cùng release với retention |
| 💡 | Archive sang S3/GCS trước khi xóa | Cùng release với retention |
| 💡 | Cold storage query (lazy load từ archive) | Future, optional |

### Compliance / advanced

| Status | Feature | Notes |
|---|---|---|
| 💡 | Append-only / signed audit log | Khi cần SOC2/HIPAA |
| 💡 | Export sang external SIEM (Splunk, Datadog) | Future |
| 💡 | Replay/reconstruct entity state từ audit | Future, on-demand |

---

## Lib `@hydrabyte/sys-client`

### Core capabilities

| Status | Feature | Notes |
|---|---|---|
| 📋 | Unified `get()` API (auto-detect sensitive qua metadata) | [`PROPOSAL.md`](./PROPOSAL.md) §6.2-6.3 |
| 📋 | 2 cache store riêng (`settingCache`, `secretCache`) | §6.4 — Safety Guard #1 |
| 📋 | TTL + stale-while-revalidate cho non-sensitive | §6.5 |
| 📋 | Pub/sub subscriber để invalidate cache | §6.5 |
| 📋 | `getAll()` always skip sensitive | §6.4 — Safety Guard #2 |
| 📋 | Log redact qua `redactValue()` helper | §6.4 — Safety Guard #3 |
| 📋 | Metrics no-value labels | §6.4 — Safety Guard #4 |
| 📋 | `getCacheStats()` mask sensitive entries | §6.4 — Safety Guard #5 |
| 📋 | `OnModuleInit` warm cache + load metadata | §6.3 |

### Audit lib

| Status | Feature | Notes |
|---|---|---|
| 📋 | `SysAuditClient.log()` fire-and-forget qua BullMQ | §6.6 |
| 📋 | `@Audit({ resource, action })` decorator | §6.6 |
| 📋 | `AuditInterceptor` capture request/response/error/duration | §6.6 |
| 📋 | Auto-extract actor từ request context | §6.6 |
| 📋 | Sanitize + truncate payload trong interceptor | §6.6 |
| 💡 | `@AuditSensitive()` field-level mask decorator | Future, nice-to-have |
| 💡 | `captureBefore: true` flow (lookup current state trước handler) | Future — phức tạp, để release sau |

---

## Service infrastructure (`sys`)

| Status | Feature | Notes |
|---|---|---|
| 📋 | Service skeleton với NestJS + MongoDB + Redis | [`PROPOSAL.md`](./PROPOSAL.md) §3.1 |
| 📋 | Mode `api` (REST) + `wrk` (BullMQ worker) | §3.1 |
| 📋 | Health check endpoint | Standard |
| 📋 | Swagger / OpenAPI docs | Standard |
| 📋 | Port 3007 dev / 3370–3379 prod, DB `core-sys` | §3.1 |
| 📋 | `CidrAllowlistGuard` cho `/settings/internal/*` + `/audit-logs/internal/*` | §7.2 |
| 📋 | `InternalApiKeyGuard` (constant-time compare) | §7.3 |
| 📋 | `RateLimitGuard` cho secret endpoint (10/min/IP+key) | §7.4 |
| 📋 | Trust proxy config đúng | §7.2 |
| 📋 | Reject events ghi audit `access_denied` | §7.2 |

---

## Observability

| Status | Feature | Notes |
|---|---|---|
| 📋 | 9 Prometheus metrics (cache hit/reload, pubsub lag, secret fetch, audit enqueue) | [`PROPOSAL.md`](./PROPOSAL.md) §8.1 |
| 📋 | Structured JSON logs cho events đáng chú ý | §8.2 |
| 📋 | Debug endpoint `/sys-client/stats` (gated DEBUG hoặc INTERNAL_API_KEY) | §8.3 |
| 📋 | Document alert thresholds (cho mona setup sau) | §8.4 |
| 💡 | Tích hợp với mona dashboard | Future, sau khi metrics stable |
| 💡 | Anomaly detection (vd spike in `access_denied`) | Future |

---

## Migration tasks

| Status | Feature | Notes |
|---|---|---|
| 📋 | Update `PORT-ALLOCATION.md` (schd thực tế 3006/3360-3369, sys mới 3007/3370-3379) | [`PROPOSAL.md`](./PROPOSAL.md) §9 P0 |
| 📋 | Update root `CLAUDE.md` services table | P0 |
| 📋 | Pilot `iam`: chuyển 1-2 setting từ env sang sys + thêm audit cho user.create/login/logout | P3 |
| 📋 | Migrate `aiwm.configuration` → `sys.setting` với dual-read window 1 tuần | P5 |
| 📋 | Xóa module `configuration` khỏi aiwm sau cutover | P5 |
| 📋 | Rollout audit cho aiwm/cbm/mona/noti | P6 |

---

## Future modules (chưa có proposal)

> Khi cần làm 1 trong các module này → tạo proposal riêng `PROPOSAL_<module>.md` + plan riêng.

### 💡 `feature-flag` module

- On/off toggles per global/org/user/group/agent
- Rollout rules (percentage, allowlist, conditional)
- Evaluation API qua lib (cùng pattern setting nhưng có evaluation engine)
- **Trigger để làm**: khi cần A/B test, gradual rollout, kill-switch cho feature mới

### 💡 `license` module

- Migrate logic từ `licenses/` ở root repo
- Customer entitlement management
- License validation + expiry check
- Feature gating dựa trên license tier
- **Trigger để làm**: khi onboard nhiều khách hàng cùng lúc, cần UI quản lý license

### 💡 `lookup` / master-data module

- Country, currency, timezone, locale, language data
- Read-only data, ít thay đổi
- Cache mạnh ở client (TTL 24h)
- **Trigger để làm**: khi 2+ service cần cùng 1 lookup data

### 💡 `secret` module riêng (nếu Level 2 không đủ)

- Tách hẳn khỏi `setting` nếu nhu cầu secret management phức tạp hơn
- Per-secret ACL, rotation policy, expiry
- Có thể proxy tới Vault/AWS Secrets Manager
- **Trigger để làm**: khi cần per-tenant master key, compliance audit

### 💡 `webhook-registry` module

- Outbound webhook subscription per org
- Signature verification, retry policy
- Centralized event routing
- **Trigger để làm**: khi nhiều org muốn nhận event từ nhiều service khác nhau

### 💡 `rate-limit-policy` module

- Quota/limit per org/route, đọc bởi guard ở mỗi service
- Dynamic config qua UI
- **Trigger để làm**: khi cần SLA-based rate limit per tier

### 💡 `maintenance` module

- Flag bật/tắt service hoặc feature toàn hệ thống
- Banner UI, scheduled maintenance window
- **Trigger để làm**: khi cần coordinated maintenance qua nhiều service

---

## Rejected ideas (kèm lý do)

| Feature | Lý do reject |
|---|---|
| Notification trong sys | `noti` service đã có, scope khác hẳn (event-driven, high-throughput) |
| Scheduler trong sys | `schd` service đã có |
| Service registry / health aggregation | `mona` đã đảm nhận |
| Full KMS (envelope encryption + HSM + BYOK) | Quá phức tạp tự build, dùng Vault/AWS KMS làm backend nếu cần |
| Share `SYS_MASTER_KEY` cho tất cả service | Blast radius nhân 7x, vi phạm least privilege, mất audit on read |
| Scope `user`/`group`/`app`/`env` cho setting | Chưa có nhu cầu cụ thể, tránh speculative — User pref nên ở IAM, env config nên qua deploy |

---

## Update log

| Date | Change |
|---|---|
| 2026-05-09 | Initial backlog tạo cùng `PROPOSAL.md` v2 |
