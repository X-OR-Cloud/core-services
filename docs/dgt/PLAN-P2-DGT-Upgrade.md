# PLAN-P2: DGT Service Upgrade Plan
## Signal, Analytics, Bot, Trade Execution

| Trường | Nội dung |
|---|---|
| **Version** | 1.0 DRAFT |
| **Ngày tạo** | 2026-03-11 |
| **Tác giả** | backend-dev |
| **Trạng thái** | Chờ review |

---

## Tổng Quan

Nâng cấp DGT service theo 4 FRS documents. Thứ tự thực hiện:

```
Phase 1: Signal Module (worker sig + entity)
Phase 2: Analytics Upgrade (không phụ thuộc Bot/Signal mới)
Phase 3: Bot Module (entity + state machine)
Phase 4: Trade Execution Enhancements (SL/TP monitoring worker mon)
```

---

## Phase 1 — Signal Module

### 1.1 Entity Mới: `Signal`

**Collection:** `signals`

**Fields:**

| Field | Type | Mô tả |
|---|---|---|
| `accountId` | ObjectId ref | Account sở hữu signal |
| `asset` | string | Symbol — MVP: `PAXG/USDT` |
| `timeframe` | enum | `1h` \| `4h` — MVP scope |
| `signalType` | enum | `BUY` \| `SELL` \| `HOLD` |
| `confidence` | number | 0–100 |
| `confidenceLabel` | enum | `low` \| `medium` \| `high` \| `very_high` |
| `insight` | string | LLM-generated text (50–300 words) |
| `indicatorsUsed` | string[] | Danh sách indicator đưa vào LLM |
| `keyFactors` | object[] | `[{ factor, weight }]` — từ LLM output |
| `llmModel` | string | Model name được dùng |
| `status` | enum | `ACTIVE` \| `EXPIRED` \| `SUPERSEDED` \| `EXECUTED` \| `IGNORED` |
| `expiresAt` | Date | Tự tính theo timeframe (1h→4h, 4h→16h) |
| `executedAt` | Date \| null | Khi bot thực thi lệnh dựa trên signal này |
| `supersededBy` | ObjectId \| null | Signal mới thay thế |
| `priceAtCreation` | number | Giá PAXG/USDT lúc tạo signal (để tính accuracy sau) |

**Indexes:**
- `{ accountId: 1, asset: 1, timeframe: 1, status: 1 }`
- `{ accountId: 1, createdAt: -1 }`
- `{ status: 1, expiresAt: 1 }` — cho expiry job
- TTL index: `expiresAt` — tự xóa sau 90 ngày kể từ expiresAt

**Business Rules trong Schema/Service:**
- Confidence < 30 → override `signalType` về `HOLD`
- Khi lưu signal mới: signal cũ cùng `(accountId × asset × timeframe)` đang ACTIVE → update sang `SUPERSEDED`
- `expiresAt` tự tính: 1h → +4h, 4h → +16h

---

### 1.2 Worker Mode Mới: `sig`

**Mục đích:** Chạy LLM Signal Engine định kỳ theo timeframe.

**Bootstrap:** Tương tự `shd`/`ing` — dùng `NestFactory.createApplicationContext()`, không HTTP.

**AppSignalModule** (module riêng cho mode sig):
- Import: `MongooseModule`, `BullModule`, `SignalModule`, `MarketPriceModule`, `TechnicalIndicatorModule`, `AccountModule`
- Có 2 processors: `SignalSchedulerProcessor` + `SignalGenerationProcessor`

**Luồng:**

