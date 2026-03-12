# Chat & Conversation Refactor Plan

## Mục tiêu

1. Mỗi cặp `(userId/anonymousId, agentId)` có conversation riêng — nhiều user cùng chat với 1 agent không bị chung conversation.
2. User/anonymous connect WebSocket không cần gọi `conversation:join` thủ công — server tự `findOrCreate` conversation.
3. Agent tự động join đúng room khi user connect, hỗ trợ multi-instance qua Redis Adapter `socketsJoin`.
4. Hỗ trợ anonymous user (chatbot CSKH gắn trên web) qua JWT anonymous token.

---

## 1. Entity thay đổi

### 1.1 Conversation Schema

**File:** `services/aiwm/src/modules/conversation/conversation.schema.ts`

Thêm 2 field:

| Field | Type | Mô tả |
|-------|------|--------|
| `userId` | `string` | ID của authenticated user hoặc `anonymousId`. Index cùng `agentId` để `findOrCreate` nhanh. |
| `userType` | `'authenticated' \| 'anonymous'` | Phân biệt loại user, phục vụ analytics và cleanup sau này. |

Thêm compound index:
```
{ agentId: 1, userId: 1, status: 1 }  — unique lookup cho findOrCreate
```

Xóa method `findOrCreateForAgent(agentId, orgId)` — thay bằng `findOrCreateForUser(userId, agentId, orgId, userType)`.

---

### 1.2 Không thay đổi Agent Schema

Agent schema không cần thêm field. Config anonymous token expiry dùng default 24h, phase sau mới cần lưu vào settings.

---

## 2. API thay đổi

### 2.1 Endpoint mới: Anonymous Token

**File:** `services/aiwm/src/modules/agent/agent.controller.ts`
**File:** `services/aiwm/src/modules/agent/agent.service.ts`
**File:** `services/aiwm/src/modules/agent/agent.dto.ts`

```
POST /agents/:id/anonymous-token
```

- **Auth:** `JwtAuthGuard` — yêu cầu role `org.owner` hoặc `org.editor`
- **Body:**
  ```json
  {
    "anonymousId": "uuid-optional",   // optional, server sinh uuid v4 nếu không truyền
    "expiresIn": 86400                // optional, đơn vị giây, default 86400 (24h)
  }
  ```
- **Response:**
  ```json
  {
    "token": "<jwt>",
    "anonymousId": "uuid",
    "expiresIn": 86400,
    "expiresAt": "2026-03-13T10:00:00Z"
  }
  ```
- **JWT Payload:**
  ```json
  {
    "type": "anonymous",
    "agentId": "...",
    "orgId": "...",
    "anonymousId": "uuid",
    "userId": "",
    "iat": 0,
    "exp": 0
  }
  ```

**Lưu ý:** Server lấy `orgId` từ agent document (không cần client truyền). Token được ký bằng cùng JWT secret với user token.

---

### 2.2 Không thêm endpoint mới cho conversation

Conversation được tạo tự động khi user/anonymous connect WebSocket. Không cần REST endpoint riêng cho flow này.

---

## 3. WebSocket Flow thay đổi

### 3.1 Handshake

```js
// Authenticated user — chỉ cần token, chưa cần agentId
io('/ws/chat', { auth: { token: userJwt } })

// Anonymous user — agentId đã có trong JWT payload
io('/ws/chat', { auth: { token: anonymousJwt } })
```

### 3.2 handleConnection — Agent

**Thay đổi:** Xóa logic `findOrCreateForAgent` và auto-join room.
Agent chỉ lưu presence vào Redis, không join room nào khi connect.

```
Agent connect
  → verify JWT (type = "agent")
  → setAgentOnline(agentId, socketId)
  → lưu client.data: { type, agentId, orgId }
  → emit presence:update { status: "online" }
  // KHÔNG tạo conversation, KHÔNG join room
```

### 3.3 handleConnection — Authenticated User

```
User connect (auth.token = userJwt)
  → verify JWT → lấy userId, orgId
  → setUserOnline(userId, socketId)
  → lưu client.data: { type: "user", userId, orgId }
  → emit presence:update { status: "online" }
  // KHÔNG tạo conversation, KHÔNG join room — đợi event từ client
```

Sau khi connect, client có 2 lựa chọn:

**A. Kết nối với agent mới / tạo conversation mới:**
```
client emit "agent:connect" { agentId }
  → findOrCreateForUser(userId, agentId, orgId, "authenticated")
  → client.join("conversation:<id>")
  → client.data.agentId = agentId
  → client.data.conversationId = id
  → chatService.joinConversation(conversationId, userId)
  → getAgentSocketIds(agentId) → socketsJoin cross-instance
  → return { conversationId }
```

**B. Resume conversation cũ đã biết conversationId:**
```
client emit "conversation:join" { conversationId }
  → load conversation → lấy agentId từ conversation
  → client.join("conversation:<id>")
  → client.data.agentId = agentId
  → client.data.conversationId = conversationId
  → chatService.joinConversation(conversationId, userId)
  → getAgentSocketIds(agentId) → socketsJoin cross-instance
  → return { conversationId }
```

### 3.4 handleConnection — Anonymous User

