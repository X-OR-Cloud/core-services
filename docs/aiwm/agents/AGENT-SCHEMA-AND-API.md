# Agent — Schema & API Reference

> Service: **AIWM** · Base URL: `http://localhost:3003` (dev) · `https://api.x-or.cloud` (prod)

---

## 1. Agent Schema

### 1.1 Top-level Fields

| Field | Type | Required | Default | Values / Constraints | Ý nghĩa |
|-------|------|----------|---------|----------------------|---------|
| `_id` | `string` (ObjectId) | auto | — | MongoDB ObjectId | ID duy nhất của agent |
| `name` | `string` | yes | — | — | Tên hiển thị của agent |
| `description` | `string` | yes | — | — | Mô tả mục đích agent |
| `status` | `string` | no | `inactive` | `inactive` `idle` `busy` `suspended` | Trạng thái hoạt động hiện tại |
| `type` | `string` | no | `engineer` | `assistant` `engineer` | Loại agent (xem 1.2) |
| `framework` | `string` | no | `claude-agent-sdk` | `claude-agent-sdk` | Runtime engine cho agent. Không dùng với `assistant` |
| `instructionId` | `string` (ref) | no | — | ObjectId → Instruction | System prompt / guideline |
| `guardrailId` | `string` (ref) | no | — | ObjectId → Guardrail | Ràng buộc an toàn |
| `deploymentId` | `string` (ref) | no | — | ObjectId → Deployment | LLM deployment (dành cho `engineer` tự triển khai, không có `nodeId`) |
| `nodeId` | `string` (ref) | no | — | ObjectId → Node | Node vật lý (chỉ dành cho `engineer` do hệ thống quản lý) |
| `role` | `string` | no | `organization.viewer` | `organization.owner` `organization.editor` `organization.viewer` | RBAC role để gọi MCP tools |
| `tags` | `string[]` | no | `[]` | Mảng chuỗi tự do | Nhãn phân loại, tìm kiếm |
| `secret` | `string` | no | — | Bcrypt hash (ẩn trong response) | Secret dùng cho xác thực agent (`engineer` / `assistant`) |
| `allowedToolIds` | `string[]` (ref) | no | `[]` | Mảng ObjectId → Tool | Whitelist MCP tool sets agent được dùng |
| `allowedFunctions` | `string[]` | no | `[]` | Tên function runtime | Whitelist function agent được gọi. Rỗng = cho phép tất cả |
| `settings` | `object` | no | `{}` | Flat key-value với prefix | Cấu hình runtime (xem 1.3) |
| `channels` | `ChannelConfig[]` | no | `[]` | Mảng ChannelConfig | Kênh Discord / Telegram (xem 1.4) |
| `lastConnectedAt` | `Date` | no | — | ISO 8601 | Thời điểm kết nối gần nhất |
| `lastHeartbeatAt` | `Date` | no | — | ISO 8601 | Thời điểm heartbeat gần nhất |
| `connectionCount` | `number` | no | `0` | ≥ 0 | Tổng số lần đã kết nối |
| `owner` | `string` | auto | — | ObjectId (từ BaseSchema) | Org sở hữu agent |
| `createdBy` | `string` | auto | — | ObjectId (từ BaseSchema) | User tạo |
| `updatedBy` | `string` | auto | — | ObjectId (từ BaseSchema) | User cập nhật cuối |
| `deletedAt` | `Date` | auto | — | Soft delete | Null nếu chưa xóa |
| `createdAt` | `Date` | auto | — | ISO 8601 | Thời điểm tạo |
| `updatedAt` | `Date` | auto | — | ISO 8601 | Thời điểm cập nhật |

---

### 1.2 Agent Types

| Type | Mô tả | Yêu cầu riêng |
|------|-------|---------------|
| `engineer` | Agent có quyền truy cập môi trường (bash, file, v.v.). Nếu có `nodeId`: hệ thống deploy lên node và quản lý lifecycle qua WebSocket. Nếu không có `nodeId`: người dùng tự triển khai. | `nodeId` nếu do hệ thống quản lý; `deploymentId` nếu tự triển khai |
| `assistant` | Agent chạy in-process trong AIWM (`nx run aiwm:agt`). Không có quyền truy cập môi trường. Kết nối `/ws/chat`. Scale ngang qua Redis lock. | Không cần `nodeId`/`framework` |

> **Lưu ý**: `type` là bất biến sau khi tạo. Mọi request PATCH/PUT thay đổi `type` sẽ trả về `400 Bad Request`.

---

### 1.3 Settings — Cấu hình runtime

Object phẳng (flat) với các key theo prefix:

