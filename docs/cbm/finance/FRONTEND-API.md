# CBM Finance — Tài liệu Nghiệp vụ & API

> Dành cho Frontend Developer  
> Base URL: `https://api.hydrabyte.co/cbm`  
> Tất cả endpoints yêu cầu header: `Authorization: Bearer <JWT_TOKEN>`

---

## Mục lục

1. [Invoice (Hóa đơn)](#1-invoice-hóa-đơn)
2. [Expense (Chi phí)](#2-expense-chi-phí)
3. [Payment (Thanh toán)](#3-payment-thanh-toán)
4. [Transaction (Sổ cái)](#4-transaction-sổ-cái)

---

## 1. Invoice (Hóa đơn)

### 1.1 Entity Schema

Invoice quản lý hóa đơn phát ra cho khách hàng. Có state machine kiểm soát vòng đời từ bản nháp đến thanh toán. Trạng thái thanh toán được tự động cập nhật khi có Payment được ghi nhận.

#### State Machine

```
draft ──→ sent ──→ partial ──→ paid
           │          │
           └──→ overdue ──→ (không thể đổi tiếp)
           │
           └──→ cancelled ──→ draft (reopen)
```

| Trạng thái | Ý nghĩa |
|-----------|---------|
| `draft` | Bản nháp — đang soạn thảo |
| `sent` | Đã gửi cho khách hàng |
| `partial` | Đã nhận thanh toán một phần |
| `paid` | Đã thanh toán đủ |
| `overdue` | Quá hạn (sent hoặc partial nhưng chưa thanh toán) |
| `cancelled` | Đã hủy |

**Quy tắc chuyển trạng thái:**
- `draft → sent`: qua endpoint `POST /invoices/:id/send`
- `sent/partial → overdue`: qua endpoint `POST /invoices/:id/mark-overdue`
- `any unpaid → cancelled`: qua endpoint `POST /invoices/:id/cancel` (không được cancel khi đã `paid`)
- `cancelled → draft`: qua endpoint `POST /invoices/:id/reopen`
- `sent/partial/overdue → partial/paid`: **tự động** khi Payment được ghi nhận
- Chỉnh sửa (PATCH): chỉ được khi status là `draft`
- Xoá mềm: chỉ được khi status là `draft` hoặc `cancelled`

#### Enums

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `status` | `draft` | Bản nháp |
| `status` | `sent` | Đã gửi |
| `status` | `partial` | Thanh toán một phần |
| `status` | `paid` | Đã thanh toán |
| `status` | `overdue` | Quá hạn |
| `status` | `cancelled` | Đã hủy |

#### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | `string` (ObjectId) | Auto | ID duy nhất | `"507f1f77bcf86cd799439020"` |
| `code` | `string` | Auto | Mã hóa đơn (tối đa 50 ký tự) | `"INV-2026-0001"` |
| `contactId` | `string` | ✅ | ID contact người nhận | `"507f1f77bcf86cd799439012"` |
| `companyId` | `string` | - | ID công ty người nhận (tùy chọn) | `"507f1f77bcf86cd799439011"` |
| `items` | `object[]` | - | Danh sách dòng hàng/dịch vụ | |
| `subtotal` | `MoneyAmount` | ✅ | Tổng trước thuế | `{ "currency": "VND", "value": 10000000 }` |
| `tax` | `MoneyAmount` | - | Số tiền thuế | `{ "currency": "VND", "value": 1000000 }` |
| `totalAmount` | `MoneyAmount` | ✅ | Tổng cộng (subtotal + tax) | `{ "currency": "VND", "value": 11000000 }` |
| `status` | `string` | Auto | Trạng thái (mặc định: `draft`) | `"draft"` |
| `issuedDate` | `Date` | ✅ | Ngày phát hành | `"2026-04-09T00:00:00.000Z"` |
| `dueDate` | `Date` | - | Ngày đến hạn thanh toán | `"2026-05-09T00:00:00.000Z"` |
| `notes` | `string` | - | Ghi chú (tối đa 2000 ký tự) | |
| `eInvoice` | `object` | - | Thông tin hóa đơn điện tử (xem bên dưới) | |

#### Nested Object: `items[]`

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `description` | `string` | ✅ | Mô tả dịch vụ/hàng hóa (tối đa 500 ký tự) |
| `qty` | `number` | ✅ | Số lượng (số dương) |
| `unitPrice` | `MoneyAmount` | ✅ | Đơn giá |
| `amount` | `MoneyAmount` | ✅ | Thành tiền = qty × unitPrice |

#### Nested Object: `MoneyAmount`

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `currency` | `string` | ✅ | Mã tiền tệ ISO 4217 (3 ký tự): `VND`, `USD`, `EUR` |
| `value` | `number` | ✅ | Số tiền (≥ 0) |

#### Nested Object: `eInvoice`

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `provider` | `string` | Nhà cung cấp hóa đơn điện tử (VNPT, MISA, VIETTEL) |
| `eInvoiceId` | `string` | Mã hóa đơn từ nhà cung cấp |
| `fileUrl` | `string` | URL tải file PDF/XML |
| `rawData` | `object` | Dữ liệu thô từ nhà cung cấp |
| `linkedAt` | `Date` | Thời điểm liên kết |

#### Trường kế thừa từ BaseSchema

`owner`, `createdBy`, `updatedBy`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`

---

### 1.2 API Endpoints

#### `POST /invoices`

Tạo hóa đơn mới. Status luôn được ép là `draft`. Code tự động tạo nếu không truyền vào (format: `INV-{YYYY}-{seq:04d}` theo từng org).

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `code` | `string` | - | `"INV-2026-0001"` (nếu bỏ trống sẽ tự sinh) |
| `contactId` | `string` | ✅ | `"507f1f77bcf86cd799439012"` |
| `companyId` | `string` | - | `"507f1f77bcf86cd799439011"` |
| `items` | `object[]` | - | Danh sách dòng hàng |
| `subtotal` | `MoneyAmount` | ✅ | `{ "currency": "VND", "value": 10000000 }` |
| `tax` | `MoneyAmount` | - | `{ "currency": "VND", "value": 1000000 }` |
| `totalAmount` | `MoneyAmount` | ✅ | `{ "currency": "VND", "value": 11000000 }` |
| `issuedDate` | `Date` | ✅ | `"2026-04-09T00:00:00.000Z"` |
| `dueDate` | `Date` | - | `"2026-05-09T00:00:00.000Z"` |
| `notes` | `string` | - | |

**Request Sample**
```json
{
  "contactId": "507f1f77bcf86cd799439012",
  "companyId": "507f1f77bcf86cd799439011",
  "items": [
    {
      "description": "Dịch vụ phát triển web - Tháng 4/2026",
      "qty": 1,
      "unitPrice": { "currency": "VND", "value": 10000000 },
      "amount": { "currency": "VND", "value": 10000000 }
    }
  ],
  "subtotal": { "currency": "VND", "value": 10000000 },
  "tax": { "currency": "VND", "value": 1000000 },
  "totalAmount": { "currency": "VND", "value": 11000000 },
  "issuedDate": "2026-04-09T00:00:00.000Z",
  "dueDate": "2026-05-09T00:00:00.000Z"
}
```

**Response**

| Status | Mô tả |
|--------|-------|
| `201 Created` | Tạo thành công, trả về invoice với `status: "draft"` |
| `400 Bad Request` | Dữ liệu không hợp lệ |
| `401 Unauthorized` | Chưa xác thực |

---

#### `GET /invoices`

Danh sách hóa đơn với phân trang, tìm kiếm và thống kê theo trạng thái.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `search` | `string` | Tìm trong: code, notes (regex) | `?search=INV-2026` |
| `filter[status]` | `string` | Lọc theo trạng thái | `?filter[status]=sent` |
| `filter[contactId]` | `string` | Lọc theo contact | `?filter[contactId]=507f...` |
| `filter[companyId]` | `string` | Lọc theo công ty | `?filter[companyId]=507f...` |
| `filter[dueDate:lte]` | `Date` | Hóa đơn đến hạn trước ngày | `?filter[dueDate:lte]=2026-05-01` |
| `sort` | `string` | Sắp xếp | `?sort=issuedDate:desc` |
| `page` | `number` | Trang | `?page=1` |
| `limit` | `number` | Số kết quả/trang | `?limit=20` |

**Response**

```json
// 200 OK
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 87,
    "totalPages": 5
  },
  "statistics": {
    "total": 87,
    "byStatus": {
      "draft": 10,
      "sent": 25,
      "partial": 8,
      "paid": 40,
      "overdue": 3,
      "cancelled": 1
    }
  }
}
```

---

#### `GET /invoices/:id`

Lấy chi tiết hóa đơn theo ID.

**Response**: `200 OK` | `404 Not Found`

---

#### `PATCH /invoices/:id`

Cập nhật hóa đơn. **Chỉ được phép khi status là `draft`.**

**Body** — Các field tùy chọn: `contactId`, `companyId`, `items`, `subtotal`, `tax`, `totalAmount`, `issuedDate`, `dueDate`, `notes`

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Cập nhật thành công |
| `400 Bad Request` | `"Invoice can only be updated in draft status (current: sent)"` |
| `404 Not Found` | Không tìm thấy hóa đơn |

---

#### `DELETE /invoices/:id`

Xoá mềm hóa đơn. **Chỉ được phép khi status là `draft` hoặc `cancelled`.**

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Xoá thành công |
| `400 Bad Request` | `"Invoice can only be deleted in draft or cancelled status (current: sent)"` |
| `404 Not Found` | Không tìm thấy hóa đơn |

---

#### `POST /invoices/:id/send`

Gửi hóa đơn cho khách. Chuyển trạng thái `draft → sent`.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về invoice với `status: "sent"` |
| `400 Bad Request` | `"Invoice must be in draft status to send (current: ...)"` |
| `404 Not Found` | Không tìm thấy |

---

#### `POST /invoices/:id/mark-overdue`

Đánh dấu hóa đơn quá hạn. Chuyển trạng thái `sent/partial → overdue`.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về invoice với `status: "overdue"` |
| `400 Bad Request` | `"Invoice must be in sent or partial status to mark as overdue"` |
| `404 Not Found` | Không tìm thấy |

---

#### `POST /invoices/:id/cancel`

Hủy hóa đơn. Áp dụng cho mọi trạng thái **ngoại trừ** `paid` và `cancelled`.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về invoice với `status: "cancelled"` |
| `400 Bad Request` | `"Invoice is already cancelled"` hoặc `"Cannot cancel a paid invoice"` |
| `404 Not Found` | Không tìm thấy |

---

#### `POST /invoices/:id/reopen`

Mở lại hóa đơn đã hủy. Chuyển trạng thái `cancelled → draft`.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về invoice với `status: "draft"` |
| `400 Bad Request` | `"Invoice must be cancelled to reopen (current: ...)"` |
| `404 Not Found` | Không tìm thấy |

---

#### `PATCH /invoices/:id/e-invoice`

Liên kết thông tin hóa đơn điện tử từ nhà cung cấp (VNPT, MISA, Viettel...).

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `provider` | `string` | ✅ | `"VNPT"` |
| `eInvoiceId` | `string` | ✅ | `"VNPT-2026-000123"` |
| `fileUrl` | `string` | - | `"https://storage.vnpt.vn/invoices/..."` |
| `rawData` | `object` | - | Dữ liệu thô từ VNPT API |

**Response**: `200 OK` | `404 Not Found`

---

### 1.3 Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/invoices` | Tạo hóa đơn (status: draft, code tự sinh) |
| `GET` | `/invoices` | Danh sách hóa đơn (phân trang + thống kê) |
| `GET` | `/invoices/:id` | Chi tiết hóa đơn |
| `PATCH` | `/invoices/:id` | Cập nhật (chỉ khi draft) |
| `DELETE` | `/invoices/:id` | Xoá mềm (chỉ khi draft/cancelled) |
| `POST` | `/invoices/:id/send` | Gửi hóa đơn (draft → sent) |
| `POST` | `/invoices/:id/mark-overdue` | Đánh dấu quá hạn (sent/partial → overdue) |
| `POST` | `/invoices/:id/cancel` | Hủy hóa đơn |
| `POST` | `/invoices/:id/reopen` | Mở lại hóa đơn đã hủy (cancelled → draft) |
| `PATCH` | `/invoices/:id/e-invoice` | Liên kết hóa đơn điện tử |

---

## 2. Expense (Chi phí)

### 2.1 Entity Schema

Expense ghi nhận chi phí nội bộ của tổ chức — lương, thuê văn phòng, công cụ, đi lại... Có quy trình duyệt: người tạo submit → manager duyệt/từ chối. Khi được duyệt, tự động tạo Transaction chi phí.

#### State Machine

```
pending ──→ approved (tạo Transaction tự động)
    │
    └──→ rejected ──→ pending (resubmit)
```

| Trạng thái | Ý nghĩa |
|-----------|---------|
| `pending` | Chờ duyệt |
| `approved` | Đã duyệt |
| `rejected` | Bị từ chối |

**Quy tắc chuyển trạng thái:**
- `pending → approved`: qua endpoint `POST /expenses/:id/approve` → **tự động tạo Transaction**
- `pending → rejected`: qua endpoint `POST /expenses/:id/reject` (bắt buộc có `rejectionReason`)
- `rejected → pending`: qua endpoint `POST /expenses/:id/resubmit`
- Chỉnh sửa (PATCH): chỉ được khi status là `pending` hoặc `rejected`
- Xoá mềm: chỉ được khi status là `pending` hoặc `rejected`

#### Enums

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `category` | `salary` | Lương nhân viên |
| `category` | `rent` | Thuê văn phòng |
| `category` | `tools` | Công cụ, phần mềm |
| `category` | `travel` | Đi lại, công tác |
| `category` | `marketing` | Marketing |
| `category` | `utilities` | Điện, nước, internet |
| `category` | `other` | Khác |
| `status` | `pending` | Chờ duyệt |
| `status` | `approved` | Đã duyệt |
| `status` | `rejected` | Bị từ chối |

#### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | `string` (ObjectId) | Auto | ID duy nhất | `"507f1f77bcf86cd799439030"` |
| `category` | `string` | ✅ | Loại chi phí | `"tools"` |
| `amount` | `MoneyAmount` | ✅ | Số tiền | `{ "currency": "VND", "value": 2000000 }` |
| `vendorId` | `string` | - | ID contact/company nhà cung cấp | `"507f1f77bcf86cd799439011"` |
| `vendorName` | `string` | - | Tên nhà cung cấp (free text, tối đa 200 ký tự) | `"AWS"` |
| `date` | `Date` | ✅ | Ngày phát sinh chi phí | `"2026-04-01T00:00:00.000Z"` |
| `description` | `string` | ✅ | Mô tả chi phí (tối đa 1000 ký tự) | `"Phí EC2 tháng 4"` |
| `status` | `string` | Auto | Trạng thái (mặc định: `pending`) | `"pending"` |
| `rejectionReason` | `string` | - | Lý do từ chối (tối đa 500 ký tự) | |
| `receiptUrl` | `string` | - | URL ảnh/file hóa đơn (tối đa 500 ký tự) | |
| `tags` | `string[]` | - | Nhãn phân loại | `["aws", "infrastructure"]` |
| `notes` | `string` | - | Ghi chú (tối đa 2000 ký tự) | |

#### Trường kế thừa từ BaseSchema

`owner`, `createdBy`, `updatedBy`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`

---

### 2.2 API Endpoints

#### `POST /expenses`

Tạo chi phí mới. Status luôn được ép là `pending`.

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `category` | `string` | ✅ | `"tools"` |
| `amount` | `MoneyAmount` | ✅ | `{ "currency": "VND", "value": 2000000 }` |
| `vendorId` | `string` | - | ID nhà cung cấp |
| `vendorName` | `string` | - | `"AWS"` |
| `date` | `Date` | ✅ | `"2026-04-01T00:00:00.000Z"` |
| `description` | `string` | ✅ | `"Phí EC2 tháng 4/2026"` |
| `receiptUrl` | `string` | - | URL hóa đơn/biên lai |
| `tags` | `string[]` | - | `["aws"]` |
| `notes` | `string` | - | |

**Request Sample**
```json
{
  "category": "tools",
  "amount": { "currency": "VND", "value": 2000000 },
  "vendorName": "AWS",
  "date": "2026-04-01T00:00:00.000Z",
  "description": "Phí AWS EC2 tháng 4/2026",
  "receiptUrl": "https://storage.example.com/receipts/aws-apr-2026.pdf",
  "tags": ["aws", "infrastructure"]
}
```

**Response**

| Status | Mô tả |
|--------|-------|
| `201 Created` | Tạo thành công với `status: "pending"` |
| `400 Bad Request` | Dữ liệu không hợp lệ |
| `401 Unauthorized` | Chưa xác thực |

---

#### `GET /expenses`

Danh sách chi phí với phân trang, tìm kiếm và thống kê theo trạng thái.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `search` | `string` | Tìm trong: description, notes, vendorName (regex), tags (exact) | `?search=AWS` |
| `filter[status]` | `string` | Lọc theo trạng thái | `?filter[status]=pending` |
| `filter[category]` | `string` | Lọc theo loại | `?filter[category]=tools` |
| `filter[date:gte]` | `Date` | Chi phí từ ngày | `?filter[date:gte]=2026-04-01` |
| `filter[date:lte]` | `Date` | Chi phí đến ngày | `?filter[date:lte]=2026-04-30` |
| `sort` | `string` | Sắp xếp | `?sort=date:desc` |
| `page` | `number` | Trang | `?page=1` |
| `limit` | `number` | Số kết quả/trang | `?limit=20` |

**Response**

```json
// 200 OK
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 63,
    "totalPages": 4
  },
  "statistics": {
    "total": 63,
    "byStatus": {
      "pending": 12,
      "approved": 45,
      "rejected": 6
    }
  }
}
```

---

#### `GET /expenses/:id`

Lấy chi tiết chi phí theo ID.

**Response**: `200 OK` | `404 Not Found`

---

#### `PATCH /expenses/:id`

Cập nhật chi phí. **Chỉ được phép khi status là `pending` hoặc `rejected`.**

**Body** — Tất cả field optional: `category`, `amount`, `vendorId`, `vendorName`, `date`, `description`, `receiptUrl`, `tags`, `notes`

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Cập nhật thành công |
| `400 Bad Request` | `"Expense can only be updated in pending or rejected status (current: approved)"` |
| `404 Not Found` | Không tìm thấy |

---

#### `DELETE /expenses/:id`

Xoá mềm chi phí. **Chỉ được phép khi status là `pending` hoặc `rejected`.**

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Xoá thành công |
| `400 Bad Request` | `"Expense can only be deleted in pending or rejected status (current: approved)"` |
| `404 Not Found` | Không tìm thấy |

---

#### `POST /expenses/:id/approve`

Duyệt chi phí. Chuyển `pending → approved`. **Tự động tạo Transaction loại `expense`.**

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về expense với `status: "approved"` |
| `400 Bad Request` | `"Expense must be in pending status to approve (current: ...)"` |
| `404 Not Found` | Không tìm thấy |

---

#### `POST /expenses/:id/reject`

Từ chối chi phí. Chuyển `pending → rejected`. Bắt buộc có lý do từ chối.

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `rejectionReason` | `string` | ✅ | `"Chi phí vượt ngân sách tháng"` |

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về expense với `status: "rejected"` và `rejectionReason` |
| `400 Bad Request` | `"Expense must be in pending status to reject"` |
| `404 Not Found` | Không tìm thấy |

---

#### `POST /expenses/:id/resubmit`

Nộp lại chi phí bị từ chối. Chuyển `rejected → pending`. Xóa `rejectionReason`.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về expense với `status: "pending"`, `rejectionReason: null` |
| `400 Bad Request` | `"Expense must be in rejected status to resubmit"` |
| `404 Not Found` | Không tìm thấy |

---

### 2.3 Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/expenses` | Tạo chi phí (status: pending) |
| `GET` | `/expenses` | Danh sách chi phí (phân trang + thống kê) |
| `GET` | `/expenses/:id` | Chi tiết chi phí |
| `PATCH` | `/expenses/:id` | Cập nhật (chỉ khi pending/rejected) |
| `DELETE` | `/expenses/:id` | Xoá mềm (chỉ khi pending/rejected) |
| `POST` | `/expenses/:id/approve` | Duyệt chi phí → tạo Transaction |
| `POST` | `/expenses/:id/reject` | Từ chối (kèm lý do) |
| `POST` | `/expenses/:id/resubmit` | Nộp lại sau khi bị từ chối |

