# AIWM MCP Builtin Tools — Upgrade Plan

**Mục tiêu:** Cập nhật Builtin MCP Tools (ProjectManagement, WorkManagement, DocumentManagement) để tuân thủ đúng CBM API spec theo tài liệu `CBM-ENTITIES-AND-API.md`.

**Ngày tạo:** 2026-03-05

---

## Phạm vi thay đổi

| Module | Files | Loại thay đổi |
|--------|-------|---------------|
| ProjectManagement | `schemas.ts`, `executors.ts`, `tools.ts` | Schema fix + Tool mới |
| WorkManagement | `schemas.ts`, `executors.ts`, `tools.ts` | Schema fix + Tool mới |
| DocumentManagement | `schemas.ts`, `executors.ts` | Schema fix |

**Base path:** `services/aiwm/src/mcp/builtin/cbm/`

---

## 🔴 ProjectManagement (6 tasks)

### PM-1 — Sửa `CreateProjectSchema`
**File:** `project-management/schemas.ts`

| Vấn đề | Hiện tại | Đúng theo doc |
|--------|----------|---------------|
| Thiếu `summary` | Không có | `string`, max 500, optional — public summary nhìn thấy bởi mọi org member |
| Thiếu `lead` | Không có | `{ type: 'user'\|'agent', id: string }` optional — auto-added as project.lead member |
| `members` sai kiểu | `z.array(z.string())` (array of IDs) | `z.array({ type, id, role })` với role là `project.lead` hoặc `project.member` |

---

### PM-2 — Sửa `UpdateProjectSchema`
**File:** `project-management/schemas.ts`

| Vấn đề | Hiện tại | Đúng theo doc |
|--------|----------|---------------|
| Thiếu `summary` | Không có | `string`, max 500, optional |
| `members` sai kiểu | `z.array(z.string())` | `z.array({ type, id, role })` |

---

### PM-3 — Sửa executors `executeCreateProject` + `executeUpdateProject`
**File:** `project-management/executors.ts`

Cập nhật TypeScript type signature để khớp với schema mới:
- `executeCreateProject`: thêm `summary?: string`, `lead?: { type, id }`, sửa `members` type
- `executeUpdateProject`: thêm `summary?: string`, sửa `members` type

---

### PM-4 — Thêm 4 schemas cho Member Management
**File:** `project-management/schemas.ts`

Thêm mới:
- `ListProjectMembersSchema` — chỉ cần `projectId`
- `AddProjectMemberSchema` — `projectId`, `type`, `id`, `role`
- `UpdateProjectMemberSchema` — `projectId`, `memberId`, `role`
- `RemoveProjectMemberSchema` — `projectId`, `memberId`

CBM API tương ứng:
```
GET    /projects/:id/members              — List members (project.member+)
POST   /projects/:id/members              — Add member (project.lead+)
PATCH  /projects/:id/members/:memberId    — Update member role (project.lead+)
DELETE /projects/:id/members/:memberId    — Remove member (project.lead+)
```

---

### PM-5 — Thêm 4 executors cho Member Management
**File:** `project-management/executors.ts`

Thêm mới:
- `executeListProjectMembers(args: { projectId })` → `GET /projects/:id/members`
- `executeAddProjectMember(args: { projectId, type, id, role })` → `POST /projects/:id/members`
- `executeUpdateProjectMember(args: { projectId, memberId, role })` → `PATCH /projects/:id/members/:memberId`
- `executeRemoveProjectMember(args: { projectId, memberId })` → `DELETE /projects/:id/members/:memberId`

---

### PM-6 — Thêm 4 tools + export
**Files:** `project-management/tools.ts`, `project-management/index.ts`

Tool definitions mới:
- `ListProjectMembers` — "List all members of a project with their roles"
- `AddProjectMember` — "Add a user or agent as member of a project with a role (project.lead or project.member)"
- `UpdateProjectMember` — "Update a project member's role"
- `RemoveProjectMember` — "Remove a member from a project"

---

## 🟡 WorkManagement (5 tasks)

### WM-1 — Sửa `UnblockWorkSchema`
**File:** `work-management/schemas.ts`

