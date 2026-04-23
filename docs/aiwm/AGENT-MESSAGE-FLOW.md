# Agent Message Flow

Tài liệu mô tả toàn bộ luồng kết nối, nhận tin và gửi tin của 2 loại agent (engineer / assistant) với tất cả các loại connection. Mục đích: làm nền tảng để phân tích và chốt phương án tách `/ws/agent` riêng.

---

## 1. Tổng quan kiến trúc

```
Platform users                  AIWM
─────────────                   ────────────────────────────────────────────────
Discord / Telegram ─────────→  Connection Worker (MODE=con)
Teams / Zalo ──────────────→  API (MODE=api) → Redis → Connection Worker
Chat SDK (browser/app) ─────→  API (MODE=api) / ws/chat

                                ↓ Redis pub/sub

                                ChatGateway (ws/chat, trong MODE=api)
                                  ├─→ engineer agent   (ws/chat, self-deployed)
                                  └─→ assistant agent  (Redis queue → AgentRunner)
```

**Các process / mode:**

| Mode | Mô tả |
|------|-------|
| `api` | HTTP API + WebSocket gateway (`/ws/chat`, `/ws/node`) |
| `con` | Connection Worker — bridge Discord/Telegram/Teams/Zalo ↔ ChatGateway |
| `agt` | Agent Worker — chạy assistant agent in-process (AgentRunner) |
| `wrk` | BullMQ worker — xử lý background jobs |

---

## 2. Luồng kết nối agent

### 2.1 Engineer agent

```
1. Agent gọi POST /agents/connect { id, secret }
   → API trả về: accessToken (JWT 24h), instruction, tools, allowedFunctions,
                 mcpServers, deployment, settings

2. Agent connect WebSocket: wss://<host>/ws/chat
   Header: Authorization: Bearer <accessToken>

3. ChatGateway.handleConnection():
   - Verify JWT → extract agentId, orgId, roles
   - setAgentOnline(agentId, socketId)   → Redis SET: presence:agent:{agentId}
   - setSocketSession(socketId, ...)      → Redis HASH: socket:session:{socketId}
   - findActiveByAgent(agentId)           → auto-rejoin các conversation đang active
   - server.emit('presence:update', { type: 'agent', status: 'online' })

4. Agent sẵn sàng nhận message:new và gửi message:send
```

### 2.2 Assistant agent

```
1. AgentRunner (MODE=agt) khởi động
   → Gọi agentService.connectInternal(agentId) — lấy config nội bộ (không qua HTTP)
   → Connect WebSocket /ws/chat dùng agent JWT (tương tự engineer)

2. AgentRunner lắng nghe:
   - Redis LIST  chat:task:{agentId}   → BLPOP (blocking) để nhận task
   - Redis pub/sub chat:cmd:{agentId}  → nhận lệnh điều khiển (stop/reload/inspect)

3. Scale: nhiều instance agt có thể cùng BLPOP — Redis LIST đảm bảo
   mỗi task chỉ được deliver đến 1 instance (atomic pop).
   Lưu ý: concurrency guard hiện tại là in-memory → khi scale cần distributed lock.
```

---

## 3. Luồng nhận tin nhắn

### 3.1 Discord / Telegram → Engineer agent

```
Discord                   Connection Worker (con)            ChatGateway (api)         Engineer agent
──────                    ───────────────────────            ─────────────────         ──────────────
messageCreate event
  → DiscordAdapter
    normalize → NormalizedInbound
                          _handleInbound()
                            resolve routing (agentId, convId)
                            register outbound handler
                            onAgentJoinRoom()
                              → Redis pub: agent:join-room
                                                             subscribe agent:join-room
                                                               → server.in(agentSocketIds)
                                                                   .socketsJoin(conversation:{convId})
                            onMessageNew()
                              → Redis pub: chat:message-new
                                                             subscribe chat:message-new
                                                               distributed lock (msgNonce)
                                                               check agent sleep status
                                                               broadcast:
                                                                 server.to(conversation:{convId})
                                                                   .emit('message:new', payload)
                                                                                         nhận message:new
                                                                                         (đã trong room)
                                                               agentDoc.type === 'engineer':
                                                                 socketsJoin (confirm)
```

### 3.2 Discord / Telegram → Assistant agent

