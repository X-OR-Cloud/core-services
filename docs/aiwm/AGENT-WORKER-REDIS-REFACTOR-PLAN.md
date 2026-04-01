# Agent Worker Redis Refactor Plan

## Bối cảnh & Vấn đề

### Kiến trúc hiện tại

Worker `agt` kết nối vào `/ws/chat` như một WS client thông thường (dùng `socket.io-client`). Flow:

```
User ──WS──► ChatGateway ──broadcast room──► AgentRunner (WS client)
                                                    │
                                             LLM generation
                                                    │
AgentRunner ──WS message:send──► ChatGateway ──broadcast──► User
```

### Vấn đề

| # | Vấn đề | Chi tiết |
|---|--------|---------|
| 1 | **WS round-trip không cần thiết** | `agt` và `api` cùng process, cùng kết nối MongoDB/Redis — nhưng vẫn giao tiếp qua external WS |
| 2 | **Duplicate processing khi scale** | Mỗi instance join tất cả conversation rooms → cùng 1 message được N instances nhận; dedup chỉ bằng in-memory `seenMessageIds` không bảo vệ cross-instance |
| 3 | **Message drop khi busy** | `processingMap` full → message bị drop hoàn toàn, không queue |
| 4 | **Fan-out lãng phí** | 1 message broadcast tới tất cả sockets trong room, kể cả N agent instances |
| 5 | **Conversation ownership không có** | Không đảm bảo conversation X chỉ do 1 instance xử lý |

### Đặc thù cần đáp ứng

- Agent `assistant` có `conversationMode = per-user` → phục vụ nhiều user đồng thời
- Mỗi conversation là độc lập, không block nhau
- Cần scale horizontal: nhiều `worker:agt` instances chạy song song

---

## Kiến trúc đề xuất

### Nguyên tắc

- **ChatGateway**: chịu trách nhiệm WS với user — nhận message, lưu DB, broadcast WS, không biết gì về agent internals
- **AgentRunner**: chịu trách nhiệm xử lý LLM — nhận task qua Redis, tự lưu DB, publish response về Gateway qua Redis
- **Redis**: transport layer giữa Gateway và AgentRunner

### Flow mới

```
User ──WS──► ChatGateway
                 │
                 ├─ Lưu action DB (như cũ)
                 │
                 └─ LPUSH chat:task:{agentId}  ←── task queue per agent
                              │
              ┌───────────────┴───────────────┐
              │         Redis LIST            │
              │   chat:task:{agentId}         │
              └───────────────────────────────┘
                       │            │
                 BLPOP │      BLPOP │   (nhiều instances cạnh tranh)
                       ▼            ▼
                 Instance A    Instance B
                       │
               SET lock:conv:{convId} {instanceId}  (NX, EX 300)
               → chỉ 1 instance "own" conversation
                       │
               Xử lý LLM (như cũ, dùng getHistoryInternal, searchKnowledge...)
                       │
               PUBLISH chat:response:{conversationId}
                              │
                              ▼
                        ChatGateway (subscriber)
                              │
                        Lưu action DB
                              │
                        broadcast WS ──► User
```

### Redis Keys

| Key | Type | Mục đích | TTL |
|-----|------|---------|-----|
| `chat:task:{agentId}` | LIST | Task queue — LPUSH by gateway, BLPOP by runner | none |
| `lock:conv:{conversationId}` | STRING | Conversation ownership (instanceId) | 300s, refresh mỗi 60s |
| `chat:response:{conversationId}` | PUB/SUB | Agent publish response về gateway | - |
| `chat:cmd:{agentId}` | PUB/SUB | Gateway gửi /stop, /reload, /inspect tới agent | - |
| `chat:status:{instanceId}` | STRING | Instance health ping | 60s |

### Task payload (`chat:task:{agentId}`)

