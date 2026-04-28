# CWS Test Scenario — Anonymous Chat Client

Test luồng đầy đủ: Model → Deployment → Agent (assistant) → Anonymous token → Chat qua CWS.

## Prerequisites

- API server đang chạy: `core.aiwm.api00` (port 3333)
- CWS đang chạy: `core.aiwm.cws00` (port 3402)
- Agt worker đang chạy: `core.aiwm.agt00`
- Đã có JWT token của user có role `org.owner` hoặc `org.editor`

Thay thế các placeholder:
- `<BASE_URL>` = `https://api.hydrabyte.co` (hoặc `http://localhost:3003` nếu dev)
- `<CWS_URL>` = `wss://ws.hydrabyte.co` (hoặc `ws://localhost:3402` nếu dev)
- `<JWT>` = JWT token của user
- `<ORG_ID>` = orgId của user

---

## Bước 1 — Tạo Model (api-based)

```bash
curl -X POST <BASE_URL>/models \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT-4o Mini Test",
    "deploymentType": "api-based",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "credentials": {
      "apiKey": "sk-proj-..."
    }
  }'
```

**Lưu lại:** `modelId` từ response.

---

## Bước 2 — Tạo Deployment

```bash
curl -X POST <BASE_URL>/deployments \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT-4o Mini Deployment",
    "modelId": "<modelId>"
  }'
```

**Lưu lại:** `deploymentId` từ response.

---

## Bước 3 — Test Deployment Inference API

Gọi thử inference trước khi gắn vào agent để xác nhận credentials hợp lệ.

```bash
curl -X POST <BASE_URL>/deployments/<deploymentId>/inference/v1/chat/completions \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "Say hello in one sentence." }
    ]
  }'
```

**Expected:** HTTP 200, response có `choices[0].message.content`.

---

## Bước 4 — Tạo Agent (assistant)

```bash
curl -X POST <BASE_URL>/agents \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CWS Test Agent",
    "type": "assistant",
    "deploymentId": "<deploymentId>",
    "conversationMode": "per-user",
    "instruction": "You are a helpful assistant. Keep responses concise."
  }'
```

**Lưu lại:** `agentId` từ response.

---

## Bước 5 — Tạo Anonymous Token

```bash
curl -X POST <BASE_URL>/agents/<agentId>/anonymous-token \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "CWS Test Token",
    "expiresInDays": 7
  }'
```

**Lưu lại:** `token` (JWT) và `tokenId` từ response.

---

## Bước 6 — Kết nối Chat Client (lần 1)

Dùng Node.js REPL hoặc script:

```javascript
const { io } = require('socket.io-client');

const TOKEN = '<anonymous-token-jwt>';
const CWS_URL = '<CWS_URL>';

const socket = io(CWS_URL, {
  path: '/chat/socket.io',   // nginx path — bỏ nếu kết nối trực tiếp localhost:3402
  auth: { token: TOKEN },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('[connect] socketId:', socket.id);
});

socket.on('presence:update', (data) => {
  console.log('[presence:update]', JSON.stringify(data));
});

socket.on('message:new', (data) => {
  console.log('[message:new]', JSON.stringify(data));
});

socket.on('agent:typing', (data) => {
  console.log('[agent:typing]', JSON.stringify(data));
});

socket.on('disconnect', (reason) => {
  console.log('[disconnect]', reason);
});
```

**Expected sau connect:**
- `[connect]` xuất hiện → socketId logged
- `[presence:update]` với `type: "anonymous", status: "online", conversationId: "<id>"` — server tự resolve conversation

**Lưu lại:** `conversationId` từ event `presence:update`.

---

## Bước 7 — Gửi Message và Nhận Response

```javascript
// Gửi message
socket.emit('message:send', {
  role: 'user',
  content: 'Hello! Can you introduce yourself?',
});

// Lắng nghe confirmation
socket.on('message:sent', (data) => {
  console.log('[message:sent]', JSON.stringify(data));
});
```

**Expected sequence:**
1. `[message:sent]` → `{ success: true, messageId: "..." }`
2. `[agent:typing]` → `{ isTyping: true }` (nếu assistant gửi typing indicator)
3. `[message:new]` → `{ role: "assistant", content: "...", type: "message" }`

---

## Bước 8 — Ngắt Kết Nối

```javascript
socket.disconnect();
```

**Expected:** `[disconnect] io client disconnect` logged.

---

## Bước 9 — Kết nối lại (lần 2) — Test Resume Conversation

Tạo socket mới với **cùng anonymous token**:

```javascript
const socket2 = io(CWS_URL, {
  path: '/chat/socket.io',
  auth: { token: TOKEN },
  transports: ['websocket'],
});

socket2.on('connect', () => {
  console.log('[connect] socketId:', socket2.id);
});

socket2.on('presence:update', (data) => {
  console.log('[presence:update]', JSON.stringify(data));
  // conversationId phải giống lần 1 (per-user mode giữ nguyên conversation)
});

socket2.on('message:new', (data) => {
  console.log('[message:new]', JSON.stringify(data));
});
```

**Expected:**
- `conversationId` trong `presence:update` **giống hệt** lần 1 → conversation được resume
- `per-user` mode: cùng anonymousId → cùng conversation

---

## Bước 10 — Fetch History và Chat tiếp

```javascript
// Lấy lịch sử conversation
socket2.emit('conversation:history', {
  conversationId: '<conversationId-từ-bước-6>',
  limit: 20,
}, (response) => {
  console.log('[history] total:', response.total);
  response.data.forEach(msg => {
    console.log(`  [${msg.role}] ${msg.content.substring(0, 80)}`);
  });
});

// Gửi message tiếp theo
socket2.emit('message:send', {
  role: 'user',
  content: 'What did I ask you before?',
});
```

**Expected:**
- History trả về 2 messages từ lần 1 (1 user + 1 assistant)
- Agent nhận được context → trả lời đúng "You asked me to introduce myself"

---

## Checklist

| Bước | Kiểm tra | Pass |
|------|---------|------|
| 1 | Model tạo thành công, có `modelId` | |
| 2 | Deployment tạo thành công, có `deploymentId` | |
| 3 | Inference API trả về response từ OpenAI | |
| 4 | Agent tạo thành công, `type=assistant`, `conversationMode=per-user` | |
| 5 | Anonymous token tạo thành công, có `token` và `tokenId` | |
| 6 | Socket connect thành công, nhận `presence:update` với `conversationId` | |
| 7 | Gửi message → nhận `message:sent` → nhận `message:new` từ assistant | |
| 8 | Disconnect không có lỗi | |
| 9 | Reconnect với cùng token → `conversationId` giống bước 6 | |
| 10 | History có 2 messages, agent nhớ context từ lần trước | |

---

## Troubleshooting

**Socket không connect được:**
- Kiểm tra CWS đang chạy: `pm2 status core.aiwm.cws00`
- Kiểm tra nginx location `/chat/` đã config chưa
- Nếu dev (localhost:3402): bỏ `path: '/chat/socket.io'`

**`presence:update` không có `conversationId`:**
- Token không phải `type: anonymous` → kiểm tra lại endpoint `/anonymous-token`

**`message:new` không nhận được assistant response:**
- Kiểm tra agt worker đang chạy: `pm2 status core.aiwm.agt00`
- Kiểm tra Redis: `chat:task:<agentId>` có task không
- Kiểm tra log agt worker: `pm2 logs core.aiwm.agt00 --lines 50`

**Reconnect nhưng `conversationId` khác:**
- Anonymous token `tokenId` đã bị revoke → tạo token mới
- `conversationMode` không phải `per-user` → kiểm tra lại agent config
