# CBM Skill Module — Plan

**Date:** 2026-04-07
**Status:** Approved — ready to implement

---

## 1. Problem & Goal

### Why replace MCP

MCP injects all tool schemas into context upfront (~15,000–20,000 tokens for 50+ tools).
Agent must scan the full tool list each time to pick the right one — slow and token-heavy.

### Target architecture

```
Agent → AIWM /connect → { instructions, skills: [{ name: "cbm", url, token }] }
Agent Runner → GET /skill (with JWT) → Skill Manifest (files[])
Agent Runner → writes files to {base_skill_dir}/cbm/
Agent → reads skill → calls CBM API directly via HTTP (no AIWM proxy)
```

**Expected improvements:**
- ~5x token reduction (3,000 vs 15,000+ tokens)
- Faster responses (follow recipe vs scan tool list)
- CBM owns its skill — AIWM only stores the URL
- Skill auto-updates when API changes (dynamic generation)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CBM Service                          │
│                                                          │
│  GET /skill  ←── SkillModule (JWT required)              │
│                    │                                     │
│                    ├── SkillGeneratorService             │
│                    │     ├── read OpenAPI spec (Swagger) │
│                    │     ├── scan all *.skill.md files   │
│                    │     └── build file manifest         │
│                    │                                     │
│                    └── SkillService (in-memory cache)    │
│                          ├── TTL: 1h                     │
│                          └── invalidated on startup      │
│                                                          │
│  src/cbm.skill.md                    ← service-level    │
│  src/modules/invoice/invoice.skill.md ← module-level    │
│  src/modules/expense/expense.skill.md                    │
│  ...                                                     │
└──────────────────────┬──────────────────────────────────┘
                       │ SkillManifest { files[] }
                       ↓
┌─────────────────────────────────────────────────────────┐
│                  Agent Runner                            │
│                                                          │
│  1. Receives skill_url + token from AIWM /connect        │
│  2. GET /skill → SkillManifest                           │
│  3. Compares version with cached version                 │
│  4. If changed: writes files to {base_skill_dir}/cbm/    │
│  5. Agent loads SKILL.md as skill entry point            │
│  6. Agent calls CBM API directly (Bearer token)          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Naming Convention

| Component | Name | Reason |
|---|---|---|
| NestJS module | `SkillModule` | No conflict with `AgentModule` in AIWM |
| Endpoint | `GET /skill` | Clean, predictable — same pattern for all services |
| Business logic file | `<module>.skill.md` | Lives next to module, developer-maintained |
| Service-level file | `src/cbm.skill.md` | Cross-module workflows and auth context |

> **System-wide convention:** Any service (CBM, IAM, etc.) can expose `GET /skill`
> in the same format — AIWM only needs to store the URL.

---

## 4. Skill Manifest — Response Format

`GET /skill` returns a file manifest. The Agent Runner uses this to recreate
the full skill directory locally:

```json
{
  "name": "cbm",
  "version": "sha256:a3f9c2...",
  "description": "Core Business Management — Projects, CRM, Finance",
  "generated_at": "2026-04-07T10:00:00.000Z",
  "base_url": "https://cbm.hydrabyte.ai",
  "auth": {
    "type": "bearer",
    "header": "Authorization",
    "note": "Token auto-scopes all data to orgId — no need to pass orgId explicitly"
  },
  "files": [
    {
      "path": "SKILL.md",
      "content": "---\nname: cbm\ndescription: ...\n---\n# CBM Skill\n...",
      "checksum": "sha256:b1e2...",
      "executable": false
    },
    {
      "path": "references/api-reference.md",
      "content": "# CBM API Reference\n...",
      "checksum": "sha256:c3d4...",
      "executable": false
    },
    {
      "path": "references/invoice.md",
      "content": "## Invoice\n### State Machine\n...",
      "checksum": "sha256:d5e6...",
      "executable": false
    }
  ]
}
```

---

## 5. Skill Directory Structure (generated)

When Agent Runner writes the manifest to disk:

```
{base_skill_dir}/cbm/
  SKILL.md                       ← entry point: triggers, workflow, auth instructions
  references/
    api-reference.md             ← auto-compressed from OpenAPI spec
    workflows.md                 ← from cbm.skill.md (cross-module workflows)
    project.md                   ← from project.skill.md
    work.md                      ← from work.skill.md
    invoice.md                   ← from invoice.skill.md
    expense.md                   ← from expense.skill.md
    payment.md                   ← from payment.skill.md
    transaction.md               ← from transaction.skill.md
    company.md                   ← from company.skill.md
    contact.md                   ← from contact.skill.md
    interaction.md               ← from interaction.skill.md
    document.md                  ← from document.skill.md
    error-guide.md               ← common errors + agentHints (auto-generated)
```

