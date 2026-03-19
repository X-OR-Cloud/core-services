# DGT — FE API Updates Plan (Batch 11 & 12)

**Created:** 2026-03-19
**Source:** FE Requests `11-FE-TO-BE-NEW-API-REQUESTS.md` + `12-FE-TO-BE-BOT-RISK-FIELDS.md`
**Status:** Ready for implementation

---

## Summary

| ID | Group | Task | Complexity |
|----|-------|------|------------|
| A1 | Schema + DTO | Bot: `riskPerTrade` + `maxPositionExposure` | Simple |
| A2 | Schema + DTO | Signal: `entry`, `takeProfit`, `stopLoss`, `macroFactors` | Simple |
| B1 | Response field | `GET /dashboard/ai-signal` — add `reasoning` | Simple |
| B2 | Response field | `GET /dashboard/macro-context` — add `goldOutlook` | Simple |
| B3 | Response field | `GET /dashboard/market-indicators` — add 4 fields | Simple |
| B4 | Bug fix | `price-cards` symbol typo: `XAUTUSD` → `XAUTUSDT` | Simple |
| C1 | New endpoint | `GET /analytics/portfolio-performance?range=` | Medium |
| C2 | New endpoint | `GET /analytics/asset-performance?range=` | Medium |
| C3 | New endpoint | `GET /insights/macro/risk-score` | Simple |
| C4 | New endpoint | `GET /insights/macro/trade-gate` | Simple |
| D1 | Schema + collector | `MacroIndicator`: `forecast`, `actual`, `impactLevel` + update calendar | Medium |
| E1 | LLM prompt | Signal prompt: output `entry`/`tp`/`sl`/`macroFactors` | Complex |

**Recommended order:** A1 → A2 → B4 → B3 → B2 → B1 → C3 → C4 → D1 → C1 → C2 → E1

---

## Group A — Schema + DTO Changes

### A1. Bot: `riskPerTrade` + `maxPositionExposure`

**Files:**
- `src/modules/bot/bot.schema.ts`
- `src/modules/bot/bot.dto.ts`

**bot.schema.ts** — add after `minConfidenceScore`:
```typescript
@Prop({ default: 1 })
riskPerTrade: number;        // % of capital per trade, range 0.1–10

@Prop({ default: 10 })
maxPositionExposure: number; // max % of portfolio in one position, range 1–50
```

**bot.dto.ts** — add to `CreateBotDto` and `UpdateBotDto` (optional):
```typescript
@IsNumber() @Min(0.1) @Max(10) @IsOptional()
riskPerTrade?: number;       // default 1

@IsNumber() @Min(1) @Max(50) @IsOptional()
maxPositionExposure?: number; // default 10
```

**Notes:**
- Both fields have defaults → no migration needed.
- `dailyStopLossUSD` stays as-is (BE nhận USD, FE tự convert).

---

### A2. Signal: `entry`, `takeProfit`, `stopLoss`, `macroFactors`

**Files:**
- `src/modules/signal/signal.schema.ts`
- `src/modules/signal/signal.dto.ts`

**signal.schema.ts** — add before `priceAtCreation`:
```typescript
@Prop()
entry?: number;              // Suggested entry price (USD)

@Prop()
takeProfit?: number;         // Take profit target (USD)

@Prop()
stopLoss?: number;           // Stop loss level (USD)

@Prop({ type: [String] })
macroFactors?: string[];     // Macro conditions influencing the signal
```

**signal.dto.ts** — add to `CreateSignalDto`:
```typescript
@IsNumber() @IsOptional()
entry?: number;

@IsNumber() @IsOptional()
takeProfit?: number;

@IsNumber() @IsOptional()
stopLoss?: number;

@IsArray() @IsString({ each: true }) @IsOptional()
macroFactors?: string[];
```

**Notes:**
- All optional → old signals unaffected.
- `UpdateSignalDto` không cần — signals immutable sau khi create.
- Các fields được populate bởi E1. Trước khi E1 xong, fields trả về `undefined`.

---

## Group B — Response Field Additions

### B1. `GET /dashboard/ai-signal` — add `reasoning`

**File:** `src/modules/dashboard/dashboard.service.ts`
**Method:** `getAiSignal()`

Thêm private helper `buildReasoning(signal)`, append `reasoning` vào return khi có signal:

