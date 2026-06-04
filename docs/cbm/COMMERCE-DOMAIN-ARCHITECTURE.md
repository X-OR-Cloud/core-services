# CBM — Business Domain Architecture

> Tài liệu thiết kế tổng thể CBM: các domain, quan hệ giữa chúng, nguyên tắc tổng quát hóa và lộ trình mở rộng. Dùng làm tài liệu tham chiếu cho thiết kế và phát triển tính năng mới.

---

## 1. Triết lý thiết kế

**Tối giản — Tổng quát — Mở rộng qua metadata**

- Schema cốt lõi chỉ chứa các trường có nghĩa rõ ràng, bất biến theo domain
- Logic đặc thù domain không đi vào enum hay schema cố định — đi vào `metadata` và `DomainConfig`
- Một bộ enum dùng chung cho mọi domain; mỗi domain dùng một **subset**
- Không tạo schema mới khi `metadata` đã đủ đáp ứng
- Ưu tiên tái dụng module hiện có trước khi thiết kế mới

---

## 2. Bản đồ domain

```
┌─────────────────────────────────────────────────────────────────┐
│  CRM                                                            │
│  Contact ──── Company        Interaction (timeline)            │
└──────────────────┬──────────────────────────────────────────────┘
                   │ contactId / companyId
     ┌─────────────┼─────────────────────┐
     ↓             ↓                     ↓
┌─────────┐  ┌──────────┐        ┌────────────────┐
│  Order  │  │ Contract │        │    Expense     │
│(commerce│  │+ Annex   │        │  (internal     │
│ layer)  │  │(contract │        │   costs)       │
└────┬────┘  │  layer)  │        └───────┬────────┘
     │       └────┬─────┘                │ approved
     │ orderId    │ contractId           │
     └────────────┴──────────┐           │
                             ↓           │
                        ┌─────────┐      │
                        │ Invoice │      │
                        └────┬────┘      │
                             │ invoiceId │
                             ↓           ↓
                        ┌─────────┐  ┌──────────┐
                        │ Payment │  │ Expense  │
                        └────┬────┘  └────┬─────┘
                             │            │
                             └─────┬──────┘
                                   ↓
                            ┌────────────┐
                            │Transaction │  ← ledger, append-only
                            └────────────┘

┌─────────────────────────────────────────────┐
│  Commerce                                   │
│  ProductCategory → Product → Inventory      │
│                       ↑            ↑        │
│               Order.items[].productId       │
│               Order.items[].inventoryId     │
└─────────────────────────────────────────────┘

┌──────────────────────────────────────┐
│  Config                              │
│  DomainConfig (domain + resource)    │
│  → controls Order workflow           │
│  → expandable to other resources     │
└──────────────────────────────────────┘

┌──────────────────────────────┐
│  Infrastructure              │
│  Outlet ← Inventory.location │
│  OutletMember                │
│  Provider (payment/einvoice) │
│  Staff (via IAM)             │
└──────────────────────────────┘
```

---

## 3. Lớp CRM

### Contact & Company

`Contact` = cá nhân. `Company` = tổ chức. Cả hai dùng `types: ['customer', 'partner', 'vendor']` — không có entity riêng biệt cho từng vai trò.

**Contact là pivot của toàn bộ hệ thống:**

| Liên kết | Ý nghĩa |
|---|---|
| `Invoice.contactId` | Người được xuất hóa đơn |
| `Order.customer.id` | Người đặt hàng |
| `Contract.contactId` | Đối tác ký hợp đồng |
| `Expense.vendorId` | Nhà cung cấp chi phí |
| `Interaction.contactId` | Lịch sử tương tác CRM |

### Interaction

Timeline ghi nhận mọi điểm tiếp xúc: cuộc gọi, email, cuộc họp, ghi chú. Append-only, không update.

---

## 4. Lớp Commerce

### 4.1 Product — Định nghĩa sản phẩm (Type)

