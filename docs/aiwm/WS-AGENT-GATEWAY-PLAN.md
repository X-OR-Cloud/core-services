# Plan: Tách AgentGateway ra process riêng (Bước 1)

Branch: `feat/ws-agent-gateway`

---

## Mục tiêu

Tách toàn bộ logic WebSocket dành cho engineer agent ra khỏi `ChatGateway` thành một `AgentGateway` riêng, chạy trên process độc lập (`MODE=aws`), được Nginx route qua path `/ws/agent`.

Sau bước này:
- Engineer agent kết nối vào `/ws/agent` thay vì `/ws/chat`
- `ChatGateway` chỉ còn xử lý user và anonymous client
- Hai gateway giao tiếp hoàn toàn qua Redis pub/sub — không dùng socket room xuyên process
- AgentGateway có thể scale độc lập

---

## Nguyên lý thiết kế

**Bỏ socket room broadcast xuyên gateway, dùng Redis làm backbone:**

```
Hiện tại:
  ChatGateway broadcast message:new → agent socket (cùng room)

Sau tách:
  User message  → ChatGateway → Redis pub: chat:message-new
                                → AgentGateway subscribe → emit message:new → engineer agent

  Agent response → AgentGateway → Redis pub: chat:response:{convId}
                                 → ChatGateway subscribe → emit message:new → user
```

Không thêm Redis channel mới — tái sử dụng toàn bộ channel đang có.

---

## Các thay đổi

### Bước 1 — Tạo AgentGateway module

**File mới:** `services/aiwm/src/modules/agent-gateway/agent.gateway.ts`

AgentGateway là một NestJS WebSocket gateway độc lập, namespace `/ws/agent`.

**Xử lý kết nối:**
- `handleConnection`: verify JWT (agent token only), gọi `setAgentOnline`, `setSocketSession`, auto-rejoin active conversations
- `handleDisconnect`: gọi `setAgentOffline`, `clearAgentStatus`, `removeSocketSession`, broadcast `presence:update`

**Events nhận từ agent:**

| Event | Logic |
|-------|-------|
| `agent:heartbeat` | `setAgentStatus` + delegate `agentService.heartbeat()` |
| `message:send` | Save action DB → Redis pub `chat:response:{convId}` → Redis pub `outbound:message` |
| `channel:send` | Redis pub `outbound:direct` |

**Redis subscribe (onModuleInit, chỉ khi MODE=aws):**

| Channel | Xử lý |
|---------|-------|
| `chat:message-new` | Distributed lock → check sleep → emit `message:new` đến agent socket trong room → (assistant: bỏ qua — ChatGateway push task) |
| `outbound:command` | Lookup agent type → assistant: pub `chat:cmd:{agentId}` → engineer: emit `agent:command` đến agent socket |
| `agent:join-room` | `server.in(agentSocketIds).socketsJoin(conversation:{convId})` |

**Lưu ý quan trọng về `chat:message-new`:**
- Hiện tại ChatGateway vừa broadcast message:new vào room (để engineer agent nhận), vừa lpush chat:task (để assistant agent nhận)
- Sau tách: AgentGateway subscribe `chat:message-new` để emit đến engineer agent; ChatGateway vẫn subscribe để lpush chat:task cho assistant agent
- Cả hai đều subscribe cùng channel — distributed lock theo `msgNonce` đảm bảo mỗi task chỉ được push 1 lần (lock đã có sẵn)
- Engineer agent broadcast: AgentGateway xử lý; assistant task push: ChatGateway xử lý — không conflict vì khác mục đích

**File mới:** `services/aiwm/src/modules/agent-gateway/agent-gateway.module.ts`

Dependencies: `JwtModule`, `AgentModule`, `ActionModule`, `ConversationModule`, Redis

---

### Bước 2 — Thêm bootstrap và run mode

**File mới:** `services/aiwm/src/bootstrap-agent-ws.ts`

```
NestFactory.create(AgentWsAppModule)
  app.useWebSocketAdapter(new RedisIoAdapter(app))
  app.listen(PORT_AWS)   // port riêng, ví dụ 3006
```

**File mới:** `services/aiwm/src/agent-ws.app.module.ts`

Chỉ load: `AgentGatewayModule`, `ConfigModule`, `MongooseModule`, `RedisModule`

**Cập nhật `main.ts`:** thêm nhánh `MODE=aws`

**Cập nhật `project.json`:** thêm target `aws`
```json
"aws": {
  "executor": "...",
  "options": { "args": ["aws"] }
}
```

---

### Bước 3 — Cập nhật ChatGateway

Xóa các đoạn agent-specific:

| Đoạn | Vị trí hiện tại | Hành động |
|------|----------------|-----------|
| `_handleAgentConnect()` | Lines 417–468 | Xóa — chuyển sang AgentGateway |
| Agent branch trong `handleDisconnect()` | Lines 624–636 | Xóa |
| `agent:heartbeat` handler | Lines 1086–1114 | Xóa |
| `channel:send` handler | Lines 1321–1379 | Xóa |
| Agent response path trong `message:send` | Lines 957–1005 | Giữ phần user→assistant (lpush task); xóa engineer response path |
| Engineer emit trong `command:send` | Lines 1190–1222 | Giữ phần publish `outbound:command`; xóa emit WS trực tiếp đến agent socket |
| `agent:join-room` Redis handler | Lines 185–199 | Xóa — AgentGateway xử lý |
| Engineer branch trong `chat:message-new` | Lines 299–303 | Xóa socketsJoin engineer — AgentGateway xử lý |
| `outbound:command` Redis handler | Lines 314–336 | Giữ phần assistant (pub `chat:cmd`); xóa engineer WS emit — AgentGateway xử lý |

