---
name: cbm-module
description: Scaffold a new module in the CBM (Core Business Management) service. Use when adding a new entity/module to services/cbm/, following CBM-specific patterns (BaseSchema, BaseService, org-scoped queries, Swagger decorators, state machines).
---

# CBM Module Scaffold Skill

Skill for adding new NestJS modules to `services/cbm/` in the hydra-services monorepo.

## When to Use
- Adding a new entity/module to the CBM service
- Scaffolding CRUD boilerplate for a CBM module
- Adding a module with a state machine (status transitions)
- Adding a module that cross-references another CBM module

## Service Location
```
/usr/agents/mehr/workspace/code/services/cbm/src/modules/<module-name>/
```

## Workflow

### Step 1 — Gather requirements
Ask the user for:
1. **Module name** — singular, kebab-case (e.g. `contract`, `budget-item`)
2. **Fields** — name, type, required/optional, description
3. **State machine?** — if yes, what statuses and transitions
4. **Cross-module dependencies?** — does it reference Invoice, Expense, Company, Contact, etc.

### Step 2 — Read references
Read these reference files before writing any code:
1. `references/patterns.md` — CBM conventions (MANDATORY)
2. `references/state-machine.md` — if module has status transitions
3. `references/money-amount.md` — if module has monetary fields

### Step 3 — Create 5 files in order

Always create in this order: **schema → dto → service → controller → module**

| File | Purpose |
|------|---------|
| `<name>.schema.ts` | Mongoose schema extending BaseSchema |
| `<name>.dto.ts` | Create/Update/Query DTOs with class-validator |
| `<name>.service.ts` | Business logic extending BaseService |
| `<name>.controller.ts` | REST endpoints with Swagger |
| `<name>.module.ts` | NestJS module registration |

Use templates from `assets/templates/` as starting point.

### Step 4 — Register in AppModule
Add to `services/cbm/src/app/app.module.ts`:
```typescript
import { YourModule } from '../modules/your-module/your.module';

// In @Module({ imports: [...] })
YourModule,
```

**Order matters:** If your module depends on `TransactionModule` or `InvoiceModule`, register those first.

### Step 5 — Verify
```bash
cd /usr/agents/mehr/workspace/code
npx tsc --noEmit -p services/cbm/tsconfig.app.json
nx lint cbm
nx test cbm
```

---

## Module Types Quick Reference

### Simple CRUD module (no state machine)
→ Copy `assets/templates/simple/`
→ See: Company, Contact, Interaction modules as reference

### Module with status state machine
→ Copy `assets/templates/state-machine/`
→ Add action endpoints: `POST /:id/<action>`
→ See: Invoice, Expense modules as reference

### Module with cross-module dependencies
→ Import the dependency module in `<name>.module.ts`
→ Use `getRawXxxById()` pattern to avoid circular deps if needed
→ See: Payment module (depends on Invoice + Transaction)

---

## Critical Rules (always apply)

1. **Extend `BaseSchema`** — provides `owner`, `isDeleted`, `createdBy`, `updatedBy`, timestamps
2. **Extend `BaseService<T>`** — provides RBAC, pagination, soft delete, aggregate
3. **`@IsString()` for all reference ID fields** — NOT `@IsMongoId()` (CBM convention)
4. **`@Prop({ type: Object })`** for nested objects — never put `required` inside nested type
5. **`@Prop({ type: [Object], default: [] })`** for arrays of objects
6. **Override `findAll`** — must filter org-scoped + support `search` param
7. **Override `findById`** — throw `NotFoundException` if not found
8. **Soft delete only** — never hard delete; override `softDelete` to add status guards
9. **Status transitions** via action methods — never allow direct `status` field update by client
10. **`parseQueryString`** in controller — extract `search` separately before calling it