```
(Giống trên đến bước broadcast)

                                                             agentDoc.type === 'assistant':
                                                               redisPub.lpush(
                                                                 'chat:task:{agentId}',
                                                                 JSON.stringify(task)
                                                               )
                                                                                         AgentRunner (agt)
                                                                                           BLPOP chat:task:{agentId}
                                                                                           handleTask(task)
                                                                                           → run LLM
                                                                                           → publishResponse()
                                                                                             Redis pub:
                                                                                             chat:response:{convId}

                                                             subscribe chat:response:*
                                                               save action to DB
                                                               server.to(conversation:{convId})
                                                                 .emit('message:new', response)
                                                               if isFinal:
                                                                 Redis pub: outbound:message
                          subscribe outbound:message
                            handleOutbound()
                              → runner.sendResponse()
                                → adapter.send()
Discord ←──────────────────────────────────────────────────────────────────────────────────────────
```

### 3.3 Teams / Zalo Bot / Zalo OA → Agent (Engineer hoặc Assistant)

```
Platform             API (api)                  Redis                   Connection Worker (con)
────────             ─────────                  ─────                   ───────────────────────
HTTP POST webhook
  → ConnectionController
    verify webhook signature
    → Redis pub:
        inbound:teams:{connectionId}
        inbound:zalo-bot:{connectionId}
        inbound:zalo-oa:{connectionId}
                                                                        subscribe (pmessage):
                                                                          inbound:teams:*
                                                                          inbound:zalo-bot:*
                                                                          inbound:zalo-oa:*
                                                                        → runner.handleTeamsActivity(body)
                                                                          / handleZaloBotEvent(body)
                                                                          / handleZaloOaEvent(body)
                                                                        → adapter.processActivity/Webhook()
                                                                          normalize → NormalizedInbound
                                                                          → _handleInbound()
                                                                             (từ đây giống 3.1 / 3.2)
```

**Lưu ý:**
- Teams: webhook → API → Redis → con worker → adapter.processActivity() → normalize
- Zalo Bot: polling (default) hoặc webhook → API → Redis → con worker → adapter.processWebhook()
- Zalo OA: webhook only → API → Redis → con worker → adapter.processWebhook()
- Token Zalo OA được refresh mỗi 30 phút bởi ConnectionWorkerService

### 3.4 Chat SDK → Engineer agent

```
User (browser/app)              ChatGateway (api)                    Engineer agent
──────────────────              ─────────────────                    ──────────────
socket.emit('message:send', {
  conversationId, role: 'user',
  content, ...
})
                                handleMessageSend()
                                  verify room membership
                                  save Action to DB (ActionType.MESSAGE)
                                  resolve agentId từ conversation
                                  agentDoc.type === 'engineer':
                                    server.to(conversation:{convId})
                                      .emit('message:new', payload)
                                                                       nhận message:new
                                                                       (đã trong room)
```

### 3.5 Chat SDK → Assistant agent

```
User (browser/app)              ChatGateway (api)                    AgentRunner (agt)
──────────────────              ─────────────────                    ─────────────────
socket.emit('message:send', {
  conversationId, role: 'user',
  content, ...
})
                                handleMessageSend()
                                  save Action to DB
                                  agentDoc.type === 'assistant':
                                    redisPub.lpush(
                                      'chat:task:{agentId}',
                                      JSON.stringify(task)
                                    )
                                    server.to(conversation:{convId})
                                      .emit('message:new', payload)
                                                                     BLPOP chat:task:{agentId}
                                                                     handleTask()
                                                                     → run LLM
                                                                     → publishResponse()
                                                                       Redis pub: chat:response:{convId}
                                subscribe chat:response:*
                                  save action DB
                                  server.to(conversation:{convId})
                                    .emit('message:new', response)
```

---

## 4. Luồng gửi response

### 4.1 Engineer agent gửi response

```
Engineer agent                  ChatGateway (api)                    Platform / Chat SDK
──────────────                  ─────────────────                    ───────────────────
socket.emit('message:send', {
  conversationId,
  role: 'assistant',
  content: '...'
})
                                handleMessageSend()
                                  save Action to DB (ActionType.MESSAGE)
                                  server.to(conversation:{convId})
                                    .emit('message:new', payload)    ← Chat SDK user nhận
                                  if role === 'assistant':
                                    Redis pub: outbound:message
                                      { conversationId, text, actionType }
                                                                     Connection Worker
                                                                       subscribe outbound:message
                                                                       handleOutbound()
                                                                         check actionType whitelist
                                                                         runner.sendResponse()
                                                                           → adapter.send()
                                                                             → Discord/Telegram/Teams/Zalo
```

### 4.2 Assistant agent gửi response

