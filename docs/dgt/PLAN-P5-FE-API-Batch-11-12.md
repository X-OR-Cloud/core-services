# PLAN-P5 — DGT API Batch 11 & 12 (FE Requests 2026-03-18)

**Ngày tạo:** 2026-03-18
**Nguồn:** `docs/api/11-FE-TO-BE-NEW-API-REQUESTS.md` + `docs/api/12-FE-TO-BE-BOT-RISK-FIELDS.md`
**Trạng thái:** Draft — chờ approve

---

## Tổng quan

| # | Task | Effort | Breaking Change | Module |
|---|------|--------|-----------------|--------|
| P5-1 | Market Indicators +4 fields | Thấp | Không | `dashboard` |
| P5-2 | AI Signal + `reasoning` block | Thấp | Không | `dashboard` |
| P5-3 | Macro Context + `goldOutlook` | Thấp | Không | `dashboard` |
| P5-4 | Bot schema: `riskPerTrade` + `maxPositionExposure` | Thấp | Không | `bot` |
| P5-5 | Insights: `risk-score` + `trade-gate` endpoints | Thấp | Không | `insights` |
| P5-6 | Insights calendar: chuẩn hóa response format | Thấp | Không | `insights` |
| P5-7 | Price Cards: verify XAUTUSDT + XAUUSD | Trung bình | Không | `dashboard` + collectors |
| P5-8 | Signal schema: `entry`, `takeProfit`, `stopLoss`, `macroFactors` | Cao | Không | `signal` + LLM prompt |
| P5-9 | Portfolio Performance endpoint | Trung bình | Không | `analytics` / `portfolio` |
| P5-10 | Asset Performance endpoint | Cao | Không | `analytics` / `portfolio` |

**Thứ tự implement:** P5-1 → P5-2 → P5-3 → P5-4 → P5-5 → P5-6 → P5-7 → P5-8 → P5-9 → P5-10

---

## P5-1: Market Indicators +4 fields mới

**Endpoint:** `GET /dashboard/market-indicators`
**File:** `dashboard.service.ts` — `getMarketIndicators()`

**Phân tích:**
`getMarketIndicators()` đã có `atrPct`, `rsi14`, `fearGreedIndex`, `volumeRatio` từ `TechnicalIndicator`.
Tất cả 4 fields mới đều derive được từ data sẵn có, không cần query thêm.

**Thay đổi:**
- `dashboard.service.ts`: thêm 4 fields vào return object của `getMarketIndicators()`:
  - `volatilityZone`: `atrPct < 1` → `"LOW"`, `1–2.5` → `"MEDIUM"`, `> 2.5` → `"HIGH"`
  - `sentimentLabel`: map từ `fearGreedIndex` (0–25: `"Strongly Bearish"`, 26–45: `"Bearish"`, 46–54: `"Neutral"`, 55–75: `"Bullish"`, 76–100: `"Strongly Bullish"`)
  - `sentimentScore`: bằng `fearGreedIndex`
  - `liquidityLabel`: từ `volumeRatio` (< 0.8 → `"Low"`, 0.8–1.2 → `"Medium"`, > 1.2 → `"High"`)
  - `liquidityNote`: string ngắn tương ứng (e.g. `"Strong orderbook depth"`, `"Normal trading volume"`, `"Thin liquidity"`)

**Không cần:** schema migration, query mới, DTO mới.

---

## P5-2: AI Signal + `reasoning` block

**Endpoint:** `GET /dashboard/ai-signal`
**File:** `dashboard.service.ts` — `getAiSignal()`

**Phân tích:**
Signal document đã có `keyFactors: [{ factor, weight }]` và `insight: string`.
FE chấp nhận 2 format — Format A (structured) hoặc Format B (bullets). Dùng Format A derive từ `keyFactors`.

**Logic derive:**
- Đọc `signal.keyFactors` → extract `trendStrength`, `liquidityFlow`, `volatilityRegime` nếu có
- Nếu không map được → fallback sang Format B dùng `insight` split thành bullets
- `reasoning` là optional — nếu không có signal thì không trả field này

**Thay đổi:**
- `dashboard.service.ts`: thêm helper `buildReasoning(signal)`, append `reasoning` vào return object

**Không cần:** schema migration.

---

## P5-3: Macro Context + `goldOutlook`

**Endpoint:** `GET /dashboard/macro-context`
**File:** `dashboard.service.ts` — `getMacroContext()`

**Phân tích:**
`getMacroContext()` đã đọc DXY, VIX, RealYield10y — đủ để derive `goldOutlook` theo rule-based.

**Logic rule-based (timeframe 1D):**