| Vấn đề | Hiện tại | Đúng theo doc |
|--------|----------|---------------|
| Thiếu `feedback` | Không có | `string`, max 2000, optional — "Blocker resolved..." |

---

### WM-2 — Sửa `executeUnblockWork`
**File:** `work-management/executors.ts`

Cập nhật executor để truyền `feedback` vào request body:
```ts
// Hiện tại: body rỗng
// Sau khi sửa: body: JSON.stringify({ feedback })  (nếu feedback có giá trị)
```

---

### WM-3 — Sửa `RecurrenceTypeEnum`
**File:** `work-management/schemas.ts`

| Vấn đề | Hiện tại | Đúng theo doc |
|--------|----------|---------------|
| Thiếu `onetime` | `['interval', 'daily', 'weekly', 'monthly']` | Thêm `'onetime'` — dùng cho ScheduleWork |

> **Lưu ý:** `executeScheduleWork` đang hard-code `recurrence: { type: 'onetime' }` — đây là đúng, nhưng RecurrenceTypeEnum trong schema cần phải include `onetime` để đồng bộ.

---

### WM-4 — Sửa `ReopenWork` description
**File:** `work-management/tools.ts`

| Hiện tại | Đúng theo doc |
|----------|---------------|
| "Reopen completed work - transition from done to in_progress status" | "Reopen completed or cancelled work - transition from done or cancelled to in_progress status" |

---

### WM-5 — Thêm tool `CanTriggerWork`
**Files:** `work-management/schemas.ts`, `work-management/executors.ts`, `work-management/tools.ts`

CBM API: `GET /works/:id/can-trigger`

Trả về: work có sẵn sàng trigger agent execution không (assigned to agent, `startAt` đã đến, status ready, không bị blocked).

Schema:
```ts
CanTriggerWorkSchema = z.object({
  id: z.string().describe('Work ID to check if it can trigger agent execution'),
})
```

---

## 🟡 DocumentManagement (2 tasks)

### DM-1 — Sửa `CreateDocumentSchema.labels`
**File:** `document-management/schemas.ts`

| Vấn đề | Hiện tại | Đúng theo doc |
|--------|----------|---------------|
| `labels` optional | `.array(z.string()).optional()` | `.array(z.string())` — required theo CBM API spec (✅ required) |

---

### DM-2 — Sửa `UpdateDocumentSchema` + `executeUpdateDocument`
**File:** `document-management/schemas.ts`, `document-management/executors.ts`

| Vấn đề | Hiện tại | Đúng theo doc |
|--------|----------|---------------|
| Thiếu `content` | Không có trong UpdateDocumentSchema | `string`, optional |
| Thiếu `type` | Không có trong UpdateDocumentSchema | `html\|text\|markdown\|json`, optional |

CBM API `PATCH /documents/:id` cho phép update cả `content` và `type` cùng với metadata.

---

## Build Verification

Sau khi hoàn thành tất cả tasks:

```bash
nx run aiwm:build
```

Xác nhận không có TypeScript compilation errors.

---

## Checklist

- [x] PM-1: Sửa `CreateProjectSchema` — thêm `summary`, `lead`, sửa `members`
- [x] PM-2: Sửa `UpdateProjectSchema` — thêm `summary`, sửa `members`
- [x] PM-3: Sửa executors `executeCreateProject` + `executeUpdateProject`
- [x] PM-4: Thêm 4 Member schemas
- [x] PM-5: Thêm 4 Member executors
- [x] PM-6: Thêm 4 Member tools + export
- [x] WM-1: Sửa `UnblockWorkSchema` — thêm `feedback`
- [x] WM-2: Sửa `executeUnblockWork` — truyền `feedback` vào body
- [x] WM-3: Sửa `RecurrenceTypeEnum` — thêm `onetime`
- [x] WM-4: Sửa `ReopenWork` description
- [x] WM-5: Thêm `CanTriggerWork` tool
- [x] DM-1: Sửa `CreateDocumentSchema.labels` — bỏ `.optional()`
- [x] DM-2: Sửa `UpdateDocumentSchema` + executor — thêm `content`, `type`
- [x] Build: `nx run aiwm:build` pass