**Giữ nguyên:**
- Subscribe `chat:response:*` → save DB + emit `message:new` đến user + pub `outbound:message`
- Subscribe `chat:message-new` → chỉ giữ phần lpush `chat:task:{agentId}` cho assistant agent + broadcast message:new đến user
- `command:send` handler → giữ phần pub `outbound:command` lên Redis (AgentGateway sẽ consume và route đến engineer)

---

### Bước 4 — Cập nhật engineer agent client

**Thay đổi duy nhất phía agent:** kết nối vào `/ws/agent` thay vì `/ws/chat`.

Tất cả event name, payload shape giữ nguyên hoàn toàn:
- `agent:heartbeat` ✓
- `message:send` ✓
- `message:new` ✓
- `agent:command` ✓
- `channel:send` ✓

Cập nhật `ENGINEER-AGENT-INTEGRATION-GUIDE.md`.

---

### Bước 5 — Nginx config

```nginx
# /ws/agent → AgentGateway process
location /ws/agent {
    proxy_pass http://agent_ws_upstream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

# /ws/chat → API process (giữ nguyên)
location /ws/chat {
    proxy_pass http://api_upstream;
    ...
}
```

---

## Cấu trúc file mới

```
services/aiwm/src/
├── bootstrap-agent-ws.ts          # NEW — bootstrap MODE=aws
├── agent-ws.app.module.ts         # NEW — minimal app module cho aws mode
├── modules/
│   └── agent-gateway/             # NEW module
│       ├── agent.gateway.ts       # AgentGateway (WebSocket handler)
│       └── agent-gateway.module.ts
```

---

## Redis channel — phân công sau tách

| Channel | Publisher | Subscriber |
|---------|-----------|-----------|
| `chat:message-new` | Connection Worker | **ChatGateway** (lpush task cho assistant + broadcast user) + **AgentGateway** (emit đến engineer) |
| `agent:join-room` | Connection Worker | **AgentGateway** |
| `outbound:command` | Connection Worker | **AgentGateway** (route đến engineer) + **ChatGateway** (route đến assistant via `chat:cmd`) |
| `chat:response:*` | AgentRunner (agt) | **ChatGateway** (broadcast đến user + bridge outbound) |
| `chat:task:{agentId}` | ChatGateway | AgentRunner (agt) BLPOP |
| `chat:cmd:{agentId}` | ChatGateway / AgentGateway | AgentRunner (agt) subscribe |
| `outbound:message` | ChatGateway / **AgentGateway** | Connection Worker |
| `outbound:typing` | ChatGateway / **AgentGateway** | Connection Worker |
| `outbound:direct` | **AgentGateway** | Connection Worker |

---

## Điểm cần chú ý khi review

1. **Distributed lock cho `chat:message-new`:** Cả ChatGateway và AgentGateway đều subscribe. Lock theo `msgNonce` chỉ protect `lpush chat:task` (idempotent cho assistant). Engineer agent broadcast không cần lock — emit WS là idempotent.

2. **`command:send` từ portal:** User gửi command qua ChatGateway → ChatGateway pub `outbound:command` → AgentGateway consume và emit `agent:command` đến engineer agent socket. Thêm 1 Redis hop so với hiện tại nhưng không đáng kể.

3. **assistant agent (MODE=agt):** Không thay đổi — vẫn connect `/ws/chat`, vẫn dùng `chat:task` / `chat:cmd` / `chat:response`. AgentGateway không liên quan đến assistant agent.

4. **Port:** AgentGateway cần port riêng (ví dụ 3006 hoặc sub-port 3331 trong dải 3330–3339 của aiwm). Cần confirm với `docs/PORT-ALLOCATION.md`.

5. **Backward compatibility:** Trong giai đoạn chuyển tiếp, `/ws/chat` vẫn accept agent connection (chưa xóa code) cho đến khi tất cả engineer agent đã cập nhật endpoint. Xóa code cũ sau khi xác nhận toàn bộ agent đã migrate.

---

## Tiêu chí hoàn thành

- [ ] `nx run aiwm:aws` khởi động thành công, AgentGateway lắng nghe `/ws/agent`
- [ ] Engineer agent kết nối `/ws/agent`, nhận `message:new` từ Discord/Telegram/Chat SDK
- [ ] Engineer agent gửi `message:send`, response reach user trên portal và platform
- [ ] `/inspect`, `/reload`, `/sleep`, `/wake` từ Discord hoạt động
- [ ] `agent:heartbeat` hoạt động, presence Redis được cập nhật đúng
- [ ] ChatGateway (api) không còn agent-specific code
- [ ] TypeScript build pass (`npx tsc --noEmit`)
