# DGT Service - Frontend API Specification

**Version:** 1.0 | **Date:** 04/03/2026 | **Status:** Draft

---

## I. Tổng quan

Tài liệu này định nghĩa các API endpoint được thiết kế đặc biệt cho Frontend, tổng hợp data từ nhiều entity để giảm round-trip và đơn giản hóa logic phía FE.

### Base URL
```
http://localhost:3008
```

### Authentication
Tất cả endpoint yêu cầu JWT Bearer token (trừ khi ghi chú khác):
```
Authorization: Bearer <jwt_token>
```

### Prefix
Tất cả Frontend API endpoints dùng prefix `/dashboard` hoặc `/analytics`.

---

## II. Dashboard API

### Module: `DashboardModule`
### Controller: `GET /dashboard/*`
### Data sources: `Account`, `Position`, `MarketPrice`

---

### 2.1 `GET /dashboard/summary`

**Mục đích:** Tổng hợp portfolio value, PnL, và asset allocation cho Dashboard page.

**Query params:** Không có.

**Data sources:**
- `Account` → `balance`, `initialBalance` (lấy account mặc định của user)
- `Position` (status=open) → `symbol`, `quantity`, `currentPrice`, `notionalUsd`, `unrealizedPnl`
- `Position` (status=closed) → `realizedPnl` (aggregate tất cả)

**Response:**
```json
{
  "portfolio": {
    "totalValueUsd": 124592.00,
    "cashBalanceUsd": 18688.00,
    "positionsValueUsd": 105904.00,
    "totalPnlUsd": 4592.00,
    "totalPnlPct": 3.83,
    "realizedPnlUsd": 2850.00,
    "unrealizedPnlUsd": 1742.00
  },
  "assetAllocation": [
    { "symbol": "PAXG", "valueUsd": 74755.00, "pct": 60.2, "quantity": 31.92 },
    { "symbol": "XAUT", "valueUsd": 31148.00, "pct": 25.1, "quantity": 13.29 },
    { "symbol": "USDT", "valueUsd": 18688.00, "pct": 14.7, "quantity": 18688.00 }
  ],
  "updatedAt": "2026-03-04T10:30:00Z"
}
```

**Logic tổng hợp:**
1. Lấy account mặc định (`isDefault: true`) của user → `cashBalanceUsd = account.balance`
2. Aggregate `Position` (status=open, accountId) → group by symbol → sum `notionalUsd`, sum `unrealizedPnl`
3. `positionsValueUsd` = sum of `notionalUsd + unrealizedPnl` cho mỗi position
4. `totalValueUsd` = `cashBalanceUsd` + `positionsValueUsd`
5. `realizedPnlUsd` = sum `realizedPnl` từ tất cả Position (status=closed)
6. `totalPnlUsd` = `realizedPnlUsd` + `unrealizedPnlUsd`
7. Asset allocation: mỗi symbol → valueUsd / totalValueUsd * 100

---

### 2.2 `GET /dashboard/price-cards`

**Mục đích:** Dữ liệu cho Price Cards (PAXG, XAUT, XAU/USD) bao gồm sparkline.

**Query params:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `symbols` | string (comma-separated) | `PAXGUSDT,XAUTUSD,XAUUSD` | Symbols cần lấy |
| `sparklinePoints` | number | `7` | Số điểm sparkline |

**Data sources:**
- `MarketPrice` (source=binance_spot, timeframe=1m) → PAXG latest + 24h high/low + sparkline
- `MarketPrice` (source=bitfinex, timeframe=5m) → XAUT latest
- `MarketPrice` (source=goldapi, timeframe=1m) → XAU/USD latest

