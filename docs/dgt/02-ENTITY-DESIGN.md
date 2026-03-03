# DGT Service - Entity Design (MVP)

**Version:** 1.1 | **Date:** 03/03/2026 | **Status:** Draft

---

## Phạm vi MVP

Phiên bản MVP gồm **9 entities** đủ cho data pipeline + paper trading:

| Group | Entities | Mục đích |
|-------|----------|---------|
| User & Account | Account, RiskProfile | Quản lý tài khoản paper + config rủi ro |
| Market Data | MarketPrice, TechnicalIndicator, MacroIndicator, SentimentSignal | Thu thập & lưu trữ data |
| Trading | Order, Trade, Position | Paper trading core |

**Entities chưa triển khai (thêm sau):**

| Entity | Khi nào thêm | Thay thế tạm |
|--------|-------------|--------------|
| ApiKey | Live trading (Binance API) | Chưa cần |
| TradingSignal | AI engine (phase 3) | Manual / rule-based |
| OrderExecution | Live trading audit | Field `executionLog` trong Order |
| RiskMetric | Đủ data lịch sử | Tính on-the-fly từ Trade/Position |
| RiskAlert | Risk monitoring loop | Log + console |
| Report | Accumulate đủ data | API aggregate trực tiếp |
| AuditLog | Compliance phase | BaseSchema `createdBy/updatedBy` |
| Notification | Push/email channels | Console log |

---

## Quy ước chung

- Tất cả entity extends `BaseSchema` → tự động có: `owner`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`, `isDeleted`, `metadata`
- Các field từ BaseSchema **không liệt kê lại** trong bảng bên dưới
- User identity lấy từ JWT (IAM service), không tạo User entity trong DGT
- Enum values dùng lowercase snake_case
- ObjectId references dùng `Types.ObjectId`
- Monetary values lưu dạng `number` (USD)
- Timestamps lưu dạng `Date`

---

## Group 1: User & Account

### 1.1 Account

Tài khoản giao dịch. MVP chỉ có paper trading.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `accountType` | enum: `live`, `paper` | Yes | `paper` | Loại tài khoản |
| `exchange` | enum: `binance`, `okx`, `bybit` | Yes | `binance` | Sàn giao dịch |
| `label` | string | No | - | Tên hiển thị |
| `balance` | number | Yes | 0 | Số dư hiện tại (USDT) |
| `initialBalance` | number | Yes | 0 | Số dư ban đầu |
| `currency` | string | Yes | `USDT` | Đơn vị tiền |
| `status` | enum: `active`, `suspended`, `closed` | Yes | `active` | Trạng thái |
| `isDefault` | boolean | Yes | false | Account mặc định |

**Indexes:** `{ 'owner.userId': 1, accountType: 1, exchange: 1 }`

---

### 1.2 RiskProfile

Cấu hình rủi ro, mỗi account 1 profile.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `accountId` | ObjectId (ref Account) | Yes | - | Link tới Account |
| `presetTemplate` | enum: `conservative`, `moderate`, `aggressive`, `custom` | Yes | `moderate` | Template |
| `riskAppetite` | enum: `low`, `medium`, `high`, `aggressive` | Yes | `medium` | Mức chấp nhận rủi ro |
| `timeHorizon` | enum: `scalp`, `intraday`, `swing`, `position` | Yes | `swing` | Khung thời gian |
| `maxPositionSizePct` | number | Yes | 15 | Max % portfolio/position (5-30) |
| `maxConcurrentPositions` | number | Yes | 3 | Max vị thế mở cùng lúc (1-5) |
| `stopLossPct` | number | Yes | 2.5 | Stop-loss % (0.5-10) |
| `takeProfitPct` | number | Yes | 5 | Take-profit % |
| `maxDailyLossPct` | number | Yes | 5 | Max loss/ngày % (2-15) |
| `riskPerTradePct` | number | Yes | 1.5 | Risk/trade % (0.5-5) |
| `minRiskRewardRatio` | number | Yes | 2 | Min R:R ratio (1-5) |
| `leverage` | number | Yes | 1 | Leverage (1-5) |
| `minConfidenceScore` | number | Yes | 60 | Min confidence % AI signal (50-90) |

**Indexes:** `{ accountId: 1 }` (unique)

---

## Group 2: Market Data (Shared)

> **Lưu ý:** Group 2 là shared data - không filter theo user. Dùng `SharedDataService<T>` (không check RBAC ownership). Workers ghi data với system context.

### 2.1 MarketPrice

Giá tài sản theo thời gian. Write-heavy, time-series.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `symbol` | string | Yes | - | e.g. `XAUUSD`, `PAXGUSDT`, `XAUTUSD` |
| `source` | enum: `goldapi`, `yahoo`, `binance_spot`, `binance_futures`, `okx`, `bitfinex`, `bytetree` | Yes | - | Nguồn |
| `timeframe` | enum: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w` | Yes | - | Khung thời gian |
| `open` | number | No | - | Giá mở |
| `high` | number | No | - | Giá cao nhất |
| `low` | number | No | - | Giá thấp nhất |
| `close` | number | Yes | - | Giá đóng / giá hiện tại |
| `volume` | number | No | 0 | Volume |
| `timestamp` | Date | Yes | - | Thời điểm |
| `extra` | object | No | - | Data bổ sung tùy source |