`Product` là catalog entry — mô tả sản phẩm là gì, giá bao nhiêu, thuộc loại nào. Không lưu trạng thái vật lý hay số lượng tồn kho.

**Pricing layers:**

| Layer | Lưu ở | Ý nghĩa |
|---|---|---|
| Giá gốc theo loại | `Product.price` | Áp dụng mặc định |
| Giá override per-unit | `Inventory.metadata.price` | Custom cho 1 unit cụ thể |
| Giá snapshot tại đơn | `Order.items[].price` | Bất biến — dùng để tính tiền |

### 4.2 Inventory — Thực thể vật lý (Instance)

`Inventory` là đơn vị cụ thể tồn tại trong thực tế. Là instance của một Product type.

**Khi nào cần Inventory:**

| Loại | Cần? | Lý do |
|---|---|---|
| Phòng / bàn / thiết bị | Có | Mỗi unit unique, có trạng thái riêng |
| Hàng tồn kho | Có | Theo dõi số lượng theo kho/outlet |
| License key pool | Có | Mỗi key unique, track activation |
| Subscription | Không | Là quan hệ, không phải vật thể |
| Digital download | Không | Không cần track từng bản |

**Schema tối thiểu (module cần tạo mới):**

```typescript
Inventory {
  productId   string          // ref: Product
  code        string          // unique per org
  quantity    number          // 1 cho phòng/asset/key; N cho hàng tồn
  status      InventoryStatus
  locationId? string          // ref: Outlet
  note?       string
  // metadata: floor, bedType, serialNumber, expiryDate, customPrice, ...
}
```

**Inventory behavior — kiểm soát vòng đời:**

Lưu trên `ProductCategory.metadata.inventoryBehavior` hoặc `Inventory.metadata.behavior`:

| Behavior | Ví dụ | Sau `in_use` |
|---|---|---|
| `reusable` | Phòng, bàn, thiết bị | → `maintenance` → `available` (lặp) |
| `consumable` | License key, hàng tiêu hao | → `retired` (một chiều) |

**Inventory Status:**

```
available → reserved → in_use → maintenance → available   (reusable)
available → reserved → in_use → retired                   (consumable)
available → maintenance → available                       (thủ công)
any → retired                                             (thanh lý)
```

**Inventory có hai actor:**

```
Order system (auto)          Staff (manual / operational)
───────────────────          ────────────────────────────
available → reserved         available → maintenance
reserved  → in_use           maintenance → available
in_use    → maintenance      any → retired
reserved  → available
  (order cancelled)
```

**Inventory API actions — 6 operational endpoints:**

```
POST /inventories/:id/reserve    available → reserved
POST /inventories/:id/activate   reserved  → in_use
POST /inventories/:id/release    in_use    → maintenance (reusable) | retired (consumable)
POST /inventories/:id/maintain   any       → maintenance
POST /inventories/:id/restore    maintenance → available
POST /inventories/:id/retire     any       → retired  (admin only)
```

Inventory không dùng DomainConfig — behavior flag đủ để encode sự khác biệt giữa domains.

### 4.3 Order — Đơn hàng / Đặt chỗ

**CRUD + Actions — hai concern độc lập:**

```
CRUD    → thao tác trên DATA   (tạo đơn, sửa thông tin, xóa)
Actions → thao tác trên STATE  (chuyển trạng thái + side effects)
```

CRUD (`POST`, `PATCH`, `DELETE`) không bị xóa. Actions kiểm soát workflow.

**Order Status — 6 trạng thái tổng quát:**

| Status | Semantic tổng quát |
|---|---|
| `new` | Đơn vừa tạo, chưa xử lý |
| `processing` | Đang chuẩn bị / thực hiện |
| `deposited` | Đã có thanh toán trước / đặt cọc |
| `active` | **Dịch vụ đang được sử dụng / giao** |
| `done` | Hoàn tất |
| `cancelled` | Đã hủy |

