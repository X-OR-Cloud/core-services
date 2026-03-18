# PLAN-P4 — DGT Pending API Implementation

**Ngày tạo:** 2026-03-18
**Scope:** 6 API requests từ FE pending list
**Trạng thái:** Draft — chờ approve

---

## Tổng quan

Triển khai các API còn thiếu theo thứ tự tăng dần effort:

| # | Task | Effort | Module thay đổi |
|---|------|--------|-----------------|
| P4-1 | `GET /dashboard/ai-prediction` alias | Low | `dashboard` |
| P4-2 | `POST /bots/stop-all` | Low | `bot` |
| P4-3 | `GET /bots/risk-profiles` (presets) | Low | `bot` |
| P4-4 | `POST /accounts/:id/test-connection` + `apiKeyStatus` | Medium | `account` |
| P4-5 | `GET /insights/macro/*` (4 endpoints) | Medium | `insights` (new module) |
| P4-6 | `GET /insights/data/*` (4 endpoints, bỏ onchain-flow) | Medium | `insights` (new module) |

---

## P4-1: `GET /dashboard/ai-prediction`

**Phân tích:** Giống 100% với `GET /dashboard/ai-signal`. FE yêu cầu route riêng.

**Thay đổi:**
- `dashboard.controller.ts`: thêm `@Get('ai-prediction')` gọi cùng `getAiSignal()`
- Query params giống hệt: `?symbol=PAXGUSDT&timeframe=4h`
- Không thay đổi service

---

## P4-2: `POST /bots/stop-all`

**Mô tả:** Stop tất cả bot đang `RUNNING` hoặc `PAUSED` của user hiện tại.

**Thay đổi:**

**`bot.service.ts`** — thêm method:
```
stopAll(context: RequestContext): Promise<{ stoppedCount: number }>
```
- Query: `{ 'owner.userId': context.userId, status: { $in: [RUNNING, PAUSED] } }`
- Gọi `transitionStatus` cho từng bot
- Trả về `{ stoppedCount: n, stoppedBotIds: [...] }`

**`bot.controller.ts`** — thêm endpoint:
```
POST /bots/stop-all
```
- Không có body
- Response: `{ stoppedCount: 2, stoppedBotIds: ['...', '...'] }`

---

## P4-3: `GET /bots/risk-profiles`

**Mô tả:** Trả về danh sách preset risk profile để FE hiển thị trong form tạo bot. Dữ liệu **static** — không cần DB.

**Thay đổi:**

**`bot.controller.ts`** — thêm endpoint:
```
GET /bots/risk-profiles
```

Response (hardcoded trong controller):
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

> Không cần `riskConfig` object block trong schema — FE dùng preset để pre-fill form `CreateBotDto`, các field riêng lẻ đã có đủ.

---

## P4-4: `POST /accounts/:id/test-connection` + `apiKeyStatus`

**Mô tả:** Cho phép user test API key Binance của account LIVE. Paper account không cần test.

### Schema change — `account.schema.ts`

Thêm field:
```typescript
@Prop({ default: 'untested', enum: ['untested', 'valid', 'invalid'] })
apiKeyStatus: string;
```

### Endpoint mới — `account.controller.ts`

```
POST /accounts/:id/test-connection
```

**Logic trong `account.service.ts`** — method `testConnection(id, context)`:
1. `findById(id, context)` — verify ownership
2. Kiểm tra `accountType === 'live'` — paper account throw `BadRequestException`
3. Gọi Binance API: `GET /api/v3/account` với signature từ `apiKey` + `apiSecret`
   - Dùng `BINANCE_USE_TESTNET` flag để chọn endpoint
4. Nếu thành công: update `apiKeyStatus = 'valid'`, trả về `{ status: 'valid', permissions: [...] }`
5. Nếu lỗi (401/403): update `apiKeyStatus = 'invalid'`, trả về `{ status: 'invalid', error: '...' }`

**Dependency:** Binance SDK đã có sẵn trong service (`BinanceService` hoặc direct HTTP call).

---

