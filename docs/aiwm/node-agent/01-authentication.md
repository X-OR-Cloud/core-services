# Authentication

## Credentials

Mỗi node có cặp `apiKey` + `secret` (UUID format), được tạo khi node được tạo qua API. Secret chỉ hiển thị MỘT LẦN, cần lưu lại ngay.

- `apiKey`: dùng để tìm node trong DB (indexed, unique)
- `secret`: hash bằng bcrypt, dùng để xác thực

## 1. Login

```
POST /nodes/auth/login
Content-Type: application/json
```

**Request:**
```json
{
  "apiKey": "f38057be-d172-4a31-9e5d-aae82ccd1754",
  "secret": "f568b866-a0fa-4515-8a75-c7ee8761cee0"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "node": {
    "_id": "699a418e3e8a035f1d16eac3",
    "name": "test-node-local",
    "status": "pending",
    "roles": ["worker"],
    "orgId": "691eb9e6517f917943ae1f9d"
  }
}
```

**Error (401):** Invalid apiKey or secret.

## 2. JWT Token Payload

Token chứa các thông tin sau (decode bằng jsonwebtoken hoặc tương tự):

| Field | Type | Description |
|-------|------|-------------|
| `sub` | string | Node ID (MongoDB _id) |
| `type` | string | Luôn là `"node"` |
| `username` | string | Tên node |
| `status` | string | Trạng thái hiện tại |
| `roles` | string[] | Danh sách roles (`controller`, `worker`, `proxy`, `storage`) |
| `orgId` | string | Organization ID |
| `iat` | number | Thời điểm tạo token (unix timestamp) |
| `exp` | number | Thời điểm hết hạn (unix timestamp) |

**Token lifetime**: 3600 giây (1 giờ).

## 3. Token Refresh

Gọi refresh TRƯỚC khi token hết hạn. Có grace period 5 phút sau khi hết hạn vẫn refresh được.

```
POST /nodes/auth/refresh
Content-Type: application/json
```

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs... (token hiện tại)"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs... (token mới)",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

**Error (401):** Token hết hạn quá 5 phút hoặc không hợp lệ.

## 4. Token Refresh Strategy

Node Agent nên implement logic refresh token tự động:

```
Token lifetime: 3600s (1h)
Grace period:   300s  (5min after expiry)

Timeline:
├── 0s      Token issued
├── 3000s   ← Recommended: refresh here (5 min before expiry)
├── 3600s   Token expired
├── 3900s   ← Last chance: grace period ends
└── 3901s   Token rejected, must re-login
```

**Recommended flow:**
1. Sau khi login, lưu `accessToken` và `expiresIn`
2. Tính thời điểm refresh: `iat + expiresIn - 300` (5 phút trước khi hết hạn)
3. Khi đến thời điểm refresh, gọi `/nodes/auth/refresh`
4. Nếu refresh fail → re-login bằng apiKey + secret
5. Sau khi có token mới → reconnect WebSocket nếu cần

## 5. Token Usage

Token được sử dụng ở 2 nơi:

1. **WebSocket connection**: Truyền qua `auth.token` khi connect
2. **MONA metrics push**: Truyền qua `Authorization: Bearer <token>` header
