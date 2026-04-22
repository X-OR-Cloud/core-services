# CBM – Contract & ContractAnnex: Frontend API Reference

> Base URL (production): `https://api.hydrabyte.co/cbm`
> Tất cả endpoint đều yêu cầu JWT (`Authorization: Bearer <token>`).

---

## 1. Contract (Hợp đồng)

### Entity Contract

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `_id` | string | MongoDB ObjectId |
| `code` | string | Mã hợp đồng, auto-gen `CTR-YYYY-NNNN` |
| `title` | string | Tiêu đề hợp đồng |
| `contactId` | string | Ref: Contact |
| `companyId` | string? | Ref: Company (nếu có) |
| `type` | string | `service` \| `maintenance` \| `support` \| `other` |
| `description` | string? | Nội dung / điều khoản tổng quan |
| `status` | string | `draft` \| `active` \| `expired` \| `terminated` \| `cancelled` |
| `startDate` | Date? | Ngày bắt đầu |
| `endDate` | Date? | Ngày kết thúc |
| `value` | MoneyAmount? | Giá trị hợp đồng `{ currency, value }` |
| `eInvoice` | EInvoiceLink? | Thông tin hóa đơn điện tử đã phát hành |
| `eInvoiceRawData` | object? | Raw response từ nhà cung cấp eInvoice |
| `notes` | string? | Ghi chú |
| `owner.orgId` | string | Org sở hữu |
| `createdBy` | object | Người tạo |
| `updatedBy` | object | Người cập nhật cuối |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**MoneyAmount:**
```json
{ "currency": "VND", "value": 12000000 }
```

**EInvoiceLink:**
```json
{
  "provider": "VIETTEL",
  "eInvoiceId": "VT-2026-0001",
  "fileUrl": "https://...",
  "rawData": {},
  "linkedAt": "2026-04-22T..."
}
```

### State Machine

```
draft ──► active ──► expired
                └──► terminated
draft ──► cancelled ◄── active
cancelled ──► draft   (reopen)
```

- Update / delete chỉ cho phép ở trạng thái `draft`
- Delete chỉ cho phép ở trạng thái `draft` hoặc `cancelled`

---

### POST /contracts

Tạo hợp đồng mới. Status tự động là `draft`. Code auto-gen nếu không truyền.

**Body:**
```json
{
  "title": "Hợp đồng dịch vụ phần mềm 2026",
  "contactId": "<contactId>",
  "companyId": "<companyId>",
  "type": "service",
  "description": "Cung cấp dịch vụ SaaS theo hợp đồng 12 tháng",
  "startDate": "2026-05-01T00:00:00.000Z",
  "endDate": "2027-04-30T00:00:00.000Z",
  "value": { "currency": "VND", "value": 120000000 },
  "notes": "Thanh toán theo tháng"
}
```

**Response:** `201` — Contract object

---

### GET /contracts

Lấy danh sách hợp đồng với phân trang, tìm kiếm, thống kê.

**Query params:**

| Param | Ví dụ | Mô tả |
|-------|-------|-------|
| `page` | `1` | Trang |
| `limit` | `20` | Số bản ghi/trang |
| `search` | `CTR-2026` | Tìm trong code, title, notes |
| `filter[status]` | `active` | Lọc theo status |
| `filter[type]` | `service` | Lọc theo loại |
| `filter[contactId]` | `<id>` | Lọc theo contact |
| `filter[companyId]` | `<id>` | Lọc theo company |
| `sort` | `createdAt:desc` | Sắp xếp |

**Response:** `200`
```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 5 },
  "statistics": {
    "total": 5,
    "byStatus": { "draft": 2, "active": 3 },
    "byType": { "service": 4, "other": 1 }
  }
}
```

---

### GET /contracts/:id

Lấy chi tiết hợp đồng theo ID.

**Response:** `200` — Contract object | `404` nếu không tìm thấy

---

### PATCH /contracts/:id

Cập nhật hợp đồng. **Chỉ cho phép khi status = `draft`.**

**Body (tất cả optional):**
```json
{
  "title": "...",
  "contactId": "...",
  "companyId": "...",
  "type": "maintenance",
  "description": "...",
  "startDate": "...",
  "endDate": "...",
  "value": { "currency": "VND", "value": 150000000 },
  "notes": "..."
}
```

