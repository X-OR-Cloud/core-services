# CBM Service — Entities, Permissions & API Reference

**Service:** Core Business Management (CBM)
**Port:** 3004
**Base URL:** `http://localhost:3004`
**Auth:** Bearer JWT token required on all endpoints unless noted

---

## Table of Contents

1. [Entity Descriptions](#1-entity-descriptions)
   - [Project](#11-project)
   - [Work](#12-work)
   - [Document](#13-document)
2. [Permission Matrix](#2-permission-matrix)
3. [Work Workflow](#3-work-workflow)
4. [API Reference](#4-api-reference)
   - [Project APIs](#41-project-apis)
   - [Work APIs](#42-work-apis)
   - [Document APIs](#43-document-apis)

---

## 1. Entity Descriptions

### 1.1 Project

A **Project** groups related Work items and Documents under a single organizational unit. Projects are org-scoped — only members of the same organization can view or interact with them.

#### Fields

| Field | Type | Required | Values / Format | Description |
|-------|------|----------|-----------------|-------------|
| `_id` | ObjectId | auto | MongoDB ObjectId | Primary identifier |
| `name` | string | ✅ | max 200 chars | Project display name |
| `summary` | string | ❌ | max 500 chars | Public summary — visible to all org members (non-members see only this) |
| `description` | string | ❌ | max 2000 chars | Private description — visible to project members only |
| `status` | string | auto | `draft`, `active`, `on_hold`, `completed`, `archived` | Current project lifecycle state. Starts at `draft`, transitions via action endpoints |
| `members` | array | ❌ | See ProjectMember below | List of project members with roles |
| `startDate` | Date | ❌ | ISO 8601 | Project planned start date |
| `endDate` | Date | ❌ | ISO 8601 | Project planned end date |
| `tags` | string[] | ❌ | array of strings | Labels for categorization and filtering |
| `owner` | object | auto | `{ orgId, userId }` | Set by system from auth context |
| `createdBy` | object | auto | `{ type, id }` | Set by system on creation |
| `updatedBy` | object | auto | `{ type, id }` | Set by system on each update |
| `createdAt` | Date | auto | ISO 8601 | Creation timestamp |
| `updatedAt` | Date | auto | ISO 8601 | Last update timestamp |

#### ProjectMember Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `type` | string | `user`, `agent` | Whether the member is a human user or an AI agent |
| `id` | string | ObjectId string | User ID or Agent ID |
| `role` | string | `project.lead`, `project.member` | Member's role in this project |

#### Project Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Newly created, not yet started |
| `active` | Actively in progress |
| `on_hold` | Temporarily paused |
| `completed` | Work is done |
| `archived` | Archived for record-keeping |

#### Example

```json
{
  "_id": "69a920341bdbfc44ef96cc3c",
  "name": "Q1 2025 Product Launch",
  "summary": "Launching new product features for Q1 2025",
  "description": "Internal roadmap and execution plan for the Q1 launch sprint.",
  "status": "active",
  "members": [
    { "type": "user", "id": "69660340bbb888f296532940", "role": "project.lead" },
    { "type": "agent", "id": "69abc123...", "role": "project.member" }
  ],
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-03-31T23:59:59.000Z",
  "tags": ["product", "launch", "q1"],
  "createdAt": "2025-01-01T08:00:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

---

### 1.2 Work

A **Work** item represents a unit of work to be done. It supports three types (`epic`, `task`, `subtask`) and a rich status lifecycle with state transition actions. Works can be linked to a Project and support recurring schedules.

#### Fields

| Field | Type | Required | Values / Format | Description |
|-------|------|----------|-----------------|-------------|
| `_id` | ObjectId | auto | MongoDB ObjectId | Primary identifier |
| `title` | string | ✅ | max 200 chars | Work title |
| `description` | string | ❌ | markdown, max 10000 chars | Detailed description in Markdown format |
| `type` | string | ✅ | `epic`, `task`, `subtask` | Work type. Immutable after creation |
| `projectId` | string | ❌ | ObjectId string | Optional link to a Project |
| `reporter` | ReporterAssignee | ✅ | See below | Who reported/created the work |
| `assignee` | ReporterAssignee | ❌ | See below | Who is assigned to execute the work |
| `status` | string | auto | `backlog`, `todo`, `in_progress`, `blocked`, `review`, `done`, `cancelled` | Current work state. Starts at `backlog` |
| `dependencies` | string[] | auto `[]` | array of Work ObjectId strings | Other Works that must be completed before this one |
| `parentId` | string | ❌ | ObjectId string | Parent Work ID — used for subtasks under a task or epic |
| `documents` | string[] | auto `[]` | array of Document ObjectId strings | Related document IDs |
| `dueDate` | Date | ❌ | ISO 8601 | Deadline for completion |
| `startAt` | Date | ❌ | ISO 8601 | Scheduled start time — used for agent-triggered execution |
| `reason` | string | ❌ | max 1000 chars | Explanation set when work is blocked |
| `feedback` | string | ❌ | max 2000 chars | Feedback from reviewer when review is rejected, or from unblocker |
| `recurrence` | RecurrenceConfig | ❌ | See below | Schedule for recurring execution. Only valid for `type=task` |
| `isRecurring` | boolean | auto | `true` / `false` | Convenience flag — `true` when recurrence is set and active |
| `owner` | object | auto | `{ orgId, userId }` | Set by system from auth context |
| `createdAt` | Date | auto | ISO 8601 | Creation timestamp |
| `updatedAt` | Date | auto | ISO 8601 | Last update timestamp |

#### ReporterAssignee Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `type` | string | `user`, `agent` | Whether the entity is a human user or AI agent |
| `id` | string | ObjectId string | User ID or Agent ID |

#### RecurrenceConfig Fields

| Field | Type | Required when | Values / Format | Description |
|-------|------|---------------|-----------------|-------------|
| `type` | string | always | `onetime`, `interval`, `daily`, `weekly`, `monthly` | Recurrence pattern. `onetime` = scheduled once (uses `startAt`) |
| `intervalMinutes` | number | `type=interval` | 1–525600 | Repeat interval in minutes |
| `timesOfDay` | string[] | `type=daily/weekly/monthly` | `["HH:mm", ...]` in 24h format | Times of day to execute |
| `daysOfWeek` | number[] | `type=weekly` | 0 (Sun) – 6 (Sat) | Days of week to execute |
| `daysOfMonth` | number[] | `type=monthly` | 1–31 | Days of month to execute (clamped to last day of month) |
| `timezone` | string | ❌ | IANA timezone, e.g. `Asia/Ho_Chi_Minh` | Timezone for schedule evaluation. Default: `UTC` |

#### Work Status Values

| Status | Meaning |
|--------|---------|
| `backlog` | Unassigned backlog item |
| `todo` | Assigned and ready to start |
| `in_progress` | Currently being worked on |
| `blocked` | Blocked by an external dependency or issue |
| `review` | Submitted for review/approval |
| `done` | Completed successfully |
| `cancelled` | Cancelled — no longer needed |

#### Example

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "title": "Implement user authentication",
  "description": "## Requirements\n- JWT tokens\n- Refresh token flow",
  "type": "task",
  "projectId": "69a920341bdbfc44ef96cc3c",
  "reporter": { "type": "user", "id": "69660340bbb888f296532940" },
  "assignee": { "type": "agent", "id": "69abc123..." },
  "status": "in_progress",
  "dependencies": [],
  "documents": [],
  "dueDate": "2025-03-31T23:59:59.000Z",
  "startAt": "2025-01-15T09:00:00.000Z",
  "recurrence": {
    "type": "daily",
    "timesOfDay": ["09:00"],
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "isRecurring": true,
  "createdAt": "2025-01-01T08:00:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

---

### 1.3 Document

A **Document** is a text-based artifact created by users or AI agents. It supports multiple content formats and can be linked to a Project. Documents can be shared via time-limited public URLs.

#### Fields

| Field | Type | Required | Values / Format | Description |
|-------|------|----------|-----------------|-------------|
| `_id` | ObjectId | auto | MongoDB ObjectId | Primary identifier |
| `summary` | string | ✅ | max 500 chars | Document title/summary — used for display and search |
| `content` | string | ✅ | any string | Main document content |
| `type` | string | ✅ | `html`, `text`, `markdown`, `json` | Content format — determines MIME type when served |
| `labels` | string[] | ✅ | array of strings | Labels for categorization and full-text search |
| `status` | string | auto | `draft`, `published`, `archived` | Document lifecycle state. Starts at `draft` |
| `projectId` | string | ❌ | ObjectId string | Optional link to a Project |
| `owner` | object | auto | `{ orgId, userId }` | Set by system from auth context |
| `createdBy` | object | auto | `{ type, id }` | Set by system on creation |
| `updatedBy` | object | auto | `{ type, id }` | Set by system on each update |
| `createdAt` | Date | auto | ISO 8601 | Creation timestamp |
| `updatedAt` | Date | auto | ISO 8601 | Last update timestamp |

#### Document Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Work in progress, not yet finalized |
| `published` | Finalized and available |
| `archived` | Archived, no longer active |

#### Document Type → MIME Type Mapping

| Type | MIME Type |
|------|-----------|
| `html` | `text/html` |
| `text` | `text/plain` |
| `markdown` | `text/markdown` |
| `json` | `application/json` |

#### Example

```json
{
  "_id": "507f1f77bcf86cd799439099",
  "summary": "API Integration Guide",
  "content": "# API Integration Guide\n\nThis guide explains...",
  "type": "markdown",
  "labels": ["api", "guide", "integration"],
  "status": "published",
  "projectId": "69a920341bdbfc44ef96cc3c",
  "createdAt": "2025-01-01T08:00:00.000Z",
  "updatedAt": "2025-01-10T14:00:00.000Z"
}
```

---

## 2. Permission Matrix

### Role Hierarchy

```
universe.owner
  └── organization.owner   (= "super-admin" in project context)
        └── project.lead
              └── project.member
                    └── org member (non-member of project)
```

- **universe.owner / organization.owner**: Bypass all project-level access control. Full access to everything.
- **project.lead**: Can manage project info, work items, and document deletion within their projects.
- **project.member**: Can participate in work state transitions and create/update documents. Cannot modify project structure or delete documents.
- **org member (non-project-member)**: Can view public project info only (name, summary, dates, members list, tags, status). No access to work or documents.

### Project Permissions

| Action | org member (non-member) | project.member | project.lead | org.owner |
|--------|------------------------|----------------|--------------|-----------|
| View project (public fields) | ✅ | ✅ | ✅ | ✅ |
| View project (all fields) | ❌ | ✅ | ✅ | ✅ |
| Create project | ✅ | ✅ | ✅ | ✅ |
| Update project info | ❌ | ❌ | ✅ | ✅ |
| Change project status (activate/hold/complete/archive) | ❌ | ❌ | ✅ | ✅ |
| Delete project (completed/archived only) | ❌ | ❌ | ✅ | ✅ |
| Add/remove/update members | ❌ | ❌ | ✅ | ✅ |
| List members | ❌ | ✅ | ✅ | ✅ |

### Work Permissions

| Action | project.member | project.lead | org.owner |
|--------|----------------|--------------|-----------|
| View work | ✅ | ✅ | ✅ |
| Create work | ❌ | ✅ | ✅ |
| Update work metadata | ❌ | ✅ | ✅ |
| Delete work (done/cancelled only) | ❌ | ✅ | ✅ |
| State transitions (start/block/unblock/request-review/complete/cancel/reopen/assign) | ✅ | ✅ | ✅ |

> **Error messages**: When a member attempts an unauthorized action on work, the error message includes the project lead IDs so they know who to contact.

### Document Permissions

| Action | project.member | project.lead | org.owner |
|--------|----------------|--------------|-----------|
| View document | ✅ | ✅ | ✅ |
| Create document | ✅ | ✅ | ✅ |
| Update document (metadata + content) | ✅ | ✅ | ✅ |
| Delete document | ❌ | ✅ | ✅ |

> **Note**: These rules only apply to documents linked to a project (`projectId` is set). Documents without a `projectId` follow standard org-scoped access.

---

## 3. Work Workflow

### Status Transition Diagram

```
                    ┌─────────┐
                    │ backlog │ ◄── initial state
                    └────┬────┘
                         │ assign-and-todo (set assignee)
                         ▼
                    ┌─────────┐
                    │  todo   │ ◄── unblock
                    └────┬────┘
                         │ start
                         ▼
                  ┌─────────────┐
             ┌──► │ in_progress │
             │    └──────┬──────┘
             │           │  block
             │           ▼
             │      ┌─────────┐
             │      │ blocked │
             │      └─────────┘
             │
             │    ┌─────────────┐
             │    │ in_progress │
             │    └──────┬──────┘
             │           │  request-review
             │           ▼
             │      ┌────────┐
             └───── │ review │ (reject-review → back to todo)
                    └───┬────┘
                        │ complete
                        ▼
                    ┌──────┐
                    │ done │ ◄── reopen → in_progress
                    └──────┘

  Any status ──► cancelled (cancel action)
  cancelled  ──► in_progress (reopen)
  done       ──► in_progress (reopen)
```

### Action Reference

| Action | Endpoint | From Status | To Status | Required Body | Notes |
|--------|----------|-------------|-----------|---------------|-------|
| Assign & move to todo | `POST /:id/assign-and-todo` | `backlog` | `todo` | `{ assignee }` | Sets assignee |
| Start | `POST /:id/start` | `todo` | `in_progress` | — | |
| Block | `POST /:id/block` | `in_progress` | `blocked` | `{ reason }` | Stores reason on work |
| Unblock | `POST /:id/unblock` | `blocked` | `todo` | `{ feedback? }` | Clears blocked state |
| Request Review | `POST /:id/request-review` | `in_progress` | `review` | — | |
| Complete | `POST /:id/complete` | `review` | `done` | — | For recurring tasks: resets to `todo` and recalculates `startAt` |
| Reject Review | `POST /:id/reject-review` | `review` | `todo` | `{ feedback }` | Stores reviewer feedback |
| Cancel | `POST /:id/cancel` | any | `cancelled` | — | For recurring works: deactivates recurrence (preserves config) |
| Reopen | `POST /:id/reopen` | `done` or `cancelled` | `in_progress` | — | For works with recurrence: restores `isRecurring` and recalculates `startAt` |

### Epic Status Auto-Recalculation

When all child tasks of an `epic` are `done`, the epic's status is automatically recalculated. Manual recalculation can be triggered via `POST /:id/recalculate-status`.

### Recurring Tasks

Works of `type=task` with a `recurrence` config:
- `isRecurring: true` when recurrence is active.
- On `complete`: status resets to `todo`, `startAt` is recalculated to the next schedule time.
- On `cancel`: `isRecurring` is set to `false` (config preserved for reopen).
- On `reopen` (from cancelled): `isRecurring` is restored and `startAt` recalculated.

### Next Work Priority Logic

The `GET /works/next-work` endpoint returns the highest-priority work for a given user/agent using this priority order:

| Priority | Description |
|----------|-------------|
| 1 | Recurring scheduled task (past `startAt`, assigned to me) |
| 2 | Subtask (assigned to me, in `todo`) |
| 3 | Task (assigned to me, in `todo`, dependencies met) |
| 4 | Blocked work (reported by me, still blocked) |
| 5 | Work in review (reported by me) |
| 0 | No work available |

---

## 4. API Reference

All endpoints require `Authorization: Bearer <token>` unless stated otherwise.

Query strings support MongoDB operators via `parseQueryString`:

| Syntax | Meaning | Example |
|--------|---------|---------|
| `field=value` | Exact match | `status=active` |
| `field:gt=value` | Greater than | `createdAt:gt=2025-01-01` |
| `field:gte=value` | Greater than or equal | `createdAt:gte=2025-01-01` |
| `field:lt=value` | Less than | `createdAt:lt=2025-12-31` |
| `field:lte=value` | Less than or equal | `createdAt:lte=2025-12-31` |
| `field:ne=value` | Not equal | `status:ne=cancelled` |
| `field:in=a,b,c` | In array | `status:in=todo,in_progress` |
| `field:nin=a,b` | Not in array | `status:nin=done,cancelled` |
| `field:regex=pattern` | Regex (case-insensitive) | `name:regex=launch` |
| `sort=field:desc,field2:asc` | Sorting | `sort=createdAt:desc` |
| `page=1&limit=20` | Pagination | `page=2&limit=10` |

---

### 4.1 Project APIs

#### `POST /projects` — Create Project

Creates a new project. Status is forced to `draft`. The caller is automatically added as a member if a `lead` is specified.

**Auth:** JWT required

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Project name (max 200) |
| `summary` | string | ❌ | Public summary (max 500) |
| `description` | string | ❌ | Private description (max 2000) |
| `lead` | `{ type, id }` | ❌ | Project lead — added as first member with `project.lead` role |
| `members` | array of `{ type, id, role }` | ❌ | Initial members list |
| `startDate` | ISO 8601 date | ❌ | Planned start date |
| `endDate` | ISO 8601 date | ❌ | Planned end date |
| `tags` | string[] | ❌ | Categorization tags |

**Response:** `201 Created` — full Project object

---

#### `GET /projects` — List Projects

Returns paginated list of projects visible to the caller. Non-members see only public fields.

**Auth:** JWT required

**Query:** `parseQueryString` operators + `search` (searches name, summary, description, tags)

**Response:** `200 OK` — paginated list with statistics

---

#### `GET /projects/:id` — Get Project

**Auth:** JWT required

**Response:** `200 OK` — full Project (or public-only view for non-members)

---

#### `PATCH /projects/:id` — Update Project

Updates project metadata. Status changes via action endpoints. Members managed via member endpoints.

**Auth:** JWT required
**Access:** project.lead or org.owner

**Body:** (all optional)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Updated name |
| `summary` | string | Updated public summary |
| `description` | string | Updated private description |
| `startDate` | ISO 8601 date | Updated start date |
| `endDate` | ISO 8601 date | Updated end date |
| `tags` | string[] | Updated tags |

**Response:** `200 OK` — updated Project object

---

#### `DELETE /projects/:id` — Delete Project

Soft deletes a project. Only allowed when status is `completed` or `archived`.

**Auth:** JWT required
**Access:** project.lead or org.owner

**Response:** `200 OK` — deleted Project object

---

#### `GET /projects/:id/members` — List Members

**Auth:** JWT required
**Access:** project.member or above

**Response:** `200 OK` — array of `{ type, id, role }`

---

#### `POST /projects/:id/members` — Add Member

**Auth:** JWT required
**Access:** project.lead or org.owner

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `user` or `agent` |
| `id` | string | ✅ | User or Agent ObjectId |
| `role` | string | ✅ | `project.lead` or `project.member` |

**Response:** `201 Created` — updated members array

---

#### `PATCH /projects/:id/members/:memberId` — Update Member Role

**Auth:** JWT required
**Access:** project.lead or org.owner

**Params:** `memberId` = User or Agent ObjectId string

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | ✅ | `project.lead` or `project.member` |

**Response:** `200 OK` — updated members array

---

#### `DELETE /projects/:id/members/:memberId` — Remove Member

**Auth:** JWT required
**Access:** project.lead or org.owner

**Params:** `memberId` = User or Agent ObjectId string

**Response:** `200 OK` — updated members array

---

#### State Transition Endpoints

All require JWT + project.lead or org.owner access.

| Endpoint | Transition | Description |
|----------|-----------|-------------|
| `POST /projects/:id/activate` | `draft → active` | Activate the project |
| `POST /projects/:id/hold` | `active → on_hold` | Put project on hold |
| `POST /projects/:id/resume` | `on_hold → active` | Resume from hold |
| `POST /projects/:id/complete` | `active → completed` | Mark project as completed |
| `POST /projects/:id/archive` | `completed → archived` | Archive the project |

**Response:** `200 OK` — updated Project object

---

### 4.2 Work APIs

#### `POST /works` — Create Work

**Auth:** JWT required
**Access:** If `projectId` is set — project.lead or org.owner only

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ | Work title (max 200) |
| `type` | string | ✅ | `epic`, `task`, or `subtask` — immutable after creation |
| `reporter` | `{ type, id }` | ✅ | Who is reporting the work |
| `description` | string | ❌ | Markdown description (max 10000) |
| `projectId` | string | ❌ | Link to a Project |
| `assignee` | `{ type, id }` | ❌ | Initial assignee |
| `dueDate` | ISO 8601 date | ❌ | Deadline |
| `startAt` | ISO 8601 date | ❌ | Scheduled execution time |
| `status` | string | ❌ | Initial status (default: `backlog`) |
| `dependencies` | string[] | ❌ | Work IDs that must be done first |
| `parentId` | string | ❌ | Parent Work ID (for subtasks) |
| `documents` | string[] | ❌ | Related document IDs |
| `recurrence` | RecurrenceConfig | ❌ | Recurrence schedule (task only) |

**Response:** `201 Created` — full Work object

---

#### `GET /works` — List Works

**Auth:** JWT required

**Query:** `parseQueryString` operators. Common filters:
- `projectId=<id>` — filter by project
- `status:in=todo,in_progress` — filter by status
- `type=task` — filter by type
- `assignee.id=<id>` — filter by assignee
- `sort=createdAt:desc&page=1&limit=20`

**Response:** `200 OK` — paginated list with statistics

---

#### `GET /works/next-work` — Get Next Work

Returns the highest-priority next work for a user or agent.

**Auth:** JWT required

**Query:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `assigneeType` | string | ✅ | `user` or `agent` |
| `assigneeId` | string | ✅ | User or Agent ID |

**Response:** `200 OK`
```json
{
  "work": { ... },
  "metadata": {
    "priorityLevel": 2,
    "priorityDescription": "Assigned task in todo status",
    "matchedCriteria": ["assigned_to_me", "task", "status_todo"]
  }
}
```

---

#### `GET /works/:id` — Get Work

**Auth:** JWT required

**Response:** `200 OK` — full Work object

---

#### `PATCH /works/:id` — Update Work

Updates work metadata. `type`, `status`, and `reason` cannot be updated via this endpoint.

**Auth:** JWT required
**Access:** If linked to a project — project.lead or org.owner only

**Body:** (all optional) — same fields as CreateWorkDto except `type` and `reporter`

> Set `recurrence: null` to remove recurrence from a task.

**Response:** `200 OK` — updated Work object

---

#### `DELETE /works/:id` — Delete Work

Soft deletes a work. Only allowed when status is `done` or `cancelled`.

**Auth:** JWT required
**Access:** If linked to a project — project.lead or org.owner only

**Response:** `200 OK` — deleted Work object

---

#### Work Action Endpoints

All require JWT. State transitions are available to project.member and above.

**`POST /works/:id/assign-and-todo`** — Assign and move to todo

Body: `{ "assignee": { "type": "user", "id": "<id>" } }`

---

**`POST /works/:id/start`** — Start work (`todo → in_progress`)

Body: none

---

**`POST /works/:id/block`** — Block work (`in_progress → blocked`)

Body: `{ "reason": "Waiting for API design..." }` (required, max 1000)

---

**`POST /works/:id/unblock`** — Unblock work (`blocked → todo`)

Body: `{ "feedback": "Blocker resolved..." }` (optional, max 2000)

---

**`POST /works/:id/request-review`** — Request review (`in_progress → review`)

Body: none

---

**`POST /works/:id/reject-review`** — Reject review (`review → todo`)

Body: `{ "feedback": "Does not meet acceptance criteria..." }` (required, max 2000)

---

**`POST /works/:id/complete`** — Complete work (`review → done`)

Body: none. For recurring tasks: resets to `todo`, recalculates `startAt`.

---

**`POST /works/:id/cancel`** — Cancel work (any → `cancelled`)

Body: none. For recurring works: sets `isRecurring: false`.

---

**`POST /works/:id/reopen`** — Reopen work (`done` or `cancelled` → `in_progress`)

Body: none. For works with recurrence config: restores `isRecurring` and recalculates `startAt`.

---

**`POST /works/:id/recalculate-status`** — Recalculate epic status

Only applies to `type=epic`. Recalculates status based on child task statuses.

---

**`GET /works/:id/can-trigger`** — Check if work can trigger agent

Returns whether the work is ready to trigger an agent execution (assigned to agent, `startAt` reached, status ready, not blocked).

---

#### Internal API

**`POST /works/internal/next-work`** — Get Next Work (Service-to-Service)

Protected by API Key (not JWT). Used by other services.

Body:
```json
{
  "assigneeType": "agent",
  "assigneeId": "<agentId>",
  "orgId": "<orgId>"
}
```

---

### 4.3 Document APIs

#### `POST /documents` — Create Document

**Auth:** JWT required
**Access:** If `projectId` is set — project.member or above

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `summary` | string | ✅ | Document title/summary (max 500) |
| `content` | string | ✅ | Document content |
| `type` | string | ✅ | `html`, `text`, `markdown`, or `json` |
| `labels` | string[] | ✅ | Labels for categorization |
| `projectId` | string | ❌ | Link to a Project |

**Response:** `201 Created` — full Document object (status set to `draft`)

---

#### `GET /documents` — List Documents

**Auth:** JWT required

**Query:** `parseQueryString` operators + `search` (searches summary and content)

**Response:** `200 OK` — paginated list with statistics

---

#### `GET /documents/:id` — Get Document

**Auth:** JWT required

**Response:** `200 OK` — Document object (without `content` field — use `/content` endpoint for content)

---

#### `GET /documents/:id/content` — Get Document Content

Returns raw document content with appropriate MIME type header.

**Auth:** JWT required

**Response:** `200 OK` with Content-Type header matching document type

---

#### `PATCH /documents/:id` — Update Document

Updates document metadata and/or content.

**Auth:** JWT required
**Access:** If linked to a project — project.member or above

**Body:** (all optional)

| Field | Type | Description |
|-------|------|-------------|
| `summary` | string | Updated title/summary |
| `content` | string | Updated content |
| `type` | string | Updated content type |
| `labels` | string[] | Updated labels |
| `status` | string | `draft`, `published`, or `archived` |
| `projectId` | string | Updated project link |

**Response:** `200 OK` — updated Document object

---

#### `PATCH /documents/:id/content` — Update Document Content (Advanced)

Supports targeted content operations without replacing the entire content.

**Auth:** JWT required
**Access:** If linked to a project — project.member or above

**Body:**

| Field | Type | Required when | Description |
|-------|------|---------------|-------------|
| `operation` | string | ✅ | Operation type (see below) |
| `content` | string | `replace`, `append` | New content / content to append |
| `find` | string | `find-replace-text` | Text to find |
| `replace` | string | `find-replace-*` | Replacement text |
| `pattern` | string | `find-replace-regex` | Regex pattern |
| `flags` | string | `find-replace-regex` | Regex flags (default: `g`) |
| `section` | string | `find-replace-markdown`, `append-to-section` | Markdown heading to target |
| `sectionContent` | string | `find-replace-markdown` | New section content |

**Operations:**

| Operation | Description |
|-----------|-------------|
| `replace` | Replace entire content with `content` field |
| `find-replace-text` | Find exact text and replace |
| `find-replace-regex` | Find by regex pattern and replace |
| `find-replace-markdown` | Find a markdown section by heading and replace its content |
| `append` | Append `content` to end of document |
| `append-after-text` | Append content after a specific text occurrence |
| `append-to-section` | Append content to end of a markdown section |

**Response:** `200 OK` — updated Document object

---

#### `DELETE /documents/:id` — Delete Document

Soft deletes a document.

**Auth:** JWT required
**Access:** If linked to a project — project.lead or org.owner only

**Response:** `200 OK` — deleted Document object

---

#### `POST /documents/:id/share` — Create Share Link

Generates a time-limited public share link for a document.

**Auth:** JWT required

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ttl` | number | ❌ | Time-to-live in seconds (min: 60, max: 86400, default: 3600) |

**Response:** `201 Created`
```json
{
  "token": "<jwt-token>",
  "url": "http://localhost:3004/documents/shared/<token>",
  "expiresAt": "2025-01-01T09:00:00.000Z"
}
```

---

#### `GET /documents/shared/:token` — View Shared Document

Public endpoint — no authentication required.

**Query:** `render=true` — render content as HTML page (markdown → HTML, html → page, text → `<pre>`)

**Response:**
- Without `render=true`: raw content with MIME type header
- With `render=true`: full HTML page with styling

**Error Responses:**
- `410 Gone` — share link has expired
- `400 Bad Request` — invalid token
- `404 Not Found` — document not found
