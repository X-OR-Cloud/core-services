# Work Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/cbm/src/modules/work/
├── work.schema.ts      # MongoDB schema (extends BaseSchema)
├── work.dto.ts         # DTOs: Create, Update, Block, AssignAndTodo, RejectReview, Unblock, GetNextWork, InternalGetNextWork
├── work.service.ts     # Business logic (extends BaseService) — state machine, epic management, next-work priority
├── work.controller.ts  # REST API endpoints (16 endpoints: CRUD + 9 actions + next-work + can-trigger + internal)
└── work.module.ts      # NestJS module (imports NotificationModule)
```

## 2. Mục đích

Work module quản lý work items (epics, tasks, subtasks) với state machine 7 trạng thái và 9 action endpoints. Hỗ trợ hierarchy (epic → task → subtask), dependency management, epic auto-status, agent triggering, và next-work priority logic.

## 3. Schema Fields

```
Work extends BaseSchema:
  title: string (required, max 200)                    // Tiêu đề
  description?: string (max 10000)                     // Mô tả chi tiết (markdown)
  type: 'epic' | 'task' | 'subtask' (required)         // Loại work
  projectId?: string                                   // Optional reference to Project
  reporter: ReporterAssignee (required)                 // Người report { type, id }
  assignee?: ReporterAssignee                           // Người được giao { type, id }
  dueDate?: Date                                       // Hạn chót
  startAt?: Date                                       // Thời điểm bắt đầu (cho agent scheduled execution)
  status: 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'cancelled' | 'review' | 'done' (default: 'backlog')
  dependencies: string[] (default: [])                  // Array of Work IDs phụ thuộc
  reason?: string (max 1000)                           // Lý do khi blocked
  feedback?: string (max 2000)                         // Feedback khi reject review / unblock
  parentId?: string                                    // Parent Work ID (hierarchy)
  documents: string[] (default: [])                    // Array of document IDs (planned for removal)
  // Inherited from BaseSchema: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
```

**ReporterAssignee**: `{ type: 'agent' | 'user', id: string }`

**Indexes**: `{ status: 1 }`, `{ type: 1 }`, `{ projectId: 1 }`, `{ 'reporter.id': 1 }`, `{ 'assignee.id': 1 }`, `{ parentId: 1 }`, `{ createdAt: -1 }`, `{ title: 'text', description: 'text' }`

## 4. Work Hierarchy

```
epic (không có parent)
  └── task (parent = epic, optional)
       └── subtask (parent = task, bắt buộc)
```

**Rules:**
- Epic: không thể có parentId
- Task: nếu có parentId, parent phải là epic
- Subtask: bắt buộc có parentId, parent phải là task

## 5. Status State Machine

```
backlog → todo → in_progress → review → done
                      ↓                    ↓
                   blocked              reopen → in_progress
                      ↓
                    todo (unblock)

any → cancelled (cancel)
```

**Transitions:**

| Action | From | To | Body |
|--------|------|----|------|
| `assign-and-todo` | backlog | todo | `{ assignee }` |
| `start` | todo | in_progress | — |
| `block` | in_progress | blocked | `{ reason }` |
| `unblock` | blocked | todo | `{ feedback? }` |
| `request-review` | in_progress | review | — |
| `complete` | review | done | — |
| `reject-review` | review | todo | `{ feedback }` |
| `reopen` | done | in_progress | — |
| `cancel` | any (trừ cancelled) | cancelled | — |

## 6. API Endpoints

### CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/works` | User JWT | Tạo work (status forced to `backlog`) |
| GET | `/works` | User JWT | Danh sách + statistics (byStatus, byType). Excludes `description` |
| GET | `/works/:id` | User JWT | Chi tiết work |
| PATCH | `/works/:id` | User JWT | Cập nhật (không cho update type, status, reason) |
| DELETE | `/works/:id` | User JWT | Soft delete (chỉ done/cancelled) |

### Action Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/works/:id/assign-and-todo` | User JWT | Gán assignee + chuyển backlog → todo |
| POST | `/works/:id/start` | User JWT | todo → in_progress |
| POST | `/works/:id/block` | User JWT | in_progress → blocked (cần reason) |
| POST | `/works/:id/unblock` | User JWT | blocked → todo (feedback optional) |
| POST | `/works/:id/request-review` | User JWT | in_progress → review |
| POST | `/works/:id/complete` | User JWT | review → done |
| POST | `/works/:id/reject-review` | User JWT | review → todo (cần feedback) |
| POST | `/works/:id/reopen` | User JWT | done → in_progress |
| POST | `/works/:id/cancel` | User JWT | any → cancelled |

