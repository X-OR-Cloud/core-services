# CLAUDE.md - AIWM Service

## Service Overview

AIWM (AI Workload Manager) is the core service for AI operations. Port 3003 (dev), 3330-3339 (prod).

Multi-mode: API (HTTP/WebSocket) + MCP (AI agent integration) + Worker (BullMQ) + Agent runner + Connection bridge + 3 standalone WebSocket gateways.

## Run Modes

| Mode | Command | Port (prod) | Description |
|------|---------|-------------|-------------|
| **api** | `nx run aiwm:api` | 3330–3332 | REST API + legacy ChatGateway (`/ws/chat`) |
| **mcp** | `nx run aiwm:mcp` | 3334–3336 | Standalone MCP protocol server |
| **wrk** | `nx run aiwm:wrk` | — | BullMQ background job worker |
| **agt** | `nx run aiwm:agt` | — | Hosted agent worker — Redis BLPOP consumer |
| **con** | `nx run aiwm:con` | — | Connection worker (Discord/Telegram bridge) |
| **aws** | `nx run aiwm:aws` | 3400–3402 | Agent WebSocket gateway (`/`) — engineer agents only |
| **nws** | `nx run aiwm:nws` | 3403–3406 | Node WebSocket gateway (`/`) — node daemon connections |
| **cws** | `nx run aiwm:cws` | 3407–3409 | Chat WebSocket gateway (`/`) — user/anonymous/assistant chat |

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Agent | `src/modules/agent/` | AI agent management (assistant/engineer types) |
| Agent-Gateway | `src/modules/agent-gateway/` | Engineer agent WebSocket gateway (`/`, MODE=aws) — heartbeat, presence, pub/sub |
| Chat-Gateway | `src/modules/chat-gateway/` | Standalone chat WS gateway (`/`, MODE=cws) — user/anonymous/assistant, no slash commands |
| Node-Gateway | `src/modules/node-gateway/` | Node daemon WebSocket gateway (`/`, MODE=nws) — standalone, Redis pub/sub backbone |
| Agent-Worker | `src/modules/agent-worker/` | Hosted agent runner (MODE=agt) — Redis BLPOP consumer, Vercel AI SDK |
| Node | `src/modules/node/` | Worker node management (HTTP API only — WS extracted to Node-Gateway) |
| Chat | `src/modules/chat/` | Legacy chat gateway (`/ws/chat`, MODE=api) + ChatService (presence monitor) |
| Heartbeat | `src/modules/heartbeat/` | Heartbeat logic + work assignment — shared by AgentGateway, AgentModule, ChatGateway |
| Presence | `src/modules/presence/` | Redis-based presence tracking — socket sessions, agent/user online state |
| Model | `src/modules/model/` | AI model metadata and lifecycle |
| Deployment | `src/modules/deployment/` | Model deployment + inference proxy |
| Instruction | `src/modules/instruction/` | System prompts and guidelines |
| Tool | `src/modules/tool/` | MCP tools, built-in tools, custom tools |
| Guardrail | `src/modules/guardrail/` | Safety constraints for agents |
| PII | `src/modules/pii/` | PII detection and redaction |
| Configuration | `src/modules/configuration/` | Key-value configuration management |
| Conversation | `src/modules/conversation/` | Chat conversation management (history stored as Actions) |
| Execution | `src/modules/execution/` | Workflow execution orchestration |
| Workflow | `src/modules/workflow/` | Workflow definition and steps |
| Resource | `src/modules/resource/` | Infrastructure resource management |
| Reports | `src/modules/reports/` | Analytics and reporting |
| Memory | `src/modules/memory/` | Agent memory/context storage |
| Reminder | `src/modules/reminder/` | Scheduled reminders and notifications |
| Action | `src/modules/action/` | Audit trail for chat actions (types: message, notice, tool_use, tool_result, thinking, error, command, joined, left, handoff) |
| Connection | `src/modules/connection/` | Discord/Telegram connection config |
| Util | `src/modules/util/` | AI utilities (text generation via OpenAI Responses API) |