#### Prefix `auth_`

| Key | Type | Default | Ý nghĩa |
|-----|------|---------|---------|
| `auth_roles` | `string[]` | `['agent']` | Roles gán thêm cho agent trong JWT |

#### Prefix `claude_` (dành cho `engineer` / `assistant` với framework `claude-agent-sdk`)

| Key | Type | Default | Ý nghĩa |
|-----|------|---------|---------|
| `claude_model` | `string` | — | Model Claude cụ thể, vd: `claude-3-5-sonnet-latest` |
| `claude_maxTurns` | `number` | `100` | Số lượt hội thoại tối đa |
| `claude_permissionMode` | `string` | `bypassPermissions` | Permission mode của Claude agent SDK |
| `claude_resume` | `boolean` | `true` | Cho phép resume conversation |
| `claude_oauthToken` | `string` | — | OAuth token tùy chọn |

#### Prefix `assistant_` (chỉ dành cho `type: assistant`)

| Key | Type | Default | Ý nghĩa |
|-----|------|---------|---------|
| `assistant_maxConcurrency` | `number` | `5` | Số conversation xử lý song song tối đa |
| `assistant_idleTimeoutMs` | `number` | `300000` | Ngắt kết nối sau khoảng idle (ms) |
| `assistant_reconnectDelayMs` | `number` | `5000` | Thời gian chờ trước khi reconnect (ms) |
| `assistant_maxSteps` | `number` | `10` | Số bước tool call tối đa mỗi lần `generateText` |

#### Prefix `discord_` / `telegram_` *(deprecated)*

> Không dùng nữa. Dùng `channels[]` thay thế.

**Ví dụ settings đầy đủ:**

```json
{
  "auth_roles": ["agent"],
  "claude_model": "claude-3-5-sonnet-latest",
  "claude_maxTurns": 50,
  "claude_permissionMode": "bypassPermissions",
  "assistant_maxConcurrency": 10,
  "assistant_maxSteps": 15
}
```

---

### 1.4 ChannelConfig — Cấu hình kênh Discord / Telegram

| Field | Type | Required | Default | Ý nghĩa |
|-------|------|----------|---------|---------|
| `platform` | `string` | yes | — | `discord` hoặc `telegram` |
| `label` | `string` | no | — | Nhãn đọc được, vd: `"VTV Support Discord"` |
| `enabled` | `boolean` | yes | `true` | Bật/tắt kênh này |
| `token` | `string` | yes | — | Bot token của platform |
| `botId` | `string` | no | — | Discord: bot user ID (số). Telegram: `@botUsername` |
| `channelId` | `string` | yes | — | Discord: channel ID. Telegram: group ID (số âm dạng chuỗi) |
| `requireMentions` | `boolean` | yes | `false` | Chỉ phản hồi khi bị @mention |
| `verboseLogging` | `boolean` | yes | `false` | Gửi log từng bước vào kênh |
| `verboseLoggingTarget` | `string` | yes | `channel` | Nơi gửi verbose log: `channel`, `thread`, hoặc channel ID cụ thể |

**Ví dụ:**

```json
[
  {
    "platform": "discord",
    "label": "Customer Support",
    "enabled": true,
    "token": "Bot MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.XXXXXX.YYYYYY",
    "botId": "123456789012345678",
    "channelId": "987654321098765432",
    "requireMentions": true,
    "verboseLogging": false,
    "verboseLoggingTarget": "channel"
  },
  {
    "platform": "telegram",
    "label": "Internal Alerts",
    "enabled": true,
    "token": "6123456789:AAFF_example_token",
    "botId": "@my_bot",
    "channelId": "-1001234567890",
    "requireMentions": false,
    "verboseLogging": true,
    "verboseLoggingTarget": "-1009876543210"
  }
]
```

---

### 1.5 Status States

| Status | Ý nghĩa |
|--------|---------|
| `inactive` | Chưa kết nối lần nào hoặc đã tắt |
| `idle` | Đang kết nối, không có task đang xử lý |
| `busy` | Đang xử lý task/conversation |
| `suspended` | Bị tạm khóa, từ chối kết nối mới |

---

## 2. API Reference

> Tất cả endpoint (trừ `POST /agents/:id/connect`) yêu cầu header:
> ```
> Authorization: Bearer <user-jwt-token>
> ```

---

### 2.1 `POST /agents` — Tạo agent

**Auth**: User JWT (JwtAuthGuard)

**Body:**