**Response:** `200` — Contract object đã cập nhật

---

### DELETE /contracts/:id

Xóa mềm hợp đồng. **Chỉ cho phép khi status = `draft` hoặc `cancelled`.**

**Response:** `200`

---

### PATCH /contracts/:id/activate

Chuyển trạng thái `draft → active`.

**Response:** `200` — Contract object

---

### PATCH /contracts/:id/expire

Chuyển trạng thái `active → expired`.

**Response:** `200` — Contract object

---

### PATCH /contracts/:id/terminate

Chuyển trạng thái `active → terminated`.

**Response:** `200` — Contract object

---

### PATCH /contracts/:id/cancel

Hủy hợp đồng. Cho phép từ `draft` hoặc `active`.

**Response:** `200` — Contract object

---

### PATCH /contracts/:id/reopen

Mở lại hợp đồng đã hủy: `cancelled → draft`.

**Response:** `200` — Contract object

---

### PATCH /contracts/:id/e-invoice

Gắn thông tin hóa đơn điện tử vào hợp đồng.

**Body:**
```json
{
  "provider": "VIETTEL",
  "eInvoiceId": "VT-2026-0001",
  "fileUrl": "https://einvoice.viettel.vn/files/...",
  "rawData": { "transactionId": "...", "status": "issued" },
  "eInvoiceRawData": { "fullResponse": "..." }
}
```

> **`eInvoiceRawData`** lưu toàn bộ raw object từ provider vào field riêng trên entity.
> **`rawData`** lưu trong `eInvoice.rawData` (là một phần của EInvoiceLink).

**Response:** `200` — Contract object

---

## 2. ContractAnnex (Phụ lục hợp đồng)

### Entity ContractAnnex

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `_id` | string | MongoDB ObjectId |
| `contractId` | string | Hợp đồng cha |
| `code` | string | Mã phụ lục, auto-gen `PL01`, `PL02`, ... per contract |
| `title` | string | Tiêu đề phụ lục |
| `description` | string? | Mô tả nội dung phụ lục |
| `status` | string | `draft` \| `active` \| `cancelled` |
| `serviceItems` | ServiceItem[] | Danh sách dịch vụ / hạng mục |
| `subtotal` | MoneyAmount? | Tổng phụ lục |
| `eInvoice` | EInvoiceLink? | Hóa đơn điện tử đã phát hành |
| `eInvoiceRawData` | object? | Raw response từ provider |
| `notes` | string? | Ghi chú |
| `owner.orgId` | string | |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**ServiceItem:**
```json
{
  "name": "Cloud Hosting",
  "description": "VPS 4 core / 8GB RAM",
  "qty": 3,
  "unit": { "id": "", "code": "month", "name": "Tháng" },
  "unitPrice": { "currency": "VND", "value": 1500000 },
  "amount": { "currency": "VND", "value": 4500000 }
}
```

**ServiceItemUnit — UnitCode enum:**

| code | Tên hiển thị |
|------|-------------|
| `month` | Tháng |
| `hour` | Giờ |
| `day` | Ngày |
| `year` | Năm |
| `license` | License |
| `time` | Lần |
| `item` | Cái |
| `package` | Gói |
| `other` | Khác |

> `id` mặc định để `""` — dùng khi cần sync với hệ thống eInvoice provider có danh mục đơn vị tính.

### State Machine

```
draft ──► active
draft ──► cancelled ◄── active
cancelled ──► draft   (reopen)
```

- Update / delete chỉ cho phép ở trạng thái `draft`
- Delete chỉ cho phép ở trạng thái `draft` hoặc `cancelled`

---

### POST /contract-annexes

Tạo phụ lục mới. `contractId` bắt buộc. Code tự sinh (`PL01`, `PL02`, ...) theo contract.

