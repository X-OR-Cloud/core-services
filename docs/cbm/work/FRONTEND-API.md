# Work API — Frontend Integration

> Last updated: 2026-02-27
> Base URL: `https://api.x-or.cloud/dev/cbm`

---

## 1. Work Entity

Work là đơn vị công việc hỗ trợ 3 loại (epic, task, subtask) với state machine 7 trạng thái và 9 action endpoints.

### 1.1 Các trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `_id` | string | auto | MongoDB ObjectId |
| `title` | string | ✅ | Tiêu đề (max 200 ký tự) |
| `description` | string | ❌ | Mô tả chi tiết, markdown (max 10000). Không trả về trong list |
| `type` | enum | ✅ | `'epic'` \| `'task'` \| `'subtask'` |
| `projectId` | string | ❌ | Ref tới Project (optional) |
| `reporter` | object | ✅ | `{ type: 'agent' \| 'user', id: string }` |
| `assignee` | object | ❌ | `{ type: 'agent' \| 'user', id: string }` |
| `dueDate` | Date | ❌ | Hạn chót |
| `startAt` | Date | ❌ | Thời điểm bắt đầu (cho agent scheduled execution) |
| `status` | enum | auto | 7 trạng thái (default: `'backlog'`) |
| `dependencies` | string[] | ❌ | Array Work IDs phụ thuộc (default: `[]`) |
| `reason` | string | auto | Lý do blocked (managed by block/unblock actions) |
| `feedback` | string | auto | Feedback reject review / unblock resolution |
| `parentId` | string | ❌ | Parent Work ID (hierarchy) |
| `documents` | string[] | ❌ | Array document IDs (default: `[]`) |
| `recurrence` | object | ❌ | Cấu hình lặp lại (chỉ cho task). Xem mục 7 |
| `isRecurring` | boolean | auto | `true` khi recurrence active (default: `false`) |
| `owner` | object | auto | `{ orgId, userId }` — từ BaseSchema |
| `createdBy` | string | auto | User ID tạo work |
| `updatedBy` | string | auto | User/Agent ID cập nhật cuối |
| `createdAt` | Date | auto | Timestamp tạo |
| `updatedAt` | Date | auto | Timestamp cập nhật |
| `deletedAt` | Date | auto | Timestamp soft delete |

### 1.2 Status — Trạng thái

| Status | Ý nghĩa | Hiển thị gợi ý |
|--------|---------|----------------|
| `backlog` | Chưa phân công | ⚪ Backlog |
| `todo` | Đã phân công, sẵn sàng | 🔵 Todo |
| `in_progress` | Đang thực hiện | 🟡 In Progress |
| `blocked` | Bị chặn | 🔴 Blocked |
| `review` | Chờ review | 🟣 Review |
| `done` | Hoàn thành | 🟢 Done |
| `cancelled` | Đã hủy | ⚫ Cancelled |

### 1.3 Type — Loại work

| Type | Mô tả | Parent |
|------|--------|--------|
| `epic` | Nhóm công việc lớn | Không có parent |
| `task` | Công việc đơn lẻ | Parent = epic (optional) |
| `subtask` | Công việc con | Parent = task (bắt buộc) |

### 1.4 Hierarchy

```
epic (không parent)
  └── task (parent optional = epic)
       └── subtask (parent bắt buộc = task)
```

---

## 2. API Endpoints

Tất cả endpoints yêu cầu header `Authorization: Bearer <token>`.

### 2.1 Tạo work

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works` |
| **Auth** | User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `title` | string | ✅ | Tiêu đề (min 1, max 200) |
| `description` | string | ❌ | Mô tả (max 10000) |
| `type` | enum | ✅ | `'epic'` \| `'task'` \| `'subtask'` |
| `projectId` | string | ❌ | Ref tới Project |
| `reporter` | object | ✅ | `{ type: 'agent' \| 'user', id: 'ObjectId' }` |
| `assignee` | object | ❌ | `{ type: 'agent' \| 'user', id: 'ObjectId' }` |
| `dueDate` | Date | ❌ | Hạn chót |
| `startAt` | Date | ❌ | Thời điểm bắt đầu |
| `dependencies` | string[] | ❌ | Array Work IDs phụ thuộc |
| `parentId` | string | ❌ | Parent Work ID |
| `documents` | string[] | ❌ | Array document IDs |
| `recurrence` | object | ❌ | Cấu hình lặp lại (chỉ cho type=task). Xem mục 7 |

> Không cần truyền `status` — hệ thống tự đặt `backlog`.
> Nếu có `recurrence`, hệ thống tự set `isRecurring=true` và tính `startAt` nếu chưa truyền.

**Output:** Work object (full entity, status = `backlog`).

**Validation:**
- `reporter` phải là ObjectId hợp lệ
- `parentId` phải tuân thủ hierarchy rules (xem 1.4)
- Epic không thể có parentId

---

### 2.2 Danh sách works

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/works` |
| **Auth** | User JWT |