```
Anonymous connect (auth.token = anonymousJwt)
  → verify JWT → payload.type === "anonymous"
  → lấy: anonymousId, agentId, orgId từ JWT payload
  → setUserOnline(anonymousId, socketId)  // dùng anonymousId làm identity
  → findOrCreateForUser(anonymousId, agentId, orgId, "anonymous")
  → client.join("conversation:<id>")
  → client.data: { type: "anonymous", userId: anonymousId, agentId, orgId, conversationId }
  → chatService.joinConversation(conversationId, anonymousId)
  → getAgentSocketIds(agentId) → socketsJoin cross-instance
  → emit presence:update { status: "online", conversationId }
```

### 3.5 Agent auto-join room qua Redis Adapter

Khi user/anonymous connect thành công:

```typescript
// Lấy tất cả socketId của agent từ Redis
const agentSocketIds = await chatService.getAgentSocketIds(agentId);
// socketsJoin broadcast qua Redis Adapter tới đúng WS instance đang giữ socket
await this.server.in(agentSocketIds).socketsJoin(`conversation:${conversationId}`);
```

`this.server.in(socketIds).socketsJoin(room)` là Socket.IO Redis Adapter API — hoạt động cross-instance, instance nào giữ socket đó sẽ thực hiện join.

### 3.6 Event mới: agent:connect

**File:** `services/aiwm/src/modules/chat/chat.gateway.ts`

Event mới `agent:connect` thay thế việc truyền `agentId` trong handshake cho authenticated user:

```
client emit "agent:connect" { agentId }
  → findOrCreateForUser(userId, agentId, orgId, "authenticated")
  → join room, socketsJoin agent
  → return { conversationId }
```

### 3.7 conversation:join — Giữ nguyên, bổ sung socketsJoin

Ngoài join room cho user, bổ sung thêm `socketsJoin` để agent cũng join room khi user resume conversation cũ:

```
client emit "conversation:join" { conversationId }
  → load conversation → lấy agentId
  → client.join("conversation:<id>")
  → getAgentSocketIds(agentId) → socketsJoin cross-instance   ← thêm mới
  → return { conversationId }
```

### 3.8 message:send — Bỏ require conversationId

Hiện tại throw error nếu không có `conversationId`. Sau refactor, `client.data.conversationId` luôn được set khi connect → chỉ cần fallback sang `client.data.conversationId`.

---

## 4. ChatService thay đổi

**File:** `services/aiwm/src/modules/chat/chat.service.ts`

Thêm method:
```typescript
// Lấy tất cả socketId của agent (dùng để socketsJoin)
async getAgentSocketIds(agentId: string): Promise<string[]>
// → return redis.smembers(`presence:agent:${agentId}`)
```

Redis key đã có: `presence:agent:{agentId}` là Set các socketId.

---

## 5. ConversationService thay đổi

**File:** `services/aiwm/src/modules/conversation/conversation.service.ts`

- **Xóa:** `findOrCreateForAgent(agentId, orgId)`
- **Thêm:** `findOrCreateForUser(userId, agentId, orgId, userType)`

```typescript
async findOrCreateForUser(
  userId: string,       // authenticated userId hoặc anonymousId
  agentId: string,
  orgId: string,
  userType: 'authenticated' | 'anonymous',
): Promise<Conversation>
```

Query:
```
{ agentId, userId, status: 'active', isDeleted: false }
```

Nếu không có → tạo mới với:
- `title`: auto-generated
- `userId`: field mới
- `userType`: field mới
- `participants`: `[{ type: 'user', id: userId }, { type: 'agent', id: agentId }]`

---

## 6. Danh sách file thay đổi

| File | Loại thay đổi |
|------|--------------|
| `services/aiwm/src/modules/conversation/conversation.schema.ts` | Thêm field `userId`, `userType`; thêm index |
| `services/aiwm/src/modules/conversation/conversation.service.ts` | Xóa `findOrCreateForAgent`; thêm `findOrCreateForUser` |
| `services/aiwm/src/modules/chat/chat.gateway.ts` | Refactor `handleConnection` cho agent/user/anonymous; thêm event `agent:connect`; bổ sung `socketsJoin` vào `conversation:join` |
| `services/aiwm/src/modules/chat/chat.service.ts` | Thêm `getAgentSocketIds` |
| `services/aiwm/src/modules/agent/agent.controller.ts` | Thêm endpoint `POST :id/anonymous-token` |
| `services/aiwm/src/modules/agent/agent.service.ts` | Thêm method `generateAnonymousToken` |
| `services/aiwm/src/modules/agent/agent.dto.ts` | Thêm `AnonymousTokenDto`, `AnonymousTokenResponseDto` |

---

## 7. Điểm cần lưu ý khi implement

1. **Authenticated user** connect xong phải emit `agent:connect` hoặc `conversation:join` trước khi gửi message — nếu chưa có `conversationId` thì `message:send` trả error.
2. **Anonymous user** không cần emit `agent:connect` vì `agentId` đã có trong JWT → auto `findOrCreate` ngay khi connect.
3. **`socketsJoin` chỉ hoạt động** khi Redis Adapter đã connect — nếu fallback in-memory thì chỉ hoạt động single instance (đã có warning log sẵn).
4. **Agent có thể join nhiều rooms** cùng lúc (1 room per user đang active) — đây là behavior đúng.
5. **Khi agent disconnect** — Socket.IO tự leave tất cả rooms, không cần cleanup thủ công.
6. **Khi user disconnect** — leave room, agent vẫn ở trong room đó (để nhận message nếu user reconnect nhanh).
