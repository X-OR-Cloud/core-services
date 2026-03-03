# Work API Reference

Base URL: `https://api.x-or.cloud/dev/aiwm`

Auth: tất cả endpoint (trừ Internal) yêu cầu header `Authorization: Bearer <JWT_TOKEN>`

---

## Workflow tổng quan

```
backlog ──assign-and-todo──► todo ──start──► in_progress ──request-review──► review ──complete──► done
                               ▲                 │                             │
                               │              block                      reject-review
                               │                 ▼                             │
                               └──unblock── blocked                            └──► todo

Recurring: review ──complete──► todo (auto reset + tính startAt mới)
Recurring: in_progress ──complete──► todo (skip review)
Onetime:   complete ──► done (isRecurring = false)
Bất kỳ status ──cancel──► cancelled
done/cancelled ──reopen──► in_progress
```

Khi tạo work có `recurrence`: status auto = `todo` (bỏ qua backlog), `assignee` bắt buộc.

---

## 1. CRUD Endpoints

### POST /works - Tạo work mới

```bash
curl -X POST http://localhost:3004/works \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement login feature",
    "description": "## Requirements\n- JWT tokens\n- Refresh token",
    "type": "task",
    "reporter": { "type": "user", "id": "507f1f77bcf86cd799439011" },
    "assignee": { "type": "agent", "id": "507f1f77bcf86cd799439012" },
    "projectId": "proj_001",
    "dueDate": "2026-03-31T23:59:59.000Z",
    "startAt": "2026-03-03T09:00:00.000Z",
    "dependencies": ["507f1f77bcf86cd799439013"],
    "parentId": "507f1f77bcf86cd799439014",
    "documents": ["doc_001"]
  }'
```

**Response** `201`:
```json
{
  "_id": "68a0b42aa3e13ba845450001",
  "title": "Implement login feature",
  "description": "## Requirements\n- JWT tokens\n- Refresh token",
  "type": "task",
  "status": "backlog",
  "reporter": { "type": "user", "id": "507f1f77bcf86cd799439011" },
  "assignee": { "type": "agent", "id": "507f1f77bcf86cd799439012" },
  "projectId": "proj_001",
  "dueDate": "2026-03-31T23:59:59.000Z",
  "startAt": "2026-03-03T09:00:00.000Z",
  "dependencies": ["507f1f77bcf86cd799439013"],
  "parentId": "507f1f77bcf86cd799439014",
  "documents": ["doc_001"],
  "isRecurring": false,
  "owner": { "userId": "...", "orgId": "..." },
  "createdBy": { "userId": "...", "orgId": "..." },
  "createdAt": "2026-03-03T02:00:00.000Z",
  "updatedAt": "2026-03-03T02:00:00.000Z"
}
```

#### Tạo work recurring (interval 5 phút)

```bash
curl -X POST http://localhost:3004/works \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Health check every 5 minutes",
    "type": "task",
    "reporter": { "type": "user", "id": "507f1f77bcf86cd799439011" },
    "assignee": { "type": "agent", "id": "507f1f77bcf86cd799439012" },
    "recurrence": {
      "type": "interval",
      "intervalMinutes": 5,
      "timezone": "Asia/Ho_Chi_Minh"
    }
  }'
```

**Response** `201` - status auto = `todo`, `isRecurring` = true, `startAt` auto tính:
```json
{
  "_id": "68a0b42aa3e13ba845450002",
  "title": "Health check every 5 minutes",
  "type": "task",
  "status": "todo",
  "isRecurring": true,
  "startAt": "2026-03-03T02:05:00.000Z",
  "recurrence": {
    "type": "interval",
    "intervalMinutes": 5,
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "reporter": { "type": "user", "id": "507f1f77bcf86cd799439011" },
  "assignee": { "type": "agent", "id": "507f1f77bcf86cd799439012" }
}
```

#### Tạo work onetime (lên lịch 1 lần)

```bash
curl -X POST http://localhost:3004/works \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy v2.0 to production",
    "type": "task",
    "reporter": { "type": "user", "id": "507f1f77bcf86cd799439011" },
    "assignee": { "type": "agent", "id": "507f1f77bcf86cd799439012" },
    "startAt": "2026-03-05T03:00:00.000Z",
    "recurrence": { "type": "onetime" }
  }'
```