```
SignalSchedulerProcessor (onModuleInit)
  → Clear old signal jobs
  → Đọc tất cả accounts (status=active)
  → Register repeatable BullMQ jobs:
      { name: 'generate_signal', data: { accountId, asset: 'PAXG/USDT', timeframe: '1h' }, repeat: { every: 3_600_000 } }
      { name: 'generate_signal', data: { accountId, asset: 'PAXG/USDT', timeframe: '4h' }, repeat: { every: 14_400_000 } }
      { name: 'expire_signals', repeat: { every: 60_000 } }  ← mỗi phút

SignalGenerationProcessor (consumes 'generate_signal')
  → Lấy 50 candles MarketPrice (symbol=PAXG/USDT, timeframe, sort timestamp desc, limit 50)
  → Lấy TechnicalIndicator latest (symbol=PAXG/USDT, timeframe)
  → Build LLM prompt (system prompt cố định + market data JSON)
  → Gọi LLM API (LLM_BASE_URL) → structured JSON output
  → Validate output (schema check, confidence range)
  → Override signalType → HOLD nếu confidence < 30 hoặc LLM timeout
  → Supersede signal cũ cùng (accountId × asset × timeframe)
  → Lưu Signal mới
  → Ghi ActivityLog entry

SignalExpiry job (consumes 'expire_signals')
  → Query signals { status: ACTIVE, expiresAt: { $lte: now } }
  → Batch update → EXPIRED
```

**LLM Structured Output Format (JSON):**
```
{
  signal_type: 'BUY' | 'SELL' | 'HOLD',
  confidence: number (0-100),
  insight: string,
  indicators_used: string[],
  key_factors: [{ factor: string, weight: 'high' | 'medium' | 'low' }]
}
```

**Fallback khi LLM fail (timeout > 20s hoặc invalid JSON):**
- Tạo signal HOLD, confidence=0, insight="Signal engine unavailable"
- Ghi log lỗi

**Queue:** `dgt-signal-generation` (tách riêng với `dgt-data-ingestion`)

---

### 1.3 API Endpoints — Signal

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| `GET` | `/signals` | Danh sách signals (filter + pagination) | JWT |
| `GET` | `/signals/latest` | Signal ACTIVE mới nhất per (asset × timeframe) của account | JWT |
| `GET` | `/signals/:id` | Chi tiết 1 signal (full insight) | JWT |
| `POST` | `/signals/:id/ignore` | User đánh dấu IGNORED | JWT |

**Query params cho `GET /signals`:**
```
?asset=PAXG/USDT
&timeframe=1h,4h
&signalType=BUY,SELL,HOLD
&status=ACTIVE,EXPIRED,EXECUTED
&confidenceMin=40&confidenceMax=100
&from=2026-03-01&to=2026-03-11
&page=1&limit=20
&sort=createdAt:desc
```

---

### 1.4 Files Cần Tạo/Sửa — Phase 1

**Tạo mới:**
```
services/dgt/src/modules/signal/
  signal.schema.ts
  signal.service.ts
  signal.controller.ts
  signal.module.ts

services/dgt/src/queues/signal-scheduler.processor.ts
services/dgt/src/queues/signal-generation.processor.ts

services/dgt/src/collectors/signal-llm.collector.ts   ← LLM call logic
services/dgt/src/prompts/signal-system.prompt.ts       ← System prompt cố định

services/dgt/src/app/app-signal.module.ts              ← Module cho mode sig
```

**Sửa:**
```
services/dgt/src/main.ts                    ← Thêm case 'sig' → bootstrap signal worker
services/dgt/src/config/queue.config.ts     ← Thêm queue 'dgt-signal-generation'
services/dgt/src/app/app.module.ts          ← Import SignalModule
project.json                                ← Thêm target wrk:sig
.env / .env.example                         ← Thêm LLM_SIGNAL_MODEL (optional)
```

---

## Phase 2 — Analytics Upgrade

### 2.1 Entities Thay Đổi

**`PortfolioSnapshot`** — đã có, không cần thêm field. Dùng để tính equity curve và drawdown.

Không cần entity mới cho Phase 2.

---

### 2.2 Luồng Xử Lý Mới

**Equity Curve:**
```
Query PortfolioSnapshot { accountId, date range }
  → Sort by date ASC
  → Map: { timestamp: date, equity: totalValueUsd, cumulativePnl: realizedPnlUsd + unrealizedPnlUsd, roiPct }
  → Return time series array
```

**Drawdown:**
```
Từ equity curve data
  → Track running peak (max equity seen so far)
  → drawdownPct = (equity - peak) / peak * 100
  → Return time series { timestamp, drawdownPct }
  → Compute maxDrawdown = min(drawdownPct)
```