**Input (query params):**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `page` | number | Trang (default: 1) |
| `limit` | number | Số items/trang (default: 10) |
| `search` | string | Tìm kiếm trong title, description |
| `filter` | JSON string | Lọc theo các trường (xem bên dưới) |

**Filter format:** Truyền dưới dạng JSON string trong query parameter:

```
?filter={"status":"todo","type":"task","projectId":"abc123"}
```

Các trường hỗ trợ filter:
- `status` — Lọc theo status
- `type` — Lọc theo type
- `projectId` — Lọc theo project
- `parentId` — Lọc theo parent (children of epic/task)

**Output:**

```
{
  data: Work[],              // Không có trường `description`
  pagination: { page, limit, total },
  statistics: {
    total: number,
    byStatus: { backlog: N, todo: N, in_progress: N, blocked: N, review: N, done: N, cancelled: N },
    byType: { epic: N, task: N, subtask: N }
  }
}
```

> `description` bị exclude trong list response. Dùng GET `/works/:id` để lấy chi tiết.

---

### 2.3 Chi tiết work

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/works/:id` |
| **Auth** | User JWT |

**Output:** Work object đầy đủ (bao gồm `description`).

---

### 2.4 Cập nhật work

| | |
|---|---|
| **Method** | `PATCH` |
| **Path** | `/works/:id` |
| **Auth** | User JWT |

**Input (body):** Partial — chỉ gửi các trường cần cập nhật.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `title` | string | Tiêu đề mới |
| `description` | string | Mô tả mới |
| `projectId` | string | Project ID mới |
| `reporter` | object | Reporter mới |
| `assignee` | object | Assignee mới |
| `dueDate` | Date | Hạn chót mới |
| `startAt` | Date | Thời điểm bắt đầu mới |
| `dependencies` | string[] | Dependencies mới |
| `parentId` | string | Parent ID mới |
| `documents` | string[] | Document IDs mới |
| `recurrence` | object \| null | Cấu hình lặp mới. Set `null` để xóa recurrence |

> **Không thể update**: `type` (immutable), `status` (dùng action endpoints), `reason` (managed by block/unblock).

**Output:** Work object (đã cập nhật).

---

### 2.5 Xóa work (soft delete)

| | |
|---|---|
| **Method** | `DELETE` |
| **Path** | `/works/:id` |
| **Auth** | User JWT |

> Chỉ cho phép xóa work có status `done` hoặc `cancelled`.

**Output:** Work object với `deletedAt` timestamp.

---

## 3. Action Endpoints

Tất cả action endpoints dùng method `POST`.

### 3.1 Assign and Todo

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/assign-and-todo` |
| **Transition** | `backlog` → `todo` |

**Input:**
```
{ "assignee": { "type": "user", "id": "507f1f77bcf86cd799439011" } }
```

---

### 3.2 Start

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/start` |
| **Transition** | `todo` → `in_progress` |

**Input:** Không cần body.

---

### 3.3 Block

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/block` |
| **Transition** | `in_progress` → `blocked` |

**Input:**
```
{ "reason": "Waiting for API design to be finalized" }
```

---

### 3.4 Unblock

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/unblock` |
| **Transition** | `blocked` → `todo` |

**Input:**
```
{ "feedback": "API design finalized. Ready to continue." }
```

> `feedback` là optional.

---

### 3.5 Request Review

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/request-review` |
| **Transition** | `in_progress` → `review` |

**Input:** Không cần body.

---

### 3.6 Complete

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/complete` |
| **Transition** | `review` → `done` (hoặc `todo` nếu recurring) |

**Input:** Không cần body.

> **Recurring task**: Khi complete, hệ thống tự reset status về `todo` và tính `startAt` mới cho chu kỳ tiếp theo. Work sẵn sàng cho lần chạy kế tiếp.

---

### 3.7 Reject Review

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/reject-review` |
| **Transition** | `review` → `todo` |