## P4-5 + P4-6: `Insights` Module (new)

### Cấu trúc module mới

```
src/modules/insights/
├── insights.module.ts
├── insights-macro.service.ts     # P4-5: /insights/macro/*
├── insights-data.service.ts      # P4-6: /insights/data/*
└── insights.controller.ts        # tất cả endpoints
```

### P4-5: `GET /insights/macro/*`

Tất cả aggregation từ `MacroIndicator` + `SentimentSignal` — không có worker riêng, query on-demand.

| Endpoint | Nguồn dữ liệu | Mô tả |
|---|---|---|
| `GET /insights/macro/feed` | `MacroIndicator` (tất cả series, 10 records gần nhất mỗi series) + `SentimentSignal.keyEvents` | News feed macro: các sự kiện kinh tế gần đây |
| `GET /insights/macro/calendar` | `MacroIndicator.releaseDate` (upcoming) | Lịch sự kiện kinh tế sắp tới (sort by releaseDate) |
| `GET /insights/macro/monetary` | `MacroIndicator` (seriesId: `FEDFUNDS`, `DFII10`, `T10Y2Y`, `DFF`) | Chính sách tiền tệ: Fed Funds, real yield, yield curve |
| `GET /insights/macro/liquidity` | `MacroIndicator` (DXY) + `SentimentSignal` (etfFlow7dOz, etfAumUsd, fundingRateAnnualized) | Gold liquidity: ETF flows, funding rate, DXY |

**Module dependencies:** inject `MacroIndicatorModel`, `SentimentSignalModel`

### P4-6: `GET /insights/data/*` (bỏ `onchain-flow`)

| Endpoint | Nguồn dữ liệu | Query params |
|---|---|---|
| `GET /insights/data/technical-indicators` | `TechnicalIndicator` | `?symbol=PAXGUSDT&timeframe=1h` |
| `GET /insights/data/sentiment-volatility` | `SentimentSignal` (sentiment) + `TechnicalIndicator.atr14Pct`, `hv30d` | `?symbol=PAXGUSDT` |
| `GET /insights/data/liquidity-heatmap` | `MarketPrice` (volume, 24 data points) + `TechnicalIndicator.volumeRatio` | `?symbol=PAXGUSDT` |
| `GET /insights/data/advanced-metrics` | `TechnicalIndicator` (RSI, MACD, BB, EMA, ATR đầy đủ) + `Signal` (latest active) | `?symbol=PAXGUSDT&timeframe=1h` |

`onchain-flow` → **Phase sau**, cần Etherscan API collector.

**Module dependencies:** inject `TechnicalIndicatorModel`, `SentimentSignalModel`, `MarketPriceModel`, `SignalModel`

### Auth

Insights module: **public market data** (no user-specific data) → `@UseGuards(JwtAuthGuard)` vẫn cần để audit, nhưng không filter theo userId.

### AppApiModule registration

Thêm `InsightsModule` vào `app-api.module.ts`.

---

## Thứ tự triển khai

```
P4-1 (5 phút) → P4-2 (15 phút) → P4-3 (10 phút)
    → P4-4 (30 phút) → P4-5 (45 phút) → P4-6 (45 phút)
```

Có thể implement từng phần và commit riêng, không phụ thuộc nhau.

---

## Files sẽ thay đổi

| File | Thay đổi |
|---|---|
| `modules/dashboard/dashboard.controller.ts` | Thêm `GET /dashboard/ai-prediction` |
| `modules/bot/bot.service.ts` | Thêm `stopAll()` |
| `modules/bot/bot.controller.ts` | Thêm `POST /bots/stop-all`, `GET /bots/risk-profiles` |
| `modules/account/account.schema.ts` | Thêm `apiKeyStatus` field |
| `modules/account/account.service.ts` | Thêm `testConnection()` |
| `modules/account/account.controller.ts` | Thêm `POST /accounts/:id/test-connection` |
| `modules/insights/` *(new)* | Module mới: 3 files |
| `app-api.module.ts` | Register `InsightsModule` |
