# Project Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/cbm/src/modules/project/
├── project.schema.ts      # MongoDB schema (extends BaseSchema)
├── project.dto.ts         # DTOs: Create, Update
├── project.service.ts     # Business logic (extends BaseService)
├── project.controller.ts  # REST API endpoints
└── project.module.ts      # NestJS module
```

## 2. Status State Machine

| Status | Meaning | Set by | When |
|--------|---------|--------|------|
| `draft` | New, not started | System | Create (default) |
| `active` | In progress | User (action) | Activate from draft |
| `on_hold` | Paused | User (action) | Hold from active |
| `completed` | Finished | User (action) | Complete from active |
| `archived` | Long-term storage | User (action) | Archive from completed |

**State transitions:**
```
draft ──activate──> active ──complete──> completed ──archive──> archived
                      ↕
                   hold/resume
                      ↕
                   on_hold
```

**Deletion rules:**
- Soft delete only allowed when status is `completed` or `archived`
- Other statuses → `BadRequestException`

## 3. Schema Fields

```
Project extends BaseSchema:
  name: string (required, max 200)
  description: string (optional, max 2000)
  members: string[] (user IDs, default: [])
  startDate?: Date
  endDate?: Date
  tags: string[] (default: [])
  status: 'draft' | 'active' | 'on_hold' | 'completed' | 'archived' (default: 'draft')
  // Inherited from BaseSchema: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
```

**Indexes**: `{ status: 1 }`, `{ 'owner.userId': 1 }`, `{ members: 1 }`, `{ tags: 1 }`, `{ createdAt: -1 }`, `{ name: 'text', description: 'text' }`

## 4. API Endpoints

### CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/projects` | User JWT | Create project (default status: draft) |
| GET | `/projects` | User JWT | List projects + statistics (byStatus). Excludes `description` field |
| GET | `/projects/:id` | User JWT | Get project by ID |
| PATCH | `/projects/:id` | User JWT | Update project |
| DELETE | `/projects/:id` | User JWT | Soft delete (only completed/archived) |

### Action Endpoints (State Transitions)

| Method | Endpoint | Auth | Transition |
|--------|----------|------|------------|
| POST | `/projects/:id/activate` | User JWT | `draft` → `active` |
| POST | `/projects/:id/hold` | User JWT | `active` → `on_hold` |
| POST | `/projects/:id/resume` | User JWT | `on_hold` → `active` |
| POST | `/projects/:id/complete` | User JWT | `active` → `completed` |
| POST | `/projects/:id/archive` | User JWT | `completed` → `archived` |

## 5. findAll Response

`GET /projects` trả về response kèm statistics:

```typescript
{
  data: Project[]           // Excludes `description` field
  pagination: { total, page, limit }
  statistics: {
    total: number
    byStatus: { draft: N, active: N, ... }
  }
}
```

## 6. DTOs

### CreateProjectDto
- `name` (required): string, min 1, max 200
- `description` (optional): string, max 2000
- `members` (optional): string[]
- `startDate` (optional): Date (ISO 8601)
- `endDate` (optional): Date (ISO 8601)
- `tags` (optional): string[]
- ~~`status`~~ — không có trong DTO. System forces `'draft'` khi create

### UpdateProjectDto
- All fields optional (partial update)
- Same validations as CreateProjectDto

## 7. Dependencies

- **MongooseModule**: Project schema registration
- **BaseService** (`@hydrabyte/base`): CRUD operations, pagination, aggregation, RBAC

**Exports**: `ProjectService`, `MongooseModule` (for use by other modules like Work)

## 8. Existing Documentation

- `docs/cbm/project/FRONTEND-API.md` — Frontend API integration guide
- `docs/cbm/project_work_design.md` — Project + Work design document
