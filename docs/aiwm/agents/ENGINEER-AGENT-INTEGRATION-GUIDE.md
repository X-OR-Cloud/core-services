# Engineer Agent Integration Guide

Hướng dẫn tích hợp agent loại `engineer` với AIWM. Engineer agent là agent tự deploy (hoặc deploy lên Node), có quyền truy cập môi trường đầy đủ (bash, file system, v.v.).

## Flow tổng quan

```
1. POST /agents/connect      → xác thực bằng secret, nhận JWT token + full config
2. Connect WS /ws/chat       → dùng JWT để mở kết nối realtime
3. agent:heartbeat (WS)      → báo status định kỳ, nhận work assignment
4. message:new (WS)          → nhận tin nhắn từ user (cần filter đúng)
5. message:send (WS)         → gửi response về conversation
6. agent:command (WS)        → nhận lệnh điều khiển từ admin
7. POST /agents/disconnect   → graceful shutdown
```

---

## 1. POST /agents/connect

**Auth:** Public (không cần JWT)

**Request body:**
| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string, required | Agent ID |
| `secret` | string, required | Agent secret |
| `version` | string, optional | Phiên bản agent (để server log) |

**Response fields:**
| Field | Type | Mô tả |
|-------|------|-------|
| `accessToken` | string | JWT token, dùng để auth WS và HTTP heartbeat |
| `expiresIn` | number | Số giây đến khi token hết hạn (thường 86400 = 24h) |
| `tokenType` | string | `"bearer"` |
| `id` | string | Agent ID |
| `name` | string | Tên agent |
| `instruction.systemPrompt` | string | Nội dung system prompt đã merge đầy đủ |
| `allowedFunctions` | string[] | Danh sách function names agent được phép gọi |
| `tools` | Tool[] | Chi tiết các tool (name, type, description, schema) |
| `mcpServers` | Record<string, McpServerConfig> | MCP server configs (type, url, headers) |
| `deployment` | object, optional | Model deployment config (provider, model, apiEndpoint, ...) |
| `framework` | string | `"claude-agent-sdk"` hoặc `"vercel-ai-sdk"` |
| `settings` | Record<string, unknown> | Runtime config tùy chỉnh từ admin |
| `ragEnabled` | boolean | RAG có được bật không |
| `ragCollections` | object[] | Các RAG collection (collectionId, topK, minScore) |
| `agentCode` | string, optional | Agent code identifier |
| `browserApiUrl` | string, optional | Browser automation API URL |
| `browserApiKey` | string, optional | Browser automation API key |

> **Deprecated:** `POST /agents/:id/connect` (agentId trên URL) vẫn hoạt động nhưng sẽ bị xóa. Dùng endpoint mới.

**Lưu ý về token refresh:** Token hết hạn sau `expiresIn` giây. Agent nên tính thời điểm refresh dựa trên `expiresIn` thực tế (không hardcode 23h), và luôn gọi lại `/agents/connect` để lấy token mới trước khi reconnect WS. Không nên dùng cached token sau khi restart.

---

## 2. WebSocket /ws/chat

**URL:** `wss://<host>/ws/chat`
**Auth:** JWT token từ bước connect, truyền qua `auth.token` trong handshake.

**Sau khi connect thành công, server tự động:**
- Đăng ký socket vào Redis presence (`presence:agent:{agentId}`)
- Rejoin tất cả conversation đang active của agent — agent **không cần tự emit `conversation:join`**
- Broadcast `presence:update` báo agent online cho các client khác

---

## 3. agent:heartbeat

**Mục đích:** Báo status định kỳ để server biết agent còn sống. Khi `status: 'idle'`, server có thể trả về work assignment hoặc reminder trong ack.

**Ưu tiên dùng WS event** thay vì HTTP endpoint để tránh round-trip và nhận work assignment ngay lập tức.