| Field | Type | Required | Ví dụ | Ý nghĩa |
|-------|------|----------|-------|---------|
| `name` | `string` | yes | `"Customer Support Agent"` | Tên agent |
| `description` | `string` | yes | `"AI agent for customer support"` | Mô tả |
| `type` | `string` | no | `"engineer"` | `engineer` / `assistant` |
| `status` | `string` | no | `"inactive"` | Trạng thái ban đầu |
| `framework` | `string` | no | `"claude-agent-sdk"` | Runtime engine (Không sử dụng với assistant) |
| `instructionId` | `string` | no | `"64a1b2c3d4e5f6789012345"` | ID instruction |
| `guardrailId` | `string` | no | `"64a1b2c3d4e5f6789012346"` | ID guardrail |
| `nodeId` | `string` | no | `"64a1b2c3d4e5f6789012347"` | ID node (chỉ dành cho `engineer` do hệ thống quản lý) |
| `role` | `string` | no | `"organization.viewer"` | RBAC role |
| `secret` | `string` | no | `"my-secret-key"` | Secret thô (sẽ bcrypt hash) |
| `tags` | `string[]` | no | `["support", "discord"]` | Tags |
| `allowedToolIds` | `string[]` | no | `["64a1b2c3d4e5f6789012348"]` | Whitelist tool IDs |
| `allowedFunctions` | `string[]` | no | `["Bash", "Read"]` | Whitelist function names |
| `settings` | `object` | no | `{"claude_model": "claude-3-5-sonnet-latest"}` | Cấu hình runtime |
| `channels` | `ChannelConfig[]` | no | Xem 1.4 | Kênh Discord/Telegram (Không sử dụng với assistant) |

**Response 201:**

```json
{
  "_id": "64a1b2c3d4e5f6789012345",
  "name": "Customer Support Agent",
  "description": "AI agent for customer support",
  "status": "inactive",
  "type": "engineer",
  "framework": "claude-agent-sdk",
  "instructionId": null,
  "guardrailId": null,
  "deploymentId": null,
  "nodeId": null,
  "role": "organization.viewer",
  "tags": [],
  "allowedToolIds": [],
  "allowedFunctions": [],
  "settings": {},
  "channels": [],
  "connectionCount": 0,
  "owner": "64a000000000000000000001",
  "createdBy": "64a000000000000000000002",
  "createdAt": "2026-03-11T08:00:00.000Z",
  "updatedAt": "2026-03-11T08:00:00.000Z"
}
```

**Errors:**

| Code | Tình huống |
|------|------------|
| `400` | Validation lỗi (thiếu field bắt buộc, enum sai) |
| `401` | Token không hợp lệ |
| `403` | Gán `role: organization.owner` mà caller không phải owner |

---

### 2.2 `GET /agents` — Danh sách agents

**Auth**: User JWT

**Query String:**

| Param | Type | Ví dụ | Ý nghĩa |
|-------|------|-------|---------|
| `page` | `number` | `1` | Trang hiện tại (mặc định: 1) |
| `limit` | `number` | `20` | Số bản ghi mỗi trang (mặc định: 20) |
| `populate` | `string` | `instruction` | Populate relation: `instruction` |
| `type` | `string` | `assistant` | Lọc theo type |
| `status` | `string` | `idle` | Lọc theo status |
| `sort` | `string` | `createdAt:desc` | Sắp xếp |

**Response 200:**

