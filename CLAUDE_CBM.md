# CLAUDE_CBM.md

Guidance for AI Agent dedicated to maintaining the **CBM (Core Business Management)** service.

---

## Your Role

You are the dedicated maintainer of the CBM service (`services/cbm/`). Your scope is limited to this service and its related documentation under `docs/cbm/`. You may read (but not modify) shared libraries at `libs/base/` and `libs/shared/` when needed for context.

---

## Development Workflow

1. **Discuss** - Gather requirements, clarify scope
2. **Propose** - Create plan at `docs/cbm/<feature>/`
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
| Path | `services/cbm/` |
| Port (dev) | 3004 |
| Port (prod) | 3340-3349 |
| Database | `core_cbm` (MongoDB + Mongoose) |
| Modes | `api` (REST server), `emb` (KB embedding worker) |
| Entry | `src/main.ts` - routes to API or worker based on `MODE` env |

---

## Commands

```bash
# Build & verify
nx run cbm:build
npx tsc --noEmit -p services/cbm/tsconfig.app.json
nx lint cbm
nx test cbm

# Run
nx run cbm:api                # REST API server (port 3004)
nx run cbm:emb                # Knowledge Base embedding worker

# Quick health check
curl http://localhost:3004/health
open http://localhost:3004/api-docs
```

---

## Modules

| Module | Path | Status | Description |
|--------|------|--------|-------------|
| **project** | `src/modules/project/` | Active | Project management, status state machine, member-based RBAC |
| **work** | `src/modules/work/` | Active | Work items (epic/task/subtask), state machine, recurring schedules |
| **document** | `src/modules/document/` | Active | Text documents (html/text/markdown/json), share links |
| **content** | `src/modules/content/` | Planned | Multimedia content with media attachments |
| **notification** | `src/modules/notification/` | Active | Event notification (Discord webhook) |
| **knowledge-collection** | `src/modules/knowledge-collection/` | Active | RAG knowledge domains, org-scoped |
| **knowledge-file** | `src/modules/knowledge-file/` | Active | File upload + indexing pipeline |
| **knowledge-chunk** | `src/modules/knowledge-chunk/` | Active | Derived text chunks (MongoDB + Qdrant) |
| **knowledge-shared** | `src/modules/knowledge-shared/` | Active | Shared KB services: Embedding, Qdrant, Chunking, OCR, PdfParser |
| **knowledge-worker** | `src/modules/knowledge-worker/` | Active | Background polling worker for file indexing |

---

## Architecture Patterns

### Schema Pattern

All schemas extend `BaseSchema` from `@hydrabyte/base` (provides `createdBy`, `updatedBy`, `orgId`, `isDeleted`, timestamps).

Exception: `KnowledgeChunk` does NOT extend BaseSchema (derived data, no audit trail).

```typescript
@Schema({ timestamps: true })
export class MyEntity extends BaseSchema {
  @Prop({ required: true })
  name: string;
}
```

### Service Pattern

All services extend `BaseService` from `@hydrabyte/base`:
- RBAC via `RequestContext` (from `@CurrentUser()` decorator)
- Soft delete with `deletedAt`
- `findAll` overridden in Project/Work/Document with org-scoped filtering

### Controller Pattern

```typescript
@Controller('projects')
export class ProjectController {
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiReadErrors({ notFound: false })
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    const { search, ...rest } = query;      // Project & Document: extract search separately
    const options = parseQueryString(rest);
    return this.service.findAll({ ...options, search }, context);
  }
}
```

**Note:** Work controller does NOT extract `search` separately - passes full query to `parseQueryString`.

### Cross-Module Access

`ProjectService.getRawProjectById(projectId)` - raw lean query (no RBAC) used by WorkService and DocumentService to check project membership without circular dependency.

---

## Status State Machines

### Project States

```
draft --> active --> completed --> archived
              \          /
               on_hold
```

- Soft delete only allowed for `completed` or `archived`

### Work States

```
backlog --> todo --> in_progress --> review --> done
                        |                       |
                        v                       v
                     blocked              (reopen to in_progress)
                        |
                        v
                    cancelled  <-- (any status)
```

- `done` and `cancelled` can reopen to `in_progress`
- Recurring tasks: on complete -> reset to `todo`, recalculate `startAt`

---

## Access Control

Defined in `src/modules/project/project-access.helper.ts`.

### Role Hierarchy

```
universe.owner
  --> organization.owner  (= "super-admin" in project context)
        --> project.lead
              --> project.member
                    --> org member (non-member)
```

### Permission Matrix

| Action | non-member | member | lead | org.owner |
|--------|:---------:|:------:|:----:|:---------:|
| View project (public) | Y | Y | Y | Y |
| View project (full) | - | Y | Y | Y |
| Update project / state transitions | - | - | Y | Y |
| Delete project (completed/archived) | - | - | Y | Y |
| Manage members | - | - | Y | Y |
| Create/update work | - | - | Y | Y |
| Work state transitions | - | Y | Y | Y |
| Delete work (done/cancelled) | - | - | Y | Y |
| Create/update document | - | Y | Y | Y |
| Delete document | - | - | Y | Y |

### Key Helper Functions

| Function | Purpose |
|----------|---------|
| `getMemberRole(project, context)` | Returns caller's role |
| `isSuperAdmin(context)` | Checks universe/org owner |
| `assertCanManageProject(project, context)` | Throws if not lead/super-admin |
| `assertCanManageWork(project, context)` | Throws if not lead/super-admin |
| `applyProjectAccess(project, context)` | Returns full or public-only view |
| `getMemberProjectIds(projects, context)` | Set of projectIds where caller is member |