**Trade Log (nâng cấp từ hiện tại):**
```
Query Position { accountId, status: 'closed', date range }
  → Join với Order/Trade để lấy signal context (sau Phase 3)
  → Return: bot, asset, side, entryPrice, exitPrice, pnl, duration, closeReason
```

**Dashboard Summary (nâng cấp):**
```
MongoDB Aggregation Pipeline trên Position (closed) + Account
  → totalPnl (realized), winRate, totalTrades, roi, maxDrawdown
  → Cache Redis 5 phút (key: analytics:summary:{userId}:{dateRange})
  → Cache bị invalidate khi có Position mới được đóng
```

---

### 2.3 API Endpoints — Analytics (Thêm/Sửa)

**Endpoints hiện có — sửa/nâng cấp:**

| Method | Endpoint | Thay đổi |
|---|---|---|
| `GET` | `/analytics/summary` | Thêm: maxDrawdown, sharpeRatio, bestBot, delta vs kỳ trước. Thêm Redis cache |
| `GET` | `/analytics/trades` | Thêm filter: side, closeReason, asset. Thêm field: closeReason, duration |

**Endpoints mới:**

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| `GET` | `/analytics/equity-curve` | Time series equity data từ PortfolioSnapshot | JWT |
| `GET` | `/analytics/drawdown` | Time series drawdown % + maxDrawdown annotation | JWT |
| `GET` | `/analytics/export/csv` | Export trade log ra CSV (async job) | JWT |
| `GET` | `/analytics/export/status/:jobId` | Check export job status | JWT |
| `GET` | `/analytics/export/download/:jobId` | Download file (TTL 15 phút) | JWT |

**Query params chung:**
```
?from=2026-03-01&to=2026-03-11   ← max 90 ngày
&accountId=uuid                   ← filter theo account (mặc định: tất cả của user)
&asset=PAXG/USDT
```

---

### 2.4 Files Cần Tạo/Sửa — Phase 2

**Sửa:**
```
services/dgt/src/modules/analytics/analytics.service.ts    ← Thêm equity-curve, drawdown, export methods
services/dgt/src/modules/analytics/analytics.controller.ts ← Thêm endpoints mới
services/dgt/src/modules/analytics/analytics.module.ts     ← Import Redis module
```

**Tạo mới:**
```
services/dgt/src/modules/analytics/analytics-export.service.ts  ← CSV export logic
services/dgt/src/shared/redis-cache.service.ts                   ← Redis cache wrapper (TTL helper)
```

---

## Phase 3 — Bot Module

### 3.1 Entity Mới: `Bot`

**Collection:** `bots`

**Fields:**

| Field | Type | Mô tả |
|---|---|---|
| `accountId` | ObjectId ref | Account mà bot giao dịch trên đó |
| `name` | string | Tên bot (unique per account) |
| `status` | enum | `CREATED` \| `RUNNING` \| `PAUSED` \| `STOPPED` \| `ERROR` \| `DELETED` |
| `tradingMode` | enum | `sandbox` \| `live` |
| `asset` | string | MVP: `PAXG/USDT` |
| `timeframe` | enum | `1h` \| `4h` |
| `totalCapital` | number | USD — vốn bot được phép dùng |
| `maxEntrySize` | number | USD — size tối đa mỗi lệnh |
| `stopLoss` | number | % |
| `takeProfit` | number | % |
| `maxDrawdownLimit` | number | % (1–15) |
| `dailyStopLossUSD` | number | USD |
| `minConfidenceScore` | number | Ngưỡng confidence để execute (default 70) |
| `errorMessage` | string \| null | Mô tả lỗi khi status=ERROR |
| `lastActiveAt` | Date \| null | Lần cuối bot ở trạng thái RUNNING |
| `dailyLossTracking` | object | `{ date: string, lossUsd: number }` — reset 00:00 UTC |
| `stats` | object | `{ totalPnl, winRate, totalTrades, currentDrawdownPct }` — cached metrics |

**Indexes:**
- `{ 'owner.userId': 1, status: 1 }`
- `{ accountId: 1 }` (unique — 1 account / 1 bot MVP)
- `{ name: 1, 'owner.userId': 1 }` (unique — tên unique per user)

