# Agent Module - Technical Overview

> Last updated: 2026-03-02 (P0 + P1 + P1.5 + P2 + P3-1 completed)

## 1. File Structure

```
services/aiwm/src/modules/agent/
├── agent.schema.ts      # MongoDB schema (extends BaseSchema)
├── agent.dto.ts         # DTOs: Create, Update, Connect, Heartbeat, Credentials, Disconnect
├── agent.service.ts     # Business logic (extends BaseService)
├── agent.controller.ts  # REST API endpoints
└── agent.module.ts      # NestJS module (imports: NodeModule, DeploymentModule, QueueModule, ConfigurationModule)
```

## 2. Agent Types

### Managed (`type: 'managed'`)
- System deploys to a Node via WebSocket commands (`agent.start`, `agent.update`, `agent.delete`)
- Has `secret` (bcrypt hashed) for authentication
- Requires `nodeId` — specifies which node runs this agent
- Runs as systemd service on the node (future: Container via Deployment)
- `deploymentId` NOT needed in v1.0 (only needed if Container deployment in future)

### Autonomous (`type: 'autonomous'`, default)
- User self-deploys following install guide + credentials
- Has `secret` for self-authentication via `POST /agents/:id/connect`
- Does NOT need `nodeId`
- `deploymentId` optional — links to LLM deployment for config API

### Key Rule
Type is **immutable** after creation. Cannot change managed <-> autonomous.

## 3. Status State Machine

| Status | Meaning | Set by | When |
|--------|---------|--------|------|
| `inactive` | Not connected / offline | System | Create, disconnect, heartbeat timeout |
| `idle` | Connected, available | System (connect), Agent (heartbeat) | Connect success, heartbeat status=idle |
| `busy` | Connected, working | Agent (heartbeat) | Heartbeat status=busy |
| `suspended` | User paused agent | User (API) | User updates status=suspended |

**State transitions:**
```
create          → inactive (forced)
connect         → idle (automatic)
heartbeat(idle) → idle (from busy)
heartbeat(busy) → busy (from idle)
disconnect      → inactive
suspended blocks connect + heartbeat
```

**Heartbeat DTO**: Enum `'idle' | 'busy'` only.

## 4. Schema Fields

```
Agent extends BaseSchema:
  name: string (required)
  description: string (required)
  status: 'inactive' | 'idle' | 'busy' | 'suspended' (default: 'inactive')
  type: 'managed' | 'autonomous' (default: 'autonomous')
  framework: 'claude-agent-sdk' (default: 'claude-agent-sdk')
    // Determines which runtime engine the system uses to run the agent.
    // Managed: required — system picks runtime based on this field.
    // Autonomous: optional — informational, used for install script/config template.
  instructionId?: ref Instruction
  guardrailId?: ref Guardrail
  deploymentId?: ref Deployment
  nodeId?: ref Node (required for managed)
  role: string (RBAC role, default: 'organization.viewer')
  tags: string[]
  secret?: string (bcrypt hashed, select: false) — both types have secrets
  allowedToolIds: string[] (ref Tool)
  settings: Record<string, unknown> (flat prefix structure: claude_, discord_, telegram_)
  lastConnectedAt?: Date
  lastHeartbeatAt?: Date
  connectionCount: number (default: 0)
  // Inherited from BaseSchema: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

**Indexes**: `{ status: 1, createdAt: -1 }`, `{ type: 1 }`, `{ framework: 1 }`, `{ nodeId: 1 }`, `{ instructionId: 1 }`, `{ guardrailId: 1 }`, `{ tags: 1 }`, `{ name: 'text', description: 'text' }`

## 5. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/agents` | User JWT | Create agent (both types get secret). Managed → send `agent.start` via WS to node |
| GET | `/agents` | User JWT | List agents + statistics (byStatus, byType, byFramework) |
| GET | `/agents/:id` | User JWT | Get agent. Supports `?populate=instruction` |
| PUT | `/agents/:id` | User JWT | Update agent. Managed → send `agent.update` via WS to node |
| DELETE | `/agents/:id` | User JWT | Soft delete. Managed → send `agent.delete` via WS to node |
| GET | `/agents/:id/config` | User JWT | Config for autonomous agent (deployment, mcpServers, instruction) |
| GET | `/agents/:id/instruction` | Agent/User JWT | Get latest instruction with resolved `@project`/`@document` context |
| POST | `/agents/:id/connect` | Public (secret) | Auth for both types → returns JWT + config + tools, sets status=idle |
| POST | `/agents/:id/heartbeat` | Agent/User JWT | Heartbeat - update status (idle/busy) + lastHeartbeatAt. Rejects if suspended |
| POST | `/agents/:id/disconnect` | Agent/User JWT | Disconnect - set status=inactive |
| POST | `/agents/:id/credentials/regenerate` | User JWT | Regenerate secret (both types) + envConfig + installScript |

