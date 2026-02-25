# Quick Prompt: New Service Creation

Copy-paste this template và thay thế các placeholder:

---

## 📋 PROMPT TEMPLATE

```
Tạo microservice mới với tên "[SERVICE_NAME]" trong monorepo hydra-services.

**Yêu cầu:**
- Service name: [SERVICE_NAME]
- Port: [PORT]
- Entities: [ENTITY_1], [ENTITY_2], [ENTITY_3]

**Chi tiết Entities:**

[ENTITY_1]:
- Field 1: type (required/optional)
- Field 2: type
- [List all fields]

[ENTITY_2]:
- Field 1: type
- [List all fields]

**Pattern Reference:**
- Sử dụng Template Service làm mẫu (services/template/)
- Đọc docs/TEMPLATE-SERVICE-UPGRADE.md để hiểu các features

**Bắt buộc include:**
✅ Health check endpoint
✅ GlobalExceptionFilter
✅ CorrelationIdMiddleware
✅ JwtStrategy + PassportModule
✅ BaseService cho tất cả entities
✅ BaseSchema cho tất cả schemas
✅ Modern controller pattern (@CurrentUser, không dùng BaseController)
✅ Swagger error decorators (@ApiCreateErrors, etc.)
✅ parseQueryString utility cho list endpoints (hỗ trợ filter operators: in, regex, gt, lt,...)
✅ Full CRUD với soft delete
✅ README với curl examples

**Thực hiện từng bước:**
1. Tạo service structure
2. Setup main.ts và app.module.ts
3. Tạo từng entity (schema → service → controller → DTO)
4. Build và verify không có errors
5. Tạo README với examples

Xác nhận hiểu yêu cầu trước khi bắt đầu.
```

---

## 🎯 VÍ DỤ CỤ THỂ

### Example 1: Inventory Service (Đơn giản)

```
Tạo microservice mới với tên "inventory" trong monorepo hydra-services.

**Yêu cầu:**
- Service name: inventory
- Port: 3003
- Entities: Warehouse, Product, StockMovement

**Chi tiết Entities:**

Warehouse:
- name: string (required)
- code: string (required, unique)
- address: string
- capacity: number
- isActive: boolean (default true)

Product:
- sku: string (required, unique)
- name: string (required)
- description: string
- unit: string
- minimumStock: number (default 0)
- isActive: boolean (default true)

StockMovement:
- warehouseId: ObjectId (ref Warehouse, required)
- productId: ObjectId (ref Product, required)
- type: enum ["IN", "OUT", "ADJUSTMENT"] (required)
- quantity: number (required)
- reason: string
- referenceNumber: string

**Pattern Reference:**
Sử dụng Template Service làm mẫu hoàn toàn.

**Bắt buộc include tất cả production features:**
✅ Health, Errors, RBAC, Audit trail, Swagger, etc.

Bắt đầu với service structure, confirm trước khi code.
```

### Example 2: Notification Service (Với Queue)

```
Tạo microservice mới với tên "notification" trong monorepo hydra-services.

**Yêu cầu:**
- Service name: notification
- Port: 3004
- Entities: NotificationTemplate, Notification
- Queue: BullMQ cho async notification sending

**Chi tiết Entities:**

NotificationTemplate:
- code: string (required, unique)
- name: string (required)
- subject: string
- bodyTemplate: string (required)
- channel: enum ["email", "sms", "push"]
- variables: string[] (template variables)
- isActive: boolean (default true)

Notification:
- templateId: ObjectId (ref NotificationTemplate)
- recipientId: string
- recipientEmail: string
- subject: string
- body: string
- channel: enum ["email", "sms", "push"]
- status: enum ["pending", "sent", "failed"]
- sentAt: Date
- failureReason: string

**Queue Setup:**
- Tạo notification-queue giống report-queue trong Template
- NotificationProducer để emit events
- NotificationConsumer để xử lý
- ProcessorsModule để handle jobs

**Pattern Reference:**
Template Service - đặc biệt phần queues/

**Bắt buộc include tất cả production features.**

Bắt đầu step-by-step, confirm structure trước.
```

---

## ⚡ ONE-LINER (Siêu ngắn gọn)

Dùng khi entity đơn giản:

```
Tạo service "[SERVICE_NAME]" port [PORT] với entities [LIST] theo pattern Template Service. Include tất cả production features: health, errors, RBAC, audit, swagger. Confirm trước khi code.
```

Ví dụ:
```
Tạo service "billing" port 3005 với entities Invoice, Payment, Transaction theo pattern Template Service. Include tất cả production features: health, errors, RBAC, audit, swagger. Confirm trước khi code.
```

---

## 🚀 SỬ DỤNG

1. Copy prompt template
2. Thay [SERVICE_NAME], [PORT], [ENTITIES]
3. List chi tiết fields cho mỗi entity
4. Paste vào Claude Code
5. Đợi Agent confirm hiểu requirement
6. Let Agent work step-by-step

---

## ✅ VERIFICATION

Sau khi Agent xong:

```bash
# Build
npx nx build [SERVICE_NAME]

# Test health
curl http://localhost:[PORT]/health

# Open API docs
open http://localhost:[PORT]/api-docs
```

---

## 📚 CHI TIẾT

Xem full guide: `docs/PROMPT-NEW-SERVICE-CREATION.md`
