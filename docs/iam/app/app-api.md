# IAM — App Module API

Module `app` quản lý cấu hình các **SSO App** trong service IAM. Mỗi App đại diện cho một ứng dụng client tích hợp Google SSO với IAM, định nghĩa các ràng buộc về domain email, origin được phép, role/orgId mặc định cho user mới, và webhook để FE đồng bộ user lifecycle.

Toàn bộ endpoint đều yêu cầu **JWT auth** + **universe role** (`universe.owner`). Guards `JwtAuthGuard` + `UniverseRoleGuard` được apply ở cấp class; `@RequireUniverseRole()` được apply trên từng handler.

---

## 1. Entity Schema

Collection: `apps`

### Enum `AppStatus`

| Giá trị | Ý nghĩa |
|---------|---------|
| `active` | App đang hoạt động — cho phép SSO |
| `inactive` | App bị tắt — SSO sẽ trả error `app_not_found` |

### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `name` | `string` | ✓ | Tên hiển thị của App | `"Kaisar Platform"` |
| `description` | `string` | ✗ | Mô tả App | `"Kaisar internal portal"` |
| `allowedDomains` | `string[]` | ✓ (có thể rỗng) | Danh sách domain email được phép SSO. Rỗng = không restrict domain | `["kaisar.io", "x-or.cloud"]` |
| `defaultOrgId` | `string` | ✓ | OrgId được gán cho user Google SSO mới tạo qua App này | `"691eb9e6517f917943ae1f9d"` |
| `defaultRole` | `string` | ✓ | Role mặc định gán cho user mới (default `organization.viewer`) | `"organization.viewer"` |
| `ssoEnabled` | `boolean` | ✗ | Bật Google SSO cho App (default `true`) | `true` |
| `allowOrigins` | `string[]` | ✗ | Whitelist FE origin được phép redirect sau SSO. Rỗng = không restrict | `["https://app.example.com"]` |
| `webhookUrl` | `string \| null` | ✗ | URL nhận webhook khi user lifecycle event xảy ra. `null` = không gửi webhook | `"https://dgt.example.com/iam/webhook"` |
| `webhookSecret` | `string \| null` | ✗ | Secret để ký HMAC-SHA256 cho webhook payload | `"whsec_abc123..."` |
| `status` | `AppStatus` | ✗ | Trạng thái App (default `active`) | `"active"` |

### Trường kế thừa từ `BaseSchema`

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `_id` | `ObjectId` | ID của document |
| `metadata` | `object` | Tự do — payload metadata |
| `owner` | `{ orgId, groupId, userId, agentId, appId }` | Context khi tạo App |
| `createdBy` | `object` | Snapshot user tạo |
| `updatedBy` | `object` | Snapshot user cập nhật gần nhất |
| `isDeleted` | `boolean` | Soft-delete flag |
| `deletedAt` | `Date \| null` | Thời điểm soft-delete |
| `createdAt` | `Date` | Tự sinh |
| `updatedAt` | `Date` | Tự sinh |

---

## 2. API Endpoints

Base path: `/apps`. Tất cả endpoint yêu cầu header `Authorization: Bearer <jwt>`.

---

### `POST /apps` — Tạo App mới

**Guards:** `JwtAuthGuard` + `UniverseRoleGuard` + `@RequireUniverseRole()`

#### Body

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `name` | `string` | ✓ | `"Kaisar Platform"` |
| `description` | `string` | ✗ | `"Kaisar internal portal"` |
| `allowedDomains` | `string[]` | ✓ | `["kaisar.io", "x-or.cloud"]` |
| `defaultOrgId` | `string` | ✓ | `"691eb9e6517f917943ae1f9d"` |
| `defaultRole` | `string` | ✗ | `"organization.viewer"` |
| `ssoEnabled` | `boolean` | ✗ | `true` |
| `allowOrigins` | `string[]` (URL) | ✗ | `["https://app.example.com"]` |
| `webhookUrl` | `string` (URL) | ✗ | `"https://dgt.example.com/iam/webhook"` |
| `webhookSecret` | `string` | ✗ | `"whsec_abc123"` |

#### Request Sample