### Special Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/works/:id/recalculate-status` | User JWT | Tính lại status cho epic dựa trên child tasks |
| GET | `/works/next-work` | User JWT | Lấy work tiếp theo theo priority rules |
| GET | `/works/:id/can-trigger` | User JWT | Kiểm tra work có thể trigger agent execution |
| POST | `/works/internal/next-work` | API Key | Internal API (service-to-service) |

## 7. findAll Response

`GET /works` trả về response kèm statistics:

```
{
  data: Work[]              // Excludes `description` field
  pagination: { total, page, limit }
  statistics: {
    total: number,
    byStatus: { backlog: N, todo: N, in_progress: N, ... },
    byType: { epic: N, task: N, subtask: N }
  }
}
```

## 8. Epic Auto-Status

Epic status tự động tính dựa trên child tasks:
- `in_progress`: Mặc định, hoặc khi có task chưa done/cancelled
- `done`: Tất cả tasks đều done (hoặc done + cancelled, có ít nhất 1 done)
- `cancelled`: Chỉ khi manually cancel (không auto-calculate)

Tự động trigger khi child task thay đổi status (start, complete, reopen, cancel).

## 9. Next-Work Priority Logic

Priority (cao → thấp):
1. Subtask assigned to me, status `todo`, dependencies met
2. Task assigned to me (không có subtasks), status `todo`, dependencies met
3. Work reported by me, status `blocked`
4. Work reported by me, status `review`

## 10. Agent Triggering

`GET /works/:id/can-trigger` kiểm tra 5 điều kiện:
1. Assignee phải là agent
2. Phải có `startAt`
3. Current time >= `startAt`
4. Status phải là `todo` hoặc `in_progress`
5. Không có dependencies

## 11. Immutable Fields (PATCH)

Các trường không thể update qua PATCH:
- `type`: Immutable sau khi tạo
- `status`: Chỉ thay đổi qua action endpoints
- `reason`: Managed bởi block/unblock actions

## 12. DTOs

### CreateWorkDto
- `title` (required): string, min 1, max 200
- `description` (optional): string, max 10000
- `type` (required): enum `['epic', 'task', 'subtask']`
- `projectId` (optional): string
- `reporter` (required): `ReporterAssigneeDto { type, id }`
- `assignee` (optional): `ReporterAssigneeDto { type, id }`
- `dueDate` (optional): Date
- `startAt` (optional): Date
- `status` (optional): enum — **sẽ bị override thành `'backlog'` bởi service**
- `dependencies` (optional): string[]
- `parentId` (optional): string
- `documents` (optional): string[]

### UpdateWorkDto
- All fields optional (trừ `type`, `status`, `reason` — không cho update)
- Same validations as CreateWorkDto

### Action DTOs
- `BlockWorkDto`: `{ reason: string }` (required, max 1000)
- `AssignAndTodoDto`: `{ assignee: ReporterAssigneeDto }` (required)
- `RejectReviewDto`: `{ feedback: string }` (required, max 2000)
- `UnblockWorkDto`: `{ feedback?: string }` (optional, max 2000)

### Query DTOs
- `GetNextWorkQueryDto`: `{ assigneeType: 'user' | 'agent', assigneeId: string }`
- `InternalGetNextWorkDto`: `{ assigneeType, assigneeId, orgId }` (for service-to-service)

## 13. Key Design Decisions

### Description tách biệt khỏi list
- `findAll()` excludes `description` → giảm response size

### Status chỉ thay đổi qua action endpoints
- PATCH update reject `status`, `type`, `reason`
- Mỗi action validate trạng thái hiện tại trước khi transition

### Soft delete có điều kiện
- Chỉ cho phép delete khi status = `done` hoặc `cancelled`

### Ownership filtering
- Mọi query filter theo `owner.orgId` từ JWT context
- Đảm bảo tenant isolation

### Notifications
- Service emit events qua `NotificationService` cho: work.created, work.blocked, work.review_requested, work.completed, work.assigned

## 14. Dependencies

- **MongooseModule**: Work schema registration
- **NotificationModule**: Event notification handling
- **BaseService** (`@hydrabyte/base`): CRUD operations, pagination, aggregation, RBAC

**Exports**: `WorkService`, `MongooseModule`

## 15. Existing Documentation

- `docs/cbm/work/FRONTEND-API.md` — Frontend API integration guide
- `docs/cbm/work/ROADMAP.md` — Planned improvements
- `docs/cbm/NEXT-WORK-PRIORITY-LOGIC.md` — Chi tiết next-work priority logic
