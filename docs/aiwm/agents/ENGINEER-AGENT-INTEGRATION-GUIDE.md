# Engineer Agent Integration Guide

Hướng dẫn tích hợp agent loại `engineer` với AIWM. Engineer agent là agent tự deploy (hoặc deploy lên Node), có quyền truy cập môi trường đầy đủ (bash, file system, v.v.).

## Flow tổng quan

```
1. POST /agents/connect          → lấy JWT token + config
2. Connect WS /ws/chat           → nhận message, command
3. emit agent:heartbeat          → báo status, nhận work assignment
4. Lắng nghe message:new        → filter và xử lý tin nhắn
5. emit message:send             → gửi response
6. Lắng nghe agent:command      → xử lý lệnh từ admin
```

---

## 1. Authentication — POST /agents/connect

**Endpoint:** `POST /agents/connect`
**Auth:** Public (không cần JWT)

**Request:**
```json
{
  "id": "<agentId>",
  "secret": "<agent-secret>",
  "version": "1.0.0"
}
```

**Response:**
```typescript
{
  id: string;                    // Agent ID
  name: string;                  // Agent name
  accessToken: string;           // JWT token (expires 24h) — dùng để auth WS + heartbeat
  expiresIn: number;             // Seconds until token expires (86400)
  tokenType: "bearer";
  instruction: {
    id: string;
    systemPrompt: string;        // Full instruction text đã merge
  };
  tools: Array<{
    _id: string;
    name: string;
    type: "builtin" | "custom" | "mcp" | "api";
    description: string;
    schema: { inputSchema: object; outputSchema: object };
  }>;
  allowedFunctions: string[];    // Danh sách function names được phép gọi
  framework: "claude-agent-sdk" | "vercel-ai-sdk";
  deployment?: {
    id: string;
    provider: string;
    model: string;
    baseAPIEndpoint: string;
    apiEndpoint: string;
    multimodal?: boolean;
  };
  settings: Record<string, unknown>;   // Runtime config từ admin
  mcpServers: Record<string, {
    type: string;
    url: string;
    headers?: Record<string, string>;
  }>;
  ragEnabled: boolean;
  ragCollections: Array<{
    collectionId: string;
    topK: number;
    minScore: number;
  }>;
  agentCode?: string;
  browserApiUrl?: string | null;
  browserApiKey?: string | null;
}
```

> **Deprecated:** `POST /agents/:id/connect` (agentId trên URL) vẫn hoạt động nhưng sẽ bị xóa trong tương lai. Dùng endpoint mới.

**Lưu lại `accessToken`** để dùng cho WS auth và HTTP heartbeat.

---

## 2. WebSocket — Connect /ws/chat

```typescript
import { io } from 'socket.io-client';

const wsUrl = 'wss://skt.x-or.cloud'; // origin
const socket = io(`${wsUrl}/ws/chat`, {
  auth: { token: accessToken },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 5000,
});

socket.on('connect', () => {
  console.log('Connected, socketId:', socket.id);
  // Không cần emit conversation:join — server tự rejoin các conversation active
});

socket.on('disconnect', (reason) => {
  console.warn('Disconnected:', reason);
  // socket.io tự reconnect
});
```

**Sau khi connect**, server tự động:
- Thêm socket vào Redis presence `presence:agent:{agentId}`
- Rejoin tất cả conversation active của agent (không cần emit `conversation:join`)
- Broadcast `presence:update { type: 'agent', agentId, status: 'online' }` cho các client khác

---

## 3. Heartbeat — agent:heartbeat (WS)

Dùng WS event thay vì HTTP để tránh round-trip và trigger work assignment ngay lập tức.

**emit:**
```typescript
socket.emit('agent:heartbeat', {
  status: 'idle' | 'busy' | 'sleep',

  // Khi status = 'sleep'
  sleep?: {
    reason: string;      // Lý do sleep
    since: string;       // ISO timestamp khi bắt đầu sleep
    until?: string;      // ISO timestamp khi dự kiến wake (null = indefinite)
  },

  // Nên gửi khi có để server assign work chính xác hơn
  mcpConnected?: boolean;          // Agent đang có MCP session không
  availableFunctions?: string[];   // Danh sách function names hiện có

  metrics?: Record<string, unknown>;
}, (ack) => {
  // ack response
});
```

