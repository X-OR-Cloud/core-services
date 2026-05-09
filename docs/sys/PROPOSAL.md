# SYS Service — Proposal

> **Status:** Draft v2 — chờ review cuối
> **Author:** AI Agent (theo discussion với @dzung)
> **Date:** 2026-05-09
> **Supersedes:** [`docs/sys/README.md`](./README.md) (sẽ được rewrite sau khi proposal được duyệt)
> **Replaces:** PROPOSAL.md v1

---

## 1. Bối cảnh & vấn đề

Module `configuration` hiện đang nằm trong service `aiwm`, nhưng bản chất nó là **technical infrastructure** — không gắn với business logic của AIWM. Các service khác (iam, cbm, mona, noti, schd) sắp tới đều cần đọc/quản lý config runtime tương tự.

Đặt module ở `aiwm` gây ra:
- **Coupling sai chiều**: service hạ tầng phụ thuộc service business
- **Duplicate logic**: nếu mỗi service tự làm config riêng → drift về behavior, mỗi nơi 1 schema
- **Không có audit trail tập trung**: hiện mỗi service tự ghi audit (hoặc không ghi), khó query cross-service "ai làm gì lúc nào trên toàn hệ thống"
- **Không có chỗ chuẩn để lưu sensitive value**: API key, JWT secret, SMTP password đang phân tán ở env var/k8s secret riêng từng service, không có audit truy cập, khó rotate

→ Tách thành service `sys` riêng, chuyên cung cấp **utility/infrastructure dùng chung** cho toàn bộ core services.

---

## 2. Phạm vi

### 2.1 Trong scope (giai đoạn này)

| Module | Vai trò |
|---|---|
| **`setting`** | Key-value config runtime (cả non-sensitive và sensitive). Migrate từ `aiwm.configuration`. UI quản lý CRUD; service khác đọc qua shared lib (cache + TTL + pub/sub invalidation). Hỗ trợ `sensitive` flag (Level 1 — masking, không encryption) |
| **`audit-log`** | Audit trail tập trung. Service khác ghi qua shared lib (fire-and-forget); UI query/filter cross-service |

### 2.2 Future scope (chừa schema, chưa làm)

- **Encryption at rest cho sensitive setting** (Level 2 KMS-like): schema setting chừa sẵn `encrypted`, `iv`, `authTag`, `keyVersion` để khi cần thêm encryption không phải migrate schema. Master key bootstrap qua `SYS_MASTER_KEY` env, **chỉ tồn tại ở sys process duy nhất**.

### 2.3 Ngoài scope

- ❌ **Full KMS** (envelope encryption, HSM, BYOK): nếu cần Level 3, dùng Vault/AWS KMS làm backend, không tự build
- ❌ **Service registry / health aggregation** — `mona` đã đảm nhận monitoring
- ❌ **Notification** — `noti` service đã có (port 3002)
- ❌ **Scheduler** — `schd` service đã có (port 3006/3360-3369)
- ❌ **Feature flag, license, lookup data** — có thể thêm sau, không làm cùng giai đoạn này

---

## 3. Kiến trúc tổng thể

### 3.1 Service `sys`

| Thuộc tính | Giá trị |
|---|---|
| Port (dev) | **3007** |
| Port (prod) | **3370–3379** |
| Database | `core-sys` (riêng, không share) |
| Modes | `api` (REST cho UI quản trị) + `wrk` (BullMQ audit ingest worker) |
| Stack | NestJS + MongoDB + Redis (BullMQ + pub/sub), giống template |

### 3.2 Pattern truy cập từ service khác — **Hybrid (Phương án C)**

