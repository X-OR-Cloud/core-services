# DGT Frontend API Specification

> **Version**: 3.0.0 | **Last Updated**: 2026-03-17
>
> **Base URL (local)**: `http://localhost:3008`
> **Base URL (prod)**: `https://xsai-api.x-or.cloud/dgt`
> **IAM Base URL (local)**: `http://localhost:3001`
> **IAM Base URL (prod)**: `https://api.x-or.cloud/dev/iam-v2`
>
> Tất cả DGT endpoints yêu cầu `Authorization: Bearer <JWT_TOKEN>` (trừ IAM login/refresh).

---

## Mục lục theo trang

| # | Trang | Sections |
|---|-------|---------|
| 1 | [Login / Auth](#1-login--auth) | Đăng nhập, Refresh Token |
| 2 | [Dashboard](#2-dashboard) | Portfolio, Price Cards, Portfolio History, AI Signal, Market Status, Macro Context, Market Indicators, AI Activity Feed |
| 3 | [Analytics](#3-analytics) | Summary, Open Positions, Trade History, PnL Chart, Equity Curve, Drawdown, CSV Export |
| 4 | [AI Agent](#4-ai-agent) | CRUD Bot, Controls, Stats, Activity Logs |
| 5 | [AI Intelligence](#5-ai-intelligence) | Signals, Execute Trade |
| 6 | [Settings](#6-settings) | Profile, Exchange Accounts |
| 7 | [Global](#7-global) | Error format, Pagination |

---

## 1. Login / Auth

> Base: **IAM Service**

### 1.1 Đăng nhập

```
POST /auth/login
```

**Body**:

| Field | Type | Required |
|-------|------|----------|
| `email` | `string` | ✓ |
| `password` | `string` | ✓ |

**Response 200**:
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

> FE lưu `accessToken` vào `localStorage.gann_jwt`, `refreshToken` vào `localStorage.gann_refresh_token`.

---

### 1.2 Refresh Token

```
POST /auth/refresh-token
```

**Body**: `{ "refreshToken": "..." }`

**Response 200**: Giống 1.1 — trả cặp token mới.

> FE tự động gọi khi nhận `401`. Nếu refresh thất bại → redirect `/login`.

---

## 2. Dashboard

> Base: **DGT** · Route FE: `/dashboard`

---

### 2.1 Portfolio Summary

**Mục đích**: Stat cards tổng quan — tổng giá trị, PnL, phân bổ tài sản.

```
GET /dashboard/summary
```

**Response 200**:
```json
{
  "portfolio": {
    "totalValueUsd": 12450.75,
    "cashBalanceUsd": 7200.00,
    "positionsValueUsd": 5250.75,
    "totalPnlUsd": 2450.75,
    "totalPnlPct": 24.51,
    "realizedPnlUsd": 1200.50,
    "unrealizedPnlUsd": 1250.25
  },
  "assetAllocation": [
    { "symbol": "PAXGUSDT", "valueUsd": 5250.75, "pct": 42.2, "quantity": 1.0125 },
    { "symbol": "USDT",     "valueUsd": 7200.00,  "pct": 57.8, "quantity": 7200.00 }
  ],
  "updatedAt": "2026-03-04T08:40:20.095Z"
}
```

> ⚠️ Dùng account `isDefault: true`. Chưa có account → `404 No default account found for this user`.

---

### 2.2 Price Cards

**Mục đích**: Giá realtime + sparkline cho các asset vàng/crypto. FE **poll mỗi 30 giây**.

```
GET /dashboard/price-cards
```

**Query Parameters**:

| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `symbols` | `string` | `PAXGUSDT,XAUTUSD,XAUUSD` | Danh sách symbols cách nhau dấu phẩy |
| `sparklinePoints` | `number` | `7` | Số điểm dữ liệu mini chart |

**Response 200**:
```json
{
  "priceCards": [
    {
      "symbol": "PAXGUSDT",
      "price": 5184.39,
      "change24hUsd": -35.16,
      "change24hPct": -0.67,
      "isPositive": false,
      "high24h": 5441.14,
      "low24h": 5027.33,
      "sparkline": [5181.53, 5181.49, 5181.19, 5181.74, 5183.64, 5185.40, 5184.39],
      "source": "binance_spot",
      "timestamp": "2026-03-04T08:37:43.792Z"
    }
  ]
}
```

| Field | Enum / Notes |
|-------|-------------|
| `source` | `"binance_spot"`, `"bitfinex"`, `"okx"`, `"goldapi"` |
| `isPositive` | `true` nếu giá tăng 24h |

> Symbol không có data trong DB sẽ bị bỏ qua (không có trong mảng).

---

### 2.3 Portfolio History Chart

**Mục đích**: Dữ liệu cho biểu đồ "Portfolio Value Over Time".

```
GET /dashboard/portfolio-history
```

**Query Parameters**:

| Param | Type | Default | Enum |
|-------|------|---------|------|
| `range` | `string` | `30d` | `"7d"`, `"30d"`, `"90d"`, `"all"` |

**Response 200** (có data):
```json
{
  "range": "30d",
  "data": [
    { "date": "2026-02-02", "totalValueUsd": 10000.00, "cashUsd": 10000.00, "positionsUsd": 0.00 },
    { "date": "2026-03-03", "totalValueUsd": 12450.75, "cashUsd": 7200.00, "positionsUsd": 5250.75 }
  ],
  "summary": {
    "startValueUsd": 10000.00,
    "endValueUsd": 12450.75,
    "changePct": 24.51
  }
}
```

**Response 200** (account mới, chưa có snapshot):
```json
{ "range": "30d", "data": [], "summary": null }
```

> ⚠️ Data do **daily snapshot job** tạo lúc 00:05 UTC. Account mới → `data: []` cho đến khi job chạy.

---

### 2.4 AI Trend Signal Widget

**Mục đích**: Tín hiệu xu hướng AI — BULLISH/BEARISH/NEUTRAL kèm confidence.

```
GET /dashboard/ai-signal
```

**Query Parameters**:

| Param | Type | Default | Enum |
|-------|------|---------|------|
| `timeframe` | `string` | `4h` | `"1h"`, `"4h"`, `"12h"`, `"24h"` |
| `symbol` | `string` | `PAXGUSDT` | `"PAXGUSDT"`, `"XAUTUSD"` |

**Response 200**:
```json
{
  "signal": "BULLISH",
  "confidence": 78,
  "timeframe": "4h",
  "symbol": "PAXGUSDT",
  "updatedAt": "2026-03-15T12:00:00Z",
  "components": {
    "technicalSignal": "BULLISH",
    "liquiditySignal": "NEUTRAL",
    "volumeSignal": "BULLISH"
  }
}
```

| Field | Enum |
|-------|------|
| `signal` | `"BULLISH"`, `"BEARISH"`, `"NEUTRAL"` |
| `components.*Signal` | `"BULLISH"`, `"BEARISH"`, `"NEUTRAL"` |

> Khi không có ACTIVE signal cho account + symbol + timeframe, trả `signal: "NEUTRAL"`, `confidence: 0`.

---

### 2.5 Market Status Widget

**Mục đích**: Snapshot cấu trúc thị trường — trend, volatility, liquidity.

```
GET /dashboard/market-status
```

**Query Parameters**: `symbol` (default: `PAXGUSDT`)

**Response 200**:
```json
{
  "symbol": "PAXGUSDT",
  "trend": "TRENDING",
  "volatilityLevel": "MEDIUM",
  "volatilityScore": 42,
  "liquidityScore": 78,
  "liquidityLabel": "HIGH",
  "bidAskSpread": 0.12,
  "slippageEstimate": 0.08,
  "updatedAt": "2026-03-15T14:22:00Z"
}
```

| Field | Enum |
|-------|------|
| `trend` | `"TRENDING"`, `"RANGING"`, `"VOLATILE"` |
| `volatilityLevel` | `"LOW"`, `"MEDIUM"`, `"HIGH"` |
| `liquidityLabel` | `"LOW"`, `"MEDIUM"`, `"HIGH"` |

> Tính từ `TechnicalIndicator` (ATR, MACD, volumeRatio). Nếu chưa có indicator data → trả fallback RANGING/MEDIUM.

---

### 2.6 Macro Context Widget

**Mục đích**: Chỉ số vĩ mô (DXY, VIX, Real Yield) + Trade Gate.

```
GET /dashboard/macro-context
```

**Response 200**:
```json
{
  "tradeGate": "OPEN",
  "macroRiskScore": 35,
  "macroRiskLabel": "MODERATE",
  "indicators": {
    "dxy":          { "value": 104.2, "change24h": null, "label": "USD Index" },
    "vix":          { "value": 18.5,  "level": "MODERATE", "label": "Market Stress (VIX)" },
    "realYield10y": { "value": 1.85,  "label": "US 10Y Real Yield" }
  },
  "upcomingEvents": [],
  "updatedAt": "2026-03-15T14:00:00Z"
}
```

| Field | Enum |
|-------|------|
| `tradeGate` | `"OPEN"` hoặc `"BLOCKED"` — macroRiskScore > 75 → BLOCKED |
| `macroRiskLabel` | `"LOW"`, `"MODERATE"`, `"HIGH"`, `"EXTREME"` |
| `vix.level` | `"LOW"`, `"MODERATE"`, `"HIGH"` |

> Data lấy từ `MacroIndicator` collection (FRED). Series IDs: `DXY`, `VIXCLS`, `DFII10`. Giá trị `null` = chưa có data ingestion.

---

### 2.7 Market Indicators Widget

**Mục đích**: RSI, Fear & Greed Index, Support/Resistance.

```
GET /dashboard/market-indicators
```

**Query Parameters**: `symbol` (default: `PAXGUSDT`)

**Response 200**:
```json
{
  "symbol": "PAXGUSDT",
  "timeframe": "24h",
  "volatility24hPct": 1.24,
  "rsi14": 68.4,
  "rsiLevel": "APPROACHING_OVERBOUGHT",
  "fearGreedIndex": 74,
  "fearGreedLabel": "Greed",
  "support": 5100.00,
  "resistance": 5300.00,
  "updatedAt": "2026-03-15T14:00:00Z"
}
```

| Field | Enum |
|-------|------|
| `rsiLevel` | `"OVERSOLD"`, `"NEUTRAL"`, `"APPROACHING_OVERBOUGHT"`, `"OVERBOUGHT"` |
| `fearGreedLabel` | `"Extreme Fear"`, `"Fear"`, `"Neutral"`, `"Greed"`, `"Extreme Greed"` |

> `support` = `bbLower`, `resistance` = `bbUpper` từ TechnicalIndicator. `null` nếu chưa có data.

---

### 2.8 AI Activity Feed Widget

**Mục đích**: Luồng log realtime từ các bot. FE **poll mỗi 30 giây**.

```
GET /dashboard/ai-activity
```

**Query Parameters**:

| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `limit` | `number` | `20` | Số entries trả về |
| `since` | `string (ISO 8601)` | _(none)_ | Chỉ lấy entries sau thời điểm này (incremental update) |

**Response 200**:
```json
{
  "entries": [
    {
      "id": "69a1b2c3...",
      "timestamp": "2026-03-15T14:24:54Z",
      "agent": "TREND",
      "message": "Open LONG PAXGUSDT",
      "severity": "INFO",
      "metadata": {}
    }
  ],
  "hasMore": false
}
```

| Field | Enum |
|-------|------|
| `agent` | `"TREND"`, `"LIQUIDITY"`, `"MACRO"`, `"NEURAL"`, `"RISK"` (map từ actionType của BotActivityLog) |
| `severity` | `"INFO"`, `"WARNING"`, `"ALERT"` |

---

## 3. Analytics

> Base: **DGT** · Route FE: `/analytics`

---

### 3.1 Performance Summary

**Mục đích**: Metric cards — Win Rate, PnL, Volume, Profit Factor theo kỳ.

```
GET /analytics/summary
```

**Query Parameters**:

| Param | Type | Default | Enum |
|-------|------|---------|------|
| `range` | `string` | `7d` | `"24h"`, `"7d"`, `"30d"`, `"90d"`, `"all"` |
| `accountId` | `string` | _(default account)_ | MongoDB ObjectId |

**Response 200**:
```json
{
  "range": "7d",
  "summary": {
    "netPnlUsd": 2450.75,
    "netPnlPct": 24.51,
    "realizedPnlUsd": 1200.50,
    "unrealizedPnlUsd": 1250.25,
    "totalVolumeUsd": 45600.00,
    "totalTrades": 12,
    "winRate": 66.7,
    "wins": 8,
    "losses": 4,
    "avgWinUsd": 312.50,
    "avgLossUsd": -187.25,
    "profitFactor": 3.33
  }
}
```

> `profitFactor = 0` khi không có lệnh lỗ. FE nên hiển thị "∞" khi `losses = 0`.

---

### 3.2 Open Positions

**Mục đích**: Bảng danh sách vị thế đang mở.

```
GET /analytics/positions/open
```

**Query Parameters**: `accountId`, `page` (default: 1), `limit` (default: 20)

**Response 200**:
```json
{
  "data": [
    {
      "id": "69a8b2c3...",
      "symbol": "PAXGUSDT",
      "side": "LONG",
      "entryPrice": 5100.00,
      "currentPrice": 5184.39,
      "quantity": 1.0125,
      "notionalUsd": 5186.39,
      "unrealizedPnlUsd": 85.49,
      "unrealizedPnlPct": 1.67,
      "isPositive": true,
      "stopLossPrice": 4900.00,
      "takeProfitPrice": 5500.00,
      "leverage": 1,
      "openedAt": "2026-02-28T10:30:00.000Z",
      "durationHours": 109.5
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

| Field | Notes |
|-------|-------|
| `side` | `"LONG"` hoặc `"SHORT"` |
| `stopLossPrice` | `number \| null` |
| `leverage` | `1` = spot |

---

### 3.3 Trade History

**Mục đích**: Bảng lịch sử các lệnh đã đóng.

```
GET /analytics/trades
```

**Query Parameters**: `range` (default: `30d`), `accountId`, `page` (default: 1), `limit` (default: 20)

**Response 200**:
```json
{
  "data": [
    {
      "id": "T-012",
      "symbol": "PAXGUSDT",
      "side": "LONG",
      "entryPrice": 5050.00,
      "exitPrice": 5250.00,
      "quantity": 0.5,
      "realizedPnlUsd": 100.00,
      "realizedPnlPct": 3.96,
      "isPositive": true,
      "closeReason": "take_profit",
      "openedAt": "2026-02-25T09:00:00.000Z",
      "closedAt": "2026-03-01T14:30:00.000Z",
      "durationMinutes": 8730,
      "durationFormatted": "145h 30m",
      "date": "01 Mar 2026"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

| Field | Enum |
|-------|------|
| `closeReason` | `"take_profit"`, `"stop_loss"`, `"manual"`, `"liquidation"`, `null` |
| `id` | Format `T-001`, `T-002`, ... (đánh số ngược, lệnh mới nhất = số lớn nhất) |

---

### 3.4 Daily PnL Chart

**Mục đích**: Dữ liệu bar chart PnL theo ngày + cumulative line chart.

```
GET /analytics/pnl-chart
```

**Query Parameters**: `range` (default: `7d`), `accountId`

**Response 200**:
```json
{
  "range": "7d",
  "data": [
    { "date": "2026-02-26", "dailyPnlUsd": 120.50,  "cumulativePnlUsd": 120.50 },
    { "date": "2026-02-27", "dailyPnlUsd": -45.25,  "cumulativePnlUsd": 75.25 },
    { "date": "2026-03-01", "dailyPnlUsd": 380.00,  "cumulativePnlUsd": 455.25 }
  ]
}
```

> ⚠️ Ngày không có giao dịch sẽ bị bỏ qua. FE nên fill `0` nếu cần biểu đồ liên tục.

---

### 3.5 Equity Curve

**Mục đích**: Đường vốn theo thời gian từ daily snapshots.

```
GET /analytics/equity-curve
```

**Query Parameters**: `range` (default: `30d`), `accountId`

**Response 200**:
```json
{
  "range": "30d",
  "data": [
    { "timestamp": "2026-02-15T00:00:00Z", "equity": 10000.00, "cumulativePnl": 0,       "roiPct": 0 },
    { "timestamp": "2026-03-01T00:00:00Z", "equity": 12450.75, "cumulativePnl": 2450.75, "roiPct": 24.51 }
  ]
}
```

> Data nguồn từ `PortfolioSnapshot` (daily job 00:05 UTC). `data: []` nếu chưa có snapshot.

---

### 3.6 Drawdown Chart

**Mục đích**: Biểu đồ sụt giảm so với đỉnh.

```
GET /analytics/drawdown
```

**Query Parameters**: `range` (default: `30d`), `accountId`

**Response 200**:
```json
{
  "range": "30d",
  "maxDrawdownPct": -12.5,
  "data": [
    { "timestamp": "2026-02-15T00:00:00Z", "equity": 10000.00, "drawdownPct": 0 },
    { "timestamp": "2026-02-20T00:00:00Z", "equity": 8750.00,  "drawdownPct": -12.5 }
  ]
}
```

> `drawdownPct` luôn ≤ 0. `maxDrawdownPct` = điểm thấp nhất trong kỳ.

---

### 3.7 Export Trade History (CSV)

**Mục đích**: Tải xuống file CSV lịch sử giao dịch.

```
GET /analytics/export/csv
```

**Query Parameters**: `range` (default: `30d`), `accountId`

**Response 200**: File CSV với header `Content-Disposition: attachment; filename="trades-<range>-<date>.csv"`.

> ⚠️ **FE phải dùng axios blob** — không dùng `<a href>` trực tiếp (cần auth header):
> ```ts
> const res = await api.get('/analytics/export/csv', { params, responseType: 'blob' });
> const url = URL.createObjectURL(new Blob([res.data]));
> const a = document.createElement('a');
> a.href = url; a.download = `trades-${range}.csv`; a.click();
> URL.revokeObjectURL(url);
> ```

---

## 4. AI Agent

> Base: **DGT** · Route FE: `/ai-agent`

---

### 4.1 Danh sách Bot

```
GET /bots
```

**Query Parameters**: `page`, `limit`, `status`, `accountId` (tùy chọn)

**Response 200**:
```json
{
  "data": [{ "...": "Bot object" }],
  "pagination": { "page": 1, "limit": 20, "total": 3 },
  "statistics": { "total": 3 }
}
```

**Bot Object**:

| Field | Type | Ghi chú |
|-------|------|---------|
| `_id` | `string` | MongoDB ObjectId |
| `accountId` | `string` | ID account liên kết |
| `name` | `string` | Tên bot |
| `status` | `string` | Xem enum bên dưới |
| `tradingMode` | `"sandbox" \| "live"` | Chế độ giao dịch |
| `asset` | `string` | Symbol (vd: `PAXGUSDT`) |
| `timeframe` | `"1h" \| "4h"` | Khung thời gian |
| `totalCapital` | `number` | Tổng vốn phân bổ (USD) |
| `maxEntrySize` | `number` | Kích thước vào lệnh tối đa (USD) |
| `stopLoss` | `number` | Stop loss % |
| `takeProfit` | `number` | Take profit % |
| `maxDrawdownLimit` | `number` | Drawdown tối đa % — bot tự dừng khi đạt |
| `dailyStopLossUSD` | `number` | Tổng lỗ tối đa trong ngày (USD) — bot tự dừng |
| `minConfidenceScore` | `number` | Ngưỡng confidence tín hiệu tối thiểu (0–100) |
| `lastActiveAt` | `string \| null` | Thời điểm hoạt động cuối |
| `errorMessage` | `string \| null` | Thông báo lỗi (khi status = ERROR) |
| `dailyLossTracking.date` | `string` | Ngày đang theo dõi giới hạn lỗ |
| `dailyLossTracking.lossUsd` | `number` | Tổng lỗ tích lũy trong ngày (USD) |
| `stats.totalPnl` | `number` | Tổng PnL (USD) |
| `stats.winRate` | `number` | Win rate % |
| `stats.totalTrades` | `number` | Tổng số lệnh |
| `stats.currentDrawdownPct` | `number` | Drawdown hiện tại % |
| `createdAt` | `string (ISO 8601)` | — |
| `updatedAt` | `string (ISO 8601)` | — |

**`status` enum**:

| Giá trị | Ý nghĩa |
|---------|--------|
| `CREATED` | Mới tạo, chưa chạy |
| `RUNNING` | Đang hoạt động |
| `PAUSED` | Tạm dừng |
| `STOPPED` | Đã dừng hoàn toàn |
| `ERROR` | Gặp lỗi — cần can thiệp thủ công |
| `DELETED` | Đã xoá (soft delete) |

---

### 4.2 Chi tiết Bot

```
GET /bots/:id
```

**Response 200**: Bot object (xem 4.1)

---

### 4.3 Tạo Bot mới

```
POST /bots
```

**Body** (tất cả required trừ `asset`, `minConfidenceScore`):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `accountId` | `string` | ✓ | MongoDB ObjectId |
| `name` | `string` | ✓ | — |
| `tradingMode` | `"sandbox" \| "live"` | ✓ | — |
| `asset` | `string` | — | Default: `PAXGUSDT` |
| `timeframe` | `"1h" \| "4h"` | ✓ | — |
| `totalCapital` | `number` | ✓ | Min: 1 |
| `maxEntrySize` | `number` | ✓ | Min: 1 |
| `stopLoss` | `number` | ✓ | Min: 0.1, Max: 100 |
| `takeProfit` | `number` | ✓ | Min: 0.1, Max: 100 |
| `maxDrawdownLimit` | `number` | ✓ | Min: 1, Max: 15 |
| `dailyStopLossUSD` | `number` | ✓ | Min: 1 |
| `minConfidenceScore` | `number` | — | Default: 70, Min: 0, Max: 100 |

**Response 201**: Bot object vừa tạo.

---

### 4.4 Cập nhật cấu hình Bot

```
PUT /bots/:id
```

**Body** (partial — chỉ các field cần cập nhật):

`name`, `tradingMode`, `totalCapital`, `maxEntrySize`, `stopLoss`, `takeProfit`, `maxDrawdownLimit`, `dailyStopLossUSD`, `minConfidenceScore`

> Áp dụng ngay cho lần phân tích tín hiệu tiếp theo — không cần restart bot.

**Response 200**: Bot object đã cập nhật.

---

### 4.5 Xoá Bot

```
DELETE /bots/:id
```

**Điều kiện**: Bot phải ở trạng thái `STOPPED` hoặc `PAUSED`. Bot đang `RUNNING` → `400 Cannot delete a running bot`.

**Response 200**: `{ "_id": "...", "deletedAt": "..." }` (soft delete)

---

### 4.6 Điều khiển Bot

| Action | Endpoint | Từ trạng thái | Sang trạng thái |
|--------|----------|--------------|----------------|
| **Start** | `POST /bots/:id/start` | `CREATED`, `STOPPED` | `RUNNING` |
| **Pause** | `POST /bots/:id/pause` | `RUNNING` | `PAUSED` |
| **Resume** | `POST /bots/:id/resume` | `PAUSED` | `RUNNING` |
| **Stop** | `POST /bots/:id/stop` | `RUNNING`, `PAUSED` | `STOPPED` |

**Response 200**: Bot object đã cập nhật.

> ⚠️ Transition không hợp lệ (vd: pause khi STOPPED) → `400 Bad Request`.

---

### 4.7 Bot Stats tổng hợp

**Mục đích**: Header stats tổng hợp toàn bộ bots của user.

```
GET /bots/stats
```

**Response 200**:
```json
{
  "activeBots": 2,
  "totalPnl": 1250.75,
  "activeVolume": 8500.00,
  "totalVolume": 45000.00
}
```

| Field | Mô tả |
|-------|-------|
| `activeBots` | Số bot đang RUNNING |
| `totalPnl` | Tổng PnL tất cả bot (USD), từ `bot.stats.totalPnl` |
| `activeVolume` | Tổng vốn phân bổ trong bot đang RUNNING (`totalCapital`) |
| `totalVolume` | Ước tính tổng khối lượng (`totalTrades × maxEntrySize`) |

---

### 4.8 Activity Logs

**Mục đích**: Nhật ký hành động của bot — mua/bán, cảnh báo, lỗi. TTL 90 ngày.

```
GET /bot-activity-logs
```

**Query Parameters**: `botId`, `accountId`, `page`, `limit`, `actionType`

**Response 200**:
```json
{
  "data": [
    {
      "_id": "...",
      "botId": "...",
      "accountId": "...",
      "action": "Open LONG PAXGUSDT",
      "actionType": "buy",
      "details": "Signal confidence 82. Entry at 5100.",
      "metadata": {},
      "performedBy": "system",
      "status": "SUCCESS",
      "createdAt": "2026-03-10T08:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 45 },
  "statistics": { "total": 45 }
}
```

| Field | Enum |
|-------|------|
| `actionType` | `"buy"`, `"sell"`, `"info"`, `"warning"`, `"error"` |
| `performedBy` | `"user"`, `"system"` |
| `status` | `"SUCCESS"`, `"WARNING"`, `"ERROR"`, `"INFO"` |

---

## 5. AI Intelligence

> Base: **DGT** · Route FE: `/insights`

---

### 5.1 Danh sách Signals

```
GET /signals
```

**Query Parameters**: `page`, `limit`, `status`, `symbol` (→ map tới `asset`), `range`

**Response 200**:
```json
{
  "data": [{ "...": "Signal object" }],
  "pagination": { "page": 1, "limit": 20, "total": 25 },
  "statistics": { "total": 25 }
}
```

**Signal Object**:

| Field | Type | Ghi chú |
|-------|------|---------|
| `_id` | `string` | MongoDB ObjectId |
| `accountId` | `string` | ID account |
| `asset` | `string` | Tài sản gốc (vd: `PAXGUSDT`) |
| `symbol` | `string` | **Virtual** — alias của `asset`, cho FE |
| `timeframe` | `"1h" \| "4h"` | Khung thời gian |
| `signalType` | `"BUY" \| "SELL" \| "HOLD"` | Tín hiệu gốc |
| `action` | `string` | **Virtual** — alias của `signalType`, cho FE |
| `confidence` | `number` (0–100) | Độ tin cậy |
| `confidenceLabel` | `"low" \| "medium" \| "high" \| "very_high"` | Nhãn độ tin cậy |
| `insight` | `string` | Diễn giải LLM |
| `status` | `string` | Xem enum bên dưới |
| `expiresAt` | `string (ISO 8601)` | Thời điểm signal hết hạn |
| `priceAtCreation` | `number` | Giá tại thời điểm tạo signal |
| `createdAt` | `string (ISO 8601)` | — |

**`status` enum**:

| Giá trị | Ý nghĩa |
|---------|--------|
| `ACTIVE` | Đang hiệu lực, có thể execute |
| `EXPIRED` | Đã hết hạn |
| `EXECUTED` | Đã thực thi lệnh |
| `IGNORED` | User đã bỏ qua |
| `SUPERSEDED` | Bị thay thế bởi signal mới hơn |

---

### 5.2 Signals ACTIVE mới nhất

```
GET /signals/latest
```

**Mục đích**: Chỉ lấy signals có `status: ACTIVE`, sắp xếp mới nhất trước.

**Response 200**: Cùng format với 5.1.

---

### 5.3 Chi tiết Signal

```
GET /signals/:id
```

**Response 200**: Signal object đầy đủ (xem 5.1).

---

### 5.4 Bỏ qua Signal

```
PATCH /signals/:id/ignore
```

**Mục đích**: Đánh dấu signal là `IGNORED`.

**Response 200**: Signal object đã cập nhật.

> ⚠️ Chỉ signal `ACTIVE` mới có thể ignore. Signal EXPIRED/EXECUTED → lỗi từ BaseService (403/404).

---

### 5.5 Mở lệnh từ Signal

```
POST /trades/from-signal
```

**Body**:

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `signalId` | `string` | ✓ | ID signal cần thực thi |
| `accountId` | `string` | — | ID tài khoản (mặc định dùng default account) |

**Response 200**: Trade object được tạo.

> ⚠️ Chỉ signal `ACTIVE` mới được execute. Signal EXPIRED/IGNORED/EXECUTED → `400 Bad Request`.

---

## 6. Settings

> Route FE: `/settings`

---

### 6.1 Xem hồ sơ người dùng

> Base: **IAM Service**

```
GET /auth/profile
```

**Response 200**:

| Field | Type | Mô tả |
|-------|------|-------|
| `_id` | `string` | User ID |
| `email` | `string` | Email (không thể thay đổi) |
| `username` | `string` | Username |
| `fullname` | `string` | Họ và tên |
| `phonenumbers` | `string[]` | Danh sách SĐT |
| `address` | `string` | Địa chỉ |
| `telegramId` | `string` | Telegram ID để nhận thông báo |
| `createdAt` | `string (ISO 8601)` | — |
| `updatedAt` | `string (ISO 8601)` | — |

---

### 6.2 Cập nhật hồ sơ

> Base: **IAM Service**

```
PATCH /auth/profile
```

**Body**: Partial — bất kỳ field nào ở 6.1 trừ `_id`, `email`, `createdAt`, `updatedAt`.

**Response 200**: Profile object đã cập nhật.

---

### 6.3 Danh sách Exchange Accounts

> Base: **DGT**

```
GET /accounts
```

**Response 200**:
```json
{
  "data": [{ "...": "Account object" }],
  "pagination": { "page": 1, "limit": 10, "total": 1 },
  "statistics": { "total": 1 }
}
```

**Account Object**:

| Field | Type | Ghi chú |
|-------|------|---------|
| `_id` | `string` | MongoDB ObjectId |
| `accountType` | `"paper" \| "live"` | Paper = mô phỏng, Live = thật |
| `exchange` | `"binance" \| "okx" \| "bybit"` | Sàn giao dịch |
| `label` | `string` | Nhãn do user đặt |
| `balance` | `number` | Số dư hiện tại (USD) |
| `initialBalance` | `number` | Vốn ban đầu (USD) |
| `currency` | `string` | Đồng tiền (default: `USDT`) |
| `status` | `"active" \| "suspended" \| "closed"` | Trạng thái |
| `isDefault` | `boolean` | Tài khoản mặc định cho các API |
| `apiKey` | `string` | **Masked** — chỉ hiện phần cuối (`xxxx...abcd`). Rỗng nếu chưa set. |
| `notifications.discordWebhookUrl` | `string` | Webhook Discord |
| `notifications.telegramBotToken` | `string` | Bot token Telegram |
| `notifications.telegramChatId` | `string` | Chat ID Telegram |
| `notifications.telegramThreadId` | `string` | Thread ID (group có topic) |
| `notifications.enabled` | `boolean` | Bật/tắt thông báo |
| `createdAt` | `string (ISO 8601)` | — |
| `updatedAt` | `string (ISO 8601)` | — |

> ⚠️ `apiSecret` **KHÔNG BAO GIỜ** xuất hiện trong response. BE mã hoá AES-256-CBC trước khi lưu.

---

### 6.4 Chi tiết một Account

```
GET /accounts/:id
```

**Response 200**: Account object (xem 6.3).
**Response 404**: Account không tồn tại hoặc không thuộc user hiện tại.

---

### 6.5 Tạo Exchange Account mới

```
POST /accounts
```

**Body**:

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `label` | `string` | — | Nhãn (vd: "Binance Paper") |
| `exchange` | `"binance" \| "okx" \| "bybit"` | — | Default: `binance` |
| `accountType` | `"paper" \| "live"` | — | Default: `paper` |
| `initialBalance` | `number` | — | Vốn ban đầu (USD). Default: `0` |
| `currency` | `string` | — | Default: `USDT` |
| `isDefault` | `boolean` | — | Đặt làm tài khoản mặc định |
| `apiKey` | `string` | — | API Key từ sàn (cho LIVE account) |
| `apiSecret` | `string` | — | API Secret — BE mã hoá, **không trả về** |

**Response 201**: Account object (`apiKey` đã masked, không có `apiSecret`).

> ℹ️ Khi user đăng ký mới, DGT tự động tạo 1 PAPER account mặc định (10,000 USDT, Binance) qua IAM event queue.

---

### 6.6 Cập nhật Account

```
PUT /accounts/:id
```

**Body**: Partial — bất kỳ field nào trong 6.5 (trừ `_id`, `createdAt`).

> Khi cập nhật API Key: phải truyền **đồng thời** cả `apiKey` và `apiSecret` mới.

**Response 200**: Account object đã cập nhật.

---

## 7. Global

### 7.1 Error Response Format

Tất cả error response theo format chuẩn:

```json
{
  "statusCode": 404,
  "message": "No default account found for this user",
  "timestamp": "2026-03-16T08:40:20.095Z",
  "path": "/dashboard/summary",
  "correlationId": "1179047c-a46f-4b9e-9906-fa1348081a04"
}
```

| HTTP Code | Khi nào |
|-----------|---------|
| `400` | Request sai tham số / action không hợp lệ |
| `401` | Thiếu token hoặc token hết hạn → FE tự refresh |
| `403` | Không có quyền truy cập resource |
| `404` | Resource không tồn tại |
| `500` | Lỗi server nội bộ |

---

### 7.2 Pagination chuẩn

Tất cả API trả list dùng format:

```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 45 },
  "statistics": { "total": 45 }
}
```

Mặc định: `page=1`, `limit=20` nếu FE không truyền.

> ⚠️ Analytics endpoints (`/analytics/positions/open`, `/analytics/trades`) trả format khác: `{ data, total, page, limit }` (flat).

---

### 7.3 Bảng tổng hợp tất cả Endpoints

| Trang | Method | Endpoint | Mô tả |
|-------|--------|----------|-------|
| **Login** | POST | `/auth/login` _(IAM)_ | Đăng nhập |
| **Login** | POST | `/auth/refresh-token` _(IAM)_ | Refresh JWT |
| **Dashboard** | GET | `/dashboard/summary` | Portfolio tổng quan |
| **Dashboard** | GET | `/dashboard/price-cards` | Giá realtime + sparkline |
| **Dashboard** | GET | `/dashboard/portfolio-history` | Biểu đồ lịch sử danh mục |
| **Dashboard** | GET | `/dashboard/ai-signal` | AI Trend Signal widget |
| **Dashboard** | GET | `/dashboard/market-status` | Market Status widget |
| **Dashboard** | GET | `/dashboard/macro-context` | Macro Context widget |
| **Dashboard** | GET | `/dashboard/market-indicators` | Market Indicators widget |
| **Dashboard** | GET | `/dashboard/ai-activity` | AI Activity Feed (poll 30s) |
| **Analytics** | GET | `/analytics/summary` | Metric cards hiệu suất |
| **Analytics** | GET | `/analytics/positions/open` | Bảng Open Positions |
| **Analytics** | GET | `/analytics/trades` | Bảng Trade History |
| **Analytics** | GET | `/analytics/pnl-chart` | Biểu đồ PnL theo ngày |
| **Analytics** | GET | `/analytics/equity-curve` | Biểu đồ Equity Curve |
| **Analytics** | GET | `/analytics/drawdown` | Biểu đồ Max Drawdown |
| **Analytics** | GET | `/analytics/export/csv` | Download CSV (dùng axios blob) |
| **AI Agent** | GET | `/bots` | Danh sách bot |
| **AI Agent** | POST | `/bots` | Tạo bot mới |
| **AI Agent** | GET | `/bots/stats` | Stats tổng hợp toàn bộ bot |
| **AI Agent** | GET | `/bots/:id` | Chi tiết bot |
| **AI Agent** | PUT | `/bots/:id` | Cập nhật cấu hình |
| **AI Agent** | DELETE | `/bots/:id` | Xoá (soft delete) |
| **AI Agent** | POST | `/bots/:id/start` | Khởi động bot |
| **AI Agent** | POST | `/bots/:id/pause` | Tạm dừng bot |
| **AI Agent** | POST | `/bots/:id/resume` | Tiếp tục bot |
| **AI Agent** | POST | `/bots/:id/stop` | Dừng bot |
| **AI Agent** | GET | `/bot-activity-logs` | Nhật ký hoạt động |
| **AI Intelligence** | GET | `/signals` | Danh sách tín hiệu |
| **AI Intelligence** | GET | `/signals/latest` | Tín hiệu ACTIVE mới nhất |
| **AI Intelligence** | GET | `/signals/:id` | Chi tiết tín hiệu |
| **AI Intelligence** | PATCH | `/signals/:id/ignore` | Bỏ qua tín hiệu |
| **AI Intelligence** | POST | `/trades/from-signal` | Mở lệnh từ tín hiệu |
| **Settings** | GET | `/auth/profile` _(IAM)_ | Xem hồ sơ người dùng |
| **Settings** | PATCH | `/auth/profile` _(IAM)_ | Cập nhật hồ sơ |
| **Settings** | GET | `/accounts` | Danh sách Exchange Accounts |
| **Settings** | GET | `/accounts/:id` | Chi tiết một Account |
| **Settings** | POST | `/accounts` | Tạo Exchange Account |
| **Settings** | PUT | `/accounts/:id` | Cập nhật Account |