> `active` — rename từ `checked_in`. Không chỉ là "hotel check-in" mà là bất kỳ trạng thái nào khi giá trị chính đang được giao: subscription đang chạy, khách đang ăn, phòng đang có khách.

**Order action endpoints — 5 generic actions:**

```
POST /orders/:id/start      new → processing
POST /orders/:id/confirm    new|processing → deposited
POST /orders/:id/activate   new|processing|deposited → active
POST /orders/:id/complete   new|processing|deposited|active → done
POST /orders/:id/cancel     new|processing|deposited|active → cancelled
```

Transition rules cụ thể (`from`, `to`) được định nghĩa trong DomainConfig, không hardcode.

**Domain workflow — mỗi domain dùng một subset:**

```
Booking:       new → [deposited] → active → done
Food dine-in:  new → processing → active → done
Food POS:      new → done  (instant)
Subscription:  new → active (checkIn=start) → done (checkOut=end)
License sale:  new → [processing] → done
```

**`checkIn` / `checkOut` — khoảng thời gian sử dụng dịch vụ:**

| Domain | `checkIn` | `checkOut` |
|---|---|---|
| Hotel | Nhận phòng | Trả phòng |
| Subscription | Ngày bắt đầu | Ngày hết hạn |
| Cho thuê thiết bị | Ngày thuê | Ngày trả |
| Đặt bàn | Giờ bắt đầu | Giờ kết thúc |

**Order Item — liên kết Product và Inventory:**

```typescript
OrderItem {
  productId?    string    // ref: Product (loại)
  inventoryId?  string    // ref: Inventory (unit cụ thể — optional)
  code, name    string    // snapshot tại thời điểm đặt
  price         MoneyAmount
  quantity      number
  amount        MoneyAmount
}
```

**Tự động sync Inventory theo Order:**

| Order transition | Inventory transition |
|---|---|
| `new` / `deposited` | `available → reserved` |
| `active` | `reserved → in_use` |
| `done` | `in_use → maintenance` hoặc `available` |
| `cancelled` | `reserved → available` |

---

## 5. Lớp Finance

### Invoice

Được tạo từ 3 nguồn:

```
Order          → Invoice  (bán hàng, booking)
Contract/Annex → Invoice  (dịch vụ theo hợp đồng)
Trực tiếp      → Invoice  (ad-hoc)
```

**Invoice Status:** `draft → sent → partial → paid / overdue / cancelled`

### Payment

Immutable sau khi tạo. Hai loại: direct (cash/bank) và gateway (PayOS/VNPay qua webhook).

**Payment Status (gateway only):** `pending → paid / expired / failed`

Khi Payment → `paid`: tự tạo `Transaction(income)`.

### Expense

**Expense Status:** `pending → approved / rejected`

Khi Expense → `approved`: tự tạo `Transaction(expense)`.

### Transaction

Ledger append-only, chỉ tạo tự động, không bao giờ sửa/xóa thực sự.

```
Payment(paid)      → Transaction { type: income,  referenceType: payment }
Expense(approved)  → Transaction { type: expense, referenceType: expense }
```

---

## 6. Lớp Contract

**Contract Status:** `draft → active → expired / terminated / cancelled`

**ContractAnnex Status:** `draft → active → cancelled`

Mỗi Annex có thể xuất Invoice riêng (`Invoice.contractAnnexId`).

---

## 7. Ba con đường đến Invoice

```
Luồng 1 — Bán hàng / Booking:
  Contact → Order → Invoice → Payment → Transaction

Luồng 2 — Hợp đồng dịch vụ:
  Contact → Contract → ContractAnnex → Invoice → Payment → Transaction

Luồng 3 — Ad-hoc:
  Contact → Invoice (tạo thẳng) → Payment → Transaction

Luồng chi phí:
  Contact/Company (vendor) → Expense → [approved] → Transaction
```

---

## 8. DomainConfig — Workflow configuration

### Khái niệm

`DomainConfig` là module mới thay thế mọi workflow hardcode trong service. Không có module Workflow riêng.

