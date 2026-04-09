# CLAUDE_MONA.md

Guidance for AI Agent dedicated to maintaining the **MONA (Monitoring & Analytics)** service.

---

## Your Role

You are the dedicated maintainer of the MONA service (`services/mona/`). Your scope is limited to this service and its related documentation under `docs/mona/`. You may read (but not modify) shared libraries at `libs/base/` and `libs/shared/` when needed for context.

---

## Development Workflow

1. **Discuss** - Gather requirements, clarify scope
2. **Propose** - Create plan at `docs/mona/<feature>/`
3. **Approve** - Wait for confirmation before coding
4. **Branch** - Create git branch for the change
5. **Implement** - Execute the plan
6. **Verify** - Build, type-check, test

### Task Management

- Break work into micro-tasks (one file, one function per task)
- Mark each task done immediately after completion
- Keep responses concise, focused on current task

---

## Service Overview

| Key | Value |
|-----|-------|
| Path | `services/mona/` |
| Port (dev) | 3005 |
| Port (prod) | 3350–3359 |
| Database | `core_mona` (MongoDB + Mongoose) |
| Mode | `api` (single mode, REST only) |
| Entry | `src/main.ts` |
| App Module | `src/app/app.module.ts` |

---

## Commands

```bash
# Build & verify
nx run mona:build
npx tsc --noEmit -p services/mona/tsconfig.app.json
nx lint mona
nx test mona

# Run
nx run mona:api    # REST API server (port 3005)

# Quick health check
curl http://localhost:3005/health
open http://localhost:3005/api-docs
```

---

## Modules

| Module | Path | Description |
|--------|------|-------------|
| **metrics** | `src/modules/metrics/` | Time-series metrics: CRUD, aggregation, async report generation |

### Metrics Module Files

| File | Purpose |
|------|---------|
| `metrics.schema.ts` | `MetricData` schema — time-series data with type discriminator |
| `metrics.service.ts` | CRUD and query logic |
| `metrics.controller.ts` | REST endpoints for metrics |
| `metrics-aggregation.service.ts` | Async aggregation logic |
| `metrics-aggregation.controller.ts` | REST endpoints for aggregation & reports |
| `metrics.dto.ts` | Request/response DTOs |
| `metrics.constants.ts` | Constants (metric types, intervals) |

---

## Schema Design

### MetricData

Single-collection design with type discriminator pattern.

```typescript
enum MetricType {
  NODE = 'node',
  RESOURCE = 'resource',
  DEPLOYMENT = 'deployment',
  SYSTEM = 'system',
}

enum AggregationInterval {
  ONE_MIN = '1min',
  FIVE_MIN = '5min',
  ONE_HOUR = '1hour',
  ONE_DAY = '1day',
}
```

- Extends `BaseSchema` (createdBy, updatedBy, orgId, isDeleted, timestamps)
- `type` field is indexed for efficient filtering by metric source
- Designed for time-series data with aggregation over intervals

---

## Queue System (BullMQ)

- Producers: `src/queues/producers/`
- Processors: `src/queues/processors/`
- Module: `src/queues/queue.module.ts`
- Processors module: `src/queues/processors.module.ts`

| Queue | Purpose |
|-------|---------|
| `metrics-aggregation` | Async metric aggregation and report generation |

Aggregation endpoints trigger async jobs — HTTP returns immediately with job reference, processor handles computation in background.

---

## Access Control

- **Metrics endpoints**: `JwtAuthGuard` + org-scoped queries via `RequestContext`
- **Aggregation endpoints**: `INTERNAL_API_KEY` header required — service-to-service calls only

---

## External Integrations

| System | Config | Purpose |
|--------|--------|---------|
| MongoDB | `MONGODB_URI` | Database `core_mona`, collection `metric_data` |
| Redis | `REDIS_*` | BullMQ queue for async aggregation |
| AIWM Service | publishes node/resource/deployment metrics | Primary data source |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `INTERNAL_API_KEY` | Yes | — | Inter-service auth (aggregation endpoints) |
| `REDIS_HOST` | Yes | — | Redis host |
| `REDIS_PORT` | Yes | — | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_DB` | No | — | Redis database index |
| `PORT` | No | `3005` | HTTP server port |
| `NODE_ENV` | No | — | Environment (development/production) |

---

## Architecture Patterns

### Metrics Ingestion
- AIWM (and other services) push metrics via internal API
- Metrics tagged with `type` (node/resource/deployment/system) and `orgId`
- All queries are org-scoped via `RequestContext`

### Async Aggregation
- Aggregation requests → BullMQ job → background processor
- HTTP response: job ID for polling or webhook callback
- Keeps API responsive for large time-range aggregations

### Rate Limiting
- Global `ThrottlerModule`: 10 requests per 60 seconds (default)
- Aggregation endpoints use `INTERNAL_API_KEY` (no rate limit)

---

## Shared Library Usage

### From `@hydrabyte/base` (`libs/base/`)

- `BaseSchema`, `BaseService` — base classes
- `JwtAuthGuard` — auth guard
- `@CurrentUser()` — request context decorator
- `parseQueryString` — query string to MongoDB filter
- `GlobalExceptionFilter`, `CorrelationIdMiddleware` — global middleware
- `HealthModule` — health check endpoint
- `JwtStrategy` — Passport JWT strategy

### From `@hydrabyte/shared` (`libs/shared/`)

- `RequestContext` — user context type
- `COMMON_CONFIG.DatabaseNamePrefix` — DB name prefix (`core_`)
- `SERVICE_CONFIG.mona` — MONA-specific config
- `buildMongoUri()` — MongoDB connection builder

---

## Documentation Index

| Doc | Path |
|-----|------|
| Overview | `docs/mona/01-overview.md` |
| Schema design | `docs/mona/02-schema-design.md` |
| API design | `docs/mona/03-api-design.md` |
| Aggregation strategy | `docs/mona/04-aggregation-strategy.md` |
| Implementation plan | `docs/mona/05-implementation-plan.md` |
| Node authentication | `docs/mona/06-node-authentication.md` |

---

## Important Conventions

1. **Single collection design** — all metric types in `metric_data`, discriminated by `type` field
2. **Org-scoped queries** — all findAll must filter by `orgId` from `RequestContext`
3. **Async aggregation** — never block HTTP for large aggregations, use BullMQ
4. **Aggregation endpoints require `INTERNAL_API_KEY`** — not exposed to end users directly
5. **Soft delete only** — use `isDeleted`, never hard delete metric records
6. **Rate limiting** — ThrottlerModule active; ingestion endpoints from services bypass via internal key
7. **BaseSchema on MetricData** — unlike KnowledgeChunk in CBM, MetricData has full audit trail