---

## 3. Payment (Thanh toán)

### 3.1 Entity Schema

Payment ghi nhận khoản thanh toán được nhận từ khách hàng cho một Invoice cụ thể. Payment là **immutable** (không thể sửa sau khi tạo), chỉ có thể hủy (void) bằng soft delete. Khi tạo Payment, hệ thống tự động cập nhật trạng thái Invoice và tạo Transaction thu nhập.

#### Enums

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `method` | `cash` | Tiền mặt |
| `method` | `bank_transfer` | Chuyển khoản |
| `method` | `card` | Thẻ (credit/debit) |
| `method` | `e_wallet` | Ví điện tử |
| `method` | `other` | Khác |

#### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | `string` (ObjectId) | Auto | ID duy nhất | `"507f1f77bcf86cd799439040"` |
| `invoiceId` | `string` | ✅ | ID hóa đơn được thanh toán | `"507f1f77bcf86cd799439020"` |
| `amount` | `MoneyAmount` | ✅ | Số tiền thanh toán | `{ "currency": "VND", "value": 5000000 }` |
| `date` | `Date` | ✅ | Ngày nhận thanh toán | `"2026-04-10T00:00:00.000Z"` |
| `method` | `string` | ✅ | Hình thức thanh toán | `"bank_transfer"` |
| `note` | `string` | - | Ghi chú (tối đa 500 ký tự) | `"Thanh toán đợt 1"` |
| `reference` | `string` | - | Mã tham chiếu ngân hàng/biên lai (tối đa 100 ký tự) | `"FT2604100001"` |
| `transactionId` | `string` | Auto | ID Transaction được tạo tự động | |