```typescript
// Format A — structured (khi keyFactors có data)
const trendFactor = signal.keyFactors?.find(f => /trend|macd|ema|momentum/i.test(f.factor));
const liquidityFactor = signal.keyFactors?.find(f => /volume|flow|liquidity|etf/i.test(f.factor));
const volatilityFactor = signal.keyFactors?.find(f => /atr|volatility|vix|bb/i.test(f.factor));

if (trendFactor || liquidityFactor || volatilityFactor) {
  reasoning = {
    trendStrength: trendFactor?.weight || 'Moderate',
    liquidityFlow: liquidityFactor?.weight || 'Neutral',
    volatilityRegime: volatilityFactor?.weight || 'Stable',
  };
} else {
  // Format B — fallback to bullets from insight
  reasoning = { bullets: [signal.insight].filter(Boolean) };
}
```

**Notes:**
- `reasoning` bị omit khi không có signal (neutral fallback response).

---

### B2. `GET /dashboard/macro-context` — add `goldOutlook`

**File:** `src/modules/dashboard/dashboard.service.ts`
**Method:** `getMacroContext()`

DXY, VIX, realYield đã được query — thêm rule-based logic:

```typescript
private buildGoldOutlook(dxyValue, vixValue, realYieldValue) {
  const bullishReasons: string[] = [];
  const bearishReasons: string[] = [];

  if (dxyValue !== null) {
    if (dxyValue < 100) bullishReasons.push('USD Index weakening — gold demand rising');
    else if (dxyValue > 105) bearishReasons.push('Strong USD — headwind for gold');
  }
  if (vixValue !== null) {
    if (vixValue < 20) bullishReasons.push('Low market stress — favorable conditions');
    else if (vixValue > 30) bearishReasons.push('High market stress — flight to USD');
  }
  if (realYieldValue !== null) {
    if (realYieldValue < 1.5) bullishReasons.push('Real yields declining — gold attractive');
    else if (realYieldValue > 2.5) bearishReasons.push('Elevated real yields — gold less attractive');
  }

  const b = bullishReasons.length, br = bearishReasons.length;
  if (b === 0 && br === 0) return null;
  const bias = b > br ? 'BULLISH' : br > b ? 'BEARISH' : 'NEUTRAL';
  const confidence = Math.round((Math.max(b, br) / 3) * 100);
  const reasons = b >= br ? bullishReasons : bearishReasons;
  return { bias, confidence, timeframe: '1D', reasons };
}
```

Append `goldOutlook: this.buildGoldOutlook(dxy?.value, vix?.value, realYield?.value)` vào return object.

---

### B3. `GET /dashboard/market-indicators` — add 4 fields

**File:** `src/modules/dashboard/dashboard.service.ts`
**Method:** `getMarketIndicators()`

Append vào return, dùng các biến local `atrPct`, `fearGreedIndex`, `ti?.volumeRatio`:

| Field | Logic |
|-------|-------|
| `volatilityZone` | `atrPct < 1` → `"LOW"`, `1–2.5` → `"MEDIUM"`, `> 2.5` → `"HIGH"` |
| `sentimentLabel` | `fearGreedIndex`: `0–25`→`"Strongly Bearish"`, `26–45`→`"Bearish"`, `46–54`→`"Neutral"`, `55–75`→`"Bullish"`, `76–100`→`"Strongly Bullish"` |
| `sentimentScore` | `fearGreedIndex` (alias) |
| `liquidityLabel` | `volumeRatio > 1.2`→`"High"`, `0.8–1.2`→`"Medium"`, `< 0.8`→`"Low"` |
| `liquidityNote` | `volumeRatio > 1.2`→`"Strong orderbook depth"`, `0.8–1.2`→`"Normal trading volume"`, `< 0.8`→`"Thin liquidity"` |

---

### B4. Fix `price-cards` symbol typo

**File:** `src/modules/dashboard/dashboard.controller.ts`

```typescript
// Before
@Query('symbols') symbols = 'PAXGUSDT,XAUTUSD,XAUUSD',

// After
@Query('symbols') symbols = 'PAXGUSDT,XAUTUSDT,XAUUSD',
```

**Notes:** Cần verify `goldapi.collector.ts` lưu symbol là `XAUUSD` (không phải `XAU/USD`).

---

## Group C — New Endpoints

### C1. `GET /analytics/portfolio-performance?range=`

**Query param:** `range: 24H | 7D | 30D | 90D | ALL`

