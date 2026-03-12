---
name: doc-module
description: Đọc source code của một module trong service và viết tài liệu API vào docs/<service>/<module>/
argument-hint: <service> <module>
---

Đọc toàn bộ source code của module `$1` trong service `$0`, sau đó viết tài liệu kỹ thuật vào file `docs/$0/$1/$1-api.md` (tạo thư mục nếu chưa có).

## Bước 1 — Đọc source

Đọc tất cả file trong thư mục `services/$0/src/modules/$1/`, bao gồm:
- Schema (`*.schema.ts`) — entity fields, types, enums
- DTOs (`*.dto.ts`) — request body / query string fields
- Controller (`*.controller.ts`) — endpoints, params, query, guards
- Service (`*.service.ts`) — business logic đặc biệt ảnh hưởng đến response

## Bước 2 — Viết tài liệu

Tài liệu gồm các phần sau, viết bằng **tiếng Việt**:

### 1. Entity Schema
- Ý nghĩa entity (1–2 câu)
- Bảng enums (nếu có): giá trị, ý nghĩa
- Bảng fields: tên trường | kiểu dữ liệu | bắt buộc | ý nghĩa | ví dụ
- Các nested object (nếu có) mô tả riêng từng trường
- Trường kế thừa từ BaseSchema (owner, createdBy, updatedBy, isDeleted, createdAt, updatedAt)

### 2. API Endpoints — mỗi endpoint gồm:

```
METHOD /path
```

- **Params** (nếu có): bảng tên | kiểu | ý nghĩa
- **Query String** (nếu có): bảng param | kiểu | ý nghĩa | ví dụ; ghi chú toán tử `parseQueryString` nếu dùng
- **Body** (nếu có): bảng trường | kiểu | bắt buộc | ví dụ
- **Request Sample**: JSON block
- **Response — mọi trường hợp có thể xảy ra**: HTTP status + JSON block

### 3. Bảng tóm tắt endpoints

| Method | URL | Mô tả |

### 4. Ghi chú đặc biệt (nếu có)
- Logic nghiệp vụ quan trọng ảnh hưởng đến API behavior
- Field bị ẩn trong list response (ví dụ: bảo mật token)
- Soft delete behavior
- Health check / worker integration (nếu có)

## Quy tắc

- Không bịa response field — chỉ mô tả những gì thực sự có trong code
- Sample data phải trông thực tế (dùng ObjectId giả hợp lệ, ISO date, v.v.)
- Nếu module có nhiều endpoint, chia thành các section rõ ràng
- Nếu thư mục module không tồn tại, thông báo lỗi ngay cho user
