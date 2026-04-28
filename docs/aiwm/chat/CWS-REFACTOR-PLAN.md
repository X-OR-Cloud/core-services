# CWS Refactor Plan — Chat WebSocket Gateway

## Mục tiêu

Tách `ChatGateway` ra khỏi API process thành process riêng `core.aiwm.cws00` (MODE=cws, port 3402), tương tự pattern đã làm với NWS (port 3401) và AWS (port 3400).

## Trạng thái hiện tại

- ChatGateway chạy trong `AppModule` (MODE=api, port 3003)
- Namespace: `/ws/chat` → sẽ đổi thành `/` (mỗi WS process có port riêng)
- Nginx sẽ proxy `/chat/socket.io` → CWS (port 3402)

## So sánh pattern

| | NWS | AWS | CWS |
|--|-----|-----|-----|
| Port | 3401 | 3400 | 3402 |
| Mode | `nws` | `aws` | `cws` |
| Namespace | `/` | `/` | `/` |
| Nginx path | `/node/socket.io` | `/agent/socket.io` | `/chat/socket.io` |
| Standalone module | `NodeGatewayModule` | `AgentGatewayModule` | `ChatGatewayModule` (mới) |
| Bootstrap file | `bootstrap-node-ws.ts` | `bootstrap-agent-ws.ts` | `bootstrap-chat-ws.ts` (mới) |

## Blocker chính: AgentService

ChatGateway inject `AgentService` — kéo theo 8 sub-module nặng:
QueueModule, ConfigurationModule, DeploymentModule, NodeModule, ReminderModule, ApiKeyModule, ConversationModule, ActionModule, HeartbeatModule.

### Cách thay thế từng usage

| Usage hiện tại | Thay thế trong CWS |
|---------------|-------------------|
| `agentService.findByIdInternal(agentId)` | `@InjectModel(Agent)` trực tiếp |
| `agentService.verifyExternalSignedToken()` | Inject `Agent` model trực tiếp, tự verify |
| `agentService.validateAndTouchAnonymousToken()` | Inject `Agent` model trực tiếp |
| `agentService.heartbeat()` — assistant heartbeat | Inject `HeartbeatService` trực tiếp (đã light) |
| Slash commands: `stopAgent`, `startAgent`, `sleepAgent`, `wakeAgent`, `restartAgent`, `updateAgentOnNode` | **Publish Redis** `chat:agent-cmd:{agentId}` → API process subscribe và execute |

## Redis channels

### Hiện có (giữ nguyên)
| Channel | Direction | Mô tả |
|---------|-----------|-------|
| `agent:join-room` | Subscribe | Force agent socket join conversation room |
| `chat:message-new` | Subscribe | Inbound Discord/Telegram messages |
| `outbound:command` | Subscribe | Slash commands từ connection worker |
| `chat:response:*` | PSubscribe | Agent responses (distributed dedup) |
| `outbound:message` | Publish | Bridge response sang Discord/Telegram |
| `outbound:typing` | Publish | Typing indicator |
| `chat:task:{agentId}` | Publish (lpush) | Route message → assistant agent |
| `chat:cmd:{agentId}` | Publish | Commands tới assistant agent |
| `outbound:direct` | Publish | Proactive channel send |

### Mới cần thêm
| Channel | Direction | Mô tả |
|---------|-----------|-------|
| `chat:agent-cmd` | Publish (CWS) | Slash command side effects → API xử lý |

Format payload `chat:agent-cmd`:
```json
{
  "type": "stop|start|sleep|wake|restart|updateVersion",
  "agentId": "<id>",
  "orgId": "<orgId>",
  "requestedBy": "<userId>",
  "reason": "optional",
  "ts": 1234567890
}
```

## Các file cần tạo / sửa

### Tạo mới

1. **`src/modules/chat-gateway/chat-gateway.module.ts`**
   - Standalone module
   - Imports: `ConfigModule.forRoot()`, `MongooseModule.forRoot()` + `forFeature([Conversation, Action, Agent, Connection])`, `JwtModule.registerAsync()`, `PresenceModule`, `ConversationModule`, `ActionModule`, `HeartbeatModule`
   - Providers: `ChatGateway`, `ChatService`

2. **`src/modules/chat-gateway/chat.gateway.ts`**
   - Copy từ `chat/chat.gateway.ts`, điều chỉnh:
     - Namespace: `'/'` (thay vì `'/ws/chat'`)
     - Bỏ inject `AgentService` → inject `Agent` model trực tiếp + `HeartbeatService`
     - Slash commands có side effect → publish `chat:agent-cmd` thay vì gọi trực tiếp
     - Giữ nguyên toàn bộ logic message, presence, Redis sub/pub

