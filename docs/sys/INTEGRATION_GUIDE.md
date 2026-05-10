# SYS Client Integration Guide

> Hướng dẫn tích hợp `@hydrabyte/sys-client` vào service consumer để: (1) đọc runtime settings từ sys (cả non-sensitive lẫn sensitive); (2) ghi audit-log tập trung (decorator hoặc explicit).
>
> **Reference implementation**: [`services/iam/`](../../services/iam/) — pilot trong P3 ([`PLAN_v1.md`](./PLAN_v1.md)).

---

## Mục lục

1. [Quick start (3 bước)](#1-quick-start-3-bước)
2. [Phần 1 — Cài đặt module](#2-phần-1--cài-đặt-module)
3. [Phần 2 — Đọc settings](#3-phần-2--đọc-settings)
4. [Phần 3 — Ghi audit-log](#4-phần-3--ghi-audit-log)
5. [Phần 4 — Best practices & gotchas](#5-phần-4--best-practices--gotchas)
6. [Phần 5 — Thêm setting key mới](#6-phần-5--thêm-setting-key-mới)
7. [Phần 6 — Troubleshooting](#7-phần-6--troubleshooting)

---

## 1. Quick start (3 bước)

### Bước 1 — Wire module

```typescript
// services/<your-service>/src/app.module.ts
import { SysClientModule } from '@hydrabyte/sys-client';

@Module({
  imports: [
    SysClientModule.forRoot({
      sysApiUrl: process.env['SYS_API_URL'] || 'http://localhost:3007',
      internalApiKey: process.env['INTERNAL_API_KEY'] || '',
      serviceName: 'your-service-name',
      mongoUri: process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      redisUrl: process.env['REDIS_URL'],
      redisHost: process.env['REDIS_HOST'],
      redisPort: process.env['REDIS_PORT'] ? parseInt(process.env['REDIS_PORT'], 10) : undefined,
      redisUsername: process.env['REDIS_USERNAME'],
      redisPassword: process.env['REDIS_PASSWORD'],
      metricsEnabled: process.env['SYS_CLIENT_METRICS_ENABLED'] === 'true',
    }),
    // ... your other modules
  ],
})
export class AppModule {}
```

### Bước 2 — Đọc setting (đâu đó trong service)

```typescript
import { SysSettingClient } from '@hydrabyte/sys-client';
import { ConfigKey } from '@hydrabyte/shared';

@Injectable()
export class MyService {
  constructor(private readonly sys: SysSettingClient) {}

  async doSomething(orgId: string) {
    // Auto-detect sensitive vs non-sensitive — caller doesn't need to care
    const limit = await this.sys.getOrDefault(ConfigKey.AIWM_BASE_API_URL, orgId, 'http://localhost:3003');
    const apiKey = await this.sys.getString(ConfigKey.OPENAI_API_KEY, orgId); // sensitive — fetched via HTTP
    // ... use values
  }
}
```

### Bước 3 — Audit cho controller

```typescript
import { Audit, AuditInterceptor } from '@hydrabyte/sys-client';

@Controller('users')
@UseInterceptors(AuditInterceptor)
export class UsersController {
  @Post()
  @Audit({ resource: 'user', action: 'create' })
  async createUser(@Body() dto, @CurrentUser() ctx) { /* ... */ }
}
```

Đó. Bây giờ chi tiết từng phần.

---

## 2. Phần 1 — Cài đặt module

### 2.1 Env vars cần thiết

| Var | Bắt buộc? | Dùng cho | Ví dụ |
|---|---|---|---|
| `SYS_API_URL` | Có | Lib gọi sys cho metadata + sensitive read | `http://sys:3007` (prod) hoặc `http://localhost:3007` |
| `INTERNAL_API_KEY` | Có | Header `X-Internal-API-Key` khi gọi `/settings/internal/*` | Random 32 bytes shared với sys |
| `MONGODB_URI` | Có | Lib đọc `core-sys.settings` trực tiếp cho non-sensitive | `mongodb://10.10.0.100:27017` |
| `REDIS_URL` (hoặc `REDIS_HOST/PORT/USERNAME/PASSWORD`) | Có | Pub/sub invalidation + BullMQ audit-ingest | `redis://10.10.0.100:6379` |
| `SYS_CLIENT_METRICS_ENABLED` | Tùy | Bật Prometheus metrics expose | `true` / `false` (default) |

> ⚠️ `SYS_API_URL` và `INTERNAL_API_KEY` **bắt buộc khớp** với cấu hình sys, nếu sai → lib gọi `/settings/metadata` fail → fallback sang env defaults (lib không crash).

### 2.2 forRoot options đầy đủ

```typescript
SysClientModule.forRoot({
  // Required
  sysApiUrl: 'http://sys:3007',
  internalApiKey: 'random-key-shared-with-sys',
  serviceName: 'iam',                    // Audit `service` field + metrics labels
  mongoUri: 'mongodb://...',

  // Redis (must set at least one form)
  redisUrl: 'redis://...',               // Preferred
  // OR:
  redisHost: 'localhost',
  redisPort: 6379,
  redisUsername: '',
  redisPassword: '',

  // Optional
  mongoDbName: 'core-sys',               // Default 'core-sys'
  defaultCacheTtlSec: 300,               // 5 min
  defaultStaleTtlSec: 60,                // stale-while-revalidate window
  defaultSecretCacheTtlSec: 300,
  metricsEnabled: false,
  disabled: false,                       // Bật để no-op toàn bộ (test mode)
  auditDisabled: false,                  // Bật để no-op SysAuditClient riêng
});
```

### 2.3 Module là **global** — không cần import lại trong submodules

`SysClientModule.forRoot()` register với `global: true`. Bạn có thể inject `SysSettingClient` / `SysAuditClient` / `AuditInterceptor` ở **bất kỳ** module nào trong service mà không cần thêm imports.

---

## 3. Phần 2 — Đọc settings

### 3.1 API tổng quan

```typescript
class SysSettingClient {
  // Unified — auto-routes via metadata.sensitive
  get<T>(key: string, orgId?: string): Promise<T | null>;
  getOrDefault<T>(key: string, orgId: string | undefined, defaultValue: T): Promise<T>;

  // Type-safe shortcuts (cùng auto-routing logic)
  getString(key: string, orgId?: string): Promise<string | null>;
  getNumber(key: string, orgId?: string): Promise<number | null>;
  getBoolean(key: string, orgId?: string): Promise<boolean | null>;

  // Bulk — Safety Guard #2: ALWAYS skip sensitive keys
  getAll(orgId?: string): Promise<Record<string, unknown>>;
  has(key: string, orgId?: string): Promise<boolean>;

  // Cache control
  reloadKey(key: string): Promise<void>;
  reloadAll(): Promise<void>;
  getCacheStats(): SysCacheStats;
}
```

### 3.2 Pattern khuyến nghị: `getOrDefault` với fallback

Hầu hết case bạn có 1 fallback hợp lý (env var hoặc hardcoded). Pattern chuẩn:

```typescript
async getJwtTtl(orgId: string): Promise<number> {
  // Priority 1: sys (org-specific, then global, then default in metadata)
  // Priority 2: env (legacy)
  // Priority 3: hardcoded
  const envFallback = parseInt(process.env['JWT_EXPIRES_IN_SEC'] || '3600', 10);
  return this.sys.getOrDefault<number>(
    ConfigKey.IAM_JWT_ACCESS_TTL_SEC,
    orgId,
    envFallback,
  );
}
```

→ Khi sys down hoặc key chưa có giá trị: fallback về env. **Service không bao giờ crash vì sys.**

### 3.3 Lookup priority (tự động trong lib)

```
get(key, orgId) chạy theo thứ tự:
  1. settingCache có entry chưa expired? → return cached
  2. settingCache có entry stale-but-not-expired? → return stale + background refresh
  3. Cache miss → query Mongo:
       a. { key, scope='org', owner.orgId=<orgId> }   ← org-specific override
       b. { key, scope='global' }                      ← system-wide default
  4. Mongo trả null → return getOrDefault's default OR null
```

Caller chỉ cần truyền `orgId`. Lib lo phần fallback global → caller default.

### 3.4 Sensitive vs non-sensitive — không cần code khác

```typescript
// Caller code identical for both:
const a = await sys.getString(ConfigKey.AIWM_BASE_API_URL, orgId);     // non-sensitive (Mongo direct)
const b = await sys.getString(ConfigKey.OPENAI_API_KEY, orgId);        // sensitive (HTTP + audit on read)
```

Lib auto-detect qua metadata (loaded once tại `OnModuleInit` từ `GET /settings/metadata`).

**Khác biệt internal:**

| | Non-sensitive | Sensitive |
|---|---|---|
| Read path | Mongo direct | HTTP `GET /settings/internal/secret/:key` |
| Cache | `settingCache` (long TTL + stale-while-revalidate) | `secretCache` (short TTL, no stale) |
| Audit on read | ❌ | ✅ (sys ghi audit per-read) |
| Latency | ~1ms | ~10–50ms (HTTP roundtrip) |

→ Hot path (gọi nhiều lần/giây) nên ưu tiên non-sensitive keys. Secret nên load **1 lần khi service start** + cache.

### 3.5 Bulk read — `getAll()`

```typescript
const all = await sys.getAll(orgId);
// → { 'aiwm.base_api_url': '...', 's3.endpoint': '...', ... }
// KHÔNG bao giờ chứa sensitive keys (Safety Guard #2)
```

Dùng cho UI dump, debugging. Không khuyến nghị cho hot path (load tất cả từ cache).

### 3.6 Cache invalidation tự động

Khi UI/admin update setting qua sys, sys publish `sys:setting:invalidate` qua Redis pub/sub → mọi service consumer nhận event → drop cache entry → next `get()` fetch fresh.

**Không cần caller làm gì thêm.** Tuy nhiên, nếu pub/sub fail (Redis disconnect), TTL fallback đảm bảo cache không stale quá lâu (default 5 phút).

Khi muốn force reload manual: `sys.reloadKey(key)` hoặc `sys.reloadAll()`.

### 3.7 Debug stats endpoint

Lib có sẵn `SysClientStatsController` (optional). Mount nếu muốn:

```typescript
import { SysClientStatsController } from '@hydrabyte/sys-client';

@Module({
  imports: [SysClientModule.forRoot({...})],
  controllers: [SysClientStatsController],   // exposes GET /sys-client/stats
})
export class AppModule {}
```

Endpoint gated bởi `DEBUG=true` env hoặc `X-Internal-API-Key` header. Output dạng:

```json
{
  "settingCacheSize": 24,
  "secretCacheSize": 3,
  "metadataLoaded": true,
  "pubsubConnected": true,
  "lastPubsubEventAt": "2026-05-09T22:13:37.281Z",
  "ttlConfig": { "settingDefault": 300, "secretDefault": 300, "stale": 60 },
  "reloadCounts": { "pubsub": 5, "ttl": 0, "stale": 1, "init": 24, "manual": 0 },
  "keys": [
    { "key": "aiwm.base_api_url", "sensitive": false, "cachedAt": "..." },
    { "key": "openai.api_key", "sensitive": true, "cachedAt": "..." }
  ]
}
```

> Output **không có `value`** ở bất kỳ entry nào (Safety Guard #5). Sensitive entries indistinguishable from non-sensitive về shape — không leak "secret này đã được fetch lúc nào".

---

## 4. Phần 3 — Ghi audit-log

Có **2 cách** ghi audit. Chọn theo use case:

### Cách 1 — Decorator (recommended cho 80% use case)

Khai báo declarative ở controller route:

```typescript
import { Audit, AuditInterceptor } from '@hydrabyte/sys-client';

@Controller('users')
@UseInterceptors(AuditInterceptor)         // ← apply 1 lần ở class
export class UsersController {
  @Post()
  @Audit({ resource: 'user', action: 'create' })
  async createUser(@Body() dto, @CurrentUser() ctx) {
    return this.service.create(dto, ctx);
  }

  @Patch(':id')
  @Audit({ resource: 'user', action: 'update' })
  async updateUser(@Param('id') id, @Body() dto, @CurrentUser() ctx) {
    return this.service.update(id, dto, ctx);
  }

  @Delete(':id')
  @Audit({ resource: 'user', action: 'delete', captureResourceId: false })
  async deleteUser(@Param('id') id, @CurrentUser() ctx) {
    await this.service.delete(id, ctx);
  }
}
```

**Auto-capture:**
- `actor` từ `req.user` (RequestContext) — fallback `actor.orgId='system'` nếu chưa auth
- `requestPayload` từ `req.body` (sanitized + truncated)
- `responseSummary` từ response (`{ id, status, size }`)
- `correlationId` từ `req.correlationId`
- `durationMs` (handler latency)
- `result='success'` nếu handler return bình thường, `'failure'` + `errorMessage`+`errorCode` nếu throw

**`@Audit()` config options:**

```typescript
interface AuditConfig {
  resource: string;        // 'user', 'agent', 'document', ...
  action: string;          // 'create', 'login', 'export', ...
  capturePayload?: boolean;     // default true — set false để skip req.body
  captureResourceId?: boolean;  // default true — set false nếu response không có id
  keyType?: 'setting' | 'sensitive_setting';  // chỉ dùng khi audit secret reads
}
```

**Khi nào set `captureResourceId: false`:**
- Login/logout: response là `TokenData`, không có user id
- Operations bulk không có 1 resource cụ thể

### Cách 2 — Explicit `log()` (service-layer, conditional, complex)

```typescript
import { SysAuditClient } from '@hydrabyte/sys-client';

@Injectable()
class WebhookService {
  constructor(private readonly audit: SysAuditClient) {}

  async processWebhook(payload: any) {
    const result = await this.handle(payload);

    // Custom audit với context cụ thể của domain
    this.audit.log({
      resource: 'webhook',
      action: 'process',
      resourceId: payload.id,
      actor: { orgId: 'system', ipAddress: payload.sourceIp },
      requestPayload: payload,        // sẽ tự sanitize + truncate
      responseSummary: { status: result.statusCode, size: result.bodySize },
      result: result.success ? 'success' : 'failure',
      errorMessage: result.error,
      correlationId: payload.correlationId,
      occurredAt: new Date(),
      durationMs: result.duration,
    });
  }
}
```

**Khi nào dùng explicit:**
- Service-layer events (cron, queue processor — không có HTTP request)
- Conditional logging (`if (importantCondition) audit.log(...)`)
- Custom actor (vd `actor.orgId = payload.fromOrg` thay vì caller's org)
- Custom payload nếu req.body không đủ context

### Cách 3 — Combine cả 2

Bạn có thể vừa decorator vừa explicit trong cùng 1 endpoint:

```typescript
@Post()
@Audit({ resource: 'user', action: 'create' })
async createUser(@Body() dto, @CurrentUser() ctx) {
  const user = await this.service.create(dto, ctx);

  // Decorator đã ghi 1 event { resource: 'user', action: 'create' }
  // Thêm event chi tiết hơn cho audit trail của license:
  if (user.role === 'organization.owner') {
    this.audit.log({
      resource: 'license',
      action: 'auto-provisioned',
      resourceId: user.orgId,
      actor: { orgId: ctx.orgId, userId: ctx.userId },
      result: 'success',
      occurredAt: new Date(),
    });
  }
  return user;
}
```

### `actor.orgId = 'system'` convention

Khi không có user context (cron, internal worker, login pre-auth):
- Decorator tự động fallback `actor.orgId = 'system'`
- Explicit log: caller phải set `actor.orgId: 'system'` (cảnh báo TS sẽ enforce vì `orgId` required)

→ UI sys có thể filter `actor.orgId='system'` để xem các event không thuộc org nào.

### Sanitization tự động

Lib auto-strip các field nhạy cảm (case-insensitive):

```
password, passwordHash, token, accessToken, refreshToken, idToken,
secret, apiKey, authorization, creditCard, ssn, privateKey
```

Custom thêm field bằng:

```typescript
import { setSensitiveFields } from '@hydrabyte/sys-client';
setSensitiveFields(['internalSecret', 'sshKey']);
```

Per-field truncate: > 1KB → `{ __truncated: true, preview: '...', originalLength: ... }` (giữ 256 chars đầu).

Total payload cap: > 4KB → toàn bộ object bị thay bằng summary stub.

---

## 5. Phần 4 — Best practices & gotchas

### ✅ Nên làm

1. **Luôn dùng `getOrDefault` với fallback hợp lý** — sys downtime không nên block service.
2. **Đọc secret 1 lần khi service start** rồi cache trong memory của service. Không spam `sys.get()` cho secret trong hot path.
3. **`actor.orgId` phải đúng** — sai → audit query bị lệch boundary, hoặc rò rỉ event của org khác.
4. **`SkipLicenseCheck()` cho login** vì user chưa có license (decorator audit vẫn chạy ok).
5. **Tách env riêng cho dev / staging / prod** — không hard-code `SYS_API_URL` trong code.

### ❌ Không nên

1. **Đừng inject `SysAuditClient` rồi await `log()`** — nó là fire-and-forget, không await. Nếu await không gây lỗi nhưng trải nghiệm dev confusing.
2. **Đừng log full response body** trong custom audit — đã có `responseSummary` chỉ giữ id/status/size. Body lớn → 4KB cap kích hoạt → mất context.
3. **Đừng dùng `@Audit()` cho endpoints public chưa auth** trừ login/logout — audit volume tăng vô ích.
4. **Đừng put PII thật vào `requestPayload`** — sanitize không cover email/phone/SSN. PII partial mask đã trong [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md), khi nào cần thì làm.
5. **Đừng tự tạo Mongoose connection tới `core-sys`** — lib đã có connection riêng.

### Resilience matrix

| Tình huống | Hành vi lib | Service consumer impact |
|---|---|---|
| sys API down | metadata fetch fail → fallback default từ caller's `getOrDefault` | None — service vẫn hoạt động bằng env defaults |
| Mongo `core-sys` down | non-sensitive read fail → return null | `getOrDefault` fallback default; sensitive vẫn ok qua HTTP |
| Redis down | pub/sub disconnect, BullMQ enqueue fail → audit log ra stdout với marker `AUDIT_FALLBACK` | Audit không mất (recover từ container log); cache vẫn hoạt động (TTL only, no real-time invalidation) |
| sys + Mongo + Redis cùng down | Mọi `get()` return null → caller fallback | Service hoạt động bình thường với env defaults; audit logs ra stdout |
| Schema mismatch (lib version cũ) | Có thể parse sai value | Update lib version, redeploy |

→ **Service consumer không nên fail vì sys**. Test resilience bằng cách set `SYS_API_URL=http://localhost:9999` (sys không tồn tại) khi dev.

### Mode `disabled` cho test

```typescript
SysClientModule.forRoot({
  disabled: process.env['NODE_ENV'] === 'test',
  // ... other options (sẽ ignore)
})
```

Trong mode disabled: tất cả `sys.get()` trả null → caller dùng default. Tests deterministic, không cần Mongo/Redis.

---

## 6. Phần 5 — Thêm setting key mới

Khi service của bạn cần 1 setting mới (vd để chuyển từ env sang sys):

### Bước 1 — Add ConfigKey enum

```typescript
// libs/shared/src/lib/enum/config-key.enum.ts
export enum ConfigKey {
  // ... existing ...

  // Your service section
  MYSERVICE_FEATURE_FLAG = 'myservice.feature.flag',
}
```

### Bước 2 — Add metadata trong sys

```typescript
// services/sys/src/modules/setting/constants/setting-metadata.const.ts
export const SETTING_METADATA: Record<ConfigKey, SettingKeyMetadata> = {
  // ... existing ...

  [ConfigKey.MYSERVICE_FEATURE_FLAG]: {
    key: ConfigKey.MYSERVICE_FEATURE_FLAG,
    displayName: 'My Feature Flag',
    description: 'Bật/tắt feature X',
    dataType: 'boolean',
    isRequired: false,
    defaultValue: 'false',
    validation: { enum: ['true', 'false'] },
    example: 'false',
    sensitive: false,         // hoặc true cho secrets
    cacheTtlSec: 60,          // override per-key (optional)
  },
};
```

### Bước 3 — Build sys + redeploy

Sys cần restart để metadata mới available qua `GET /settings/metadata`. Lib trên các consumer sẽ subscribe `sys:metadata:invalidate` và auto-reload metadata khi sys publish (currently only on metadata mutation; deploy event không tự publish — cần restart consumer hoặc gọi `sys.reloadAll()` thủ công).

### Bước 4 — Set giá trị qua UI hoặc API

```bash
curl -X POST http://sys:3007/settings \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"key":"myservice.feature.flag","value":"true","scope":"org","notes":"Enable for org X"}'
```

### Bước 5 — Đọc trong service

```typescript
const enabled = await this.sys.getBoolean(ConfigKey.MYSERVICE_FEATURE_FLAG, ctx.orgId);
if (enabled) {
  // ... feature behavior
}
```

---

## 7. Phần 6 — Troubleshooting

### Lib không load metadata

**Triệu chứng:** log lib `loadMetadata threw — fetch failed`

**Nguyên nhân:**
- `SYS_API_URL` sai
- Sys không reachable từ network của consumer
- Sys chưa start

**Fix:** verify `curl ${SYS_API_URL}/settings/metadata` từ cùng container/pod consumer. Lib sẽ retry mỗi lần `get()` được gọi mà metadata chưa load.

### Sensitive read trả null mãi

**Triệu chứng:** `sys.getString(SOME_SECRET_KEY)` luôn null mặc dù DB có record

**Kiểm tra:**
1. `metadata[KEY].sensitive === true`? Nếu false → đang đi non-sensitive path → kiểm tra `core-sys.settings` có record với `key + scope + owner.orgId` đúng không
2. `INTERNAL_API_KEY` khớp giữa sys + consumer?
3. Source IP của consumer có trong `SYS_INTERNAL_CIDR_ALLOWLIST` của sys không? (kiểm tra sys log warning `Internal endpoint CIDR rejected`)
4. Rate limit bị trigger? Default 10 reads/min/(IP+key)

### Audit log không xuất hiện trong sys UI

**Kiểm tra:**
1. Service consumer có set `SysAuditClient ready` trong log lúc start không?
2. Container log có `AUDIT_FALLBACK` marker → tức Redis enqueue fail
3. Sys worker (`MODE=wrk`) có chạy không? BullMQ worker phải có để consume queue
4. Mongo `core-sys.audit_logs` collection có được populate không?
5. UI query có filter sai (vd filter `service=foo` mà actual service name khác)?

### Cache không invalidate khi update setting

**Triệu chứng:** update setting qua sys API, nhưng consumer service vẫn dùng giá trị cũ

**Kiểm tra:**
1. Pub/sub Redis ok? Lib log `sys-client pub/sub connected` lúc start.
2. `sys.getCacheStats().reloadCounts.pubsub` có tăng sau khi update không?
3. Nếu pubsub miss → TTL fallback (default 5 min) → đợi 5 phút sẽ tự fresh.
4. Force reload: gọi `sys.reloadKey(key)` thủ công, hoặc service redeploy.

### Service bị block tại startup

**Triệu chứng:** Nest app không reach `successfully started`

**Lib có vấn đề?** Lib không block startup — `OnModuleInit` chỉ log error nếu fail, không throw. Nếu service bị block, vấn đề ở module khác (Mongo/Redis của service consumer chính, không phải sys-client).

→ Verify bằng cách disable lib tạm thời:
```typescript
SysClientModule.forRoot({ disabled: true, ...other })
```

---

## Reference

- **Proposal**: [`PROPOSAL.md`](./PROPOSAL.md) §6 (lib design), §6.4 (5 safety guards)
- **Implementation plan**: [`PLAN_v1.md`](./PLAN_v1.md) Phase P1 (lib), P2 (audit), P3 (iam pilot)
- **Pilot example**: `services/iam/src/modules/auth/auth.service.ts` (settings) + `services/iam/src/modules/auth/auth.controller.ts` (audit decorator)
- **Lib source**: [`libs/sys-client/src/`](../../libs/sys-client/src/)
- **Backlog (planned features)**: [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md)
