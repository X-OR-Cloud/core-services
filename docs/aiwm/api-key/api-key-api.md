# API Key — Tài liệu kỹ thuật

## 1. Entity Schema

`ApiKey` là API key cấp tổ chức (org-level) dùng để xác thực các API call tới AIWM thay thế cho JWT. Chỉ `keyHash` (SHA-256) được lưu trong database; plain text key chỉ được trả về một lần duy nhất khi tạo.

**Định dạng key:** `xai_<8-char-prefix>.<32-char-random>`
Ví dụ: `xai_a1b2c3d4.k9mN2xPqR7vL4wYtJ8uZnCeHsAbF1dGo`

### Enums

| Trường | Giá trị | Ý nghĩa |
|--------|---------|---------|
| `status` | `active` | Key đang hoạt động |
| `status` | `revoked` | Key đã bị thu hồi |

### Scopes

| Giá trị | Ý nghĩa |
|---------|---------|
| `all` | Toàn quyền truy cập AIWM API |
| `deployment:<id>` | Chỉ được gọi `/deployments/<id>/inference/*` |

### Fields

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa | Ví dụ |
|------------|-------------|---------|---------|-------|
| `name` | `string` | ✅ | Tên hiển thị của API key | `"Production App"` |
| `keyHash` | `string` | ✅ | SHA-256 của full key, dùng để xác thực | `"e3b0c44298fc1c149..."` |
| `keyPrefix` | `string` | ✅ | 8 ký tự đầu sau `xai_`, chỉ dùng để nhận dạng khi liệt kê | `"a1b2c3d4"` |
| `scopes` | `string[]` | ✅ | Danh sách phạm vi truy cập | `["all"]` |
| `status` | `string` | ✅ | Trạng thái key: `active` hoặc `revoked` | `"active"` |
| `lastUsedAt` | `Date \| null` | — | Thời điểm key được sử dụng gần nhất (cập nhật async) | `"2026-03-10T08:00:00.000Z"` |
| `expiresAt` | `Date \| null` | — | Thời điểm hết hạn; `null` = không hết hạn | `"2027-01-01T00:00:00.000Z"` |

### Trường kế thừa từ BaseSchema

| Tên trường | Kiểu | Ý nghĩa |
|------------|------|---------|
| `owner` | `object` | Context của tổ chức tạo key (`orgId`, `userId`, `groupId`, `agentId`, `appId`) |
| `createdBy` | `object` | RequestContext của người tạo |
| `updatedBy` | `object` | RequestContext của người cập nhật gần nhất |
| `isDeleted` | `boolean` | Soft delete flag |
| `createdAt` | `Date` | Thời điểm tạo |
| `updatedAt` | `Date` | Thời điểm cập nhật gần nhất |

---

## 2. API Endpoints
> **URL:** https://api.x-or.cloud/dev/aiwm
> **Xác thực:** Tất cả endpoints yêu cầu JWT Bearer token (`Authorization: Bearer <jwt>`).
> **Phân quyền:** Chỉ `organization.owner` mới được tạo API key (endpoint `POST /api-keys`). Các endpoint còn lại yêu cầu JWT hợp lệ.

---

### `POST /api-keys`

Tạo một API key mới cho tổ chức. Full key chỉ được trả về **một lần duy nhất** — cần lưu trữ ngay lập tức.

**Yêu cầu phân quyền:** `organization.owner` only.

#### Body

| Trường | Kiểu | Bắt buộc | Ví dụ | Ghi chú |
|--------|------|---------|-------|---------|
| `name` | `string` | ✅ | `"Production App"` | 1–100 ký tự |
| `scopes` | `string[]` | — | `["all"]` | Mặc định: `["all"]`. Ít nhất 1 phần tử nếu cung cấp |
| `expiresAt` | `string` (ISO 8601) | — | `"2027-01-01T00:00:00.000Z"` | Bỏ trống = key không hết hạn |

#### Request Sample

