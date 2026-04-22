# CLAUDE_AIWM.md

Guidance for AI Agent dedicated to maintaining the **AIWM (AI Workload Manager)** service.

---

## Your Role

You are the dedicated maintainer of the AIWM service (`services/aiwm/`). Your scope is limited to this service and its related documentation under `docs/aiwm/`. You may read (but not modify) shared libraries at `libs/base/` and `libs/shared/` when needed for context.

---

## Development Workflow

1. **Discuss** - Gather requirements, clarify scope
2. **Propose** - Create plan at `docs/aiwm/<feature>/`
3. **Approve** - Wait for confirmation before coding
4. **Branch** - Create git branch for the change
5. **Implement** - Execute the plan
6. **Verify** - Build, type-check, test

### Task Management

- Break work into micro-tasks (one file, one function per task)
- Mark each task done immediately after completion
- Keep responses concise, focused on current task

---

## Khi Gặp Vướng Mắc

Nếu gặp bất cứ vướng mắc nào trong quá trình thực hiện công việc:
- Thử tối đa **3 lần** để giải quyết vấn đề
- Nếu cả 3 lần đều thất bại → mention <@1074993237363802122> để hỗ trợ, rồi **dừng lại**, không tiếp tục thực hiện

---

## Lesson Learned

Quy trình capture lesson learned sau mỗi feature ship prod:

**Ngay khi phát hiện lesson có tính chung:**
- Ảnh hưởng cách làm việc → update Instruction
- Là kiến thức kỹ thuật / context dự án → lưu vào memory (`lessons` category)

---

## Communication Protocol

**Trước khi thực hiện bất kỳ tool call nào**, dùng `mcp__Chat__SendMessage` để gửi thông báo cho user biết em đang làm gì.

Flow chuẩn:
```
thinking → SendMessage (ack) → tools → final message
```

Ví dụ:
- "Đang kiểm tra build log..."
- "Đang restart PM2 processes..."
- "Đang SSH vào prod để deploy..."

---

## Service Overview

| Key | Value |
|-----|-------|
| Path | `services/aiwm/` |
| Port (dev) | 3003 |
| Port (prod) | 3330–3339 |
| MCP Port | 3355 (configurable via `MCP_PORT`) |
| Database | `core_aiwm` (MongoDB + Mongoose) |
| Modes | `api`, `mcp`, `wrk`, `agt`, `con` |
| Entry | `src/main.ts` → routes to bootstrap file based on `MODE` env |

---

## Commands

```bash
# Build & verify
nx run aiwm:build
npx tsc --noEmit -p services/aiwm/tsconfig.app.json
nx lint aiwm
nx test aiwm

# Run modes
nx run aiwm:api    # REST API + WebSocket (port 3003)
nx run aiwm:mcp    # MCP protocol server (port 3355)
nx run aiwm:wrk    # BullMQ background worker
nx run aiwm:agt    # Hosted agent worker (assistant-type agents)
nx run aiwm:con    # Connection worker (Discord/Telegram bridge)

# Quick health check
curl http://localhost:3003/health
open http://localhost:3003/api-docs
```

---

## Run Modes

| Mode | Bootstrap File | Description |
|------|---------------|-------------|
| **api** | `bootstrap-api.ts` | REST API + WebSocket gateways (default) |
| **mcp** | `bootstrap-mcp.ts` | Standalone MCP protocol server |
| **wrk** | `bootstrap-worker.ts` | BullMQ background job processing |
| **agt** | `bootstrap-agent.ts` | Hosted agent runner (assistant-type agents) |
| **con** | `bootstrap-connection.ts` | Discord/Telegram bridge worker |

---

## Modules