**Response:**
```json
{
  "priceCards": [
    {
      "symbol": "PAXGUSDT",
      "displayName": "PAXG",
      "badge": "ERC-20",
      "subtitle": "Pax Gold / USDT",
      "price": 2345.10,
      "priceFormatted": "$2,345.10",
      "change24hUsd": 19.88,
      "change24hPct": 0.85,
      "isPositive": true,
      "high24h": 2360.00,
      "low24h": 2310.00,
      "high24hFormatted": "$2,360",
      "sparkline": [2310, 2320, 2315, 2330, 2325, 2340, 2345],
      "source": "binance_spot",
      "timestamp": "2026-03-04T10:30:00Z"
    },
    {
      "symbol": "XAUTUSD",
      "displayName": "XAUT",
      "badge": "GOLD",
      "subtitle": "Tether Gold / USDT",
      "price": 2342.80,
      "priceFormatted": "$2,342.80",
      "change24hPct": -0.21,
      "isPositive": false,
      "high24h": 2360.00,
      "low24h": 2338.00,
      "low24hFormatted": "$2,338",
      "sparkline": [2360, 2355, 2350, 2348, 2345, 2344, 2342],
      "source": "bitfinex",
      "timestamp": "2026-03-04T10:28:00Z"
    }
  ]
}
```

**Logic tổng hợp:**
1. Lấy record mới nhất của mỗi symbol từ MarketPrice
2. Lấy 24h high/low: query MarketPrice trong 24h qua, aggregate max(high), min(low)
3. Sparkline: lấy N records gần nhất (sort timestamp desc, limit N) → map `close`
4. Change 24h: so sánh close hiện tại với close cách đây 24h

---

### 2.3 `GET /dashboard/portfolio-history`

**Mục đích:** Dữ liệu chart lịch sử portfolio value theo thời gian.

**Query params:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `range` | enum: `7d`, `30d`, `90d`, `all` | `30d` | Khoảng thời gian |

**Data sources:**
- `PortfolioSnapshot` entity (mới, cần tạo) → balance snapshot daily
- Nếu chưa có PortfolioSnapshot: fallback tính từ `Trade` + `Position` theo ngày (slow path)

**Response:**
```json
{
  "range": "30d",
  "data": [
    { "date": "2026-02-03", "totalValueUsd": 110000, "cashUsd": 20000, "positionsUsd": 90000 },
    { "date": "2026-02-04", "totalValueUsd": 112000, "cashUsd": 20000, "positionsUsd": 92000 },
    { "date": "2026-03-04", "totalValueUsd": 124592, "cashUsd": 18688, "positionsUsd": 105904 }
  ],
  "summary": {
    "startValueUsd": 110000,
    "endValueUsd": 124592,
    "changePct": 13.27
  }
}
```

**Lưu ý:** Endpoint này phụ thuộc vào `PortfolioSnapshot` entity (xem entity design). Trong giai đoạn đầu, data có thể ít điểm (chỉ có từ ngày bắt đầu collect snapshot).

---

## III. Analytics API

### Module: `AnalyticsModule`
### Controller: `GET /analytics/*`
### Data sources: `Position`, `Trade`, `Account`

---

### 3.1 `GET /analytics/summary`

**Mục đích:** Tổng hợp performance metrics theo time range.

**Query params:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `range` | enum: `24h`, `7d`, `30d`, `90d`, `all` | `7d` | Khoảng thời gian |
| `accountId` | string | account mặc định | ID account cụ thể (optional) |

**Data sources:**
- `Position` (status=closed, closedAt trong range) → `realizedPnl`, count wins/losses
- `Position` (status=open) → `unrealizedPnl`
- `Trade` (executedAt trong range) → `notionalUsd` (volume)

**Response:**
```json
{
  "range": "7d",
  "summary": {
    "netPnlUsd": 892.40,
    "netPnlPct": 3.9,
    "realizedPnlUsd": 735.50,
    "unrealizedPnlUsd": 156.90,
    "totalVolumeUsd": 218000,
    "totalTrades": 12,
    "winRate": 75.0,
    "wins": 9,
    "losses": 3,
    "avgWinUsd": 81.72,
    "avgLossUsd": -19.17,
    "profitFactor": 4.26
  }
}
```

