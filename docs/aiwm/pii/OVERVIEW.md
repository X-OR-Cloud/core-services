# PII Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/aiwm/src/modules/pii/
├── pii.schema.ts      # MongoDB schema (extends BaseSchema)
├── pii.dto.ts         # DTOs: Create, Update
├── pii.service.ts     # Business logic (extends BaseService)
├── pii.controller.ts  # REST API endpoints
└── pii.module.ts      # NestJS module (standalone — no AgentModule dependency)
```

## 2. Purpose

PII module manages **regex-based patterns** for detecting and redacting Personally Identifiable Information (e.g., email addresses, phone numbers, CMND/CCCD, etc.) from text content.

Patterns are stored in MongoDB and intended to be applied to agent inputs/outputs in the inference pipeline. **Enforcement is not yet implemented** — see section 6.

## 3. Schema Fields

```
Pii extends BaseSchema:
  name: string (required)         // e.g., "Email Address", "Phone Number (Vietnam)"
  pattern: string (required)      // Regex as string, e.g., "\\b[A-Za-z0-9._%+-]+@..."
  replacement: string (required, max 100) // e.g., "[EMAIL_REDACTED]"
  description?: string (max 1000)
  status: 'active' | 'inactive' (default: 'active')
  tags: string[] (default: [])    // e.g., ['common', 'gdpr', 'hipaa', 'vietnam']
  // Inherited: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

**Indexes:**
```typescript
PiiSchema.index({ status: 1, enabled: 1, createdAt: -1 });  // ⚠️ BUG: 'enabled' field doesn't exist
PiiSchema.index({ tags: 1 });
PiiSchema.index({ name: 'text', description: 'text' });
```

> **Bug**: Index references `enabled` field which does not exist on schema. See ROADMAP P0-1.

## 4. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/pii-patterns` | User JWT | Create PII pattern |
| GET | `/pii-patterns` | User JWT | List with pagination + statistics (byStatus) |
| GET | `/pii-patterns/active` | User JWT | Get all active patterns for current org (used by detection utility) |
| GET | `/pii-patterns/:id` | User JWT | Get by ID |
| PUT | `/pii-patterns/:id` | User JWT | Update pattern |
| DELETE | `/pii-patterns/:id` | User JWT | Soft delete |

> Route order: `GET /pii-patterns/active` is declared before `GET /pii-patterns/:id` in controller — correct order to prevent NestJS routing conflict.

> No `UniverseRole` restriction — any authenticated user can manage PII patterns.

> No dependency guard — patterns can be deleted freely (no direct `piiPatternId` reference on Agent schema).

## 5. Service Methods

### `findAll(options, context)`
Standard paginated list. Returns `statistics: { total, byStatus, byType: {} }`.
- `byType` always empty — no type field on PII schema.

### `getActivePatterns(context)`
Queries:
```typescript
Pii.find({
  status: 'active',
  enabled: true,      // ⚠️ BUG: 'enabled' field doesn't exist → always returns []
  isDeleted: false,
  'owner.orgId': context.orgId,
})
```

> **Bug**: `enabled: true` filter always excludes all documents because the `enabled` field doesn't exist in the schema — documents have `enabled: undefined`, which doesn't match `true`. This endpoint **always returns an empty array**. See ROADMAP P0-1.

## 6. Enforcement Status — NOT Implemented

PII redaction is **not wired into any pipeline**. The patterns are stored but never applied.

Integration points currently commented out in `deployment.service.ts`:
```typescript
// TODO Phase 2: Redact PII from request
// const sanitizedBody = await this.piiService.redact(req.body, context);
```

And in `deployment.schema.ts`:
```typescript
// TODO Phase 3: PII & Guardrails
// piiEnabled?: boolean; // Enable/disable PII redaction for this deployment
```

`PiiService` has no `redact()` method — only CRUD + `getActivePatterns()`.

## 7. Pattern Storage Design

- `pattern` is stored as a **raw string** (not compiled RegExp)
- No validation that `pattern` is a valid regex on create/update
- Agent client or AIWM redaction utility is responsible for compiling: `new RegExp(pattern, 'g')`
- `replacement` is the literal string substituted for each match (e.g., `[EMAIL_REDACTED]`)

## 8. Dependencies

- No external module dependencies (standalone)
- **PiiService** (exported): Available to other modules that import `PiiModule`
- `PiiModule` does not export `MongooseModule`

## 9. Queue Events

None. PII module does not produce or consume BullMQ events.

## 10. Related Modules

- **Deployment module** (`src/modules/deployment/`): Planned integration — PII redaction in inference proxy before forwarding request to LLM. Currently commented out (Phase 2/3 TODO).

## 11. Existing Documentation

None. This is the first documentation for the PII module.