---

## Knowledge Base (RAG) Pipeline

### Architecture

```
File Upload --> KnowledgeFile (pending)
                    |
            KnowledgeWorker polls (5s interval)
                    |
            Redis distributed lock
                    |
            KnowledgeIndexer pipeline:
              1. Extract text (pdf-parse / mammoth / OCR)
              2. Chunk text (ChunkingService)
              3. Generate embeddings (EmbeddingService)
              4. Store vectors in Qdrant
              5. Save chunks to MongoDB
                    |
            KnowledgeFile (ready / error)
```

### Worker Details

- **Not BullMQ** - custom polling-based worker with Redis lock
- Poll interval: 5 seconds
- Concurrency: `KB_WORKER_CONCURRENCY` env (default: 3)
- Safe for multiple worker instances (distributed lock)
- Run via: `nx run cbm:emb`
- Entry: `src/bootstrap-kb-worker.ts` -> standalone NestJS app

### Key Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `KB_WORKER_CONCURRENCY` | 3 | Max concurrent file processing |
| `KB_EMBEDDING_API_URL` | - | OpenAI-compatible embedding endpoint |
| `KB_EMBEDDING_API_KEY` | - | Embedding API key |
| `KB_EMBEDDING_MODEL` | `Qwen/Qwen3-Embedding-8B` | Embedding model name |
| `QDRANT_*` | - | Qdrant vector DB connection |

---

## Database Collections

| Collection | Schema | Notes |
|------------|--------|-------|
| `projects` | Project | Full-text search, member indexes |
| `works` | Work | Full-text search, recurring task indexes |
| `documents` | Document | Full-text search, RAG integration |
| `content` | Content | Multimedia, planned module |
| `notifications` | Notification | Event records |
| `knowledge_collections` | KnowledgeCollection | Org-scoped, stats tracking |
| `knowledge_files` | KnowledgeFile | Indexing status, org-scoped |
| `knowledge_chunks` | KnowledgeChunk | No BaseSchema, derived data |

---

## External Integrations

| System | Library | Config |
|--------|---------|--------|
| MongoDB | `mongoose` | `MONGO_*` env vars, DB name: `core_cbm` |
| Redis | `redis` | `REDIS_*` env vars (lock service, caching) |
| Qdrant | `@qdrant/js-client-rest` | Vector storage for KB embeddings |
| Discord | `discord.js` | `CBM_DISCORD_WEBHOOK_URL` - notifications |
| Embedding API | `axios` | OpenAI-compatible endpoint |

---

## Shared Library Usage

### From `@hydrabyte/base` (`libs/base/`)

- `BaseSchema`, `BaseService` - base classes
- `JwtAuthGuard`, `CombinedAuthGuard` - auth guards
- `@CurrentUser()` - request context decorator
- `parseQueryString` - query string to MongoDB filter
- `GlobalExceptionFilter`, `customQueryParser` - global middleware
- `HealthModule` - health check endpoint
- Swagger decorators: `ApiCreateErrors`, `ApiReadErrors`, etc.

### From `@hydrabyte/shared` (`libs/shared/`)

- `RequestContext` - user context type
- `COMMON_CONFIG.DatabaseNamePrefix` - DB name prefix (`core_`)
- `SERVICE_CONFIG.cbm` - CBM-specific config
- `buildMongoUri()` - MongoDB connection builder
- `ServiceName.CBM` - service enum

---

## Documentation Index

| Doc | Path |
|-----|------|
| Project overview | `docs/cbm/project/OVERVIEW.md` |
| Project roadmap | `docs/cbm/project/ROADMAP.md` |
| Project API | `docs/cbm/project/FRONTEND-API.md` |
| Work overview | `docs/cbm/work/OVERVIEW.md` |
| Work roadmap | `docs/cbm/work/ROADMAP.md` |
| Work API | `docs/cbm/work/FRONTEND-API.md` |
| Next work priority | `docs/cbm/NEXT-WORK-PRIORITY-LOGIC.md` |
| Document overview | `docs/cbm/document/OVERVIEW.md` |
| Document roadmap | `docs/cbm/document/ROADMAP.md` |
| Document API | `docs/cbm/document/FRONTEND-API.md` |
| Content plan | `docs/cbm/CONTENT-MODULE-PLAN.md` |
| Knowledge Base API | `docs/cbm/knowledge-base/API.md` |
| Full entity + API ref | `docs/cbm/CBM-ENTITIES-AND-API.md` |
| Access control | `docs/cbm/member-access-control.md` |
| Test scenarios | `docs/cbm/test-scenarios.md` |

---

## Important Conventions

1. **Soft delete only** - never hard delete, use `isDeleted` / `deletedAt`
2. **Org-scoped queries** - all findAll must filter by `owner.orgId` from context
3. **State machine enforcement** - validate transitions in service layer, reject invalid ones
4. **Forbidden errors include lead IDs** - so callers know who to contact for access
5. **No circular dependencies** - use `getRawProjectById()` for cross-module checks
6. **Knowledge chunks have no BaseSchema** - derived data, no audit trail needed
7. **Custom query parser** - supports `filter[field]`, `filter.field`, `filter[metadata.x]` syntax
8. **Validation pipe** - `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