| Module | Path | Description |
|--------|------|-------------|
| **agent** | `src/modules/agent/` | AI agent management (assistant/engineer types) |
| **agent-worker** | `src/modules/agent-worker/` | Hosted agent runner logic (MODE=agt) |
| **node** | `src/modules/node/` | Worker node management + `/ws/node` WebSocket gateway |
| **chat** | `src/modules/chat/` | Real-time chat `/ws/chat` gateway — slash commands, heartbeat, presence |
| **model** | `src/modules/model/` | AI model metadata and lifecycle |
| **deployment** | `src/modules/deployment/` | Model deployment + inference proxy |
| **instruction** | `src/modules/instruction/` | System prompts and guidelines |
| **tool** | `src/modules/tool/` | MCP tools — built-in and custom |
| **guardrail** | `src/modules/guardrail/` | Safety constraints for agents |
| **pii** | `src/modules/pii/` | PII detection and redaction |
| **configuration** | `src/modules/configuration/` | Key-value configuration store |
| **conversation** | `src/modules/conversation/` | Chat conversation management |
| **message** | `src/modules/message/` | Chat message storage and retrieval |
| **action** | `src/modules/action/` | Audit trail for all chat events |
| **execution** | `src/modules/execution/` | Workflow execution orchestration |
| **workflow** | `src/modules/workflow/` | Workflow definition |
| **workflow-step** | `src/modules/workflow-step/` | Individual workflow steps |
| **resource** | `src/modules/resource/` | Infrastructure resource management |
| **reports** | `src/modules/reports/` | Analytics and reporting |
| **memory** | `src/modules/memory/` | Agent memory/context storage |
| **reminder** | `src/modules/reminder/` | Scheduled reminders and notifications |
| **connection** | `src/modules/connection/` | Discord/Telegram connection config |
| **connection-worker** | `src/modules/connection-worker/` | Platform bridge logic |
| **mcp** | `src/modules/mcp/` | MCP protocol implementation |
| **util** | `src/modules/util/` | AI utilities (OpenAI Responses API) |
| **file** | `src/modules/file/` | File operations |
| **api-key** | `src/modules/api-key/` | API key management |
| **debug** | `src/modules/debug/` | Debug utilities |
| **setup** | `src/modules/setup/` | Service initialization |

---

## Agent Types

### `assistant` — In-process agent
- Runs **inside** AIWM Agent Worker (`MODE=agt`) via `AgentRunner`
- No environment access (no bash, no file system)
- Auto-connects to `/ws/chat` when worker starts
- Receives messages via `message:new`, responds via `message:send`
- Heartbeat via `agent:heartbeat` WS event
- Horizontally scalable via Redis lock (one runner per agentId)

### `engineer` — External self-deployed agent
- Runs **outside** the system; user-deployed or node-deployed
- Full environment access (bash, file system, etc.)
- Calls `POST /agents/:id/connect` to get JWT token + config
- Self-connects to `/ws/chat`, emits `conversation:join` to enter room
- **Must self-filter `message:new`** — skip `role=assistant`, `type=system/tool_use/tool_result/thinking`, `skipAgent=true`, and dedup by `_id`
- Heartbeat via `agent:heartbeat` WS (preferred) or `POST /agents/:id/heartbeat`
- With `nodeId`: AIWM manages lifecycle via Node WebSocket (`agent.start/update/delete`)
- Without `nodeId`: user manages lifecycle entirely

> Full details: `docs/aiwm/agents/AGENT-TYPE-CLASSIFICATION.md` and `docs/aiwm/agents/CLIENT-INTEGRATION-GUIDE.md`

---

## WebSocket Gateways

### NodeGateway (`/ws/node`)
- JWT auth in `afterInit` middleware
- In-memory connection tracking via `NodeConnectionService`
- Events: node registration, agent lifecycle commands (`agent.start`, `agent.update`, `agent.delete`)

### ChatGateway (`/ws/chat`)
- JWT auth in `handleConnection`
- Redis-based presence tracking
- Redis pub/sub for cross-instance communication
- Anonymous token support for public/guest access

### Chat Slash Commands

Slash commands are intercepted at the gateway — **not** processed as plain text in `AgentRunner`.

| User types | Mechanism | Effect |
|-----------|-----------|--------|
| `/stop [reason]` | `command:send` → `agent:command { type: 'stop' }` | Aborts current LLM generation |
| `/reload` | `command:send` → `agent:command { type: 'reload' }` | Re-fetches config from AIWM |
| `/inspect` | `command:send` → `agent:command { type: 'inspect' }` | Emits sanitized runtime config as system message |
| `/ignore <text>` | Intercepted in `message:send`, `metadata.skipAgent: true` | Skips message entirely |