---

### 3.2 Entity Mới: `BotActivityLog`

**Collection:** `bot_activity_logs`

**Fields:**

| Field | Type | Mô tả |
|---|---|---|
| `botId` | ObjectId ref | Bot liên quan |
| `accountId` | ObjectId ref | |
| `action` | string | Ví dụ: `BOT_STARTED`, `BOT_PAUSED`, `ORDER_FILLED`, `DRAWDOWN_EXCEEDED`, `CONFIG_UPDATED`, `SIGNAL_RECEIVED` |
| `actionType` | enum | `buy` \| `sell` \| `info` \| `warning` \| `error` |
| `details` | string | Mô tả chi tiết |
| `metadata` | object | Dữ liệu phụ (giá, qty, signal ID, config cũ/mới...) |
| `performedBy` | enum | `user` \| `system` |
| `status` | enum | `SUCCESS` \| `WARNING` \| `ERROR` \| `INFO` |

**Indexes:**
- `{ botId: 1, createdAt: -1 }`
- `{ accountId: 1, createdAt: -1 }`
- TTL: 90 ngày

---

### 3.3 State Machine Bot

**Transitions hợp lệ:**
```
CREATED   → RUNNING  (auto-start hoặc user start)
RUNNING   → PAUSED   (user pause)
RUNNING   → STOPPED  (user stop → đóng positions → hủy pending orders)
RUNNING   → ERROR    (drawdown vượt ngưỡng / API lỗi)
PAUSED    → RUNNING  (user resume)
PAUSED    → STOPPED  (user stop)
PAUSED    → DELETED  (user delete + confirm)
STOPPED   → DELETED  (user delete + confirm)
ERROR     → STOPPED  (user acknowledge)
```

**Invalid transitions** sẽ throw `BadRequestException` với message rõ ràng.

---

### 3.4 Luồng Bot Execution (khi RUNNING)

```
Signal Engine tạo Signal mới (Phase 1)
  → Bot service lắng nghe / poll signal mới (per accountId × asset × timeframe)
  → Check: signal.status = ACTIVE, signal.confidence >= bot.minConfidenceScore
  → Check: bot.status = RUNNING
  → Check: dailyStopLossUSD chưa vượt
  → Check: maxDrawdownLimit chưa vượt
  → Nếu pass → tạo Order (tradingMode=sandbox: simulate; live: gọi exchange API)
  → Update signal.status → EXECUTED
  → Ghi BotActivityLog
```

**Auto-stop triggers (chạy trong monitoring hoặc sau mỗi order):**
- `currentDrawdownPct >= maxDrawdownLimit` → BOT_STOPPED, log reason
- `dailyLossUSD >= dailyStopLossUSD` → BOT_STOPPED ngày đó, reset 00:00 UTC

---

### 3.5 API Endpoints — Bot

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| `POST` | `/bots` | Tạo bot mới | JWT |
| `GET` | `/bots` | Danh sách bots của user | JWT |
| `GET` | `/bots/:id` | Chi tiết bot + stats | JWT |
| `PUT` | `/bots/:id` | Cập nhật config (khi RUNNING/PAUSED) | JWT |
| `POST` | `/bots/:id/start` | Start bot | JWT |
| `POST` | `/bots/:id/pause` | Pause bot | JWT |
| `POST` | `/bots/:id/resume` | Resume bot | JWT |
| `POST` | `/bots/:id/stop` | Stop bot (đóng positions) | JWT |
| `DELETE` | `/bots/:id` | Xóa bot (chỉ khi STOPPED/PAUSED) | JWT |
| `GET` | `/bots/:id/activity-logs` | Activity log của bot (phân trang) | JWT |

---

### 3.6 Files Cần Tạo/Sửa — Phase 3

**Tạo mới:**
```
services/dgt/src/modules/bot/
  bot.schema.ts
  bot.service.ts
  bot.controller.ts
  bot.module.ts

services/dgt/src/modules/bot-activity-log/
  bot-activity-log.schema.ts
  bot-activity-log.service.ts
  bot-activity-log.module.ts
```