**Response** `201` - `startAt` bắt buộc phải truyền:
```json
{
  "_id": "68a0b42aa3e13ba845450003",
  "title": "Deploy v2.0 to production",
  "type": "task",
  "status": "todo",
  "isRecurring": true,
  "startAt": "2026-03-05T03:00:00.000Z",
  "recurrence": { "type": "onetime" }
}
```

#### Recurrence types

| Type | Required fields | Ví dụ |
|------|----------------|-------|
| `onetime` | `startAt` trên Work | Chạy 1 lần vào thời điểm chỉ định |
| `interval` | `intervalMinutes` (1-525600) | Mỗi 5 phút |
| `daily` | `timesOfDay` (["09:00","14:00"]) | Mỗi ngày lúc 9h, 14h |
| `weekly` | `timesOfDay`, `daysOfWeek` (0-6, 0=CN) | Thứ 2,4 lúc 9h |
| `monthly` | `timesOfDay`, `daysOfMonth` (1-31) | Ngày 1,15 lúc 9h |

---

### GET /works - Danh sách works (có pagination + statistics)

```bash
curl "http://localhost:3004/works?page=1&limit=10&status=todo&type=task&sort=createdAt:desc" \
  -H "Authorization: Bearer $TOKEN"
```

**Query string operators**: `?field:gt=`, `:gte=`, `:lt=`, `:lte=`, `:ne=`, `:in=a,b`, `:nin=`, `:regex=`

**Response** `200`:
```json
{
  "data": [
    {
      "_id": "68a0b42aa3e13ba845450001",
      "title": "Implement login feature",
      "type": "task",
      "status": "todo",
      "reporter": { "type": "user", "id": "..." },
      "assignee": { "type": "agent", "id": "..." },
      "isRecurring": false,
      "createdAt": "2026-03-03T02:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  },
  "statistics": {
    "total": 25,
    "byStatus": { "backlog": 5, "todo": 10, "in_progress": 3, "review": 2, "done": 5 },
    "byType": { "epic": 2, "task": 18, "subtask": 5 }
  }
}
```

> **Note**: field `description` bị loại khỏi response để giảm dung lượng.

---

### GET /works/:id - Chi tiết work

```bash
curl http://localhost:3004/works/68a0b42aa3e13ba845450001 \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `200`: Trả về đầy đủ tất cả fields (bao gồm `description`).

---

### PATCH /works/:id - Cập nhật work

Không thể cập nhật: `type`, `status`, `reason` (dùng action endpoints).

```bash
curl -X PATCH http://localhost:3004/works/68a0b42aa3e13ba845450001 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated title",
    "assignee": { "type": "agent", "id": "new_agent_id" },
    "recurrence": { "type": "daily", "timesOfDay": ["10:00"] }
  }'
```

Xoá recurrence: `"recurrence": null` -> set `isRecurring = false`.

---

### DELETE /works/:id - Soft delete (chỉ done/cancelled)

```bash
curl -X DELETE http://localhost:3004/works/68a0b42aa3e13ba845450001 \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `200`: Trả về work đã xoá mềm (có `deletedAt`).

---

## 2. Action Endpoints (chuyển status)

### POST /works/:id/assign-and-todo
**Transition**: `backlog` -> `todo`

```bash
curl -X POST http://localhost:3004/works/:id/assign-and-todo \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignee": { "type": "agent", "id": "507f1f77bcf86cd799439012" }
  }'
```

**Response** `201`: Work object với `status: "todo"`, `assignee` đã set.

---

### POST /works/:id/start
**Transition**: `todo` -> `in_progress`

```bash
curl -X POST http://localhost:3004/works/:id/start \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `201`: Work object với `status: "in_progress"`.

---

### POST /works/:id/block
**Transition**: `in_progress` -> `blocked`

```bash
curl -X POST http://localhost:3004/works/:id/block \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Waiting for API design to be finalized"
  }'
```

**Response** `201`: Work object với `status: "blocked"`, `reason` đã set.

---

### POST /works/:id/unblock
**Transition**: `blocked` -> `todo`

```bash
curl -X POST http://localhost:3004/works/:id/unblock \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "feedback": "API design finalized. Ready to continue."
  }'
```

**Response** `201`: Work object với `status: "todo"`, `reason: null`, `feedback` đã set.

---

### POST /works/:id/request-review
**Transition**: `in_progress` -> `review`

```bash
curl -X POST http://localhost:3004/works/:id/request-review \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `201`: Work object với `status: "review"`.

