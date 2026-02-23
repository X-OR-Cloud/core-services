# CLAUDE.md - CBM Service

## Service Overview

CBM (Core Business Management) is the business logic and workflow service. Port 3004 (dev), 3340-3349 (prod).

Single mode: API (REST).

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Project | `src/modules/project/` | Project management with status state machine |
| Work | `src/modules/work/` | Work items/tasks within projects |
| Document | `src/modules/document/` | Text-based document management + advanced content operations |
| Content | `src/modules/content/` | Multimedia content (images, videos, audio) |
| Notification | `src/modules/notification/` | Event notification handling |

## Module-Specific Documentation

When working on a specific module, read the corresponding docs:

- **Project module**: Read `docs/cbm/project/OVERVIEW.md` + `docs/cbm/project/ROADMAP.md` AND `docs/cbm/project/FRONTEND-API.md` (frontend integration)
- **Work module**: Read `docs/cbm/work-api.md` + `docs/cbm/WORK-MANAGEMENT-IMPLEMENTATION-PLAN.md` AND `docs/cbm/work-frontend-guide.md`
- **Document module**: Read `docs/cbm/document/OVERVIEW.md` + `docs/cbm/document/ROADMAP.md` AND `docs/cbm/document/FRONTEND-API.md` (frontend integration)
- **Content module**: Read `docs/cbm/CONTENT-MODULE-PLAN.md`

## Key Architecture Patterns

### Status State Machine (Project)
- Projects follow a strict state machine: `draft → active → completed → archived`
- Side transition: `active ↔ on_hold`
- Action endpoints enforce valid transitions (e.g., `POST /projects/:id/activate`)
- Soft delete only allowed for `completed` or `archived` projects

### Service Pattern
- All services extend `BaseService` from `@hydrabyte/base`
- RBAC via `CurrentUser` decorator and `RequestContext`
- Soft delete with `deletedAt` timestamp
- Pagination via `PaginationQueryDto`

### Database
- MongoDB with Mongoose ODM
- Database: `{PREFIX}cbm`
- Collections: projects, works, documents, content, notifications

## Commands

```bash
nx run cbm:api    # API mode (REST)
nx run cbm:build  # Build
```