**Response shape:**
```json
{
  "range": "7D",
  "currency": "USDT",
  "summary": {
    "startValue": 9800.00,
    "endValue": 10420.50,
    "changeUsd": 620.50,
    "changePct": 6.33,
    "isPositive": true,
    "peakValue": 10500.00,
    "troughValue": 9750.00
  },
  "series": [{ "timestamp": "...", "value": 9800.00 }],
  "updatedAt": "..."
}
```

**Files to modify:**

1. **`portfolio-snapshot.schema.ts`** — add optional field:
   ```typescript
   @Prop({ default: 'daily' })
   granularity: 'daily' | 'hourly';
   ```

2. **`portfolio-snapshot.service.ts`** — add `findByRangeAndGranularity(accountId, from, to, granularity)`.

3. **`portfolio-snapshot.collector.ts`** — add `collectHourly(accountId)`, saves with `granularity: 'hourly'`. Hour boundary: `setUTCMinutes(0,0,0)`. TTL: 48h.

4. **`scheduler.processor.ts`** — register job `portfolio_snapshot_hourly` (every 1h).

5. **`analytics.service.ts`** — add `getPortfolioPerformance(userId, range, accountId?)`:
   - `24H` → hourly snapshots (now - 24h)
   - `7D/30D/90D/ALL` → daily snapshots
   - Build `series[]`, compute `summary`
   - Fallback: no data → `{ series: [], summary với values = 0 }`

6. **`analytics.controller.ts`** — add route:
   ```typescript
   @Get('portfolio-performance')
   @ApiQuery({ name: 'range', required: false, enum: ['24H','7D','30D','90D','ALL'] })
   getPortfolioPerformance(@CurrentUser() ctx, @Query('range') range = '7D', @Query('accountId') accountId?)
   ```

**Notes:**
- Existing unique index `{ accountId, date }` — hourly snapshots dùng `date` set đến giờ boundary.
- Thêm TTL index cho hourly: `expireAfterSeconds: 172800` (48h).

---

### C2. `GET /analytics/asset-performance?range=`

**Query param:** `range: 24H | 7D | 30D | 90D | ALL`

**Response shape:**
```json
{
  "range": "7D",
  "currency": "USDT",
  "totalValue": 10420.50,
  "assets": [
    {
      "symbol": "PAXGUSDT",
      "quantity": 2.45,
      "priceUsd": 2980.50,
      "valueUsd": 7302.23,
      "allocationPct": 70.1,
      "changePct": 4.25,
      "changeUsd": 297.50,
      "isPositive": true,
      "series": []
    }
  ],
  "updatedAt": "..."
}
```

**Files to modify:**

1. **`analytics.module.ts`** — import `MarketPriceModule` (chưa có).

2. **`analytics.service.ts`** — add `getAssetPerformance(userId, range, accountId?)`:
   - Query open `Position` records → group by `symbol`
   - Query latest `MarketPrice` per symbol
   - Compute `valueUsd`, `allocationPct`, `changePct` (từ `unrealizedPnlPct`), `changeUsd`
   - Thêm cash entry: `symbol: account.currency || 'USDT'`
   - `series: []` — không có per-asset historical data

3. **`analytics.controller.ts`** — add route:
   ```typescript
   @Get('asset-performance')
   @ApiQuery({ name: 'range', required: false, enum: ['24H','7D','30D','90D','ALL'] })
   getAssetPerformance(@CurrentUser() ctx, @Query('range') range = '7D', @Query('accountId') accountId?)
   ```

**Notes:** `range` accepted but not used (reserved for future `series` support).

---

### C3. `GET /insights/macro/risk-score`

**File:** `src/modules/insights/insights-macro.service.ts`

**Logic:**
```typescript
async getRiskScore() {
  const vixRecords = await this.macroModel
    .find({ seriesId: 'VIXCLS' }).sort({ timestamp: -1 }).limit(2).lean().exec();

  const vixValue = vixRecords[0]?.value ?? null;
  const vixPrev = vixRecords[1]?.value ?? vixValue;
  const vixChange24h = vixValue && vixPrev
    ? Math.round(((vixValue - vixPrev) / vixPrev) * 10000) / 100
    : null;

  const riskScore = vixValue !== null ? Math.min(100, Math.round((vixValue / 50) * 100)) : 0;
  const riskLabel = riskScore > 66 ? 'HIGH RISK' : riskScore > 33 ? 'MEDIUM RISK' : 'LOW RISK';
  const note = riskScore > 66
    ? 'Elevated volatility. Reduce position size or stay out.'
    : riskScore > 33
    ? 'Volatility moderate. Standard position sizing recommended.'
    : 'Low volatility environment. Favorable conditions for trading.';

  return { riskScore, riskLabel, vix: vixValue, vixChange24h, note, updatedAt: new Date() };
}
```