This structure mirrors local skills (`skills/cbm-module/`, `skills/hydra-backend/`)
so Agent Runner handles all skills the same way — local or remote.

---

## 6. Content Sources for Generated Files

### SKILL.md (entry point)

Generated from `src/cbm.skill.md` + config:

```markdown
---
name: cbm
description: Core Business Management — Projects, CRM, Finance
triggers:
  - create project
  - create invoice
  - manage expense
  - cbm
---

# CBM Skill

Manage Projects, CRM (Company/Contact/Interaction), and Finance
(Invoice/Expense/Payment/Transaction) for your organization.

## Auth
All API calls require: `Authorization: Bearer {jwt_token}`
Data is automatically scoped to your organization — no orgId param needed.
Base URL: {CBM_BASE_URL}

## When to use which reference
- Project/Work/Document → see references/project.md, work.md, document.md
- CRM → see references/company.md, contact.md, interaction.md
- Finance → see references/invoice.md, expense.md, payment.md
- Transaction history → see references/transaction.md
- Cross-module workflows → see references/workflows.md
- API endpoint list → see references/api-reference.md
- Troubleshooting → see references/error-guide.md
```

### references/api-reference.md (auto from OpenAPI)

SkillGeneratorService compresses the Swagger spec into an agent-readable format:

```markdown
# CBM API Reference

## Projects
POST   /projects                — Create project
GET    /projects                — List (search, filter by status)
GET    /projects/:id            — Get by ID
PATCH  /projects/:id            — Update
DELETE /projects/:id            — Soft delete
POST   /projects/:id/activate   — [action] draft → active
POST   /projects/:id/complete   — [action] active → completed

### POST /projects
Request: { name*, description, tags[], memberIds[] }
Response 201: { id, name, status: "draft", createdAt, ... }
Response 400: validation error — check required fields
Response 403: insufficient permissions

## Invoices
POST   /invoices                — Create invoice (auto status: draft)
GET    /invoices                — List (search, filter by status, contactId)
GET    /invoices/:id            — Get by ID
PATCH  /invoices/:id            — Update (draft only)
DELETE /invoices/:id            — Soft delete (draft/cancelled only)
POST   /invoices/:id/send       — [action] draft → sent
POST   /invoices/:id/mark-overdue — [action] sent/partial → overdue
POST   /invoices/:id/cancel     — [action] any → cancelled
POST   /invoices/:id/reopen     — [action] cancelled → draft
PATCH  /invoices/:id/e-invoice  — Link e-invoice provider record

### POST /invoices
Request: {
  contactId*,        // string — required
  companyId,         // string — optional
  items*: [{ name, quantity, unitPrice: { currency, value } }],
  dueDate,           // ISO date string
  notes
}
Response 201: { id, code: "INV-2026-0001", status: "draft", ... }
...
```

### references/<module>.md (from `*.skill.md`)

Each module's `.skill.md` contributes one reference file.
Content describes **why and how** — not duplicating what Swagger already says.

```markdown
## Invoice

Manages outgoing sales invoices.

### State Machine
draft → sent → partial → paid
           ↓         ↓
        overdue   overdue
(any except paid) → cancelled
cancelled → draft (reopen)

### Workflows

#### Create and send invoice
1. POST /invoices — creates draft, auto-assigns code INV-YYYY-NNNN
2. POST /invoices/:id/send — sends to customer (status: sent)
3. POST /payments — record payment (auto-updates invoice status)

#### Handle overdue invoice
- POST /invoices/:id/mark-overdue — only when status = sent or partial
- To send payment reminder: update notes then re-fetch invoice for contact info

### Business Rules
- Cannot update invoice after status = sent
- Cannot delete invoice when status = sent or paid
- items[] must not be empty
- Payment currency must match invoice currency
- Invoice code is auto-generated (INV-YYYY-NNNN) — do not set manually

### Agent Hints
- Error 400 "invalid status transition": check current status, use allowedActions[] in error response
- Error 409 on payment: invoice is already fully paid
- To reopen a cancelled invoice: POST /invoices/:id/reopen → status back to draft
- Partial payment: status becomes "partial" automatically after first payment
```

### references/error-guide.md (auto-generated)

