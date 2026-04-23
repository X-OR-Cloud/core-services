# AIWM Connection Module — API Documentation

## 1. Entity Schema: `Connection`

### Ý nghĩa
`Connection` đại diện cho một kết nối bot với nền tảng nhắn tin bên ngoài. Mỗi Connection chứa thông tin xác thực bot (`config`) và danh sách routing rules (`routes`) để ánh xạ kênh/server đến Agent cụ thể.

---

### Enums

#### `ConnectionProvider`
| Giá trị | Nền tảng |
|---------|---------|
| `discord` | Discord Bot |
| `telegram` | Telegram Bot |
| `teams` | Microsoft Teams Bot |
| `zalo-bot` | Zalo Bot (bot.zapps.me) |

#### `ConnectionStatus`
| Giá trị | Ý nghĩa |
|---------|---------|
| `active` | Bot đang chạy, nhận tin nhắn |
| `inactive` | Bot đã tắt thủ công |
| `error` | Bot gặp lỗi khi kết nối |

---

### Schema Fields

#### Root fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `name` | `string` | ✅ | Tên hiển thị của connection |
| `description` | `string` | ❌ | Mô tả mục đích |
| `provider` | `ConnectionProvider` | ✅ | Nền tảng nhắn tin |
| `status` | `ConnectionStatus` | auto (`inactive`) | Trạng thái vận hành |
| `config` | `ConnectionConfig` | ✅ | Thông tin xác thực bot |
| `routes` | `ConnectionRoute[]` | ❌ | Danh sách routing rules |

#### `ConnectionConfig`

| Trường | Kiểu | Dùng cho | Ý nghĩa |
|--------|------|----------|---------|
| `botToken` | `string` | Discord, Telegram, Zalo Bot | Token xác thực bot với nền tảng |
| `applicationId` | `string` | Discord | Application/Client ID |
| `webhookUrl` | `string` | Telegram | URL webhook công khai (nếu dùng webhook mode) |
| `pollingMode` | `boolean` | Telegram, Zalo Bot | Chế độ nhận tin: `true` = long-polling (default), `false` = webhook |
| `appId` | `string` | Teams | Microsoft App ID |
| `appPassword` | `string` | Teams | Azure AD client secret |
| `tenantId` | `string` | Teams | Azure AD tenant ID |
| `zaloSecretToken` | `string` | Zalo Bot | Secret token để validate header `X-Bot-Api-Secret-Token` khi nhận webhook |

> **Bảo mật:** Trường `config` chỉ trả về ở `GET /connections/:id`, không có trong danh sách `GET /connections`.

> **Zalo Bot — `pollingMode`:** Khi FE gọi `PUT` để đổi `config.pollingMode`, server tự động gọi `setWebhook` hoặc `deleteWebhook` lên Zalo platform. FE không cần thao tác thêm.

#### `ConnectionRoute`

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `agentId` | `string` | ✅ | ID của Agent xử lý tin nhắn trên route này |
| `serverId` | `string` | ❌ | Discord: Guild ID \| Telegram: chat.id (group) \| Teams: teamId \| Zalo Bot: chat.id |
| `channelId` | `string` | ❌ | Discord: channel ID \| Telegram: message_thread_id (topic) \| Teams: channelId |
| `botId` | `string` | ❌ | Filter theo bot ID cụ thể |
| `tenantId` | `string` | ❌ | Teams: Azure tenant ID |
| `requireMention` | `boolean` | ❌ | Chỉ xử lý khi bot bị @mention |
| `allowAnonymous` | `boolean` | ❌ | Cho phép user không có tài khoản trong org (default: `true`) |
| `verboseActions` | `string[]` | ❌ | Action types forward về platform: `[]` = message only, `['*']` = tất cả, `['thinking','tool_use']` = chọn lọc |
| `verboseLogsChannelId` | `string` | ❌ | Channel ID nhận **tất cả** action logs, bất kể `verboseActions` |

