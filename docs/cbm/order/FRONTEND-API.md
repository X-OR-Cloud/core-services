# CBM — Product & Order: Tài liệu Nghiệp vụ & API

> Dành cho Frontend Developer  
> Base URL: `https://api.hydrabyte.co/cbm`  
> Tất cả endpoints yêu cầu header: `Authorization: Bearer <JWT_TOKEN>`

---

## Mục lục

1. [Tổng quan luồng nghiệp vụ](#1-tổng-quan-luồng-nghiệp-vụ)
2. [Product Category (Danh mục sản phẩm)](#2-product-category-danh-mục-sản-phẩm)
3. [Product (Sản phẩm)](#3-product-sản-phẩm)
4. [Order (Đơn hàng)](#4-order-đơn-hàng)
5. [Kiểu dữ liệu dùng chung](#5-kiểu-dữ-liệu-dùng-chung)

---

## 1. Tổng quan luồng nghiệp vụ

### 1.1 Luồng tạo đơn hàng mang đi

```
[Màn hình tạo đơn]
       │
       ├─ 1. Load danh mục  GET /product-categories?status=active
       ├─ 2. Load sản phẩm  GET /products?status=active&categoryId=<id>
       ├─ 3. Tìm khách      GET /contacts?types=customer&search=<phone/name>
       │      └─ Khách lẻ: bỏ qua bước này, nhập tay name + phone
       │
       ├─ 4. Tạo đơn        POST /orders
       │      └─ code được tự động sinh: ORD-YYYYMMDD-0001
       │
       └─ 5. In bill        GET /orders/:id  → render từ response
```

### 1.2 Luồng quản lý đơn hàng

```
[Danh sách đơn]  GET /orders?status=new
       │
       ├─ Xem chi tiết     GET /orders/:id
       ├─ Sửa đơn          PATCH /orders/:id   (chỉ khi status: new | processing)
       │
       ├─ Chuyển trạng thái:
       │   new ──→ processing   POST /orders/:id/process
       │   new/processing ──→ done   POST /orders/:id/complete
       │   new/processing ──→ cancelled   POST /orders/:id/cancel
       │
       └─ Xóa đơn          DELETE /orders/:id  (không được xóa khi status: done)
```

### 1.3 State machine đơn hàng

```
new ──→ processing ──→ done
 │            │
 └────────────┴──→ cancelled
```

| Trạng thái | Ý nghĩa | Có thể sửa? |
|-----------|---------|-------------|
| `new` | Vừa tạo, chưa xử lý | ✅ |
| `processing` | Đang xử lý (bếp đang chuẩn bị, dịch vụ đang thực hiện...) | ✅ |
| `done` | Hoàn thành | ❌ |
| `cancelled` | Đã hủy | ❌ |

---

## 2. Product Category (Danh mục sản phẩm)

### 2.1 Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `_id` | `string` | Auto | ID duy nhất |
| `name` | `string` | ✅ | Tên danh mục |
| `note` | `string` | - | Ghi chú |
| `status` | `"active" \| "inactive"` | Auto (`active`) | Trạng thái |
| `createdAt` | `Date` | Auto | |
| `updatedAt` | `Date` | Auto | |

---

### 2.2 API

#### `GET /product-categories` — Danh sách danh mục

**Query params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `search` | `string` | Tìm theo tên |
| `status` | `active \| inactive` | Lọc theo trạng thái |
| `page` | `number` | Trang (mặc định: 1) |
| `limit` | `number` | Số bản ghi/trang (mặc định: 20) |

**Sample response:**
```json
{
  "data": [
    {
      "_id": "663f1a2b4c5d6e7f8a9b0c01",
      "name": "Món mặn",
      "note": null,
      "status": "active",
      "createdAt": "2026-05-01T08:00:00.000Z",
      "updatedAt": "2026-05-01T08:00:00.000Z"
    },
    {
      "_id": "663f1a2b4c5d6e7f8a9b0c02",
      "name": "Đồ uống",
      "note": "Nước ngọt, sinh tố, trà sữa",
      "status": "active",
      "createdAt": "2026-05-01T08:01:00.000Z",
      "updatedAt": "2026-05-01T08:01:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "totalPages": 1
  }
}
```

---

#### `POST /product-categories` — Tạo danh mục

**Request body:**
```json
{
  "name": "Bánh bao",
  "note": "Các loại bánh bao hấp và chiên",
  "status": "active"
}
```

**Sample response** `201`:
```json
{
  "_id": "663f1a2b4c5d6e7f8a9b0c03",
  "name": "Bánh bao",
  "note": "Các loại bánh bao hấp và chiên",
  "status": "active",
  "createdAt": "2026-05-05T10:00:00.000Z",
  "updatedAt": "2026-05-05T10:00:00.000Z"
}
```

---

#### `PATCH /product-categories/:id` — Cập nhật danh mục

**Request body** (tất cả optional):
```json
{
  "name": "Bánh bao hấp",
  "status": "inactive"
}
```

**Sample response** `200`: object danh mục đã cập nhật.

---

#### `DELETE /product-categories/:id` — Xóa mềm danh mục

**Sample response** `200`:
```json
{
  "_id": "663f1a2b4c5d6e7f8a9b0c03",
  "isDeleted": true,
  "deletedAt": "2026-05-05T11:00:00.000Z"
}
```

---

## 3. Product (Sản phẩm)

### 3.1 Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `_id` | `string` | Auto | ID duy nhất |
| `code` | `string` | ✅ | Mã sản phẩm, duy nhất trong org |
| `name` | `string` | ✅ | Tên sản phẩm |
| `categoryId` | `string` | - | ID danh mục |
| `price` | `MoneyAmount` | ✅ | Giá bán |
| `taxRate` | `number` | ✅ | % thuế (vd: `8` = 8%) |
| `status` | `"active" \| "inactive"` | Auto (`active`) | Trạng thái kinh doanh |
| `note` | `string` | - | Ghi chú / mẫu ghi chú cho khách |
| `createdAt` | `Date` | Auto | |
| `updatedAt` | `Date` | Auto | |

---

### 3.2 API

#### `GET /products` — Danh sách sản phẩm

**Query params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `search` | `string` | Tìm theo tên hoặc mã sản phẩm |
| `categoryId` | `string` | Lọc theo danh mục |
| `status` | `active \| inactive` | Lọc theo trạng thái |
| `page` | `number` | Trang (mặc định: 1) |
| `limit` | `number` | Số bản ghi/trang (mặc định: 20) |
| `sort` | `string` | Sắp xếp, vd: `name:asc`, `price.value:asc` |

**Sample response:**
```json
{
  "data": [
    {
      "_id": "663f2b3c4d5e6f7a8b9c0d01",
      "code": "SP000562",
      "name": "Bún bò Nam Bộ",
      "categoryId": "663f1a2b4c5d6e7f8a9b0c01",
      "price": { "currency": "VND", "value": 70000 },
      "taxRate": 8,
      "status": "active",
      "note": null,
      "createdAt": "2026-05-01T08:00:00.000Z",
      "updatedAt": "2026-05-01T08:00:00.000Z"
    },
    {
      "_id": "663f2b3c4d5e6f7a8b9c0d02",
      "code": "SP000100",
      "name": "Bánh bao HongBao 3 bánh",
      "categoryId": "663f1a2b4c5d6e7f8a9b0c03",
      "price": { "currency": "VND", "value": 160000 },
      "taxRate": 8,
      "status": "active",
      "note": null,
      "createdAt": "2026-05-01T08:00:00.000Z",
      "updatedAt": "2026-05-01T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 466,
    "totalPages": 24
  }
}
```

---

#### `POST /products` — Tạo sản phẩm

**Request body:**
```json
{
  "code": "SP000999",
  "name": "Xíu mại tôm đặc biệt",
  "categoryId": "663f1a2b4c5d6e7f8a9b0c01",
  "price": { "currency": "VND", "value": 120000 },
  "taxRate": 8,
  "status": "active",
  "note": "Ăn kèm tương ớt"
}
```

**Sample response** `201`: object sản phẩm vừa tạo.

---

#### `POST /products/import` — Import hàng loạt

> Dùng để đồng bộ danh sách sản phẩm từ file Excel/POS khác.  
> Logic: nếu `code` đã tồn tại trong org → **update**, chưa tồn tại → **create**.

**Request body:**
```json
{
  "items": [
    {
      "code": "SP000562",
      "name": "Bún bò Nam Bộ",
      "price": { "currency": "VND", "value": 70000 },
      "taxRate": 8,
      "status": "active"
    },
    {
      "code": "SP000100",
      "name": "Bánh bao HongBao 3 bánh",
      "categoryId": "663f1a2b4c5d6e7f8a9b0c03",
      "price": { "currency": "VND", "value": 160000 },
      "taxRate": 8
    }
  ]
}
```

**Sample response** `201`:
```json
{
  "created": 1,
  "updated": 1,
  "errors": []
}
```

> Nếu một số item lỗi validation, `errors` sẽ chứa danh sách mô tả lỗi, các item hợp lệ vẫn được xử lý bình thường.

---

#### `PATCH /products/:id` — Cập nhật sản phẩm

**Request body** (tất cả optional):
```json
{
  "price": { "currency": "VND", "value": 75000 },
  "status": "inactive"
}
```

---

#### `DELETE /products/:id` — Xóa mềm sản phẩm

**Sample response** `200`: object sản phẩm đã được đánh dấu xóa.

---

## 4. Order (Đơn hàng)

### 4.1 Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `_id` | `string` | Auto | ID duy nhất |
| `code` | `string` | Auto | Mã đơn tự sinh: `ORD-YYYYMMDD-0001` |
| `customer` | `OrderCustomer` | ✅ | Thông tin khách hàng (snapshot) |
| `items` | `OrderItem[]` | ✅ | Danh sách món/sản phẩm |
| `delivery` | `OrderDelivery` | - | Thông tin giao hàng |
| `payment` | `OrderPayment` | - | Thông tin thanh toán |
| `subTotalAmount` | `MoneyAmount` | ✅ | Tổng tiền hàng (chưa tính thuế) |
| `taxAmount` | `MoneyAmount` | ✅ | Tiền thuế |
| `totalAmount` | `MoneyAmount` | ✅ | Khách cần trả (subTotal + tax - discount) |
| `status` | `string` | Auto (`new`) | Trạng thái đơn hàng |
| `note` | `string` | - | Ghi chú đơn hàng |
| `createdAt` | `Date` | Auto | |
| `updatedAt` | `Date` | Auto | |

#### OrderCustomer

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `id` | `string` | - | Contact ID (bỏ trống nếu là khách lẻ) |
| `name` | `string` | ✅ | Tên khách hàng (vd: `"Khách lẻ"`) |
| `phone` | `string` | - | Số điện thoại |
| `address` | `string` | - | Địa chỉ |

> **Khách lẻ**: truyền `{ "name": "Khách lẻ" }`, bỏ trống `id`.  
> **Khách có tài khoản**: lấy `_id` từ Contact → truyền vào `id`, copy name/phone/address vào các trường còn lại.  
> `customer` là **snapshot** — thay đổi thông tin contact sau này không ảnh hưởng đơn hàng đã tạo.

#### OrderItem

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `productId` | `string` | - | Product ID (để tra cứu, không bắt buộc) |
| `code` | `string` | ✅ | Mã sản phẩm (snapshot) |
| `name` | `string` | ✅ | Tên sản phẩm (snapshot) |
| `price` | `MoneyAmount` | ✅ | Đơn giá tại thời điểm đặt (snapshot) |
| `quantity` | `number` | ✅ | Số lượng |
| `amount` | `MoneyAmount` | ✅ | Thành tiền = `price.value × quantity` |

> Item lưu snapshot giá — thay đổi giá sản phẩm sau này không ảnh hưởng đơn đã tạo.

#### OrderDelivery

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `recipientName` | `string` | Tên người nhận |
| `recipientPhone` | `string` | SĐT người nhận |
| `address` | `string` | Địa chỉ giao hàng |
| `shipperPhone` | `string` | SĐT shipper |
| `note` | `string` | Ghi chú cho shipper |

#### OrderPayment

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `id` | `string` | Payment ID (nếu liên kết với payment record) |
| `method` | `string` | Hình thức: `cash`, `transfer`, `cod` |
| `status` | `string` | Trạng thái: `unpaid`, `paid` |

---

### 4.2 API

#### `GET /orders` — Danh sách đơn hàng

**Query params:**

| Param | Kiểu | Ý nghĩa |
|-------|------|---------|
| `search` | `string` | Tìm theo mã đơn, tên KH, SĐT KH |
| `status` | `new \| processing \| done \| cancelled` | Lọc theo trạng thái |
| `customerId` | `string` | Lọc đơn của một khách hàng |
| `page` | `number` | Trang (mặc định: 1) |
| `limit` | `number` | Số bản ghi/trang (mặc định: 20) |
| `sort` | `string` | vd: `createdAt:desc` |

**Sample response:**
```json
{
  "data": [
    {
      "_id": "663f3c4d5e6f7a8b9c0d0e01",
      "code": "ORD-20260505-0001",
      "customer": {
        "name": "Thủy Mít",
        "phone": "0989858588",
        "address": "HH1 ngõ 102 Trường Chinh"
      },
      "items": [
        {
          "code": "SP000100",
          "name": "Bánh bao HongBao 3 bánh",
          "price": { "currency": "VND", "value": 160000 },
          "quantity": 2,
          "amount": { "currency": "VND", "value": 320000 }
        }
      ],
      "subTotalAmount": { "currency": "VND", "value": 320000 },
      "taxAmount": { "currency": "VND", "value": 25600 },
      "totalAmount": { "currency": "VND", "value": 345600 },
      "payment": { "method": "cash", "status": "unpaid" },
      "status": "new",
      "note": null,
      "createdAt": "2026-05-05T22:48:00.000Z",
      "updatedAt": "2026-05-05T22:48:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  },
  "statistics": {
    "total": 5,
    "byStatus": {
      "new": 2,
      "processing": 1,
      "done": 2,
      "cancelled": 0
    }
  }
}
```

> `statistics.byStatus` dùng để hiển thị badge số lượng trên các tab trạng thái (Tất cả / Mới / Đang xử lý / Hoàn thành / Hủy).

---

#### `POST /orders` — Tạo đơn hàng

> `code` và `status` được tự động gán — không cần truyền vào.

**Request body — Khách có tài khoản:**
```json
{
  "customer": {
    "id": "663f0000000000000000aa01",
    "name": "Thủy Mít",
    "phone": "0989858588",
    "address": "HH1 ngõ 102 Trường Chinh"
  },
  "items": [
    {
      "productId": "663f2b3c4d5e6f7a8b9c0d02",
      "code": "SP000100",
      "name": "Bánh bao HongBao 3 bánh",
      "price": { "currency": "VND", "value": 160000 },
      "quantity": 2,
      "amount": { "currency": "VND", "value": 320000 }
    }
  ],
  "subTotalAmount": { "currency": "VND", "value": 320000 },
  "taxAmount": { "currency": "VND", "value": 25600 },
  "totalAmount": { "currency": "VND", "value": 345600 },
  "payment": { "method": "cash", "status": "unpaid" },
  "note": "Giao trước 12h"
}
```

**Request body — Khách lẻ:**
```json
{
  "customer": {
    "name": "Khách lẻ"
  },
  "items": [
    {
      "code": "SP000562",
      "name": "Bún bò Nam Bộ",
      "price": { "currency": "VND", "value": 70000 },
      "quantity": 1,
      "amount": { "currency": "VND", "value": 70000 }
    }
  ],
  "subTotalAmount": { "currency": "VND", "value": 70000 },
  "taxAmount": { "currency": "VND", "value": 5600 },
  "totalAmount": { "currency": "VND", "value": 75600 },
  "payment": { "method": "cash", "status": "unpaid" }
}
```

**Request body — Có thông tin giao hàng:**
```json
{
  "customer": {
    "id": "663f0000000000000000aa01",
    "name": "Ngọc Diệp",
    "phone": "0939366688",
    "address": "25A Lý Thường Kiệt"
  },
  "items": [
    {
      "code": "SP000562",
      "name": "Bún bò Nam Bộ",
      "price": { "currency": "VND", "value": 70000 },
      "quantity": 3,
      "amount": { "currency": "VND", "value": 210000 }
    }
  ],
  "delivery": {
    "recipientName": "Ngọc Diệp",
    "recipientPhone": "0939366688",
    "address": "25A Lý Thường Kiệt, Hà Nội",
    "shipperPhone": "0912345678",
    "note": "Gọi trước khi giao"
  },
  "subTotalAmount": { "currency": "VND", "value": 210000 },
  "taxAmount": { "currency": "VND", "value": 16800 },
  "totalAmount": { "currency": "VND", "value": 226800 },
  "payment": { "method": "cod", "status": "unpaid" }
}
```

**Sample response** `201`:
```json
{
  "_id": "663f3c4d5e6f7a8b9c0d0e01",
  "code": "ORD-20260505-0001",
  "customer": {
    "name": "Khách lẻ"
  },
  "items": [
    {
      "code": "SP000562",
      "name": "Bún bò Nam Bộ",
      "price": { "currency": "VND", "value": 70000 },
      "quantity": 1,
      "amount": { "currency": "VND", "value": 70000 }
    }
  ],
  "subTotalAmount": { "currency": "VND", "value": 70000 },
  "taxAmount": { "currency": "VND", "value": 5600 },
  "totalAmount": { "currency": "VND", "value": 75600 },
  "payment": { "method": "cash", "status": "unpaid" },
  "status": "new",
  "note": null,
  "createdAt": "2026-05-05T22:48:00.000Z",
  "updatedAt": "2026-05-05T22:48:00.000Z"
}
```

---

#### `GET /orders/:id` — Chi tiết đơn hàng

> Dùng để hiển thị bill in, xem chi tiết trước khi sửa.

**Sample response** `200`:
```json
{
  "_id": "663f3c4d5e6f7a8b9c0d0e01",
  "code": "ORD-20260505-0001",
  "customer": {
    "id": "663f0000000000000000aa01",
    "name": "Thủy Mít",
    "phone": "0989858588",
    "address": "HH1 ngõ 102 Trường Chinh"
  },
  "items": [
    {
      "productId": "663f2b3c4d5e6f7a8b9c0d02",
      "code": "SP000100",
      "name": "Bánh bao HongBao 3 bánh",
      "price": { "currency": "VND", "value": 160000 },
      "quantity": 2,
      "amount": { "currency": "VND", "value": 320000 }
    }
  ],
  "delivery": null,
  "payment": { "method": "cash", "status": "unpaid" },
  "subTotalAmount": { "currency": "VND", "value": 320000 },
  "taxAmount": { "currency": "VND", "value": 25600 },
  "totalAmount": { "currency": "VND", "value": 345600 },
  "status": "new",
  "note": "Giao trước 12h",
  "createdAt": "2026-05-05T22:48:00.000Z",
  "updatedAt": "2026-05-05T22:48:00.000Z"
}
```

---

#### `PATCH /orders/:id` — Sửa đơn hàng

> Chỉ cho phép khi `status` là `new` hoặc `processing`.  
> Có thể sửa: danh sách món, thông tin khách, giao hàng, thanh toán, ghi chú, số tiền.

**Request body** (tất cả optional):
```json
{
  "items": [
    {
      "productId": "663f2b3c4d5e6f7a8b9c0d02",
      "code": "SP000100",
      "name": "Bánh bao HongBao 3 bánh",
      "price": { "currency": "VND", "value": 160000 },
      "quantity": 3,
      "amount": { "currency": "VND", "value": 480000 }
    }
  ],
  "subTotalAmount": { "currency": "VND", "value": 480000 },
  "taxAmount": { "currency": "VND", "value": 38400 },
  "totalAmount": { "currency": "VND", "value": 518400 },
  "payment": { "method": "transfer", "status": "paid" }
}
```

**Error khi sửa đơn đã done/cancelled** `400`:
```json
{
  "statusCode": 400,
  "message": "Order can only be updated in new or processing status (current: done)",
  "error": "Bad Request"
}
```

---

#### `DELETE /orders/:id` — Xóa mềm đơn hàng

> Không cho phép xóa khi `status` là `done`.

**Sample response** `200`: object đơn hàng đã được đánh dấu xóa.

**Error khi xóa đơn đã done** `400`:
```json
{
  "statusCode": 400,
  "message": "Cannot delete a completed order",
  "error": "Bad Request"
}
```

---

#### `POST /orders/:id/process` — Chuyển sang đang xử lý

> Transition: `new → processing`

**Sample response** `200`:
```json
{
  "_id": "663f3c4d5e6f7a8b9c0d0e01",
  "code": "ORD-20260505-0001",
  "status": "processing",
  "updatedAt": "2026-05-05T23:00:00.000Z"
}
```

---

#### `POST /orders/:id/complete` — Hoàn thành đơn hàng

> Transition: `new | processing → done`

**Sample response** `200`:
```json
{
  "_id": "663f3c4d5e6f7a8b9c0d0e01",
  "code": "ORD-20260505-0001",
  "status": "done",
  "updatedAt": "2026-05-05T23:10:00.000Z"
}
```

---

#### `POST /orders/:id/cancel` — Hủy đơn hàng

> Transition: `new | processing → cancelled`  
> Không được hủy đơn đã `done`.

**Sample response** `200`:
```json
{
  "_id": "663f3c4d5e6f7a8b9c0d0e01",
  "code": "ORD-20260505-0001",
  "status": "cancelled",
  "updatedAt": "2026-05-05T23:05:00.000Z"
}
```

**Error khi hủy đơn đã done** `400`:
```json
{
  "statusCode": 400,
  "message": "Cannot cancel a completed order",
  "error": "Bad Request"
}
```

---

## 5. Kiểu dữ liệu dùng chung

### MoneyAmount

```
{
  "currency": string   // ISO 4217: "VND", "USD", ...
  "value": number      // Số tiền (không âm)
}
```

**Ví dụ:** `{ "currency": "VND", "value": 70000 }`

> Frontend tự format hiển thị: `70000` → `"70,000 ₫"`.

### Lỗi chuẩn

Tất cả lỗi trả về theo format:

```json
{
  "statusCode": 400,
  "message": "Mô tả lỗi",
  "error": "Bad Request",
  "correlationId": "req-abc123"
}
```

| HTTP Code | Ý nghĩa |
|-----------|---------|
| `400` | Dữ liệu không hợp lệ hoặc vi phạm business rule |
| `401` | Chưa xác thực (thiếu hoặc sai JWT) |
| `403` | Không có quyền |
| `404` | Không tìm thấy resource |

---

## 6. Ghi chú tích hợp cho FE

### Tính toán tiền trên FE

Backend **không tự tính** `subTotalAmount`, `taxAmount`, `totalAmount` — FE tính và truyền lên để đảm bảo số tiền khớp với những gì hiển thị cho người dùng.

Công thức:
```
item.amount       = item.price.value × item.quantity
subTotalAmount    = Σ item.amount
taxAmount         = subTotalAmount × (taxRate / 100)
totalAmount       = subTotalAmount + taxAmount
```

> Nếu đơn hàng có nhiều sản phẩm với `taxRate` khác nhau, tính `taxAmount` riêng cho từng item rồi cộng lại.

### Tìm khách hàng khi tạo đơn

Dùng Contact API (module `/contacts`) để tìm kiếm, lọc `types=customer`:

```
GET /contacts?types=customer&search=0989858588
```

Lấy `_id`, `name`, `phone`, `address` từ contact để điền vào `order.customer`.

### Pagination mặc định

Khi load sản phẩm cho màn hình chọn món, nên dùng `limit=100` hoặc load theo từng danh mục để tránh phân trang phức tạp trên mobile.