```markdown
# CBM Error Guide

## Common HTTP Errors

### 400 Bad Request
- `validation error`: Check request body against api-reference.md schema
- `invalid status transition`: Read `currentStatus` and `allowedActions` fields in error response
- `items must not be empty`: Add at least one item to the array

### 403 Forbidden
- You are not a member or lead of this project
- Check `leadIds` in error response — contact them for access

### 404 Not Found
- Resource does not exist or was soft-deleted
- Verify the ID is correct

### 409 Conflict
- Duplicate: resource with same identifier already exists
- For payments: invoice is already fully paid

## Error Response Structure
{
  "statusCode": number,
  "message": string,
  "agentHint": string,      // What to do next
  "allowedActions": string[], // Valid actions for current state (if applicable)
  "currentStatus": string     // Current entity status (if applicable)
}
```

---

## 7. SkillModule Implementation

### File structure in CBM

```
src/
  skill/
    skill.module.ts
    skill.controller.ts         ← GET /skill (JWT required)
    skill.service.ts            ← cache management
    skill-generator.service.ts  ← builds file manifest from OpenAPI + *.skill.md
    skill.types.ts              ← SkillManifest, SkillFile interfaces
  cbm.skill.md                  ← service-level entry content
```

### skill.types.ts

```typescript
export interface SkillFile {
  path: string;       // relative path within skill directory
  content: string;    // file content (markdown or text)
  checksum: string;   // sha256 of content — for incremental update
  executable: boolean;
}

export interface SkillManifest {
  name: string;
  version: string;       // sha256 of all file checksums combined
  description: string;
  generated_at: string;
  base_url: string;
  auth: {
    type: 'bearer';
    header: 'Authorization';
    note: string;
  };
  files: SkillFile[];
}
```

### skill.controller.ts

```typescript
@Controller('skill')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  @UseGuards(JwtAuthGuard)    // JWT required
  @ApiOperation({ summary: 'Get CBM skill manifest for Agent Runner' })
  async getSkill(@CurrentUser() context: RequestContext): Promise<SkillManifest> {
    return this.skillService.getSkill(context);
  }
}
```

### skill.service.ts — Cache strategy

```typescript
@Injectable()
export class SkillService {
  // In-memory cache — per-instance (stateless deploy: each pod has own cache)
  private cache: { manifest: SkillManifest; generatedAt: number } | null = null;
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  async getSkill(context: RequestContext): Promise<SkillManifest> {
    if (this.cache && Date.now() - this.cache.generatedAt < this.TTL_MS) {
      return this.cache.manifest;
    }
    const manifest = await this.skillGeneratorService.generate(context);
    this.cache = { manifest, generatedAt: Date.now() };
    return manifest;
  }

  // Called on application bootstrap — ensures first request is instant
  async warmUp(): Promise<void> {
    await this.getSkill({ orgId: null } as any);
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
```

**Cache invalidation strategy:**

| Trigger | Mechanism |
|---|---|
| Time expiry | TTL 1h — cache auto-expires |
| New deployment | `warmUp()` on bootstrap clears old cache, builds fresh |
| Manual refresh | `DELETE /skill/cache` (internal, admin only) — for hotfix |

Agent Runner uses `version` field (sha256) to check if skill has changed:
- Same version → use local files, no re-download
- Different version → re-fetch manifest, overwrite changed files (checksum diff)

### skill-generator.service.ts

```typescript
@Injectable()
export class SkillGeneratorService {
  async generate(context: RequestContext): Promise<SkillManifest> {
    const files: SkillFile[] = [];

    // 1. Read and process OpenAPI spec
    const openApiSpec = await this.getOpenApiSpec();
    const apiReference = this.compressOpenApi(openApiSpec);
    files.push(this.buildFile('references/api-reference.md', apiReference));

    // 2. Read service-level cbm.skill.md → SKILL.md
    const serviceSkill = await this.readSkillFile('src/cbm.skill.md');
    const skillMd = this.buildSkillEntry(serviceSkill);
    files.push(this.buildFile('SKILL.md', skillMd));

    // 3. Scan and read all module *.skill.md files
    const moduleFiles = await glob('src/modules/**/*.skill.md');
    for (const filePath of moduleFiles) {
      const moduleName = path.basename(filePath, '.skill.md');
      const content = await fs.readFile(filePath, 'utf-8');
      files.push(this.buildFile(`references/${moduleName}.md`, content));
    }

    // 4. Generate error-guide.md from all agentHints in skill files
    const errorGuide = this.buildErrorGuide(files);
    files.push(this.buildFile('references/error-guide.md', errorGuide));

    return {
      name: 'cbm',
      version: this.computeVersion(files),
      description: 'Core Business Management — Projects, CRM, Finance',
      generated_at: new Date().toISOString(),
      base_url: process.env.CBM_BASE_URL ?? '',
      auth: {
        type: 'bearer',
        header: 'Authorization',
        note: 'Token auto-scopes all data to orgId',
      },
      files,
    };
  }

  private buildFile(path: string, content: string): SkillFile {
    return {
      path,
      content,
      checksum: createHash('sha256').update(content).digest('hex'),
      executable: false,
    };
  }

  private computeVersion(files: SkillFile[]): string {
    const combined = files.map(f => f.checksum).join('');
    return 'sha256:' + createHash('sha256').update(combined).digest('hex').slice(0, 16);
  }
}
```

