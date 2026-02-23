# Instruction Module - Technical Overview

> Last updated: 2026-02-23

## 1. File Structure

```
services/aiwm/src/modules/instruction/
├── instruction.schema.ts      # MongoDB schema (extends BaseSchema)
├── instruction.dto.ts         # DTOs: Create, Update
├── instruction.service.ts     # Business logic (extends BaseService)
├── instruction.controller.ts  # REST API endpoints
└── instruction.module.ts      # NestJS module (imports: AgentModule for dependency check)
```

## 2. Schema Fields

```
Instruction extends BaseSchema:
  name: string (required, 1-200 chars)
  description?: string (max 1000 chars)
  systemPrompt: string (required, min 10 chars)
  guidelines: string[] (default: []) — DEPRECATED, see ROADMAP P0-1
  tags: string[] (default: [])
  status: 'active' | 'inactive' (default: 'active')
  // Inherited from BaseSchema: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

**Indexes:**
```typescript
InstructionSchema.index({ status: 1, createdAt: -1 });
InstructionSchema.index({ tags: 1 });
InstructionSchema.index({ name: 'text', description: 'text' }); // Text search
```

## 3. Status Lifecycle

| Status | Meaning | Default |
|--------|---------|---------|
| `active` | Can be assigned to agents | Yes (on create) |
| `inactive` | Disabled — cannot assign to new agents | — |

**State transitions:**
```
create      → active (default)
user update → inactive  (BLOCKED if used by active agents → 409)
user update → active    (from inactive, always allowed)
soft delete → isDeleted (BLOCKED if used by active agents → 409)
```

## 4. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/instructions` | User JWT | Create instruction |
| GET | `/instructions` | User JWT | List with pagination + statistics (byStatus) |
| GET | `/instructions/:id` | User JWT | Get by ID |
| PUT | `/instructions/:id` | User JWT | Update. Cannot deactivate if used by active agents → 409 |
| DELETE | `/instructions/:id` | User JWT | Soft delete. Cannot delete if used by active agents → 409 |

### List Response

```json
{
  "data": [...],
  "pagination": { "total", "page", "limit", "totalPages" },
  "statistics": {
    "total": 25,
    "byStatus": { "active": 20, "inactive": 5 },
    "byType": {}
  }
}
```

> Note: `byType` is always empty `{}` — no type concept exists in Instruction. See ROADMAP P1-1.

## 5. Business Logic

### Dependency Guard

`checkActiveAgentDependencies(instructionId)` — queries Agent model:
```
Agent.find({ instructionId: id, isDeleted: false })
```
Returns `[{ id, name }]` of agents referencing this instruction.

Called before:
- `update()` — when `status` is being changed to `'inactive'`
- `softDelete()` — always

If agents found → throws `InstructionInUseException` (from `@hydrabyte/shared`) → HTTP 409 with:
```json
{
  "statusCode": 409,
  "details": { "activeAgents": [{ "id", "name" }], "action": "deactivate" | "delete" }
}
```

### findAll() Filter Cleanup

`findAll()` overrides the base method to strip `null / "" / undefined` values from the filter before querying. This prevents empty filter fields from breaking the query.

## 6. How Instruction is Used by Agents

`AgentService.buildInstructionObjectForAgent(agent)` — called in `connect()` and `getAgentConfig()`:

```typescript
// Returns:
{
  id: string;
  systemPrompt: string;
  guidelines: string[];  // ← Will be removed per ROADMAP P0-1
}
```

This object is included in `AgentConnectResponseDto.instruction` and sent to the agent on connect/config.

## 7. Dependencies

- **AgentModule** (imported): Provides `AgentModel` for dependency checks before deactivate/delete
- **InstructionService** (exported): Used by `AgentService` to build instruction object for connect/config responses

## 8. Queue Events

None. Instruction module does not produce or consume BullMQ events.

## 9. Related Modules

- **Agent module** (`src/modules/agent/`): References `instructionId` in schema. Calls `buildInstructionObjectForAgent()` to build instruction payload for `connect()` and `getAgentConfig()`. Validates dependency before deactivate/delete via `InstructionService`.

## 10. Existing Documentation

- `docs/aiwm/instruction-frontend-guide.md` — Frontend integration guide (API spec, UI components, validation rules)
