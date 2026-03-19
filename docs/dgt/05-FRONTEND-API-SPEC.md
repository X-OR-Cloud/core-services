# DGT Frontend API Specification

> **Version**: 5.0.0 | **Last Updated**: 2026-03-19
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
| 2 | [Dashboard](#2-dashboard) | Portfolio, Price Cards, Portfolio History, AI Signal, AI Prediction, Market Status, Macro Context, Market Indicators, AI Activity Feed |
| 3 | [Analytics](#3-analytics) | Summary, Open Positions, Trade History, PnL Chart, Equity Curve, Drawdown, Portfolio Performance, Asset Performance, CSV Export |
| 4 | [AI Agent](#4-ai-agent) | CRUD Bot, Controls, Stats, Stop All, Risk Profile Presets, Activity Logs |
| 5 | [AI Intelligence](#5-ai-intelligence) | Signals, Execute Trade |
| 6 | [Insights](#6-insights) | Risk Score, Trade Gate, Macro Feed, Calendar, Monetary, Liquidity, Technical Indicators, Sentiment Volatility, Liquidity Heatmap, Advanced Metrics |
| 7 | [Settings](#7-settings) | Profile, Exchange Accounts, Test Connection |
| 8 | [Global](#8-global) | Error format, Pagination |

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
| `symbols` | `string` | `PAXGUSDT,XAUTUSDT,XAUUSD` | Danh sách symbols cách nhau dấu phẩy |
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
| `symbol` | `string` | `PAXGUSDT` | `"PAXGUSDT"`, `"XAUTUSDT"` |

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

### 2.5 AI Prediction Widget

**Mục đích**: Alias của `ai-signal` — cùng data, route riêng cho FE.

```
GET /dashboard/ai-prediction
```

**Query Parameters**: Giống 2.4 (`symbol`, `timeframe`)

**Response 200**: Giống 2.4.

---

### 2.7 Market Status Widget

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

### 2.8 Macro Context Widget

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

### 2.9 Market Indicators Widget

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

### 2.10 AI Activity Feed Widget

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
| `agent` | `"TREND"` (buy/sell), `"NEURAL"` (info), `"RISK"` (warning/error) |
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

### 3.7 Portfolio Performance

**Mục đích**: Equity curve tổng hợp kèm summary stats — dùng cho tab Performance của trang Analytics.

```
GET /analytics/portfolio-performance
```

**Query Parameters**:

| Param | Type | Default | Enum |
|-------|------|---------|------|
| `range` | `string` | `7D` | `"24H"`, `"7D"`, `"30D"`, `"90D"`, `"ALL"` |
| `accountId` | `string` | _(default account)_ | MongoDB ObjectId |

> ⚠️ Range dùng chữ HOA (`7D`), khác với các endpoint Analytics khác dùng chữ thường (`7d`).

**Response 200** (có data):
```json
{
  "range": "7D",
  "currency": "USDT",
  "summary": {
    "startValue": 10000.00,
    "endValue": 12450.75,
    "changeUsd": 2450.75,
    "changePct": 24.51,
    "isPositive": true,
    "peakValue": 13000.00,
    "troughValue": 9800.00
  },
  "series": [
    { "timestamp": "2026-03-13T00:00:00.000Z", "value": 10000.00 },
    { "timestamp": "2026-03-19T00:00:00.000Z", "value": 12450.75 }
  ],
  "updatedAt": "2026-03-19T08:00:00Z"
}
```

**Response 200** (chưa có snapshot):
```json
{
  "range": "7D",
  "currency": "USDT",
  "summary": { "startValue": 0, "endValue": 0, "changeUsd": 0, "changePct": 0, "isPositive": true, "peakValue": 0, "troughValue": 0 },
  "series": [],
  "updatedAt": "2026-03-19T08:00:00Z"
}
```

> Data từ `PortfolioSnapshot`. `series: []` nếu account mới chưa có snapshot.

---

### 3.8 Asset Performance

**Mục đích**: Breakdown danh mục theo từng asset — phân bổ + PnL từng tài sản.

```
GET /analytics/asset-performance
```

**Query Parameters**:

| Param | Type | Default | Enum |
|-------|------|---------|------|
| `range` | `string` | `7D` | `"24H"`, `"7D"`, `"30D"`, `"90D"`, `"ALL"` |
| `accountId` | `string` | _(default account)_ | MongoDB ObjectId |

**Response 200**:
```json
{
  "range": "7D",
  "currency": "USDT",
  "totalValue": 12450.75,
  "assets": [
    {
      "symbol": "PAXGUSDT",
      "quantity": 1.0125,
      "priceUsd": 5184.39,
      "valueUsd": 5249.19,
      "allocationPct": 42.2,
      "changePct": 1.67,
      "changeUsd": 85.49,
      "isPositive": true,
      "series": []
    },
    {
      "symbol": "USDT",
      "quantity": 7200.00,
      "priceUsd": 1,
      "valueUsd": 7200.00,
      "allocationPct": 57.8,
      "changePct": 0,
      "changeUsd": 0,
      "isPositive": true,
      "series": []
    }
  ],
  "updatedAt": "2026-03-19T08:00:00Z"
}
```

| Field | Notes |
|-------|-------|
| `assets` | Mảng gồm các position đang mở (nhóm theo symbol) + 1 entry cash (currency của account) |
| `series` | Luôn `[]` — không có per-asset historical snapshot |
| `allocationPct` | % giá trị / tổng danh mục |

---

### 3.9 Export Trade History (CSV)

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

### 4.8 Dừng tất cả Bot

**Mục đích**: Stop toàn bộ bot đang `RUNNING` hoặc `PAUSED` của user hiện tại.

```
POST /bots/stop-all
```

**Body**: _(không cần)_

**Response 200**:
```json
{
  "stoppedCount": 2,
  "stoppedBotIds": ["69a1b2c3...", "69a1b2c4..."]
}
```

> `stoppedCount: 0` nếu không có bot nào đang chạy — không phải lỗi.

---

### 4.9 Risk Profile Presets

**Mục đích**: Lấy danh sách preset cấu hình rủi ro để FE pre-fill form tạo bot.

```
GET /bots/risk-profiles
```

**Response 200**:
```json
[
  {
    "id": "conservative",
    "label": "Conservative",
    "description": "Low risk, small positions, tight stop-loss",
    "stopLoss": 1.5,
    "takeProfit": 3.0,
    "maxDrawdownLimit": 5,
    "dailyStopLossUSD": 200,
    "minConfidenceScore": 80
  },
  {
    "id": "balanced",
    "label": "Balanced",
    "description": "Moderate risk, balanced reward/risk ratio",
    "stopLoss": 2.5,
    "takeProfit": 5.0,
    "maxDrawdownLimit": 10,
    "dailyStopLossUSD": 500,
    "minConfidenceScore": 70
  },
  {
    "id": "aggressive",
    "label": "Aggressive",
    "description": "Higher risk tolerance, larger position sizing",
    "stopLoss": 4.0,
    "takeProfit": 8.0,
    "maxDrawdownLimit": 15,
    "dailyStopLossUSD": 1000,
    "minConfidenceScore": 60
  }
]
```

> Static data — không cần auth context, nhưng vẫn yêu cầu JWT để nhất quán.

---

### 4.10 Activity Logs

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
| `keyFactors` | `{ factor: string; weight: string }[]` | Các yếu tố chính ảnh hưởng tín hiệu |
| `indicatorsUsed` | `string[]` | Danh sách indicators đã dùng |
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

## 6. Insights

> Base: **DGT** · Route FE: `/insights`
>
> Tất cả endpoints đều read-only, aggregate từ data có sẵn — không filter theo userId. Cần JWT.

---

### 6.1 Macro Risk Score

**Mục đích**: Risk score tổng thể dựa trên VIX — hiển thị trên header của trang Insights.

```
GET /insights/macro/risk-score
```

**Response 200**:
```json
{
  "riskScore": 37,
  "riskLabel": "MEDIUM RISK",
  "vix": 18.5,
  "vixChange24h": 2.15,
  "note": "Volatility moderate. Standard position sizing recommended.",
  "updatedAt": "2026-03-19T08:00:00Z"
}
```

| Field | Notes |
|-------|-------|
| `riskScore` | 0–100. Tính từ VIX: `min(100, round((vix / 50) × 100))` |
| `riskLabel` | `"LOW RISK"` (≤33), `"MEDIUM RISK"` (34–66), `"HIGH RISK"` (>66) |
| `vix` | Giá trị VIX mới nhất. `null` nếu chưa có data |
| `vixChange24h` | % thay đổi so với record VIX trước đó. `null` nếu không đủ data |
| `note` | Gợi ý giao dịch theo mức risk |

---

### 6.2 Trade Gate

**Mục đích**: Trạng thái cổng giao dịch — OPEN hay BLOCKED dựa trên risk macro.

```
GET /insights/macro/trade-gate
```

**Response 200** (OPEN):
```json
{
  "status": "OPEN",
  "reason": null,
  "nextEvent": {
    "name": "Federal Funds Rate",
    "date": "2026-03-20",
    "window": null,
    "inDays": 1
  },
  "updatedAt": "2026-03-19T08:00:00Z"
}
```

**Response 200** (BLOCKED):
```json
{
  "status": "BLOCKED",
  "reason": "VIX at 42.5 — high market stress detected.",
  "nextEvent": null,
  "updatedAt": "2026-03-19T08:00:00Z"
}
```

| Field | Notes |
|-------|-------|
| `status` | `"OPEN"` hoặc `"BLOCKED"`. BLOCKED khi macroRiskScore > 75 (VIX > ~37.5) |
| `reason` | `string` khi BLOCKED, `null` khi OPEN |
| `nextEvent.name` | Tên sự kiện macro sắp tới (từ `MacroIndicator.releaseDate`) |
| `nextEvent.date` | Ngày phát hành `YYYY-MM-DD` |
| `nextEvent.window` | Luôn `null` (chưa có data window) |
| `nextEvent.inDays` | Số ngày đến sự kiện (làm tròn) |

---

### 6.3 Macro Feed

**Mục đích**: Latest macro indicators + key economic events từ FRED và SentimentSignal.

```
GET /insights/macro/feed
```

**Response 200**:
```json
{
  "indicators": [
    { "seriesId": "FEDFUNDS", "name": "Federal Funds Rate", "value": 5.25, "unit": "%", "timestamp": "2026-03-17T00:00:00Z", "source": "fred", "frequency": "daily" }
  ],
  "feed": [
    { "timestamp": "2026-03-15T00:00:00Z", "source": "bytetree", "event": "ETF inflows surge +12oz", "summary": null }
  ],
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

---

### 6.4 Macro Calendar

**Mục đích**: Lịch phát hành dữ liệu kinh tế sắp tới với impact level.

```
GET /insights/macro/calendar
```

**Response 200**:
```json
{
  "data": [
    {
      "id": "FEDFUNDS-2026-03-20",
      "event": "Federal Funds Rate",
      "scheduledAt": "2026-03-20T18:00:00.000Z",
      "forecast": null,
      "actual": null,
      "impactDots": 3,
      "beat": null
    }
  ],
  "updatedAt": "2026-03-19T08:00:00Z"
}
```

| Field | Notes |
|-------|-------|
| `id` | Format `{seriesId}-{YYYY-MM-DD}` |
| `scheduledAt` | `releaseDate` từ MacroIndicator. `null` nếu không có |
| `forecast` | Giá trị dự báo. `null` nếu chưa có |
| `actual` | Giá trị thực tế — chỉ có sau khi `releaseDate` đã qua. `null` nếu chưa release |
| `impactDots` | `1` (low), `2` (medium), `3` (high) |
| `beat` | Luôn `null` (chưa implement) |

> Chỉ hiển thị events có `releaseDate` trong tương lai, sắp xếp gần nhất trước. Tối đa 20 events.

---

### 6.5 Monetary Policy

**Mục đích**: Tổng hợp chính sách tiền tệ — Fed Funds, Real Yield, Yield Curve.

```
GET /insights/macro/monetary
```

**Response 200**:
```json
{
  "stance": "RESTRICTIVE",
  "fedFundsRate": 5.25,
  "realYield10y": 1.85,
  "yieldCurveSpread": -0.45,
  "indicators": [
    { "seriesId": "FEDFUNDS", "name": "Federal Funds Rate", "value": 5.25, "unit": "%", "timestamp": "2026-03-01T00:00:00Z", "frequency": "monthly" }
  ],
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

| Field | Enum |
|-------|------|
| `stance` | `"RESTRICTIVE"` (>5%), `"NEUTRAL"` (3–5%), `"ACCOMMODATIVE"` (<3%) |

> Series IDs dùng: FEDFUNDS (fallback DFF), DFII10, T10Y2Y.

---

### 6.6 Gold Liquidity

**Mục đích**: DXY + ETF flows + Futures funding rate.

```
GET /insights/macro/liquidity
```

**Response 200**:
```json
{
  "dxy": { "value": 104.2, "signal": "BEARISH_GOLD", "timestamp": "2026-03-17T00:00:00Z" },
  "etfFlows": { "flow7dOz": 12500.5, "aumUsd": 55000000000, "timestamp": "2026-03-17T00:00:00Z" },
  "futures": { "fundingRateAnnualized": 8.4, "longShortRatio": 1.35, "openInterestUsd": 980000000, "timestamp": "2026-03-18T06:00:00Z" },
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

| Field | Enum / Notes |
|-------|------|
| `dxy.signal` | `"BULLISH_GOLD"` (DXY<100), `"NEUTRAL"` (100–105), `"BEARISH_GOLD"` (DXY>105), `"UNKNOWN"` (null) |
| `etfFlows.flow7dOz` | `null` nếu chưa có data ByteTree |

---

### 6.7 Technical Indicators (Full)

**Mục đích**: Snapshot đầy đủ tất cả indicators cho một symbol/timeframe.

```
GET /insights/data/technical-indicators
```

**Query Parameters**:

| Param | Default |
|-------|---------|
| `symbol` | `PAXGUSDT` |
| `timeframe` | `1h` |

**Response 200**:
```json
{
  "symbol": "PAXGUSDT",
  "timeframe": "1h",
  "data": {
    "rsi14": 62.4,
    "macd": { "line": 12.5, "signal": 10.2, "histogram": 2.3 },
    "ema": { "ema9": 5180.0, "ema20": 5160.0, "ema50": 5100.0, "ema200": 4900.0 },
    "sma20": 5155.0,
    "bollingerBands": { "upper": 5300.0, "middle": 5155.0, "lower": 5010.0 },
    "atr14": 45.2,
    "atr14Pct": 0.87,
    "volumeRatio": 1.24,
    "hv30d": 18.5
  },
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

> `data: null` nếu chưa có indicator data cho symbol/timeframe đó.

---

### 6.8 Sentiment & Volatility

**Mục đích**: News sentiment + ATR volatility + Futures data.

```
GET /insights/data/sentiment-volatility
```

**Query Parameters**: `symbol` (default: `PAXGUSDT`)

**Response 200**:
```json
{
  "symbol": "PAXGUSDT",
  "volatility": { "atr14Pct": 0.87, "hv30d": 18.5, "level": "MEDIUM" },
  "sentiment": {
    "score": 0.42,
    "label": "BULLISH",
    "geopoliticalRisk": 35.0,
    "eventImpact": "medium",
    "updatedAt": "2026-03-18T06:00:00Z"
  },
  "futures": { "fundingRateAnnualized": 8.4, "longShortRatio": 1.35, "openInterestUsd": 980000000 },
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

| Field | Enum |
|-------|------|
| `volatility.level` | `"LOW"`, `"MEDIUM"`, `"HIGH"` |
| `sentiment.label` | `"BULLISH"` (score>0.3), `"BEARISH"` (score<−0.3), `"NEUTRAL"`, `"UNKNOWN"` |
| `sentiment.eventImpact` | `"low"`, `"medium"`, `"high"` |

---

### 6.9 Liquidity Heatmap

**Mục đích**: Phân phối volume theo giờ trong 24h qua.

```
GET /insights/data/liquidity-heatmap
```

**Query Parameters**: `symbol` (default: `PAXGUSDT`)

**Response 200**:
```json
{
  "symbol": "PAXGUSDT",
  "volumeRatio": 1.24,
  "liquidityLevel": "HIGH",
  "heatmap": [
    { "hour": "2026-03-17T08", "volume": 4521.5, "avgVolume": 452.15 },
    { "hour": "2026-03-17T09", "volume": 6234.8, "avgVolume": 623.48 }
  ],
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

| Field | Enum |
|-------|------|
| `liquidityLevel` | `"LOW"` (volumeRatio<0.8), `"MEDIUM"`, `"HIGH"` (>1.5) |
| `hour` | ISO 8601 cắt tới giờ: `"2026-03-17T08"` |

---

### 6.10 Advanced Metrics

**Mục đích**: RSI zone, MACD crossover, BB width + latest AI signal summary.

```
GET /insights/data/advanced-metrics
```

**Query Parameters**: `symbol` (default: `PAXGUSDT`), `timeframe` (default: `1h`)

**Response 200**:
```json
{
  "symbol": "PAXGUSDT",
  "timeframe": "1h",
  "data": {
    "rsi": { "value": 62.4, "zone": "APPROACHING_OVERBOUGHT" },
    "macd": { "line": 12.5, "signal": 10.2, "histogram": 2.3, "crossover": "BULLISH" },
    "bollingerBands": { "upper": 5300.0, "middle": 5155.0, "lower": 5010.0, "width": 5.63 },
    "ema": { "ema20": 5160.0, "ema50": 5100.0, "ema200": 4900.0 },
    "atr": { "value": 45.2, "pct": 0.87 },
    "volumeRatio": 1.24
  },
  "signal": {
    "type": "BUY",
    "confidence": 78,
    "confidenceLabel": "high",
    "expiresAt": "2026-03-18T12:00:00Z"
  },
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

| Field | Enum |
|-------|------|
| `rsi.zone` | `"OVERSOLD"`, `"APPROACHING_OVERSOLD"`, `"NEUTRAL"`, `"APPROACHING_OVERBOUGHT"`, `"OVERBOUGHT"` |
| `macd.crossover` | `"BULLISH"` (macdLine > macdSignal), `"BEARISH"`, `"UNKNOWN"` |
| `signal` | `null` nếu không có ACTIVE signal |

---

## 7. Settings

> Route FE: `/settings`

---

### 7.1 Xem hồ sơ người dùng

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

### 7.2 Cập nhật hồ sơ

> Base: **IAM Service**

```
PATCH /auth/profile
```

**Body**: Partial — bất kỳ field nào ở 7.1 trừ `_id`, `email`, `createdAt`, `updatedAt`.

**Response 200**: Profile object đã cập nhật.

---

### 7.3 Danh sách Exchange Accounts

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
| `apiKeyStatus` | `"untested" \| "valid" \| "invalid"` | Trạng thái kiểm tra API key. Chỉ có ý nghĩa với LIVE account. |
| `notifications.discordWebhookUrl` | `string` | Webhook Discord |
| `notifications.telegramBotToken` | `string` | Bot token Telegram |
| `notifications.telegramChatId` | `string` | Chat ID Telegram |
| `notifications.telegramThreadId` | `string` | Thread ID (group có topic) |
| `notifications.enabled` | `boolean` | Bật/tắt thông báo |
| `createdAt` | `string (ISO 8601)` | — |
| `updatedAt` | `string (ISO 8601)` | — |

> ⚠️ `apiSecret` **KHÔNG BAO GIỜ** xuất hiện trong response. BE mã hoá AES-256-CBC trước khi lưu.

---

### 7.4 Chi tiết một Account

```
GET /accounts/:id
```

**Response 200**: Account object (xem 7.3).
**Response 404**: Account không tồn tại hoặc không thuộc user hiện tại.

---

### 7.5 Tạo Exchange Account mới

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

### 7.6 Cập nhật Account

```
PUT /accounts/:id
```

**Body**: Partial — bất kỳ field nào trong 7.5 (trừ `_id`, `createdAt`).

> Khi cập nhật API Key: phải truyền **đồng thời** cả `apiKey` và `apiSecret` mới.

**Response 200**: Account object đã cập nhật.

---

### 7.7 Test API Key Connection

**Mục đích**: Kiểm tra `apiKey`/`apiSecret` của LIVE account có kết nối được Binance không. Cập nhật `apiKeyStatus` sau khi test.

```
POST /accounts/:id/test-connection
```

**Body**: _(không cần)_

**Response 200** (thành công):
```json
{
  "status": "valid",
  "permissions": ["SPOT", "MARGIN"]
}
```

**Response 200** (thất bại — không throw 4xx):
```json
{
  "status": "invalid",
  "error": "Invalid API-key, IP, or permissions for action."
}
```

| Field | Enum |
|-------|------|
| `status` | `"valid"` hoặc `"invalid"` |
| `permissions` | Mảng quyền từ Binance, chỉ có khi `status: "valid"` |

> ⚠️ Chỉ dùng cho LIVE account (`accountType: "live"`). Paper account → `400 Bad Request`.
>
> Account không có `apiKey`/`apiSecret` → trả `status: "invalid"` không throw lỗi.
>
> Sau khi gọi API này, FE nên re-fetch account để lấy `apiKeyStatus` mới nhất.

---

## 8. Global

### 8.1 Error Response Format

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

### 8.2 Pagination chuẩn

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

### 8.3 Bảng tổng hợp tất cả Endpoints

| Trang | Method | Endpoint | Mô tả |
|-------|--------|----------|-------|
| **Login** | POST | `/auth/login` _(IAM)_ | Đăng nhập |
| **Login** | POST | `/auth/refresh-token` _(IAM)_ | Refresh JWT |
| **Dashboard** | GET | `/dashboard/summary` | Portfolio tổng quan |
| **Dashboard** | GET | `/dashboard/price-cards` | Giá realtime + sparkline |
| **Dashboard** | GET | `/dashboard/portfolio-history` | Biểu đồ lịch sử danh mục |
| **Dashboard** | GET | `/dashboard/ai-signal` | AI Trend Signal widget |
| **Dashboard** | GET | `/dashboard/ai-prediction` | AI Prediction widget (alias ai-signal) |
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
| **Analytics** | GET | `/analytics/portfolio-performance` | Portfolio performance + equity curve (range HOA: 7D) |
| **Analytics** | GET | `/analytics/asset-performance` | Asset breakdown — phân bổ + PnL từng tài sản |
| **Analytics** | GET | `/analytics/export/csv` | Download CSV (dùng axios blob) |
| **AI Agent** | GET | `/bots` | Danh sách bot |
| **AI Agent** | POST | `/bots` | Tạo bot mới |
| **AI Agent** | GET | `/bots/stats` | Stats tổng hợp toàn bộ bot |
| **AI Agent** | GET | `/bots/risk-profiles` | Risk profile presets (Conservative/Balanced/Aggressive) |
| **AI Agent** | POST | `/bots/stop-all` | Dừng tất cả bot đang chạy |
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
| **Insights** | GET | `/insights/macro/risk-score` | Risk score dựa trên VIX (0–100) |
| **Insights** | GET | `/insights/macro/trade-gate` | Trade gate — OPEN/BLOCKED |
| **Insights** | GET | `/insights/macro/feed` | Macro feed — indicators + events |
| **Insights** | GET | `/insights/macro/calendar` | Lịch phát hành dữ liệu kinh tế |
| **Insights** | GET | `/insights/macro/monetary` | Chính sách tiền tệ — Fed Funds, Yield |
| **Insights** | GET | `/insights/macro/liquidity` | Gold liquidity — DXY, ETF flows, Funding |
| **Insights** | GET | `/insights/data/technical-indicators` | Full technical indicators snapshot |
| **Insights** | GET | `/insights/data/sentiment-volatility` | Sentiment + volatility tổng hợp |
| **Insights** | GET | `/insights/data/liquidity-heatmap` | Volume heatmap 24h theo giờ |
| **Insights** | GET | `/insights/data/advanced-metrics` | RSI zone, MACD crossover, BB + AI signal |
| **Settings** | GET | `/auth/profile` _(IAM)_ | Xem hồ sơ người dùng |
| **Settings** | PATCH | `/auth/profile` _(IAM)_ | Cập nhật hồ sơ |
| **Settings** | GET | `/accounts` | Danh sách Exchange Accounts |
| **Settings** | GET | `/accounts/:id` | Chi tiết một Account |
| **Settings** | POST | `/accounts` | Tạo Exchange Account |
| **Settings** | PUT | `/accounts/:id` | Cập nhật Account |
| **Settings** | POST | `/accounts/:id/test-connection` | Test API key Binance (LIVE account only) |