#### Trường kế thừa từ BaseSchema

`owner`, `createdBy`, `updatedBy`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`

---

### 3.2 API Endpoints

#### `POST /payments`

Ghi nhận thanh toán cho một hóa đơn. **Không thể tạo payment cho invoice có status `paid` hoặc `cancelled`.**

Khi tạo thành công:
1. Lưu Payment
2. Tạo Transaction loại `income` tự động
3. Tính lại tổng tiền đã thanh toán của Invoice → cập nhật trạng thái Invoice (`partial` hoặc `paid`)

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `invoiceId` | `string` | ✅ | `"507f1f77bcf86cd799439020"` |
| `amount` | `MoneyAmount` | ✅ | `{ "currency": "VND", "value": 5000000 }` |
| `date` | `Date` | ✅ | `"2026-04-10T00:00:00.000Z"` |
| `method` | `string` | ✅ | `"bank_transfer"` |
| `note` | `string` | - | `"Thanh toán đợt 1"` |
| `reference` | `string` | - | `"FT2604100001"` |

**Request Sample**
```json
{
  "invoiceId": "507f1f77bcf86cd799439020",
  "amount": { "currency": "VND", "value": 5500000 },
  "date": "2026-04-10T09:30:00.000Z",
  "method": "bank_transfer",
  "note": "Thanh toán 50% hợp đồng",
  "reference": "FT2604100001"
}
```

**Response**

| Status | Mô tả |
|--------|-------|
| `201 Created` | Ghi nhận thành công, Invoice status tự động cập nhật |
| `400 Bad Request` | `"Cannot record payment for invoice with status: paid"` hoặc `"cancelled"` |
| `404 Not Found` | Invoice không tồn tại |
| `401 Unauthorized` | Chưa xác thực |

---

#### `GET /payments`

Danh sách thanh toán. Thường dùng filter `invoiceId` để xem lịch sử thanh toán của một hóa đơn.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `filter[invoiceId]` | `string` | Lọc theo hóa đơn | `?filter[invoiceId]=507f...` |
| `filter[method]` | `string` | Lọc theo hình thức | `?filter[method]=bank_transfer` |
| `filter[date:gte]` | `Date` | Từ ngày | `?filter[date:gte]=2026-04-01` |
| `filter[date:lte]` | `Date` | Đến ngày | `?filter[date:lte]=2026-04-30` |
| `sort` | `string` | Sắp xếp | `?sort=date:desc` |
| `page` | `number` | Trang | `?page=1` |
| `limit` | `number` | Số kết quả/trang | `?limit=20` |

**Response**

```json
// 200 OK
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439040",
      "invoiceId": "507f1f77bcf86cd799439020",
      "amount": { "currency": "VND", "value": 5500000 },
      "date": "2026-04-10T09:30:00.000Z",
      "method": "bank_transfer",
      "reference": "FT2604100001",
      "transactionId": "507f1f77bcf86cd799439050",
      "createdAt": "2026-04-10T09:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