- `command:send` is **user-only** (anonymous clients rejected)
- `agent:command` goes directly to agent socket(s) — not broadcast to room
- `/stop` and `/reload` are saved as `ActionType.COMMAND` for audit trail

---

## Action Types (Audit Trail)

`ActionType` enum in `src/modules/action/action.enum.ts`:

| Type | When saved |
|------|-----------|
| `message` | Regular chat message (user or agent) |
| `notice` | System message (`type: 'system'`) |
| `tool_use` | Agent tool call step |
| `tool_result` | Agent tool result |
| `thinking` | Agent reasoning/thinking block |
| `error` | Error event |
| `command` | Slash command with side effects (`/stop`, `/reload`) |
| `joined` | Participant joined conversation |
| `left` | Participant left conversation |
| `handoff` | Conversation handoff |

---

## Authentication Token Types

| Token Type | `sub` | Other fields |
|------------|-------|-------------|
| User JWT | userId | `orgId`, `roles`, `groupId`, `licenses` |
| Agent JWT | agentId | `orgId`, `type: 'agent'`, `roles: ['agent']` |
| Anonymous Token | — | `type: 'anonymous'`, `agentId`, `anonymousId`, `tokenId`, `expiresAt` |
| Node JWT | nodeId | `type`, `username`, `status`, `orgId` |

---

## MCP (Model Context Protocol)

- Server runs on port 3355 (configurable via `MCP_PORT`)
- **Built-in tools** in `src/mcp/builtin/`: CBM (Document/Project/Work), IAM (User), AIWM (Agent/Instruction/Memory/Reminder)
- Per-session `McpServer` instances with 30-minute inactivity timeout
- Tools filtered by `agent.allowedToolIds`
- Transport: Streamable HTTP (POST + SSE)
- See `services/aiwm/src/mcp/README.md` for built-in tools guide

---

## Distributed Architecture

### Redis Pub/Sub Channels
| Channel | Published by | Purpose |
|---------|-------------|---------|
| `agent:join-room` | Connection Worker | Force agent sockets to join a conversation room |
| `chat:message-new` | Connection Worker | Broadcast inbound Discord/Telegram messages |
| `outbound:message` | ChatGateway | Bridge agent responses to Discord/Telegram |

### Distributed Locks
| Lock key | Purpose |
|----------|---------|
| `lock:chat-msg:{nonce}` | Prevent duplicate inbound message processing across WS instances |
| `lock:outbound:{actionId}` | Prevent duplicate outbound bridging across WS instances |

### WebSocket Scaling
- Redis adapter (`redis-io.adapter.ts`) enables horizontal scaling of WS instances

---

## Queue System (BullMQ)

- Producers: `src/queues/producers/`
- Processors: `src/queues/processors/` (NodeProcessor, ModelProcessor)
- Config: `src/config/queue.config.ts`

| Queue | Events |
|-------|--------|
| `nodes.queue` | Node lifecycle events |
| `models.queue` | Model lifecycle events |
| `deployments.queue` | Deployment lifecycle events |
| `agents.queue` | Agent lifecycle events |
| `tools.queue` | Tool events |
| `conversations.queue` | Conversation events |
| `messages.queue` | Message events |

---

## External Integrations