| Điều kiện | goldOutlook.bias |
|-----------|-----------------|
| DXY < 100 AND VIX < 20 AND RealYield < 1.5 | `BULLISH` |
| DXY > 105 OR VIX > 30 OR RealYield > 2.5 | `BEARISH` |
| Còn lại | `NEUTRAL` |

**Confidence:** từ số lượng điều kiện đồng thuận (mỗi điều kiện đóng góp ~25–33%)

**Reasons:** array string tĩnh theo điều kiện match (e.g. `"USD Index weakening"`, `"Low market stress"`, `"Real yields declining"`)

**Thay đổi:**
- `dashboard.service.ts`: thêm helper `buildGoldOutlook(dxy, vix, realYield)`, append `goldOutlook` vào return

**Không cần:** schema migration, query mới.

---

## P5-4: Bot — `riskPerTrade` + `maxPositionExposure`

**Endpoints:** `POST /bots`, `PUT /bots/:id`, `GET /bots`, `GET /bots/:id`
**Files:** `bot.schema.ts`, `bot.dto.ts`

**Thay đổi:**

**bot.schema.ts** — thêm 2 `@Prop` mới + rename field:
```
riskPerTrade: number        // optional, default: 1, range: 0.1–10
maxPositionExposure: number // optional, default: 10, range: 1–50
dailyStopLossPct: number    // RENAME từ dailyStopLossUSD → nhận % thay vì USD
```

**bot.dto.ts** — thêm vào `CreateBotDto` và `UpdateBotDto`:
```
riskPerTrade?: number       // @IsNumber, @Min(0.1), @Max(10), @IsOptional
maxPositionExposure?: number // @IsNumber, @Min(1), @Max(50), @IsOptional
dailyStopLossPct: number    // thay thế dailyStopLossUSD — @IsNumber, @Min(0.1), @Max(100)
```

> **Breaking change nhỏ:** `dailyStopLossUSD` đổi tên thành `dailyStopLossPct`, đơn vị từ USD → %.
> Cần update monitoring worker nếu có logic so sánh `dailyStopLossUSD` với `dailyLossTracking.lossUsd`.

**Không cần:** migration script (fields optional với default). Cần check `monitoring.worker.ts` nếu dùng `dailyStopLossUSD`.

---

## P5-5: Insights — `risk-score` + `trade-gate` endpoints

**Endpoints mới:**
- `GET /insights/macro/risk-score`
- `GET /insights/macro/trade-gate`

**Files:** `insights.controller.ts`, `insights-macro.service.ts`

### `/insights/macro/risk-score`

Dùng lại query VIX từ `getMacroContext()`. Logic:

```
riskScore = min(100, round((vixValue / 50) * 100))
riskLabel = riskScore > 66 ? "HIGH RISK" : riskScore > 33 ? "MEDIUM RISK" : "LOW RISK"
vixChange24h: query 2 records VIX gần nhất → tính % change
note: string ngắn generate theo riskLabel
```

Response:
```json
{
  "riskScore": 38,
  "riskLabel": "MEDIUM RISK",
  "vix": 14.5,
  "vixChange24h": -2.1,
  "note": "Volatility moderate. Standard position sizing recommended.",
  "updatedAt": "..."
}
```

### `/insights/macro/trade-gate`

Tái sử dụng logic `tradeGate` từ `getMacroContext()`. Bổ sung `nextEvent` từ calendar data.

```
status: macroRiskScore > 75 ? "BLOCKED" : "OPEN"
reason: nếu BLOCKED → lý do (VIX cao / sắp có sự kiện)
nextEvent: query MacroIndicator có releaseDate >= now, sort tăng dần, lấy 1 record
```

Response:
```json
{
  "status": "OPEN",
  "reason": null,
  "nextEvent": {
    "name": "FOMC Rate Decision",
    "date": "2026-03-18",
    "window": "14:00 UTC",
    "inDays": 0
  },
  "updatedAt": "..."
}
```

**Thay đổi:**
- `insights-macro.service.ts`: thêm `getRiskScore()`, `getTradeGate()`
- `insights.controller.ts`: thêm 2 `@Get` routes

---

## P5-6: Insights calendar — chuẩn hóa response format

**Endpoint:** `GET /insights/macro/calendar`
**File:** `insights-macro.service.ts` — `getCalendar()`

**Phân tích:**
`getCalendar()` hiện trả `{ events: [...] }` với fields khác spec FE.
FE cần: `{ data: [{ id, event, scheduledAt, forecast, actual, impactDots, beat }] }`