---

#### `GET /payments/:id`

Lấy chi tiết thanh toán.

**Response**: `200 OK` | `404 Not Found`

---

#### `DELETE /payments/:id`

Hủy thanh toán (void). Khi xóa mềm:
1. Payment bị soft delete
2. Transaction liên kết bị soft delete
3. Invoice status được tính lại (có thể trở về `sent` hoặc `partial`)

> **Không có PATCH** — Payment là immutable.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Hủy thành công, Invoice status tự động cập nhật lại |
| `404 Not Found` | Không tìm thấy |

---

### 3.3 Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/payments` | Ghi nhận thanh toán → cập nhật Invoice → tạo Transaction |
| `GET` | `/payments` | Danh sách thanh toán |
| `GET` | `/payments/:id` | Chi tiết thanh toán |
| `DELETE` | `/payments/:id` | Hủy thanh toán (void) → cập nhật Invoice |

---

## 4. Transaction (Sổ cái)

### 4.1 Entity Schema

Transaction là sổ cái tự động — **chỉ đọc**, không thể tạo hay sửa trực tiếp qua API. Được tạo tự động bởi hệ thống:
- Khi **Payment** được ghi nhận → tạo Transaction loại `income`
- Khi **Expense** được duyệt → tạo Transaction loại `expense`

