# Agent Module - v1.0 Roadmap

> Last updated: 2026-02-23
> Status: P0 completed — P1 next

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

### P1 — Important Improvements

#### P1-1: Validate nodeId for Managed Agents
- [ ] In `create()`: Validate nodeId exists in DB
- [ ] Check node status === `'online'`
- [ ] Check `lastHeartbeat` within 10 minutes
- [ ] Throw `BadRequestException` with clear message if validation fails

#### P1-2: Regenerate Credentials → Notify Node
- [ ] After regenerating secret, send `agent.update` (or `agent.restart`) via WebSocket to node
- [ ] Include new secret in the WS payload so node can reconnect

#### P1-3: CORS Cleanup
- [ ] Remove CORS config from `ChatGateway` (already commented out)
- [ ] Remove or make env-conditional CORS in `NodeGateway`

### P2 — Planned (Needs Coordination)

#### P2-1: Heartbeat Response — Work + ScheduledJob
- [ ] When agent reports `idle`, query pending work for this agent
- [ ] Return `work` object (from Work module's priority function)
- [ ] Return `scheduledJob` object (from SHD service)
- **Dependency**: SHD service must be deployed and tested first
- **Status**: Noted for later implementation

#### P2-2: Skills
- [ ] Design Skill concept (relationship to Tools, how agents discover skills)
- [ ] Define Skill schema and API
- [ ] Add `skills` to connect/config response
- **Status**: Needs design discussion

### P3 — Future

#### P3-1: AgentProcessor + NOTI Integration
- [ ] Create `AgentProcessor` to consume events from `agents.queue`
- [ ] Bridge to NOTI service for agent lifecycle notifications
- **Dependency**: NOTI service must be tested first

#### P3-2: Instruction Merging
- [ ] Implement global (org-level) + agent-specific + context instruction merging
- **Status**: After v1.0 upgrades complete

---

## Notes

- Migration for existing data: `status: 'active'` → `inactive` (agent reconnects to become `idle`)
- All docs in `docs/aiwm/agents/` referencing old status values need updating after P0-1
- Frontend needs to update status display and filters after status redesign
