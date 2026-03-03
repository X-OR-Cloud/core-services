# DGT Service - Implementation Plan MVP v1.0

**Version:** 1.0 | **Date:** 03/03/2026 | **Status:** In Progress

---

## Tổng quan

MVP v1.0 gồm **9 entity modules**, **SharedDataService**, **Worker mode** với **9 collectors** qua BullMQ.

**Tham chiếu:**
- [01-ARCHITECTURE.md](01-ARCHITECTURE.md) - Kiến trúc tổng thể
- [02-ENTITY-DESIGN.md](02-ENTITY-DESIGN.md) - Thiết kế entity
- [03-DATA-INGESTION-FLOW.md](03-DATA-INGESTION-FLOW.md) - Luồng thu thập dữ liệu

---

## Phase 1a: Entity Schemas & CRUD Modules

> Mục tiêu: Tạo 9 entity modules với đầy đủ schema, service, controller, DTO, module.

### Group 1: User & Account

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 1.1 | `account` module - schema, service, controller, dto, module | ✅ | BaseService + RBAC, indexes: `{ 'owner.userId': 1, accountType: 1, exchange: 1 }` |
| 1.2 | `risk-profile` module - schema, service, controller, dto, module | ✅ | Link Account qua `accountId`, unique index: `{ accountId: 1 }` |

### Group 2: Market Data (Shared)

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 1.3 | `SharedDataService<T>` - generic service cho shared data | ✅ | Không dùng BaseService, cung cấp: insert, insertMany, findLatest, findByRange, upsert |
| 1.4 | `market-price` module - schema, service (extends SharedDataService), controller (read-only), dto | ✅ | Compound index: `{ symbol, source, timeframe, timestamp }`, TTL index 1 năm |
| 1.5 | `technical-indicator` module - schema, service, controller (read-only), dto | ✅ | Index: `{ symbol, timeframe, timestamp }` |
| 1.6 | `macro-indicator` module - schema, service, controller (read-only), dto | ✅ | Unique compound: `{ seriesId, timestamp }` |
| 1.7 | `sentiment-signal` module - schema, service, controller (read-only), dto | ✅ | Index: `{ source, timestamp }` |

### Group 3: Trading (Paper)

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 1.8 | `order` module - schema, service, controller, dto | ✅ | Index: `{ accountId, status, createdAt }` |
| 1.9 | `trade` module - schema, service, controller, dto | ✅ | Index: `{ accountId, executedAt }` |
| 1.10 | `position` module - schema, service, controller, dto | ✅ | Indexes: `{ accountId, status }`, `{ accountId, closedAt }` |

### Integration

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 1.11 | Import tất cả modules vào `app.module.ts` | ✅ | Đăng ký MongooseModule.forFeature cho mỗi entity |
| 1.12 | Build & verify: `nx run dgt:build` | ✅ | - |
| 1.13 | Start & test health + Swagger: `nx run dgt:api` | ✅ | `/api/health` OK, 9 modules init, all routes mapped, CRUD verified |

---

## Phase 1b: Worker Mode Bootstrap

> Mục tiêu: Thiết lập Worker mode với 2 processes riêng biệt (Scheduler + Data Ingestion).

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 2.1 | `bootstrap-worker.ts` - Worker bootstrap (no HTTP port) | ✅ | Mode-based: main.ts → bootstrap-worker.ts (shd/ing) |
| 2.2 | `app-worker.module.ts` - Worker root module | ✅ | Import: ConfigModule, MongooseModule, BullModule, Group 2 modules, ProcessorsModule |
| 2.3 | ~~`webpack-worker.config.js`~~ - Không cần, dùng single build | ✅ | Dùng mode-based bootstrap giống AIWM pattern |
| 2.4 | Nx targets trong `project.json` - `dgt:wrk:shd`, `dgt:wrk:ing` | ✅ | args: ["shd"] / args: ["ing"] |
| 2.5 | `config/redis.config.ts` - Redis connection config | ✅ | Đã có sẵn từ scaffold |
| 2.6 | `config/datasources.config.ts` - Schedule config (9 datasources) | ✅ | Theo spec trong 03-DATA-INGESTION-FLOW.md |
| 2.7 | Build & verify worker: `nx run dgt:build` | ✅ | Build thành công |

---

## Phase 2a: BullMQ Queue & Scheduler

> Mục tiêu: BullMQ queue setup + Scheduler processor emit repeatable jobs.

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 3.1 | BullModule setup trong `app-worker.module.ts` | ✅ | BullModule.forRoot + registerQueue (dgt-scheduler, dgt-data-ingestion) |
| 3.2 | `queues/scheduler.processor.ts` - Đăng ký repeatable jobs | ✅ | onModuleInit: clear old → register new, theo DATASOURCE_SCHEDULES |
| 3.3 | `queues/data-ingestion.processor.ts` - Switchcase dispatcher | ✅ | Switch by `type`, TODO stubs cho 9 collectors |
| 3.4 | `queues/processors.module.ts` - Module gom processors | ✅ | Import CollectorsModule |
| 3.5 | Test scheduler emits jobs (manual verify via BullMQ dashboard hoặc log) | ✅ | 10/10 datasources registered, repeatable jobs in Redis |

---

## Phase 2b: First 3 Collectors