#### Enums

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `type` | `income` | Thu nhập (từ Payment) |
| `type` | `expense` | Chi phí (từ Expense được duyệt) |
| `referenceType` | `payment` | Nguồn: Payment |
| `referenceType` | `expense` | Nguồn: Expense |

#### Fields

| Trường | Kiểu | Ý nghĩa | Ví dụ |
|--------|------|---------|-------|
| `_id` | `string` (ObjectId) | ID duy nhất | `"507f1f77bcf86cd799439050"` |
| `type` | `string` | Loại: income / expense | `"income"` |
| `amount` | `MoneyAmount` | Số tiền | `{ "currency": "VND", "value": 5500000 }` |
| `date` | `Date` | Ngày giao dịch | `"2026-04-10T09:30:00.000Z"` |
| `referenceType` | `string` | Loại nguồn: payment / expense | `"payment"` |
| `referenceId` | `string` | ID của Payment hoặc Expense nguồn | `"507f1f77bcf86cd799439040"` |
| `snapshot` | `object` | Thông tin tóm tắt tại thời điểm tạo (xem bên dưới) | |

#### Nested Object: `snapshot`

Thông tin denormalized được lưu tại thời điểm tạo Transaction để tra cứu nhanh.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `description` | `string` | Mô tả ngắn: `"Payment received for invoice INV-2026-0001"` hoặc `"Expense approved: Phí AWS EC2"` |
| `invoiceCode` | `string` | Mã hóa đơn (chỉ có với income) |
| `expenseCategory` | `string` | Loại chi phí (chỉ có với expense) |