```json
{
  "name": "Kaisar Platform",
  "description": "Kaisar internal SSO portal",
  "allowedDomains": ["kaisar.io", "x-or.cloud"],
  "defaultOrgId": "691eb9e6517f917943ae1f9d",
  "defaultRole": "organization.viewer",
  "ssoEnabled": true,
  "allowOrigins": ["https://app.kaisar.io"],
  "webhookUrl": "https://dgt.kaisar.io/iam/webhook",
  "webhookSecret": "whsec_d4f8a1c2b3e6"
}
```

#### Response

**`201 Created`**
```json
{
  "_id": "691f0a3e517f917943ae20a1",
  "name": "Kaisar Platform",
  "description": "Kaisar internal SSO portal",
  "allowedDomains": ["kaisar.io", "x-or.cloud"],
  "defaultOrgId": "691eb9e6517f917943ae1f9d",
  "defaultRole": "organization.viewer",
  "ssoEnabled": true,
  "allowOrigins": ["https://app.kaisar.io"],
  "webhookUrl": "https://dgt.kaisar.io/iam/webhook",
  "webhookSecret": "whsec_d4f8a1c2b3e6",
  "status": "active",
  "owner": {
    "orgId": "691eb9e6517f917943ae1f9d",
    "groupId": "",
    "userId": "691eb9c1517f917943ae1f88",
    "agentId": "",
    "appId": ""
  },
  "createdBy": { "userId": "691eb9c1517f917943ae1f88", "username": "admin@x-or.cloud" },
  "updatedBy": {},
  "isDeleted": false,
  "metadata": {},
  "createdAt": "2026-05-10T08:12:34.567Z",
  "updatedAt": "2026-05-10T08:12:34.567Z"
}
```

**`400 Bad Request`** — body không hợp lệ
```json
{
  "statusCode": 400,
  "message": ["name should not be empty", "defaultOrgId should not be empty"],
  "error": "Bad Request",
  "correlationId": "c-2f8a4d11"
}
```

**`401 Unauthorized`** — thiếu/sai JWT
```json
{ "statusCode": 401, "message": "Unauthorized", "correlationId": "c-..." }
```

**`403 Forbidden`** — JWT không có role `universe.owner`
```json
{ "statusCode": 403, "message": "Universe role required", "correlationId": "c-..." }
```

---

### `GET /apps` — Liệt kê apps (phân trang + filter)

**Guards:** `JwtAuthGuard` + `UniverseRoleGuard` + `@RequireUniverseRole()`

#### Query String

Endpoint dùng `parseQueryString` — hỗ trợ filter theo field bất kỳ và các operator MongoDB:

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `page` | `number` | Trang hiện tại (mặc định `1`) | `1` |
| `limit` | `number` | Số bản ghi/trang (mặc định `10`) | `20` |
| `sort` | `string` | `field:asc` / `field:desc`, nhiều field cách nhau bằng `,` | `createdAt:desc,name:asc` |
| `<field>=<value>` | — | So sánh bằng exact match | `status=active` |
| `<field>:gt=<value>` | — | `$gt` | `createdAt:gt=2026-01-01` |
| `<field>:gte=<value>` | — | `$gte` | — |
| `<field>:lt=<value>` | — | `$lt` | — |
| `<field>:lte=<value>` | — | `$lte` | — |
| `<field>:ne=<value>` | — | `$ne` | `status:ne=inactive` |
| `<field>:in=a,b,c` | — | `$in` | `status:in=active,inactive` |
| `<field>:nin=a,b` | — | `$nin` | — |
| `<field>:regex=<value>` | — | `$regex`, case-insensitive | `name:regex=kaisar` |

#### Request Sample

```
GET /apps?page=1&limit=10&sort=createdAt:desc&status=active
```

#### Response

**`200 OK`**
```json
{
  "data": [
    {
      "_id": "691f0a3e517f917943ae20a1",
      "name": "Kaisar Platform",
      "description": "Kaisar internal SSO portal",
      "allowedDomains": ["kaisar.io"],
      "defaultOrgId": "691eb9e6517f917943ae1f9d",
      "defaultRole": "organization.viewer",
      "ssoEnabled": true,
      "allowOrigins": ["https://app.kaisar.io"],
      "webhookUrl": "https://dgt.kaisar.io/iam/webhook",
      "webhookSecret": "whsec_d4f8a1c2b3e6",
      "status": "active",
      "owner": { "orgId": "691eb9e6517f917943ae1f9d", "groupId": "", "userId": "...", "agentId": "", "appId": "" },
      "metadata": {},
      "createdAt": "2026-05-10T08:12:34.567Z",
      "updatedAt": "2026-05-10T08:12:34.567Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1 },
  "statistics": { "total": 1 }
}
```