**Payload gửi lên:**
| Field | Type | Mô tả |
|-------|------|-------|
| `status` | `'idle' \| 'busy' \| 'sleep'` | Trạng thái hiện tại |
| `mcpConnected` | boolean, optional | Agent có MCP session đang hoạt động không. Server dùng để quyết định có assign work không |
| `availableFunctions` | string[], optional | Danh sách function names đang khả dụng. Server kiểm tra agent có đủ tool trước khi assign work |
| `sleep.reason` | string | Lý do sleep (required khi status='sleep') |
| `sleep.since` | string (ISO) | Thời điểm bắt đầu sleep |
| `sleep.until` | string (ISO), optional | Thời điểm dự kiến wake. Null = vô thời hạn |
| `metrics` | object, optional | Metrics tùy chỉnh |

**Ack response:**
| Field | Type | Mô tả |
|-------|------|-------|
| `success` | boolean | |
| `systemMessage` | string, optional | Nội dung cần inject vào context của agent |
| `systemTask.type` | `'work' \| 'reminders' \| 'inbox' \| 'alert'` | Loại task được giao |
| `systemTask.id` | string, optional | ID của work item |
| `systemTask.title` | string, optional | Tiêu đề work item |
| `systemTask.reminders` | object[], optional | Danh sách reminders `{id, content}` |
| `work` | object, optional | Work item được assign (id, title, type, status, priorityLevel) |

**Khuyến nghị:** Gửi heartbeat mỗi 30–60 giây. Gửi ngay `status: 'idle'` sau khi hoàn thành task để nhận việc tiếp theo nhanh hơn thay vì chờ đến interval tiếp theo.

**Fallback HTTP:** `POST /agents/heartbeat` — cùng payload, cùng response. Dùng khi WS không khả dụng.

---

## 4. message:new

**Mục đích:** Server broadcast tất cả sự kiện trong conversation room vào event này — bao gồm message của user, response của agent, các internal step. Agent phải tự filter để chỉ xử lý đúng tin nhắn của user.

**Payload:**
| Field | Type | Mô tả |
|-------|------|-------|
| `_id` | string | Action ID — dùng để dedup |
| `conversationId` | string | |
| `role` | `'user' \| 'assistant'` | |
| `type` | `'message' \| 'system' \| 'tool_use' \| 'tool_result' \| 'thinking' \| 'error'` | |
| `content` | string | |
| `skipAgent` | boolean, optional | `true` = bỏ qua, không xử lý |
| `userId` | string, optional | Sender user ID |
| `agentId` | string, optional | Sender agent ID |
| `username` | string, optional | |
| `fullname` | string, optional | |
| `externalUsername` | string, optional | Username trên Discord/Telegram |
| `externalUserId` | string, optional | User ID trên Discord/Telegram |
| `platform` | string | `'portal'`, `'discord'`, `'telegram'`, ... |
| `channelId` | string, optional | Platform channel ID |
| `connectionId` | string, optional | Connection ID (Discord/Telegram connection) |
| `workId` | string, optional | Work item liên quan |
| `attachments` | object[], optional | File đính kèm |

**Filter rules — bắt buộc phải áp dụng:**

| Điều kiện | Hành động | Lý do |
|-----------|-----------|-------|
| `_id` đã thấy | Bỏ qua | Dedup khi có nhiều WS instance |
| `role === 'assistant'` | Bỏ qua | Echo lại response của chính agent |
| `skipAgent === true` | Bỏ qua | Tin nhắn dùng `/ignore` hoặc `/igr` |
| `type` khác `'message'` | Bỏ qua | Internal steps (tool_use, thinking, ...) |

Dedup set nên giới hạn tối đa ~200 entries, rotate oldest khi đầy.

---

## 5. message:send

**Mục đích:** Gửi response của agent vào conversation.