---

## 8. `*.skill.md` Convention

### File structure

```markdown
## <Module Name>

<1–2 line description — what this module manages>

### State Machine (if applicable)
<ASCII state diagram>

### Workflows (if applicable)
#### <Workflow Name>
<Numbered steps with HTTP method + path>

### Business Rules
- <Concise rule>

### Agent Hints
- Error <pattern>: <what happened> — <what to do next>
```

### Writing guidelines

1. **Brief** — agent reads this, not a human developer
2. **Action-oriented** — use verbs: Create, Send, Approve, Reject
3. **Always include Agent Hints** — cover the most common error scenarios
4. **No duplication with Swagger** — Swagger owns endpoint/schema, `.skill.md` owns business logic
5. **English only** — consistent with `agentHint` fields in error responses

---

## 9. Enhanced Error Response

To help agents recover from errors without re-reading skill files:

**Current:**
```json
{ "statusCode": 400, "message": "Invalid status transition" }
```

**Enhanced:**
```json
{
  "statusCode": 400,
  "message": "Invalid status transition",
  "agentHint": "Invoice is in 'sent' status. Cannot send again. To cancel: POST /invoices/:id/cancel",
  "currentStatus": "sent",
  "allowedActions": ["mark-overdue", "cancel", "link-e-invoice"]
}
```

All `agentHint` values are in **English**.

---

## 10. Agent Runner — Expected Behavior

Agent Runner receives skill_url from AIWM `/connect`:

```json
{
  "skills": [
    {
      "name": "cbm",
      "url": "https://cbm.internal/skill",
      "token": "<jwt for /skill endpoint>"
    }
  ]
}
```

Agent Runner fetch + write flow:

```
1. GET {url} with Authorization: Bearer {token}
2. Parse SkillManifest
3. Compare manifest.version with locally cached version
4. If version differs (or no cache):
   a. Create {base_skill_dir}/cbm/ directory
   b. For each file in manifest.files[]:
      - Create subdirectory if needed
      - Compare file.checksum with cached checksum (skip if same)
      - Write file.content to {base_skill_dir}/cbm/{file.path}
      - chmod +x if file.executable = true
5. Cache manifest.version
6. Load {base_skill_dir}/cbm/SKILL.md as skill entry point
```

---

## 11. Token Efficiency Estimate

| | MCP (current) | Skill approach |
|---|---|---|
| Startup overhead | ~15,000–20,000 tokens | ~2,000–4,000 tokens |
| Per API call | ~500 tokens (tool invocation) | ~50–100 tokens (HTTP call) |
| 10 operations | **~25,000 tokens** | **~5,000 tokens** |
| **Reduction** | — | **~5x** |

---

## 12. Implementation Phases

### Phase 1 — CBM SkillModule
- [ ] `src/skill/skill.types.ts` — interfaces
- [ ] `src/skill/skill-generator.service.ts` — OpenAPI compression + file manifest builder
- [ ] `src/skill/skill.service.ts` — cache with TTL + warmUp on bootstrap
- [ ] `src/skill/skill.controller.ts` — `GET /skill` with JwtAuthGuard
- [ ] `src/skill/skill.module.ts`
- [ ] Register `SkillModule` in `AppModule`

### Phase 2 — Write `*.skill.md` for all modules
- [ ] `src/cbm.skill.md` — service overview, auth, cross-module workflows
- [ ] `src/modules/project/project.skill.md`
- [ ] `src/modules/work/work.skill.md`
- [ ] `src/modules/document/document.skill.md`
- [ ] `src/modules/company/company.skill.md`
- [ ] `src/modules/contact/contact.skill.md`
- [ ] `src/modules/interaction/interaction.skill.md`
- [ ] `src/modules/invoice/invoice.skill.md`
- [ ] `src/modules/expense/expense.skill.md`
- [ ] `src/modules/payment/payment.skill.md`
- [ ] `src/modules/transaction/transaction.skill.md`

### Phase 3 — Enhanced Error Responses
- [ ] Add `agentHint` to all BadRequestException (state machine errors)
- [ ] Add `allowedActions` + `currentStatus` to state machine errors
- [ ] All hint text in English

### Phase 4 — AIWM Integration
- [ ] AIWM `/connect` returns `skills[]` with url + token
- [ ] Agent Runner implements fetch + file-write flow
- [ ] End-to-end test with real agent
