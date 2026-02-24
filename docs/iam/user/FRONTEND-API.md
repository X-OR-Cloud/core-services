# User API — Frontend Integration

> Last updated: 2026-02-24
> Base URL: `https://api.x-or.cloud/dev/iam`

---

## 1. User Entity

User là tài khoản người dùng trong hệ thống. Mỗi user thuộc 1 organization, có 1 role duy nhất, và hỗ trợ metadata cho tích hợp social accounts.

### 1.1 Các trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `_id` | string | auto | MongoDB ObjectId |
| `username` | string | ✅ | Email address (unique) |
| `password` | object | ✅ | Object chứa hash — **không trả về trong response** |
| `role` | string | ✅ | Role duy nhất (scope.role format, xem mục 1.2) |
| `status` | enum | auto | Trạng thái user (xem mục 1.3) |
| `fullname` | string | ❌ | Họ tên đầy đủ |
| `phonenumbers` | string[] | ❌ | Danh sách SĐT (default: `[]`) |
| `address` | string | ❌ | Địa chỉ |
| `metadata` | object | ❌ | Metadata mở rộng (xem mục 1.4) |
| `owner` | object | auto | `{ orgId, userId }` — từ BaseSchema |
| `createdBy` | string | auto | User ID tạo |
| `updatedBy` | string | auto | User ID cập nhật cuối |
| `createdAt` | Date | auto | Timestamp tạo |
| `updatedAt` | Date | auto | Timestamp cập nhật |

### 1.2 Role — Vai trò

Mỗi user chỉ có **1 role duy nhất**, theo format `scope.role`.

| Role | Ý nghĩa | Scope |
|------|---------|-------|
| `universe.owner` | Quản trị toàn hệ thống | 🔴 Universe |
| `organization.owner` | Chủ sở hữu tổ chức | 🟢 Organization |
| `organization.editor` | Biên tập viên tổ chức | 🟡 Organization |
| `organization.viewer` | Người xem tổ chức | ⚪ Organization |

> Role **không** thay đổi qua API update user. Chỉ gán khi tạo user.

**Quy tắc phân quyền:** User có role `organization.*` **không** được phép sửa/xóa/đổi mật khẩu user có role `universe.*`.

### 1.3 Status — Trạng thái

| Status | Ý nghĩa | Hiển thị gợi ý |
|--------|---------|----------------|
| `active` | Hoạt động, có thể đăng nhập | 🟢 Active |
| `inactive` | Bị vô hiệu hóa, không thể đăng nhập | 🔴 Inactive |
| `pending` | Đang chờ kích hoạt | 🟡 Pending |

### 1.4 Metadata — Dữ liệu mở rộng

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `discordUserId` | string | Discord User ID |
| `discordUsername` | string | Discord username (vd: `johndoe#1234`) |
| `telegramUserId` | string | Telegram User ID |
| `telegramUsername` | string | Telegram username (vd: `@johndoe`) |
| `[key]` | any | Trường tùy chỉnh khác |

---

## 2. API Endpoints

Tất cả endpoints yêu cầu header `Content-Type: application/json`.
Tất cả endpoints cần header `Authorization: Bearer <token>`.

### 2.1 Tạo user

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/users` |
| **Auth** | User JWT + License FULL |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `username` | string | ✅ | Email hợp lệ |
| `password` | string | ✅ | 8-15 ký tự, chữ hoa + thường + số + ký tự đặc biệt |
| `role` | string | ✅ | Role (vd: `organization.owner`) |
| `status` | enum | ❌ | Default: `active` |
| `fullname` | string | ❌ | Họ tên |
| `phonenumbers` | string[] | ❌ | SĐT (format: `+84xxx`, `0xxx`, `+1-xxx`) |
| `address` | string | ❌ | Địa chỉ |
| `metadata` | object | ❌ | Metadata (xem mục 1.4) |

**Output:** User object (không có `password`).

**Lưu ý:** Yêu cầu organization có license `type: full` cho service IAM.

---

### 2.2 Danh sách users

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/users` |
| **Auth** | User JWT |

**Input (query params):**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `page` | number | Trang (default: 1) |
| `limit` | number | Số items/trang (default: 10) |
| `filter[fullname]` | string | Lọc theo tên (regex, case-insensitive) |
| `filter[address]` | string | Lọc theo địa chỉ (regex, case-insensitive) |
| `filter[status]` | string | Lọc theo status (`active`, `inactive`, `pending`) |
| `filter[role]` | string | Lọc theo role |

**Ví dụ query:**
```
GET /users?page=1&limit=10
GET /users?filter[fullname]=john
GET /users?filter[status]=active&filter[role]=organization.owner
```

