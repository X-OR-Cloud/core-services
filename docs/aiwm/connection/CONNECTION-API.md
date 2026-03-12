# AIWM Connection Module — API Documentation

## 1. Entity Schema: `Connection`

### Ý nghĩa
`Connection` đại diện cho một kết nối bot với nền tảng nhắn tin bên ngoài (Discord, Telegram). Mỗi Connection chứa thông tin xác thực bot (`config`) và danh sách các tuyến định tuyến (`routes`) để ánh xạ kênh/server đến Agent cụ thể.

---

### Enums

#### `ConnectionProvider`
| Giá trị | Ý nghĩa |
|---------|---------|
| `discord` | Kết nối qua Discord bot |
| `telegram` | Kết nối qua Telegram bot |

#### `ConnectionStatus`
| Giá trị | Ý nghĩa |
|---------|---------|
| `active` | Bot đang chạy và nhận tin nhắn |
| `inactive` | Bot đã bị tắt thủ công |
| `error` | Bot gặp lỗi khi kết nối |

---

### Schema Fields

#### Root fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `name` | `string` | ✅ | Tên hiển thị của connection | `"My Discord Bot"` |
| `description` | `string` | ❌ | Mô tả mục đích của connection | `"Bot hỗ trợ khách hàng kênh #support"` |
| `provider` | `ConnectionProvider` | ✅ | Nền tảng nhắn tin | `"discord"` |
| `status` | `ConnectionStatus` | ✅ (default: `inactive`) | Trạng thái vận hành | `"active"` |
| `config` | `ConnectionConfig` | ✅ | Thông tin xác thực bot | *(xem bên dưới)* |
| `routes` | `ConnectionRoute[]` | ❌ | Danh sách routing rules | *(xem bên dưới)* |

#### `ConnectionConfig` (Object)

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `botToken` | `string` | ✅ | Token xác thực bot với nền tảng | `"Bot MTI3..."` (Discord) / `"7123456789:AAF..."` (Telegram) |
| `applicationId` | `string` | ❌ | Discord Application ID | `"1234567890123456789"` |
| `webhookUrl` | `string` | ❌ | URL webhook (Telegram webhook mode) | `"https://api.example.com/webhook/telegram"` |
| `pollingMode` | `boolean` | ❌ | Dùng polling thay vì webhook (Telegram) | `true` |

#### `ConnectionRoute` (Object trong mảng `routes`)

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `agentId` | `string` | ✅ | ID của Agent xử lý tin nhắn trên route này | `"665f1a2b3c4d5e6f7a8b9c0d"` |
| `guildId` | `string` | ❌ | Discord Server ID (bỏ trống = áp dụng mọi server) | `"987654321098765432"` |
| `channelId` | `string` | ❌ | ID kênh cụ thể (bỏ trống = mọi kênh) | `"123456789012345678"` |
| `botId` | `string` | ❌ | Bot ID, dùng để detect mention | `"1234567890123456789"` |
| `requireMention` | `boolean` | ❌ | Chỉ xử lý khi bot bị @mention | `true` |
| `allowAnonymous` | `boolean` | ❌ | Cho phép user không có tài khoản chat | `false` |

#### Inherited from `BaseSchema`

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `_id` | `ObjectId` | MongoDB document ID |
| `owner` | `{ orgId, userId }` | Tổ chức và người tạo |
| `createdBy` | `string` | User ID người tạo |
| `updatedBy` | `string` | User ID người cập nhật cuối |
| `isDeleted` | `boolean` | Soft delete flag |
| `createdAt` | `Date` | Thời điểm tạo |
| `updatedAt` | `Date` | Thời điểm cập nhật |

---

## 2. API Endpoints

### 2.1 Create Connection

```
POST /connections
```

