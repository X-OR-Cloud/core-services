# DGT - Implementation Plan: P1 Frontend API

**Version:** 1.0 | **Date:** 04/03/2026 | **Status:** Ready to implement

---

## Mục tiêu

Xây dựng Frontend API cho Dashboard và Analytics pages, gồm:
- 3 endpoints Dashboard: `summary`, `price-cards`, `portfolio-history`
- 4 endpoints Analytics: `summary`, `positions/open`, `trades`, `pnl-chart`
- 1 entity mới: `PortfolioSnapshot` + daily snapshot job
- 1 schema change: thêm `exitPrice` vào `Position`

**Spec đầy đủ:** [04-FRONTEND-API.md](04-FRONTEND-API.md)

---

## Thứ tự thực hiện

```
Phase 1: Schema changes (foundation)
  → PortfolioSnapshot entity
  → Position.exitPrice field

Phase 2: PortfolioSnapshot module
  → Schema, Service, Module

Phase 3: Dashboard module
  → Service (aggregation logic)
  → Controller (3 endpoints)
  → Module + register vào AppModule

Phase 4: Analytics module
  → Service (aggregation logic)
  → Controller (4 endpoints)
  → Module + register vào AppModule

Phase 5: Snapshot scheduler job
  → Thêm job snapshot_portfolio vào scheduler
  → Implement SnapshotService

Phase 6: Build & verify
```

---

## Chi tiết tasks

### Phase 1: Schema changes

**Task 1.1** — Thêm `exitPrice` vào `position.schema.ts`
- File: `services/dgt/src/modules/position/position.schema.ts`
- Thêm: `@Prop() exitPrice: number;` (sau `closedAt`)

**Task 1.2** — Tạo `portfolio-snapshot.schema.ts`
- File: `services/dgt/src/modules/portfolio-snapshot/portfolio-snapshot.schema.ts`
- Fields: `accountId`, `date`, `totalValueUsd`, `cashBalanceUsd`, `positionsValueUsd`, `realizedPnlUsd`, `unrealizedPnlUsd`
- Index: `{ accountId: 1, date: -1 }` unique
- Extends `BaseSchema`

---

### Phase 2: PortfolioSnapshot module

**Task 2.1** — Tạo `portfolio-snapshot.service.ts`
- Methods: `upsertSnapshot(accountId, date, data)`, `findByRange(accountId, from, to)`
- Dùng `SharedDataService` pattern (không cần RBAC vì snapshot được tạo bởi worker)

**Task 2.2** — Tạo `portfolio-snapshot.module.ts`
- Export `PortfolioSnapshotService`

---

### Phase 3: Dashboard module

**Task 3.1** — Tạo `dashboard.service.ts`
- Inject: `AccountModel`, `PositionModel`, `MarketPriceModel`, `PortfolioSnapshotService`
- Methods:
  - `getSummary(userId)` → portfolio value, PnL, asset allocation
  - `getPriceCards(symbols, sparklinePoints)` → price + 24h data + sparkline
  - `getPortfolioHistory(userId, range)` → time series từ PortfolioSnapshot

**Task 3.2** — Tạo `dashboard.controller.ts`
- `GET /dashboard/summary` → `@UseGuards(JwtAuthGuard)` → `getSummary`
- `GET /dashboard/price-cards` → `@UseGuards(JwtAuthGuard)` → `getPriceCards`
- `GET /dashboard/portfolio-history` → `@UseGuards(JwtAuthGuard)` → `getPortfolioHistory`
- Swagger decorators đầy đủ

**Task 3.3** — Tạo `dashboard.module.ts`
- Import: `MongooseModule` (Account, Position, MarketPrice), `PortfolioSnapshotModule`

**Task 3.4** — Register `DashboardModule` vào `app.module.ts`

---

### Phase 4: Analytics module

**Task 4.1** — Tạo `analytics.service.ts`
- Inject: `AccountModel`, `PositionModel`, `TradeModel`
- Methods:
  - `getSummary(userId, range)` → PnL, win rate, volume
  - `getOpenPositions(userId, accountId, page, limit)` → paginated open positions
  - `getTrades(userId, range, accountId, page, limit)` → paginated closed positions
  - `getPnlChart(userId, range, accountId)` → daily PnL cumulative