#### Trường kế thừa từ BaseSchema

`owner`, `createdBy`, `updatedBy`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`

---

### 4.2 API Endpoints

> **Lưu ý:** Transaction **không có** POST, PATCH, DELETE. Chỉ đọc.

#### `GET /transactions`

Danh sách giao dịch sổ cái. Hỗ trợ lọc theo loại, ngày, tiền tệ.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `filter[type]` | `string` | Lọc income/expense | `?filter[type]=income` |
| `filter[referenceType]` | `string` | Lọc theo nguồn | `?filter[referenceType]=payment` |
| `filter[date:gte]` | `Date` | Từ ngày | `?filter[date:gte]=2026-04-01` |
| `filter[date:lte]` | `Date` | Đến ngày | `?filter[date:lte]=2026-04-30` |
| `filter[amount.currency]` | `string` | Lọc theo tiền tệ | `?filter[amount.currency]=VND` |
| `sort` | `string` | Sắp xếp | `?sort=date:desc` |
| `page` | `number` | Trang | `?page=1` |
| `limit` | `number` | Số kết quả/trang | `?limit=50` |

**Response**

```json
// 200 OK
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439050",
      "type": "income",
      "amount": { "currency": "VND", "value": 5500000 },
      "date": "2026-04-10T09:30:00.000Z",
      "referenceType": "payment",
      "referenceId": "507f1f77bcf86cd799439040",
      "snapshot": {
        "description": "Payment received for invoice INV-2026-0001",
        "invoiceCode": "INV-2026-0001"
      },
      "createdAt": "2026-04-10T09:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 200,
    "totalPages": 4
  }
}
```

---

#### `GET /transactions/summary`

Tổng hợp thu nhập vs chi phí theo kỳ và tiền tệ. Dùng để hiển thị dashboard tài chính.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `period` | `string` | Nhóm theo: `year`, `month`, `day` | `?period=month` |
| `currency` | `string` | Lọc theo tiền tệ | `?currency=VND` |
| `dateFrom` | `Date` | Từ ngày | `?dateFrom=2026-01-01` |
| `dateTo` | `Date` | Đến ngày | `?dateTo=2026-04-30` |

**Response**

```json
// 200 OK
{
  "data": [
    {
      "_id": {
        "type": "income",
        "currency": "VND",
        "period": { "year": 2026, "month": 4 }
      },
      "total": 45000000,
      "count": 8
    },
    {
      "_id": {
        "type": "expense",
        "currency": "VND",
        "period": { "year": 2026, "month": 4 }
      },
      "total": 12000000,
      "count": 15
    }
  ]
}
```

> Kết quả được sắp xếp theo thời gian giảm dần (mới nhất trước).

---

#### `GET /transactions/:id`

Lấy chi tiết một giao dịch theo ID.

**Response**: `200 OK` | `404 Not Found`

---

### 4.3 Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `GET` | `/transactions` | Danh sách giao dịch (chỉ đọc) |
| `GET` | `/transactions/summary` | Tổng hợp thu/chi theo kỳ |
| `GET` | `/transactions/:id` | Chi tiết giao dịch |

---

## Ghi chú đặc biệt — Finance

### Luồng dữ liệu tự động

Sơ đồ các tác động tự động khi ghi nhận Payment hoặc duyệt Expense:

```
POST /payments
  → Tạo Payment
  → Tạo Transaction (type: income, referenceType: payment)
  → Lưu transactionId vào Payment
  → Tính lại tổng paid của Invoice → cập nhật status Invoice