**Body:**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `name` | `string` | ✅ | `"Support Bot"` |
| `description` | `string` | ❌ | `"Bot cho kênh support"` |
| `provider` | `"discord" \| "telegram"` | ✅ | `"discord"` |
| `config.botToken` | `string` | ✅ | `"Bot MTI3NjQ5..."` |
| `config.applicationId` | `string` | ❌ | `"1234567890123456789"` |
| `config.webhookUrl` | `string` | ❌ | `"https://..."` |
| `config.pollingMode` | `boolean` | ❌ | `false` |
| `routes` | `ConnectionRoute[]` | ❌ | *(xem schema)* |

**Request Sample:**
```json
{
  "name": "Support Bot",
  "description": "Bot hỗ trợ kênh Discord",
  "provider": "discord",
  "config": {
    "botToken": "Bot MTI3NjQ5ODc4OTAxMjM0NTY3",
    "applicationId": "1234567890123456789"
  },
  "routes": [
    {
      "guildId": "987654321098765432",
      "channelId": "123456789012345678",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "requireMention": false,
      "allowAnonymous": true
    }
  ]
}
```

**Response 201:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "name": "Support Bot",
  "description": "Bot hỗ trợ kênh Discord",
  "provider": "discord",
  "status": "inactive",
  "config": {
    "botToken": "Bot MTI3NjQ5ODc4OTAxMjM0NTY3",
    "applicationId": "1234567890123456789"
  },
  "routes": [
    {
      "guildId": "987654321098765432",
      "channelId": "123456789012345678",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "requireMention": false,
      "allowAnonymous": true
    }
  ],
  "owner": { "orgId": "org123", "userId": "user456" },
  "createdBy": "user456",
  "createdAt": "2026-03-12T08:00:00.000Z",
  "updatedAt": "2026-03-12T08:00:00.000Z"
}
```

**Response 400 — Validation Error:**
```json
{
  "statusCode": 400,
  "message": ["provider must be one of: discord, telegram"],
  "error": "Bad Request"
}
```

---

### 2.2 List Connections

```
GET /connections
```

**Query String:**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `page` | `number` | Trang (default: 1) | `?page=1` |
| `limit` | `number` | Số item/trang (default: 20) | `?limit=10` |
| `sort` | `string` | Sắp xếp | `?sort=createdAt:desc` |
| `provider` | `string` | Lọc theo provider | `?provider=discord` |
| `status` | `string` | Lọc theo trạng thái | `?status=active` |
| `name:regex` | `string` | Tìm theo tên | `?name:regex=support` |

> **Lưu ý:** Response **không bao gồm** trường `config` và `routes` để bảo mật `botToken` và giảm payload.

**Response 200:**
```json
{
  "data": [
    {
      "_id": "684a1b2c3d4e5f6a7b8c9d0e",
      "name": "Support Bot",
      "description": "Bot hỗ trợ kênh Discord",
      "provider": "discord",
      "status": "active",
      "owner": { "orgId": "org123", "userId": "user456" },
      "createdAt": "2026-03-12T08:00:00.000Z",
      "updatedAt": "2026-03-12T08:30:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### 2.3 Get Connection by ID

```
GET /connections/:id
```

**Params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của Connection |

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "name": "Support Bot",
  "description": "Bot hỗ trợ kênh Discord",
  "provider": "discord",
  "status": "active",
  "config": {
    "botToken": "Bot MTI3NjQ5ODc4OTAxMjM0NTY3",
    "applicationId": "1234567890123456789"
  },
  "routes": [
    {
      "guildId": "987654321098765432",
      "channelId": "123456789012345678",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "requireMention": false,
      "allowAnonymous": true
    }
  ],
  "owner": { "orgId": "org123", "userId": "user456" },
  "createdAt": "2026-03-12T08:00:00.000Z",
  "updatedAt": "2026-03-12T08:30:00.000Z"
}
```

**Response 404:**
```json
{
  "statusCode": 404,
  "message": "Connection not found",
  "error": "Not Found"
}
```

---

### 2.4 Update Connection

```
PUT /connections/:id
```

**Params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của Connection |

**Body (tất cả optional):**

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `name` | `string` | Tên mới |
| `description` | `string` | Mô tả mới |
| `status` | `"active" \| "inactive"` | Kích hoạt/tắt connection |
| `config` | `ConnectionConfig` | Cập nhật thông tin xác thực |
| `routes` | `ConnectionRoute[]` | Thay thế toàn bộ danh sách route |

**Request Sample — Kích hoạt bot:**
```json
{
  "status": "active"
}
```

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "name": "Support Bot",
  "status": "active",
  "updatedBy": "user456",
  "updatedAt": "2026-03-12T09:00:00.000Z"
}
```

---

### 2.5 Delete Connection

```
DELETE /connections/:id
```

**Params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của Connection |

> Soft delete — đặt `isDeleted: true`, không xóa khỏi DB.

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "isDeleted": true,
  "updatedAt": "2026-03-12T09:30:00.000Z"
}
```

---

### 2.6 Add Route

```
POST /connections/:id/routes
```

**Params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của Connection |

**Body:**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `agentId` | `string` | ✅ | `"665f1a2b3c4d5e6f7a8b9c0d"` |
| `guildId` | `string` | ❌ | `"987654321098765432"` |
| `channelId` | `string` | ❌ | `"123456789012345678"` |
| `botId` | `string` | ❌ | `"1234567890123456789"` |
| `requireMention` | `boolean` | ❌ | `true` |
| `allowAnonymous` | `boolean` | ❌ | `false` |

**Request Sample — Route catch-all:**
```json
{
  "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
  "allowAnonymous": true
}
```

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "routes": [
    {
      "guildId": "987654321098765432",
      "channelId": "123456789012345678",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "requireMention": false,
      "allowAnonymous": true
    },
    {
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "allowAnonymous": true
    }
  ]
}
```

---

### 2.7 Update Route

```
PUT /connections/:id/routes/:routeIndex
```

**Params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của Connection |
| `routeIndex` | `number` | Index của route trong mảng (0-based) |

**Body:** Các trường của `ConnectionRoute`, tất cả optional.

**Request Sample:**
```json
{
  "requireMention": true
}
```

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "routes": [
    {
      "guildId": "987654321098765432",
      "channelId": "123456789012345678",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "requireMention": true,
      "allowAnonymous": true
    }
  ]
}
```

**Response 404 — Index không tồn tại:**
```json
{
  "statusCode": 404,
  "message": "Route index 5 not found",
  "error": "Not Found"
}
```

---

### 2.8 Remove Route

```
DELETE /connections/:id/routes/:routeIndex
```

**Params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | ID của Connection |
| `routeIndex` | `number` | Index của route cần xóa (0-based) |

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "routes": []
}
```