**Logic match route (theo thứ tự ưu tiên):**
1. `serverId` + `channelId` cùng khớp
2. `serverId` only
3. Catch-all (không có filter nào)

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
Authorization: Bearer <JWT>
```

**Body:**

| Trường | Kiểu | Bắt buộc |
|--------|------|----------|
| `name` | `string` | ✅ |
| `description` | `string` | ❌ |
| `provider` | `ConnectionProvider` | ✅ |
| `config` | `ConnectionConfig` | ✅ |
| `routes` | `ConnectionRoute[]` | ❌ |

**Request — Discord:**
```json
{
  "name": "Support Bot",
  "provider": "discord",
  "config": {
    "botToken": "Bot MTI3NjQ5ODc4OTAxMjM0NTY3",
    "applicationId": "1234567890123456789"
  },
  "routes": [
    {
      "serverId": "987654321098765432",
      "channelId": "123456789012345678",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "requireMention": false,
      "allowAnonymous": true
    }
  ]
}
```

**Request — Telegram (polling):**
```json
{
  "name": "Telegram Support",
  "provider": "telegram",
  "config": {
    "botToken": "7123456789:AAFxxxxxx",
    "pollingMode": true
  },
  "routes": [
    { "agentId": "665f1a2b3c4d5e6f7a8b9c0d" }
  ]
}
```

**Request — Teams:**
```json
{
  "name": "Teams HR Bot",
  "provider": "teams",
  "config": {
    "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "appPassword": "azure-client-secret",
    "tenantId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
  },
  "routes": [
    {
      "serverId": "teams-team-id",
      "channelId": "teams-channel-id",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d"
    }
  ]
}
```

**Request — Zalo Bot (long-polling, mặc định):**
```json
{
  "name": "Zalo CSKH Bot",
  "provider": "zalo-bot",
  "config": {
    "botToken": "12345689:abc-xyz",
    "pollingMode": true,
    "zaloSecretToken": "my-webhook-secret"
  },
  "routes": [
    { "agentId": "665f1a2b3c4d5e6f7a8b9c0d", "allowAnonymous": true }
  ]
}
```

**Request — Zalo Bot (webhook mode):**
```json
{
  "name": "Zalo CSKH Bot",
  "provider": "zalo-bot",
  "config": {
    "botToken": "12345689:abc-xyz",
    "pollingMode": false,
    "zaloSecretToken": "my-webhook-secret"
  },
  "routes": [
    { "agentId": "665f1a2b3c4d5e6f7a8b9c0d", "allowAnonymous": true }
  ]
}
```

> Khi tạo mới với `pollingMode: false`, webhook **chưa** được đăng ký tự động. Cần gọi `PUT /connections/:id` với `config.pollingMode: false` sau khi connection đã tồn tại để trigger sync.

**Response 201:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "name": "Zalo CSKH Bot",
  "provider": "zalo-bot",
  "status": "inactive",
  "config": {
    "botToken": "12345689:abc-xyz",
    "pollingMode": true,
    "zaloSecretToken": "my-webhook-secret"
  },
  "routes": [
    { "agentId": "665f1a2b3c4d5e6f7a8b9c0d", "allowAnonymous": true }
  ],
  "owner": { "orgId": "org123", "userId": "user456" },
  "createdBy": "user456",
  "createdAt": "2026-04-23T08:00:00.000Z",
  "updatedAt": "2026-04-23T08:00:00.000Z"
}
```

---

### 2.2 List Connections

```
GET /connections
Authorization: Bearer <JWT>
```

**Query String:**

| Param | Ý nghĩa | Ví dụ |
|-------|---------|-------|
| `page` | Trang (default: 1) | `?page=1` |
| `limit` | Số item/trang (default: 20) | `?limit=10` |
| `sort` | Sắp xếp | `?sort=createdAt:desc` |
| `provider` | Lọc theo provider | `?provider=zalo-bot` |
| `status` | Lọc theo trạng thái | `?status=active` |
| `name:regex` | Tìm theo tên | `?name:regex=support` |

> Response **không bao gồm** `config` và `routes`. Có thêm `routeCount` để hiển thị số route.