**Body:**
```json
{
  "contractId": "<contractId>",
  "title": "Phụ lục 01 – Dịch vụ tháng 5/2026",
  "description": "Chi tiết dịch vụ cung cấp trong tháng 5",
  "serviceItems": [
    {
      "name": "Cloud Hosting",
      "qty": 1,
      "unit": { "id": "", "code": "month", "name": "Tháng" },
      "unitPrice": { "currency": "VND", "value": 5000000 },
      "amount": { "currency": "VND", "value": 5000000 }
    }
  ],
  "subtotal": { "currency": "VND", "value": 5000000 },
  "notes": ""
}
```

**Response:** `201` — ContractAnnex object

---

### GET /contract-annexes

Lấy danh sách phụ lục. Dùng `filter[contractId]` để lọc theo hợp đồng.

**Query params:**

| Param | Ví dụ | Mô tả |
|-------|-------|-------|
| `page` | `1` | |
| `limit` | `20` | |
| `search` | `PL01` | Tìm trong code, title, notes |
| `filter[contractId]` | `<id>` | **Bắt buộc khi hiển thị phụ lục của 1 hợp đồng** |
| `filter[status]` | `active` | |
| `sort` | `createdAt:asc` | |

**Response:** `200`
```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 3 },
  "statistics": {
    "total": 3,
    "byStatus": { "draft": 1, "active": 2 }
  }
}
```

---

### GET /contract-annexes/:id

Lấy chi tiết phụ lục theo ID.

**Response:** `200` — ContractAnnex object | `404`

---

### PATCH /contract-annexes/:id

Cập nhật phụ lục. **Chỉ cho phép khi status = `draft`.**

**Body (tất cả optional):**
```json
{
  "title": "...",
  "description": "...",
  "serviceItems": [...],
  "subtotal": { "currency": "VND", "value": 10000000 },
  "notes": "..."
}
```

**Response:** `200` — ContractAnnex object

---

### DELETE /contract-annexes/:id

Xóa mềm phụ lục. **Chỉ cho phép khi status = `draft` hoặc `cancelled`.**

**Response:** `200`

---

### PATCH /contract-annexes/:id/activate

Chuyển trạng thái `draft → active`.

**Response:** `200`

---

### PATCH /contract-annexes/:id/cancel

Hủy phụ lục. Cho phép từ `draft` hoặc `active`.

**Response:** `200`

---

### PATCH /contract-annexes/:id/reopen

Mở lại phụ lục đã hủy: `cancelled → draft`.

**Response:** `200`

---

### PATCH /contract-annexes/:id/e-invoice

Gắn thông tin hóa đơn điện tử vào phụ lục.

**Body:** (giống với Contract)
```json
{
  "provider": "VIETTEL",
  "eInvoiceId": "VT-2026-0002",
  "fileUrl": "https://...",
  "rawData": {},
  "eInvoiceRawData": { "fullPayload": "..." }
}
```

**Response:** `200` — ContractAnnex object

---

## 3. Liên kết Invoice ↔ Contract/Annex

Invoice hỗ trợ 2 trường optional để liên kết với hợp đồng:

| Trường | Mô tả |
|--------|-------|
| `contractId` | Ref: Contract |
| `contractAnnexId` | Ref: ContractAnnex |

Truyền các trường này khi tạo/cập nhật invoice (`POST /invoices`, `PATCH /invoices/:id`) để theo dõi hóa đơn nào phát sinh từ hợp đồng / phụ lục nào.

**Ví dụ tạo Invoice gắn với phụ lục:**
```json
{
  "contactId": "...",
  "contractId": "...",
  "contractAnnexId": "...",
  "items": [...],
  "subtotal": { "currency": "VND", "value": 5000000 },
  "totalAmount": { "currency": "VND", "value": 5000000 },
  "issuedDate": "2026-05-01T00:00:00.000Z"
}
```

---

## 4. Error Responses

| HTTP | Code | Tình huống |
|------|------|-----------|
| 400 | BAD_REQUEST | Transition trạng thái không hợp lệ, update khi không ở draft |
| 401 | UNAUTHORIZED | Token không hợp lệ / hết hạn |
| 404 | NOT_FOUND | Không tìm thấy contract / annex |
| 422 | UNPROCESSABLE_ENTITY | Validation body thất bại |

---

*Tài liệu này được tạo tự động bởi CBM Agent – 2026-04-22*
