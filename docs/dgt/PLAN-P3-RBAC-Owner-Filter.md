# PLAN-P3: RBAC Owner Filter — DGT Service

**Ngày tạo:** 2026-03-18
**Trạng thái:** Đề xuất — chờ phê duyệt

---

## Bối cảnh & Vấn đề

Toàn bộ người dùng DGT đều onboard vào **cùng 1 tổ chức** với role `org.editor` hoặc `org.viewer`.

`createRoleBasedPermissions()` trong `@hydrabyte/shared` với scope `organization` chỉ sinh filter `{ 'owner.orgId': orgId }` — tức là mọi user trong org đều thấy data của nhau qua `BaseService`.

**Yêu cầu:** Dữ liệu tài nguyên của mỗi người dùng phải **độc lập** — user chỉ xem và thao tác với data của chính mình.

### Phân loại ownership trong DGT

| Loại | Cơ chế ownership | Ví dụ module |
|---|---|---|
| **Direct** | Có `owner.userId` từ `BaseSchema` | Account, Bot, RiskProfile |
| **Indirect via accountId** | Không có `owner.userId`, link qua `accountId` | Signal, Order, Position, Trade, BotActivityLog |
| **Shared / No ownership** | Dữ liệu chung, không thuộc ai | MarketPrice, TechnicalIndicator, MacroIndicator, SentimentSignal |

---

## Giải pháp tổng thể

Override các method `findAll`, `findById`, `update`, `softDelete` ở tầng **Service** — inject filter ownership trước khi delegate sang `super.*`. Không sửa Controller, không sửa `BaseService`, không sửa `@hydrabyte/shared`.

### Pattern chung cho Direct ownership (Account, Bot, RiskProfile)

```
findAll  → inject options.filter['owner.userId'] = context.userId
findById → gọi super, rồi verify result?.owner?.userId === context.userId → throw ForbiddenException
update   → gọi findById (đã verify), rồi super.update
softDelete → gọi findById (đã verify), rồi super.softDelete
```

### Pattern cho Indirect ownership (Signal, Order, Position, Trade, BotActivityLog)

```
findAll  → lookup accountIds của user, inject options.filter['accountId'] = { $in: accountIds }
           nếu FE đã pass ?accountId=xxx → validate accountId đó thuộc về user trước
findById → gọi super lấy record, lookup account của record.accountId → verify owner
```

> **`org.owner` (admin):** Không áp dụng filter userId — xem được toàn bộ org. Dùng helper `isOrgOwner(context)` để bỏ qua logic trên.

---

## Danh sách thay đổi chi tiết

### Group 1 — Direct ownership (owner.userId)

#### 1.1 AccountService (`account.service.ts`)

Hiện trạng: `findAll` và `findById` chỉ gọi `super.*` + sanitize apiKey. Không filter userId.

Thay đổi:
- `findAll`: inject `options.filter['owner.userId'] = context.userId` (nếu không phải org.owner)
- `findById`: sau khi gọi `super.findById`, verify `result.owner.userId === context.userId`
- `update`: verify ownership trước khi `super.update`
- `softDelete`: verify ownership trước khi `super.softDelete`

#### 1.2 BotService (`bot.service.ts`)

Hiện trạng: `findAll`, `findById`, `update`, `softDelete` đều dùng `super.*` trực tiếp. `getStats` đã filter đúng.

Thay đổi: tương tự AccountService (4 method override).

#### 1.3 RiskProfileService (`risk-profile.service.ts`)

Hiện trạng: service bare — chỉ có `super.*`, không có override gì.

Thay đổi: tương tự AccountService (4 method override).

---

### Group 2 — Indirect ownership (accountId)

Các module này **không có `owner.userId`** — link qua `accountId` đến Account. Cần inject `AccountModel` vào service để lookup.

#### 2.1 SignalService (`signal.service.ts`)

Hiện trạng: service bare.

Thay đổi:
- Inject `AccountModel`
- `findAll`: lookup `accountIds` của user → inject filter `accountId: { $in: accountIds }`. Nếu FE đã pass `accountId`, validate nó nằm trong `accountIds`
- `findById`: gọi `super.findById`, rồi verify `accountId` của signal thuộc về user

#### 2.2 OrderService (`order.service.ts`)

Hiện trạng: service bare.

Thay đổi: tương tự SignalService (inject AccountModel + override `findAll`, `findById`).