## 6. Connect Response Structure

```typescript
AgentConnectResponseDto {
  accessToken: string       // JWT (managed connect) or '' (autonomous config)
  expiresIn: number
  mcpServers: { Builtin: { type, url, headers } }
  instruction: { id, systemPrompt, guidelines[] }
  tools: Tool[]             // Allowed tools for this agent
  settings: Record<string, unknown>
  deployment?: { id, provider, model, baseAPIEndpoint, apiEndpoint }
}
```

## 7. Managed Agent Deploy Flow

```
User creates agent (type=managed, nodeId=xxx)
  → AgentService.create()
    → Validate nodeId: exists in DB, status=online, heartbeat < 10min
    → Gen secret + bcrypt hash
    → Force status: inactive
    → Save to DB (secret removed from response)
    → Emit agent.created event (BullMQ)
    → NodeGateway.sendCommandToNode(nodeId, AGENT_START, { agentId, secret, framework, ... })
      → Emit via Socket.IO room `node:{nodeId}` (cross-instance via Redis adapter)
      → Node receives command
      → Agent on node calls POST /agents/:id/connect with secret
      → Receives JWT + config
      → Agent status → idle (set by connect)
```

## 8. WebSocket Command Routing (Multi-Instance)

NodeGateway sử dụng **Socket.IO rooms + Redis adapter** để route commands cross-instance:

- Node connect → join room `node:{nodeId}`
- `sendCommandToNode()` → `server.to('node:{nodeId}').emit()` (Redis adapter broadcast)
- Online check → `server.in('node:{nodeId}').fetchSockets()` (cross-instance query)

Giải quyết vấn đề khi chạy nhiều WS instance phía sau load balancer: command từ instance A có thể reach node đang kết nối ở instance B.

`NodeConnectionService` (in-memory Map) vẫn giữ cho local operations: heartbeat tracking, stale connection detection, duplicate handling.

## 9. Security — Secret Handling

- `secret` field có `select: false` trong schema → **không trả về** trong GET queries
- `create()` và `updateAgent()` explicit delete `secret` từ response trước khi return
- Chỉ `connect()` dùng `.select('+secret')` để verify — không bao giờ trả secret trong response
- `regenerateCredentials()` trả plaintext secret **1 lần duy nhất** cho user copy

## 10. Context Injection (`@project` & `@document`)

Instruction `systemPrompt` hỗ trợ reference pattern `@project:<id>` và `@document:<id>`. Khi build instruction (connect, getConfig, getInstruction), hệ thống:

1. Regex scan: `/@(project|document):([a-f0-9]{24})/g`
2. HTTP GET to CBM service: `/projects/:id` hoặc `/documents/:id`
3. Append resolved context block cuối systemPrompt

**Injected format:**
```
{systemPrompt gốc}

---
## Injected Context (auto-resolved)

### Project: {name}
- **Status**: {status}
- **Timeline**: {startDate} → {endDate}
- **Description**: {description}
- **Tags**: {tags}
- **Documents** ({count}):
  - `{docId}`: {summary}
  - `{docId}`: {summary}
  ...

### Document: {summary}
- **Type**: {type}
- **Status**: {status}
- **Labels**: {labels}
- **Content**: {content (truncate 2000 chars)}
---
```

**Cross-service access**: HTTP API calls via `HttpService` + `firstValueFrom` with agent/user access token. CBM base URL from `CBM_BASE_API_URL` config.

**Instruction status check**: Nếu `instruction.status !== 'active'` → log warning + trả fallback instruction (empty systemPrompt + guidelines).

## 11. Heartbeat Work Dispatch (P3-1)