**Response 200:**
```json
{
  "data": [
    {
      "_id": "684a1b2c3d4e5f6a7b8c9d0e",
      "name": "Zalo CSKH Bot",
      "provider": "zalo-bot",
      "status": "active",
      "routeCount": 2,
      "owner": { "orgId": "org123", "userId": "user456" },
      "createdAt": "2026-04-23T08:00:00.000Z",
      "updatedAt": "2026-04-23T08:30:00.000Z"
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
Authorization: Bearer <JWT>
```

> Trả về đầy đủ `config` và `routes`.

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "name": "Zalo CSKH Bot",
  "provider": "zalo-bot",
  "status": "active",
  "config": {
    "botToken": "12345689:abc-xyz",
    "pollingMode": true,
    "zaloSecretToken": "my-webhook-secret"
  },
  "routes": [
    {
      "serverId": "1234567890",
      "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
      "allowAnonymous": true,
      "verboseActions": [],
      "verboseLogsChannelId": null
    }
  ],
  "owner": { "orgId": "org123", "userId": "user456" },
  "createdAt": "2026-04-23T08:00:00.000Z",
  "updatedAt": "2026-04-23T08:30:00.000Z"
}
```

**Response 404:**
```json
{ "statusCode": 404, "message": "Connection not found", "error": "Not Found" }
```

---

### 2.4 Update Connection

```
PUT /connections/:id
Authorization: Bearer <JWT>
```

Tất cả fields đều optional. Dùng để đổi tên, cập nhật config, thay thế toàn bộ routes, hoặc kích hoạt/tắt connection.

**Body:**

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `name` | `string` | Tên mới |
| `description` | `string` | Mô tả mới |
| `status` | `"active" \| "inactive"` | Kích hoạt/tắt connection |
| `config` | `ConnectionConfig` | Cập nhật thông tin xác thực |
| `routes` | `ConnectionRoute[]` | **Thay thế toàn bộ** danh sách route |

**Request — Kích hoạt bot:**
```json
{ "status": "active" }
```

**Request — Chuyển Zalo Bot sang webhook mode:**
```json
{ "config": { "pollingMode": false } }
```

> Server tự động gọi `setWebhook` lên Zalo platform với URL `{AIWM_BASE_URL}/connections/{id}/webhook` và `secret_token` từ `config.zaloSecretToken`.

**Request — Chuyển Zalo Bot về polling mode:**
```json
{ "config": { "pollingMode": true } }
```

> Server tự động gọi `deleteWebhook` lên Zalo platform.

**Response 200:** Trả về document đã cập nhật (tương tự `GET /connections/:id`).

---

### 2.5 Delete Connection

```
DELETE /connections/:id
Authorization: Bearer <JWT>
```

Soft delete — đặt `isDeleted: true`, không xóa khỏi DB. Connection runner sẽ tự dừng.

**Response 200:**
```json
{
  "_id": "684a1b2c3d4e5f6a7b8c9d0e",
  "isDeleted": true,
  "updatedAt": "2026-04-23T09:30:00.000Z"
}
```

---

### 2.6 Add Route

```
POST /connections/:id/routes
Authorization: Bearer <JWT>
```

Thêm một route vào cuối danh sách. Connection runner tự restart sau khi thêm route.

**Body:**

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `agentId` | `string` | ✅ | Agent xử lý tin nhắn |
| `serverId` | `string` | ❌ | Server/group chat ID để filter |
| `channelId` | `string` | ❌ | Channel/thread ID để filter |
| `requireMention` | `boolean` | ❌ | Chỉ reply khi bị @mention |
| `allowAnonymous` | `boolean` | ❌ | Cho phép user ngoài org (default: `true`) |
| `verboseActions` | `string[]` | ❌ | `[]` = message only, `['*']` = tất cả |
| `verboseLogsChannelId` | `string` | ❌ | Channel nhận toàn bộ action logs |

**Request — Route cho một group chat Zalo:**
```json
{
  "serverId": "1234567890",
  "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
  "allowAnonymous": true
}
```

**Request — Catch-all route với verbose logs:**
```json
{
  "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
  "verboseActions": ["thinking", "tool_use"],
  "verboseLogsChannelId": "log-channel-id"
}
```

**Response 200:** Trả về Connection document với `routes` đã cập nhật.

---

### 2.7 Update Route

```
PUT /connections/:id/routes/:routeIndex
Authorization: Bearer <JWT>
```

Cập nhật một route theo index (0-based). Chỉ các field được gửi mới bị overwrite.

**Request:**
```json
{ "requireMention": true, "verboseActions": ["*"] }
```

**Response 200:** Trả về Connection document với `routes` đã cập nhật.

**Response 404:**
```json
{ "statusCode": 404, "message": "Route index 5 not found", "error": "Not Found" }
```

---

### 2.8 Remove Route

```
DELETE /connections/:id/routes/:routeIndex
Authorization: Bearer <JWT>
```

Xóa route theo index (0-based).

**Response 200:** Trả về Connection document với `routes` đã cập nhật.

---

### 2.9 Get Connection Logs

```
GET /connections/:id/logs
Authorization: Bearer <JWT>
```

Lấy debug logs của connection runner — ghi lại lifecycle: kết nối, routing, lỗi. Tối đa **200 entries** (FIFO, cũ nhất bị xóa khi đầy).

> `logs` không có trong `GET /connections` hay `GET /connections/:id`.

**Log Levels:**

| Level | Ý nghĩa |
|-------|---------|
| `info` | Sự kiện bình thường |
| `warn` | Cảnh báo (ngắt kết nối, không khớp route) |
| `error` | Lỗi adapter hoặc xử lý message |

**Response 200:**
```json
{
  "logs": [
    { "level": "info", "message": "Runner starting", "time": "2026-04-23T07:00:00.000Z" },
    { "level": "info", "message": "Connected to zalo-bot", "time": "2026-04-23T07:00:01.234Z" },
    {
      "level": "info",
      "message": "Inbound message routed",
      "time": "2026-04-23T07:15:42.881Z",
      "data": {
        "provider": "zalo-bot",
        "user": "Nguyễn Văn A",
        "agentId": "665f1a2b3c4d5e6f7a8b9c0d",
        "conversationId": "684a9f1b2c3d4e5f6a7b8c01"
      }
    },
    {
      "level": "warn",
      "message": "No route matched for channel 1234567890",
      "time": "2026-04-23T07:22:10.445Z",
      "data": { "provider": "zalo-bot", "user": "Trần Thị B" }
    }
  ]
}
```

---

### 2.10 Webhook Endpoint (Teams & Zalo Bot)

```
POST /connections/:id/webhook
```

> Không cần JWT. Xác thực theo từng provider.

Endpoint nhận event từ nền tảng. Dispatch theo `provider` của connection.

| Provider | Xác thực | Hành động |
|----------|----------|-----------|
| `teams` | Verify JWT Bearer từ Microsoft Bot Service | Publish `inbound:teams:{id}` lên Redis |
| `zalo-bot` | So sánh header `X-Bot-Api-Secret-Token` với `config.zaloSecretToken` | Publish `inbound:zalo-bot:{id}` lên Redis |

**Zalo Bot — webhook URL được đăng ký tự động:**
```
{AIWM_SERVICE_URL}/connections/<connectionId>/webhook
```
Khi FE gọi `PUT /connections/:id` với `config.pollingMode: false`, server tự đăng ký URL này lên Zalo kèm `secret_token`. Không cần thao tác thủ công trên bot.zapps.me.

**Teams — URL validation challenge:**
```
GET /connections/:id/webhook?validationToken=<token>
```
Teams gửi GET khi đăng ký bot endpoint. Server trả về `validationToken` dạng plain text.

**Response 400 — Secret không hợp lệ (Zalo Bot):**
```json
{ "statusCode": 400, "message": "Invalid X-Bot-Api-Secret-Token", "error": "Bad Request" }
```

---

## 3. Tóm tắt Endpoints

| Method | URL | Auth | Mô tả |
|--------|-----|------|-------|
| `POST` | `/connections` | JWT | Tạo connection mới |
| `GET` | `/connections` | JWT | Danh sách (không có config/routes, có routeCount) |
| `GET` | `/connections/:id` | JWT | Chi tiết (có config/routes) |
| `PUT` | `/connections/:id` | JWT | Cập nhật; Zalo Bot tự sync webhook khi đổi pollingMode |
| `DELETE` | `/connections/:id` | JWT | Xóa mềm connection |
| `GET` | `/connections/:id/logs` | JWT | Debug logs của runner |
| `POST` | `/connections/:id/routes` | JWT | Thêm route |
| `PUT` | `/connections/:id/routes/:routeIndex` | JWT | Cập nhật route theo index |
| `DELETE` | `/connections/:id/routes/:routeIndex` | JWT | Xóa route theo index |
| `GET` | `/connections/:id/webhook` | — | Teams URL validation challenge |
| `POST` | `/connections/:id/webhook` | Provider-specific | Nhận webhook event (Teams / Zalo Bot) |

---

## 4. Hướng dẫn cấu hình theo provider

### Discord
1. Tạo bot tại [discord.com/developers](https://discord.com/developers/applications)
2. Copy **Bot Token** và **Application ID**
3. Tạo Connection với `provider: "discord"`, `config.botToken`, `config.applicationId`
4. Thêm route với `serverId` (Guild ID) và/hoặc `channelId`
5. Đặt `status: "active"`

### Telegram
1. Tạo bot qua [@BotFather](https://t.me/BotFather), lấy token
2. Tạo Connection với `provider: "telegram"`, `config.botToken`, `config.pollingMode: true`
3. Thêm route (`serverId` = chat.id của group, bỏ trống = nhận từ mọi chat)
4. Đặt `status: "active"`

### Teams
1. Đăng ký bot tại [Azure Bot Service](https://portal.azure.com), lấy **App ID**, **App Password**, **Tenant ID**
2. Tạo Connection với `provider: "teams"`, điền đủ `config`
3. Đăng ký webhook URL `{AIWM_SERVICE_URL}/connections/:id/webhook` trong Azure Bot Service
4. Thêm route (`serverId` = Teams team ID, `channelId` = channel ID)
5. Đặt `status: "active"`

### Zalo Bot

#### Long-polling mode (dev / mạng nội bộ)
1. Tạo bot tại [bot.zapps.me](https://bot.zapps.me) (tên phải bắt đầu bằng "Bot"), lấy **Bot Token**
2. Tạo Connection:
```json
{
  "provider": "zalo-bot",
  "config": { "botToken": "...", "pollingMode": true, "zaloSecretToken": "..." }
}
```
3. Thêm route, đặt `status: "active"` → bot tự poll

#### Webhook mode (production)
1. Tạo Connection với `pollingMode: true` trước (để lưu botToken)
2. Thêm route, đặt `status: "active"`
3. Gọi `PUT /connections/:id` với `{ "config": { "pollingMode": false } }` → server tự đăng ký webhook lên Zalo

> **`serverId`** trong route = `chat.id` từ Zalo event payload. Có thể xem trong server log (`body=...`) khi Zalo gửi webhook lần đầu.

---

## 5. Luồng hoạt động

```
Platform Message
      │
      ├── Discord / Telegram:  Adapter (polling/webhook) ──► NormalizedInbound
      └── Teams / Zalo Bot:    HTTP POST /connections/:id/webhook
                                      │
                                 Redis publish
                              inbound:{provider}:{id}
                                      │
                             ConnectionWorkerService
                             (pmessage handler)
                                      │
                             ConnectionRunner
                             ._handleInbound()
                                      │
                              RoutingService
                           (match route → agentId)
                                      │
                          Redis: chat:message-new
                                      │
                              ChatGateway (API)
                                      │
                                Agent xử lý
                                      │
                          Redis: outbound:message
                                      │
                         ConnectionWorkerService
                           .handleOutbound()
                                      │
                         Adapter.send() → Platform
```

- **`ConnectionWorkerService`** load tất cả Connection `status=active` khi khởi động, tạo `ConnectionRunner` cho từng cái.
- Health check mỗi **30 giây**: stop runner bị deactivate, start runner mới được activate.
- Khi config/route thay đổi, runner tự restart để áp dụng config mới.
- **Zalo Bot webhook sync**: `PUT /connections/:id` với `config.pollingMode` thay đổi → server gọi Zalo API `setWebhook`/`deleteWebhook` tự động.
