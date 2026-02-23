# Instruction Module - Roadmap

> Last updated: 2026-02-23
> Status: Planning — awaiting implementation

## Decisions Made

### Remove `guidelines` Field (D1)

`guidelines: string[]` is redundant. All agent behavioral rules should be written into `systemPrompt` as a single coherent text. Having a separate array complicates the API, the frontend form, and the agent connect response without adding real value.

**Decision**: Remove `guidelines` from schema, DTOs, and all downstream references.

**Impact scope:**

| File | Change |
|------|--------|
| `instruction.schema.ts` | Remove `guidelines` `@Prop` |
| `instruction.dto.ts` | Remove `guidelines` from `CreateInstructionDto` and `UpdateInstructionDto` |
| `agent.service.ts` | `buildInstructionObjectForAgent()`: remove `guidelines` from return type and value |
| `agent.dto.ts` | `AgentConnectResponseDto.instruction`: remove `guidelines: string[]` field |
| `agent/OVERVIEW.md` | Update Connect Response Structure section |
| `instruction-frontend-guide.md` | Remove all references to `guidelines` field |

**Migration**: Existing data with `guidelines` values → no migration needed. Old data simply stops being served. The field will be ignored by schema after removal (MongoDB allows extra fields). For a clean drop, a migration script can unset the field on all documents (non-urgent).

---

## Implementation Plan

### P0 — Must Fix (Foundation)

#### P0-1: Remove `guidelines` Field

- [ ] `instruction.schema.ts`: Delete `guidelines` `@Prop` declaration
- [ ] `instruction.dto.ts`: Delete `guidelines` field from `CreateInstructionDto`
- [ ] `instruction.dto.ts`: Delete `guidelines` field from `UpdateInstructionDto`
- [ ] `agent.service.ts`: Update `buildInstructionObjectForAgent()` return type — remove `guidelines` from interface and return value
- [ ] `agent.dto.ts`: Remove `guidelines: string[]` from `AgentConnectResponseDto.instruction` inline type
- [ ] Update `agent/OVERVIEW.md` — Connect Response Structure: remove `guidelines[]`
- [ ] Update `instruction-frontend-guide.md` — remove all `guidelines` references

### P1 — Important Improvements

#### P1-1: Remove `byType` from Statistics

`findAll()` returns `statistics.byType: {}` but Instruction has no type concept. This is leftover from copy-pasting Node/Agent pattern.

- [ ] Remove `byType` from statistics object in `findAll()`
- [ ] Update API response docs

#### P1-2: Filter Cleanup — Move to BaseService

`findAll()` currently strips `null / "" / undefined` from filter inline. This logic should live in `BaseService.findAll()` to benefit all modules.

- [ ] Evaluate if `BaseService` already handles this (check `libs/base/`)
- [ ] If not: raise issue in base library — add filter cleanup there
- [ ] Remove inline filter cleanup from `InstructionService.findAll()` once base handles it

#### P1-3: Dependency Check — Include isDeleted Guard

`checkActiveAgentDependencies()` queries:
```typescript
Agent.find({ instructionId, isDeleted: false })
```

This is correct. But `status` is not checked — a `suspended` or `inactive` agent still blocks deletion. Verify this is the intended behavior (instruction "in use" = has any non-deleted agent, regardless of agent status).

- [ ] Confirm requirement: should `suspended` agents block deletion?
- [ ] Update query if needed (e.g., only block if agent `status` is `idle` or `busy`)
- [ ] Document the decision here

### P2 — Planned

#### P2-1: Instruction Versioning

Currently, updating an instruction's `systemPrompt` changes it globally for all agents immediately. No history.

- [ ] Design: should we track instruction version history?
- [ ] Option A: Add `version: number` field + keep history in separate collection
- [ ] Option B: Immutable instructions — create new one per change, agents reference by ID
- **Status**: Needs design discussion

#### P2-2: Instruction Merging (Global + Agent-specific)

See `agent/ROADMAP.md` P3-2. Allows combining org-level system prompt with agent-specific instruction at runtime.

- **Dependency**: Agent module P3-2 design must be finalized first

### P3 — Future

#### P3-1: Queue Events

Instruction module currently emits no BullMQ events. If we need notifications or audit trail:
- [ ] Add `InstructionProducer` with `instruction.created`, `instruction.updated`, `instruction.deleted`
- **Dependency**: NOTI service integration design

#### P3-2: Data Migration — Drop `guidelines` from Existing Documents

After P0-1 is deployed:
- [ ] Write migration script: `db.instructions.updateMany({}, { $unset: { guidelines: '' } })`
- [ ] Run in staging first, then production
- **Note**: Non-urgent — extra fields in MongoDB are ignored by Mongoose after schema removal

---

## Notes

- `checkActiveAgentDependencies` uses `instructionId.toString()` for comparison — verify this works correctly when `instructionId` is stored as ObjectId vs string in Agent schema
- `instruction-frontend-guide.md` is outdated (last updated 2025-01-15) — needs full review after P0-1 is done
