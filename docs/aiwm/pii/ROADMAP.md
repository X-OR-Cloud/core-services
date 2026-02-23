# PII Module - Roadmap

> Last updated: 2026-02-24
> Status: Planning — awaiting implementation

---

## Implementation Plan

### P0 — Must Fix (Bugs)

#### P0-1: Remove `enabled` Field References — Schema Has No Such Field

The schema defines only `status: 'active'|'inactive'`. There is NO `enabled` field. Two places reference it incorrectly:

**Bug A — `getActivePatterns()` always returns empty:**
```typescript
// pii.service.ts
Pii.find({
  status: 'active',
  enabled: true,       // ← field doesn't exist → matches nothing
  isDeleted: false,
  'owner.orgId': context.orgId,
})
// Fix: remove 'enabled: true' filter
```

**Bug B — Index on non-existent field:**
```typescript
// pii.schema.ts
PiiSchema.index({ status: 1, enabled: 1, createdAt: -1 });
// Fix:
PiiSchema.index({ status: 1, createdAt: -1 });
```

**Tasks:**
- [ ] `pii.service.ts`: Remove `enabled: true` from `getActivePatterns()` query
- [ ] `pii.schema.ts`: Fix index — remove `enabled: 1` → `{ status: 1, createdAt: -1 }`

#### P0-2: Add Regex Validation to `pattern` Field

`pattern` is stored as a string with no validation that it's a valid regex. An invalid pattern causes a runtime `SyntaxError` when compiled with `new RegExp(pattern)`.

- [ ] Add custom validator in `CreatePiiDto` and `UpdatePiiDto`:
  ```typescript
  @Matches(/.*/)  // placeholder — use custom @IsValidRegex() decorator
  pattern: string;
  ```
- [ ] Or: add validation in `PiiService.create()` / `update()`:
  ```typescript
  try { new RegExp(pattern); } catch { throw new BadRequestException('Invalid regex pattern'); }
  ```
- [ ] Return clear `400 Bad Request` with message: `"pattern" is not a valid regular expression`

#### P0-3: Remove `byType: {}` Placeholder from Statistics

`findAll()` returns `statistics.byType: {}` but PII has no `type` field.

- [ ] Remove `byType` key from statistics object in `findAll()`

### P1 — Important Improvements

#### P1-1: Implement `PiiService.redact(text, context)` Method

Core utility method for applying active PII patterns to a text string. Required before any pipeline integration.

```typescript
async redact(text: string, context: RequestContext): Promise<{
  redacted: string;
  matches: Array<{ pattern: string; count: number }>;
}> {
  const patterns = await this.getActivePatterns(context);
  let result = text;
  const matches = [];

  for (const pii of patterns) {
    const regex = new RegExp(pii.pattern, 'g');
    const count = (result.match(regex) || []).length;
    if (count > 0) {
      result = result.replace(regex, pii.replacement);
      matches.push({ pattern: pii.name, count });
    }
  }

  return { redacted: result, matches };
}
```

- [ ] Implement `redact(text, context)` in `PiiService`
- [ ] Handle regex compilation errors gracefully (skip invalid patterns, log warning)
- [ ] Return match metadata for audit purposes

#### P1-2: Add `POST /pii-patterns/redact` Test Endpoint

Expose a test endpoint so admins can test how active patterns redact sample content — similar to Guardrail's planned validate endpoint.

- [ ] `POST /pii-patterns/redact` — body: `{ text: string }` → response: `{ redacted: string, matches: [...] }`
- [ ] Requires JWT auth
- [ ] Uses `getActivePatterns()` for current org

#### P1-3: Scope Clarification — Org vs System Patterns

Currently PII patterns are scoped to `owner.orgId` (via BaseSchema). This means:
- Each org manages its own patterns
- No shared system-level patterns (e.g., standard email regex all orgs should use)

**Decision needed**: Should there be a library of system-level patterns (scope: 'public') shared across orgs?

- [ ] Evaluate: add `scope: 'system' | 'org'` field
- [ ] `getActivePatterns()` should return both org-owned AND system patterns
- [ ] System patterns managed by universe admins only

### P2 — Planned (Needs Coordination)

#### P2-1: Wire into Deployment Inference Proxy

`deployment.service.ts` has a commented-out Phase 2 TODO:
```typescript
// const sanitizedBody = await this.piiService.redact(req.body, context);
```

**After P1-1 is done:**
- [ ] Import `PiiModule` into `DeploymentModule`
- [ ] Add `piiEnabled?: boolean` field to `Deployment` schema (currently commented out)
- [ ] In `DeploymentService.proxyInference()`: if `deployment.piiEnabled`, call `piiService.redact()` on request body before forwarding
- [ ] Optionally: also redact LLM response before returning to client
- [ ] Log redaction events (pattern name, count) — not the content itself

#### P2-2: Per-Agent PII Configuration

Currently no link between Agent and PII patterns. An agent's conversation content could be redacted based on its org's active patterns, but there's no agent-level control.

Options:
- **Option A**: All active org patterns always applied (implicit, no per-agent config)
- **Option B**: Agent has `piiEnabled: boolean` field to opt in/out
- **Option C**: Agent has `piiPatternIds: string[]` — explicit whitelist of patterns

- [ ] Decide on model (requires discussion)
- [ ] Implement after Deployment integration (P2-1) is stable

#### P2-3: PII Audit Log

When content is redacted, record what was matched (pattern name + count, NOT the actual PII value) for compliance/audit purposes.

- [ ] Design `PiiAuditLog` schema: `{ patternsMatched[], agentId?, deploymentId?, timestamp, orgId }`
- [ ] Write log in `redact()` method
- [ ] Query API for Reports/compliance use

### P3 — Future

#### P3-1: Seed System Patterns

Provide a library of pre-built common patterns.

- [ ] Create seed script: `scripts/seed-pii-patterns.ts`
- [ ] Include standard patterns:
  - Email (`[EMAIL]`)
  - Vietnam phone numbers (`[PHONE_VN]`)
  - Vietnam CCCD/CMND (`[ID_VN]`)
  - Credit card numbers (`[CARD]`)
  - IP addresses (`[IP]`)
  - URLs with personal tokens (`[URL_TOKEN]`)
- [ ] Tag with `['system', 'common']`, `['vietnam']`, `['gdpr']`, `['hipaa']` as appropriate
- [ ] Idempotent: skip if name already exists

#### P3-2: Pattern Testing Utility

Lightweight utility for testing patterns locally before saving:
- [ ] `POST /pii-patterns/test` — body: `{ pattern, replacement, sampleText }` → response: `{ result, matchCount, isValidRegex }`
- [ ] Does NOT save to DB — stateless test only

---

## Notes

- `GET /pii-patterns/active` route must stay **before** `GET /pii-patterns/:id` in controller to prevent routing conflict. Current order is correct — do not reorder.
- `IsBoolean` is imported in `pii.dto.ts` but never used — can be removed in a cleanup pass.
- `pattern` field has no `maxlength` constraint in schema or DTO — consider adding (e.g., 2000 chars) to prevent abuse.