> Trường `isDeleted`, `deletedAt`, `password`, `createdBy`, `updatedBy` bị strip khỏi list response (xem [base.service.ts](../../../libs/base/src/lib/base.service.ts#L153-L159)).

**`401 Unauthorized`** / **`403 Forbidden`** — như endpoint Create.

---

### `GET /apps/:id` — Lấy chi tiết App

**Guards:** `JwtAuthGuard` + `UniverseRoleGuard` + `@RequireUniverseRole()`

#### Params

| Tên | Kiểu | Ý nghĩa |
|-----|------|---------|
| `id` | `string` (ObjectId) | ID của App |

#### Request Sample

```
GET /apps/691f0a3e517f917943ae20a1
```

#### Response

**`200 OK`**
```json
{
  "_id": "691f0a3e517f917943ae20a1",
  "name": "Kaisar Platform",
  "description": "Kaisar internal SSO portal",
  "allowedDomains": ["kaisar.io", "x-or.cloud"],
  "defaultOrgId": "691eb9e6517f917943ae1f9d",
  "defaultRole": "organization.viewer",
  "ssoEnabled": true,
  "allowOrigins": ["https://app.kaisar.io"],
  "webhookUrl": "https://dgt.kaisar.io/iam/webhook",
  "webhookSecret": "whsec_d4f8a1c2b3e6",
  "status": "active",
  "createdAt": "2026-05-10T08:12:34.567Z",
  "updatedAt": "2026-05-10T08:12:34.567Z"
}
```

**`403 Forbidden`** — App không tồn tại / đã soft-delete / không có quyền đọc
```json
{
  "statusCode": 403,
  "message": "Entity with ID 691f0a3e517f917943ae20a1 not found or access denied",
  "error": "Forbidden",
  "correlationId": "c-..."
}
```

> ⚠️ `BaseService.findById` ném `ForbiddenException` (HTTP 403) cho cả 3 trường hợp: ID không hợp lệ, không có quyền đọc, hoặc entity không tồn tại. Không có `404 Not Found`.

**`401 Unauthorized`** — như trên.

---

### `PUT /apps/:id` — Cập nhật App

**Guards:** `JwtAuthGuard` + `UniverseRoleGuard` + `@RequireUniverseRole()`

#### Params

| Tên | Kiểu | Ý nghĩa |
|-----|------|---------|
| `id` | `string` (ObjectId) | ID của App |

#### Body

Tất cả trường đều **optional**:

| Trường | Kiểu | Ví dụ |
|--------|------|-------|
| `name` | `string` | `"Kaisar Platform v2"` |
| `description` | `string` | `"Updated description"` |
| `allowedDomains` | `string[]` | `["kaisar.io"]` |
| `defaultOrgId` | `string` | `"691eb9e6517f917943ae1f9d"` |
| `defaultRole` | `string` | `"organization.member"` |
| `ssoEnabled` | `boolean` | `false` |
| `status` | `AppStatus` | `"inactive"` |
| `allowOrigins` | `string[]` | `["https://app.example.com"]` |
| `webhookUrl` | `string` (URL) | `"https://new.example.com/webhook"` |
| `webhookSecret` | `string` | `"whsec_new"` |

#### Request Sample

```json
{
  "ssoEnabled": false,
  "status": "inactive"
}
```

#### Response

**`200 OK`** — trả document App sau khi update (cùng cấu trúc `GET /apps/:id`).

**`400 Bad Request`** — body không hợp lệ.
**`404 Not Found`** — App không tồn tại.
**`401 Unauthorized`** / **`403 Forbidden`** — như trên.

---

### `DELETE /apps/:id` — Xoá App (soft delete)

**Guards:** `JwtAuthGuard` + `UniverseRoleGuard` + `@RequireUniverseRole()`

#### Params

| Tên | Kiểu | Ý nghĩa |
|-----|------|---------|
| `id` | `string` (ObjectId) | ID của App |

#### Request Sample

```
DELETE /apps/691f0a3e517f917943ae20a1
```

#### Response

**`200 OK`**
```json
{ "message": "App deleted successfully" }
```

**`404 Not Found`** — App không tồn tại.
**`401 Unauthorized`** / **`403 Forbidden`** — như trên.

---

## 3. Bảng tóm tắt endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| POST | `/apps` | Tạo App mới |
| GET | `/apps` | Liệt kê apps (phân trang) |
| GET | `/apps/:id` | Lấy chi tiết App |
| PUT | `/apps/:id` | Cập nhật App |
| DELETE | `/apps/:id` | Soft-delete App |

---

## 4. Ghi chú đặc biệt

### Soft delete

App sử dụng cơ chế soft delete của `BaseService`: `DELETE /apps/:id` chỉ set `isDeleted=true` + `deletedAt`, document không bị xoá vật lý. Các endpoint `findAll`/`findById` và logic SSO (`validateSsoAccess`) đều filter `isDeleted: false`.

### Cú pháp query string

Endpoint `GET /apps` dùng `parseQueryString` (`@hydrabyte/base`) để parse query params thành `FindManyOptions`. **Không** dùng JSON object cho `sort`/`filter` — dùng cú pháp `field:asc/desc` cho sort và `field:operator=value` cho filter (xem bảng operator ở mục API).

### Liên kết với Google SSO flow

`AppService.validateSsoAccess(appId, email, callbackOrigin)` được `AuthService` gọi trong Google SSO callback. Logic kiểm tra theo thứ tự, trả về error code đầu tiên gặp:

| Điều kiện | Error code |
|-----------|------------|
| Không tìm thấy App hoặc `isDeleted: true` | `app_not_found` |
| `status !== 'active'` | `app_not_found` |
| `ssoEnabled === false` | `sso_disabled` |
| `callbackOrigin` không nằm trong `allowOrigins` (khi `allowOrigins` không rỗng) | `origin_not_allowed` |
| Email domain không nằm trong `allowedDomains` (khi `allowedDomains` không rỗng) | `domain_not_allowed` |

`allowedDomains` rỗng = cho phép mọi domain. `allowOrigins` rỗng = không restrict origin.

Tham khảo: [`docs/iam/GOOGLE-SSO-INTEGRATION.md`](../GOOGLE-SSO-INTEGRATION.md).

### Webhook user lifecycle

`AppWebhookService` gửi webhook **không đồng bộ** (fire-and-forget, timeout 5s) đến `webhookUrl` của App khi user lifecycle event xảy ra. Có 2 cách kích hoạt:

- **Direct fire** — gọi từ flow đã có App object (ví dụ Google SSO tạo user mới): `fireUserCreated/Updated/Deleted(app, payload)`
- **Org-scoped fire** — query mọi App active trong cùng `owner.orgId` có `webhookUrl != null` rồi gửi: `fireUserCreatedForOrg/UpdatedForOrg/DeletedForOrg(orgId, payload)`

Events:

| Event | Payload |
|-------|---------|
| `user.created` | `{ userId, username, orgId, role, provider, fullname, status? }` |
| `user.updated` | `{ userId, username, orgId, updatedFields?, role?, status?, fullname? }` |
| `user.deleted` | `{ userId, username, orgId, deletedBy }` |

Body request gửi tới webhook:
```json
{
  "event": "user.created",
  "timestamp": "2026-05-10T08:15:00.000Z",
  "data": { "userId": "...", "username": "...", "orgId": "...", "role": "...", "provider": "google", "fullname": "..." }
}
```

Headers:
- `Content-Type: application/json`
- `X-IAM-Event: user.created` (hoặc tên event tương ứng)
- `X-IAM-Signature: sha256=<hex>` — chỉ khi App có `webhookSecret`. Chữ ký = HMAC-SHA256 của raw JSON body với key là `webhookSecret`.

Webhook lỗi (timeout/non-2xx) chỉ ghi log warning, **không retry** và **không block** flow chính.

### Field nhạy cảm trong list response

`webhookSecret` được trả nguyên giá trị trong cả `findOne` lẫn `findAll` (không bị mask). Cần cân nhắc khi expose API này cho client không phải `universe.owner`.
