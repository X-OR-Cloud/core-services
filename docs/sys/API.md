# SYS Service — API Reference

> Tài liệu API cho UI tích hợp với sys service. Chỉ bao gồm các endpoint public (cho UI quản trị + metadata public). Các endpoint internal (`/settings/internal/*`, `/audit-logs/internal/*`) dành riêng cho service-to-service consumption qua `@hydrabyte/sys-client` lib và **không có trong tài liệu này**.
>
> **Service info:** SYS — System utilities (settings + audit-log)
> **Default port:** 3007 (dev), 3370–3379 (prod cluster sau Nginx)
> **Last updated:** 2026-05-10

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Base URL](#2-base-url)
3. [Authentication](#3-authentication)
4. [Conventions](#4-conventions)
5. [Settings — Metadata (public, no auth)](#5-settings--metadata-public-no-auth)
6. [Settings — Quản trị (JWT auth)](#6-settings--quản-trị-jwt-auth)
7. [Audit-log — Query (JWT auth)](#7-audit-log--query-jwt-auth)
8. [RBAC summary](#8-rbac-summary)
9. [Setting keys reference](#9-setting-keys-reference)

---

## 1. Tổng quan

SYS service cung cấp 2 nhóm chức năng cho UI:

| Nhóm | Endpoint prefix | Mục đích |
|---|---|---|
| **Settings** | `/settings/*` | Quản lý cấu hình runtime (key-value) cho toàn bộ hệ thống — global + per-org. Hỗ trợ giá trị nhạy cảm (sensitive) với cơ chế mask + reveal riêng. |
| **Audit-log** | `/audit-logs/*` | Truy vấn log audit tập trung từ tất cả core service. Filter theo service / resource / action / actor / time range. Hỗ trợ aggregate stats. |

UI quản trị (admin panel) sẽ dùng các endpoint dưới đây để cho phép `universe.owner` / `organization.owner` cấu hình hệ thống và xem hoạt động.

---

## 2. Base URL

| Environment | Base URL |
|---|---|
| Development local | `http://localhost:3007` |
| Production (qua Nginx) | `https://api.x-or.cloud/sys` |

Tất cả path trong tài liệu này tương đối với base URL.

---

## 3. Authentication

### 3.1 JWT Bearer

Hầu hết endpoint yêu cầu JWT trong header:

```
Authorization: Bearer <jwt-access-token>
```

Token được issue bởi IAM service (`POST /iam/auth/login`). Payload cần có `roles` để pass RBAC check:
- `universe.owner` — full access (mọi scope, mọi org)
- `organization.owner` — chỉ scope=org của org mình

### 3.2 Public endpoints

Các endpoint `/settings/metadata` và `/settings/metadata/:key` **không cần auth** — UI có thể gọi để lấy metadata để render form ngay cả khi user chưa đăng nhập.

### 3.3 Mã lỗi auth

| Status | Code | Ý nghĩa |
|---|---|---|
| 401 | `Unauthorized` | Thiếu / sai / hết hạn JWT |
| 403 | `Forbidden` | JWT hợp lệ nhưng role không đủ quyền (vd `org.owner` cố gắng update scope=global) |

---

## 4. Conventions

### 4.1 Datetime

Mọi `createdAt`, `updatedAt`, `occurredAt` ở response đều theo định dạng **ISO 8601 UTC**:

```
2026-05-09T22:13:37.281Z
```

Khi truyền vào query parameter (vd filter audit by time range), dùng cùng format.

### 4.2 Pagination

Endpoints trả nhiều record dùng query params chuẩn:

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Trang hiện tại (1-indexed) |
| `limit` | integer | 50 | Số records per page (max 200) |

Response shape:

```json
{
  "data": [/* array of records */],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 247
  }
}
```

### 4.3 Error format chung

Mọi lỗi có format chuẩn từ `GlobalExceptionFilter`:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "timestamp": "2026-05-09T22:13:37.281Z",
  "path": "/settings",
  "correlationId": "92f6ef38-723f-4150-9d63-7f1c622e29bd",
  "errors": ["value cannot be empty"]
}
```

UI nên log `correlationId` để dễ trace khi debug.

### 4.4 ID format

`_id` trong response là **MongoDB ObjectId** (24 ký tự hex). UI có thể coi là string opaque.

### 4.5 Sensitive value masking

Settings có `sensitive: true` sẽ được mask thành `"***"` trong các response của list / detail / create / update. Để xem plaintext, dùng endpoint riêng `POST /settings/:key/reveal` (chỉ `universe.owner`).

---

## 5. Settings — Metadata (public, no auth)

Metadata mô tả schema của tất cả các setting key được hệ thống hỗ trợ — bao gồm `displayName`, `description`, `dataType`, validation rules, ví dụ. UI dùng metadata để **render form động** (auto-generate input field theo dataType, hiển thị validation hint, ...).

### 5.1 GET /settings/metadata

**Mô tả:** Lấy metadata cho tất cả setting keys.

**Mục đích:** UI fetch 1 lần khi load page admin để build form schema. Nên cache trong UI state (metadata thay đổi rất hiếm — chỉ khi deploy version mới của sys).

**Auth:** Không cần.

**Path params:** Không.

**Query params:** Không.

**Response 200:**

```json
[
  {
    "key": "s3.endpoint",
    "displayName": "S3 Endpoint",
    "description": "S3-compatible storage endpoint URL (MinIO, AWS S3)",
    "dataType": "url",
    "isRequired": true,
    "validation": { "pattern": "^https?://.+" },
    "example": "https://minio.example.com"
  },
  {
    "key": "openai.api_key",
    "displayName": "OpenAI API Key",
    "description": "OpenAI API key for GPT models",
    "dataType": "string",
    "isRequired": false,
    "validation": { "pattern": "^sk-[A-Za-z0-9_-]+$", "minLength": 20 },
    "example": "sk-proj-...",
    "sensitive": true,
    "cacheTtlSec": 300
  },
  {
    "key": "iam.jwt.access_ttl_sec",
    "displayName": "IAM JWT Access Token TTL (seconds)",
    "description": "Lifetime of the access token issued at login. Default 3600s (1h).",
    "dataType": "number",
    "isRequired": false,
    "defaultValue": "3600",
    "validation": { "min": 60, "max": 86400 },
    "example": "3600",
    "cacheTtlSec": 300
  }
]
```

**Field semantics:**

| Field | Type | Description |
|---|---|---|
| `key` | string | Definitive key identifier dùng cho mọi API khác |
| `displayName` | string | Tên hiển thị tiếng Anh, dùng làm label trong form |
| `description` | string | Mô tả chi tiết, dùng làm tooltip / help text |
| `dataType` | enum: `string` \| `number` \| `boolean` \| `url` \| `email` | Kiểu dữ liệu — UI render input phù hợp |
| `isRequired` | boolean | Field bắt buộc có giá trị hay không |
| `defaultValue` | string \| undefined | Giá trị mặc định gợi ý |
| `validation.pattern` | string \| undefined | Regex pattern (cho string/url/email) |
| `validation.minLength`/`maxLength` | number \| undefined | Length constraint cho string |
| `validation.min`/`max` | number \| undefined | Range constraint cho number |
| `validation.enum` | string[] \| undefined | Allowed values (radio buttons) |
| `example` | string \| undefined | Ví dụ mẫu hiển thị placeholder |
| `sensitive` | boolean (default false) | Khi `true`: UI mask field thành `***`, hiển thị nút "Reveal" cho universe.owner |
| `cacheTtlSec` | number \| undefined | Per-key cache TTL (chỉ cần biết khi tune perf, UI thường không cần) |

---

### 5.2 GET /settings/metadata/:key

**Mô tả:** Lấy metadata cho 1 key cụ thể.

**Mục đích:** Khi UI mở form edit cho 1 setting, có thể fetch metadata riêng key đó (thay vì lọc từ list ở 5.1).

**Auth:** Không cần.

**Path params:**

| Param | Type | Description |
|---|---|---|
| `key` | string | Setting key, vd `s3.endpoint` |

**Response 200:** giống 1 phần tử của 5.1.

**Response 404:** nếu key không tồn tại trong registry.

```json
{
  "statusCode": 404,
  "message": "Unknown setting key 'foo.bar'. Allowed: s3.endpoint, s3.access_key, ...",
  "timestamp": "...",
  "path": "/settings/metadata/foo.bar",
  "correlationId": "..."
}
```

---

## 6. Settings — Quản trị (JWT auth)

Endpoints CRUD cho UI quản trị. Tất cả yêu cầu JWT.

### 6.1 GET /settings

**Mô tả:** Lấy danh sách settings với pagination + filter.

**Mục đích:** UI hiển thị bảng tất cả setting, cho phép filter theo scope hoặc lọc sensitive only.

**Auth:** JWT.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Trang |
| `limit` | integer | 50 | Số record/trang |
| `scope` | `global` \| `org` | — | Lọc theo scope |
| `sensitive` | boolean | — | Chỉ trả các record sensitive (true) hoặc non-sensitive (false) |
| `key:regex` | string | — | Regex filter trên key (vd `^s3\.` để lấy tất cả s3.*) |
| `sort` | string | `createdAt:desc` | Sắp xếp; format `<field>:asc\|desc`, có thể nhiều: `key:asc,createdAt:desc` |

**RBAC behavior:**
- `universe.owner`: thấy tất cả
- `organization.owner`: chỉ thấy `scope='org' && owner.orgId === ctx.orgId` + tất cả `scope='global'`

**Response 200:**

```json
{
  "data": [
    {
      "_id": "675a1b2c3d4e5f6a7b8c9d0e",
      "key": "s3.endpoint",
      "value": "https://minio.example.com",
      "scope": "org",
      "sensitive": false,
      "notes": "Primary MinIO instance",
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-05-09T14:30:00.000Z"
    },
    {
      "_id": "675a1b2c3d4e5f6a7b8c9d0f",
      "key": "openai.api_key",
      "value": "***",
      "scope": "org",
      "sensitive": true,
      "notes": null,
      "createdAt": "2026-05-01T10:05:00.000Z",
      "updatedAt": "2026-05-01T10:05:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 24 },
  "statistics": { "total": 24 }
}
```

> ⚠️ Sensitive setting có `value: "***"`. Để xem plaintext, dùng `POST /:key/reveal`.

---

### 6.2 GET /settings/:key

**Mô tả:** Lấy chi tiết 1 setting theo key, với lookup priority `scope=org` (caller's org) → `scope=global` fallback.

**Mục đích:** UI fetch giá trị hiệu lực cho org của user hiện tại — nếu org có override, trả org-specific; nếu không, trả global default.

**Auth:** JWT.

**Path params:**

| Param | Type | Description |
|---|---|---|
| `key` | string | Setting key |

**Response 200:**

```json
{
  "_id": "675a1b2c3d4e5f6a7b8c9d0e",
  "key": "iam.jwt.access_ttl_sec",
  "value": "3600",
  "scope": "global",
  "sensitive": false,
  "notes": null,
  "createdAt": "2026-04-01T00:00:00.000Z",
  "updatedAt": "2026-04-01T00:00:00.000Z"
}
```

**Response 404:** không có setting cho cả org-specific lẫn global.

---

### 6.3 POST /settings

**Mô tả:** Tạo mới hoặc update (upsert) 1 setting. Nếu key + scope + orgId đã tồn tại → update value/notes; nếu chưa → create mới.

**Mục đích:** UI form submit khi admin tạo/sửa setting. UI không cần phân biệt create vs update — gọi cùng endpoint.

**Auth:** JWT.
- `scope=global` → universe.owner only
- `scope=org` → universe.owner OR organization.owner (org của caller)

**Request body:**

```json
{
  "key": "s3.endpoint",
  "value": "https://minio-prod.example.com",
  "scope": "org",
  "notes": "Updated to new MinIO cluster"
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `key` | enum (xem §9 hoặc `GET /settings/metadata`) | ✅ | |
| `value` | string | ✅ | 1–5000 chars; phải khớp validation rules trong metadata của key đó |
| `scope` | `global` \| `org` | — | Default `org` |
| `notes` | string | — | Max 500 chars |

> Server tự động set `sensitive` dựa trên metadata — UI không cần truyền field này.

**Response 200:** SettingDetailDto như §6.2 (giá trị mới sau khi save; sensitive sẽ được mask).

**Response 400:** validation fail.

```json
{
  "statusCode": 400,
  "message": "Value for 's3.endpoint' must be a valid URL",
  "timestamp": "...",
  "path": "/settings",
  "correlationId": "..."
}
```

**Response 403:** RBAC denied (vd org.owner cố set scope=global).

---

### 6.4 PATCH /settings/:key

**Mô tả:** Update partial 1 setting đã tồn tại (chỉ value và/hoặc notes).

**Mục đích:** UI cho phép edit từng field riêng lẻ, không cần resend full record. Cũng dùng cho thao tác "save" trong inline-edit table.

**Auth:** JWT (cùng RBAC với POST).

**Path params:** `key`.

**Request body (mọi field optional):**

```json
{
  "value": "https://minio-staging.example.com",
  "notes": "Switched to staging cluster"
}
```

**Response 200:** SettingDetailDto.

**Response 404:** setting với key đó không tồn tại trong scope thuộc về caller.

---

### 6.5 DELETE /settings/:key

**Mô tả:** Soft delete 1 setting (không xóa hẳn — đặt `isDeleted: true`).

**Mục đích:** Cho phép remove setting đã không còn dùng. Có thể restore bằng cách POST lại với cùng key.

**Auth:** JWT (cùng RBAC).

**Path params:** `key`.

**Response 204:** No Content.

**Response 404:** không tồn tại.

---

### 6.6 POST /settings/:key/reveal

**Mô tả:** Lấy plaintext value của 1 sensitive setting.

**Mục đích:** UI hiển thị nút "Reveal" (👁️ icon) bên cạnh sensitive value. Khi user click, gọi endpoint này để hiển thị giá trị thật trong popup hoặc inline. **Mỗi lần reveal được audit lại** — admin có thể truy lại "ai đã xem secret X lúc nào".

**Auth:** JWT — **chỉ `universe.owner`**.

**Path params:** `key`.

**Request body:** Không (POST với body rỗng).

**Response 200:**

```json
{
  "key": "openai.api_key",
  "value": "sk-proj-abcd1234efgh5678...",
  "revealedAt": "2026-05-10T14:22:01.123Z"
}
```

**Response 403:** caller không phải universe.owner.

**Response 404:** key không tồn tại hoặc không sensitive (organization.owner không thấy được — kể cả là sensitive thật).

> 💡 UI nên chỉ hiển thị nút "Reveal" cho user có role `universe.owner`. Với role thấp hơn, ẩn nút (UI sẽ không gọi endpoint này).

---

### 6.7 POST /settings/initialize

**Mô tả:** Bulk seed các setting key chưa tồn tại với giá trị rỗng. Skip những key đã có (idempotent — chạy lại nhiều lần an toàn).

**Mục đích:** Khi tạo org mới, UI có thể gọi endpoint này để pre-populate tất cả setting key ở scope `org` cho org đó. Admin sau đó chỉ việc edit những key cần dùng. Cũng dùng để bootstrap setting `global` ban đầu khi setup hệ thống.

**Auth:** JWT.
- `scope=global` → universe.owner only
- `scope=org` → universe.owner (có thể truyền `orgId` đích) hoặc organization.owner (force orgId của caller)

**Request body:**

```json
{
  "scope": "org",
  "orgId": "65f1a2b3c4d5e6f7a8b9c0d1"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `scope` | `global` \| `org` | ✅ | |
| `orgId` | MongoDB ObjectId string | tùy | Bắt buộc khi `universe.owner` set scope=org cho org khác. Bị bỏ qua nếu caller là organization.owner (luôn là caller's org). |

**Response 200:**

```json
{
  "success": true,
  "total": 30,
  "created": 22,
  "skipped": 8
}
```

| Field | Description |
|---|---|
| `total` | Tổng số key trong registry |
| `created` | Số key mới được seed |
| `skipped` | Số key đã tồn tại trước đó (không bị overwrite) |

---

## 7. Audit-log — Query (JWT auth)

UI hiển thị lịch sử hoạt động cross-service: ai đã làm gì lúc nào, kết quả thành công/thất bại.

### 7.1 GET /audit-logs

**Mô tả:** Search audit logs với pagination và nhiều filter.

**Mục đích:** UI bảng "Activity log" — admin filter theo service, action, user, time range để debug hoặc compliance audit.

**Auth:** JWT.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `page` | integer | Default 1 |
| `limit` | integer | Default 50, max 200 |
| `service` | string | Filter theo service name (`iam`, `aiwm`, `cbm`, `mona`, `noti`, `sys`) |
| `resource` | string | Filter theo entity type (`user`, `agent`, `document`, ...) |
| `action` | string | Filter theo verb (`create`, `update`, `delete`, `login`, `logout`, ...) |
| `userId` | string | Filter theo `actor.userId` |
| `orgId` | string | Filter theo `actor.orgId` (chỉ universe.owner mới truyền được; org.owner luôn bị scope về org của mình) |
| `result` | `success` \| `failure` | Filter theo kết quả |
| `correlationId` | string | Filter theo correlation ID (trace 1 request flow qua nhiều service) |
| `from` | ISO datetime | Lọc `occurredAt >= from` |
| `to` | ISO datetime | Lọc `occurredAt <= to` |

**RBAC behavior:**
- `universe.owner`: thấy tất cả; có thể filter `orgId` tùy ý
- `organization.owner`: tự động filter `actor.orgId = ctx.orgId` (param `orgId` bị ignore)

**Response 200:**

```json
{
  "data": [
    {
      "_id": "675c1234567890abcdef1234",
      "service": "iam",
      "resource": "user",
      "resourceId": "65f1a2b3c4d5e6f7a8b9c0d1",
      "action": "create",
      "keyType": null,
      "actor": {
        "userId": "65f0000000000000000000a1",
        "orgId": "65f0000000000000000000b2",
        "ipAddress": "10.10.0.42",
        "userAgent": "Mozilla/5.0 ..."
      },
      "before": null,
      "after": null,
      "requestPayload": {
        "username": "newuser@example.com",
        "fullname": "New User",
        "role": "organization.editor"
      },
      "responseSummary": {
        "id": "65f1a2b3c4d5e6f7a8b9c0d1",
        "size": 348
      },
      "result": "success",
      "errorMessage": null,
      "errorCode": null,
      "correlationId": "92f6ef38-723f-4150-9d63-7f1c622e29bd",
      "occurredAt": "2026-05-09T22:13:37.281Z",
      "durationMs": 42,
      "createdAt": "2026-05-09T22:13:37.290Z",
      "updatedAt": "2026-05-09T22:13:37.290Z"
    },
    {
      "_id": "675c1234567890abcdef1235",
      "service": "iam",
      "resource": "user",
      "resourceId": null,
      "action": "login",
      "keyType": null,
      "actor": {
        "orgId": "system",
        "ipAddress": "203.0.113.10",
        "userAgent": "..."
      },
      "requestPayload": {
        "username": "alice@example.com",
        "password": "<redacted>"
      },
      "responseSummary": null,
      "result": "failure",
      "errorMessage": "Invalid credentials",
      "errorCode": "401",
      "correlationId": "...",
      "occurredAt": "2026-05-09T22:14:01.500Z",
      "durationMs": 156
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1247 }
}
```

**Field semantics:**

| Field | Description |
|---|---|
| `service` | Service nào emit event (giá trị `serviceName` mà service đã config khi wire `SysClientModule`) |
| `resource` | Loại entity bị tác động — vd `user`, `agent`, `document` |
| `resourceId` | ID entity (nullable) |
| `action` | Verb mô tả hành động — vd `create`, `update`, `delete`, `login`, `logout`, `read`, `access_denied` |
| `keyType` | `'setting'` \| `'sensitive_setting'` \| `null` — chỉ set khi event là setting/secret read; UI dùng để filter audit secret access riêng |
| `actor.orgId` | Org ID của actor; **chuỗi đặc biệt `'system'`** dùng cho cron / internal worker / login pre-auth |
| `actor.userId` | User ID, có thể null (vd login attempt thất bại) |
| `before` / `after` | State trước / sau (cho update/delete events) — sanitized + truncated |
| `requestPayload` | Body request gốc — đã sanitize (password/token bị thay `<redacted>`), per-field cap 1KB / total 4KB |
| `responseSummary` | `{ id, status, size }` — KHÔNG có full response body |
| `result` | `'success'` hoặc `'failure'` |
| `errorMessage` / `errorCode` | Chi tiết lỗi nếu `result='failure'` |
| `correlationId` | UUID request — UI có thể click để filter tất cả event cùng correlationId, trace request qua nhiều service |
| `occurredAt` | Thời điểm event xảy ra (caller cung cấp) |
| `durationMs` | Latency handler |

> 💡 UI nên highlight các sự kiện `result='failure'` (vd màu đỏ) và `keyType='sensitive_setting'` (vd icon 🔐) để admin dễ theo dõi.

---

### 7.2 GET /audit-logs/:id

**Mô tả:** Lấy chi tiết 1 audit log theo ID.

**Mục đích:** UI hiển thị popup chi tiết khi admin click vào row trong bảng list.

**Auth:** JWT (org boundary check — universe.owner thấy all; org.owner chỉ thấy event của org mình).

**Path params:** `id` (MongoDB ObjectId).

**Response 200:** AuditLog object (cùng shape phần tử trong `data` của 7.1).

**Response 404:** không tồn tại HOẶC không thuộc org của caller (không leak existence).

---

### 7.3 GET /audit-logs/stats

**Mô tả:** Aggregate count grouped by `service + action + result` trong 1 time window.

**Mục đích:** UI dashboard chart — vẽ bar chart "top actions" hoặc "failure rate by service" trong 24h / 7d gần nhất.

**Auth:** JWT.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `from` | ISO datetime | Default: 24h trước hiện tại |
| `to` | ISO datetime | Default: hiện tại |

**RBAC:** giống 7.1 (org boundary).

**Response 200:**

```json
[
  { "service": "iam", "action": "login", "result": "success", "count": 432 },
  { "service": "iam", "action": "login", "result": "failure", "count": 27 },
  { "service": "iam", "action": "logout", "result": "success", "count": 408 },
  { "service": "iam", "action": "create", "result": "success", "count": 12 },
  { "service": "aiwm", "action": "create", "result": "success", "count": 89 },
  { "service": "cbm", "action": "delete", "result": "failure", "count": 3 }
]
```

> Mảng được sort theo `count` desc, top 200 entries. UI hiển thị bar chart hoặc heatmap.

---

## 8. RBAC summary

Bảng tóm tắt quyền truy cập từng endpoint:

| Endpoint | universe.owner | organization.owner | Other roles |
|---|---|---|---|
| `GET /settings/metadata` | ✅ | ✅ | ✅ (no auth) |
| `GET /settings/metadata/:key` | ✅ | ✅ | ✅ (no auth) |
| `GET /settings` | ✅ all | ✅ scope=org của mình + global | 401 |
| `GET /settings/:key` | ✅ | ✅ (org→global fallback) | 401 |
| `POST /settings` (scope=global) | ✅ | 403 | 401/403 |
| `POST /settings` (scope=org) | ✅ (any org) | ✅ (own org) | 401/403 |
| `PATCH /settings/:key` | giống POST | giống POST | giống POST |
| `DELETE /settings/:key` | giống POST | giống POST | giống POST |
| `POST /settings/:key/reveal` | ✅ + audit per-call | 403 | 401/403 |
| `POST /settings/initialize` (scope=global) | ✅ | 403 | 401/403 |
| `POST /settings/initialize` (scope=org) | ✅ | ✅ (own org) | 401/403 |
| `GET /audit-logs` | ✅ all (filter `orgId` tùy ý) | ✅ chỉ org mình | 401 |
| `GET /audit-logs/:id` | ✅ all | ✅ event của org mình | 401 |
| `GET /audit-logs/stats` | ✅ all | ✅ chỉ org mình | 401 |

---

## 9. Setting keys reference

Hiện tại registry có **30 keys** trong các nhóm sau. UI nên gọi `GET /settings/metadata` để lấy danh sách runtime — list dưới đây chỉ mang tính tham chiếu nhanh.

### 9.1 Object Storage (S3 / MinIO) — 8 keys

| Key | Type | Sensitive |
|---|---|---|
| `s3.endpoint` | url | |
| `s3.access_key` | string | 🔒 |
| `s3.secret_key` | string | 🔒 |
| `s3.bucket.models` | string | |
| `s3.bucket.logs` | string | |
| `s3.bucket.files` | string | |
| `s3.region` | string | |
| `s3.use_ssl` | boolean | |

### 9.2 SMTP Email — 7 keys

| Key | Type | Sensitive |
|---|---|---|
| `smtp.host` | string | |
| `smtp.port` | number | |
| `smtp.user` | string | |
| `smtp.password` | string | 🔒 |
| `smtp.from_email` | email | |
| `smtp.from_name` | string | |
| `smtp.use_tls` | boolean | |

### 9.3 Discord — 3 keys

| Key | Type | Sensitive |
|---|---|---|
| `discord.webhook_url` | url | 🔒 |
| `discord.alert_channel` | string | |
| `discord.username` | string | |

### 9.4 Telegram — 3 keys

| Key | Type | Sensitive |
|---|---|---|
| `telegram.bot_token` | string | 🔒 |
| `telegram.chat_id` | string | |
| `telegram.alert_enabled` | boolean | |

### 9.5 LLM Providers — 4 keys

| Key | Type | Sensitive |
|---|---|---|
| `llm.openai.api_key` | string | 🔒 |
| `llm.anthropic.api_key` | string | 🔒 |
| `llm.anthropic.oauth_token` | string | 🔒 |
| `llm.groq.api_key` | string | 🔒 |

### 9.6 Service URLs — 6 keys

| Key | Type | Sensitive |
|---|---|---|
| `aiwm.base_api_url` | url | |
| `aiwm.base_mcp_url` | url | |
| `aiwm.base_ws_url` | url | |
| `cbm.base_api_url` | url | |
| `iam.base_api_url` | url | |
| `mona.base_api_url` | url | |

### 9.7 Browser Automation — 2 keys

| Key | Type | Sensitive |
|---|---|---|
| `pinchtab.api_url` | url | |
| `pinchtab.api_key` | string | 🔒 |

### 9.8 IAM — 2 keys (P3 pilot)

| Key | Type | Sensitive |
|---|---|---|
| `iam.jwt.access_ttl_sec` | number | |
| `iam.refresh_token.ttl_sec` | number | |

> 🔒 = `sensitive: true`. Value bị mask thành `***` trong list/detail; cần `POST /:key/reveal` để xem plaintext (universe.owner only).