---

## 3. Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/connections` | Tạo connection mới |
| `GET` | `/connections` | Danh sách connections (không có config/routes) |
| `GET` | `/connections/:id` | Chi tiết connection (có config/routes) |
| `PUT` | `/connections/:id` | Cập nhật connection |
| `DELETE` | `/connections/:id` | Xóa mềm connection |
| `POST` | `/connections/:id/routes` | Thêm route |
| `PUT` | `/connections/:id/routes/:routeIndex` | Cập nhật route theo index |
| `DELETE` | `/connections/:id/routes/:routeIndex` | Xóa route theo index |

---

## 4. Luồng hoạt động

```
Discord/Telegram ──► Adapter ──► NormalizedInbound
                                        │
                                   RoutingService
                                   (match route → agentId)
                                        │
                                  ConnectionRunner
                                  (tạo Action, tìm/tạo Conversation)
                                        │
                                    Agent xử lý
                                        │
                              ConnectionWorkerService
                              (handleOutbound → send về platform)
```

- **`ConnectionWorkerService`** load tất cả `Connection` có `status=active` khi khởi động, tạo `ConnectionRunner` cho từng cái.
- Health check mỗi **30 giây** để đồng bộ: stop runner của connection bị deactivate, start runner cho connection mới được activate.
- **`RoutingService`** khớp message với route theo thứ tự ưu tiên: `guildId + channelId` → `guildId` only → catch-all (không có guildId/channelId).
