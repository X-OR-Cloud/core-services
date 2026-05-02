# Phase 3.2 — Plan Management Module Design

**Status:** Proposal — awaiting review  
**Author:** PAG Agent  
**Date:** 2026-05-01  
**Epic:** 3 — Monetization & Plan Management

---

## 1. Bối cảnh

Module `plans` hiện tại đã có skeleton cơ bản: schema 3-tier (Mortal/Immortal/God), seed logic, `QuotaService` đọc giới hạn từ DB. Tuy nhiên còn thiếu:

- Không có API để admin cập nhật giá / quota mà không cần redeploy
- Không có `price`, `description`, `isActive` trên schema
- Không có Soul tool `get_available_plans()` để bot tư vấn gói cho user
- Seed dùng `$setOnInsert` — thay đổi default trong code không tự cập nhật DB

---

## 2. Schema Changes

### 2.1 Plan Schema (hiện tại → đề xuất)

```typescript
@Schema({ timestamps: true, collection: 'plans' })
export class Plan {
  // --- Identity ---
  @Prop({ required: true, unique: true })
  slug: string;                       // 'mortal' | 'immortal' | 'god'

  @Prop({ required: true })
  name: string;                       // 'Mortal', 'Immortal', 'God'

  @Prop({ default: '' })
  description: string;                // NEW: tagline hiển thị cho user

  @Prop({ type: Number, default: 0 })
  price: number;                      // NEW: VND/tháng (0 = miễn phí)

  @Prop({ default: true })
  isActive: boolean;                  // NEW: ẩn/hiện khi tư vấn gói

  // --- Chat quota ---
  @Prop({ type: Number, default: null })
  dailyMessageLimit: number | null;

  // --- Task quota ---
  @Prop({ type: Number, default: null })
  maxActiveTasks: number | null;

  @Prop({ default: false })
  allowRecurringTasks: boolean;

  // --- Notes quota ---
  @Prop({ type: Number, default: null })
  maxNotes: number | null;

  @Prop({ type: Number, default: null })
  maxNoteLength: number | null;

  // --- Memory quota ---
  @Prop({ type: Number, default: null })
  memoryRetentionDays: number | null;

  @Prop({ type: Number, default: null })
  memoryContextLimit: number | null;
}
```

**Fields mới:** `description` (string), `price` (number, VND), `isActive` (boolean).  
**Không thay đổi:** tất cả quota fields hiện tại.

### 2.2 Seed Data cập nhật

```typescript
const PLAN_SEED_DATA = [
  {
    slug: 'mortal',
    name: 'Mortal',
    description: 'Gói miễn phí — đủ dùng mỗi ngày',
    price: 0,
    isActive: true,
    dailyMessageLimit: 30,
    maxActiveTasks: 5,
    allowRecurringTasks: false,
    // ...
  },
  {
    slug: 'immortal',
    name: 'Immortal',
    description: 'Không giới hạn task, nhắc nhở lặp lại',
    price: 99000,            // 99k VND/tháng
    isActive: true,
    dailyMessageLimit: 200,
    // ...
  },
  {
    slug: 'god',
    name: 'God',
    description: 'Toàn bộ tính năng, không giới hạn',
    price: 299000,           // 299k VND/tháng
    isActive: true,
    dailyMessageLimit: null,
    // ...
  },
];
```

---

## 3. Seed Strategy

### Vấn đề hiện tại

`$setOnInsert` = chỉ insert nếu chưa tồn tại. Ưu điểm: admin thay đổi qua API không bị ghi đè khi restart. Nhược điểm: thay đổi default trong code không tự vào DB.

### Quyết định: giữ `$setOnInsert`

**Lý do:**
- Admin có thể customize quota qua API bất cứ lúc nào — `$set` trên restart sẽ undo thay đổi của admin
- 3 plans cố định, không có logic "cần sync code → DB"
- Khi cần thay đổi default: chạy 1 migration script hoặc gọi Admin API

**Seed chỉ thêm fields mới (description, price, isActive) cho docs đã tồn tại:**

```typescript
private async seedPlans() {
  for (const data of PLAN_SEED_DATA) {
    // Upsert: tạo mới nếu chưa có
    // $setOnInsert: không ghi đè nếu đã tồn tại
    // $set cho fields mới (description, price, isActive) để migrate docs cũ
    await this.planModel.findOneAndUpdate(
      { slug: data.slug },
      {
        $setOnInsert: { slug: data.slug, name: data.name, ...quotaDefaults },
        $set: {
          // Chỉ set fields mới nếu chưa có (dùng $setOnInsert riêng)
          // → dùng $set với conditional check trong migration script
        },
      },
      { upsert: true, new: true },
    );
  }
}
```

**Thực tế đơn giản hơn:** Seed chạy `$setOnInsert` cho toàn bộ doc. Riêng migration 1 lần để add `description/price/isActive` cho docs cũ bằng script:

