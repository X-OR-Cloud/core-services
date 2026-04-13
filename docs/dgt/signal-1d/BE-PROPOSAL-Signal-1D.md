# BE Proposal: Signal 1D (Daily Timeframe)

**Date:** 2026-03-30
**Author:** Nyx (Backend Agent)
**Reviewer:** Hoàng Việt Dũng (`@1074993237363802122`)
**Status:** PENDING REVIEW

---

## 1. Overview

Thêm signal timeframe `1d` (daily) vào hệ thống DGT. Signal 1D sẽ cho phép bot trade theo tín hiệu dài hạn hơn (ngày), phù hợp với chiến lược swing trading.

---

## 2. Current State

| Timeframe | Signal | Bot | Scheduler | Candle Data |
|---|---|---|---|---|
| 15m | ✅ | ✅ | ✅ 900s | 1m × 30 |
| 1h | ✅ | ✅ | ✅ 3600s | 1m × 60 |
| 4h | ✅ | ✅ | ✅ 14400s | 1m × 240 |
| **1d** | ❌ | ❌ | ❌ | ❌ |

**Key finding:** `MarketPrice` schema đã có `Timeframe.D1 = '1d'` nhưng chưa có collector nào lưu daily candles vào DB.

---

## 3. Technical Design

### 3.1 Approach: Daily OHLCV Collector (Option B — Recommended)

**Lý do không dùng Option A (1m × 1440):**
- 1440 candles là quá nhiều data cho LLM context
- Tốn nhiều token → tăng chi phí + latency
- Context không sạch: 1 ngày = 1440 điểm dữ liệu 1m, nhiễu loạn

**Option B — Collector riêng lấy daily klines từ Binance:**
- Mỗi nến = 1 ngày (OHLCV rõ ràng, đầy đủ)
- Dùng 90 daily candles → 3 tháng context = đủ để LLM phân tích xu hướng dài hạn
- Binance API: `GET /api/v3/klines?symbol=PAXGUSDT&interval=1d&limit=90`
- Lưu vào MarketPrice với `timeframe: '1d'` (schema đã support)

### 3.2 Data Flow

```
Scheduler (daily 00:00 UTC)
  └→ DataIngestion Queue: collect_binance_klines_daily
        └→ BinanceKlinesDailyCollector.collect()
              └→ GET /api/v3/klines?interval=1d&limit=2  (chỉ lấy 2 nến gần nhất)
              └→ Upsert vào MarketPrice (symbol, source=binance_spot, timeframe=1d)

Signal Scheduler (daily 00:05 UTC — sau khi data đã collect)
  └→ SignalGeneration Queue: generate_signal:{accountId}:1d
        └→ SignalLlmCollector.generateSignal({ timeframe: '1d' })
              └→ Fetch MarketPrice (timeframe=1d, limit=90)
              └→ LLM generate signal
              └→ Save Signal (expires +4 days)
```

### 3.3 Files to Create

**1. `collectors/binance-klines-daily.collector.ts`** (NEW)
```
- Fetch từ Binance klines API với interval=1d
- Upsert vào MarketPrice với timeframe='1d'
- Chỉ lấy 2 nến gần nhất mỗi lần chạy (hôm qua + hôm nay)
- Chạy daily vào 00:00 UTC
```

### 3.4 Files to Modify

**2. `config/datasources.config.ts`**
- Thêm job `collect_binance_klines_daily` chạy mỗi 24h vào 00:00 UTC

**3. `modules/signal/signal.schema.ts`**
```typescript
export enum SignalTimeframe {
  M15 = '15m',
  H1 = '1h',
  H4 = '4h',
  D1 = '1d',   // NEW
}
```

**4. `modules/bot/bot.schema.ts`**
```typescript
export enum BotTimeframe {
  M15 = '15m',
  H1 = '1h',
  H4 = '4h',
  D1 = '1d',   // NEW
}
```