**Route** in `insights.controller.ts`:
```typescript
@Get('macro/risk-score')
@ApiOperation({ summary: 'Macro risk score based on VIX — LOW / MEDIUM / HIGH' })
getRiskScore() { return this.macroService.getRiskScore(); }
```

---

### C4. `GET /insights/macro/trade-gate`

**File:** `src/modules/insights/insights-macro.service.ts`

**Logic:**
```typescript
async getTradeGate() {
  const vix = await this.macroModel
    .findOne({ seriesId: 'VIXCLS' }).sort({ timestamp: -1 }).lean().exec();

  const vixValue = vix?.value ?? 0;
  const macroRiskScore = Math.min(100, Math.round((vixValue / 50) * 100));
  const status = macroRiskScore > 75 ? 'BLOCKED' : 'OPEN';
  const reason = status === 'BLOCKED'
    ? `VIX at ${vixValue} — high market stress detected.`
    : null;

  const nextEventDoc = await this.macroModel
    .findOne({ releaseDate: { $gte: new Date() } })
    .sort({ releaseDate: 1 }).lean().exec();

  const nextEvent = nextEventDoc ? {
    name: nextEventDoc.name,
    date: nextEventDoc.releaseDate!.toISOString().slice(0, 10),
    window: null,
    inDays: Math.round((nextEventDoc.releaseDate!.getTime() - Date.now()) / 86400000),
  } : null;

  return { status, reason, nextEvent, updatedAt: new Date() };
}
```

**Route** in `insights.controller.ts`:
```typescript
@Get('macro/trade-gate')
@ApiOperation({ summary: 'Trade gate status — OPEN or BLOCKED based on macro risk' })
getTradeGate() { return this.macroService.getTradeGate(); }
```

---

## Group D — MacroIndicator Schema Extension

### D1. `forecast`, `actual`, `impactLevel` + update calendar format

**Files:**
- `src/modules/macro-indicator/macro-indicator.schema.ts`
- `src/collectors/fred.collector.ts`
- `src/modules/insights/insights-macro.service.ts`

**macro-indicator.schema.ts** — add 3 optional fields:
```typescript
@Prop()
forecast?: number;            // Consensus forecast (null — FRED không cung cấp)

@Prop()
actual?: number;              // Released value (= value khi đã release)

@Prop({ enum: ['low', 'medium', 'high'] })
impactLevel?: string;
```

**fred.collector.ts** — thêm `impactLevel` vào `SERIES_META`:
```
FEDFUNDS, FEDTARMD, CPIAUCSL, PCEPI → 'high'
DFII10, DGS10, DGS2, DTWEXBGS, M2SL → 'medium'
RRPONTSYD, BAMLH0A0HYM2 → 'low'
```
Thêm `actual: value` vào upsert payload. `forecast` giữ null.

**insights-macro.service.ts** — update `getCalendar()` response:
```typescript
function impactLevelToDots(level?: string): 1 | 2 | 3 {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  return 1;
}

// New response shape
return {
  data: upcoming.map((m) => ({
    id: `${m.seriesId}-${m.releaseDate?.toISOString().slice(0, 10)}`,
    event: m.name,
    scheduledAt: m.releaseDate,
    forecast: m.forecast ?? null,
    actual: m.releaseDate && m.releaseDate <= new Date() ? (m.actual ?? m.value) : null,
    impactDots: impactLevelToDots(m.impactLevel),
    beat: null,
  })),
  updatedAt: new Date(),
};
```

---

## Group E — LLM Prompt Update

### E1. Signal prompt: output `entry`/`tp`/`sl`/`macroFactors`

**Dependency:** A2 phải hoàn thành trước.

**Files:**
- `src/prompts/signal-system.prompt.ts` (hoặc tên tương đương)
- `src/collectors/signal-llm.collector.ts`

**Thêm vào OUTPUT FORMAT:**
```json
{
  "signal_type": "BUY | SELL | HOLD",
  "confidence": 0,
  "entry": null,
  "take_profit": null,
  "stop_loss": null,
  "macro_factors": [],
  "insight": "...",
  "indicators_used": [],
  "key_factors": []
}
```