```
┌──────────────────────────────────────────────────────────────────┐
│  Sys Service (sole writer của core-sys)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ REST API     │  │ Pub/sub      │  │ BullMQ worker          │  │
│  │ - /settings  │  │ publisher    │  │ - audit ingest queue   │  │
│  │ - /audits    │  │              │  │                        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│         │                 │                     │                │
│         ↓                 ↓                     ↓                │
│   ┌───────────┐    ┌──────────────┐      ┌────────────┐          │
│   │ Mongo     │    │ Redis        │      │ Mongo      │          │
│   │ settings  │    │ pub/sub      │      │ audit_logs │          │
│   └─────┬─────┘    └──────┬───────┘      └────────────┘          │
└─────────┼─────────────────┼──────────────────────────────────────┘
          │                 │
          │ direct read     │ invalidate event
          │ (NON-sensitive  │ (sys:setting:invalidate,
          │  only)          │  sys:setting:reload-all,
          │                 │  sys:metadata:invalidate)
          ↓                 ↓
┌──────────────────────────────────────────────────────────────────┐
│  Service consumer (iam, cbm, aiwm, ...)                          │
│  ┌──────────────────────────────────────────────────┐            │
│  │  @hydrabyte/sys-client                           │            │
│  │                                                  │            │
│  │  Unified API:  sys.get(key, orgId?)              │            │
│  │  Auto-detect via metadata:                       │            │
│  │   - sensitive=false → Mongo direct + settingCache│            │
│  │   - sensitive=true  → HTTP API + secretCache     │            │
│  │                       (short TTL, audit on read) │            │
│  │                                                  │            │
│  │  sys.audit.log(...) → BullMQ queue (fire&forget) │            │
│  │  @Audit() decorator → AuditInterceptor           │            │
│  └──────────────────────────────────────────────────┘            │
│                                                                  │
│  ENV: INTERNAL_API_KEY (đã có)                                   │
│  KHÔNG CÓ: SYS_MASTER_KEY                                        │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Nguyên tắc

- **Sys là writer duy nhất** với `core-sys`. Service consumer **chỉ đọc**, không bao giờ ghi trực tiếp.
- **Non-sensitive setting**: lib đọc trực tiếp Mongo (read-heavy, low-latency). Update qua sys API → sys publish pub/sub → lib reload.
- **Sensitive setting**: lib **PHẢI** gọi qua HTTP `/settings/internal/secret/:key` (auth qua `INTERNAL_API_KEY` + CIDR allowlist). Sys decrypt (nếu Level 2) rồi trả → lib cache ngắn (TTL ~5 phút). Mỗi lần read → sys ghi audit.
- **Audit-log**: lib **luôn** ghi qua sys (không ghi thẳng Mongo). Lib enqueue vào BullMQ → sys worker batch insert. Fire-and-forget, không block business flow.

### 3.4 Tradeoff đã chấp nhận

| Quyết định | Hệ quả tích cực | Hệ quả tiêu cực (đã chấp nhận) |
|---|---|---|
| Lib đọc thẳng Mongo cho non-sensitive | Latency thấp, không phụ thuộc sys uptime cho read path | Service consumer phải có credential `core-sys`. Đổi schema setting buộc bump lib + sync deploy |
| TTL + pub/sub kết hợp | Defense-in-depth nếu pub/sub miss event | Reload trễ tối đa = TTL window |
| Sensitive đi qua HTTP, không đọc thẳng Mongo | Audit per-read, có thể detect/throttle, master key không spread | +50-100ms latency khi load secret (chấp nhận vì secret hiếm khi đọc — chỉ lúc bootstrap) |
| Audit ghi qua API + queue | Decouple schema, fire-and-forget, không block caller | Audit có thể trễ vài giây so với business event (chấp nhận) |
| `SYS_MASTER_KEY` chỉ ở sys | Blast radius nhỏ (1 process thay vì 7), audit complete, rotate đơn giản | Service consumer không thể decrypt offline → bắt buộc gọi sys |

---

## 4. Module `setting`

### 4.1 Schema

```typescript
@Schema({ timestamps: true, collection: 'settings' })
class Setting extends BaseSchema {
  @Prop({ required: true, enum: Object.values(SettingKey), index: true })
  key!: string;

  @Prop({ default: '' })
  value!: string;                       // plaintext (Level 1) hoặc base64 ciphertext (Level 2)

  @Prop({ required: true, enum: ['global', 'org'], default: 'org', index: true })
  scope!: 'global' | 'org';

  @Prop({ default: false, index: true })
  sensitive!: boolean;                  // Level 1: mask UI, skip getAll(), redact log

  @Prop({ default: false })
  encrypted!: boolean;                  // Level 2 future: value đã được AES-256-GCM

  @Prop()
  iv?: string;                          // Level 2: base64 12 bytes

  @Prop()
  authTag?: string;                     // Level 2: base64 GCM auth tag

  @Prop({ default: 1 })
  keyVersion?: number;                  // Level 2: master key version dùng để encrypt

  @Prop()
  notes?: string;