| System | Config | Purpose |
|--------|--------|---------|
| MongoDB | `MONGODB_URI` | Database `core_aiwm` |
| Redis | `REDIS_*` | WebSocket scaling, pub/sub, distributed locks |
| IAM Service | `INTERNAL_API_KEY` | User/org/role management |
| Discord | `connection` module | Inbound/outbound message bridge |
| Telegram | `connection` module | Inbound/outbound message bridge |
| OpenAI-compatible API | deployment config | LLM inference proxy |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `REDIS_URL` | Yes | — | Redis connection URL |
| `REDIS_HOST` | Yes | — | Redis host |
| `REDIS_PORT` | Yes | — | Redis port |
| `REDIS_USERNAME` | No | — | Redis username |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_DB` | No | — | Redis database index |
| `PORT` | No | `3003` | HTTP server port |
| `MCP_PORT` | No | `3355` | MCP server port |
| `MODE` | No | `api` | Run mode: `api\|mcp\|wrk\|agt\|con` |
| `INTERNAL_API_KEY` | No | — | Service-to-service auth |
| `MCP_ALLOWED_HOSTS` | No | — | Comma-separated allowed hosts for MCP |
| `WS_CHAT_URL` | No | — | Chat WebSocket URL (for agent mode) |
| `AGENT_IDS` | No | — | Comma-separated agentIds to run (agent mode) |

---

## Shared Library Usage

### From `@hydrabyte/base` (`libs/base/`)

- `BaseSchema`, `BaseService` — base classes
- `JwtAuthGuard`, `CombinedAuthGuard` — auth guards
- `@CurrentUser()` — request context decorator
- `parseQueryString` — query string to MongoDB filter
- `GlobalExceptionFilter`, `customQueryParser` — global middleware
- `HealthModule` — health check endpoint
- Swagger decorators: `ApiCreateErrors`, `ApiReadErrors`, etc.

### From `@hydrabyte/shared` (`libs/shared/`)

- `RequestContext` — user context type
- `COMMON_CONFIG.DatabaseNamePrefix` — DB name prefix (`core_`)
- `SERVICE_CONFIG.aiwm` — AIWM-specific config
- `buildMongoUri()` — MongoDB connection builder
- `ServiceName.AIWM` — service enum

---

## Documentation Index

| Doc | Path |
|-----|------|
| Agent types | `docs/aiwm/agents/AGENT-TYPE-CLASSIFICATION.md` |
| Agent client integration | `docs/aiwm/agents/CLIENT-INTEGRATION-GUIDE.md` |
| Agent overview | `docs/aiwm/agent/OVERVIEW.md` |
| Agent roadmap | `docs/aiwm/agent/ROADMAP.md` |
| Node overview | `docs/aiwm/node/OVERVIEW.md` |
| Node roadmap | `docs/aiwm/node/ROADMAP.md` |
| Node-agent client guide | `docs/aiwm/node-agent/` |
| Chat WebSocket events | `docs/aiwm/CHAT-WEBSOCKET-EVENTS.md` |
| Chat WebSocket architecture | `docs/aiwm/CHAT-WEBSOCKET-ARCHITECTURE.md` |
| Tool types & execution | `docs/aiwm/tools/TOOL-TYPES-AND-EXECUTION.md` |
| Tool overview | `docs/aiwm/tool/OVERVIEW.md` |
| Instruction overview | `docs/aiwm/instruction/OVERVIEW.md` |
| Guardrail overview | `docs/aiwm/guardrail/OVERVIEW.md` |
| PII overview | `docs/aiwm/pii/OVERVIEW.md` |
| MCP overview | `docs/aiwm/mcp/OVERVIEW.md` |
| MCP built-in tools | `services/aiwm/src/mcp/README.md` |
| Deployment inference | `docs/aiwm/DEPLOYMENT-INFERENCE-PLAN.md` |
| Configuration management | `docs/aiwm/configuration-management-proposal-v2.md` |
| Workflow feature | `docs/aiwm/workflow-feature/` |

---

## Important Conventions

1. **Distributed locking for idempotency** — multi-instance safe via Redis locks
2. **Redis pub/sub for cross-instance communication** — WS events routed via Redis channels
3. **Agent type determines deployment model** — assistant (in-process) vs engineer (external)
4. **Engineer agents must self-filter messages** — gateway does not filter for them
5. **Heartbeat via WS preferred** for connected agents — `agent:heartbeat` event, not REST endpoint
6. **MCP sessions have inactivity timeout** — 30 minutes, then session is destroyed
7. **Soft delete only** — all entities use `isDeleted`, never hard delete
8. **Slash commands bypass AgentRunner** — intercepted at gateway level