**Input:**
```
{ "feedback": "Implementation does not meet acceptance criteria. Please add unit tests." }
```

---

### 3.8 Reopen

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/reopen` |
| **Transition** | `done`/`cancelled` → `in_progress` |

**Input:** Không cần body.

> **Recurring task**: Nếu work có `recurrence` config, reopen sẽ khôi phục `isRecurring=true` và tính lại `startAt`.

---

### 3.9 Cancel

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/cancel` |
| **Transition** | any (trừ `cancelled`) → `cancelled` |

**Input:** Không cần body.

> **Recurring task**: Cancel sẽ tắt recurrence (`isRecurring=false`) nhưng giữ `recurrence` config. Dùng Reopen để kích hoạt lại.

---

### 3.10 Recalculate Epic Status

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/works/:id/recalculate-status` |

> Chỉ áp dụng cho epic. Tính lại status dựa trên child tasks.

**Input:** Không cần body.

---

## 4. Special Endpoints

### 4.1 Get Next Work

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/works/next-work` |
| **Auth** | User JWT |

**Input (query params):**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `assigneeType` | enum | `'user'` \| `'agent'` |
| `assigneeId` | string | ID của assignee |

**Output:**

```
{
  work: Work | null,
  metadata: {
    priorityLevel: number,       // 0-5 (0 = no work)
    priorityDescription: string,
    matchedCriteria: string[]
  }
}
```

**Priority levels:**
1. **Recurring task** assigned to me, `isRecurring=true`, status `todo`, `startAt` <= now, no subtasks, dependencies met
2. Subtask assigned to me, status `todo`, dependencies met
3. Task assigned to me (không có subtasks), status `todo`, dependencies met
4. Work reported by me, status `blocked`
5. Work reported by me, status `review`
0. Không có work available

---