**Logic tổng hợp:**
1. `range` → tính `fromDate` (24h=now-1d, 7d=now-7d, 30d=now-30d, 90d=now-90d, all=epoch)
2. Closed positions trong range: filter `closedAt >= fromDate`
3. `wins` = count positions với `realizedPnl > 0`
4. `losses` = count positions với `realizedPnl <= 0`
5. `winRate` = wins / (wins + losses) * 100
6. `realizedPnlUsd` = sum `realizedPnl` từ closed positions trong range
7. `unrealizedPnlUsd` = sum `unrealizedPnl` từ tất cả open positions
8. `netPnlUsd` = `realizedPnlUsd` + `unrealizedPnlUsd`
9. `totalVolumeUsd` = sum `notionalUsd` từ Trade trong range
10. `profitFactor` = sum(winning realizedPnl) / abs(sum(losing realizedPnl))

---

### 3.2 `GET /analytics/positions/open`

**Mục đích:** Danh sách open positions.

**Query params:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `accountId` | string | account mặc định | ID account |
| `page` | number | `1` | Trang |
| `limit` | number | `20` | Số records/trang |

**Data sources:**
- `Position` (status=open)

**Response:**
```json
{
  "data": [
    {
      "id": "pos_001",
      "symbol": "PAXG/USDT",
      "side": "LONG",
      "entryPrice": 2045.50,
      "entryPriceFormatted": "$2,045.50",
      "currentPrice": 2345.10,
      "quantity": 1.5,
      "notionalUsd": 3068.25,
      "unrealizedPnlUsd": 449.40,
      "unrealizedPnlPct": 14.65,
      "isPositive": true,
      "stopLossPrice": 2020.00,
      "takeProfitPrice": 2100.00,
      "leverage": 1,
      "openedAt": "2026-03-01T08:00:00Z",
      "durationHours": 68.5
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

---

### 3.3 `GET /analytics/trades`

**Mục đích:** Lịch sử giao dịch (closed positions với thông tin entry/exit).

**Query params:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `range` | enum: `24h`, `7d`, `30d`, `90d`, `all` | `30d` | Khoảng thời gian |
| `accountId` | string | account mặc định | ID account |
| `page` | number | `1` | Trang |
| `limit` | number | `20` | Số records/trang |

**Data sources:**
- `Position` (status=closed, closedAt trong range) — mỗi closed position = 1 trade record cho FE

**Response:**
```json
{
  "data": [
    {
      "id": "T-001",
      "symbol": "PAXG/USDT",
      "side": "LONG",
      "entryPrice": 2310.00,
      "entryPriceFormatted": "$2,310.00",
      "exitPrice": 2345.10,
      "exitPriceFormatted": "$2,345.10",
      "quantity": 5.0,
      "realizedPnlUsd": 175.50,
      "realizedPnlPct": 1.52,
      "isPositive": true,
      "closeReason": "take_profit",
      "openedAt": "2026-02-28T06:00:00Z",
      "closedAt": "2026-02-28T10:22:00Z",
      "durationMinutes": 262,
      "durationFormatted": "4h 22m",
      "date": "28 Feb 2026"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

**Logic:**
- `exitPrice` = lấy từ `currentPrice` tại thời điểm đóng (Position không lưu exitPrice trực tiếp — cần thêm field `exitPrice` vào Position schema hoặc lấy từ Trade liên quan)
- `durationFormatted`: tính từ `openedAt` → `closedAt`

**⚠️ Schema gap:** Position schema hiện chưa có `exitPrice`. Cần thêm field này khi implement.

---

### 3.4 `GET /analytics/pnl-chart`

**Mục đích:** Dữ liệu điểm cho chart PnL theo thời gian (cumulative).

**Query params:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `range` | enum: `24h`, `7d`, `30d`, `90d`, `all` | `7d` | Khoảng thời gian |
| `accountId` | string | account mặc định | ID account |

**Data sources:**
- `Position` (status=closed) → group by date, sum `realizedPnl` → cumulative sum

**Response:**
```json
{
  "range": "7d",
  "data": [
    { "date": "2026-02-26", "dailyPnlUsd": -57.50,  "cumulativePnlUsd": -57.50  },
    { "date": "2026-02-27", "dailyPnlUsd": 126.00,  "cumulativePnlUsd": 68.50   },
    { "date": "2026-02-28", "dailyPnlUsd": 175.50,  "cumulativePnlUsd": 244.00  },
    { "date": "2026-03-01", "dailyPnlUsd": 210.80,  "cumulativePnlUsd": 454.80  },
    { "date": "2026-03-02", "dailyPnlUsd": 320.50,  "cumulativePnlUsd": 775.30  },
    { "date": "2026-03-03", "dailyPnlUsd": 117.10,  "cumulativePnlUsd": 892.40  }
  ]
}
```

**Logic:**
1. Filter closed positions trong range
2. Group by `closedAt` date (truncate to day)
3. Sum `realizedPnl` per day → `dailyPnlUsd`
4. Cumulative sum theo thứ tự thời gian → `cumulativePnlUsd`
5. Fill ngày không có trade với 0 (carry forward cumulative)

---

## IV. PortfolioSnapshot Entity (cần tạo mới)

Cần thêm entity để lưu portfolio value snapshot mỗi ngày (dùng cho `GET /dashboard/portfolio-history`).

### Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `accountId` | ObjectId (ref Account) | Yes | Tài khoản |
| `date` | Date | Yes | Ngày snapshot (truncated to day, UTC) |
| `totalValueUsd` | number | Yes | Tổng giá trị portfolio |
| `cashBalanceUsd` | number | Yes | Số dư tiền mặt |
| `positionsValueUsd` | number | Yes | Giá trị các vị thế đang mở |
| `realizedPnlUsd` | number | Yes | Tổng realized PnL tích lũy đến ngày này |
| `unrealizedPnlUsd` | number | Yes | Unrealized PnL tại thời điểm snapshot |

**Index:** `{ accountId: 1, date: -1 }` (unique per account per day)

### Snapshot job
- Schedule: Hàng ngày lúc **00:05 UTC** (sau khi close ngày)
- Worker mode: **shd** (scheduler)
- Job name: `snapshot_portfolio`
- Logic: Lấy tất cả active accounts → với mỗi account → tính portfolio value → upsert PortfolioSnapshot

---

## V. Module Structure (mới)

```
services/dgt/src/
├── modules/
│   ├── ...existing modules...
│   ├── portfolio-snapshot/          # Entity mới (Group 1 pattern)
│   │   ├── portfolio-snapshot.schema.ts
│   │   ├── portfolio-snapshot.service.ts
│   │   └── portfolio-snapshot.module.ts
│   ├── dashboard/                   # Frontend aggregation (no entity)
│   │   ├── dashboard.controller.ts
│   │   ├── dashboard.service.ts
│   │   └── dashboard.module.ts
│   └── analytics/                   # Frontend aggregation (no entity)
│       ├── analytics.controller.ts
│       ├── analytics.service.ts
│       └── analytics.module.ts
```

**Đặc điểm dashboard/analytics modules:**
- Không có schema riêng (aggregate từ các entity đã có)
- Service inject nhiều model: `Account`, `Position`, `Trade`, `MarketPrice`, `PortfolioSnapshot`
- Áp dụng RBAC: filter theo `owner.userId` từ JWT context
- Không dùng `BaseService` (vì là aggregation, không phải CRUD đơn thuần)

---

## VI. Schema Changes (existing entities)

| Entity | Field thêm | Type | Lý do |
|--------|-----------|------|-------|
| `Position` | `exitPrice` | number | Analytics trade history cần exit price |

---

## VII. Error Responses

Tất cả endpoints trả về standard error format:

```json
{
  "statusCode": 404,
  "message": "No default account found for this user",
  "error": "Not Found",
  "correlationId": "req_abc123"
}
```

| Status | Khi nào |
|--------|---------|
| `401` | Thiếu hoặc invalid JWT |
| `404` | Không tìm thấy account mặc định |
| `400` | Query param không hợp lệ |

---

*Tài liệu liên quan: [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | [02-ENTITY-DESIGN.md](02-ENTITY-DESIGN.md) | [Frontend-Page-Metric.md](Frontend-Page-Metric.md)*