## Agent Types

AIWM hỗ trợ hai loại agent với cơ chế vận hành khác nhau:

### `assistant` — In-process agent
- Chạy **bên trong** AIWM Agent Worker (`MODE=agt`) qua `AgentRunner`
- Không có quyền truy cập môi trường (không bash, không file system)
- Nhận task qua Redis BLPOP (`chat:task:{agentId}`) — không kết nối WS trực tiếp
- Publish response qua Redis (`chat:response:{conversationId}`) → CWS broadcast tới client
- Heartbeat qua `heartbeatInternal` (in-process call, không qua WS)
- Scale ngang bằng Redis lock (mỗi agentId chỉ có một runner active)

### `engineer` — External self-deployed agent
- Chạy **bên ngoài** hệ thống, do người dùng tự deploy (hoặc deploy lên Node)
- Có quyền truy cập môi trường đầy đủ (bash, file system, v.v.)
- Tự gọi `POST /agents/:id/connect` để lấy JWT token + config
- Connect vào **AWS** (`/`, MODE=aws, port 3400–3402) — gateway riêng cho engineer agents
- Heartbeat qua `agent:heartbeat` WS event — kèm `mcpConnected` và `availableFunctions`
- Server trả về work task trong response heartbeat nếu agent `idle` và đủ capabilities
- Khi có `nodeId`: AIWM quản lý lifecycle qua NWS (`agent.start/update/delete`)
- Khi không có `nodeId`: người dùng tự quản lý hoàn toàn

> Tài liệu chi tiết: `docs/aiwm/agents/AGENT-TYPE-CLASSIFICATION.md` và `docs/aiwm/agents/CLIENT-INTEGRATION-GUIDE.md`

---

## Module-Specific Documentation

When working on a specific module, read the corresponding docs:

- **Agent module**: Read `docs/aiwm/agents/` directory AND `docs/aiwm/agent/OVERVIEW.md` + `docs/aiwm/agent/ROADMAP.md`
- **Node module**: Read `docs/aiwm/node/OVERVIEW.md` + `docs/aiwm/node/ROADMAP.md` AND `docs/aiwm/node-agent/` directory (client integration)
- **Instruction module**: Read `docs/aiwm/instruction/OVERVIEW.md` + `docs/aiwm/instruction/ROADMAP.md`
- **Chat/WebSocket**: Read `docs/aiwm/CHAT-WEBSOCKET-EVENTS.md` (full event + payload reference) and `docs/aiwm/CHAT-WEBSOCKET-ARCHITECTURE.md` (architecture overview)
- **Deployment**: Read `docs/aiwm/DEPLOYMENT-INFERENCE-PLAN.md`
- **Tool module**: Read `docs/aiwm/tool/OVERVIEW.md` + `docs/aiwm/tool/ROADMAP.md` AND `docs/aiwm/tools/TOOL-TYPES-AND-EXECUTION.md`
- **Workflow**: Read `docs/aiwm/workflow-feature/` directory
- **Guardrail module**: Read `docs/aiwm/guardrail/OVERVIEW.md` + `docs/aiwm/guardrail/ROADMAP.md`
- **PII module**: Read `docs/aiwm/pii/OVERVIEW.md` + `docs/aiwm/pii/ROADMAP.md`
- **MCP module**: Read `docs/aiwm/mcp/OVERVIEW.md` + `docs/aiwm/mcp/ROADMAP.md` AND `services/aiwm/src/mcp/README.md` (builtin tools guide)
- **Configuration**: Read `docs/aiwm/configuration-management-proposal-v2.md`
- **Agent RAG config**: Read `docs/aiwm/agent/RAG-CONFIG-API.md` — ý nghĩa thông số ragConfig, API spec, sample response

## Key Architecture Patterns

### WebSocket Gateways

Mỗi gateway chạy process riêng, dùng namespace `/` và Redis adapter để scale ngang.

