# Chat WebSocket — Client Integration Guide

Namespace: `/ws/chat`
Server: `ws://<host>:3003`

---

## 1. Các loại client

| Type | Mô tả | Token |
|------|--------|-------|
| `user` | Authenticated user (đã login qua IAM) | User JWT từ IAM |
| `anonymous` | Anonymous user (chatbot widget trên web) | Anonymous JWT từ `POST /agents/:id/anonymous-token` |
| `agent` | Agent SDK | Agent JWT từ `POST /agents/:id/connect` |

---

## 2. Lấy Anonymous Token (cho chatbot widget)

Trước khi anonymous user có thể connect WebSocket, backend tích hợp cần gọi API để lấy token:

```
POST /agents/:agentId/anonymous-token
Authorization: Bearer <user-jwt-of-org.owner-or-editor>
Content-Type: application/json
```

**Body:**
```json
{
  "anonymousId": "550e8400-e29b-41d4-a716-446655440000",  // optional, tự sinh nếu bỏ qua
  "expiresIn": 86400                                        // optional, giây, default 86400 (24h)
}
```

**Response:**
```json
{
  "token": "<jwt>",
  "anonymousId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresIn": 86400,
  "expiresAt": "2026-03-13T10:00:00.000Z"
}
```

**Lưu ý:**
- `anonymousId` do backend tích hợp tự quản lý (lưu vào session/cookie để dùng lại khi refresh token)
- Token hết hạn → gọi lại endpoint với cùng `anonymousId` để lấy token mới

---

## 3. Connect WebSocket

### 3.1 Authenticated User

```js
import { io } from 'socket.io-client'

const socket = io('ws://<host>:3003/ws/chat', {
  auth: {
    token: '<user-jwt>'   // JWT từ IAM login
  }
})
```

Sau khi connect, **bắt buộc** phải emit `agent:connect` hoặc `conversation:join` trước khi gửi message.

### 3.2 Anonymous User

```js
const socket = io('ws://<host>:3003/ws/chat', {
  auth: {
    token: '<anonymous-jwt>'   // JWT từ POST /agents/:id/anonymous-token
  }
})

// Server tự động findOrCreate conversation ngay khi connect
// Lắng nghe presence:update để lấy conversationId
socket.on('presence:update', (data) => {
  console.log(data.conversationId) // conversationId sẵn sàng
})
```

Anonymous user **không cần** emit thêm event nào — conversation được tạo/resume tự động.

---

## 4. Events — Client emit lên Server

### 4.1 `agent:connect` — Authenticated user chọn agent

Dùng để tạo conversation mới với agent hoặc resume conversation đang active theo cặp `(userId, agentId)`.

```js
socket.emit('agent:connect', { agentId: '<agent-id>' }, (response) => {
  // response: { success: true, conversationId: '...' }
  //        hoặc { success: false, error: '...' }
  console.log(response.conversationId)
})
```

| Field | Type | Mô tả |
|-------|------|--------|
| `agentId` | string | ID của agent muốn chat |

**Response:**
```json
{
  "success": true,
  "conversationId": "<mongodb-object-id>"
}
```

### 4.2 `conversation:join` — Resume conversation cụ thể

Dùng khi đã biết `conversationId` (ví dụ: user chọn lại conversation từ lịch sử).

```js
socket.emit('conversation:join', { conversationId: '<id>' }, (response) => {
  // response: { success: true, conversationId: '...' }
})
```

| Field | Type | Mô tả |
|-------|------|--------|
| `conversationId` | string | MongoDB ObjectId của conversation |

### 4.3 `conversation:leave` — Rời conversation

```js
socket.emit('conversation:leave', { conversationId: '<id>' }, (response) => {
  // response: { success: true, conversationId: '...' }
})
```

### 4.4 `message:send` — Gửi message

**Yêu cầu:** Phải đã join conversation trước (qua `agent:connect` hoặc `conversation:join`).

```js
socket.emit('message:send', {
  role: 'user',           // bắt buộc: 'user' | 'assistant' | 'system' | 'tool'
  content: 'Xin chào!',  // bắt buộc
  conversationId: '...',  // optional, tự lấy từ connection nếu bỏ qua
  type: 'text',           // optional: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'system'
  participantId: '...',   // optional: userId hoặc agentId
  attachments: [],        // optional: ['https://...', 'document:doc-id']
  parentId: '...',        // optional: threading
}, (response) => {
  // response: { success: true, message: {...} }
})
```

**Fields tối thiểu cho user message:**
```js
{ role: 'user', content: 'Nội dung tin nhắn' }
```

### 4.5 `message:typing` — Typing indicator

```js
socket.emit('message:typing', {
  conversationId: '<id>',
  isTyping: true   // true = đang gõ, false = dừng
})
```

### 4.6 `message:read` — Đánh dấu đã đọc

```js
socket.emit('message:read', {
  conversationId: '<id>',
  messageId: '<message-id>'
})
```

### 4.7 `conversation:online` — Lấy danh sách user online trong conversation

```js
socket.emit('conversation:online', { conversationId: '<id>' }, (response) => {
  // response: { success: true, onlineUsers: ['userId1', 'userId2'] }
})
```

---

## 5. Events — Server emit về Client

### 5.1 `presence:update` — Trạng thái online/offline

Broadcast toàn server khi có ai connect/disconnect.