`extra` examples:
- GoldAPI: `{ change: -5.2, changePct: -0.22 }`
- Binance Spot: `{ vwap: 3125.5, quoteVolume: 12500000, bidAskSpreadPct: 0.03 }`
- Binance Futures: `{ markPrice: 3120, indexPrice: 3118, fundingRate: 0.0001 }`
- ByteTree: `{ etfFlowOz7d: 15000, etfAumUsd: 230000000000 }`

**Indexes:**
- `{ symbol: 1, source: 1, timeframe: 1, timestamp: -1 }` (compound, query chính)
- `{ timestamp: 1 }` (TTL index - giữ 1 năm)

---

### 2.2 TechnicalIndicator

Chỉ số kỹ thuật tính từ MarketPrice.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `symbol` | string | Yes | - | e.g. `XAUUSD` |
| `timeframe` | enum: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w` | Yes | - | Khung thời gian |
| `timestamp` | Date | Yes | - | Thời điểm |
| `rsi14` | number | No | - | RSI 14 kỳ |
| `macdLine` | number | No | - | MACD Line (EMA12 - EMA26) |
| `macdSignal` | number | No | - | MACD Signal (EMA9 of MACD) |
| `macdHistogram` | number | No | - | MACD Histogram |
| `ema9` | number | No | - | EMA 9 kỳ |
| `ema20` | number | No | - | EMA 20 kỳ |
| `ema50` | number | No | - | EMA 50 kỳ |
| `ema200` | number | No | - | EMA 200 kỳ |
| `sma20` | number | No | - | SMA 20 kỳ |
| `bbUpper` | number | No | - | Bollinger Band Upper |
| `bbMiddle` | number | No | - | Bollinger Band Middle |
| `bbLower` | number | No | - | Bollinger Band Lower |
| `atr14` | number | No | - | ATR 14 kỳ (USD) |
| `atr14Pct` | number | No | - | ATR 14 kỳ (%) |
| `volumeRatio` | number | No | - | Volume / Avg Volume |
| `hv30d` | number | No | - | Historical Volatility 30d (annualized %) |

**Indexes:** `{ symbol: 1, timeframe: 1, timestamp: -1 }`

---

### 2.3 MacroIndicator

Dữ liệu kinh tế vĩ mô từ FRED.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `seriesId` | string | Yes | - | FRED series ID (e.g. `FEDFUNDS`, `CPIAUCSL`) |
| `name` | string | Yes | - | Tên chỉ số |
| `value` | number | Yes | - | Giá trị |
| `unit` | string | Yes | - | Đơn vị (%, index, USD billion) |
| `timestamp` | Date | Yes | - | Ngày dữ liệu |
| `releaseDate` | Date | No | - | Ngày phát hành chính thức |
| `source` | string | Yes | `fred` | Nguồn |
| `frequency` | enum: `daily`, `weekly`, `monthly`, `quarterly` | Yes | - | Tần suất |

**Indexes:** `{ seriesId: 1, timestamp: -1 }` (compound, unique)

---

### 2.4 SentimentSignal

Tín hiệu cảm xúc thị trường.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `timestamp` | Date | Yes | - | Thời điểm |
| `source` | enum: `newsapi`, `bytetree`, `binance_futures`, `llm_analysis` | Yes | - | Nguồn |
| `newsSentimentMean` | number | No | - | Sentiment trung bình (-1.0 đến +1.0) |
| `geopoliticalRiskScore` | number | No | - | Rủi ro địa chính trị (0-100) |
| `eventImpactLevel` | enum: `low`, `medium`, `high` | No | - | Mức ảnh hưởng |
| `etfFlow7dOz` | number | No | - | ETF gold flow 7 ngày (oz) |
| `etfAumUsd` | number | No | - | Tổng AUM ETF vàng (USD) |
| `fundingRateAnnualized` | number | No | - | Funding rate annualized (%) |
| `longShortRatio` | number | No | - | Long/Short ratio |
| `openInterestUsd` | number | No | - | Open Interest (USD) |
| `keyEvents` | array of string | No | - | Top sự kiện |
| `analysisSummary` | string | No | - | Tóm tắt từ LLM |

**Indexes:** `{ source: 1, timestamp: -1 }`

---

## Group 3: Trading (Paper Trading)

### 3.1 Order

Lệnh giao dịch. MVP chỉ paper trading.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `accountId` | ObjectId (ref Account) | Yes | - | Tài khoản |
| `symbol` | string | Yes | - | e.g. `PAXGUSDT` |
| `side` | enum: `buy`, `sell` | Yes | - | Chiều lệnh |
| `orderType` | enum: `market`, `limit`, `stop_limit` | Yes | - | Loại lệnh |
| `quantity` | number | Yes | - | Số lượng |
| `price` | number | No | - | Giá đặt (limit/stop) |
| `stopLossPrice` | number | No | - | SL đi kèm |
| `takeProfitPrice` | number | No | - | TP đi kèm |
| `status` | enum: `pending`, `filled`, `cancelled`, `rejected` | Yes | `pending` | Trạng thái |
| `filledQuantity` | number | No | 0 | Đã khớp |
| `averageFilledPrice` | number | No | - | Giá khớp trung bình |
| `exchange` | string | Yes | `paper` | Sàn thực thi |
| `source` | enum: `manual`, `paper` | Yes | `paper` | Nguồn lệnh |
| `filledAt` | Date | No | - | Thời điểm khớp |
| `cancelledAt` | Date | No | - | Thời điểm huỷ |
| `rejectionReason` | string | No | - | Lý do từ chối |

**Indexes:** `{ accountId: 1, status: 1, createdAt: -1 }`

---

### 3.2 Trade

Giao dịch đã khớp.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `accountId` | ObjectId (ref Account) | Yes | - | Tài khoản |
| `orderId` | ObjectId (ref Order) | Yes | - | Lệnh gốc |
| `symbol` | string | Yes | - | Symbol |
| `side` | enum: `buy`, `sell` | Yes | - | Chiều |
| `filledPrice` | number | Yes | - | Giá khớp |
| `filledQuantity` | number | Yes | - | Số lượng khớp |
| `notionalUsd` | number | Yes | - | Giá trị (USD) |
| `fees` | number | No | 0 | Phí giao dịch |
| `executedAt` | Date | Yes | - | Thời điểm khớp |

**Indexes:** `{ accountId: 1, executedAt: -1 }`

---

### 3.3 Position

Vị thế đang mở.

| Field | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `accountId` | ObjectId (ref Account) | Yes | - | Tài khoản |
| `symbol` | string | Yes | - | Symbol |
| `side` | enum: `long`, `short` | Yes | - | Chiều vị thế |
| `entryPrice` | number | Yes | - | Giá vào |
| `quantity` | number | Yes | - | Số lượng |
| `notionalUsd` | number | Yes | - | Giá trị ban đầu (USD) |
| `currentPrice` | number | No | - | Giá hiện tại |
| `unrealizedPnl` | number | No | 0 | P&L chưa thực hiện |
| `unrealizedPnlPct` | number | No | 0 | P&L % |
| `stopLossPrice` | number | No | - | SL hiện tại |
| `takeProfitPrice` | number | No | - | TP hiện tại |
| `leverage` | number | Yes | 1 | Đòn bẩy |
| `status` | enum: `open`, `closed` | Yes | `open` | Trạng thái |
| `openedAt` | Date | Yes | - | Thời điểm mở |
| `closedAt` | Date | No | - | Thời điểm đóng |
| `realizedPnl` | number | No | - | P&L khi đóng |
| `closeReason` | enum: `manual`, `stop_loss`, `take_profit` | No | - | Lý do đóng |

**Indexes:**
- `{ accountId: 1, status: 1 }` (query vị thế đang mở)
- `{ accountId: 1, closedAt: -1 }` (lịch sử)

---

## Entity Relationship Summary

```
Account (1) ──── (1) RiskProfile
   │
   ├──── (*) Order ──── (*) Trade
   │
   └──── (*) Position

Shared (no user ownership):
   MarketPrice
   TechnicalIndicator
   MacroIndicator
   SentimentSignal
```

---

## Shared Data Pattern

Group 2 entities là **shared data** - không thuộc về user cụ thể.

Giải pháp: Tạo `SharedDataService<T>` extends từ Mongoose Model trực tiếp (không dùng BaseService), cung cấp:
- `insert(data)` - ghi 1 record
- `insertMany(data[])` - ghi nhiều records
- `findLatest(filter)` - lấy record mới nhất
- `findByRange(filter, from, to)` - lấy theo khoảng thời gian
- `upsert(filter, data)` - tạo hoặc cập nhật

Workers ghi data với system context (không cần JWT).

---

*Tài liệu liên quan: [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | [03-DATA-INGESTION-FLOW.md](03-DATA-INGESTION-FLOW.md)*