**Mapping:**
- `id`: `m.seriesId + "-" + releaseDate.toISOString().slice(0,10)`
- `event`: `m.name`
- `scheduledAt`: `m.releaseDate` (ISO 8601)
- `forecast`: `null` (FRED không có forecast — tạm trả null)
- `actual`: `m.value` nếu `releaseDate <= now`, `null` nếu chưa release
- `impactDots`: rule theo `seriesId` (FOMC/FEDFUNDS → 3, CPI/GDP → 3, DXY/VIX → 2, còn lại → 1)
- `beat`: `null` (chưa có previous value để compare — để null)

**Thay đổi:**
- `insights-macro.service.ts`: update `getCalendar()` response shape

---

## P5-7: Price Cards — XAUTUSDT + XAUUSD

**Endpoint:** `GET /dashboard/price-cards`

**Phân tích:**
`buildPriceCard(symbol, points)` query `MarketPrice` theo `symbol`. Nếu collector đang lưu đúng symbol key thì tự động hoạt động.

**Đã confirm:**
- `XAUTUSDT`: Bitfinex collector đang lưu đúng symbol key `XAUTUSDT` ✅
- `XAUUSD`: GoldAPI collector cần kiểm tra symbol key đang dùng

**Kịch bản:**
- `XAUTUSDT`: `buildPriceCard()` đã hoạt động ngay — không cần code thêm
- `XAUUSD`: Nếu GoldAPI lưu `XAUUSD` → hoạt động ngay. Nếu lưu khác (e.g. `XAU/USD`) → cần normalize trong collector hoặc thêm alias

**Thay đổi dự kiến:**
- Verify symbol key `XAUUSD` trong `goldapi.collector.ts`
- Nếu cần: chuẩn hóa symbol key khi lưu vào MarketPrice
- Không thay đổi dashboard logic

---

## P5-8: Signal — `entry`, `takeProfit`, `stopLoss`, `macroFactors`

**Endpoints:** `GET /signals`, `GET /signals/latest`, `GET /signals/:id`
**Files:** `signal.schema.ts`, `signal.dto.ts`, `signal-llm.collector.ts`, `signal-system.prompt.ts`

**Phân tích:**
Đây là task phức tạp nhất. AI LLM phải output thêm 4 fields trong JSON response.

### Bước 1: Schema

**signal.schema.ts** — thêm:
```
entry?: number            // Giá vào lệnh đề nghị (USD)
takeProfit?: number       // Mức chốt lời (USD)
stopLoss?: number         // Mức cắt lỗ (USD)
macroFactors?: string[]   // Macro factors ảnh hưởng signal (cho GET /signals/:id)
```
> Tất cả optional — signal cũ không bị ảnh hưởng.

### Bước 2: LLM Prompt

**signal-system.prompt.ts** — bổ sung yêu cầu output:
- Với signal BUY/SELL: phải có `entry`, `takeProfit`, `stopLoss` (số USD)
- Với mọi signal: phải có `macroFactors` array (2–4 items)
- JSON schema output cần update

### Bước 3: Collector

**signal-llm.collector.ts** — parse thêm fields từ LLM response, lưu vào document

### Bước 4: DTO

**signal.dto.ts** — `CreateSignalDto` thêm optional fields để allow manual create

**Lưu ý:**
- `insight` đã có trong schema → không cần thêm
- `macroFactors` trả đủ cho cả 3 endpoints: `GET /signals`, `GET /signals/latest`, `GET /signals/:id`

---

## P5-9: Portfolio Performance endpoint

**Endpoint mới:** `GET /portfolio/performance?range=24H|7D|30D|90D|ALL`

**Phân tích:**
`GET /dashboard/portfolio-history` đã có logic tương tự nhưng:
- Range chỉ hỗ trợ `7d/30d/90d/all` (lowercase), chưa có `24H`
- Response format khác: `{ data: [{date, totalValueUsd}] }` vs FE cần `{ series: [{timestamp, value}], summary: {...} }`

**Hướng implement:** Tạo module `portfolio` mới hoặc thêm vào `AnalyticsController`.

**Preferred:** Thêm vào `AnalyticsController` — route: `GET /analytics/portfolio-performance`.

### PortfolioSnapshot — Thêm hourly granularity

**portfolio-snapshot.schema.ts** — thêm field `granularity`:
```
granularity: 'daily' | 'hourly'   // default: 'daily'
```

**portfolio-snapshot.collector.ts** — thêm job hourly:
- Chạy mỗi giờ → lưu snapshot với `granularity: 'hourly'`
- Chỉ lưu trong 48h gần nhất (TTL hoặc cleanup job) để tránh bloat

**scheduler** — thêm job `portfolio_snapshot_hourly` (interval: 1h).