**Output:**

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 25 },
  "statistics": {
    "total": 25,
    "byStatus": { "active": 20, "inactive": 3, "pending": 2 }
  }
}
```

---

### 2.3 Chi tiết user

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/users/:id` |
| **Auth** | User JWT |

**Output:** User object đầy đủ (không có `password`).

---

### 2.4 Cập nhật user

| | |
|---|---|
| **Method** | `PUT` |
| **Path** | `/users/:id` |
| **Auth** | User JWT |

**Input (body):** Chỉ các trường được phép cập nhật.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `status` | enum | Trạng thái mới |
| `fullname` | string | Họ tên mới |
| `phonenumbers` | string[] | SĐT mới |
| `address` | string | Địa chỉ mới |
| `metadata` | object | Metadata mới |

> **Không** thể thay đổi `username`, `password`, hoặc `role` qua endpoint này.

**Output:** User object (đã cập nhật).

**Error 403:** Nếu caller là `organization.*` và target user là `universe.*`.

---

### 2.5 Xóa user (soft delete)

| | |
|---|---|
| **Method** | `DELETE` |
| **Path** | `/users/:id` |
| **Auth** | User JWT |

**Output:** `{ "message": "User deleted successfully" }`

**Các trường hợp bị chặn (403):**
- User tự xóa chính mình
- Caller là `organization.*`, target là `universe.*`
- Target là `organization.owner` cuối cùng trong org

---

### 2.6 Đổi role user

| | |
|---|---|
| **Method** | `PATCH` |
| **Path** | `/users/:id/change-role` |
| **Auth** | User JWT (`organization.owner` hoặc `universe.owner`) |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `role` | string | ✅ | Role mới (chỉ `organization.owner`, `organization.editor`, `organization.viewer`) |

> Chỉ có thể gán role organization-level. Không thể gán `universe.*`.

**Output:** `{ "message": "Role changed successfully" }`

**Error 403:**
- Caller không phải `organization.owner` hoặc `universe.owner`
- Caller là `organization.*`, target là `universe.*`
- Target user không cùng organization
- User tự đổi role cho chính mình

---

### 2.7 Đổi mật khẩu user

| | |
|---|---|
| **Method** | `PATCH` |
| **Path** | `/users/:id/change-password` |
| **Auth** | User JWT (`organization.owner` hoặc `universe.owner`) |

**Input (body):**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `newPassword` | string | ✅ | Mật khẩu mới (cùng policy với tạo user) |

> Đây là endpoint cho **owner đổi mật khẩu cho user khác** — không cần mật khẩu cũ.
> User tự đổi mật khẩu cho mình dùng `POST /auth/change-password` (cần mật khẩu cũ).

**Output:** `{ "message": "Password changed successfully" }`

**Error 403:**
- Caller không phải `organization.owner` hoặc `universe.owner`
- Caller là `organization.*`, target là `universe.*`
- Target user không cùng organization

---

## 3. Error Responses

Tất cả error trả về dạng:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request",
  "correlationId": "uuid-for-tracing"
}
```

| Status | Trường hợp |
|--------|-----------|
| 400 | Validation lỗi (email format, password policy, phone format) |
| 401 | JWT không hợp lệ hoặc thiếu |
| 403 | Không đủ quyền (privilege escalation, self-deletion, last owner) |
| 404 | User không tồn tại |

---

## 4. Ghi chú cho Frontend

1. **Role thay đổi qua endpoint riêng**: Không gửi `role` trong form update. Dùng `PATCH /users/:id/change-role` với dropdown chọn role mới. Chỉ hiển thị nút đổi role khi caller là `organization.owner` hoặc `universe.owner`.

2. **Password policy**: 8-15 ký tự, bắt buộc chữ hoa + chữ thường + số + ký tự đặc biệt (`@ . # $ ! % * ? & _ -`). Hiển thị validation realtime trên form.

3. **Username = Email**: Trường `username` phải là email hợp lệ. Dùng email validation trên form.

4. **2 cách đổi mật khẩu**:
   - `POST /auth/change-password` — User tự đổi (cần `oldPassword` + `newPassword`)
   - `PATCH /users/:id/change-password` — Owner đổi cho user khác (chỉ cần `newPassword`)

5. **Statistics**: Response từ `GET /users` có sẵn `statistics.byStatus` — dùng để hiển thị badge count trên filter tabs.

6. **Metadata social accounts**: Hiển thị icon Discord/Telegram nếu `metadata.discordUsername` hoặc `metadata.telegramUsername` có giá trị.

7. **Phân quyền hiển thị nút**: Ẩn nút Edit/Delete/Change Role/Change Password nếu target user có role `universe.*` và caller chỉ có role `organization.*`.

8. **License gate**: Nút "Tạo user" chỉ hiển thị khi org có license IAM `type: full`. Kiểm tra từ JWT payload `licenses.iam`.