DELETE /payments/:id
  → Soft delete Payment
  → Soft delete Transaction liên kết
  → Tính lại tổng paid của Invoice → cập nhật status Invoice

POST /expenses/:id/approve
  → Cập nhật Expense status: approved
  → Tạo Transaction (type: expense, referenceType: expense)
```

### Invoice Status — Tự động cập nhật

Trạng thái Invoice được tính lại tự động mỗi khi có Payment thay đổi:

| Tổng tiền đã thanh toán | Status Invoice |
|------------------------|---------------|
| `>= totalAmount` | `paid` |
| `> 0` và `< totalAmount` | `partial` |
| `= 0` (và đang là partial/overdue) | `sent` |

### Invoice Code — Tự động sinh

Nếu không truyền `code` khi tạo Invoice, hệ thống tự sinh theo format: `INV-{YYYY}-{seq:04d}` (ví dụ: `INV-2026-0001`). Sequence bắt đầu từ 1, tăng dần theo năm và theo từng tổ chức riêng biệt.

### Transaction — Chỉ đọc

Transaction không có endpoint tạo/sửa/xóa. Frontend chỉ có thể đọc. Soft delete Transaction chỉ xảy ra nội bộ khi Payment bị void.

### Soft Delete
Tất cả entity Finance chỉ dùng soft delete. Riêng Payment khi bị void còn kéo theo soft delete Transaction liên kết.

### Org-scoped
Tất cả query đều tự động lọc theo `owner.orgId` từ JWT token.