```
AgentRunner (agt)               ChatGateway (api)                    Platform / Chat SDK
─────────────────               ─────────────────                    ───────────────────
publishResponse()
  Redis pub:
    chat:response:{convId}
  payload: {
    type, role, content,
    isFinal, isTyping, nonce,
    sources, workId
  }
                                subscribe chat:response:*
                                  distributed lock (nonce)
                                  isTyping=true:
                                    server.to(room).emit('agent:typing')
                                    Redis pub: outbound:typing
                                  else:
                                    save Action to DB
                                    server.to(room).emit('message:new')  ← Chat SDK user nhận
                                    if isFinal + role=assistant:
                                      Redis pub: outbound:message
                                                                     Connection Worker
                                                                       → adapter.send()
                                                                         → platform
```

---

## 5. Luồng lệnh điều khiển (slash commands)

### 5.1 Từ Chat SDK (portal)

```
User                        ChatGateway (api)                     Agent
────                        ─────────────────                     ─────
socket.emit('command:send', {
  command: 'inspect'|'reload'|'sleep'|'wake'|
           'stop'|'start'|'restart'|'update',
  conversationId, reason
})
                            handleCommandSend()
                              verify authenticated (anonymous reject)
                              save ActionType.COMMAND to DB

                              stop/start/restart/update:
                                agentService.stop/start/restartAgent()
                                → NodeGateway (/ws/node)
                                  (agent không nhận trực tiếp)

                              sleep/wake:
                                agentService.sleep/wakeAgent()
                                assistant: Redis pub chat:cmd:{agentId}
                                engineer:  server.in(sockets).emit('agent:command')
                                                                     nhận agent:command { type }

                              reload/inspect:
                                assistant: Redis pub chat:cmd:{agentId}
                                engineer:  server.in(sockets).emit('agent:command')
                                                                     nhận agent:command { type }
```

### 5.2 Từ Discord / Telegram (slash command)

```
User nhắn /inspect          Connection Worker (con)               ChatGateway (api)
──────────────────          ───────────────────────               ─────────────────
                            _handleInbound()
                              slashMatch = /^\/(\w+)/
                              /igr hoặc /ignore:
                                drop ngay — không route, không lưu DB
                              /inspect|/reload|/sleep|/wake|...:
                                onCommand({ agentId, convId, command })
                                  → publishCommand()
                                    Redis pub: outbound:command
                                                                  subscribe outbound:command
                                                                    findByIdInternal(agentId)
                                                                    assistant: Redis pub chat:cmd:{agentId}
                                                                    engineer:
                                                                      getAgentSocketIds(agentId)
                                                                      server.in(sockets)
                                                                        .emit('agent:command')
                              /stop|/start|/restart|/update:
                                onCommand() → publishCommand()
                                  → outbound:command
                                    (ChatGateway → agentService.stop/start...)
```

---

## 6. Redis channels — toàn bộ

| Channel | Publisher | Subscriber | Mục đích |
|---------|-----------|-----------|---------|
| `chat:message-new` | Connection Worker | ChatGateway (api) | Inbound message từ Discord/Telegram/Teams/Zalo |
| `agent:join-room` | Connection Worker | ChatGateway (api) | Force agent socket join conversation room |
| `outbound:message` | ChatGateway (api) | Connection Worker | Forward agent response → platform |
| `outbound:typing` | ChatGateway (api) | Connection Worker | Forward typing indicator → platform |
| `outbound:direct` | ChatGateway (api) | Connection Worker | Agent proactive send tới platform channel |
| `outbound:command` | Connection Worker | ChatGateway (api) | Slash command từ platform → agent |
| `chat:task:{agentId}` | ChatGateway (api) | AgentRunner (agt) BLPOP | Task queue cho assistant agent |
| `chat:cmd:{agentId}` | ChatGateway (api) | AgentRunner (agt) subscribe | Lệnh điều khiển cho assistant agent |
| `chat:response:{convId}` | AgentRunner (agt) | ChatGateway (api) psubscribe | Response từ assistant agent |
| `inbound:teams:{connId}` | API webhook | Connection Worker pmessage | Webhook payload từ Teams |
| `inbound:zalo-bot:{connId}` | API webhook | Connection Worker pmessage | Webhook payload từ Zalo Bot |
| `inbound:zalo-oa:{connId}` | API webhook | Connection Worker pmessage | Webhook payload từ Zalo OA |
| `connection:changed` | ConnectionService | Connection Worker | Lifecycle events (start/stop connection) |

---

## 7. Redis keys — presence và session