**Sửa:**
```
services/dgt/src/app/app.module.ts    ← Import BotModule, BotActivityLogModule
services/dgt/src/main.ts              ← Không đổi nhiều
```

---

## Phase 4 — Trade Execution Enhancements

### 4.1 Entities Thay Đổi

**`Order`** — thêm fields:
- `signalId`: ObjectId ref Signal — link lệnh với signal đã trigger
- `botId`: ObjectId ref Bot — link lệnh với bot

**`Position`** — thêm fields:
- `botId`: ObjectId ref Bot
- `signalId`: ObjectId ref Signal
- `monitoringStatus`: enum `active` \| `paused` \| `closed` — cho SL/TP monitor biết cần theo dõi không

**`Trade`** — thêm fields:
- `botId`: ObjectId ref Bot

---

### 4.2 Worker Mode Mới: `mon` — SL/TP Monitoring

**Mục đích:** Theo dõi giá thị trường liên tục, tự động đóng position khi chạm SL/TP.

**Luồng:**
```
MonitoringWorker (polling mỗi 10 giây)
  → Query Position { status: 'open', monitoringStatus: 'active' }
  → Với mỗi position:
      Lấy currentPrice từ MarketPrice latest (symbol, source=binance_spot)
      Update position.currentPrice, unrealizedPnl
      Check stopLossPrice: currentPrice <= stopLossPrice (LONG) → trigger close
      Check takeProfitPrice: currentPrice >= takeProfitPrice (LONG) → trigger close
  → Nếu trigger:
      Tạo Order (type=market, side=sell, source=system)
      Update Position { status: closed, exitPrice, realizedPnl, closeReason: 'stop_loss'|'take_profit' }
      Update Account balance
      Ghi BotActivityLog (nếu có botId)
      Cập nhật Bot.stats (nếu có botId)
```

**Bootstrap:** `NestFactory.createApplicationContext()`, không HTTP.

**AppMonitorModule** — Module riêng cho mode mon.

---

### 4.3 Trade Execution từ Signal (Manual — FRS-02)

Không tạo worker riêng. Luồng manual trade từ Signal qua API:

```
POST /trades/from-signal
  Body: { signalId, quantity }
  → Pre-trade risk checks:
      cashBalance đủ không?
      signal còn ACTIVE không? (expiresAt > now, < 30 phút tuổi)
      Exchange API connected? (nếu live mode)
  → Tạo Order → simulate fill (sandbox) hoặc gọi exchange (live)
  → Update Position, Account balance
  → Update Signal.status → EXECUTED
  → Ghi Trade log
```

---

### 4.4 API Endpoints — Trade Execution

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| `POST` | `/trades/from-signal` | Manual trade từ signal | JWT |
| `POST` | `/positions/:id/close` | Manual close position | JWT |

---

### 4.5 Files Cần Tạo/Sửa — Phase 4

**Tạo mới:**
```
services/dgt/src/app/app-monitor.module.ts            ← Module cho mode mon
services/dgt/src/workers/monitoring.worker.ts          ← SL/TP polling logic
services/dgt/src/modules/trade/trade-execution.service.ts ← Manual trade từ signal
```

**Sửa:**
```
services/dgt/src/modules/order/order.schema.ts         ← Thêm signalId, botId
services/dgt/src/modules/position/position.schema.ts   ← Thêm botId, signalId, monitoringStatus
services/dgt/src/modules/trade/trade.schema.ts         ← Thêm botId
services/dgt/src/modules/trade/trade.controller.ts     ← Thêm endpoint from-signal
services/dgt/src/modules/position/position.controller.ts ← Thêm close endpoint
services/dgt/src/main.ts                               ← Thêm case 'mon'
project.json                                           ← Thêm target wrk:mon
```

---

## Tóm Tắt Tất Cả Entities