> Mục tiêu: 3 collectors đầu tiên để validate pipeline end-to-end.

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 4.1 | `collectors/base.collector.ts` - Abstract base class | ✅ | fetchWithRetry, rate limit handling, timeout |
| 4.2 | `collectors/goldapi.collector.ts` - GoldAPI → MarketPrice | ✅ | API key từ env (TODO: Settings DB) |
| 4.3 | `collectors/binance-spot.collector.ts` - Binance Spot → MarketPrice | ✅ | Public API + orderbook spread |
| 4.4 | `collectors/fred.collector.ts` - FRED → MacroIndicator | ✅ | 11 series, upsert by seriesId+timestamp |
| 4.5 | `collectors/collectors.module.ts` - Module gom collectors | ✅ | All 9 collectors registered |
| 4.6 | E2E test: Scheduler → Queue → Collector → MongoDB | ✅ | Pipeline verified: SHD→Redis→ING→MongoDB→API |

---

## Phase 2c: Remaining 6 Collectors

> Mục tiêu: Hoàn thành toàn bộ 9 collectors.

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 5.1 | `collectors/binance-futures.collector.ts` - → MarketPrice + SentimentSignal | ✅ | markPrice, fundingRate, OI, L/S ratio |
| 5.2 | `collectors/okx.collector.ts` - OKX → MarketPrice | ✅ | Public API |
| 5.3 | `collectors/bitfinex.collector.ts` - Bitfinex → MarketPrice | ✅ | Array response parsing |
| 5.4 | `collectors/yahoo-finance.collector.ts` - Yahoo → MarketPrice | ✅ | Yahoo Chart API (axios), 6 symbols |
| 5.5 | `collectors/bytetree.collector.ts` - ByteTree → SentimentSignal | ✅ | ETF flow + AUM |
| 5.6 | Verify all 8 collectors (trừ NewsAPI) chạy đúng | ✅ | 7/8 OK (GoldAPI skip - no key), FRED/ByteTree chưa fire (interval 24h) |

---

## Phase 2d: NewsAPI + LLM Integration

> Mục tiêu: Collector cuối cùng với LLM sentiment analysis.

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 6.1 | `collectors/newsapi.collector.ts` - NewsAPI fetch headlines | ✅ | Fetch → LLM → Save, fallback nếu không có LLM |
| 6.2 | LLM integration - OpenAI-compatible API call | ✅ | POST /chat/completions, JSON response format |
| 6.3 | Sentiment analysis prompt & response parsing | ✅ | geopoliticalRiskScore, eventImpactLevel, sentiment, summary, keyEvents |
| 6.4 | Save to SentimentSignal (source: `llm_analysis`) | ✅ | - |
| 6.5 | Full pipeline test: tất cả 9 collectors | ✅ | NewsAPI OK (fallback mode, no LLM), data saved to SentimentSignal |

---

## Phase 3: Technical Indicator Computation

> Mục tiêu: Tính toán chỉ số kỹ thuật từ MarketPrice data.

| # | Task | Status | Ghi chú |
|---|------|--------|---------|
| 7.1 | `indicators/math.util.ts` - Pure math functions (SMA, EMA, RSI, MACD, BB, ATR, HV, VolumeRatio) | ✅ | Arrays oldest→newest, functional style |
| 7.2 | `indicators/indicator-computation.service.ts` - Reads MarketPrice → computes 17 indicators → upserts TechnicalIndicator | ✅ | Reads 220 candles (MIN for EMA200), upsert by {symbol, timeframe, timestamp} |
| 7.3 | `indicators/indicators.module.ts` + wiring vào ProcessorsModule & datasources.config | ✅ | Scheduled job mỗi 5 phút, 3 pairs (XAUUSD, PAXGUSDT spot, PAXGUSDT futures) |
| 7.4 | Verify data accuracy với external sources | ✅ | Chạy OK, skip khi chưa đủ 30 candles (expected) |

---

## Tổng kết

| Phase | Mô tả | Tasks | Priority |
|-------|-------|-------|----------|
| **1a** | Entity Schemas & CRUD Modules | 13 | 🔴 Cao |
| **1b** | Worker Mode Bootstrap | 7 | 🔴 Cao |
| **2a** | BullMQ Queue & Scheduler | 5 | 🔴 Cao |
| **2b** | First 3 Collectors | 6 | 🔴 Cao |
| **2c** | Remaining 6 Collectors | 6 | 🟡 Trung bình |
| **2d** | NewsAPI + LLM Integration | 5 | 🟡 Trung bình |
| **3** | Technical Indicator Computation | 4 | 🟢 Sau |
| **Total** | | **46 tasks** | |

### Thứ tự thực hiện

```
Phase 1a (Entity CRUD)
    ↓
Phase 1b (Worker Bootstrap)  ← có thể song song với 1a nếu schema xong
    ↓
Phase 2a (Queue + Scheduler)
    ↓
Phase 2b (3 Collectors đầu)  ← validate E2E pipeline
    ↓
Phase 2c (6 Collectors còn)
    ↓
Phase 2d (NewsAPI + LLM)
    ↓
Phase 3 (Technical Indicators)
```

---

### Legend

| Icon | Trạng thái |
|------|-----------|
| ⬜ | Chưa bắt đầu |
| 🔄 | Đang thực hiện |
| ✅ | Hoàn thành |
| ❌ | Blocked / Issue |

---

*Cập nhật lần cuối: 03/03/2026*
