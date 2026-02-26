# Agent Module - v1.0 Roadmap

> Last updated: 2026-02-24
> Status: P0 + P1 + P1.5 + P2 completed — P3 next

## Decisions Made

### Status Redesign (A2 + C1)

**New status enum** (single field, state machine):

| Status | Meaning | Set by | When |
|--------|---------|--------|------|
| `inactive` | Not connected / offline | System | Create, disconnect, heartbeat timeout |
| `idle` | Connected, available | Agent (heartbeat) | Heartbeat status=idle |
| `busy` | Connected, working | Agent (heartbeat) | Heartbeat status=busy |
| `suspended` | User paused agent | User (API) | User updates status=suspended |

**State transitions:**

```
create          → inactive
connect         → idle
heartbeat(idle) → idle (from busy)
heartbeat(busy) → busy (from idle)
disconnect      → inactive
heartbeat timeout (>5min) → inactive
user suspend    → suspended (from any)
user activate   → inactive (from suspended, agent must reconnect)
suspended blocks connect + heartbeat
```

**Heartbeat DTO change**: Enum `'idle' | 'busy'` (remove `'online'`, redundant with connected state).

**Migration**: Existing `status: 'active'` → treat as `inactive` (agent must connect to become `idle`).

### Agent Type Clarification (C2)

| | Managed | Autonomous |
|---|---|---|
| Deploy | System deploys to Node (systemd). Future: Container (Deployment) | User self-deploys with install guide |
| nodeId | Required | Not needed |
| deploymentId | Not needed v1.0 (future Container) | Optional (LLM deployment) |
| secret | Yes (system gen) | Yes (system gen, user receives) |
| Config API | `GET :id/config` (system internal) | `GET :id/config` (user gets config + install guide) |
| Connect API | Both use `POST :id/connect` with secret | Both use `POST :id/connect` with secret |

Both types have secrets. Both can call `connect`. Difference is lifecycle management.

### Framework as Schema Field

Promote `agent_framework` from `settings` to a top-level schema field `framework`:

```typescript
@Prop({
  type: String,
  enum: ['claude-agent-sdk'],  // extend: 'langchain', 'crewai', ...
  default: 'claude-agent-sdk'
})
framework: string;
```

- Managed agents: required — system picks runtime based on this field
- Autonomous agents: optional — used for install script/config template generation
- Currently supported: `claude-agent-sdk`
- Index: `AgentSchema.index({ framework: 1 })`
- Statistics: Add `byFramework` aggregation in `findAll()`

### CORS Strategy (C3)

Handle CORS at Nginx proxy level (production). Remove/disable CORS config in gateway code. For dev, optionally enable via env variable.

---

## Implementation Plan

### P0 — Must Fix (Foundation) ✅ COMPLETED

#### P0-1: Status Redesign ✅
- [x] Schema enum → `['inactive', 'idle', 'busy', 'suspended']`, default `inactive`
- [x] CreateAgentDto status optional (system forces `inactive`)
- [x] HeartbeatDto enum → `['idle', 'busy']`
- [x] `create()` forces `status: 'inactive'`
- [x] `connect()` sets `status: 'idle'`
- [x] `heartbeat()` updates status from DTO + rejects if `suspended`
- [x] `disconnect()` sets `status: 'inactive'`

#### P0-2: Add Tools to Connect/Config Response ✅
- [x] `tools: Tool[]` added to `AgentConnectResponseDto`
- [x] Included in `connect()` and `getAgentConfig()` responses

#### P0-3: Remove Legacy Method ✅
- [x] Deleted `buildInstructionForAgent()` (unused string-format method)

#### P0-4: Both Agent Types Get Secret ✅
- [x] `create()` generates secret for all agents (both managed and autonomous)
- [x] `regenerateCredentials()` works for both types (removed managed-only restriction)

#### P0-5: Framework Field ✅
- [x] Schema field `framework` (enum: `['claude-agent-sdk']`, default: `'claude-agent-sdk'`)
- [x] Index `{ framework: 1 }`
- [x] `framework` in `CreateAgentDto` and `UpdateAgentDto`
- [x] `byFramework` statistics in `findAll()`
- [x] `framework` in `agent.start` / `agent.update` WS payloads
- [x] `framework` in `buildEnvConfig()` and `buildInstallScript()`

### P1 — Important Improvements ✅ COMPLETED

#### P1-1: Validate nodeId for Managed Agents ✅
- [x] In `create()`: Validate nodeId exists in DB via `NodeService.findByObjectId()`
- [x] Check node status === `'online'`
- [x] Check `lastHeartbeat` within 10 minutes
- [x] Throw `BadRequestException` with clear message if validation fails

#### P1-2: Regenerate Credentials → Notify Node ✅
- [x] After regenerating secret, send `agent.update` via WebSocket to node (managed agents)
- [x] Include new secret in the WS payload so node can reconnect

#### P1-3: CORS Cleanup ✅
- [x] `ChatGateway` — already commented out (no change needed)
- [x] `NodeGateway` — removed `cors: { origin: '*' }`, handled at Nginx proxy level

### P1.5 — Multi-Instance WebSocket Fix ✅ COMPLETED