```typescript
interface AgentTask {
  taskId: string;           // unique ID, dùng để dedup
  agentId: string;
  conversationId: string;
  actionId: string;         // ID của action đã lưu DB bởi gateway
  content: string;
  role: string;
  userId?: string;
  username?: string;
  fullname?: string;
  attachments?: Array<...>;
  references?: Array<...>;
  sources?: Array<...>;
  skipAgent?: boolean;
  workId?: string;
  platform: string;
  timestamp: string;        // ISO8601
}
```

### Response payload (`chat:response:{conversationId}`)

```typescript
interface AgentResponse {
  taskId: string;           // echo lại taskId để gateway biết context
  agentId: string;
  conversationId: string;
  type: 'message' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'typing' | 'error';
  role: 'assistant';
  content: string;
  sources?: Array<...>;
  workId?: string;
  isTyping?: boolean;       // cho typing indicator
  isFinal?: boolean;        // true khi là response cuối cùng của 1 turn
}
```

---

## Conversation Ownership

Mỗi conversation chỉ do 1 instance xử lý tại 1 thời điểm:

```
Instance nhận task:
  1. SET lock:conv:{convId} {instanceId} NX EX 300
  2. Nếu acquired → process
  3. Nếu fail → requeue task về cuối LIST (RPUSH chat:task:{agentId})
  4. Trong khi processing → refresh lock mỗi 60s (EXPIRE 300)
  5. Sau khi xong → DEL lock:conv:{convId}
```

Nếu instance die giữa chừng → lock expire sau 300s → instance khác pick up task mới.

---

## Thay đổi cần làm

### Phase 1: ChatGateway — thay broadcast bằng queue push

**File:** `services/aiwm/src/modules/chat/chat.gateway.ts`

Trong `handleSendMessage()`, sau khi lưu action DB:
- Lookup agent type từ `AgentService` (hoặc cache Redis) theo `agentId` của conversation
- **Nếu agent type = `assistant`**:
  - **Bỏ**: `server.to(room).emit('message:new', payload)` cho agent
  - **Thêm**: `LPUSH chat:task:{agentId} taskPayload`
- **Nếu agent type = `engineer`**: giữ nguyên broadcast room như cũ
- **Giữ trong mọi trường hợp**: broadcast `message:new` xuống user WS (để user thấy tin nhắn của chính họ)

Thêm subscriber `chat:response:{conversationId}`:
- Nhận response từ AgentRunner
- Lưu action DB (role=assistant)
- Broadcast `message:new` xuống user WS

### Phase 2: AgentRunner — bỏ WS, dùng Redis

**File:** `services/aiwm/src/modules/agent-worker/agent-runner.ts`

Bỏ:
- `import { io, Socket } from 'socket.io-client'`
- Toàn bộ WS connection logic (`connect()`, `scheduleReconnect()`, socket event handlers)
- `wsChatUrl` config field
- `emitSystemMessage()`, `emitMessage()` qua socket

Thêm:
- Redis client (ioredis) inject từ `AgentWorkerService`
- `startConsuming(agentId)`: vòng lặp BLPOP `chat:task:{agentId}`
- `handleTask(task)`: thay `handleMessage()`, nhận `AgentTask` thay vì WS payload
- `publishResponse(conversationId, response)`: PUBLISH `chat:response:{conversationId}`
- `acquireConversationLock(convId)` / `releaseConversationLock(convId)`
- Subscribe `chat:cmd:{agentId}` để nhận /stop, /reload, /inspect

**Các internal callbacks giữ nguyên** (không thay đổi):
- `getHistoryInternal` — vẫn query MongoDB trực tiếp
- `heartbeatInternal` — vẫn gọi `AgentService.heartbeat()`
- `connectInternal` — vẫn gọi `AgentService.connectInternal()`
- `searchKnowledgeInternal` — vẫn gọi CBM knowledge service
- `addLogInternal` — vẫn gọi `AgentService.addLog()`
- `uploadFileInternal` / `sendFileInternal` — giữ nguyên

### Phase 3: AgentWorkerService — bỏ WS_CHAT_URL

