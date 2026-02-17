---
name: hydra-backend
description: Create, modify, and maintain NestJS microservices in the Hydra Services monorepo. Use when scaffolding new services, adding entities/modules, setting up queues (BullMQ), implementing OAuth flows, or debugging monorepo-specific issues like Mongoose schema errors.
---

# Hydra Backend

Skill for building NestJS microservices in the `hydra-services` Nx monorepo.

## When to Use
- Creating a new service from scratch
- Adding entities/modules to an existing service
- Setting up BullMQ queues (producers + processors)
- Implementing OAuth or webhook endpoints
- Debugging Mongoose schema / BaseService issues

## Monorepo Location
Repository root: find it via `git rev-parse --show-toplevel` or check common locations:
- `/root/.openclaw/workspace/hydra-services/`

## Workflow

### New Service
1. Read `references/conventions.md` — mandatory rules
2. Read `references/service-scaffold.md` — step-by-step guide
3. Copy skeleton from `assets/service-template/` as starting point
4. Implement entities: schema → DTO → service → controller → module
5. Run `scripts/verify-service.sh <service-name>` to validate

### Add Entity to Existing Service
1. Read `references/conventions.md` (if not already loaded)
2. Read `references/schema-patterns.md` — avoid common Mongoose pitfalls
3. Create: `<entity>.schema.ts` → `<entity>.dto.ts` → `<entity>.service.ts` → `<entity>.controller.ts` → `<entity>.module.ts`
4. Register module in `app.module.ts`
5. Build verify: `npx nx run <service>:build`

### Add Queue
1. Read `references/queue-patterns.md`
2. Create producer + processor
3. Register in queue.module + processors.module
4. Build verify

### OAuth / Webhook
1. Read `references/oauth-patterns.md`
2. Key: webhook endpoints must NOT have `@UseGuards(JwtAuthGuard)`
3. Internal DB operations need `systemContext` (universe.owner role)

## Critical Rules (always apply)
- **Extend BaseSchema** for all entities — provides owner, audit, soft-delete
- **Extend BaseService** for all services — provides RBAC, pagination, CRUD
- **NO BaseController** — use modern pattern with `@CurrentUser()` decorator
- **Nested objects**: use `@Prop({ type: Object })` — NEVER put `required: true/false` inside nested `type: {}`
- **BullMQ queue names**: NO colons (`:`) — use hyphens (`-`)
- **Build after every change**: `npx nx run <service>:build`
