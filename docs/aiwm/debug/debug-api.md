# API — Debug Tools

Nhóm endpoint hỗ trợ team dev và đối tác debug tích hợp External Signing Key.

Base URL: `https://xsai-api.x-or.cloud/aiwm`

> **Không yêu cầu xác thực.** Các endpoint này dành cho mục đích debug, không thao tác dữ liệu production.

---

## Bảng tóm tắt

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/debug/ec-keypair/generate` | Sinh ephemeral ES256 key pair + example code |
| `POST` | `/debug/ec-keypair/sign-token` | Ký anonymous token từ private key |
| `POST` | `/debug/agents/:id/signing-keys/verify-token` | Verify token bằng public key đã đăng ký trong DB |

---

## POST `/debug/ec-keypair/generate`

Sinh một cặp EC P-256 key pair ephemeral (không lưu DB) kèm example code Node.js. Dùng để xem format key và code mẫu trước khi đối tác tự sinh key.

**Không có request body.**

### Response `200`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `suggestedKeyId` | string | Key ID gợi ý, dùng làm `kid` trong JWT header |
| `publicKey` | string | EC public key PEM (SPKI format) — upload lên AIWM Portal |
| `privateKey` | string | EC private key PEM (PKCS8 format) — dùng để ký token |
| `exampleCode` | string | Example Node.js code ký token với cặp key này |
| `disclaimer` | string | Cảnh báo không dùng key này trong production |

```json
{
  "suggestedKeyId": "key-1743160800000",
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsR11B61dXZH9d2dXqQkg9aoWrTWc\nvDKnLAsmzWmxR+hGUbdekAEM3M3WB6VQLxAOxIqiaCsA/g4UlQ7hA9T0pg==\n-----END PUBLIC KEY-----",
  "privateKey": "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg2cDqcJGV0SWeq+ja\n3uChrDSOoUXtxzNTOiEd5ULZBxShRANCAASxHXUHrV1dkf13Z1epCSD1qhatNZy8\nMqcsCybNabFH6EZRt16QAQzczdYHpVAvEA7EiqJoKwD+DhSVDuED1PSm\n-----END PRIVATE KEY-----",
  "exampleCode": "const jwt = require('jsonwebtoken')\nconst fs  = require('fs')\n...",
  "disclaimer": "This key pair is ephemeral and generated for demonstration only. Do NOT use these keys in production. Generate your own key pair locally and keep the private key secret on your server."
}
```

---

## POST `/debug/ec-keypair/sign-token`

Ký một anonymous JWT token (ES256) từ private key. Dùng để test token trước khi kết nối WS.

### Body

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `privateKey` | string | ✓ | EC private key PEM (PKCS8). Phải là P-256 / prime256v1. |
| `agentId` | string | ✓ | Agent ID trên AIWM |
| `kid` | string | ✓ | Key ID — phải khớp với `keyId` đã upload lên Portal cho agent |
| `anonymousId` | string | — | UUID định danh user/session. Auto-generate nếu bỏ trống. |
| `expiresIn` | number | — | Thời hạn token tính bằng giây. Tối thiểu 60. Mặc định: `86400` (24h). |

```json
{
  "privateKey": "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...\n-----END PRIVATE KEY-----",
  "agentId": "69b219445f803203cf8ab6f3",
  "kid": "prod-key-001",
  "anonymousId": "fe20f674-6ba4-4030-914d-dbb69abfe50c",
  "expiresIn": 86400
}
```

### Response `200`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `token` | string | JWT token đã ký — truyền vào `StackAIChat.init({ token })` |
| `header` | object | Decoded JWT header (`alg`, `kid`, `typ`) |
| `payload` | object | Decoded JWT payload (xem bên dưới) |
| `expiresAt` | string (ISO 8601) | Thời điểm token hết hạn |

**`payload` fields:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | string | Luôn là `"anonymous"` |
| `agentId` | string | Agent ID |
| `anonymousId` | string | UUID định danh user |
| `iat` | number | Thời điểm tạo (Unix timestamp giây) |
| `exp` | number | Thời điểm hết hạn (Unix timestamp giây) |
| `iat_human` | string | `iat` dạng ISO 8601 (tiện đọc) |
| `exp_human` | string | `exp` dạng ISO 8601 (tiện đọc) |

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6InByb2Qta2V5LTAwMSJ9.eyJ0eXBlIjoiYW5vbnltb3VzIiwiYWdlbnRJZCI6IjY5YjIxOTQ0NWY4MDMyMDNjZjhhYjZmMyIsImFub255bW91c0lkIjoiZmUyMGY2NzQtNmJhNC00MDMwLTkxNGQtZGJiNjlhYmZlNTBjIiwiaWF0IjoxNzQzMTYwODAwLCJleHAiOjE3NDMyNDcyMDB9.XXXXX",
  "header": {
    "typ": "JWT",
    "alg": "ES256",
    "kid": "prod-key-001"
  },
  "payload": {
    "type": "anonymous",
    "agentId": "69b219445f803203cf8ab6f3",
    "anonymousId": "fe20f674-6ba4-4030-914d-dbb69abfe50c",
    "iat": 1743160800,
    "exp": 1743247200,
    "iat_human": "2026-03-28T10:00:00.000Z",
    "exp_human": "2026-03-29T10:00:00.000Z"
  },
  "expiresAt": "2026-03-29T10:00:00.000Z"
}
```