| Gateway | Module | Mode | Port (prod) | Clients |
|---------|--------|------|-------------|---------|
| **AgentGateway** | `agent-gateway/` | `aws` | 3400–3402 | Engineer agents |
| **NodeGateway** | `node-gateway/` | `nws` | 3403–3406 | Node daemons |
| **ChatWsGateway** | `chat-gateway/` | `cws` | 3407–3409 | Users, anonymous, assistant agents |
| Legacy ChatGateway | `chat/` | `api` | 3330–3332 | Backward compat dev only |

**Nginx routing (ws.hydrabyte.co):**
- `/agent/socket.io` → AWS (port 3400–3402)
- `/node/socket.io` → NWS (port 3403–3406)
- `/chat/socket.io` → CWS (port 3407–3409)

**ChatWsGateway (CWS) — thiết kế:**
- Không import AgentModule — inject `@InjectModel(Agent)` + `HeartbeatService` trực tiếp
- Không có `command:send` handler (slash commands bị loại bỏ để giảm dependency)
- Token verification: inline `_verifyExternalSignedToken` + `_validateAndTouchAnonymousToken`
- Redis subscriptions (MODE=cws): `agent:join-room`, `chat:message-new`, `chat:response:*`

**AgentGateway (AWS) — thiết kế:**
- Engineer agents only — reject non-agent tokens
- Không import AgentModule/ConversationModule/ActionModule
- `HeartbeatModule` shared với AgentModule
- Log lifecycle events (connect/disconnect/status change) → `agent.logs` với rotation 100 entries

### Luồng chat: user → CWS → agt worker

```
User client   →[WS message:send]→  CWS
CWS           →[Redis lpush]→      chat:task:{agentId}
Agt worker    →[Redis blpop]→      process → publish chat:response:{convId}
CWS           →[Redis psubscribe]→  emit message:new → User client
```

Con worker (Discord/Telegram) publish `chat:message-new` → CWS subscribe và xử lý tương tự.

### Agent Heartbeat (WebSocket)

**Engineer agent** gửi `agent:heartbeat` tới AWS → `HeartbeatService.heartbeat()`.

**Payload từ agent:**
```json
{
  "status": "idle|busy",
  "mcpConnected": true,
  "availableFunctions": ["mcp__Builtin__GetWork", "mcp__Builtin__SubmitWork"]
}
```

- `mcpConnected` + `availableFunctions`: server guard work assignment
- Response có thể chứa `systemTask` + `systemMessage` nếu có Work cần thực hiện
- `assistant` agent không gửi WS heartbeat — dùng `heartbeatInternal` in-process

### Redis pub/sub channels

| Channel | Publisher | Subscriber | Mô tả |
|---------|-----------|-----------|-------|
| `agent:join-room` | Con worker | CWS, AWS | Force agent socket join conversation room |
| `chat:message-new` | Con worker | CWS | Inbound Discord/Telegram message |
| `chat:task:{agentId}` | CWS | Agt worker (BLPOP) | Route message → assistant agent |
| `chat:response:{convId}` | Agt worker | CWS | Assistant response |
| `outbound:message` | CWS | Con worker | Bridge response → Discord/Telegram |
| `outbound:typing` | CWS | Con worker | Typing indicator |
| `outbound:direct` | AWS/CWS | Con worker | Proactive channel send |
| `node:cmd:{nodeId}` | NWS | NWS (local) | Forward command tới node socket |
| `chat:cmd:{agentId}` | CWS | Agt worker | Command tới assistant agent |

### Distributed locking

| Lock key | TTL | Mục đích |
|----------|-----|---------|
| `lock:chat-msg:{nonce}` | 10s | Dedup inbound message across CWS instances |
| `lock:chat-resp:{nonce}` | 10s | Dedup assistant response across CWS instances |
| `lock:outbound:{actionId}` | 10s | Dedup outbound bridge across CWS instances |
| `agent:lock:{agentId}` | — | Agt worker ownership (1 runner per agentId) |