**ack response:**
```typescript
{
  success: boolean;

  // Khi server có việc cần giao (status = 'idle')
  work?: {
    id: string;
    title: string;
    type: string;
    status: string;
    priorityLevel: number;
  };
  systemMessage?: string;          // Nội dung inject vào context agent
  systemTask?: {
    type: 'work' | 'reminders' | 'inbox' | 'alert';
    id?: string;
    title?: string;
    reminders?: { id: string; content: string }[];
  };
}
```

**Khuyến nghị:**
- Gửi mỗi 30–60 giây
- Gửi ngay `status: 'idle'` sau khi xử lý xong một task để nhận việc tiếp theo nhanh hơn

**Fallback HTTP** (khi WS không khả dụng):
```
POST /agents/heartbeat
Authorization: Bearer <accessToken>
Body: { status, mcpConnected, availableFunctions, metrics, sleep }
```

---

## 4. Nhận tin nhắn — message:new

Server broadcast **tất cả** event vào conversation room, agent phải tự filter.

**Payload nhận được:**
```typescript
{
  _id: string;                    // Action ID — dùng để dedup
  conversationId: string;
  role: 'user' | 'assistant';
  type?: 'message' | 'system' | 'tool_use' | 'tool_result' | 'thinking' | 'error';
  content: string;
  skipAgent?: boolean;            // Nếu true → bỏ qua
  agentId?: string;               // Sender agent ID
  userId?: string;                // Sender user ID
  username?: string;
  fullname?: string;
  externalUsername?: string;      // Discord/Telegram username
  externalUserId?: string;
  channelId?: string;
  connectionId?: string;
  platform: string;
  workId?: string;
  attachments?: Array<{
    type: string; url: string; filename?: string; mimeType?: string; size?: number;
  }>;
}
```

**Filter rules (bắt buộc):**
```typescript
const seenIds = new Set<string>();

socket.on('message:new', (msg) => {
  // 1. Dedup — tránh xử lý 2 lần khi có nhiều WS instance
  if (msg._id && seenIds.has(msg._id)) return;
  if (msg._id) {
    seenIds.add(msg._id);
    if (seenIds.size > 200) seenIds.delete(seenIds.values().next().value);
  }

  // 2. Chỉ xử lý user message
  if (msg.role === 'assistant') return;            // Echo lại message của agent
  if (msg.skipAgent === true) return;              // /ignore hoặc /igr
  if (msg.type && msg.type !== 'message') return;  // system/tool_use/tool_result/thinking

  // 3. Xử lý
  handleUserMessage(msg);
});
```

---

## 5. Gửi response — message:send

```typescript
socket.emit('message:send', {
  conversationId: string;      // Required
  role: 'assistant';
  content: string;

  // Optional
  type?: 'message' | 'tool_use' | 'tool_result' | 'thinking';
  workId?: string;
  attachments?: Array<{
    type: string; url: string; filename?: string; mimeType?: string; size?: number;
  }>;
  sources?: Array<{
    type: string; content: string; score?: number; label?: string;
    collectionId?: string; url?: string; toolName?: string;
  }>;
});
```

---

## 6. Nhận lệnh — agent:command

Server gửi khi admin nhắn slash command (`/inspect`, `/reload`, `/sleep`, `/wake`) hoặc trigger từ platform (Discord/Telegram).

**Payload:**
```typescript
socket.on('agent:command', (payload: {
  type: 'inspect' | 'reload' | 'sleep' | 'wake';
  conversationId?: string;
  reason?: string;
}) => {
  switch (payload.type) {
    case 'inspect':
      // Trả về runtime info dưới dạng system message
      // emit message:send với type: 'system' và nội dung JSON runtime state
      break;
    case 'reload':
      // Re-fetch config từ AIWM (gọi lại /agents/connect)
      break;
    case 'sleep':
      // Dừng nhận task mới
      break;
    case 'wake':
      // Resume nhận task
      break;
  }
});
```

> **Lưu ý:** Các command `stop`, `start`, `restart`, `update` được xử lý ở tầng Node (system-managed), agent không nhận các command này trực tiếp.

---

## 7. Disconnect

```
POST /agents/disconnect
Authorization: Bearer <accessToken>
Body: { "reason": "graceful shutdown" }   // optional
```