### 4.2 Can Trigger Agent

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/works/:id/can-trigger` |
| **Auth** | User JWT |

**Output:**

```
{
  canTrigger: boolean,
  reason: string,
  work: Work | null
}
```

**5 điều kiện để trigger:**
1. Assignee phải là agent
2. Phải có `startAt`
3. Current time >= `startAt`
4. Status phải là `todo` hoặc `in_progress`
5. Không có dependencies

---

## 5. Error Responses

Tất cả error trả về dạng:

```
{
  statusCode: number,
  message: string,
  error: string
}
```

| Status | Trường hợp |
|--------|-----------|
| 400 | Validation lỗi, status transition không hợp lệ, hierarchy rules vi phạm, immutable field update, missing reason/feedback |
| 401 | JWT không hợp lệ hoặc thiếu |
| 404 | Work không tồn tại |
| 422 | Validation lỗi chi tiết (array of messages) |

---

## 6. Ghi chú cho Frontend

1. **Status thay đổi qua action endpoints**: Không dùng PATCH để đổi status. Mỗi action có endpoint riêng (`/start`, `/block`, `/complete`, etc.).

2. **Immutable fields**: `type` không thể thay đổi sau khi tạo. `reason` managed bởi block/unblock. Ẩn các fields này trong form update.

3. **Description tách biệt list**: List response không có `description`. Fetch detail `GET /works/:id` để hiển thị mô tả.

4. **Statistics**: Response từ GET `/works` có `statistics` (byStatus, byType) — dùng cho dashboard/filter counts/kanban board.

5. **Hierarchy**: Khi tạo subtask, bắt buộc truyền `parentId` (phải là task). Khi tạo task, `parentId` optional (nếu có phải là epic).

6. **State machine UI**: Dựa trên status hiện tại, chỉ hiển thị actions hợp lệ:
   - `backlog`: "Assign & Todo"
   - `todo`: "Start"
   - `in_progress`: "Block", "Request Review"
   - `blocked`: "Unblock"
   - `review`: "Complete", "Reject"
   - `done`: "Reopen"
   - Tất cả (trừ cancelled): "Cancel"

7. **Reporter vs Assignee**: Reporter là người tạo/report work. Assignee là người thực hiện. Cả hai có thể là user hoặc agent.

8. **Block/Unblock flow**: Block yêu cầu `reason` (bắt buộc). Unblock có `feedback` (optional). Sau unblock, status về `todo` (không phải `in_progress`).

9. **Soft delete**: Chỉ cho xóa work `done` hoặc `cancelled`. Frontend nên ẩn nút delete cho các status khác.

10. **Next-work**: Dùng cho dashboard "What's next?" — trả work item ưu tiên nhất cho user/agent.

11. **Can-trigger**: Dùng cho agent scheduling — kiểm tra work đã sẵn sàng để agent bắt đầu chưa.

12. **Epic auto-status**: Epic status tự động tính khi child task thay đổi. Không cần manual update. Dùng `recalculate-status` nếu cần force recalculate.

13. **Form tạo work**: Không cần field `status` — hệ thống tự đặt `backlog`.

14. **Recurring tasks**: Chỉ task mới hỗ trợ recurring. Hiển thị badge "Recurring" cho work có `isRecurring=true`. Xem mục 7 cho chi tiết.

---

## 7. Recurring Tasks (Lặp lại)

Chỉ `type=task` hỗ trợ recurring. Work được reuse (không tạo work mới mỗi lần lặp).

### 7.1 RecurrenceConfig

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `type` | enum | ✅ | `'interval'` \| `'daily'` \| `'weekly'` \| `'monthly'` |
| `intervalMinutes` | number | khi type=interval | Số phút giữa mỗi lần lặp (1–525600) |
| `timesOfDay` | string[] | khi type=daily/weekly/monthly | Giờ trong ngày, format `"HH:mm"` (VD: `["09:00", "14:00"]`) |
| `daysOfWeek` | number[] | khi type=weekly | Ngày trong tuần: 0=CN, 1=T2, ..., 6=T7 (VD: `[1, 3]`) |
| `daysOfMonth` | number[] | khi type=monthly | Ngày trong tháng: 1–31 (VD: `[1, 15]`) |
| `timezone` | string | ❌ | IANA timezone (VD: `"Asia/Ho_Chi_Minh"`). Default: `"UTC"` |

### 7.2 Ví dụ tạo recurring task

**Mỗi 30 phút:**
```json
{
  "title": "Check system health",
  "type": "task",
  "reporter": { "type": "user", "id": "..." },
  "recurrence": { "type": "interval", "intervalMinutes": 30 }
}
```

**Hàng ngày lúc 9h và 14h (giờ VN):**
```json
{
  "title": "Daily standup",
  "type": "task",
  "reporter": { "type": "user", "id": "..." },
  "recurrence": { "type": "daily", "timesOfDay": ["09:00", "14:00"], "timezone": "Asia/Ho_Chi_Minh" }
}
```

**Thứ 2 và Thứ 4 hàng tuần lúc 9h:**
```json
{
  "title": "Weekly sync",
  "type": "task",
  "reporter": { "type": "user", "id": "..." },
  "recurrence": { "type": "weekly", "daysOfWeek": [1, 3], "timesOfDay": ["09:00"], "timezone": "Asia/Ho_Chi_Minh" }
}
```

**Ngày 1 và 15 hàng tháng lúc 10h:**
```json
{
  "title": "Monthly report",
  "type": "task",
  "reporter": { "type": "user", "id": "..." },
  "recurrence": { "type": "monthly", "daysOfMonth": [1, 15], "timesOfDay": ["10:00"], "timezone": "Asia/Ho_Chi_Minh" }
}
```

### 7.3 Luồng hoạt động

```
Tạo task + recurrence → backlog (isRecurring=true, startAt auto)
  → assign-and-todo → todo
  → agent/user thực thi → start → request-review → complete
  → TỰ ĐỘNG: status reset về todo + startAt mới
  → Chờ đến startAt → getNextWork trả về (Priority 1)
  → Lặp lại...
```

### 7.4 Ghi chú cho Frontend

- **Badge**: Hiển thị badge/icon "Recurring" cho work có `isRecurring=true`
- **Complete khác biệt**: Khi complete recurring task, response trả status `todo` (không phải `done`)
- **Xóa recurrence**: PATCH `/works/:id` với `{ "recurrence": null }` để tắt recurring
- **Cancel**: Tắt recurring nhưng giữ config. Reopen để kích hoạt lại
- **Form**: Chỉ hiển thị recurrence config khi `type=task`. Ẩn cho epic/subtask
- **Ngày 31**: Tháng ngắn (28, 29, 30 ngày) sẽ tự động dùng ngày cuối tháng
