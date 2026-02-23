# Project API — Frontend Integration

> Last updated: 2026-02-24
> Base URL: `https://api.x-or.cloud/dev/cbm`

---

## 1. Project Entity

Project là đơn vị quản lý scope lớn trong CBM. Mỗi project nhóm các work items, có status state machine, members và tags.

### 1.1 Các trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `_id` | string | auto | MongoDB ObjectId |
| `name` | string | ✅ | Tên project (max 200 ký tự) |
| `description` | string | ❌ | Mô tả project (max 2000 ký tự) |
| `members` | string[] | ❌ | Danh sách user IDs (default: `[]`) |
| `startDate` | Date | ❌ | Ngày bắt đầu |
| `endDate` | Date | ❌ | Ngày kết thúc |
| `tags` | string[] | ❌ | Tags phân loại (default: `[]`) |
| `status` | enum | auto | Trạng thái hiện tại (xem mục 1.2) |
| `owner` | object | auto | `{ orgId, userId }` — từ BaseSchema |
| `createdBy` | string | auto | User ID tạo project |
| `updatedBy` | string | auto | User ID cập nhật cuối |
| `createdAt` | Date | auto | Timestamp tạo |
| `updatedAt` | Date | auto | Timestamp cập nhật |
| `deletedAt` | Date | auto | Timestamp soft delete |

### 1.2 Status — Trạng thái

| Status | Ý nghĩa | Hiển thị gợi ý |
|--------|---------|----------------|
| `draft` | Mới tạo, đang lên kế hoạch | ⚪ Draft |
| `active` | Đang triển khai | 🟢 Active |
| `on_hold` | Tạm dừng | 🟡 On Hold |
| `completed` | Đã hoàn thành | 🔵 Completed |
| `archived` | Lưu trữ (trạng thái cuối) | ⚫ Archived |

**Luồng chuyển trạng thái:**
```
draft ──activate──> active ──complete──> completed ──archive──> archived
                      ↕
                   hold/resume
                      ↕
                   on_hold
```

> Frontend **không** gửi `status` khi tạo hoặc cập nhật project. Status chỉ thay đổi qua action endpoints (mục 2.6–2.10).

---

## 2. API Endpoints

Tất cả endpoints yêu cầu header `Content-Type: application/json`.
Tất cả endpoints cần header `Authorization: Bearer <token>`.

### 2.1 Tạo project

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/projects` |
| **Auth** | User JWT |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `name` | string | ✅ | Tên project (min 1, max 200) |
| `description` | string | ❌ | Mô tả (max 2000) |
| `members` | string[] | ❌ | Danh sách user IDs |
| `startDate` | Date | ❌ | Ngày bắt đầu (ISO 8601) |
| `endDate` | Date | ❌ | Ngày kết thúc (ISO 8601) |
| `tags` | string[] | ❌ | Tags phân loại |

> Không cần truyền `status` — hệ thống tự đặt `draft`.

**Output:** Project object (full entity, status = `draft`).

---

### 2.2 Danh sách projects

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/projects` |
| **Auth** | User JWT |

**Input (query params):**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `page` | number | Trang (default: 1) |
| `limit` | number | Số items/trang (default: 10) |
| `sort` | string | Sắp xếp (vd: `-createdAt`, `name`) |
| `filter[status]` | string | Lọc theo status |
| `filter[tags]` | string | Lọc theo tag |

**Output:**

```
{
  data: Project[],              // Không có trường `description` (giảm response size)
  pagination: { page, limit, total, totalPages },
  statistics: {
    total: number,
    byStatus: { draft: N, active: N, on_hold: N, completed: N, archived: N }
  }
}
```

> Trường `description` bị exclude trong list response. Dùng GET `/projects/:id` để lấy đầy đủ.

---