| Entity | Trạng thái | Collection |
|---|---|---|
| Account | Có sẵn — thêm `exchangeApiKey` (Phase 4) | `accounts` |
| RiskProfile | Có sẵn — giữ nguyên, không dùng cho Bot | `riskprofiles` |
| MarketPrice | Có sẵn — không đổi | `marketprices` |
| TechnicalIndicator | Có sẵn — không đổi | `technicalindicators` |
| MacroIndicator | Có sẵn — không đổi | `macroindicators` |
| SentimentSignal | Có sẵn — không đổi | `sentimentsignals` |
| Order | Có sẵn — thêm `signalId`, `botId` (Phase 4) | `orders` |
| Trade | Có sẵn — thêm `botId` (Phase 4) | `trades` |
| Position | Có sẵn — thêm `botId`, `signalId`, `monitoringStatus` (Phase 4) | `positions` |
| PortfolioSnapshot | Có sẵn — không đổi | `portfoliosnapshots` |
| **Signal** | **Mới — Phase 1** | `signals` |
| **Bot** | **Mới — Phase 3** | `bots` |
| **BotActivityLog** | **Mới — Phase 3** | `bot_activity_logs` |

---

## Tóm Tắt Worker Modes

| Mode | Hiện tại | Sau upgrade |
|---|---|---|
| `api` | REST API | Không đổi |
| `shd` | Scheduler (data ingestion) | Không đổi |
| `ing` | Data ingestion processor | Không đổi |
| `sig` | — | **Mới**: Signal generation scheduler + processor |
| `mon` | — | **Mới**: SL/TP monitoring worker |

---

## Tóm Tắt Files Mới/Sửa Theo Phase

### Phase 1 — Signal (7 tạo mới, 4 sửa)
```
TẠO:
  src/modules/signal/{schema, service, controller, module}.ts
  src/queues/signal-scheduler.processor.ts
  src/queues/signal-generation.processor.ts
  src/collectors/signal-llm.collector.ts
  src/prompts/signal-system.prompt.ts
  src/app/app-signal.module.ts

SỬA:
  src/main.ts
  src/config/queue.config.ts
  src/app/app.module.ts
  project.json
```

### Phase 2 — Analytics (2 tạo mới, 3 sửa)
```
TẠO:
  src/modules/analytics/analytics-export.service.ts
  src/shared/redis-cache.service.ts

SỬA:
  src/modules/analytics/analytics.service.ts
  src/modules/analytics/analytics.controller.ts
  src/modules/analytics/analytics.module.ts
```

### Phase 3 — Bot (8 tạo mới, 1 sửa)
```
TẠO:
  src/modules/bot/{schema, service, controller, module}.ts
  src/modules/bot-activity-log/{schema, service, module}.ts

SỬA:
  src/app/app.module.ts
```

### Phase 4 — Trade Execution (3 tạo mới, 6 sửa)
```
TẠO:
  src/app/app-monitor.module.ts
  src/workers/monitoring.worker.ts
  src/modules/trade/trade-execution.service.ts

SỬA:
  src/modules/order/order.schema.ts
  src/modules/position/position.schema.ts
  src/modules/trade/trade.schema.ts
  src/modules/trade/trade.controller.ts
  src/modules/position/position.controller.ts
  src/main.ts
  project.json
```

---

## Các Quyết Định Kỹ Thuật Chốt

| Vấn đề | Quyết định |
|---|---|
| Bot vs AIWM Agent | Tự phát triển Bot đơn giản trong DGT — AIWM integrate sau |
| Signal per | Account (1 account → nhiều signals) |
| Asset MVP | PAXG/USDT |
| Timeframe MVP | 1h và 4h |
| LLM cho Signal | Dùng chung `LLM_BASE_URL`, thêm env `LLM_SIGNAL_MODEL` |
| Analytics DB | On-demand MongoDB Aggregation + Redis cache 5 phút |
| SL/TP Monitoring | Worker mode riêng (`mon`), polling mỗi 10 giây |
| RiskProfile | Giữ nguyên, không dùng cho Bot MVP |
| Signal accuracy | Binary Direction (Phase 2+) — defer cho sau khi có đủ executed signals |
| PDF Export | Defer — không trong MVP |
| Sharpe Ratio | Defer — cần đủ data points |
| ActivityLog | Collection riêng `bot_activity_logs` |
| Signal retention | TTL index 90 ngày |

---

*v1.0 DRAFT — Chờ review từ anh trước khi bắt đầu implement.*
