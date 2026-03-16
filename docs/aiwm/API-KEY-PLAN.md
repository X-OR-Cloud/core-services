# API Key Authentication - Implementation Plan

## Mục tiêu

Cho phép client gọi AIWM API (đặc biệt inference endpoint) bằng API Key thay vì User JWT.
API Key là **org-level credential**, có thể dùng cho toàn bộ AIWM API hoặc restrict xuống deployment cụ thể qua `scopes`.

---

## Luồng xử lý

### 1. Tạo API Key

```
POST /api-keys
Authorization: Bearer <USER_JWT>

Body: { name, scopes, expiresAt? }
```

1. Validate user là `org.owner`
2. Generate key: `<prefix>.<random32>` (ví dụ: `xai_a1b2c3d4.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
3. Hash key bằng SHA-256, lưu `keyHash` vào DB
4. Lưu `keyPrefix` (8 ký tự sau dấu `.`) để identify
5. **Trả plain text key duy nhất 1 lần** — sau đó không thể xem lại

### 2. Gọi API bằng API Key

```
POST /deployments/:id/inference/v1/chat/completions
Authorization: Bearer xai_a1b2c3d4.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Guard xử lý auth (tại inference endpoint)

```
Request đến
  ↓
CombinedAuthGuard
  ├─ Header bắt đầu bằng "Bearer xai_" ?
  │    ↓ Yes
  │    ApiKeyAuthStrategy
  │      ├─ Hash key nhận được
  │      ├─ Lookup keyHash trong DB (status=active, expiresAt chưa hết)
  │      ├─ Validate scope: "all" hoặc "deployment:<id>" khớp URL param
  │      └─ Build RequestContext từ key metadata (orgId, createdBy.userId)
  │
  └─ Còn lại → JwtAuthStrategy (flow hiện tại)
       ↓
  RequestContext đồng nhất → service không thay đổi
```

### 4. Các endpoint khác (không phải inference)

Đối với các API như `GET /models`, `GET /deployments`, v.v., nếu muốn dùng API Key:
- Guard check tương tự, nhưng scope `all` mới được phép
- Scope `deployment:<id>` chỉ cho phép inference của deployment đó

---

## Scopes

| Scope | Cho phép |
|-------|----------|
| `all` | Toàn bộ AIWM API |
| `deployment:<id>` | Chỉ `/deployments/<id>/inference/*` |

Một key có thể có nhiều scope: `["deployment:abc", "deployment:def"]`

---

## Entities

### Mới: `ApiKey` schema

**File:** `services/aiwm/src/modules/api-key/api-key.schema.ts`

| Field | Type | Mô tả |
|-------|------|-------|
| `name` | string | Tên label (vd: "Production App") |
| `keyHash` | string | SHA-256 hash của full key |
| `keyPrefix` | string | 8 ký tự đầu sau dấu `.` để identify (vd: `a1b2c3d4`) |
| `scopes` | string[] | `["all"]` hoặc `["deployment:id1", "deployment:id2"]` |
| `status` | enum | `active` \| `revoked` |
| `lastUsedAt` | Date | Cập nhật mỗi lần dùng (async) |
| `expiresAt` | Date? | Tùy chọn, null = không hết hạn |
| `owner` | BaseSchema | orgId, userId (kế thừa BaseSchema) |
| `createdBy` | RequestContext | Kế thừa BaseSchema |

Index: `keyHash` (unique), `owner.orgId + status`, `scopes`

### Không thay đổi

- `Deployment` schema — không cần thêm field
- `Model` schema — không thay đổi
- `RequestContext` interface — không thay đổi (API Key auth build ra cùng structure)

---

## APIs mới/thay đổi

### Mới: `/api-keys` module

| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| `POST` | `/api-keys` | Tạo key mới, trả plain text 1 lần | JWT, org.owner |
| `GET` | `/api-keys` | List keys của org (không có keyHash, chỉ prefix + metadata) | JWT |
| `DELETE` | `/api-keys/:id` | Revoke key | JWT, org.owner |

**POST /api-keys request body:**
```json
{
  "name": "Production App",
  "scopes": ["all"],
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**POST /api-keys response (1 lần duy nhất):**
```json
{
  "_id": "...",
  "name": "Production App",
  "keyPrefix": "a1b2c3d4",
  "scopes": ["all"],
  "status": "active",
  "expiresAt": "2027-01-01T00:00:00Z",
  "key": "xai_a1b2c3d4.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### Thay đổi: Inference endpoint

```
ALL /deployments/:id/inference/*
```

- Hiện tại: `@UseGuards(JwtAuthGuard)`
- Sau: `@UseGuards(CombinedAuthGuard)` — chấp nhận cả JWT lẫn API Key

Các endpoint khác (`GET /models`, `GET /deployments`...) giữ nguyên `JwtAuthGuard` — chưa mở cho API Key trong phase này.

---

## Files cần tạo mới

```
services/aiwm/src/modules/api-key/
├── api-key.schema.ts         # Mongoose schema
├── api-key.dto.ts            # CreateApiKeyDto, response DTOs
├── api-key.service.ts        # CRUD + key generation/hashing logic
├── api-key.controller.ts     # REST endpoints
└── api-key.module.ts         # NestJS module

services/aiwm/src/guards/
└── combined-auth.guard.ts    # Check API Key trước, fallback JWT
```

## Files cần chỉnh sửa

| File | Thay đổi |
|------|---------|
| `services/aiwm/src/app.module.ts` | Import `ApiKeyModule` |
| `services/aiwm/src/modules/deployment/deployment.controller.ts` | Đổi guard inference endpoint sang `CombinedAuthGuard` |
| `services/aiwm/src/modules/deployment/deployment.module.ts` | Import `ApiKeyModule` (để inject `ApiKeyService` vào guard) |

---

## Key format

```
xai_<8-char-prefix>.<32-char-random>
```

- `xai_` — product prefix, dễ identify trong logs
- `<8-char-prefix>` — lưu vào DB (`keyPrefix`), hiển thị trong list API
- `<32-char-random>` — crypto random, không lưu plain text
- Toàn bộ string sau `xai_` được SHA-256 hash lưu vào `keyHash`

Ví dụ: `xai_a1b2c3d4.k9mN2xPqR7vL4wYtJ8uZnCeHsAbF1dGo`

---

## Không nằm trong scope (phase này)

- Rate limiting theo API Key
- API Key cho các endpoint ngoài inference (GET /models, v.v.)
- Audit log chi tiết theo key
- Key rotation