```json
{
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "Customer Support Agent",
      "description": "AI agent for customer support",
      "status": "idle",
      "type": "assistant",
      "framework": "claude-agent-sdk",
      "role": "organization.viewer",
      "tags": ["support"],
      "allowedToolIds": [],
      "allowedFunctions": [],
      "settings": {
        "assistant_maxConcurrency": 5,
        "assistant_maxSteps": 10
      },
      "channels": [],
      "connectionCount": 12,
      "lastConnectedAt": "2026-03-11T07:45:00.000Z",
      "lastHeartbeatAt": "2026-03-11T07:59:30.000Z",
      "createdAt": "2026-03-01T08:00:00.000Z",
      "updatedAt": "2026-03-11T07:59:30.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### 2.3 `GET /agents/:id` — Chi tiết agent

**Auth**: User JWT

**Params:**

| Param | Type | Ý nghĩa |
|-------|------|---------|
| `id` | `string` (ObjectId) | Agent ID |

**Query String:**

| Param | Type | Ví dụ | Ý nghĩa |
|-------|------|-------|---------|
| `populate` | `string` | `instruction` | Populate relation |

**Response 200:**

```json
{
  "_id": "64a1b2c3d4e5f6789012345",
  "name": "Customer Support Agent",
  "description": "AI agent for customer support",
  "status": "idle",
  "type": "engineer",
  "framework": "claude-agent-sdk",
  "instructionId": {
    "_id": "64a1b2c3d4e5f6789012346",
    "name": "Support Instruction",
    "content": "You are a helpful support agent..."
  },
  "nodeId": "64a1b2c3d4e5f6789012347",
  "role": "organization.editor",
  "tags": ["support", "discord"],
  "settings": {
    "auth_roles": ["agent"],
    "claude_model": "claude-3-5-sonnet-latest"
  },
  "channels": [],
  "connectionCount": 5,
  "lastConnectedAt": "2026-03-11T07:00:00.000Z",
  "createdAt": "2026-02-01T00:00:00.000Z",
  "updatedAt": "2026-03-11T07:00:00.000Z"
}
```

**Errors:**

| Code | Tình huống |
|------|------------|
| `404` | Agent không tồn tại hoặc đã bị xóa |

---

### 2.4 `PUT /agents/:id` — Cập nhật agent

**Auth**: User JWT

**Params:** `id` — Agent ID

**Body:** Tương tự `CreateAgentDto`, tất cả field đều optional. Không thể thay đổi `type`.

**Response 200:** Agent sau khi cập nhật (cấu trúc như 2.3).

**Errors:**

| Code | Tình huống |
|------|------------|
| `400` | Cố thay đổi `type` / validation lỗi |
| `404` | Agent không tồn tại |

---

### 2.5 `DELETE /agents/:id` — Xóa agent (soft delete)

**Auth**: User JWT

**Params:** `id` — Agent ID

**Response 200:**

```json
{ "message": "Agent deleted successfully" }
```

---

### 2.6 `GET /agents/:id/instruction` — Preview instruction đã resolve

**Auth**: User JWT

**Params:** `id` — Agent ID

**Mô tả:** Trả về instruction đã được resolve đầy đủ, bao gồm context `@project`, `@document` được inject vào. Dùng để user preview trước khi deploy.

**Response 200:**

```json
{
  "id": "64a1b2c3d4e5f6789012346",
  "systemPrompt": "You are a helpful customer support agent.\n\n## Context\n**Project: VTV Support**\n- Status: active\n- Description: Customer support project\n\n## Rules\n- Always respond in Vietnamese\n- Be polite and professional"
}
```

---

### 2.7 `GET /agents/:id/config` — Lấy config cho engineer agent (tự triển khai)

**Auth**: User JWT
**Chỉ dành cho**: `type: engineer` (không có `nodeId`)

**Params:** `id` — Agent ID

**Response 200:**

```json
{
  "id": "64a1b2c3d4e5f6789012345",
  "name": "My Self-Deployed Engineer Agent",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "refreshToken": null,
  "refreshExpiresIn": 0,
  "tokenType": "bearer",
  "mcpServers": {
    "cbm-tools": {
      "type": "http",
      "url": "http://localhost:3004/mcp",
      "headers": {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
  },
  "instruction": {
    "id": "64a1b2c3d4e5f6789012346",
    "systemPrompt": "You are a helpful assistant..."
  },
  "tools": [],
  "allowedFunctions": [],
  "framework": "claude-agent-sdk",
  "settings": {
    "claude_model": "claude-3-5-sonnet-latest",
    "claude_maxTurns": 100
  },
  "channels": [],
  "deployment": {
    "id": "64a1b2c3d4e5f6789012348",
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "baseAPIEndpoint": "https://api.x-or.cloud/deployments/64a1b2c3d4e5f6789012348/inference",
    "apiEndpoint": "https://api.anthropic.com/v1/messages"
  }
}
```

**Errors:**

| Code | Tình huống |
|------|------------|
| `400` | Gọi với `type: engineer` có `nodeId` hoặc `type: assistant` |
| `403` | User không có quyền truy cập agent này |
| `404` | Agent không tồn tại |

---

### 2.8 `POST /agents/:id/connect` — Xác thực agent (engineer / assistant)

**Auth**: **Không cần** JWT (public endpoint)
**Chỉ dành cho**: `type: engineer` hoặc `type: assistant`

**Params:** `id` — Agent ID

**Body:**

| Field | Type | Required | Ví dụ | Ý nghĩa |
|-------|------|----------|-------|---------|
| `secret` | `string` | yes | `"my-agent-secret"` | Secret thô của agent |

**Response 200:**

```json
{
  "id": "64a1b2c3d4e5f6789012345",
  "name": "Support Bot",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "refreshToken": null,
  "refreshExpiresIn": 0,
  "tokenType": "bearer",
  "mcpServers": {
    "cbm-tools": {
      "type": "http",
      "url": "http://localhost:3004/mcp",
      "headers": { "Authorization": "Bearer eyJ..." }
    }
  },
  "instruction": {
    "id": "64a1b2c3d4e5f6789012346",
    "systemPrompt": "You are a helpful support agent..."
  },
  "tools": [
    {
      "_id": "64a1b2c3d4e5f6789012349",
      "name": "CBM Tools",
      "type": "mcp"
    }
  ],
  "allowedFunctions": ["Bash", "Read", "Write"],
  "framework": "claude-agent-sdk",
  "settings": {
    "assistant_maxConcurrency": 5,
    "assistant_maxSteps": 10
  },
  "channels": [
    {
      "platform": "discord",
      "label": "Support Channel",
      "enabled": true,
      "token": "Bot MTI...",
      "botId": "123456789",
      "channelId": "987654321",
      "requireMentions": false,
      "verboseLogging": false,
      "verboseLoggingTarget": "channel"
    }
  ]
}
```

**Errors:**

| Code | Tình huống |
|------|------------|
| `400` | Secret sai định dạng hoặc agent bị suspended |
| `401` | Secret sai hoặc agent đang `suspended` |
| `404` | Agent không tồn tại |

---

### 2.9 `POST /agents/heartbeat` — Heartbeat (token-based)

**Auth**: Agent JWT (từ `/connect` hoặc `/config`)

**Body:**

| Field | Type | Required | Ví dụ | Ý nghĩa |
|-------|------|----------|-------|---------|
| `status` | `string` | yes | `"idle"` | Trạng thái hiện tại: `idle` hoặc `busy` |
| `metrics` | `object` | no | `{"memory": 128}` | Metrics tùy ý |

**Response 200 — không có task:**

```json
{
  "received": true,
  "systemTask": null
}
```

**Response 200 — có work assignment:**

```json
{
  "received": true,
  "systemTask": {
    "type": "work",
    "id": "64a1b2c3d4e5f6789012350",
    "title": "Implement login feature"
  }
}
```

**Lưu ý**: `POST /agents/:id/heartbeat` vẫn hoạt động nhưng đã deprecated.

---

### 2.10 `POST /agents/disconnect` — Ngắt kết nối (token-based)

**Auth**: Agent JWT

**Body:**

| Field | Type | Required | Ví dụ | Ý nghĩa |
|-------|------|----------|-------|---------|
| `reason` | `string` | no | `"Scheduled maintenance"` | Lý do ngắt kết nối |

**Response 200:**

```json
{
  "disconnected": true,
  "agentId": "64a1b2c3d4e5f6789012345"
}
```

**Lưu ý**: `POST /agents/:id/disconnect` vẫn hoạt động nhưng đã deprecated.

---

### 2.11 `POST /agents/:id/credentials/regenerate` — Tái tạo credentials

**Auth**: User JWT
**Chỉ dành cho**: `type: engineer` hoặc `type: assistant`

**Params:** `id` — Agent ID

**Response 200:**

```json
{
  "agentId": "64a1b2c3d4e5f6789012345",
  "secret": "agt_4f8a2e1b3c7d9e0f1a2b3c4d5e6f7a8b",
  "envConfig": "# Agent Environment Configuration\nAIWM_AGENT_ID=64a1b2c3d4e5f6789012345\nAIWM_AGENT_SECRET=agt_4f8a2e1b3c7d9e0f1a2b3c4d5e6f7a8b\nAIWM_BASE_URL=https://api.x-or.cloud\n",
  "installScript": "#!/bin/bash\n# Agent Installation Script\n# ...full bash script..."
}
```

> **Quan trọng**: `secret` chỉ được trả về **một lần duy nhất** ở đây. Hệ thống chỉ lưu bản hash. Nếu mất secret phải regenerate lại.

---

## 3. Tóm tắt API theo use case

| Use case | Method + URL | Auth |
|----------|-------------|------|
| Tạo agent | `POST /agents` | User JWT |
| Danh sách agents | `GET /agents` | User JWT |
| Chi tiết agent | `GET /agents/:id` | User JWT |
| Cập nhật agent | `PUT /agents/:id` | User JWT |
| Xóa agent | `DELETE /agents/:id` | User JWT |
| Preview instruction | `GET /agents/:id/instruction` | User JWT |
| Lấy config (engineer tự triển khai) | `GET /agents/:id/config` | User JWT |
| Xác thực agent (engineer/assistant) | `POST /agents/:id/connect` | Không cần |
| Heartbeat | `POST /agents/heartbeat` | Agent JWT |
| Ngắt kết nối | `POST /agents/disconnect` | Agent JWT |
| Tái tạo credentials | `POST /agents/:id/credentials/regenerate` | User JWT |
