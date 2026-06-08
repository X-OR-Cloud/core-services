# Feedback App — API Integration Guide

**Base URL:** `https://api.hydrabyte.co/cbm`

---

## Submit Feedback

Endpoint duy nhất mà Feedback App cần gọi. Không yêu cầu authentication.

```
POST /tickets/public
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `orgId` | string | ✅ | Organization ID — baked vào config của app |
| `category` | string | ✅ | Phân loại feedback (ví dụ: "Dịch vụ", "Sản phẩm", "Không gian") |
| `content` | string | ✅ | Nội dung góp ý (tối đa 5000 ký tự) |
| `rating` | number | — | Số sao 1–5 |
| `outlet.id` | string | — | ID cửa hàng |
| `outlet.name` | string | — | Tên cửa hàng |
| `outlet.address` | string | — | Địa chỉ cửa hàng |
| `submitter.name` | string | — | Tên khách hàng |
| `submitter.phone` | string | — | Số điện thoại |
| `submitter.email` | string | — | Email |
| `submitter.contactId` | string | — | ID contact trong hệ thống (nếu đã có) |

### Sample Request — Đầy đủ thông tin

```
POST /tickets/public

{
  "orgId": "6627a1f3e4b0c9d1a2b3c4d5",
  "category": "Dịch vụ",
  "content": "Nhân viên phục vụ chậm, phải chờ gần 20 phút mới được gọi món.",
  "rating": 2,
  "outlet": {
    "id": "664f2a1be4b0c9d1a2b3c4e6",
    "name": "Chi nhánh Quận 1",
    "address": "123 Nguyễn Huệ, Quận 1, TP.HCM"
  },
  "submitter": {
    "name": "Nguyễn Văn A",
    "phone": "0901234567",
    "email": "nguyenvana@gmail.com"
  }
}
```

### Sample Request — Tối giản (ẩn danh)

```
POST /tickets/public

{
  "orgId": "6627a1f3e4b0c9d1a2b3c4d5",
  "category": "Sản phẩm",
  "content": "Cà phê hôm nay ngon hơn mọi khi, đặc biệt thích vị đắng nhẹ.",
  "rating": 5,
  "outlet": {
    "name": "Chi nhánh Quận 3"
  }
}
```

### Sample Response — 201 Created

```json
{
  "success": true,
  "data": {
    "_id": "6849c3a1e4b0c9d1a2b3f7aa",
    "category": "Dịch vụ",
    "content": "Nhân viên phục vụ chậm, phải chờ gần 20 phút mới được gọi món.",
    "rating": 2,
    "outlet": {
      "id": "664f2a1be4b0c9d1a2b3c4e6",
      "name": "Chi nhánh Quận 1",
      "address": "123 Nguyễn Huệ, Quận 1, TP.HCM"
    },
    "submitter": {
      "name": "Nguyễn Văn A",
      "phone": "0901234567",
      "email": "nguyenvana@gmail.com"
    },
    "assignee": null,
    "status": "new",
    "resolution": null,
    "owner": {
      "orgId": "6627a1f3e4b0c9d1a2b3c4d5"
    },
    "createdAt": "2026-06-07T08:30:00.000Z",
    "updatedAt": "2026-06-07T08:30:00.000Z"
  }
}
```

### Error Responses

**400 Bad Request** — thiếu hoặc sai field bắt buộc:

```json
{
  "success": false,
  "statusCode": 400,
  "message": ["category must be a string", "content must be a string"]
}
```

**400 Bad Request** — rating ngoài khoảng 1–5:

```json
{
  "success": false,
  "statusCode": 400,
  "message": ["rating must not be greater than 5"]
}
```

---

## Ticket Status Lifecycle

Sau khi submit, ticket sẽ được nhân sự xử lý nội bộ theo luồng sau:

```
new → assigned → in_progress → resolved → closed
```

| Status | Ý nghĩa |
|---|---|
| `new` | Vừa được tạo, chưa có người nhận |
| `assigned` | Đã assign cho nhân sự |
| `in_progress` | Đang xử lý (đang gọi điện, nhắn tin...) |
| `resolved` | Đã xử lý xong, có ghi chú resolution |
| `closed` | Đóng ticket |

> Feedback App không cần xử lý các trạng thái này — đây là luồng nội bộ của nhân sự.

---

## Lưu ý tích hợp

- `orgId` là định danh tổ chức, không phải thông tin bí mật — bake cứng vào config của app.
- Các trường `outlet` và `submitter` đều là object tùy chọn — app có thể gửi một phần hoặc bỏ qua hoàn toàn.
- Feedback với `rating` từ 1–3 sẽ được nhân sự ưu tiên follow-up.
- Không có rate limiting ở tầng API — nếu cần chống spam, xử lý ở tầng UI (captcha, debounce).