### Authentication Token Types
- **User JWT**: `sub` (userId), `orgId`, `roles`, `groupId`
- **Agent JWT**: `sub` (agentId), `orgId`, `type: 'agent'`, `roles: ['organization.editor']`
  > ⚠️ Agent JWT KHÔNG có `roles: ['agent']` — phát hiện khi debug bug isAgent(). Detect agent context bằng `!!agentId && !userId`.
- **Anonymous Token**: `type: 'anonymous'`, `agentId`, `anonymousId`, `tokenId`, `expiresAt`
- **Node JWT**: `sub` (nodeId), `type`, `username`, `status`, `orgId`

### Action Types (DB)
`ActionType` enum in `src/modules/action/action.enum.ts`:

| Type | When saved |
|------|-----------|
| `message` | Regular chat message (user or agent) |
| `notice` | System message (`type: 'system'` in message:send) |
| `tool_use` | Agent tool call step |
| `tool_result` | Agent tool result step |
| `thinking` | Agent thinking/reasoning block |
| `error` | Error event |
| `command` | Slash command with side effects (`/stop`, `/reload`) — legacy ChatGateway only |
| `joined` | Participant joined event |
| `left` | Participant left event |
| `handoff` | Conversation handoff |

### Queue System (BullMQ)
- Producers in `src/queues/producers/` — emit events
- Processors in `src/queues/processors/` — consume events (currently: NodeProcessor, ModelProcessor)
- Config in `src/config/queue.config.ts`

### MCP (Model Context Protocol)
- Server runs on port 3355 (configurable via `MCP_PORT`)
- **48 built-in tools** in `src/mcp/builtin/`: CBM (Document/Project/Work management), IAM (User), AIWM (Agent/Instruction/Memory/Reminder)
- Per-session `McpServer` instances with 30-minute inactivity timeout
- Tools filtered by `agent.allowedToolIds`
- Transport: Streamable HTTP (POST + SSE)

## Commands

```bash
nx run aiwm:api    # API mode (REST + WebSocket, port 3003 dev)
nx run aiwm:mcp    # MCP mode (port 3355)
nx run aiwm:wrk    # Worker mode (BullMQ)
nx run aiwm:agt    # Agent worker mode (hosted agents)
nx run aiwm:con    # Connection worker mode (Discord/Telegram)
nx run aiwm:aws    # Agent WS gateway (/, port 3400 dev)
nx run aiwm:nws    # Node WS gateway (/, port 3403 dev)
nx run aiwm:cws    # Chat WS gateway (/, port 3407 dev)
nx run aiwm:build  # Build
```

## Environment Variables

```bash
# Required
JWT_SECRET=<secret>
MONGODB_URI=mongodb://host:27017
REDIS_URL=redis://host:6379
REDIS_HOST=host
REDIS_PORT=6379
REDIS_USERNAME=<user>          # If Redis auth enabled
REDIS_PASSWORD=<pass>          # If Redis auth enabled

# Optional
PORT=3003                      # HTTP server port (api mode)
PORT_AWS=3400                  # Agent WS port (aws mode, fallback to PORT)
PORT_NWS=3403                  # Node WS port (nws mode, fallback to PORT)
PORT_CWS=3407                  # Chat WS port (cws mode, fallback to PORT)
MCP_PORT=3355                  # MCP server port
MODE=api|mcp|wrk|agt|con|aws|nws|cws  # Run mode (default: api)
INTERNAL_API_KEY=<key>         # Service-to-service auth
MCP_ALLOWED_HOSTS=<hosts>      # Comma-separated allowed hosts
AGENT_IDS=id1,id2,id3          # Filter agents to run (agt mode)
AGENT_IGNORE_IDS=id1,id2       # Exclude agents from agt mode
```

> **Note — NestJS config vs process.env timing**: Constant export từ config file được evaluate tại **import time**, trước khi `ConfigModule.forRoot()` chạy dotenv. Luôn dùng `buildRedisConfig()` function (không phải constant) khi tạo Redis client trong constructors hoặc lifecycle hooks.
