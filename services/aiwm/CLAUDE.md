# CLAUDE.md - AIWM Service

## Service Overview

AIWM (AI Workload Manager) is the core service for AI operations. Port 3003 (dev), 3330-3339 (prod).

Multi-mode: API (HTTP/WebSocket) + MCP (AI agent integration) + Worker (BullMQ) + Agent runner + Connection bridge.

## Run Modes

| Mode | Command | Description |
|------|---------|-------------|
| **api** | `nx run aiwm:api` | REST API + WebSocket server (default) |
| **mcp** | `nx run aiwm:mcp` | Standalone MCP protocol server (port 3355) |
| **wrk** | `nx run aiwm:wrk` | BullMQ background job worker |
| **agt** | `nx run aiwm:agt` | Hosted agent worker (connects to `/ws/chat`) |
| **con** | `nx run aiwm:con` | Connection worker (Discord/Telegram bridge) |

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Agent | `src/modules/agent/` | AI agent management (assistant/engineer types) |
| Agent-Worker | `src/modules/agent-worker/` | Hosted agent runner (MODE=agt) — handles `agent:command` events |
| Node | `src/modules/node/` | Worker node management + WebSocket gateway (`/ws/node`) |
| Chat | `src/modules/chat/` | Real-time chat WebSocket gateway (`/ws/chat`) — slash commands, heartbeat, presence |
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
- Tự động connect vào `/ws/chat` khi worker khởi động
- Nhận message qua `message:new`, phản hồi qua `message:send`
- Heartbeat qua `agent:heartbeat` WS event
- Scale ngang bằng Redis lock (mỗi agentId chỉ có một runner active)

### `engineer` — External self-deployed agent
- Chạy **bên ngoài** hệ thống, do người dùng tự deploy (hoặc deploy lên Node)
- Có quyền truy cập môi trường đầy đủ (bash, file system, v.v.)
- Tự gọi `POST /agents/:id/connect` để lấy JWT token + config
- Tự connect vào `/ws/chat` bằng JWT đó, emit `conversation:join` để vào room
- **Phải tự filter `message:new`** — skip `role=assistant`, `type=system/tool_use/tool_result/thinking`, `skipAgent=true`, và dedup theo `_id`
- Heartbeat qua `agent:heartbeat` WS (preferred) hoặc `POST /agents/:id/heartbeat`
- Khi có `nodeId`: AIWM quản lý lifecycle qua WebSocket Node (`agent.start/update/delete`)
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

## Key Architecture Patterns

### WebSocket Gateways
- **NodeGateway** (`/ws/node`): Node worker connections. JWT auth in `afterInit` middleware. In-memory connection tracking via `NodeConnectionService`.
- **ChatGateway** (`/ws/chat`): User/Agent/Anonymous chat. JWT auth in `handleConnection`. Redis-based presence tracking. Redis pub/sub for cross-instance communication.

### Chat Slash Commands
Slash commands are intercepted at the gateway — they are **not** processed as plain text messages in `AgentRunner`.

| User types | Mechanism | Agent receives |
|-----------|-----------|---------------|
| `/stop [reason]` | `command:send` → `agent:command { type: 'stop' }` | Aborts current LLM generation |
| `/reload` | `command:send` → `agent:command { type: 'reload' }` | Re-fetches config from AIWM via `connectInternal` |
| `/inspect` | `command:send` → `agent:command { type: 'inspect' }` | Emits sanitized runtime config as system message |
| `/ignore <text>` | Intercepted in `message:send`, `metadata.skipAgent: true` set | Skips message entirely |

- `command:send` is **user-only** (anonymous clients are rejected)
- `agent:command` is emitted directly to agent socket(s) — not broadcast to the conversation room
- `/stop` and `/reload` are saved to DB as `ActionType.COMMAND` for audit trail
- See `docs/aiwm/CHAT-WEBSOCKET-EVENTS.md` for full payload reference

### Agent Heartbeat (WebSocket)
Agents connected to `/ws/chat` use `agent:heartbeat` event (not `POST /agents/heartbeat`) to send keep-alive + status updates. The gateway delegates to `AgentService.heartbeat()` — same logic, same response shape including work assignment and reminder injection when `status: 'idle'`.

### Agent Types
- **assistant**: In-process agent run by `MODE=agt` worker. No environment access. Connects to `/ws/chat` for autonomous operation. Has `secret` for auth.
- **engineer**: Agent with environment access (bash, file system, etc). Two deployment modes: with `nodeId` = system-deployed to node via WebSocket (agent.start/update/delete); without `nodeId` = user self-deploys. Has `secret` for auth.
- See `docs/aiwm/agents/AGENT-TYPE-CLASSIFICATION.md` for full details.

### Authentication Token Types
- **User JWT**: Standard `sub` (userId), `orgId`, `roles`, `groupId`
- **Agent JWT**: `sub` (agentId), `orgId`, `type: 'agent'`, `roles: ['agent']`
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
| `command` | Slash command with side effects (`/stop`, `/reload`) |
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

### Distributed Architecture
- Redis adapter for WebSocket horizontal scaling (`redis-io.adapter.ts`)
- Redis pub/sub channels:
  - `agent:join-room` — force agent sockets to join a conversation room (published by Connection Worker)
  - `chat:message-new` — broadcast inbound Discord/Telegram messages to room (published by Connection Worker)
  - `outbound:message` — bridge agent responses back to Discord/Telegram (published by ChatGateway)
- Distributed locking:
  - `lock:chat-msg:{nonce}` — prevents duplicate inbound message processing across WS instances
  - `lock:outbound:{actionId}` — prevents duplicate outbound bridging across WS instances

## Commands

```bash
nx run aiwm:api    # API mode (REST + WebSocket)
nx run aiwm:mcp    # MCP mode (port 3355)
nx run aiwm:wrk    # Worker mode (BullMQ)
nx run aiwm:agt    # Agent worker mode (hosted agents)
nx run aiwm:con    # Connection worker mode (Discord/Telegram)
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

# Optional
PORT=3003                      # HTTP server port
MCP_PORT=3355                  # MCP server port
MODE=api|mcp|wrk|agt|con       # Run mode (default: api)
INTERNAL_API_KEY=<key>         # Service-to-service auth
MCP_ALLOWED_HOSTS=<hosts>      # Comma-separated allowed hosts
WS_CHAT_URL=http://host:3003   # Chat WebSocket URL (for agent mode)
AGENT_IDS=id1,id2,id3          # Filter agents to run (agent mode)
```
