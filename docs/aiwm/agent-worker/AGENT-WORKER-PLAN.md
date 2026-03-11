# AIWM Agent Worker Mode (`nx run aiwm:agt`)

## Tổng quan

Bổ sung mode `agt` cho service AIWM, cho phép chạy các AI agent dưới dạng **hosted instance** — kết nối vào `/ws/chat`, nhận message từ user, xử lý qua LLM + tool execution loop (Vercel AI SDK + MCP), trả kết quả về qua WebSocket.

Khác với:
- `api` mode: HTTP server + WebSocket gateway phục vụ người dùng và agents bên ngoài
- `wrk` mode: BullMQ worker xử lý workflow execution queue
- `mcp` mode: MCP server expose tools cho external agents

`agt` mode là **hosted agent** — AIWM tự chạy agent in-process, kết nối vào chính WS gateway của mình.

---

## 1. Entity bổ sung / thay đổi

### 1.1 `Agent` schema — thay đổi `type` enum

Bổ sung value mới vào enum `type`:

| Type | Ý nghĩa | Framework |
|------|---------|-----------|
| `managed` | Agent chạy trên Node server bên ngoài, AIWM chỉ quản lý và điều phối | Tự khai báo |
| `autonomous` | Agent độc lập, tự kết nối vào AIWM qua WS | Tự khai báo |
| `hosted` | Agent chạy in-process trong `agt` mode, AIWM host và execute | Không cần — AIWM quyết định |

`hosted` agents **không cần `framework` field** (nullable / ignored).

Runtime config lưu vào `settings` (field sẵn có `Record<string, unknown>`) với prefix `hosted_`:

```
hosted_max_concurrency=5         // số conversation xử lý song song
hosted_idle_timeout_ms=300000    // disconnect sau bao lâu không có message
hosted_reconnect_delay_ms=5000   // delay reconnect sau lỗi
hosted_max_steps=10              // max tool call steps per generateText
```

**Không thêm field mới vào schema** — giảm độ phức tạp.

### 1.2 Conversation / Message / Presence

Không thay đổi. ChatGateway đã:
- Auto-create conversation và join room khi agent connect
- Track presence qua Redis (`presence:agent:{agentId}`)

AgentRunner chỉ cần in-memory map `conversationId → isProcessing` để tránh race condition. Không cần persist thêm.

---

## 2. Kiến trúc Agent Worker

```
┌─────────────────────────────────────────────────────┐
│  Process: nx run aiwm:agt                           │
│                                                     │
│  AgentWorkerModule                                  │
│  ├── AgentWorkerService                             │
│  │   ├── Load agents từ DB (type='hosted')         │
│  │   ├── Khởi tạo AgentRunner cho mỗi agent        │
│  │   └── Health check / reconnect loop             │
│  │                                                  │
│  └── AgentRunner (per agent instance)               │
│      ├── socket.io-client → /ws/chat               │
│      ├── Vercel AI SDK generateText()               │
│      │     └── MCP Client (SSE) → aiwm:mcp         │
│      └── in-memory: conversationId → isProcessing  │
└─────────────────────────────────────────────────────┘
         │  WebSocket (agent JWT)
         ▼
┌─────────────────────────────────────────────────────┐
│  API process (nx run aiwm:api)                      │
│  ChatGateway /ws/chat                               │
└─────────────────────────────────────────────────────┘
         │  HTTP (MCP tools)
         ▼
┌─────────────────────────────────────────────────────┐
│  MCP process (nx run aiwm:mcp)  :3355              │
│  Builtin tools: CBM, IAM, AIWM                     │
└─────────────────────────────────────────────────────┘
```

### Components

| Component | Trách nhiệm |
|-----------|-------------|
| `AgentWorkerModule` | Root module cho `agt` mode |
| `AgentWorkerService` | Orchestrate nhiều AgentRunner, health check loop |
| `AgentRunner` | Per-agent: WS client + AI loop |
| `bootstrap-agent.ts` | Entrypoint, `app.init()` — không mở HTTP port |

---

## 3. Luồng xử lý

### 3.1 Khởi tạo

```
bootstrap-agent.ts
  └── NestJS app.init() (AgentWorkerModule)
        └── AgentWorkerService.onModuleInit()
              ├── Query DB: agents { type: 'hosted' }
              │   (optional: filter by AGENT_IDS env var)
              ├── Với mỗi agent:
              │     ├── POST /agents/:id/connect  (dùng agent secret)
              │     │     → nhận { token, mcpServers, instruction, tools }
              │     └── new AgentRunner(agent, config).start()
              └── Start health check interval (30s)
```

### 3.2 AgentRunner — Kết nối WebSocket

```
AgentRunner.start()
  ├── io(WS_CHAT_URL + '/ws/chat', { auth: { token: agentJWT } })
  ├── on('connect')       → log, reset retry counter
  ├── on('message:new')   → handleMessage() (xem 3.3)
  ├── on('disconnect')    → schedule reconnect sau hosted_reconnect_delay_ms
  └── on('connect_error') → log + exponential backoff retry
```