Hai chiều cấu hình:

```
domain    = bối cảnh nghiệp vụ  → 'default' | 'booking' | 'restaurant' | 'hoalu-booking'
resource  = thực thể được config → 'order'  (trước mắt; mở rộng sau)
```

### Schema

```typescript
DomainConfig {
  domain:    string     // preset name hoặc org-specific name
  extends?:  string     // kế thừa từ preset, org chỉ ghi đè delta
  resource:  string     // 'order' | 'inventory' | 'expense' | ...
  isPreset:  boolean    // true = system seed, không xóa được
  config:    ResourceConfig
  // owner.orgId (BaseSchema): null → system preset; có orgId → org-specific
}
```

**OrderResourceConfig:**

```typescript
OrderResourceConfig {
  states: OrderStatus[]
  actions: {
    [actionName: string]: {
      label: string         // display name cho frontend
      from:  OrderStatus[]  // trạng thái được phép trigger
      to:    OrderStatus    // trạng thái đích
    }
  }
  metadataFields?: FieldDefinition[]  // document only — frontend dùng render form
}
```

**FieldDefinition:**

```typescript
FieldDefinition {
  key:           string    // tên field trong metadata, e.g. 'guestType', 'tableNumber'
  type:          'string' | 'number' | 'boolean' | 'date' | 'enum'
  label:         string    // tên hiển thị trên form
  required?:     boolean   // default: false
  options?:      { label: string; value: string }[]  // chỉ dùng khi type = 'enum'
  placeholder?:  string    // gợi ý input
  defaultValue?: any
}
```