```json
// User connect
{
  "type": "user",
  "userId": "<userId>",
  "status": "online",
  "timestamp": "2026-03-12T10:00:00.000Z"
}

// Anonymous connect (có thêm conversationId)
{
  "type": "anonymous",
  "userId": "<anonymousId>",
  "agentId": "<agentId>",
  "conversationId": "<conversationId>",
  "status": "online",
  "timestamp": "2026-03-12T10:00:00.000Z"
}

// Agent connect
{
  "type": "agent",
  "agentId": "<agentId>",
  "status": "online",
  "timestamp": "2026-03-12T10:00:00.000Z"
}
```

### 5.2 `message:new` — Có message mới trong conversation

Broadcast đến tất cả members trong room `conversation:<id>`.

```json
{
  "_id": "<message-id>",
  "conversationId": "<conversation-id>",
  "role": "assistant",
  "content": "Xin chào! Tôi có thể giúp gì cho bạn?",
  "type": "text",
  "participantId": "<agentId>",
  "status": "sent",
  "createdAt": "2026-03-12T10:00:01.000Z"
}
```

### 5.3 `message:sent` — Xác nhận message đã gửi thành công

Emit về riêng cho sender.

```json
{
  "success": true,
  "messageId": "<message-id>",
  "timestamp": "2026-03-12T10:00:01.000Z"
}
```

### 5.4 `message:error` — Lỗi gửi message

```json
{
  "success": false,
  "error": "No conversation found. Please emit agent:connect or conversation:join first.",
  "timestamp": "2026-03-12T10:00:01.000Z"
}
```

### 5.5 `agent:typing` — Agent đang gõ

Broadcast đến room, client nhận để hiển thị typing indicator.

```json
{
  "type": "agent",
  "agentId": "<agentId>",
  "conversationId": "<conversationId>",
  "isTyping": true,
  "timestamp": "2026-03-12T10:00:01.000Z"
}
```

### 5.6 `user:typing` — User đang gõ (agent nhận)

```json
{
  "type": "user",
  "userId": "<userId>",
  "conversationId": "<conversationId>",
  "isTyping": true,
  "timestamp": "2026-03-12T10:00:01.000Z"
}
```

### 5.7 `user:joined` / `user:left` — Có người vào/rời room

```json
{
  "type": "user",
  "userId": "<userId>",
  "conversationId": "<conversationId>",
  "timestamp": "2026-03-12T10:00:01.000Z"
}
```

### 5.8 `message:read` — Ai đó đã đọc message

```json
{
  "type": "user",
  "userId": "<userId>",
  "messageId": "<message-id>",
  "conversationId": "<conversationId>",
  "timestamp": "2026-03-12T10:00:01.000Z"
}
```

---

## 6. Full Flow Examples

### 6.1 Authenticated User — Chat với agent mới

```js
const socket = io('ws://localhost:3003/ws/chat', {
  auth: { token: userJwt }
})

socket.on('connect', () => {
  // Bước 1: chọn agent
  socket.emit('agent:connect', { agentId: 'agent-123' }, (res) => {
    if (!res.success) return console.error(res.error)
    const { conversationId } = res

    // Bước 2: gửi message
    socket.emit('message:send', {
      role: 'user',
      content: 'Xin chào!'
    })
  })
})

// Nhận message từ agent
socket.on('message:new', (message) => {
  console.log(message.role, message.content)
})

// Typing indicator
socket.on('agent:typing', ({ isTyping }) => {
  showTypingIndicator(isTyping)
})
```

### 6.2 Authenticated User — Resume conversation cũ

```js
socket.on('connect', () => {
  socket.emit('conversation:join', { conversationId: 'conv-abc' }, (res) => {
    if (res.success) console.log('Rejoined conversation', res.conversationId)
  })
})
```

### 6.3 Anonymous User — Chatbot widget

```js
// Lấy token từ backend (backend gọi POST /agents/:id/anonymous-token)
const { token, anonymousId } = await fetchAnonymousToken()
localStorage.setItem('chatAnonymousId', anonymousId)
localStorage.setItem('chatToken', token)

const socket = io('ws://localhost:3003/ws/chat', {
  auth: { token }
})

// Server tự tạo conversation, trả về qua presence:update
socket.on('presence:update', (data) => {
  if (data.type === 'anonymous' && data.status === 'online') {
    console.log('Ready, conversationId:', data.conversationId)
  }
})

// Gửi message ngay sau khi ready
socket.on('message:new', (message) => {
  if (message.role === 'assistant') {
    displayMessage(message.content)
  }
})

function sendMessage(text) {
  socket.emit('message:send', { role: 'user', content: text })
}
```

---

## 7. Xử lý lỗi & Reconnect

```js
socket.on('connect_error', (err) => {
  console.error('Connection failed:', err.message)
  // Token hết hạn → refresh token rồi reconnect
  if (err.message.includes('jwt expired')) {
    refreshToken().then(newToken => {
      socket.auth.token = newToken
      socket.connect()
    })
  }
})

socket.on('disconnect', (reason) => {
  // Socket.IO tự reconnect nếu reason !== 'io client disconnect'
  console.log('Disconnected:', reason)
})

// Sau khi reconnect, cần re-join conversation
socket.on('connect', () => {
  if (savedConversationId) {
    socket.emit('conversation:join', { conversationId: savedConversationId })
  }
})
```

---

## 8. Typing Indicator Pattern

```js
let typingTimer

function onUserInput() {
  socket.emit('message:typing', { conversationId, isTyping: true })
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    socket.emit('message:typing', { conversationId, isTyping: false })
  }, 2000) // dừng gõ 2s → gửi isTyping: false
}
```