Gọi khi shutdown graceful (SIGINT/SIGTERM). Server sẽ xóa socket khỏi Redis presence và broadcast `presence:update { status: 'offline' }`.

---

## 8. Token refresh

JWT expire sau 24h. Cần reconnect trước khi hết hạn:

```typescript
// Reconnect mỗi 23h
setInterval(async () => {
  const newConfig = await post('/agents/connect', { id, secret });
  socket.auth = { token: newConfig.accessToken };
  socket.disconnect().connect();   // Reconnect với token mới
}, 23 * 60 * 60 * 1000);
```

---

## 9. Slash commands từ platform (Discord/Telegram)

Khi user nhắn slash command trên Discord/Telegram, **Connection Worker** intercept trước khi forward tới agent:

| Command | Xử lý |
|---------|-------|
| `/ignore <text>` hoặc `/igr <text>` | Bỏ qua hoàn toàn — không lưu DB, không gửi tới agent |
| `/inspect` | Server emit `agent:command { type: 'inspect' }` |
| `/reload` | Server emit `agent:command { type: 'reload' }` |
| `/stop`, `/start`, `/restart` | Xử lý qua NodeGateway — agent không nhận |
| `/sleep`, `/wake` | Server emit `agent:command { type: 'sleep' | 'wake' }` |

---

## 10. Startup flow đầy đủ

```typescript
async function startAgent() {
  // 1. Connect lấy config
  const config = await post('/agents/connect', { id: AGENT_ID, secret: AGENT_SECRET });

  // 2. Init Claude SDK hoặc framework từ config
  initClaudeSDK({
    model: config.deployment?.model,
    systemPrompt: config.instruction.systemPrompt,
    allowedFunctions: config.allowedFunctions,
    mcpServers: config.mcpServers,
  });

  // 3. Connect WS
  const socket = io(`${WS_ORIGIN}/ws/chat`, {
    auth: { token: config.accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 5000,
  });

  // 4. Heartbeat
  setInterval(() => {
    socket.emit('agent:heartbeat', {
      status: isBusy ? 'busy' : 'idle',
      mcpConnected: true,
      availableFunctions: config.allowedFunctions,
    });
  }, 30_000);

  // 5. Nhận message
  const seenIds = new Set<string>();
  socket.on('message:new', (msg) => {
    if (msg._id && seenIds.has(msg._id)) return;
    if (msg._id) { seenIds.add(msg._id); if (seenIds.size > 200) seenIds.delete(seenIds.values().next().value); }
    if (msg.role === 'assistant') return;
    if (msg.skipAgent === true) return;
    if (msg.type && msg.type !== 'message') return;
    handleMessage(msg, socket, config);
  });

  // 6. Nhận command
  socket.on('agent:command', (cmd) => handleCommand(cmd, socket));

  // 7. Token refresh mỗi 23h
  setInterval(() => startAgent(), 23 * 60 * 60 * 1000);

  // 8. Graceful shutdown
  process.on('SIGTERM', async () => {
    await post('/agents/disconnect', {}, { Authorization: `Bearer ${config.accessToken}` });
    socket.disconnect();
    process.exit(0);
  });
}
```

---

## Tóm tắt endpoints

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `POST /agents/connect` | Public | Lấy JWT + config. Body: `{id, secret, version?}` |
| `POST /agents/heartbeat` | JWT | HTTP heartbeat fallback. Body: AgentHeartbeatDto |
| `POST /agents/disconnect` | JWT | Graceful disconnect. Body: `{reason?}` |
| ~~`POST /agents/:id/connect`~~ | Public | **Deprecated** — dùng endpoint trên |
| ~~`POST /agents/:id/heartbeat`~~ | JWT | **Deprecated** — dùng WS hoặc `/agents/heartbeat` |

## Tóm tắt WS events

| Event | Chiều | Mô tả |
|-------|-------|-------|
| `agent:heartbeat` | emit → ack | Báo status, nhận work assignment |
| `message:new` | server → agent | Tin nhắn trong conversation (cần filter) |
| `message:send` | agent → server | Gửi response |
| `agent:command` | server → agent | Lệnh từ admin: inspect, reload, sleep, wake |
| `presence:update` | server → all | Thông báo online/offline của agent/user |