**5. `collectors/signal-llm.collector.ts`**
```typescript
// Thêm candle limit cho 1d
const CANDLE_LIMITS: Record<string, number> = {
  '15m': 30,
  '1h': 60,
  '4h': 240,
  '1d': 90,    // NEW — 90 daily candles = 3 months
};

// Fetch từ đúng timeframe (không còn hardcode '1m')
const marketTimeframe = timeframe === '1d' ? '1d' : '1m';
const { data: candlesDesc } = await this.marketPriceService.findAll(
  { symbol: asset, timeframe: marketTimeframe },
  { sort: { timestamp: -1 }, page: 1, limit: candleLimit },
);

// Expiry cho 1d signal
if (timeframe === SignalTimeframe.D1) {
  expiresAt.setDate(expiresAt.getDate() + 4); // +4 ngày
}
```

**6. `queues/signal-scheduler.processor.ts`**
```typescript
// Thêm job 1d — chạy mỗi 86,400,000ms (24h), offset 5 phút sau collector
await this.signalGenerationQueue.add(
  this.jobName(accountId, '1d'),
  { type: SIGNAL_JOB_TYPES.GENERATE_SIGNAL, params: { accountId, asset: 'PAXGUSDT', timeframe: '1d' } },
  { repeat: { every: 86_400_000 }, jobId: this.jobName(accountId, '1d') },
);
registered += 4; // 15m + 1h + 4h + 1d
```

**7. `modules/signal/signal.controller.ts`**
- Update default filter để include `'1d'` khi không có timeframe param:
```typescript
timeframe: { $in: ['1h', '4h', '1d'] }
```

---

## 4. API Changes

| Endpoint | Change |
|---|---|
| `GET /signals` | Default filter: `{ timeframe: { $in: ['1h', '4h', '1d'] } }` |
| `POST /bots` | `timeframe` field accept thêm value `'1d'` |
| `GET /signals?timeframe=1d` | Hoạt động sau khi có data |

---

## 5. Performance Considerations

- Daily collector chỉ fetch 2 candles/lần → rất nhẹ
- Signal generation 1D: 1 request/account/day → load thấp
- 90 daily candles ≈ 1KB data → LLM context ok
- DB index `{ symbol, source, timeframe, timestamp }` đã có → query nhanh

---

## 6. Risks

| Risk | Mức độ | Mitigation |
|---|---|---|
| Binance klines API rate limit | Thấp | 1 request/day, không đáng kể |
| Signal 1D generate trước khi có candle data | Trung bình | Schedule collector 00:00, signal 00:05 (delay 5 phút) |
| 1D signal expiry 4 ngày overlap nhiều signals | Thấp | Bot check signal age trước execute |

---

## 7. Scope

**IN SCOPE:**
- New collector: `binance-klines-daily.collector.ts`
- Enum updates: `SignalTimeframe.D1`, `BotTimeframe.D1`
- Scheduler: thêm 1d job per account
- LLM collector: support fetch từ `1d` timeframe
- Default filter API `/signals` include `1d`

**OUT OF SCOPE:**
- Aggregation từ 1m → 1d (không cần, collector fetch trực tiếp)
- Technical indicators cho 1d (sau nếu cần)
- Backfill historical daily candles (optional, không block)

---

## 8. Implementation Plan

1. **Tạo `binance-klines-daily.collector.ts`** → test fetch
2. **Update `datasources.config.ts`** → add daily schedule
3. **Update `signal.schema.ts` + `bot.schema.ts`** → add D1 enum
4. **Update `signal-llm.collector.ts`** → candle limit + expiry + fetch từ đúng timeframe
5. **Update `signal-scheduler.processor.ts`** → register 1d job
6. **Update `signal.controller.ts`** → default filter
7. Build + verify + PR

**Estimated effort:** 1 ngày làm việc

---

*Pending approval từ anh Dũng trước khi implement.*