#### 2.3 PositionService (`position.service.ts`)

Hiện trạng: service bare.

Thay đổi: tương tự SignalService.

#### 2.4 TradeService (`trade.service.ts`)

Hiện trạng: service bare. Trade là immutable (không có update/delete).

Thay đổi: chỉ override `findAll` và `findById`.

#### 2.5 BotActivityLogService (`bot-activity-log.service.ts`)

Hiện trạng: service có `logActivity`. Log là append-only (không có update/delete).

Thay đổi: override `findAll` và `findById` — inject filter theo `accountId` của user.

---

### Group 3 — Dashboard & Analytics (custom aggregation)

#### 3.1 DashboardService — `getAiActivity` (`dashboard.service.ts`)

Hiện trạng: `getAiActivity(limit, since?)` query `botActivityLogModel` không filter theo user.

Thay đổi:
- Signature: `getAiActivity(userId, limit, since?)`
- Lookup `accountIds` của user → inject `accountId: { $in: accountIds }` vào query
- Cập nhật `DashboardController.getAiActivity` truyền `ctx.userId`

Các method khác (`getSummary`, `getPortfolioHistory`, `getAiSignal`) đã dùng `getDefaultAccount(userId)` — OK, không cần sửa.

#### 3.2 AnalyticsService (`analytics.service.ts`)

Hiện trạng: tất cả method đều dùng `resolveAccount(userId, accountId?)` — đã filter `owner.userId` và validate accountId thuộc về user. **Không cần sửa.**

---

### Group 4 — Shared data (không thay đổi)

`MarketPrice`, `TechnicalIndicator`, `MacroIndicator`, `SentimentSignal` — dữ liệu chung, không có ownership. Giữ nguyên.

---

## Tóm tắt file cần sửa

| File | Thay đổi | Scope |
|---|---|---|
| `account/account.service.ts` | Override 4 method + inject userId filter | Direct |
| `bot/bot.service.ts` | Override 4 method + inject userId filter | Direct |
| `risk-profile/risk-profile.service.ts` | Override 4 method + inject userId filter | Direct |
| `signal/signal.service.ts` | Inject AccountModel, override findAll + findById | Indirect |
| `order/order.service.ts` | Inject AccountModel, override findAll + findById | Indirect |
| `position/position.service.ts` | Inject AccountModel, override findAll + findById | Indirect |
| `trade/trade.service.ts` | Inject AccountModel, override findAll + findById | Indirect |
| `bot-activity-log/bot-activity-log.service.ts` | Inject AccountModel, override findAll + findById | Indirect |
| `dashboard/dashboard.service.ts` | Sửa getAiActivity thêm userId param + filter | Dashboard |
| `dashboard/dashboard.controller.ts` | Truyền ctx.userId vào getAiActivity | Dashboard |

**Tổng:** 10 file — 8 service + 1 controller + 1 service (dashboard).

---

## Helper function

Mỗi service cần 1 private helper để kiểm tra có phải admin không:

```typescript
private isOrgOwner(context: RequestContext): boolean {
  return context.roles?.includes(PredefinedRole.OrganizationOwner)
    || context.roles?.includes(PredefinedRole.UniverseOwner);
}
```

Và helper lookup accountIds (dành cho các service Indirect):

```typescript
private async getUserAccountIds(userId: string): Promise<Types.ObjectId[]> {
  return this.accountModel
    .find({ 'owner.userId': userId, isDeleted: false })
    .distinct('_id');
}
```

---

## Thứ tự thực hiện

1. **Group 1** — AccountService, BotService, RiskProfileService (pattern đơn giản, không phụ thuộc nhau)
2. **Group 2** — SignalService, OrderService, PositionService, TradeService, BotActivityLogService (cần AccountModel)
3. **Group 3** — DashboardService + Controller

---

## Verify

```bash
npx tsc --noEmit -p services/dgt/tsconfig.app.json
nx run dgt:api
```

Test cases:
- `org.owner` → xem được toàn bộ data trong org
- `org.editor` / `org.viewer` → chỉ thấy data của mình
- `GET /signals?accountId=<người khác>` → trả về rỗng hoặc 403
- `GET /signals/:id` của signal thuộc account người khác → 403/404
- `GET /dashboard/ai-activity` → chỉ trả về logs của account/bot thuộc user