**Thêm rules vào RULES section:**
```
8. BUY/SELL signals: "entry", "take_profit", "stop_loss" MUST be non-null numeric USD prices.
   HOLD signals: these fields may be null.
9. "entry" near current price (within 0.5% of latest close).
   "take_profit": realistic target (1–5% from entry in signal direction).
   "stop_loss": logical level (0.5–3% against signal direction).
10. "macro_factors": 2–4 concise strings naming macro conditions that influenced the signal.
    Example: "Weakening USD (DXY=98.5)", "Positive ETF inflows", "Declining real yields".
```

**signal-llm.collector.ts** — parse + persist new fields:
```typescript
entry: typeof parsed.entry === 'number' ? parsed.entry : undefined,
takeProfit: typeof parsed.take_profit === 'number' ? parsed.take_profit : undefined,
stopLoss: typeof parsed.stop_loss === 'number' ? parsed.stop_loss : undefined,
macroFactors: Array.isArray(parsed.macro_factors) ? parsed.macro_factors : [],
```

**Notes:**
- Nếu BUY/SELL signal thiếu entry/tp/sl → log warning, vẫn save (graceful degradation).
- Task risk cao nhất — test bằng `POST /signals/trigger-generation` sau khi update prompt.

---

## Dependencies

```
A2 ──────────────────→ E1
D1 ──────────────────→ C4 (nextEvent từ MacroIndicator.releaseDate)
C1 needs:
    portfolio-snapshot.schema.ts (granularity field)
    portfolio-snapshot.collector.ts (hourly job)
    scheduler.processor.ts (new job)
C2 needs:
    analytics.module.ts (import MarketPriceModule)
```

Groups B, C3, C4 hoàn toàn độc lập.

---

## Checklist

### Group A
- [ ] A1: `bot.schema.ts` — add `riskPerTrade`, `maxPositionExposure`
- [ ] A1: `bot.dto.ts` — add to `CreateBotDto` + `UpdateBotDto`
- [ ] A2: `signal.schema.ts` — add `entry`, `takeProfit`, `stopLoss`, `macroFactors`
- [ ] A2: `signal.dto.ts` — add to `CreateSignalDto`

### Group B
- [ ] B4: `dashboard.controller.ts` — fix typo `XAUTUSD` → `XAUTUSDT`
- [ ] B4: Verify `goldapi.collector.ts` saves symbol as `XAUUSD`
- [ ] B3: `dashboard.service.ts` `getMarketIndicators()` — add 5 fields
- [ ] B2: `dashboard.service.ts` `getMacroContext()` — add `goldOutlook`
- [ ] B1: `dashboard.service.ts` `getAiSignal()` — add `reasoning`

### Group C
- [ ] C3: `insights-macro.service.ts` — add `getRiskScore()`
- [ ] C3: `insights.controller.ts` — add `GET macro/risk-score`
- [ ] C4: `insights-macro.service.ts` — add `getTradeGate()`
- [ ] C4: `insights.controller.ts` — add `GET macro/trade-gate`
- [ ] C1: `portfolio-snapshot.schema.ts` — add `granularity` field
- [ ] C1: `portfolio-snapshot.service.ts` — add `findByRangeAndGranularity()`
- [ ] C1: `portfolio-snapshot.collector.ts` — add `collectHourly()`
- [ ] C1: `scheduler.processor.ts` — register `portfolio_snapshot_hourly` job
- [ ] C1: `analytics.service.ts` — add `getPortfolioPerformance()`
- [ ] C1: `analytics.controller.ts` — add `GET /analytics/portfolio-performance`
- [ ] C2: `analytics.module.ts` — import `MarketPriceModule`
- [ ] C2: `analytics.service.ts` — add `getAssetPerformance()`
- [ ] C2: `analytics.controller.ts` — add `GET /analytics/asset-performance`

### Group D
- [ ] D1: `macro-indicator.schema.ts` — add `forecast`, `actual`, `impactLevel`
- [ ] D1: `fred.collector.ts` — add `impactLevel` to SERIES_META, set `actual = value`
- [ ] D1: `insights-macro.service.ts` — update `getCalendar()` response format

### Group E
- [ ] E1: `signal-system.prompt.ts` — extend OUTPUT FORMAT + add rules 8–10
- [ ] E1: `signal-llm.collector.ts` — parse + persist new fields
- [ ] E1: Test via `POST /signals/trigger-generation`, verify JSON output

### Verification
- [ ] `npx tsc --noEmit -p services/dgt/tsconfig.app.json`
- [ ] `nx build dgt`
- [ ] Smoke test tất cả endpoints đã modified