| Key | Type | Set by | Mục đích |
|-----|------|--------|---------|
| `presence:agent:{agentId}` | SET | ChatGateway | Socket IDs của agent đang online |
| `agent:status:{agentId}` | HASH | ChatGateway | status, lastHeartbeat, conversationId, metrics |
| `socket:session:{socketId}` | HASH | ChatGateway | type, actorId, conversationId, connectedAt |
| `presence:user:{userId}` | SET | ChatGateway | Socket IDs của user đang online |
| `conversation:{convId}:sockets` | SET | ChatGateway | Tất cả sockets trong conversation room |
| `lock:chat-msg:{nonce}` | STRING EX10 | ChatGateway | Dedup inbound message khi nhiều api instance |
| `lock:outbound:{actionId}` | STRING EX10 | ChatGateway | Dedup outbound bridge khi nhiều api instance |
| `teams:ref:{connId}:{channelId}` | STRING | Connection Worker | Persist Teams conversation reference |

---

## 8. Phân tích để tách /ws/agent

### Những gì ChatGateway đang làm cho agent

| Việc | Event / Channel | Có thể chuyển sang AgentGateway? |
|------|----------------|----------------------------------|
| Xác thực agent JWT khi connect | handleConnection | ✅ |
| Register presence (setAgentOnline) | handleConnection | ✅ |
| Auto-rejoin conversation rooms | handleConnection | ✅ |
| Nhận heartbeat | `agent:heartbeat` | ✅ |
| Proactive send tới platform | `channel:send` | ✅ |
| Nhận response từ assistant (AgentRunner) | Redis `chat:response:*` | ✅ — AgentGateway subscribe thay |
| Route command đến agent | Redis `outbound:command` | ✅ — AgentGateway handle thay |
| Force join room khi có inbound | Redis `agent:join-room` | ✅ |
| Broadcast message:new vào room | Redis `chat:message-new` | ⚠️ — xem mục dưới |
| Nhận message:send từ engineer agent | `message:send` | ⚠️ — xem mục dưới |
| Save action DB khi engineer respond | `message:send` | ⚠️ |

### Vấn đề cốt lõi khi tách

**Socket.IO room bị split giữa 2 gateway:**

Khi tách ra 2 process riêng (`/ws/chat` và `/ws/agent`), user socket và agent socket nằm trên 2 Socket.IO server khác nhau. Redis adapter chỉ sync rooms giữa các instance **cùng gateway** — không xuyên gateway.

Hệ quả:
- `server.to('conversation:{id}').emit('message:new')` từ AgentGateway **không reach** user socket đang ở ChatGateway
- `server.to('conversation:{id}').emit('message:new')` từ ChatGateway **không reach** engineer agent socket đang ở AgentGateway

**Giải pháp: bỏ socket room broadcast, chuyển hoàn toàn sang Redis pub/sub**

Socket room chỉ có giá trị khi tất cả clients cùng nằm trên một gateway. Khi tách process, room không còn dùng được để broadcast xuyên gateway. Thay vào đó, mỗi gateway chỉ cần biết Redis — mọi thông điệp đều đi qua các channel đã có sẵn.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MÔ HÌNH HIỆN TẠI (gộp chung)                        │
│                                                                             │
│   User ──ws──→ ChatGateway ──socket room broadcast──→ Engineer Agent        │
│                     ↑                                                       │
│                     └── Engineer Agent gửi message:send                     │
│                                                                             │
│   Vấn đề: user và agent phải cùng nằm trong 1 Socket.IO server             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     MÔ HÌNH SAU KHI TÁCH (Redis as backbone)               │
│                                                                             │
│                         R E D I S                                           │
│   ┌──────────────────────────────────────────────────┐                     │
│   │  chat:message-new   chat:response:*   chat:cmd:* │                     │
│   │  outbound:message   outbound:typing   chat:task:*│                     │
│   │  outbound:command   agent:join-room              │                     │
│   └──────┬───────────────────┬──────────────────┬───┘                     │
│          │                   │                  │                          │
│          ▼                   ▼                  ▼                          │
│   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐                  │
│   │ ChatGateway │   │ AgentGateway │   │  AgentRunner │                  │
│   │  /ws/chat   │   │  /ws/agent   │   │  (MODE=agt)  │                  │
│   │             │   │              │   │              │                  │
│   │ User socket │   │ Agent socket │   │  Assistant   │                  │
│   │ Anon socket │   │ (engineer)   │   │  in-process  │                  │
│   └──────┬──────┘   └──────┬───────┘   └──────┬───────┘                  │
│          │                 │                  │                          │
│        User             Engineer           Assistant                     │
│      (browser)          Agent              Agent                         │
└─────────────────────────────────────────────────────────────────────────────┘

