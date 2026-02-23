# Guardrail Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/aiwm/src/modules/guardrail/
├── guardrail.schema.ts      # MongoDB schema (extends BaseSchema)
├── guardrail.dto.ts         # DTOs: Create, Update
├── guardrail.service.ts     # Business logic (extends BaseService)
├── guardrail.controller.ts  # REST API endpoints
└── guardrail.module.ts      # NestJS module (imports: AgentModule for dependency check)
```

## 2. Schema Fields

```
Guardrail extends BaseSchema:
  name: string (required, 1-200 chars)
  description?: string (max 1000 chars)
  enabled: boolean (default: true)       ← see note on dual disable states
  blockedKeywords: string[] (default: [])
  blockedTopics: string[] (default: [])
  customMessage?: string (max 500 chars) // Shown to user when content is blocked
  tags: string[] (default: [])
  status: 'active' | 'inactive' (default: 'active')
  // Inherited: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

> **Design issue**: Two overlapping "disabled" states — `enabled: boolean` and `status: 'active'|'inactive'`. See ROADMAP P0-1.

**Indexes:**
```typescript
GuardrailSchema.index({ status: 1, enabled: 1, createdAt: -1 });
GuardrailSchema.index({ tags: 1 });
GuardrailSchema.index({ name: 'text', description: 'text' }); // Text search
```

## 3. Status & Enabled

| Field | Values | Meaning |
|-------|--------|---------|
| `status` | `'active'` / `'inactive'` | Lifecycle state (matches other modules) |
| `enabled` | `true` / `false` | Whether guardrail rules are enforced |

Dependency guard blocks update when `enabled → false` OR `status → 'inactive'`, whichever is set.

Both fields are independent on create — possible to have `status: 'active', enabled: false` or vice versa. See ROADMAP P0-1 for cleanup plan.

## 4. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/guardrails` | User JWT | Create guardrail |
| GET | `/guardrails` | User JWT | List with pagination + statistics (byStatus) |
| GET | `/guardrails/:id` | User JWT | Get by ID |
| PUT | `/guardrails/:id` | User JWT | Update. Blocks `enabled=false` or `status=inactive` if used by agents |
| DELETE | `/guardrails/:id` | User JWT | Soft delete. Blocked if used by agents |

> All endpoints require `JwtAuthGuard` (applied at controller level). No `UniverseRole` restriction — any authenticated user can manage guardrails.

## 5. Business Logic

### Dependency Guard

`checkActiveAgentDependencies(guardrailId)` — queries Agent model:
```typescript
Agent.find({ guardrailId: guardrailId.toString(), isDeleted: false })
```

Called before:
- `update()` — when `enabled === false` OR `status === 'inactive'`
- `softDelete()` — always

If agents found → throws **plain `Error`** (not `GuardrailInUseException`) → results in **HTTP 500** instead of proper 409 Conflict. See ROADMAP P0-2.

### findAll() Statistics

Aggregates by `status` only. `byType: {}` always empty (no type field on Guardrail). See ROADMAP P1-1.

## 6. How Guardrail Is Used by Agents

### Managed agents — via WebSocket commands

`guardrailId` is included in the `agent.start` and `agent.update` WebSocket payloads to the node:
```typescript
// agent.start / agent.update payload to node
{
  agentId, name, type, framework, secret,
  instructionId,
  guardrailId,   // ← passed to node
  deploymentId,
  settings,
}
```
The node agent receives `guardrailId` and is expected to fetch + apply guardrail rules.

### Autonomous agents — NOT served

`guardrailId` is **not included** in `AgentConnectResponseDto` or `getAgentConfig()` response. Autonomous agents cannot retrieve their guardrail config via the connect/config API.

### Enforcement — NOT implemented in AIWM

The actual content filtering (checking input/output against `blockedKeywords` and `blockedTopics`) is **not implemented** anywhere in AIWM. The guardrail data is stored and passed as reference ID only.

Planned enforcement points (currently commented out):
- `deployment.service.ts` line 559: `// TODO Phase 3: Apply Guardrails validation`
- `deployment.schema.ts`: `// guardrailId?: string; // Optional guardrail override`

Currently, enforcement responsibility falls on the agent client implementation.

## 7. Dependencies

- **AgentModule** (imported): Provides `AgentModel` for dependency check before disable/delete
- **GuardrailService** (exported): Available to other modules that import `GuardrailModule`

> Note: `GuardrailModule` does NOT export `MongooseModule`. `GuardrailModel` is not accessible from other modules.

## 8. Queue Events

None. Guardrail module does not produce or consume BullMQ events.

## 9. Related Modules

- **Agent module** (`src/modules/agent/`): References `guardrailId?: string` in schema (ref: `'Guardrail'`). Passes `guardrailId` in `agent.start` / `agent.update` WebSocket commands. Index: `AgentSchema.index({ guardrailId: 1 })`.
- **Deployment module** (`src/modules/deployment/`): Planned Phase 3 integration — guardrail validation during inference proxy. Currently TODO/commented out.

## 10. Existing Documentation

None. This is the first documentation for the Guardrail module.