---

### POST /works/:id/reject-review
**Transition**: `review` -> `todo`

```bash
curl -X POST http://localhost:3004/works/:id/reject-review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "feedback": "Please add unit tests before review."
  }'
```

**Response** `201`: Work object với `status: "todo"`, `feedback` đã set.

---

### POST /works/:id/complete
**Transition**: `review` -> `done`

Đặc biệt cho recurring/onetime:

| Loại | Từ status | Kết quả |
|------|-----------|---------|
| Thường | `review` | `status: "done"` |
| Recurring | `in_progress` hoặc `review` | `status: "todo"`, `startAt` tính lại cho cycle tiếp theo |
| Onetime | `in_progress` hoặc `review` | `status: "done"`, `isRecurring: false` |

```bash
curl -X POST http://localhost:3004/works/:id/complete \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `201` (recurring):
```json
{
  "_id": "68a0b42aa3e13ba845450002",
  "title": "Health check every 5 minutes",
  "status": "todo",
  "isRecurring": true,
  "startAt": "2026-03-03T02:10:00.000Z",
  "recurrence": { "type": "interval", "intervalMinutes": 5 }
}
```

**Response** `201` (onetime):
```json
{
  "_id": "68a0b42aa3e13ba845450003",
  "title": "Deploy v2.0 to production",
  "status": "done",
  "isRecurring": false,
  "recurrence": { "type": "onetime" }
}
```

---

### POST /works/:id/reopen
**Transition**: `done`/`cancelled` -> `in_progress`

Nếu work có `recurrence` config: khôi phục `isRecurring = true`, tính lại `startAt`.

```bash
curl -X POST http://localhost:3004/works/:id/reopen \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `201`: Work object với `status: "in_progress"`.

---

### POST /works/:id/cancel
**Transition**: bất kỳ status -> `cancelled`

Recurring works: set `isRecurring = false` (giữ `recurrence` config để có thể reopen).

```bash
curl -X POST http://localhost:3004/works/:id/cancel \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `201`: Work object với `status: "cancelled"`.

---

### POST /works/:id/recalculate-status
Tính lại status của epic dựa trên child tasks.

```bash
curl -X POST http://localhost:3004/works/:id/recalculate-status \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /works/:id/can-trigger
Kiểm tra work có đủ điều kiện trigger agent execution không.

```bash
curl "http://localhost:3004/works/:id/can-trigger" \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `200`:
```json
{
  "canTrigger": true,
  "reason": "All conditions met",
  "work": { "..." }
}
```

Điều kiện: assignee là agent, có startAt, startAt <= now, status = todo/in_progress, không có dependencies.

---

## 3. Next Work (Priority-based)

### GET /works/next-work - Lấy work tiếp theo (JWT Auth)

```bash
curl "http://localhost:3004/works/next-work?assigneeType=agent&assigneeId=507f1f77bcf86cd799439012" \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `200` (có work):
```json
{
  "work": {
    "_id": "68a0b42aa3e13ba845450002",
    "title": "Health check every 5 minutes",
    "type": "task",
    "status": "todo",
    "isRecurring": true,
    "startAt": "2026-03-03T02:00:00.000Z",
    "assignee": { "type": "agent", "id": "507f1f77bcf86cd799439012" },
    "reporter": { "type": "user", "id": "507f1f77bcf86cd799439011" },
    "recurrence": { "type": "interval", "intervalMinutes": 5 }
  },
  "metadata": {
    "priorityLevel": 1,
    "priorityDescription": "Recurring task with scheduled time reached",
    "matchedCriteria": ["assigned_to_me", "task", "recurring", "status_todo", "startAt_reached", "no_subtasks", "dependencies_met"]
  }
}
```

**Response** `200` (không có work):
```json
{
  "work": null,
  "metadata": {
    "priorityLevel": 0,
    "priorityDescription": "No work available",
    "matchedCriteria": []
  }
}
```

#### Priority levels