### Response `400` — Private key không hợp lệ

```json
{
  "statusCode": 400,
  "message": "Invalid private key: must be a valid EC private key in PEM format"
}
```

### Response `400` — Sai curve

```json
{
  "statusCode": 400,
  "message": "Private key must be EC P-256 (prime256v1) for ES256"
}
```

---

## POST `/debug/agents/:id/signing-keys/verify-token`

Verify một JWT token bằng public key đã đăng ký trong DB cho agent. Trả kết quả debug đầy đủ — không cần xác thực.

### Params

| Tên | Kiểu | Mô tả |
|-----|------|-------|
| `id` | string | Agent ID |

### Body

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `token` | string | ✓ | JWT token cần verify |

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6InByb2Qta2V5LTAwMSJ9..."
}
```

### Response `200`

Luôn trả `200` kể cả khi token không hợp lệ — kiểm tra field `valid` để biết kết quả.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `valid` | boolean | `true` nếu token hợp lệ và chưa hết hạn |
| `header` | object | Decoded JWT header |
| `payload` | object | Decoded JWT payload |
| `expiresAt` | string (ISO 8601) | Thời điểm hết hạn (rỗng nếu không decode được) |
| `expired` | boolean | Token đã hết hạn hay chưa |
| `matchedKey` | object \| null | Key đã dùng để verify (null nếu không tìm được key) |
| `error` | string | Mô tả lỗi nếu `valid = false` |

**`matchedKey` fields:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `keyId` | string | Key ID |
| `algorithm` | string | Luôn `"ES256"` |
| `label` | string | Nhãn mô tả (nếu có) |
| `createdAt` | string (ISO 8601) | Thời điểm upload key |

**Response — token hợp lệ:**

```json
{
  "valid": true,
  "header": {
    "typ": "JWT",
    "alg": "ES256",
    "kid": "prod-key-001"
  },
  "payload": {
    "type": "anonymous",
    "agentId": "69b219445f803203cf8ab6f3",
    "anonymousId": "fe20f674-6ba4-4030-914d-dbb69abfe50c",
    "iat": 1743160800,
    "exp": 1743247200
  },
  "expiresAt": "2026-03-29T10:00:00.000Z",
  "expired": false,
  "matchedKey": {
    "keyId": "prod-key-001",
    "algorithm": "ES256",
    "label": "Production Key Jan 2026",
    "createdAt": "2026-03-28T10:00:00.000Z"
  }
}
```

**Response — signature không khớp:**

```json
{
  "valid": false,
  "header": { "typ": "JWT", "alg": "ES256", "kid": "prod-key-001" },
  "payload": { "type": "anonymous", "agentId": "69b219445f803203cf8ab6f3", "anonymousId": "fe20f674-6ba4-4030-914d-dbb69abfe50c", "iat": 1743160800, "exp": 1743247200 },
  "expiresAt": "2026-03-29T10:00:00.000Z",
  "expired": false,
  "matchedKey": {
    "keyId": "prod-key-001",
    "algorithm": "ES256",
    "label": "Production Key Jan 2026",
    "createdAt": "2026-03-28T10:00:00.000Z"
  },
  "error": "Signature invalid for key \"prod-key-001\". The token was not signed by the matching private key."
}
```

**Response — không tìm thấy key (kid không khớp hoặc chưa upload):**

```json
{
  "valid": false,
  "header": { "typ": "JWT", "alg": "ES256", "kid": "prod-key-001" },
  "payload": { "type": "anonymous", "agentId": "69b219445f803203cf8ab6f3", "anonymousId": "fe20f674-6ba4-4030-914d-dbb69abfe50c", "iat": 1743160800, "exp": 1743247200 },
  "expiresAt": "2026-03-29T10:00:00.000Z",
  "expired": false,
  "matchedKey": null,
  "error": "No active signing key found for kid=\"prod-key-001\". Check the key is uploaded and not revoked."
}
```

**Response — token hết hạn (signature hợp lệ nhưng expired):**

```json
{
  "valid": false,
  "header": { "typ": "JWT", "alg": "ES256", "kid": "prod-key-001" },
  "payload": { "type": "anonymous", "agentId": "69b219445f803203cf8ab6f3", "anonymousId": "fe20f674-6ba4-4030-914d-dbb69abfe50c", "iat": 1743074400, "exp": 1743160800 },
  "expiresAt": "2026-03-28T10:00:00.000Z",
  "expired": true,
  "matchedKey": {
    "keyId": "prod-key-001",
    "algorithm": "ES256",
    "label": "Production Key Jan 2026",
    "createdAt": "2026-03-27T10:00:00.000Z"
  },
  "error": "Token has expired"
}
```

**Response — token sai format:**

```json
{
  "valid": false,
  "header": {},
  "payload": {},
  "expiresAt": "",
  "expired": false,
  "matchedKey": null,
  "error": "Invalid JWT format (expected 3 parts)"
}
```

**Response — sai algorithm (không phải ES256):**

```json
{
  "valid": false,
  "header": { "alg": "HS256" },
  "payload": {},
  "expiresAt": "",
  "expired": false,
  "matchedKey": null,
  "error": "Unsupported algorithm: HS256. Expected ES256."
}
```

### Response `404` — Agent không tồn tại

```json
{
  "statusCode": 404,
  "message": "Agent with ID 69b219445f803203cf8ab6f3 not found"
}
```

---

## Ghi chú

- **`/debug/ec-keypair/generate`** trả về `privateKey` trong response — chỉ dùng để xem format và chạy thử. Đối tác phải tự sinh key pair trên server của họ để dùng thật.
- **`/debug/ec-keypair/sign-token`** nhận `privateKey` qua HTTPS — chỉ dùng trong môi trường dev/staging để test. Không gửi production private key qua API.
- **`/debug/agents/:id/verify-token`** không yêu cầu auth và luôn trả `200` — FE kiểm tra field `valid` để xác định kết quả, kiểm tra `error` để hiển thị thông báo lỗi cụ thể.
- Khi `matchedKey` có giá trị nhưng `valid = false` — nghĩa là key đúng nhưng signature sai (private key không match).
- Khi `matchedKey = null` — nghĩa là không tìm được key nào có `kid` tương ứng, hoặc key đã bị revoke/hết hạn.