> `metadataFields` chỉ dùng để **document và render form phía frontend** — server không validate metadata dựa trên định nghĩa này. Xem thêm: [Section 11 — Custom fields](#11-custom-fields--dto-và-metadata).

**Ví dụ:**

```json
"metadataFields": [
  { "key": "guestType", "type": "enum", "label": "Loại khách", "required": true,
    "options": [{ "label": "Khách trực tiếp", "value": "direct" }, { "label": "Đại lý", "value": "agency" }] },
  { "key": "tableNumber", "type": "string", "label": "Số bàn",        "required": false },
  { "key": "numGuests",   "type": "number", "label": "Số lượng khách","required": false }
]
```

### Fallback chain khi load config

```
1. Org-specific:  DomainConfig { owner.orgId: orgId, resource }
2. Org's preset:  DomainConfig { domain: org.activeDomain, resource, isPreset: true }
3. Default:       DomainConfig { domain: 'default', resource, isPreset: true }
```

### System presets

Seed khi bootstrap. Ba presets tối thiểu:

**`default`** — permissive, mirror chính xác behavior hardcode hiện tại:

```json
{
  "domain": "default", "resource": "order", "isPreset": true,
  "config": {
    "states": ["new", "processing", "deposited", "active", "done", "cancelled"],
    "actions": {
      "start":    { "label": "Xử lý",    "from": ["new"],                                     "to": "processing" },
      "confirm":  { "label": "Xác nhận", "from": ["new", "processing"],                       "to": "deposited"  },
      "activate": { "label": "Kích hoạt","from": ["new", "processing", "deposited"],           "to": "active"     },
      "complete": { "label": "Hoàn tất", "from": ["new", "processing", "deposited", "active"], "to": "done"       },
      "cancel":   { "label": "Hủy",      "from": ["new", "processing", "deposited", "active"], "to": "cancelled"  }
    }
  }
}
```

**`booking`** — khách sạn / nhà nghỉ:

```json
{
  "domain": "booking", "resource": "order", "isPreset": true,
  "config": {
    "states": ["new", "deposited", "active", "done", "cancelled"],
    "actions": {
      "confirm":  { "label": "Đặt cọc",   "from": ["new"],              "to": "deposited" },
      "activate": { "label": "Check-in",  "from": ["new", "deposited"], "to": "active"    },
      "complete": { "label": "Check-out", "from": ["active"],           "to": "done"      },
      "cancel":   { "label": "Hủy phòng","from": ["new", "deposited"], "to": "cancelled" }
    }
  }
}
```

**`sale`** — bán hàng / F&B:

```json
{
  "domain": "sale", "resource": "order", "isPreset": true,
  "config": {
    "states": ["new", "processing", "done", "cancelled"],
    "actions": {
      "start":    { "label": "Bắt đầu", "from": ["new"],         "to": "processing" },
      "complete": { "label": "Xong",    "from": ["new","processing"], "to": "done"  },
      "cancel":   { "label": "Hủy",     "from": ["new","processing"], "to": "cancelled" }
    }
  }
}
```

### Request flow trong OrderService

Config check nằm trong **service layer**, không phải controller hay interceptor:

```typescript
async executeAction(action: string, id: ObjectId, context: RequestContext) {
  const config = await this.domainConfig.getOrderConfig(context.orgId)
  const actionDef = config.actions[action]

  if (!actionDef)
    throw ForbiddenException('ACTION_NOT_AVAILABLE')

  const order = await this.findById(id, context)

  if (!actionDef.from.includes(order.status))
    throw BadRequestException('INVALID_TRANSITION')

  return this.update(id, { status: actionDef.to }, context)
  // + trigger side effects theo action
}
```

### Org onboard

Org mới tạo → seed bản copy của `default` preset vào `owner.orgId`. Org tự chỉnh hoặc switch sang preset khác.

---

## 9. Backward compatibility

### Đánh giá với BepCoba (app đang tích hợp)

BepCoba là restaurant app, dùng flow `new → processing → done`.

| API | BepCoba dùng? | Sau nâng cấp | Impact |
|---|---|---|---|
| `POST /orders` | ✓ | Không đổi | None |
| `PATCH /orders/:id` | ✓ | Không đổi | None |
| `DELETE /orders/:id` | ✓ | Không đổi | None |
| `GET /orders` | ✓ | Không đổi | None |
| `GET /orders/stats` | ✓ | Không đổi | None |
| `POST /orders/:id/process` | ✓ | **Deprecated alias** → `start` | None |
| `POST /orders/:id/complete` | ✓ | Giữ nguyên | None |
| `POST /orders/:id/cancel` | ✓ | Giữ nguyên | None |
| `POST /orders/:id/checkin` | ✗ | Rename → `activate` | None |
| `POST /orders/:id/checkout` | ✗ | Merge vào `complete` | None |
| Status value `checked_in` | ✗ | Rename → `active` | None |

**Phương án:** Giữ `/process` là thin wrapper deprecated, delegate sang `start()`:

```typescript
@Post(':id/process')
@ApiOperation({ deprecated: true, summary: '[Deprecated] Use POST /:id/start' })
async process(@Param('id') id, @CurrentUser() ctx) {
  return this.service.executeAction('start', new Types.ObjectId(id), ctx)
}
```

**Zero breaking change với BepCoba** — không cần app thay đổi gì. Migrate sang `/start` khi sẵn sàng.

### Safety guarantee

`default` preset mirror chính xác `EDITABLE_STATUSES` hardcode hiện tại:
- `complete.from` = `['new', 'processing', 'deposited', 'active']` ← đúng với `EDITABLE_STATUSES`
- `cancel.from` = tương tự

Viết unit test xác nhận default preset khớp behavior cũ trước khi deploy.

---

## 10. Tổng hợp enums

| Entity | Enum |
|---|---|
| Order | `new` · `processing` · `deposited` · `active` · `done` · `cancelled` |
| Invoice | `draft` · `sent` · `partial` · `paid` · `overdue` · `cancelled` |
| Payment | `pending` · `paid` · `expired` · `failed` |
| Expense | `pending` · `approved` · `rejected` |
| Contract | `draft` · `active` · `expired` · `terminated` · `cancelled` |
| Inventory | `available` · `reserved` · `in_use` · `maintenance` · `retired` |
| Product/Contact | `active` · `inactive` |
| Transaction type | `income` · `expense` |

**Nguyên tắc:** Enums không đổi theo domain. Domain-specific logic nằm ở DomainConfig (subset + labels) và event handlers (side effects).

---

## 11. Custom fields — DTO và metadata

**Quyết định: không validate metadata server-side.**

```
Core DTO (typed, validated)      → bất biến, áp dụng mọi domain
metadata (Record<string, any>)   → flexible, không validate cứng
DomainConfig.metadataFields      → document only, frontend dùng render form động
```

Lý do: fields trong metadata như `guestType`, `tableNumber`, `billingCycle` không cần server validation — frontend đã có context. Thêm runtime schema validation là complexity không đổi lại gì.

---

## 12. Domain coverage — Tổng hợp

| Domain | Product | Inventory | Order flow | Invoice source |
|---|---|---|---|---|
| Khách sạn | Loại phòng | Từng phòng (qty=1, reusable) | `new→active→done` | Order |
| Nhà hàng dine-in | Loại bàn | Từng bàn (reusable) | `new→processing→active→done` | Order |
| Nhà hàng POS | Món ăn | — | `new→done` | Order |
| Subscription | Plan | — | `new→active→done` (checkIn/Out) | Order |
| License key | Phần mềm | Pool keys (consumable) | `new→done` | Order |
| Bán lẻ | Sản phẩm | Tồn kho theo kho | `new→done` | Order |
| Cho thuê thiết bị | Loại thiết bị | Từng thiết bị (reusable) | `new→active→done` | Order |
| Dịch vụ hợp đồng | — | — | — | Contract+Annex |
| Chi phí vận hành | — | — | — | Expense |

---

## 13. Lộ trình implement

### Phase 1 — DomainConfig + Order (hiện tại)

- [ ] Tạo `DomainConfig` module (schema, service, CRUD controller)
- [ ] Seed 3 system presets: `default`, `booking`, `sale`
- [ ] `OrderService` inject `DomainConfigService`, chuyển transition logic sang config-driven
- [ ] Rename `checked_in → active` trong schema và service
- [ ] Thêm 5 generic action endpoints: `start | confirm | activate | complete | cancel`
- [ ] Giữ `/process` là deprecated alias → `start`
- [ ] Xóa `/checkin`, `/checkout` (không có app nào đang dùng)
- [ ] Org onboard flow: seed `default` config
- [ ] Unit test: default preset phải khớp `EDITABLE_STATUSES` cũ

### Phase 2 — Inventory module

- [ ] Tạo `Inventory` module (schema, service, controller)
- [ ] 6 operational action endpoints
- [ ] Auto-sync Inventory khi Order transition
- [ ] `inventoryId` optional trên `OrderItem`

### Phase 3+ — Mở rộng DomainConfig sang các resource khác

- Evaluate sau khi Phase 1 stable
- Ứng viên: `inventory`, `expense`, `invoice`

---

## 14. Lộ trình mở rộng kinh doanh

**Quản lý tồn kho đầy đủ:**
- `Inventory.quantity` + `locationId` đã sẵn
- Thêm `InventoryLog` (nhập/xuất) — append-only như `Transaction`
- Chuyển kho = `InventoryLog(out, kho-A)` + `InventoryLog(in, kho-B)`

**Quản lý nhà cung cấp:**
- `Contact/Company` với `types: ['vendor']` đã sẵn
- `Expense.vendorId` đã có
- Thêm `PurchaseOrder` khi cần quản lý đơn mua

**Subscription renewal:**
- `Order` với `checkIn/checkOut` + `metadata.billingCycle` đã có
- Cron check `checkOut` sắp đến → tạo Invoice mới

---

## 15. Ngoài phạm vi

- Custom status name per tenant — overkill cho small business
- Fully dynamic state machine (Jira-style) — over-engineering
- Double-entry accounting — `Transaction` là single-entry ledger
- Multi-currency conversion