  // BaseSchema: owner.orgId, createdBy, updatedBy, deletedAt, timestamps
}
```

**Indexes:**
- `{ key: 1, scope: 1, 'owner.orgId': 1 }` unique (`unique_key_per_scope_org`)
- `{ key: 1 }`
- `{ deletedAt: 1 }`

**Lookup priority** (giữ nguyên logic hiện tại): **org-specific → global → hardcoded default**.

### 4.2 Scope semantic

| Scope | Ai có quyền set | Áp dụng cho ai | Ví dụ key |
|---|---|---|---|
| `global` | `universe.owner` (super admin platform) | Toàn hệ thống (default cho mọi org) | `system.timezone`, `email.smtp.host`, `feature.maintenance_mode`, `aiwm.default_model` |
| `org` | `organization.owner` (admin của 1 org) | Chỉ org đó | `aiwm.max_concurrent_jobs` (org A=10, B=50), `noti.email.from_address`, `cbm.document_retention_days` |

**Lookup**: Service code luôn truyền `orgId`, lib tự xử lý fallback:
1. Tìm key với `scope='org' && owner.orgId=ctx.orgId`
2. Fallback `scope='global'`
3. Fallback hardcoded default từ `getOrDefault(key, orgId, default)`

### 4.3 Metadata

```typescript
interface SettingKeyMetadata {
  key: SettingKey;
  description: string;
  dataType: 'string' | 'number' | 'boolean' | 'url' | 'email';
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: string[];
  };
  defaultValue?: any;
  
  // Mới — security
  sensitive?: boolean;                // default false. Bật → mask UI, skip getAll, redact log
  
  // Mới — caching
  cacheTtlSec?: number;               // default 300 (5 phút) cho setting, 300 cho secret
  staleTtlSec?: number;               // default 60 — stale-while-revalidate window
}
```

Anh đã có sẵn `CONFIG_METADATA` trong AIWM, em sẽ migrate + thêm các field mới.

### 4.4 REST API

#### Public (UI hoặc public consumption)

```
GET    /settings/metadata                       # public, list all metadata
GET    /settings/metadata/:key                  # public, single key metadata
```

#### UI quản trị (JWT auth)

```
GET    /settings                                # list, paginated, filter scope/key
GET    /settings/:key                           # detail (org→global fallback). Sensitive → trả ***
POST   /settings                                # create or update
PATCH  /settings/:key
DELETE /settings/:key                           # soft delete
POST   /settings/initialize                     # bulk seed missing keys
POST   /settings/:key/reveal                    # universe.owner only — trả plaintext sensitive value (audit)
```

#### Internal (service-to-service)

```
GET    /settings/internal/:key                  # non-sensitive read fallback (lib thường đọc Mongo trực tiếp)
GET    /settings/internal/secret/:key           # sensitive read — bắt buộc qua đây, audit per-read
POST   /settings/internal/reload-pubsub         # debug, force re-publish invalidate
```

**Auth chain cho `/settings/internal/*`** (xem chi tiết Section 7):
1. `CidrAllowlistGuard`
2. `InternalApiKeyGuard`
3. `RateLimitGuard` (riêng cho secret endpoint)

### 4.5 RBAC (giữ tương đồng với AIWM hiện tại)

| Action | universe.owner | organization.owner | other |
|---|---|---|---|
| `GET /settings` (list) | ✅ all | ✅ chỉ scope=org của mình + global | ❌ |
| `GET /settings/:key` (detail, sensitive=false) | ✅ | ✅ org của mình | ❌ |
| `GET /settings/:key` (detail, sensitive=true) | ✅ trả plaintext | ✅ trả `***` mask | ❌ |
| `POST /settings/:key/reveal` (sensitive plaintext) | ✅ + audit | ❌ | ❌ |
| `POST/PATCH/DELETE` (scope=org) | ✅ | ✅ org của mình | ❌ |
| `POST/PATCH/DELETE` (scope=global) | ✅ | ❌ | ❌ |
| `POST /settings/initialize scope=global` | ✅ | ❌ | ❌ |
| `POST /settings/initialize scope=org` | ✅ (any org) | ✅ org của mình | ❌ |

### 4.6 Pub/sub publishing

Khi `createOrUpdate / updateByKey / deleteByKey`:
```typescript
await this.redisPub.publish('sys:setting:invalidate', JSON.stringify({
  key,
  scope,
  orgId: scope === 'org' ? orgId : null,
  sensitive: setting.sensitive,
  updatedAt: new Date().toISOString(),  // dùng cho lib đo pubsub_lag
}));
```

Khi metadata thay đổi (rare, deploy-time):
```typescript
await this.redisPub.publish('sys:metadata:invalidate', JSON.stringify({
  reason: 'metadata-updated',
  updatedAt: new Date().toISOString(),
}));
```

---

## 5. Module `audit-log`

### 5.1 Schema

```typescript
@Schema({ timestamps: true, collection: 'audit_logs' })
class AuditLog extends BaseSchema {
  // What
  @Prop({ required: true, index: true })
  service!: string;                    // 'iam' | 'aiwm' | 'cbm' | 'sys' | ...

  @Prop({ required: true, index: true })
  resource!: string;                   // 'user' | 'agent' | 'document' | 'setting' | 'secret' | ...

  @Prop()
  resourceId?: string;                 // ID của entity bị tác động

  @Prop({ required: true, index: true })
  action!: string;                     // 'create' | 'update' | 'delete' | 'login' | 'read' | 'access_denied' | ...

  // Filter helper — phân biệt setting vs secret read trong audit query
  @Prop({ enum: ['setting', 'sensitive_setting', null], default: null })
  keyType?: 'setting' | 'sensitive_setting' | null;

  // Who
  @Prop({ type: Object, required: true })
  actor!: {
    userId?: string;
    orgId: string;                     // hoặc 'system' cho cron/internal
    agentId?: string;
    appId?: string;
    ipAddress?: string;
    userAgent?: string;
  };

  // Diff
  @Prop({ type: Object })
  before?: Record<string, any>;        // state trước (cho update/delete), sanitized + truncated

  @Prop({ type: Object })
  after?: Record<string, any>;         // state sau (cho create/update), sanitized + truncated

  // Request context
  @Prop({ type: Object })
  requestPayload?: Record<string, any>;     // sanitized + truncated

  @Prop({ type: Object })
  responseSummary?: {                       // KHÔNG full response
    id?: string;
    status?: number;
    size?: number;
  };

  // Result
  @Prop({ required: true, enum: ['success', 'failure'], index: true })
  result!: 'success' | 'failure';

  @Prop()
  errorMessage?: string;

  @Prop()
  errorCode?: string;

  // Tracing
  @Prop({ index: true })
  correlationId?: string;

  @Prop({ required: true, index: true })
  occurredAt!: Date;

  @Prop()
  durationMs?: number;
}
```

**Indexes:**
- `{ 'actor.orgId': 1, occurredAt: -1 }` — query theo org + time (use case chính)
- `{ service: 1, resource: 1, action: 1, occurredAt: -1 }` — filter theo loại event
- `{ 'actor.userId': 1, occurredAt: -1 }` — "user X đã làm gì"
- `{ correlationId: 1 }` — trace 1 request flow
- `{ keyType: 1, occurredAt: -1 }` partial index (only when keyType != null) — secret access query

### 5.2 Sanitization rules

#### a) Sensitive field stripping

```typescript
const SENSITIVE_FIELDS = [
  'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
  'secret', 'apiKey', 'creditCard', 'ssn', 'privateKey', 'authorization',
];
```

→ Field name match (case-insensitive) trong `requestPayload`, `before`, `after` → replace value bằng `'<redacted>'`.

Configurable qua setting `sys.audit.sensitive_fields` (extra field tên có thể thêm runtime).

#### b) Length truncation (anh đã yêu cầu)

```typescript
const TRUNCATE_THRESHOLD = 1024;       // 1KB per field
const TRUNCATE_KEEP = 256;             // giữ 256 chars đầu

function truncateField(value: any): any {
  if (typeof value === 'string' && value.length > TRUNCATE_THRESHOLD) {
    return {
      __truncated: true,
      preview: value.slice(0, TRUNCATE_KEEP),
      originalLength: value.length,
      originalType: 'string',
    };
  }
  if (Buffer.isBuffer(value) && value.length > TRUNCATE_THRESHOLD) {
    return {
      __truncated: true,
      originalLength: value.length,
      originalType: 'buffer',
    };
  }
  const json = JSON.stringify(value);
  if (json && json.length > TRUNCATE_THRESHOLD) {
    return {
      __truncated: true,
      preview: json.slice(0, TRUNCATE_KEEP),
      originalLength: json.length,
      originalType: 'json',
    };
  }
  return value;
}
```

#### c) Total payload size cap

Sau khi sanitize từng field, nếu tổng `requestPayload` JSON > 4KB → toàn bộ bị thay bằng:
```json
{ "__truncated": true, "originalLength": 8421, "summary": "<top-level keys: email, name, role>" }
```

Tránh case payload có 1000 field nhỏ → bypass per-field limit.

Tất cả threshold configurable qua setting:
- `sys.audit.truncate_field_threshold_bytes` (default 1024)
- `sys.audit.truncate_field_keep_bytes` (default 256)
- `sys.audit.truncate_total_threshold_bytes` (default 4096)

### 5.3 REST API

#### UI quản trị (JWT auth)

```
GET    /audit-logs                          # search, filter, paginated
GET    /audit-logs/:id
GET    /audit-logs/stats                    # aggregate count theo service/action/time
```

#### Internal (service-to-service)

```
POST   /audit-logs/internal                 # batch ingest (alternative cho BullMQ direct)
```

`/audit-logs/internal/*` cũng được bảo vệ bởi `CidrAllowlistGuard` + `InternalApiKeyGuard`.

### 5.4 Ingest flow (BullMQ)

```
Lib (consumer)              Redis Queue                Sys Worker (mode=wrk)
────────────────            ─────────────              ──────────────────────
audit.log({...})    →       sys-audit-ingest    →     batch consume (50/100ms)
                            (BullMQ)                   →  Mongo insertMany
```

- **Fire-and-forget**: `audit.log()` push job, không await Mongo
- **Batching**: worker consume 50 events hoặc 100ms timeout (tùy đầu nào tới trước) → 1 `insertMany`
- **Fallback nếu Redis down**: log ra stdout với marker `AUDIT_FALLBACK` + payload đầy đủ → có thể recover thủ công từ container log

### 5.5 Retention

**Giai đoạn này không làm retention** — giữ tất cả audit log. Khi volume tăng đến mức cần policy → đưa vào release sau (xem [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md)).

Lý do:
- Volume audit ban đầu chưa lớn (1 service ghi qua decorator)
- Storage Mongo còn rộng, chưa cần ép xóa
- Tránh xóa nhầm khi đang debug/onboard — giữ data lâu giúp bug investigation

Khi cần làm: thêm cron daily worker + setting `sys.audit.retention_days` + optional archive sang S3/GCS trước khi xóa.

---

## 6. Lib `@hydrabyte/sys-client`

### 6.1 Distribution

- Build trong monorepo: `libs/sys-client/`
- Export: `@hydrabyte/sys-client`
- Consistent với `@hydrabyte/base`, `@hydrabyte/shared`

### 6.2 Unified API

```typescript
@Injectable()
export class SysSettingClient {
  // Bootstrap: load metadata, warm cache
  async onModuleInit(): Promise<void>;

  // ─── Read ──────────────────────────────────────────────────────────
  
  // Auto-detect sensitive qua metadata, route nội bộ
  get<T = string>(key: string, orgId?: string): Promise<T | null>;
  getOrDefault<T>(key: string, orgId: string | undefined, defaultValue: T): Promise<T>;
  
  // Type-safe shortcuts (cùng auto-detect logic)
  getString(key: string, orgId?: string): Promise<string | null>;
  getNumber(key: string, orgId?: string): Promise<number | null>;
  getBoolean(key: string, orgId?: string): Promise<boolean | null>;
  
  // List API — ALWAYS skips sensitive keys (safety guard #2)
  getAll(orgId?: string): Promise<Record<string, any>>;

  has(key: string, orgId?: string): Promise<boolean>;

  // ─── Cache control ────────────────────────────────────────────────
  
  reloadKey(key: string): Promise<void>;
  reloadAll(): Promise<void>;
  
  // Debug — masked output for sensitive (safety guard #5)
  getCacheStats(): {
    settingCacheSize: number;
    secretCacheSize: number;
    cacheInitialized: boolean;
    metadataLoaded: boolean;
    pubsubConnected: boolean;
    lastPubsubEventAt?: string;
    reloadCounts: { pubsub: number; ttl: number; stale: number; init: number; manual: number };
    keys: Array<{ key: string; sensitive: boolean; cachedAt?: string }>;  // KHÔNG có value
  };
}

@Injectable()
export class SysAuditClient {
  // Fire-and-forget — push BullMQ
  log(event: AuditLogInput): void;     // synchronous return, async behind
  
  // Batch (cho high-throughput case)
  logBatch(events: AuditLogInput[]): void;
}
```

### 6.3 Routing logic của `get()`

```typescript
async get<T>(key: string, orgId?: string): Promise<T | null> {
  if (!this.metadataLoaded) await this.loadMetadata();
  
  const meta = this.metadata[key];
  
  if (meta?.sensitive) {
    return this._getSensitive<T>(key, orgId, meta);
  }
  return this._getSetting<T>(key, orgId, meta);
}

private async _getSetting<T>(key, orgId, meta) {
  // 1. Check settingCache (TTL + stale-while-revalidate)
  // 2. Cache miss → Mongo direct read
  // 3. Cache stale → return stale + trigger background refresh
  // Pub/sub subscriber update settingCache khi sys publish invalidate
}

private async _getSensitive<T>(key, orgId, meta) {
  // 1. Check secretCache (shorter TTL, no stale-while-revalidate — always fresh)
  // 2. Cache miss → HTTP GET /settings/internal/secret/:key
  //    Headers: { 'X-Internal-API-Key': process.env.INTERNAL_API_KEY }
  // 3. Sys side: ghi audit { resource: 'secret', action: 'read', actor: caller, keyType: 'sensitive_setting' }
  // 4. Cache plaintext trong secretCache (TTL 5 phút, configurable per-key)
  // KHÔNG dùng stale-while-revalidate cho secret — nếu rotate, phải fresh ngay sau TTL
}
```

### 6.4 5 Safety Guards (NON-NEGOTIABLE)

| # | Guard | Implementation |
|---|---|---|
| 1 | **2 cache store riêng** | `private settingCache: Map`, `private secretCache: Map`. Không bao giờ mix. |
| 2 | **`getAll()` skip sensitive** | `Object.entries(...).filter(([k]) => !this.metadata[k]?.sensitive)`. Test case bắt buộc. |
| 3 | **Logging hook redact** | Wrapper `redactValue(key, value)`: nếu `metadata[key]?.sensitive` → trả `'<redacted>'`. Áp dụng cho tất cả `logger.debug/info/error` trong lib. |
| 4 | **Metrics no-value labels** | Prometheus labels chỉ dùng `key`, `source`, `trigger`, KHÔNG có label chứa value. |
| 5 | **`getCacheStats()` mask sensitive** | Output không chứa value. Sensitive entries: chỉ hiển thị `key` + `cachedAt`, không expose `<has_value>` để tránh oracle attack. |

→ PR review checklist phải có 5 điểm này. CI test phải verify (vd test case: `sys.getAll()` không trả key có `sensitive=true`).

### 6.5 Cache strategy

| Loại | Store | Default TTL | Stale-while-revalidate | Invalidation |
|---|---|---|---|---|
| Non-sensitive setting | `settingCache` | 300s | ✅ window 60s | Pub/sub `sys:setting:invalidate` + TTL fallback |
| Sensitive setting | `secretCache` | 300s (override per-key) | ❌ (always fresh after TTL) | Pub/sub `sys:setting:invalidate` + TTL fallback |
| Metadata | `metadataCache` | ∞ (cho đến khi pub/sub invalidate) | N/A | Pub/sub `sys:metadata:invalidate` + manual `reloadMetadata()` |

### 6.6 Audit decorator + interceptor

```typescript
// libs/sys-client/src/decorators/audit.decorator.ts
export const Audit = (config: AuditConfig) => SetMetadata('audit', config);

// libs/sys-client/src/interceptors/audit.interceptor.ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: SysAuditClient,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const config = this.reflector.get<AuditConfig>('audit', ctx.getHandler());
    if (!config) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    const baseEvent = {
      service: process.env.SERVICE_NAME,
      resource: config.resource,
      action: config.action,
      actor: this.extractActor(req),
      requestPayload: this.sanitize(req.body),
      correlationId: req.correlationId,
      occurredAt: new Date(),
    };

    return next.handle().pipe(
      tap((response) => {
        this.audit.log({
          ...baseEvent,
          resourceId: response?.id ?? response?._id?.toString(),
          responseSummary: { status: 200, size: JSON.stringify(response).length },
          result: 'success',
          durationMs: Date.now() - start,
        });
      }),
      catchError((err) => {
        this.audit.log({
          ...baseEvent,
          result: 'failure',
          errorMessage: err.message,
          errorCode: err.code ?? err.status?.toString(),
          durationMs: Date.now() - start,
        });
        return throwError(() => err);
      }),
    );
  }
}
```

**Sử dụng:**
```typescript
// Cách 1 — Decorator (80% use case, controller-based CRUD)
@Controller('users')
@UseInterceptors(AuditInterceptor)
export class UserController {
  @Post()
  @Audit({ resource: 'user', action: 'create' })
  async createUser(@Body() dto, @CurrentUser() ctx) { ... }

  @Patch(':id')
  @Audit({ resource: 'user', action: 'update', captureBefore: true })
  async updateUser(@Param('id') id, @Body() dto, @CurrentUser() ctx) { ... }
}

// Cách 2 — Explicit (service-layer, complex logic, conditional)
@Injectable()
class WebhookService {
  constructor(private readonly audit: SysAuditClient) {}

  async processWebhook(payload) {
    const result = await this.handle(payload);
    this.audit.log({
      service: 'iam',
      resource: 'webhook',
      action: 'process',
      actor: { orgId: 'system' },
      requestPayload: payload,
      result: result.success ? 'success' : 'failure',
    });
  }
}
```

### 6.7 Module setup

```typescript
// Trong AppModule của mỗi service consumer
@Module({
  imports: [
    SysClientModule.forRoot({
      sysApiUrl: process.env.SYS_API_URL,           // http://sys:3007
      internalApiKey: process.env.INTERNAL_API_KEY,
      serviceName: process.env.SERVICE_NAME ?? 'iam',
      metricsEnabled: process.env.SYS_CLIENT_METRICS_ENABLED === 'true',
      auditEnabled: process.env.SYS_CLIENT_AUDIT_ENABLED !== 'false',
    }),
  ],
})
export class AppModule {}
```

---

## 7. Security — Internal endpoints hardening

### 7.1 Layered guards

Mọi endpoint `/settings/internal/*` và `/audit-logs/internal/*` đi qua chain (fail fast → expensive last):

```
Request
   ↓
[1] CidrAllowlistGuard           ← in-memory check, ~0.01ms
   ↓
[2] InternalApiKeyGuard          ← header compare, ~0.01ms
   ↓
[3] RateLimitGuard               ← Redis check, ~1ms (chỉ áp dụng cho secret endpoint)
   ↓
Handler
```

3 lớp độc lập — bypass 1 lớp vẫn còn 2 lớp khác.

### 7.2 CidrAllowlistGuard

**Configuration** — qua env var, không qua DB (chicken-and-egg):
```bash
# Production K8s pod network của hệ thống
SYS_INTERNAL_CIDR_ALLOWLIST=10.10.0.0/16,127.0.0.1/32,::1/128

# Dev local (Docker compose hoặc bare metal)
SYS_INTERNAL_CIDR_ALLOWLIST=127.0.0.1/32,::1/128,172.16.0.0/12
```

**Behavior:**
- Hỗ trợ cả IPv4 + IPv6 CIDR
- Allowlist trống → **refuse all** + log error (fail-secure)
- Mỗi reject → ghi audit `{ resource: 'internal_endpoint', action: 'access_denied', actor.ipAddress, errorMessage: 'Source IP not in allowlist' }`

**Library:** `ip-range-check` hoặc `ipaddr.js`.

**Trust proxy bắt buộc đúng:**
```typescript
// services/sys/src/main.ts
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
// hoặc explicit IP/CIDR của LB layer
```
Sai config → attacker có thể fake `X-Forwarded-For` để bypass. Document rõ trong deployment guide.

### 7.3 InternalApiKeyGuard

- Check header `X-Internal-API-Key` match `process.env.INTERNAL_API_KEY`
- Constant-time compare (tránh timing attack)
- Reject → audit `access_denied`

### 7.4 RateLimitGuard (chỉ cho secret endpoint)

- Riêng `GET /settings/internal/secret/:key`: rate limit per `IP + key`
- Default: **10 reads / minute** (configurable qua `sys.security.secret_read_rate_limit`)
- Vượt ngưỡng → 429 + audit
- Lý do: bình thường service load secret 1 lần khi start, không cần đọc nhiều. Vượt ngưỡng → signal recon hoặc bug loop.

### 7.5 Master key (Level 2 future, chừa schema P1)

- `SYS_MASTER_KEY` env var (base64 32 bytes), **chỉ load ở sys process**
- Service consumer KHÔNG có env var này
- Encrypt: AES-256-GCM với random IV per write
- Schema setting đã có sẵn `iv`, `authTag`, `keyVersion` field
- Rotation flow: hỗ trợ 2 master key đồng thời (`SYS_MASTER_KEY` + `SYS_MASTER_KEY_OLD`), endpoint `POST /settings/rotate-master` decrypt all với old → encrypt với new → tăng `keyVersion`

→ **Giai đoạn này (P1) chỉ làm Level 1 (sensitive flag, masking). Schema chừa sẵn cho Level 2 — không phải migrate khi nâng cấp.**

---

## 8. Observability

### 8.1 Prometheus metrics (lib expose `/metrics`)

Bật qua `SYS_CLIENT_METRICS_ENABLED=true`. Format:

| Metric | Type | Labels | Mục đích |
|---|---|---|---|
| `sys_cache_hit_total` | counter | `key, source=memory\|stale\|miss` | Tỉ lệ hit/miss/stale |
| `sys_cache_reload_total` | counter | `key, trigger=pubsub\|ttl\|stale\|init\|manual` | **Quan trọng**: nếu `ttl` >> `pubsub` → pub/sub đang miss event |
| `sys_cache_reload_duration_seconds` | histogram | `key` | Slow reload detection |
| `sys_pubsub_lag_seconds` | histogram | `channel` | Latency từ DB write → service nhận event (dùng `updatedAt` payload) |
| `sys_pubsub_disconnect_total` | counter | — | Đếm Redis disconnect |
| `sys_setting_get_duration_seconds` | histogram | `key, type=setting\|secret` | Latency người gọi cảm nhận |
| `sys_secret_fetch_total` | counter | `key, result=success\|denied\|error` | Volume secret read |
| `sys_audit_enqueue_total` | counter | `service, action, result` | Volume audit |
| `sys_audit_enqueue_failed_total` | counter | `reason=redis_down\|queue_full` | Audit fallback monitoring |

> ⚠️ **Safety guard #4**: KHÔNG có label nào chứa value. Label `key` OK (key name không phải secret), value KHÔNG.

### 8.2 Structured logs

JSON format ở các sự kiện đáng chú ý:
- Pub/sub disconnect/reconnect
- TTL reload trả về value khác cache cũ → flag `pubsub_missed=true`, log `key + delta` (KHÔNG log value)
- Stale-while-revalidate trigger → log key + count
- Audit fallback (Redis down) → log toàn bộ audit payload (đã sanitize) ra stdout marker `AUDIT_FALLBACK`
- CIDR/API key reject → log với `ip, path, userAgent`

> ⚠️ **Safety guard #3**: log helper `redactValue(key, value)` luôn được dùng cho mọi value sensitive.

### 8.3 Debug endpoint

Mỗi service consumer expose `/sys-client/stats` (gated bởi `DEBUG=true` hoặc `INTERNAL_API_KEY`):

```json
{
  "settingCacheSize": 124,
  "secretCacheSize": 5,
  "cacheInitialized": true,
  "metadataLoaded": true,
  "pubsubConnected": true,
  "lastPubsubEventAt": "2026-05-09T10:23:14Z",
  "ttlConfig": { "settingDefault": 300, "secretDefault": 300, "stale": 60 },
  "reloadCounts": { "pubsub": 45, "ttl": 3, "stale": 1, "init": 1, "manual": 0 },
  "keys": [
    { "key": "system.timezone", "sensitive": false, "cachedAt": "..." },
    { "key": "openai.api_key", "sensitive": true, "cachedAt": "..." }
    // KHÔNG có value field
  ]
}
```

### 8.4 Alert thresholds (gợi ý cho mona setup sau)

| Metric | Ngưỡng | Action |
|---|---|---|
| `pubsub_missed_ratio > 1%` trong 1h | Pub/sub có vấn đề | Investigate Redis hoặc giảm TTL |
| `cache_hit_ratio < 80%` | TTL có thể quá ngắn | Cân nhắc tăng |
| `setting_get_p99 > 50ms` | Cache không hoạt động đúng | Check |
| `audit_enqueue_failed_ratio > 0.1%` trong 5 phút | Redis có vấn đề | Page oncall |
| `secret_fetch denied count > 10/phút` | Possible attack hoặc misconfig | Investigate |
| `internal_endpoint access_denied > 5/phút` | Possible recon | Alert security |

---

## 9. Migration plan

| Phase | Scope | Verify |
|---|---|---|
| **P0** | Build skeleton service `sys` (port 3007) + `core-sys` DB + health check + skeleton 2 module + cập nhật `PORT-ALLOCATION.md`, root `CLAUDE.md` | `nx run sys:api`, `/health` OK, swagger `/api-docs` hiển thị |
| **P1** | Module `setting` đầy đủ: schema (Level 1 + chừa Level 2), RBAC, REST API, pub/sub publisher, `CidrAllowlistGuard` + `InternalApiKeyGuard` + `RateLimitGuard`, lib `@hydrabyte/sys-client` (cache + TTL + pub/sub subscriber + 5 safety guards + metrics) | UI CRUD setting hoạt động; pilot service (template hoặc iam-test) đọc 1 sensitive + 1 non-sensitive setting qua lib; `/sys-client/stats` cho thấy đúng routing; CI test verify 5 safety guards |
| **P2** | Module `audit-log`: schema, REST API, BullMQ ingest worker (mode=wrk), retention cron, sanitize + truncate; lib `SysAuditClient` (fire-and-forget) + `@Audit()` decorator + `AuditInterceptor` | 1 service ghi audit qua decorator + explicit, query được từ UI sys; verify sanitize bỏ password/token; verify truncate giữ originalLength |
| **P3** | **Pilot `iam`**: chuyển 1-2 setting đang đọc từ env (vd JWT TTL, password policy) sang sys; thêm audit cho `user.create/login/logout` qua decorator | iam restart vẫn hoạt động bình thường, không breaking; audit log hiển thị đúng cross-service từ UI sys |
| **P4** | Soak 1-2 tuần ở prod, theo dõi metrics: cache hit rate, pubsub miss rate, audit volume | Không có data drift, latency ổn, alert chưa fire bất ngờ |
| **P5** | Migrate `aiwm.configuration` → `sys.setting`. Dual-read window 1 tuần (lib fallback đọc `core_aiwm.configurations` nếu key chưa có ở `core-sys`), sau đó cutover; xóa module `configuration` khỏi aiwm | aiwm không downtime, config không mất; aiwm code gọn hơn |
| **P6** | (sau khi P5 ổn) Thêm audit cho aiwm/cbm/mona/noti những action quan trọng | Cross-service audit query hoạt động |
| **P7+ (future)** | Level 2 encryption, master key bootstrap, rotation flow — khi có nhu cầu cụ thể (vd lưu OpenAI API key, SMTP password vào sys) | Schema không cần migrate; thêm encrypt/decrypt service + 1 endpoint rotation |

---

## 10. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Tên service: **`sys`**. Port **3007** dev, **3370–3379** prod. DB: **`core-sys`** |
| 2 | Module trong scope giai đoạn này: **`setting`** + **`audit-log`** |
| 3 | Tên module thay cho `configuration`: **`setting`** |
| 4 | Pattern truy cập: **Phương án C** — lib đọc Mongo cho non-sensitive, qua HTTP cho sensitive; pub/sub + TTL hybrid invalidation |
| 5 | Setting có 3 cấp: Level 1 (`sensitive` masking) trong P1; Level 2 (encryption) chừa schema, future P7+; Level 3 (full KMS) → dùng Vault/AWS KMS, không tự build |
| 6 | Scope giữ **`global`** + **`org`** (không speculative thêm `user`/`group`/`app`) |
| 7 | TTL default: **300s** + staleTtl 60s, override per-key qua metadata |
| 8 | Audit schema tách `resource` + `action` + `resourceId`; có `before/after`, `requestPayload (sanitized + truncated)`, `responseSummary`, `errorCode`, `correlationId`, `occurredAt`, `durationMs`, `keyType` |
| 9 | Sanitize: `SENSITIVE_FIELDS` strip + truncate per-field 1KB (giữ 256) + total cap 4KB. Threshold configurable qua setting |
| 10 | Lib API **hợp nhất `get()`** — auto-detect sensitive qua metadata, không có `getSecret()` riêng |
| 11 | **5 Safety Guards NON-NEGOTIABLE**: 2 cache store, getAll skip sensitive, log redact, metrics no-value, stats mask |
| 12 | Lib audit có cả **`@Audit()` decorator + `AuditInterceptor`** + explicit `audit.log()` cho service-layer |
| 13 | **`SYS_MASTER_KEY` chỉ ở sys**, KHÔNG share. Service consumer dùng `INTERNAL_API_KEY` qua HTTP cho secret |
| 14 | Internal endpoints layered guard: **CIDR → InternalApiKey → RateLimit** |
| 15 | CIDR allowlist qua env `SYS_INTERNAL_CIDR_ALLOWLIST`, fail-secure khi trống. Trust proxy bắt buộc config đúng |
| 16 | Reject events ghi audit `action: 'access_denied'` |
| 17 | Rate limit secret read 10/min/(IP+key), configurable |
| 18 | Audit ingest qua **BullMQ fire-and-forget**, batch 50/100ms ở sys worker |
| 19 | Audit retention chưa làm giai đoạn này — đưa vào [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md) |
| 20 | Pilot service P3: **`iam`**. Migrate `aiwm` cuối cùng (P5) sau khi soak ổn |
| 21 | Observability bật từ P1: Prometheus metrics + structured log + debug endpoint, không bolt-on sau |
| 22 | Lib distribute trong monorepo: `libs/sys-client/`, export `@hydrabyte/sys-client` |

---

## 11. Open questions — đã resolve

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Audit retention | Chưa làm — đưa vào [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md) |
| 2 | PII partial mask | Chưa làm — đưa vào [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md) |
| 3 | Step-up auth cho `/settings/:key/reveal` | JWT thường là đủ |
| 4 | K8s pod CIDR prod | `10.10.0.0/16` — bake vào deployment guide |
| 5 | System orgId convention | Dùng chuỗi `'system'` |

---

## 12. Reference

- Module hiện tại sẽ migrate: [`services/aiwm/src/modules/configuration/`](../../services/aiwm/src/modules/configuration/)
- Proposal cũ cho aiwm.configuration: [`docs/aiwm/configuration-management-proposal-v2.md`](../aiwm/configuration-management-proposal-v2.md)
- Template service làm reference cho structure mới: [`services/template/`](../../services/template/)
- BaseSchema, BaseService: [`libs/base/`](../../libs/base/)
- Existing services: [`services/iam/CLAUDE.md`](../../services/iam/CLAUDE.md), [`services/aiwm/CLAUDE.md`](../../services/aiwm/CLAUDE.md), [`services/schd/CLAUDE.md`](../../services/schd/CLAUDE.md)