**Payload:**
| Field | Type | Mô tả |
|-------|------|-------|
| `conversationId` | string, required | |
| `role` | string, required | `'assistant'` cho response thông thường |
| `content` | string, required | Nội dung |
| `type` | string, optional | Mặc định `'message'`. Dùng `'tool_use'`, `'tool_result'`, `'thinking'` cho internal steps |
| `workId` | string, optional | Gắn message với work item |
| `attachments` | object[], optional | File đính kèm |
| `sources` | object[], optional | RAG sources hoặc references |

---

## 6. agent:command

**Mục đích:** Server gửi lệnh điều khiển đến agent — từ admin nhắn slash command trên portal/Discord/Telegram, hoặc từ hệ thống tự động.

**Payload:**
| Field | Type | Mô tả |
|-------|------|-------|
| `type` | string | Loại lệnh (xem bảng dưới) |
| `conversationId` | string, optional | Conversation liên quan |
| `reason` | string, optional | Lý do (thường từ `/sleep <reason>`) |

**Các command type agent nhận được:**

| type | Mô tả | Agent nên làm gì |
|------|-------|-----------------|
| `inspect` | Yêu cầu runtime info | Emit `message:send` với `type: 'system'` chứa JSON runtime state (model, memory usage, isBusy, ...) |
| `reload` | Reload config từ AIWM | Gọi lại `/agents/connect` để lấy instruction/tools mới, áp dụng mà không cần restart |
| `sleep` | Dừng nhận task mới | Emit heartbeat `status: 'sleep'` và tạm dừng vòng lặp xử lý |
| `wake` | Resume sau khi sleep | Emit heartbeat `status: 'idle'` và tiếp tục xử lý |

> **Lưu ý:** Các command `stop`, `start`, `restart`, `update` được xử lý ở tầng Node (system-managed) — agent không bao giờ nhận các command này qua `agent:command`.

---

## 7. Slash commands từ platform

Connection Worker intercept các slash command trước khi forward tin nhắn tới agent:

| Command | Hành động |
|---------|-----------|
| `/ignore <text>` hoặc `/igr <text>` | Bỏ qua hoàn toàn — không lưu DB, không forward tới agent |
| `/inspect` | Server emit `agent:command { type: 'inspect' }` |
| `/reload` | Server emit `agent:command { type: 'reload' }` |
| `/sleep [reason]` | Server emit `agent:command { type: 'sleep', reason }` |
| `/wake` | Server emit `agent:command { type: 'wake' }` |
| `/stop`, `/start`, `/restart`, `/update` | Xử lý qua NodeGateway — agent không nhận |

---

## 8. POST /agents/disconnect

**Auth:** JWT (Bearer token)

**Request body:**
| Field | Type | Mô tả |
|-------|------|-------|
| `reason` | string, optional | Lý do disconnect |

Gọi khi shutdown graceful. Server xóa socket khỏi Redis presence và broadcast `presence:update { status: 'offline' }`.

---

## 9. presence:update

Server broadcast event này khi agent hoặc user thay đổi trạng thái online/offline.

**Payload (agent):**
```
{ type: 'agent', agentId, status: 'online' | 'offline', timestamp }
```

---

## Tóm tắt

**Endpoints:**

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `POST /agents/connect` | Public | Xác thực, lấy JWT + full config |
| `POST /agents/heartbeat` | JWT | HTTP heartbeat (fallback) |
| `POST /agents/disconnect` | JWT | Graceful disconnect |
| ~~`POST /agents/:id/connect`~~ | Public | **Deprecated** |
| ~~`POST /agents/:id/heartbeat`~~ | JWT | **Deprecated** |

**WS Events:**

| Event | Chiều | Mô tả |
|-------|-------|-------|
| `agent:heartbeat` | agent → server (ack) | Báo status, nhận work assignment |
| `message:new` | server → agent | Tin nhắn trong conversation — phải filter |
| `message:send` | agent → server | Gửi response |
| `agent:command` | server → agent | Lệnh điều khiển: inspect, reload, sleep, wake |
| `presence:update` | server → all | Thông báo online/offline |