ChatGateway tự động:
- Xác thực JWT, đọc `payload.type === 'agent'`
- Auto-create/reuse conversation, auto-join room `conversation:{id}`

### 3.3 Xử lý Message Mới

```
handleMessage(message)
  ├── Skip nếu message.sender.type === 'agent'  (tin của chính mình)
  ├── Skip nếu processingMap.get(conversationId) === true  (đang xử lý)
  ├── processingMap.set(conversationId, true)
  ├── emit('message:typing')
  │
  ├── Load message history: GET /messages?conversationId=...&limit=20
  │
  ├── Khởi tạo MCP client (SSE → aiwm:mcp):
  │     const mcpClient = await experimental_createMCPClient({
  │       transport: new StreamableHTTPClientTransport(MCP_SERVER_URL)
  │     })
  │     const tools = await mcpClient.tools()
  │
  ├── generateText({
  │     model: openai.chat(deploymentId) | createOpenAI({ baseURL })(...),
  │     system: resolvedInstruction,
  │     messages: history,
  │     tools,
  │     maxSteps: hosted_max_steps  (default: 10)
  │   })
  │   // Vercel AI SDK tự handle tool call loop
  │
  ├── emit('message:send', { content: result.text, conversationId })
  └── processingMap.set(conversationId, false)
      await mcpClient.close()
```

### 3.4 Tool Execution (Vercel AI SDK + MCP SSE)

```
generateText step N:
  LLM response → tool_calls[]
    └── SDK gọi tool.execute(args)  ← từ mcpClient.tools()
          └── MCP SSE transport → /mcp endpoint
                └── McpServer resolve tool → executor(args, context)
                      ├── Builtin: HTTP call CBM/IAM với agent JWT
                      └── API type: fetch với signed JWT
  SDK feed tool results → LLM step N+1
  ... loop tối đa maxSteps
  Kết quả cuối → text response
```

### 3.5 Health Check & Reconnect

```
AgentWorkerService (interval 30s):
  Với mỗi AgentRunner:
  ├── Nếu socket disconnected → runner.reconnect()
  └── POST /agents/heartbeat (agent JWT) → update lastHeartbeatAt
```

---

## 4. API mới phát sinh

### 4.1 Core flow — không cần API mới

Tận dụng hoàn toàn API sẵn có:
- `POST /agents/:id/connect` — lấy JWT + config
- `POST /agents/heartbeat` — report trạng thái
- `GET /messages` — load conversation history

### 4.2 Quản lý hosted agent (Phase 2)

```
GET  /agents/:id/status   → runtime status của agent runner
POST /agents/:id/start    → trigger start/restart
POST /agents/:id/stop     → graceful stop
```

### 4.3 DTO update (Phase 1)

Thêm `hosted` vào `type` enum trong `CreateAgentDto` / `UpdateAgentDto`.

---

## 5. Danh sách file cần sửa / tạo

### File mới

| File | Mô tả |
|------|-------|
| `src/bootstrap-agent.ts` | Entrypoint `agt` mode, `app.init()` không HTTP |
| `src/agent-worker.module.ts` | Root NestJS module cho `agt` mode |
| `src/modules/agent-worker/agent-worker.module.ts` | Feature module khai báo providers |
| `src/modules/agent-worker/agent-worker.service.ts` | Orchestrate AgentRunners, health check |
| `src/modules/agent-worker/agent-runner.ts` | Per-agent WS client + AI loop (class thuần) |

### File sửa

| File | Thay đổi |
|------|---------|
| `src/main.ts` | Thêm case `'agt'` → `bootstrapAgentWorker()` |
| `src/modules/agent/agent.schema.ts` | Thêm `'hosted'` vào `type` enum |
| `src/modules/agent/agent.dto.ts` | Thêm `'hosted'` vào `type` enum DTO |
| `src/modules/agent/agent.service.ts` | `getAgentConfig()` và `connect()` xử lý `hosted` type |
| `project.json` | Thêm Nx target `agt`: `node dist/services/aiwm/main.js agt` |

### Dependencies mới

```bash
npm install ai @ai-sdk/openai @ai-sdk/google socket.io-client
```

---

## 6. Environment Variables

```env
# Khi chạy agt mode
MODE=agt
WS_CHAT_URL=http://localhost:3003      # URL api instance
MCP_SERVER_URL=http://localhost:3355   # URL mcp instance
AGENT_IDS=id1,id2                      # optional: subset agents, mặc định load tất cả hosted agents
```

---

## 7. Phạm vi Phase 1

- [ ] Sửa `agent.schema.ts`: thêm `'hosted'` vào type enum
- [ ] Sửa `agent.dto.ts`: update enum
- [ ] Tạo `bootstrap-agent.ts`
- [ ] Tạo `agent-worker.module.ts` (root)
- [ ] Tạo `modules/agent-worker/` (service + runner)
- [ ] Sửa `main.ts`: thêm case `'agt'`
- [ ] Sửa `project.json`: thêm target `agt`
- [ ] Cài dependencies

## Phase 2 (defer)

- Agent worker status/start/stop API
- Streaming response (`message:chunk` event)
- Per-conversation semaphore (hard concurrency limit)
- Chat SDK npm package
