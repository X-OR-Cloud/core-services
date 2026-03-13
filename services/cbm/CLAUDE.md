# CLAUDE.md - CBM Service

## Service Overview

CBM (Core Business Management) is the business logic and workflow service. Port 3004 (dev), 3340-3349 (prod).

Single mode: API (REST).

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Project | `src/modules/project/` | Project management with status state machine and member-based access control |
| Work | `src/modules/work/` | Work items (epic/task/subtask) with state machine, recurring schedules, and priority-based next-work |
| Document | `src/modules/document/` | Text documents with advanced content operations and time-limited share links |
| Content | `src/modules/content/` | Multimedia content (images, videos, audio) — planned, not yet active |
| Notification | `src/modules/notification/` | Event notification handling |
| Knowledge Collection | `src/modules/knowledge-collection/` | RAG knowledge domains — org-scoped, links to Qdrant collection |
| Knowledge File | `src/modules/knowledge-file/` | File upload + indexing pipeline (pdf-parse, mammoth, OCR fallback) |
| Knowledge Chunk | `src/modules/knowledge-chunk/` | Derived text chunks from indexed files, stored in MongoDB + Qdrant |
| Knowledge Shared | `src/modules/knowledge-shared/` | Shared services: EmbeddingService, QdrantService, ChunkingService, OcrService |
| Knowledge Worker | `src/modules/knowledge-worker/` | Background worker: polls pending files, runs full indexing pipeline |

## Module-Specific Documentation

- **Project module**: `docs/cbm/project/OVERVIEW.md`, `docs/cbm/project/ROADMAP.md`, `docs/cbm/project/FRONTEND-API.md`
- **Work module**: `docs/cbm/work/OVERVIEW.md`, `docs/cbm/work/ROADMAP.md`, `docs/cbm/work/FRONTEND-API.md`, `docs/cbm/NEXT-WORK-PRIORITY-LOGIC.md`
- **Document module**: `docs/cbm/document/OVERVIEW.md`, `docs/cbm/document/ROADMAP.md`, `docs/cbm/document/FRONTEND-API.md`
- **Content module**: `docs/cbm/CONTENT-MODULE-PLAN.md`
- **Knowledge Base module**: `docs/cbm/knowledge-base/API.md`
- **Full entity + API reference**: `docs/cbm/CBM-ENTITIES-AND-API.md`
- **Access control detail**: `docs/cbm/member-access-control.md`
- **Test scenarios**: `docs/cbm/test-scenarios.md`

## Access Control

Access control is implemented in `src/modules/project/project-access.helper.ts`.

### Role Hierarchy

```
universe.owner
  └── organization.owner   (= "super-admin" in project context)
        └── project.lead
              └── project.member
                    └── org member (non-member)
```

### Permission Summary

| Action | non-member | project.member | project.lead | org.owner |
|--------|-----------|----------------|--------------|-----------|
| View project (public fields) | ✅ | ✅ | ✅ | ✅ |
| View project (full) | ❌ | ✅ | ✅ | ✅ |
| Update project info / state transitions | ❌ | ❌ | ✅ | ✅ |
| Delete project (completed/archived only) | ❌ | ❌ | ✅ | ✅ |
| Add/remove/update members | ❌ | ❌ | ✅ | ✅ |
| Create / update work | ❌ | ❌ | ✅ | ✅ |
| Work state transitions (start/block/complete/etc.) | — | ✅ | ✅ | ✅ |
| Delete work (done/cancelled only) | ❌ | ❌ | ✅ | ✅ |
| Create / update document | — | ✅ | ✅ | ✅ |
| Delete document | ❌ | ❌ | ✅ | ✅ |

**Forbidden error messages** for unauthorized work/project actions include project lead IDs so the caller knows who to contact.

### Helper Functions

| Function | Purpose |
|----------|---------|
| `getMemberRole(project, context)` | Returns caller's role: `super-admin`, `project.lead`, `project.member`, or `null` |
| `isSuperAdmin(context)` | Checks universe.owner or org.owner |
| `isSameOrg(project, context)` | Checks org-scoped access |
| `assertCanManageProject(project, context)` | Throws if not lead/super-admin |
| `assertCanManageWork(project, context)` | Throws if not lead/super-admin |
| `assertCanDeleteDocument(project, context)` | Throws if not lead/super-admin |
| `assertCanManageMembers(project, context)` | Throws if not lead/super-admin |
| `applyProjectAccess(project, context)` | Returns full or public-only project view |
| `applyProjectListAccess(projects, context)` | Filters/strips list for caller |
| `getMemberProjectIds(projects, context)` | Returns Set of projectIds where caller is a member |
| `stripToPublicView(project)` | Strips to public fields only |

## Key Architecture Patterns

### Status State Machines

**Project:** `draft → active → completed → archived` (side: `active ↔ on_hold`)
- Soft delete only allowed for `completed` or `archived`

**Work:** `backlog → todo → in_progress → review → done` / `blocked` / `cancelled`
- All statuses can transition to `cancelled`
- `done` and `cancelled` can reopen to `in_progress`
- Recurring tasks: on `complete` → reset to `todo`, recalculate `startAt`

### Controller Pattern

All controllers use `parseQueryString` from `@hydrabyte/base` for `findAll`:

```typescript
async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
  const { search, ...rest } = query;      // Project & Document: extract search separately
  const options = parseQueryString(rest);
  return this.service.findAll({ ...options, search }, context);
}
```

Work controller passes the full query (no separate search extraction):
```typescript
const options = parseQueryString(query);
return this.workService.findAll(options, context);
```

### Cross-Module Access Check

`ProjectService.getRawProjectById(projectId)` — raw lean query (no access control) used by `WorkService` and `DocumentService` to check project membership without circular dependency.

### Service Pattern

- All services extend `BaseService` from `@hydrabyte/base`
- RBAC via `CurrentUser` decorator and `RequestContext`
- Soft delete with `deletedAt` timestamp
- `findAll` overridden in Project/Work/Document services with org-scoped filtering

### Database

- MongoDB with Mongoose ODM
- Database: `{PREFIX}cbm`
- Collections: `projects`, `works`, `documents`, `content`, `notifications`, `knowledge_collections`, `knowledge_files`, `knowledge_chunks`

## Commands

```bash
nx run cbm:api    # API mode (REST)
nx run cbm:emb    # Knowledge Base embedding worker
nx run cbm:build  # Build
```