3. **`src/bootstrap-chat-ws.ts`**
   - Pattern giống `bootstrap-node-ws.ts` và `bootstrap-agent-ws.ts`
   - Port: `process.env.PORT_CWS || process.env.PORT || 3402`
   - Log: `CWS running on port`, `Redis URL`

### Sửa file hiện có

4. **`src/main.ts`**
   - Thêm `else if (MODE === 'cws') { await bootstrapChatWsServer(); }`

5. **`services/aiwm/project.json`**
   - Thêm target `cws`: `{ "executor": "...", "options": { "args": ["cws"] } }`

6. **`ecosystem.config.js`**
   - Thêm `core.aiwm.cws00`: `{ PORT: 3402, MODE: 'cws' }`, log files `aiwm-cws-00-*`

7. **`src/app/app.module.ts`**
   - Sau khi CWS tách ra: có thể giữ ChatModule trong AppModule (để backward compat với MODE=api) hoặc bỏ ChatGateway khỏi AppModule
   - **Quyết định**: giữ ChatModule trong AppModule (MODE=api vẫn serve `/ws/chat` như cũ trong dev), production dùng CWS process

8. **`src/modules/agent/agent.service.ts`** (hoặc file mới)
   - Subscribe `chat:agent-cmd` trong `onModuleInit` (MODE=api)
   - Xử lý các command: `stop`, `start`, `sleep`, `wake`, `restart`, `updateVersion`

9. **`docs/aiwm/CLAUDE.md`** — cập nhật bảng modules và run modes

### Không cần tạo mới (reuse)
- `NodeConnectionService` pattern → ChatGateway không cần, dùng PresenceService
- `RedisIoAdapter` → reuse từ `chat/redis-io.adapter.ts`

## Dependency graph của ChatGatewayModule (standalone)

```
ChatGatewayModule
├── ConfigModule.forRoot()
├── MongooseModule.forRoot(buildMongoUri())
├── MongooseModule.forFeature([Conversation, Action, Agent, Connection])
├── JwtModule.registerAsync()
├── PresenceModule           ← đã light (Redis only)
├── ConversationModule       ← light
├── ActionModule             ← light
└── HeartbeatModule          ← light (tách từ trước)

Providers:
├── ChatGateway
└── ChatService
```

Không import: QueueModule, ConfigurationModule, DeploymentModule, NodeModule, ReminderModule, ApiKeyModule, AgentModule.

## Thứ tự implement

```
Step 1: Tạo chat-gateway.module.ts (standalone)
Step 2: Tạo chat-gateway/chat.gateway.ts
        - Bỏ AgentService, inject Agent model + HeartbeatService
        - Slash commands → publish chat:agent-cmd
        - Namespace '/'
Step 3: Tạo bootstrap-chat-ws.ts
Step 4: Cập nhật main.ts — thêm MODE=cws
Step 5: Cập nhật project.json — thêm target cws
Step 6: Cập nhật ecosystem.config.js — thêm core.aiwm.cws00
Step 7: AgentService subscribe chat:agent-cmd (MODE=api)
Step 8: Build check: npx tsc --noEmit
Step 9: Test locally, deploy prod
```

## Environment variables mới

```bash
PORT_CWS=3402   # Chat WS gateway port
```

## Nginx config (thêm vào ws.hydrabyte.co)

```nginx
location /chat/ {
    proxy_pass http://localhost:3402/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

Client connect: `io('wss://ws.hydrabyte.co', { path: '/chat/socket.io' })`

## Rủi ro và lưu ý

1. **`verifyExternalSignedToken` / `validateAndTouchAnonymousToken`**: logic phức tạp, cần copy cẩn thận, không được bỏ sót anonymous token revocation check.

2. **Slash command side effects**: `/stop`, `/sleep` v.v. hiện gọi AgentService trực tiếp và update DB. Sau khi tách, CWS chỉ publish Redis, API process execute. Cần đảm bảo API process đang chạy mới xử lý được.

3. **MODE=api backward compat**: ChatModule vẫn còn trong AppModule → dev mode vẫn dùng được, không break. Production deploy CWS trước khi xóa ChatGateway khỏi AppModule.

4. **RedisIoAdapter path**: CWS cần socket.io path `/chat/socket.io` — set khi khởi tạo adapter (xem cách AWS đã làm hoặc để nginx rewrite).

5. **`chat:response:*` distributed lock**: giữ nguyên `lock:chat-resp:{nonce}` — quan trọng khi scale nhiều CWS instances.