#### P1.5-1: sendCommandToNode() Cross-Instance Routing ✅
- [x] Node connect → join Socket.IO room `node:{nodeId}` for Redis adapter routing
- [x] `sendCommandToNode()` dùng `server.in(room).fetchSockets()` check online cross-instance
- [x] `sendCommandToNode()` dùng `server.to(room).emit()` thay vì direct `socket.emit()`
- [x] `broadcastToAllNodes()` fix log (đã dùng `server.emit()` cross-instance sẵn)
- [x] `isNodeOnline()`, `getOnlineNodes()`, `getOnlineCount()` chuyển sang async dùng `fetchSockets()`
- [x] `NodeConnectionService` giữ nguyên cho local operations (heartbeat, stale detection)

#### P1.5-2: Secret Not Exposed in API Response ✅
- [x] `create()` explicit delete `secret` từ response trước khi return
- [x] `updateAgent()` explicit delete `secret` từ response trước khi return
- [x] Schema `select: false` đã đảm bảo GET endpoints không trả secret

### P2 — Context Injection ✅ COMPLETED

#### P2-1: Instruction Context Injection — `@project` & `@document` ✅

**Concept**: Scan `systemPrompt` cho pattern `@project:<id>` và `@document:<id>`, resolve via HTTP API to CBM service, append context block cuối systemPrompt. Instruction gốc giữ nguyên trong DB.

**Strategy**: Append cuối systemPrompt (không inline replace)

**Supported references:**
- `@project:<id>` → HTTP GET `/projects/:id` from CBM service
- `@document:<id>` → HTTP GET `/documents/:id` from CBM service

**Implementation:**
- [x] Thêm method `resolveContextReferences(systemPrompt, accessToken, orgId)` trong `AgentService`
- [x] Regex scan: `/@(project|document):([a-f0-9]{24})/g`
- [x] HTTP GET to CBM service using `HttpService` + `firstValueFrom` with agent's access token
- [x] Query Project từ CBM: inject `name`, `description`, `status`, `startDate`, `endDate`, `tags`
- [x] Auto-fetch documents thuộc project (status `draft`/`published`), inject list `{ id, summary }` vào project block
- [x] Query Document từ CBM: inject `summary`, `content` (truncate 2000 chars), `type`, `status`, `labels`
- [x] Append block `--- Injected Context (auto-resolved) ---` cuối systemPrompt
- [x] Gọi `resolveContextReferences()` trong `buildInstructionObjectForAgent()` trước khi return
- [x] Log warning nếu reference không tìm thấy (không throw error)
- [x] `HttpModule` added to `AgentModule` imports
- [x] Build thành công

**Cross-service access**: HTTP API calls to CBM service (via `CBM_BASE_API_URL` config), sử dụng access token của agent/user khi gọi API. Pattern: `HttpService` + `firstValueFrom` + `Bearer ${accessToken}`.

#### P2-2: Instruction Status Check ✅
- [x] `buildInstructionObjectForAgent()` thêm check `instruction.status === 'active'`
- [x] Nếu `inactive` → log warning + trả fallback instruction

#### P2-3: GET /agents/:id/instruction Endpoint ✅
- [x] New endpoint `GET /agents/:id/instruction` for on-demand instruction refresh
- [x] Uses agent/user access token for context injection resolution
- [x] Returns `{ id, systemPrompt, guidelines[] }` with resolved `@project`/`@document` references
- [x] Ensures agents always get latest instruction without needing to reconnect

### P3 — Heartbeat Work Dispatch (In Progress)

#### P3-1: Heartbeat Response — Work Assignment
When agent heartbeat with `status: 'idle'`, query CBM `GET /works/next-work` and return work + systemMessage.

**Response structure:** `{ success, work?, systemMessage? }`

**SystemMessage by priority:**
- Priority 1-3 (assignee=agent, todo): Instruction to StartWork, RequestReviewForWork, BlockWork
- Priority 4 (reporter=agent, blocked): Instruction to UnblockWork or CancelWork (include reason)
- Priority 5 (reporter=agent, review): Instruction to CompleteWork or RejectReviewForWork

**Implementation:**
- [ ] Update heartbeat response type: `{ success, work?, systemMessage? }`
- [ ] Query CBM `GET /works/next-work?assigneeType=agent&assigneeId={agentId}` when idle
- [ ] Build systemMessage based on priorityLevel
- [ ] Include `reason` field for blocked work (priority 4)
- [ ] Graceful fallback: if CBM unavailable, return `{ success: true }` only
- [ ] Pass access token from controller to service
- [ ] Build + test

#### P3-2: Skills
- [ ] Design Skill concept (relationship to Tools, how agents discover skills)
- [ ] Define Skill schema and API
- [ ] Add `skills` to connect/config response
- **Status**: Needs design discussion

### P4 — Future

#### P4-1: AgentProcessor + NOTI Integration
- [ ] Create `AgentProcessor` to consume events from `agents.queue`
- [ ] Bridge to NOTI service for agent lifecycle notifications
- **Dependency**: NOTI service must be tested first

#### P4-2: Instruction Merging
- [ ] Implement global (org-level) + agent-specific + context instruction merging
- **Status**: After v1.0 upgrades complete

---

## Notes

- Migration for existing data: `status: 'active'` → `inactive` (agent reconnects to become `idle`)
- All docs in `docs/aiwm/agents/` referencing old status values need updating after P0-1
- Frontend needs to update status display and filters after status redesign
