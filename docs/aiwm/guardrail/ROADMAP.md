# Guardrail Module - Roadmap

> Last updated: 2026-02-24
> Status: Planning — awaiting implementation

## Decisions Made

### Enforcement Model (D1)

Guardrail rules (`blockedKeywords`, `blockedTopics`) are not enforced inside AIWM today. The `Deployment` module has a Phase 3 TODO for inference-level validation. Until then, enforcement is the agent client's responsibility.

**Decision**: Keep data model as-is. Implement enforcement in the Deployment inference proxy (Phase 3) as planned. Document clearly that enforcement is not yet active.

---

## Implementation Plan

### P0 — Must Fix

#### P0-1: Consolidate Dual Disable States

Schema has two overlapping fields for "disabled":
- `enabled: boolean` — original field
- `status: 'active' | 'inactive'` — added to match other modules

This creates ambiguity:
- A guardrail can be `status: 'active', enabled: false` — what does that mean?
- Frontend must track two separate fields
- Dependency guard already checks both, adding complexity

**Decision options** (pick one — needs discussion):

**Option A — Remove `enabled`, keep only `status`:**
- Drop `enabled` from schema and DTOs
- `status: 'active'` = enabled, `status: 'inactive'` = disabled
- Consistent with Instruction/Tool/Agent modules

**Option B — Remove `status`, keep only `enabled`:**
- Drop `status` from schema and DTOs
- `enabled: true/false` for all state management
- Less consistent with other modules

**Recommendation**: Option A — remove `enabled`, use `status` only. Consistent with the rest of the codebase.

**Tasks (after decision):**
- [ ] Remove `enabled` `@Prop` from `guardrail.schema.ts`
- [ ] Remove `enabled` from `CreateGuardrailDto` and `UpdateGuardrailDto`
- [ ] Update `update()` in `guardrail.service.ts`: remove `enabled === false` check, keep only `status === 'inactive'` check
- [ ] Update index: `{ status: 1, enabled: 1, createdAt: -1 }` → `{ status: 1, createdAt: -1 }`
- [ ] Data migration: set `status: 'inactive'` for all documents where `enabled: false`

#### P0-2: Fix Error Type — Use Proper HTTP Exception

`guardrail.service.ts` throws plain `Error` on dependency guard failure:
```typescript
// CURRENT — results in HTTP 500
throw new Error(`Cannot disable guardrail: it is currently used by ...`);

// CORRECT — HTTP 409
throw new ConflictException({ ... }) // or GuardrailInUseException from @hydrabyte/shared
```

Unlike Instruction (uses `InstructionInUseException`) and Tool (uses `ToolInUseException`), Guardrail has no custom exception class and throws a plain `Error`.

- [ ] Check if `GuardrailInUseException` exists in `@hydrabyte/shared` — if not, create it
- [ ] Replace both `throw new Error(...)` in `update()` and `softDelete()` with `throw new GuardrailInUseException(activeAgents, action)`
- [ ] Response format should match Instruction/Tool: `{ statusCode: 409, details: { activeAgents, action } }`

### P1 — Important Improvements

#### P1-1: Add Guardrail to Agent Connect/Config Response

Autonomous agents currently receive no guardrail config when they call `POST /agents/:id/connect` or `GET /agents/:id/config`. Only managed agents get `guardrailId` via WebSocket `agent.start` command.

- [ ] Fetch guardrail document in `buildGuardrailForAgent(agent)` method (similar to `buildInstructionObjectForAgent`)
- [ ] Add `guardrail` field to `AgentConnectResponseDto`
- [ ] Include in `connect()` response and `getAgentConfig()` response
- [ ] Response shape (minimal):
  ```typescript
  guardrail?: {
    id: string;
    blockedKeywords: string[];
    blockedTopics: string[];
    customMessage?: string;
  }
  ```
- [ ] Return `null` if agent has no `guardrailId`

#### P1-2: Remove `byType: {}` Placeholder from Statistics

`findAll()` returns `statistics.byType: {}` but Guardrail has no `type` field. Misleading for API consumers.

- [ ] Remove `byType` key from statistics object in `findAll()`

#### P1-3: Add `byEnabled` or `byStatus` Breakdown

Current statistics only aggregate by `status`. After P0-1 removes `enabled`, the stats object will just have `byStatus`. Consider also adding a count of how many guardrails are actively referenced by agents.

- [ ] After P0-1: verify `statistics.byStatus` is sufficient
- [ ] Optional: add `inUseCount` — count of guardrails referenced by at least one non-deleted agent

### P2 — Planned (Needs Coordination)

#### P2-1: Guardrail Enforcement in Deployment Inference Proxy

`deployment.service.ts` has a Phase 3 TODO for applying guardrail validation during inference:
```typescript
// TODO Phase 3: Apply Guardrails validation
// if (deployment.guardrailId) {
//   await this.guardrailService.validate(sanitizedBody, deployment.guardrailId, context);
// }
```

- [ ] Design `GuardrailService.validate(content, guardrailId)` method
  - Check content against `blockedKeywords` (substring match or regex)
  - Check content against `blockedTopics` (semantic or keyword-based)
  - Return `{ blocked: boolean, reason?: string, customMessage?: string }`
- [ ] Uncomment and implement in `DeploymentService.proxyInference()`
- [ ] Apply to both request (user input) and response (model output)
- **Dependency**: Deployment module inference proxy must be functional first

#### P2-2: Guardrail Validation Endpoint

Expose a test endpoint so frontend / admins can test guardrail rules against sample content without going through an agent.

- [ ] `POST /guardrails/:id/validate` — body: `{ content: string }` → response: `{ blocked: boolean, matches: string[], customMessage? }`
- [ ] Useful for building/testing guardrail configs before assigning to agents

#### P2-3: Queue Events

Currently no BullMQ events. If audit trail or notifications needed:
- [ ] Add `GuardrailProducer` with `guardrail.created`, `guardrail.updated`, `guardrail.deleted`
- **Dependency**: NOTI service integration

### P3 — Future

#### P3-1: Advanced Filtering Rules

Current implementation only supports flat keyword/topic lists. Future enhancements:
- [ ] Regex patterns support (e.g., `blockedPatterns: string[]`)
- [ ] Severity levels: `warn` (log but allow) vs `block` (reject)
- [ ] Per-direction rules: input-only, output-only, or both
- [ ] PII detection integration (PII module)

#### P3-2: Deployment-Level Guardrail Override

`deployment.schema.ts` has a commented-out `guardrailId` field for deployment-level override:
```typescript
// guardrailId?: string; // Optional guardrail override for this deployment
```
This would allow different guardrail policies per deployment, overriding the agent-level one.

- [ ] Evaluate: agent-level guardrail vs deployment-level override precedence
- [ ] If needed: uncomment field, add to deployment DTOs and inference proxy logic

---

## Notes

- `GuardrailModule` exports only `GuardrailService`, not `MongooseModule`. If another module needs to query `GuardrailModel` directly, they must import `GuardrailModule` and access it via `GuardrailService` methods.
- The field `customMessage` is stored but not used anywhere in AIWM currently. It's intended to be returned to the end-user when content is blocked — implement as part of P2-1.
- `blockedKeywords` and `blockedTopics` are separate arrays with no semantic difference in the schema. The distinction (exact keyword vs broad topic) is left to the enforcement implementation.