Luồng user → engineer agent (sau tách):
  User ──ws──→ ChatGateway
    save DB
    Redis pub: chat:message-new ──→ AgentGateway subscribe
                                      emit message:new → Engineer Agent

Luồng engineer agent → user (sau tách):
  Engineer Agent ──ws──→ AgentGateway
    save DB
    Redis pub: chat:response:{convId} ──→ ChatGateway subscribe
                                            emit message:new → User
    Redis pub: outbound:message ──→ Connection Worker
                                      → platform (Discord/Telegram/...)

Luồng user → assistant agent (sau tách, không đổi):
  User ──ws──→ ChatGateway
    save DB
    Redis lpush: chat:task:{agentId} ──→ AgentRunner BLPOP
                                           run LLM
                                           Redis pub: chat:response:{convId}
                                             ──→ ChatGateway subscribe
                                                   emit message:new → User
                                             ──→ AgentGateway subscribe (nếu cần)
```

Tất cả cross-gateway communication đều qua Redis — pattern này đã tồn tại giữa `con` worker và `api`, chỉ cần áp dụng nhất quán cho engineer agent ↔ user direction.

### Scope thay đổi nếu tách /ws/agent

**AgentGateway mới (`/ws/agent`, process riêng `MODE=aws`):**
- Connection: handleConnection / handleDisconnect cho agent only
- Events nhận từ agent: `agent:heartbeat`, `channel:send`, `message:send` (engineer response)
- Subscribe Redis: `chat:message-new` (→ emit message:new đến engineer agent), `outbound:command` (→ emit agent:command), `agent:join-room`
- Publish Redis: `chat:response:{convId}` (engineer response → ChatGateway), `outbound:message`, `outbound:typing`, `outbound:direct`

**ChatGateway (`/ws/chat`, vẫn trong `api`):**
- Connection: user, anonymous only — bỏ toàn bộ agent branches
- Events: `message:send` (user), `conversation:join/leave`, `command:send`, `conversation:history`, `message:typing`, `message:read`
- Subscribe Redis: `chat:response:*` (→ broadcast message:new đến user), `chat:message-new` (→ lpush chat:task cho assistant)
- Publish Redis: `chat:message-new`, `chat:task:{agentId}`, `outbound:command`

**Nginx routing:**
```
/ws/agent  →  AgentGateway (process mới, scale độc lập)
/ws/chat   →  ChatGateway  (trong api, giữ nguyên)
/ws/node   →  NodeGateway  (trong api, giữ nguyên)
```

### Tách tiếp /ws/chat và /ws/node khỏi api

Cùng nguyên lý. Khi ChatGateway và NodeGateway không còn dùng socket room để cross-communicate, chúng cũng có thể tách ra process riêng:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       KIẾN TRÚC MỤC TIÊU (fully split)                     │
│                                                                             │
│   Nginx / LB                                                                │
│   ├── /api          →  API process        (HTTP only, no WS)               │
│   ├── /ws/chat      →  ChatGateway process (user, anonymous)               │
│   ├── /ws/agent     →  AgentGateway process (engineer agent)               │
│   └── /ws/node      →  NodeGateway process (node worker)                   │
│                                                                             │
│   Tất cả process giao tiếp qua Redis pub/sub — không phụ thuộc nhau       │
│   Mỗi process scale độc lập theo load thực tế                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Điều kiện để tách /ws/chat:**
- ChatGateway không còn gọi trực tiếp các service NestJS khác (AgentService, ConversationService, ActionService) — cần expose qua internal API hoặc Redis RPC, hoặc chấp nhận inject module vào gateway process riêng
- Hiện tại các service này được inject trực tiếp qua DI → gateway process phải load cùng NestJS app context → không khác gì api về dependency, chỉ khác về scaling unit

**Thực tế:** ChatGateway và NodeGateway có thể tách thành **NestJS app riêng** với chỉ các module cần thiết (Chat, Agent, Action, Conversation). API process giữ lại HTTP controllers. Cả hai vẫn kết nối cùng MongoDB và Redis.

**Lộ trình đề xuất:**
1. **Bước 1 (hiện tại):** Tách `/ws/agent` — ít dependency nhất, validate pattern Redis backbone
2. **Bước 2:** Tách `/ws/node` — NodeGateway tương đối độc lập
3. **Bước 3:** Tách `/ws/chat` — phức tạp nhất do nhiều service dependency, làm sau khi pattern đã ổn định