### 2.3 Chi tiết project

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/projects/:id` |
| **Auth** | User JWT |

**Output:** Project object (bao gồm `description`).

---

### 2.4 Cập nhật project

| | |
|---|---|
| **Method** | `PATCH` |
| **Path** | `/projects/:id` |
| **Auth** | User JWT |

**Input (body):** Partial — chỉ gửi các trường cần cập nhật.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `name` | string | Tên mới (min 1, max 200) |
| `description` | string | Mô tả mới (max 2000) |
| `members` | string[] | Members mới |
| `startDate` | Date | Ngày bắt đầu mới |
| `endDate` | Date | Ngày kết thúc mới |
| `tags` | string[] | Tags mới |

> **Không** gửi `status` qua PATCH. Dùng action endpoints để chuyển trạng thái.

**Output:** Project object (đã cập nhật).

---

### 2.5 Xóa project (soft delete)

| | |
|---|---|
| **Method** | `DELETE` |
| **Path** | `/projects/:id` |
| **Auth** | User JWT |

**Output:** Project object với `deletedAt` timestamp.

**Lưu ý:**
- Chỉ xóa được project có status `completed` hoặc `archived`.
- Trả 400 nếu status khác (draft, active, on_hold).

---

### 2.6 Activate project

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/projects/:id/activate` |
| **Auth** | User JWT |

Chuyển trạng thái: `draft` → `active`

**Output:** Project object (status = `active`).

**Error:** 400 nếu status hiện tại không phải `draft`.

---

### 2.7 Hold project

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/projects/:id/hold` |
| **Auth** | User JWT |

Chuyển trạng thái: `active` → `on_hold`

**Output:** Project object (status = `on_hold`).

**Error:** 400 nếu status hiện tại không phải `active`.

---

### 2.8 Resume project

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/projects/:id/resume` |
| **Auth** | User JWT |

Chuyển trạng thái: `on_hold` → `active`

**Output:** Project object (status = `active`).

**Error:** 400 nếu status hiện tại không phải `on_hold`.

---

### 2.9 Complete project

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/projects/:id/complete` |
| **Auth** | User JWT |

Chuyển trạng thái: `active` → `completed`

**Output:** Project object (status = `completed`).

**Error:** 400 nếu status hiện tại không phải `active`.

---

### 2.10 Archive project

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/projects/:id/archive` |
| **Auth** | User JWT |

Chuyển trạng thái: `completed` → `archived`

**Output:** Project object (status = `archived`).

**Error:** 400 nếu status hiện tại không phải `completed`.

---

## 3. Error Responses

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
| 400 | Validation lỗi, state transition không hợp lệ, xóa project chưa completed/archived |
| 401 | JWT không hợp lệ hoặc thiếu |
| 404 | Project không tồn tại |
| 422 | Validation lỗi chi tiết (array of messages) |

---

## 4. Ghi chú cho Frontend

1. **Status chỉ qua action endpoints**: Không gửi `status` trong create/update body. Dùng các nút action (Activate, Hold, Resume, Complete, Archive) gọi endpoint tương ứng.

2. **Form tạo project**: Không cần field `status` — hệ thống tự đặt `draft`. Chỉ cần: name (bắt buộc), description, members, startDate, endDate, tags.

3. **Action buttons theo status**: Hiển thị nút action phù hợp với status hiện tại:
   - `draft` → nút **Activate**
   - `active` → nút **Hold**, **Complete**
   - `on_hold` → nút **Resume**
   - `completed` → nút **Archive**, **Delete**
   - `archived` → nút **Delete**

4. **Statistics**: Response từ GET `/projects` có sẵn `statistics.byStatus` — dùng để hiển thị dashboard/filter counts mà không cần gọi API riêng.

5. **List vs Detail**: List response không có `description` (giảm payload). Chỉ lấy description khi vào trang detail.

6. **Soft delete**: Xóa project chỉ đặt `deletedAt` timestamp, không xóa vĩnh viễn. Project đã xóa tự động bị exclude khỏi queries.

7. **Date format**: Tất cả date fields dùng ISO 8601: `YYYY-MM-DDTHH:mm:ss.sssZ`.

8. **Full-text search**: Có thể tìm kiếm trên `name` và `description` qua text index (nếu backend hỗ trợ search query).