**Task 4.2** — Tạo `analytics.controller.ts`
- `GET /analytics/summary` → `getSummary`
- `GET /analytics/positions/open` → `getOpenPositions`
- `GET /analytics/trades` → `getTrades`
- `GET /analytics/pnl-chart` → `getPnlChart`
- Swagger decorators đầy đủ

**Task 4.3** — Tạo `analytics.module.ts`
- Import: `MongooseModule` (Account, Position, Trade)

**Task 4.4** — Register `AnalyticsModule` vào `app.module.ts`

---

### Phase 5: Snapshot scheduler job

**Task 5.1** — Thêm job `snapshot_portfolio` vào `datasources.config.ts`
- Schedule: cron `5 0 * * *` (00:05 UTC hàng ngày)

**Task 5.2** — Tạo `portfolio-snapshot.collector.ts` (hoặc service)
- Inject: `AccountModel`, `PositionModel`, `MarketPriceModel`, `PortfolioSnapshotService`
- Logic: lấy tất cả active accounts → tính value → upsert snapshot

**Task 5.3** — Thêm case `snapshot_portfolio` vào `data-ingestion.processor.ts`

---

### Phase 6: Build & verify

**Task 6.1** — Build: `nx run dgt:build`
**Task 6.2** — TypeScript check: `npx tsc --noEmit -p services/dgt/tsconfig.app.json`
**Task 6.3** — Test endpoints:
```bash
# Dashboard
curl -H "Authorization: Bearer <token>" http://localhost:3008/dashboard/summary
curl -H "Authorization: Bearer <token>" http://localhost:3008/dashboard/price-cards
curl -H "Authorization: Bearer <token>" "http://localhost:3008/dashboard/portfolio-history?range=30d"

# Analytics
curl -H "Authorization: Bearer <token>" "http://localhost:3008/analytics/summary?range=7d"
curl -H "Authorization: Bearer <token>" http://localhost:3008/analytics/positions/open
curl -H "Authorization: Bearer <token>" "http://localhost:3008/analytics/trades?range=30d"
curl -H "Authorization: Bearer <token>" "http://localhost:3008/analytics/pnl-chart?range=7d"
```

---

## Files sẽ tạo mới

```
services/dgt/src/modules/
├── portfolio-snapshot/
│   ├── portfolio-snapshot.schema.ts
│   ├── portfolio-snapshot.service.ts
│   └── portfolio-snapshot.module.ts
├── dashboard/
│   ├── dashboard.controller.ts
│   ├── dashboard.service.ts
│   └── dashboard.module.ts
└── analytics/
    ├── analytics.controller.ts
    ├── analytics.service.ts
    └── analytics.module.ts
```

## Files sẽ sửa

```
services/dgt/src/
├── modules/position/position.schema.ts         # Thêm exitPrice
├── app/app.module.ts                           # Đăng ký 3 module mới
├── config/datasources.config.ts                # Thêm snapshot_portfolio job
└── queues/data-ingestion.processor.ts          # Thêm case snapshot_portfolio
```

---

## Lưu ý triển khai

1. **Helper `getDefaultAccount`**: Dashboard và Analytics đều cần lấy account mặc định của user. Tạo private method dùng chung trong mỗi service.

2. **Range helper**: Convert `range` string (`24h`, `7d`, `30d`, `90d`, `all`) thành `fromDate`. Tạo utility function `rangeToDate(range: string): Date`.

3. **PortfolioSnapshot fallback**: Khi chưa có snapshot data (mới deploy), `GET /dashboard/portfolio-history` trả về array rỗng thay vì lỗi.

4. **Price cards không cần auth thực sự**: Market data là shared data, nhưng vẫn require JWT để consistent với các endpoint khác. Sau này có thể bỏ nếu FE cần dùng ở public pages.

5. **exitPrice khi đóng position**: Khi implement order execution / close position logic, cần set `exitPrice = currentPrice` tại thời điểm đóng.

---

*Tài liệu liên quan: [04-FRONTEND-API.md](04-FRONTEND-API.md) | [02-ENTITY-DESIGN.md](02-ENTITY-DESIGN.md)*