```json
{
  "name": "Production App",
  "scopes": ["all"],
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

#### Response

**201 Created — Tạo thành công**

```json
{
  "_id": "68a1b2c3d4e5f6a7b8c9d0e1",
  "name": "Production App",
  "keyPrefix": "a1b2c3d4",
  "scopes": ["all"],
  "status": "active",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "key": "xai_a1b2c3d4.k9mN2xPqR7vL4wYtJ8uZnCeHsAbF1dGo"
}
```

> ⚠️ Trường `key` chỉ xuất hiện trong response này. Sau khi tạo, hệ thống không còn lưu plain text — không thể khôi phục lại.

**400 Bad Request — Dữ liệu không hợp lệ**

```json
{
  "statusCode": 400,
  "message": ["name must be longer than or equal to 1 characters"],
  "error": "Bad Request"
}
```

**401 Unauthorized — Token không hợp lệ hoặc thiếu**

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**403 Forbidden — Không đủ quyền**

```json
{
  "statusCode": 403,
  "message": "Only organization owners can create API keys",
  "error": "Forbidden"
}
```

---

### `GET /api-keys`

Liệt kê tất cả API key của tổ chức hiện tại. Trả về theo thứ tự `createdAt` giảm dần.

> **Bảo mật:** Response **không bao gồm** `keyHash`, `isDeleted`, `createdBy`, `updatedBy`. `key` (plain text) không bao giờ được trả về trong API này.

#### Response

**200 OK**

```json
[
  {
    "_id": "68a1b2c3d4e5f6a7b8c9d0e1",
    "name": "Production App",
    "keyPrefix": "a1b2c3d4",
    "scopes": ["all"],
    "status": "active",
    "lastUsedAt": "2026-03-10T08:00:00.000Z",
    "expiresAt": "2027-01-01T00:00:00.000Z",
    "createdAt": "2026-03-01T00:00:00.000Z"
  },
  {
    "_id": "68f9e8d7c6b5a4b3c2d1e0f9",
    "name": "Deployment-only Key",
    "keyPrefix": "f9e8d7c6",
    "scopes": ["deployment:507f1f77bcf86cd799439011"],
    "status": "revoked",
    "lastUsedAt": null,
    "expiresAt": null,
    "createdAt": "2026-02-15T00:00:00.000Z"
  }
]
```

**401 Unauthorized**

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

---

### `DELETE /api-keys/:id`

Thu hồi (revoke) một API key. Key không bị xóa khỏi database mà chuyển sang `status: "revoked"`.

> Key bị revoke sẽ không thể dùng để xác thực nữa. Thao tác này **không thể hoàn tác**.

#### Params

| Tên | Kiểu | Ý nghĩa |
|-----|------|---------|
| `id` | `string` (MongoDB ObjectId) | ID của API key cần thu hồi |

#### Request Sample

```
DELETE /api-keys/68a1b2c3d4e5f6a7b8c9d0e1
Authorization: Bearer <jwt>
```

#### Response

**200 OK — Thu hồi thành công**

```json
{
  "message": "API key revoked successfully"
}
```

**401 Unauthorized**

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**404 Not Found — Key không tồn tại hoặc thuộc tổ chức khác**

```json
{
  "statusCode": 404,
  "message": "API key not found",
  "error": "Not Found"
}
```

---

## 3. Bảng tóm tắt endpoints

| Method | URL | Mô tả | Phân quyền |
|--------|-----|-------|------------|
| `POST` | `/api-keys` | Tạo API key mới | `org.owner` only |
| `GET` | `/api-keys` | Liệt kê tất cả API key của org | JWT required |
| `DELETE` | `/api-keys/:id` | Thu hồi API key | JWT required |

---

## 4. Ghi chú đặc biệt

### Xác thực bằng API Key (CombinedAuthGuard)

Ngoài JWT, các inference endpoint của AIWM hỗ trợ xác thực bằng API key thông qua `CombinedAuthGuard`. Khi xác thực thành công, hệ thống xây dựng `RequestContext` từ metadata của key với `roles: ['organization.owner']`.

**Quy trình xác thực:**
1. Hash raw key bằng SHA-256
2. Tra cứu `keyHash` trong DB với `status: 'active'` và `isDeleted: false`
3. Kiểm tra `expiresAt` (nếu có)
4. Kiểm tra scope: `all` → toàn quyền; `deployment:<id>` → chỉ deployment đó
5. Cập nhật `lastUsedAt` async (non-blocking, không ảnh hưởng response time)

### Bảo mật key

- **Không bao giờ lưu plain text** — chỉ `keyHash` (SHA-256) được persist trong DB
- `keyHash` bị loại bỏ khỏi tất cả list/get response bằng `.select('-keyHash ...')`
- Plain text key chỉ xuất hiện trong `POST /api-keys` response (`key` field)
- `keyPrefix` (8 ký tự đầu) được lưu để giúp người dùng nhận dạng key trong danh sách

### Soft delete

Module này **không** sử dụng soft delete thông thường. Thay vào đó, key bị "xóa" thông qua revoke (`status: 'revoked'`). Key revoked vẫn hiển thị trong `GET /api-keys`.

### Indexes MongoDB

```
{ keyHash: 1 }               # unique — tra cứu nhanh khi xác thực
{ 'owner.orgId': 1, status: 1 }  # query list theo org + status
{ scopes: 1 }                # query theo scope
```
