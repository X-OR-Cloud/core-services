# API — Agent External Signing Keys

Quản lý public key của đối tác dùng để tự ký anonymous token (ES256). Mỗi key gắn với một agent cụ thể.

Base URL: `https://xsai-api.x-or.cloud/aiwm`

Tất cả endpoints yêu cầu xác thực: `Authorization: Bearer <JWT>` (role `org.owner` hoặc `org.editor`).

---

## Schema — ExternalSigningKeyEntry

Field được lưu dưới dạng mảng nhúng trong Agent document (`externalSigningKeys`, `select: false`).

| Trường | Kiểu | Bắt buộc | Mô tả | Ví dụ |
|--------|------|----------|-------|-------|
| `keyId` | string | ✓ | ID do đối tác tự đặt, unique trong agent. Dùng trong JWT header `kid`. | `"prod-key-001"` |
| `publicKey` | string | ✓ | EC public key dạng PEM (SPKI format). Chỉ lưu, không trả về API. | `"-----BEGIN PUBLIC KEY-----\n..."` |
| `algorithm` | string | ✓ | Luôn là `"ES256"` | `"ES256"` |
| `label` | string | — | Nhãn mô tả do người dùng đặt | `"Production Key Jan 2026"` |
| `createdAt` | Date | ✓ | Thời điểm thêm key | `"2026-03-28T10:00:00.000Z"` |
| `expiresAt` | Date | — | Thời điểm key hết hạn. `null` = không hết hạn. | `"2027-01-01T00:00:00.000Z"` |
| `revokedAt` | Date | — | Thời điểm revoke. Có giá trị = key đã bị thu hồi. | `"2026-06-01T08:00:00.000Z"` |

**`isActive`** (computed, không lưu DB): `true` khi `revokedAt` không tồn tại VÀ (`expiresAt` chưa đến hoặc không có).

---

## Endpoints

### POST `/agents/:id/signing-keys`

Thêm public key mới cho agent.

**Params**

| Tên | Kiểu | Mô tả |
|-----|------|-------|
| `id` | string | Agent ID hoặc agent code |

**Body**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `keyId` | string | ✓ | ID tự đặt. Trả lỗi `400` nếu đã tồn tại `keyId` active trong agent. |
| `publicKey` | string | ✓ | EC public key PEM. Trả lỗi `400` nếu không phải EC key hợp lệ. |
| `label` | string | — | Nhãn mô tả |
| `expiresAt` | string (ISO 8601) | — | Thời hạn key. Bỏ trống = không hết hạn. |

**Response `201`**

```json
{
  "keyId": "prod-key-001",
  "algorithm": "ES256",
  "label": "Production Key Jan 2026",
  "createdAt": "2026-03-28T10:00:00.000Z",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "isActive": true
}
```

> `revokedAt` không xuất hiện trong response này (key mới luôn active).

**Response `400` — Public key không hợp lệ**

```json
{
  "statusCode": 400,
  "message": "Invalid public key: must be a valid EC public key in PEM format"
}
```

**Response `400` — keyId đã tồn tại**

```json
{
  "statusCode": 400,
  "message": "Key with keyId \"prod-key-001\" already exists and is active"
}
```

**Response `404` — Agent không tồn tại**

```json
{
  "statusCode": 404,
  "message": "Agent with ID 683a1f77bcf86cd799439011 not found"
}
```

---

### GET `/agents/:id/signing-keys`

Lấy danh sách tất cả public key của agent (kể cả đã revoke / hết hạn).

**Params**

| Tên | Kiểu | Mô tả |
|-----|------|-------|
| `id` | string | Agent ID hoặc agent code |

**Response `200`**

```json
{
  "items": [
    {
      "keyId": "prod-key-001",
      "algorithm": "ES256",
      "label": "Production Key Jan 2026",
      "createdAt": "2026-03-28T10:00:00.000Z",
      "expiresAt": "2027-01-01T00:00:00.000Z",
      "revokedAt": null,
      "isActive": true
    },
    {
      "keyId": "old-key-2025",
      "algorithm": "ES256",
      "label": "Legacy Key",
      "createdAt": "2025-06-01T00:00:00.000Z",
      "expiresAt": null,
      "revokedAt": "2026-01-10T09:30:00.000Z",
      "isActive": false
    }
  ],
  "total": 2
}
```

> `publicKey` (PEM) **không được trả về** trong response này.

**Response `404`**

```json
{
  "statusCode": 404,
  "message": "Agent with ID 683a1f77bcf86cd799439011 not found"
}
```

---

### DELETE `/agents/:id/signing-keys/:keyId`

Thu hồi một public key. Tất cả token đã ký bằng private key tương ứng sẽ bị từ chối ngay lập tức.

**Params**

| Tên | Kiểu | Mô tả |
|-----|------|-------|
| `id` | string | Agent ID hoặc agent code |
| `keyId` | string | Key ID cần thu hồi |

**Response `204 No Content`** — Thu hồi thành công, không có body.

**Response `404` — Key không tồn tại hoặc đã bị thu hồi**

```json
{
  "statusCode": 404,
  "message": "Signing key \"prod-key-001\" not found or already revoked"
}
```

**Response `404` — Agent không tồn tại**

```json
{
  "statusCode": 404,
  "message": "Agent with ID 683a1f77bcf86cd799439011 not found"
}
```

---

## Bảng tóm tắt

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/agents/:id/signing-keys` | Thêm public key |
| `GET` | `/agents/:id/signing-keys` | Danh sách tất cả key |
| `DELETE` | `/agents/:id/signing-keys/:keyId` | Thu hồi key |

---

## Ghi chú

- **`publicKey` (PEM) không bao giờ được trả về** qua API sau khi upload — chỉ lưu phía server để verify. List response chỉ trả metadata.
- **`keyId` cho phép trùng nếu key cũ đã bị revoke** — validation chỉ chặn duplicate `keyId` khi key đang active (`revokedAt` chưa set).
- **`isActive`** là field computed: `!revokedAt && (!expiresAt || expiresAt > now)`. FE nên dùng field này thay vì tự tính.
- **Revoke là vĩnh viễn** — không có API restore. Nếu cần dùng lại `keyId`, phải upload public key mới.
- **Param `:id`** hỗ trợ cả Agent ObjectId lẫn agent `code` (ví dụ: `PM-BOT-01`) thông qua `resolveAgentId`.