### Range → Granularity

| Range | Date từ | Collection query |
|-------|---------|-----------------|
| `24H` | now - 24h | `granularity: 'hourly'`, ~24 points |
| `7D` | now - 7d | `granularity: 'daily'`, ~7 points |
| `30D` | now - 30d | `granularity: 'daily'`, ~30 points |
| `90D` | now - 90d | `granularity: 'daily'`, ~90 points |
| `ALL` | từ đầu | `granularity: 'daily'`, tất cả |

### Response format:

```json
{
  "range": "7D",
  "currency": "USDT",
  "summary": {
    "startValue": 9800.00,
    "endValue": 10420.50,
    "changeUsd": 620.50,
    "changePct": 6.33,
    "isPositive": true
  },
  "series": [
    { "timestamp": "2026-03-11T00:00:00.000Z", "value": 9800.00 }
  ],
  "updatedAt": "..."
}
```

**Thay đổi:**
- `portfolio-snapshot.schema.ts`: thêm field `granularity`
- `portfolio-snapshot.collector.ts`: thêm hourly snapshot job
- `scheduler.processor.ts`: thêm job `portfolio_snapshot_hourly`
- `analytics.controller.ts`: thêm `GET /analytics/portfolio-performance`
- `analytics.service.ts`: thêm `getPortfolioPerformance(userId, range)`

---

## P5-10: Asset Performance endpoint

**Endpoint mới:** `GET /portfolio/assets?range=24H|7D|30D|90D|ALL`

**Phân tích:**
Phức tạp hơn P5-9 vì cần breakdown per-asset + `series[]` per asset.

Nguồn data:
- Positions (open + closed) → biết từng asset đang hold
- PortfolioSnapshot → không có per-asset breakdown (chỉ tổng)
- MarketPrice → lịch sử giá per symbol

**Giải pháp `series` per asset:**
Tính `value = quantity * priceAtTimestamp` cho từng timestamp trong range.
Cần join: `Position.quantity` với `MarketPrice` history theo symbol.

### Response format:

```json
{
  "range": "7D",
  "currency": "USDT",
  "totalValue": 10420.50,
  "assets": [
    {
      "symbol": "PAXG",
      "name": "PAX Gold",
      "quantity": 2.45,
      "priceUsd": 2980.50,
      "valueUsd": 7302.23,
      "allocationPct": 70.1,
      "changePct": 4.25,
      "changeUsd": 297.50,
      "isPositive": true,
      "series": [
        { "timestamp": "...", "value": 7004.73 }
      ]
    }
  ],
  "updatedAt": "..."
}
```

**Thay đổi:**
- `analytics.controller.ts`: thêm `GET /analytics/asset-performance`
- `analytics.service.ts`: thêm `getAssetPerformance(userId, range)`

**Note:** `series` per asset là best-effort — nếu không có đủ MarketPrice history thì trả `series: []`.
Route `GET /analytics/asset-performance` (đồng bộ convention với `/analytics/portfolio-performance`).

---

## Câu hỏi cần confirm trước khi implement

| # | Câu hỏi | Trả lời | Ảnh hưởng |
|---|---------|---------|-----------|
| 1 | Route path portfolio performance? | ✅ `/analytics/portfolio-performance` | P5-9, P5-10 |
| 2 | `dailyStopLossUSD` giữ USD hay đổi sang %? | ✅ Đổi sang % — rename thành `dailyStopLossPct` | P5-4 |
| 3 | PortfolioSnapshot cần thêm hourly snapshot cho range `24H`? | ✅ Có — thêm hourly snapshot | P5-9 |
| 4 | `GET /signals/latest` có trả `macroFactors` không? | ✅ Có — tất cả 3 endpoints trả đủ | P5-8 |
| 5 | Symbol key Bitfinex lưu là gì? | ✅ `XAUTUSDT` — đã đúng | P5-7 |

---

## Thứ tự implement đề xuất

**Sprint 1 — Không cần schema migration (deploy ngay):**
- P5-1: Market Indicators +4 fields
- P5-2: AI Signal + reasoning
- P5-3: Macro Context + goldOutlook
- P5-5: Insights risk-score + trade-gate
- P5-6: Insights calendar format fix

**Sprint 2 — Schema migration nhẹ:**
- P5-4: Bot riskPerTrade + maxPositionExposure
- P5-7: Price Cards symbol verify

**Sprint 3 — LLM prompt + Signal schema:**
- P5-8: Signal entry/tp/sl + macroFactors

**Sprint 4 — Endpoints mới:**
- P5-9: Portfolio Performance
- P5-10: Asset Performance