Khi agent gửi heartbeat với `status: 'idle'`, hệ thống query CBM `GET /works/next-work` để tìm work cần làm và trả về kèm `systemMessage` hướng dẫn agent.

### Response Structure

```typescript
{
  success: true,
  work?: {
    id: string;
    title: string;
    type: string;
    status: string;
    priorityLevel: number;
  },
  systemMessage?: string
}
```

### SystemMessage by Priority

| Priority | Condition | SystemMessage |
|----------|-----------|---------------|
| 1 | Recurring/scheduled task, startAt reached | StartWork → CompleteWork (skip review) |
| 2 | Assigned subtask, todo | StartWork → RequestReview/CompleteWork → BlockWork |
| 3 | Assigned task, todo, no subtasks | StartWork → RequestReview/CompleteWork → BlockWork |
| 4 | Reported work, blocked | UnblockWork hoặc CancelWork |
| 5 | Reported work, review | CompleteWork hoặc RejectReviewForWork |

### Recurring Task Behavior

Recurring/scheduled tasks (`isRecurring=true`) được xử lý đặc biệt:

- **Skip review**: Agent gọi `StartWork` → `CompleteWork` trực tiếp (không cần `RequestReviewForWork`)
- **CBM completeWork()** chấp nhận status `in_progress` cho recurring tasks
- **Auto-reset**: Sau complete, CBM tự reset status về `todo` + tính `startAt` mới cho chu kỳ tiếp
- **Priority 1 only when due**: Recurring tasks chỉ xuất hiện ở Priority 1 khi `startAt <= now`. Không xuất hiện ở Priority 3 nếu `startAt` chưa đến
- **Self-assigned non-recurring**: Agent gọi `RequestReviewForWork` → `CompleteWork` (vừa thực hiện vừa review)
- **Non-self-assigned**: Agent gọi `RequestReviewForWork` → chờ người review duyệt

### Graceful Fallback

Nếu CBM service unavailable, heartbeat trả `{ success: true }` (không có work).

## 12. Dependencies

- **NodeGateway**: Send agent lifecycle commands to nodes via WebSocket (cross-instance via Redis adapter)
- **NodeService**: Validate nodeId exists, status online, heartbeat within 10min
- **DeploymentService**: Build endpoint info for LLM deployment
- **ConfigurationService**: Read system configs (AIWM_BASE_MCP_URL, AIWM_BASE_API_URL, etc.)
- **HttpService**: HTTP calls to CBM service for context injection (`@project`, `@document`)
- **AgentProducer**: Emit BullMQ events (agent.created, agent.updated, agent.deleted)
- **Instruction model**: Build instruction object for agent
- **Tool model**: Get allowed tools whitelist

## 13. Queue Events

Producer: `AgentProducer` → `agents.queue`
- `agent.created` — full agent data
- `agent.updated` — full agent data
- `agent.deleted` — `{ id }`

**Note**: No AgentProcessor exists yet. Events are produced but not consumed.

## 14. Related Modules

- **Node module** (`src/modules/node/`): Node management + WebSocket gateway. Agent commands sent via `NodeGateway.sendCommandToNode()` (cross-instance via Redis adapter + rooms).
- **Chat module** (`src/modules/chat/`): Real-time chat. Agent auto-joins conversation on WS connect. Presence tracked in Redis. `RedisIoAdapter` defined here, applied globally.
- **Tool module** (`src/modules/tool/`): Agent references tools via `allowedToolIds`. Tools fetched via `getAllowedTools()`.
- **Instruction module** (`src/modules/instruction/`): Agent references instruction via `instructionId`. Built via `buildInstructionObjectForAgent()`.

## 15. Existing Documentation

- `docs/aiwm/agents/README.md` — Client integration overview
- `docs/aiwm/agents/CLIENT-INTEGRATION-GUIDE.md` — Full client integration guide
- `docs/aiwm/agents/AGENT-TYPE-CLASSIFICATION.md` — Managed vs Autonomous details
- `docs/aiwm/agents/AGENT-SETTINGS-STRUCTURE.md` — Settings flat prefix structure
- `docs/aiwm/agents/FRONTEND-API-SPEC.md` — Frontend API spec
- `docs/aiwm/AGENT-WEBSOCKET-INTEGRATION.md` — WebSocket integration details
- `docs/aiwm/node-agent/05-agent-commands.md` — Agent commands reference