**File:** `services/aiwm/src/modules/agent-worker/agent-worker.service.ts`

- Bỏ `wsChatUrl` config
- Inject Redis client, truyền vào `AgentRunner` thay vì `wsChatUrl`
- `sendFileInternal`: thay `runner.emitMessage()` bằng `runner.publishResponse()`

### Phase 4: Heartbeat

Heartbeat hiện tại dùng `heartbeatInternal` (in-process) — giữ nguyên, không cần thay đổi. Chỉ bỏ logic gửi fake WS message, thay bằng gọi `handleTask()` trực tiếp khi heartbeat trả về `systemMessage`.

---

## Điểm cần cẩn thận

### 1. Conversation subscription trên Gateway

Gateway cần biết phải subscribe `chat:response:{conversationId}` của conversation nào. Hai cách:

**Option A — Subscribe động**: Khi user join conversation, gateway subscribe channel đó. Unsubscribe khi không còn user nào trong room.

**Option B — Pattern subscribe**: Gateway subscribe `chat:response:*` (Redis PSUBSCRIBE). Đơn giản hơn, không cần quản lý subscription lifecycle. **Chọn option này cho MVP.**

### 2. /stop command

Hiện tại: `agent:command` WS event gửi thẳng tới agent sockets.

Mới: Gateway PUBLISH `chat:cmd:{agentId}` với payload `{ type: 'stop', conversationId, reason }`. AgentRunner subscribe channel này, xử lý abort như cũ.

### 3. Typing indicator

Hiện tại: AgentRunner emit `message:typing` qua WS.

Mới: AgentRunner PUBLISH `chat:response:{conversationId}` với `type: 'typing', isTyping: true/false`. Gateway nhận và broadcast WS `agent:typing` xuống user.

### 4. System messages (`emitSystemMessage`)

Hiện tại: AgentRunner emit `message:send` với `type: 'system'` qua WS → Gateway lưu DB và broadcast.

Mới: AgentRunner PUBLISH `chat:response:{conversationId}` với `type: 'system'`. Gateway lưu DB và broadcast. Logic giống response message bình thường.

### 5. AgentLockService (lock per agent instance)

Lock hiện tại (`lock:agent:{agentId}`) — đảm bảo chỉ 1 `worker:agt` instance chạy 1 runner per agent — **giữ nguyên**. Đây là lock khác với `lock:conv:{conversationId}`.

### 6. Backward compatibility với `engineer` agents

Agent type `engineer` vẫn dùng WS (tự deploy, tự connect). Không thay đổi gì cho engineer flow. Chỉ thay đổi `assistant` type trong `worker:agt`.

---

## Không thay đổi

- Schema MongoDB (Action, Conversation)
- Agent authentication & JWT
- MCP tool resolution
- RAG context injection
- LLM generation logic (Vercel AI SDK `generateText`)
- `AgentLockService` (Redis lock per agent, per instance)
- `ChatService` (Redis presence tracking)
- Connection Worker (Discord/Telegram bridge) — vẫn dùng Redis pub/sub như cũ
- Engineer agent flow

---

## Thứ tự implement

1. **Thiết kế Redis schema** — định nghĩa chính xác các interface TypeScript cho task/response payload
2. **ChatGateway — thêm PSUBSCRIBE** `chat:response:*` và handler lưu DB + broadcast
3. **ChatGateway — thay broadcast bằng LPUSH** trong `handleSendMessage()`
4. **AgentRunner — thêm Redis consumer** (BLPOP loop, conversation lock)
5. **AgentRunner — migrate response emit** sang Redis PUBLISH
6. **AgentRunner — migrate commands** (/stop, /reload via `chat:cmd:{agentId}`)
7. **AgentRunner — bỏ WS** (xóa socket.io-client dependency)
8. **AgentWorkerService — cleanup** (bỏ wsChatUrl, inject Redis)
9. **Test scale** — chạy 2+ instances, verify không duplicate processing