```bash
# Migration script (chạy 1 lần)
db.plans.updateOne({ slug: 'mortal', description: { $exists: false } },
  { $set: { description: '...', price: 0, isActive: true } });
```

---

## 4. Admin API

### 4.1 Endpoints

```
GET    /plans              → list all plans (public, no auth)
GET    /plans/:slug        → get 1 plan (public)
PATCH  /plans/:slug        → update plan fields (admin only)
```

### 4.2 Auth Mechanism

**Đề xuất: API Key qua header `X-Admin-Key`**

Lý do chọn API Key thay vì `JwtAuthGuard`:
- PAG không có frontend admin UI — ops thao tác qua curl/Postman
- JWT từ IAM cần login flow không cần thiết cho internal tooling
- API key đơn giản, dễ rotate, lưu trong `.env` (`PAG_ADMIN_KEY`)

```typescript
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    return req.headers['x-admin-key'] === process.env['PAG_ADMIN_KEY'];
  }
}
```

### 4.3 Update DTO

```typescript
export class UpdatePlanDto {
  name?: string;
  description?: string;
  price?: number;
  isActive?: boolean;
  dailyMessageLimit?: number | null;
  maxActiveTasks?: number | null;
  allowRecurringTasks?: boolean;
  maxNotes?: number | null;
  maxNoteLength?: number | null;
  memoryRetentionDays?: number | null;
  memoryContextLimit?: number | null;
}
```

**Không cho phép cập nhật `slug`** — slug là identity, thay đổi sẽ break UserPlan references.

### 4.4 PlansService additions

```typescript
async update(slug: string, dto: UpdatePlanDto): Promise<PlanDocument | null> {
  return this.planModel.findOneAndUpdate(
    { slug },
    { $set: dto },
    { new: true },
  ).exec();
}

async findActive(): Promise<PlanDocument[]> {
  return this.planModel.find({ isActive: true }).sort({ price: 1 }).exec();
}
```

---

## 5. Soul Tool Interface

### 5.1 `get_available_plans()`

Bot cần có tool để tư vấn gói khi user hỏi "các gói là gì?" hoặc khi explain quota.

**Trigger trong InboundProcessor:** thêm quick command `gói dịch vụ` / `plan` (đã có `plan` command trong `handleTaskCommand`).

**Return format (dùng trong LLM context & response trực tiếp):**

```
📦 Các gói dịch vụ TranGPT:

🆓 Mortal — Miễn phí
   • 30 tin nhắn/ngày
   • 5 task đang chờ
   • Lưu 90 ngày ký ức

⚡ Immortal — 99.000đ/tháng
   • 200 tin nhắn/ngày
   • 30 task + nhắc lặp lại
   • Lưu 365 ngày ký ức

🔥 God — 299.000đ/tháng
   • Không giới hạn tất cả
   • Ký ức vĩnh viễn
```

**Implementation:** `PlansService.getPlansDisplay()` → trả về string đã format, `QuickCommandHandler` gọi và reply thẳng không qua LLM.

**Inject vào LLM context:** Chỉ inject plan hiện tại của user (đã có trong `buildContents`). Không inject toàn bộ danh sách — quá verbose.

---

## 6. Quan hệ với Quota Enforcement

### Kết luận: EXTEND, không replace

`QuotaService` hiện tại hoạt động tốt — đọc quota từ `Plan` doc. Thay đổi Plan qua Admin API → có hiệu lực ngay lập tức với mọi request tiếp theo.

**Không cần thay đổi gì trong QuotaService.**

Flow hiện tại:
```
Request → QuotaService.tryConsumeChatQuota()
         → UserPlansService.getEffectivePlanSlug()   [lookup UserPlan]
         → PlansService.findBySlug()                 [lookup Plan doc]
         → check limit
```

Admin cập nhật `dailyMessageLimit` của plan `immortal` qua API → mọi user `immortal` sẽ nhận limit mới ngay lập tức. Đúng behavior.

---

## 7. Out of Scope

- Billing / payment integration (sẽ là Epic riêng)
- Plan upgrade flow qua chat (Epic 3.3+)
- Notes quota enforcement (Notes module chưa có)

---

## 8. Implementation Plan (khi approved)

| Task | File | Effort |
|------|------|--------|
| Schema: add description/price/isActive | `plans.schema.ts` | S |
| Seed: update seed data + migration | `plans.service.ts` | S |
| PlansController: GET /plans, GET /plans/:slug, PATCH /plans/:slug | `plans.controller.ts` (new) | M |
| AdminKeyGuard | `guards/admin-key.guard.ts` (new) | S |
| PlansService.update() + findActive() | `plans.service.ts` | S |
| PlansModule: register controller + guard | `plans.module.ts` | S |
| Soul tool display: PlansService.getPlansDisplay() | `plans.service.ts` | S |
| Quick command `gói dịch vụ` update in InboundProcessor | `inbound.processor.ts` | S |
| E2E test + deploy | — | M |

Total: ~1-2 ngày dev.