| Level | Mô tả | Điều kiện |
|-------|--------|-----------|
| 1 | Recurring task đến giờ | `isRecurring=true`, `status=todo`, `startAt <= now`, không có subtasks, dependencies met |
| 2 | Subtask được assign | `type=subtask`, `status=todo`, dependencies met |
| 3 | Task thường được assign | `type=task`, `status=todo`, không có subtasks, `startAt` null hoặc `<= now`, dependencies met |
| 4 | Work bị blocked (reporter) | `reporter=me`, `status=blocked` |
| 5 | Work cần review (reporter) | `reporter=me`, `status=review` |
| 0 | Không có work | - |

---

### POST /works/internal/next-work - Internal API (API Key Auth)

Dùng cho service-to-service. Auth qua header `x-api-key`.

```bash
curl -X POST http://localhost:3004/works/internal/next-work \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assigneeType": "agent",
    "assigneeId": "507f1f77bcf86cd799439012",
    "orgId": "org_001"
  }'
```

**Response**: cùng format với `GET /works/next-work`, thêm filter theo `orgId`.

---

## 4. Agent Heartbeat (AIWM Service)

Base URL: `http://localhost:3003` (hoặc port AIWM đang chạy)

### POST /agents/:id/heartbeat

Agent gửi heartbeat mỗi chu kỳ (mặc định 1 phút). Khi `status=idle`, AIWM tự gọi CBM `GET /works/next-work` để lấy work và trả kèm `systemMessage`.

```bash
curl -X POST http://localhost:3003/agents/68a0b42aa3e13ba845450099/heartbeat \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "idle",
    "metrics": { "cpu": 12, "memory": 45 }
  }'
```

**Body**:
| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `status` | `"idle"` \| `"busy"` | Yes | Trạng thái hiện tại của agent |
| `metrics` | object | No | Thông tin metrics tùy ý |

**Response** `200` (idle, có work):
```json
{
  "success": true,
  "work": {
    "id": "68a0b42aa3e13ba845450002",
    "title": "Health check every 5 minutes",
    "type": "task",
    "status": "todo",
    "priorityLevel": 1
  },
  "systemMessage": "Bạn đang có công việc (Work) @work:68a0b42aa3e13ba845450002 \"Health check every 5 minutes\" cần thực hiện ngay không cần hỏi lại.\n- Gọi mcp__Builtin__StartWork để bắt đầu công việc\n- Gọi mcp__Builtin__CompleteWork để hoàn tất công việc (recurring task - không cần review)\n- Gọi mcp__Builtin__BlockWork nếu gặp vướng mắc sau 3 lần cố gắng xử lý (kèm reason)"
}
```

**Response** `200` (idle, không có work):
```json
{
  "success": true
}
```

**Response** `200` (busy):
```json
{
  "success": true
}
```

#### systemMessage theo priority

| Priority | Loại work | systemMessage hướng dẫn |
|----------|-----------|------------------------|
| 1-3 | Recurring task | StartWork -> **CompleteWork** (bỏ qua review) |
| 1-3 | Self-assigned (reporter = assignee) | StartWork -> RequestReviewForWork -> CompleteWork |
| 1-3 | Thường | StartWork -> RequestReviewForWork (chờ review) |
| 4 | Blocked work | Xem xét vướng mắc -> UnblockWork hoặc CancelWork |
| 5 | Review work | Review kết quả -> CompleteWork hoặc RejectReview |

#### Flow heartbeat + recurring work

```
Agent idle ──heartbeat──► AIWM ──GET /works/next-work──► CBM
                                                           │
                              startAt <= now? ─── Yes ─► Priority 1 (recurring)
                                                 No  ─► Skip, check Priority 2-5
                                                           │
Agent nhận work + systemMessage ◄──────────────────────────┘
   │
   ├── StartWork (todo -> in_progress)
   ├── Thực hiện công việc
   └── CompleteWork (in_progress -> todo, tính startAt mới)
          │
          └── Agent idle, chờ heartbeat tiếp theo
               (startAt mới chưa đến -> không trả work -> agent nghỉ)
```

---

## Error Responses

Tất cả endpoint trả error theo format:

```json
{
  "statusCode": 400,
  "message": "Cannot start work with status: backlog. Only todo works can be started.",
  "error": "Bad Request",
  "correlationId": "abc-123-def"
}
```

| HTTP Code | Khi nào |
|-----------|---------|
| 400 | Validation lỗi, chuyển status không hợp lệ |
| 401 | Token không hợp lệ hoặc hết hạn |
| 403 | Không có quyền (RBAC) |
| 404 | Work không tìm thấy |
