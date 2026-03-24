# BE Plan: Bot Auto-Execute Trade từ Signal

> **Feature:** DGT — Bot tự động execute trade khi có Signal mới
> **Author:** Nyx (BE Agent)
> **Date:** 2026-03-24
> **Status:** Draft — Pending Tech Lead Review

---

## 1. Kiến trúc tổng thể

### Trạng thái hiện tại

```
┌─────────────────────────────────────────────────────┐
│                    sig00 Worker                      │
│                                                     │
│  SignalSchedulerProcessor                           │
│    └─ Schedule 1h/4h jobs per account               │
│                                                     │
│  SignalGenerationProcessor                          │
│    └─ SignalLlmCollector → Save Signal to DB        │
│    └─ expireSignals (every 1 min)                   │
│                                                     │
│  ❌ MISSING: BotExecutionWorker                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    mon00 Worker                      │
│  MonitoringWorker                                   │
│    └─ Poll every 10s → Check SL/TP on open positions│
└─────────────────────────────────────────────────────┘
```

### Kiến trúc sau khi implement

```
┌─────────────────────────────────────────────────────┐
│                    sig00 Worker                      │
│                                                     │
│  SignalSchedulerProcessor  (không đổi)              │
│  SignalGenerationProcessor (không đổi)              │
│                                                     │
│  ✅ NEW: BotExecutionWorker                         │
│    └─ Poll every 30s                                │
│    └─ Find ACTIVE signals (BUY/SELL, < 25 min)      │
│    └─ Find RUNNING bots for matching account        │
│    └─ Validate conditions                           │
│    └─ Auto-execute trade via TradeExecutionService  │
│    └─ Log to BotActivityLog                         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    mon00 Worker                      │
│  MonitoringWorker  (không đổi)                      │
│    └─ Poll every 10s → Check SL/TP on open positions│
└─────────────────────────────────────────────────────┘
```

**Lý do tích hợp vào `sig00` thay vì worker riêng:**
- Cùng dependency: Signal, Bot, Account, TradeExecution
- Tránh thêm pm2 process mới
- `app-signal.module.ts` đã có AccountModule → dễ mở rộng

---

## 2. Luồng xử lý

### 2.1 Happy Path

```
[Every 1h/4h]
sig00: SignalLlmCollector.collect(accountId, timeframe)
  → Gọi Kimi-K2-Instruct API
  → Parse response (BUY/SELL/HOLD + confidence + entry/SL/TP)
  → Lưu Signal vào DB (status: ACTIVE, expiresAt: now + 90 phút)

[Every 30s]
sig00: BotExecutionWorker.poll()
  → Query: signals WHERE status=ACTIVE AND signalType IN [BUY,SELL]
              AND createdAt > now-25min AND botExecutedAt IS NULL
  → For each signal:
      → Find bot WHERE accountId = signal.accountId
                   AND status = RUNNING
                   AND isDeleted = false
      → If no RUNNING bot → skip, log INFO
      → Validate điều kiện (xem §2.2)
      → TradeExecutionService.executeFromSignal(userId, { signalId, accountId, quantity })
      → Log SUCCESS → BotActivityLog
      → Mark signal.botExecutedAt = now (tránh double-execute)

[mon00: Every 10s — không đổi]
  → Monitor SL/TP của open positions → Auto-close khi hit
```

### 2.2 Điều kiện validate trước khi execute

| # | Điều kiện | Xử lý khi fail |
|---|-----------|----------------|
| 1 | `signal.confidence >= bot.minConfidenceScore` | Skip + log WARNING |
| 2 | `signal.timeframe == bot.timeframe` | Skip + log INFO |
| 3 | `signal.signalType != 'HOLD'` | Skip (không log) |
| 4 | `account.balance >= signal.priceAtCreation * bot.maxEntrySize` | Skip + log WARNING "Insufficient balance" |
| 5 | `signal không có botExecutedAt` (idempotency guard) | Skip silently |
| 6 | `dailyLossTracking` chưa vượt `bot.dailyStopLossUSD` | Skip + log ERROR + set bot status = PAUSED |
| 7 | Không có open position của cùng symbol đang active | Skip + log INFO "Position already open" |

### 2.3 Error Handling

```
LLM API timeout / error
  → Signal vẫn được tạo với fallback HOLD → BotExecutionWorker bỏ qua HOLD

TradeExecutionService throw error
  → Catch, log ERROR to BotActivityLog
  → Bot status → ERROR (nếu lỗi nghiêm trọng) hoặc chỉ skip lần này

signal.botExecutedAt đã set
  → Idempotent: skip silently, không log
```

---

## 3. Entities & Types — Thêm / Thay đổi

### 3.1 Signal Schema — Thêm field `botExecutedAt`

**File:** `services/dgt/src/modules/signal/signal.schema.ts`

```typescript
// THÊM field mới
@Prop({ type: Date })
botExecutedAt: Date;   // Timestamp khi bot đã execute trade từ signal này
                        // null = chưa execute, có giá trị = đã execute (idempotency guard)

@Prop({ type: Types.ObjectId, ref: 'Bot' })
executedByBotId: Types.ObjectId;  // Reference tới bot đã execute
```

> **Lý do không dùng `status = EXECUTED`:** Signal có thể đồng thời ACTIVE với người dùng (manual execute sau đó) nhưng đã được bot execute. Tách biệt field giúp tránh conflict.

### 3.2 BotActivityLog — Không thay đổi schema

Schema hiện tại đủ dùng. Thêm các `action` mới theo convention:

| actionType | action | details |
|---|---|---|
| `buy` / `sell` | `auto_trade_executed` | `"Bot executed BUY 0.001 PAXGUSDT at 3245.5"` |
| `warning` | `signal_skipped_confidence` | `"Signal confidence 55 < minRequired 70"` |
| `warning` | `signal_skipped_balance` | `"Insufficient balance: need $3.24, have $1.20"` |
| `warning` | `signal_skipped_position` | `"Open position already exists for PAXGUSDT"` |
| `error` | `auto_trade_failed` | `"TradeExecutionService error: ..."` |
| `info` | `daily_loss_limit_hit` | `"Daily loss $X exceeded limit $Y — bot paused"` |

### 3.3 Bot Schema — Không thay đổi

Schema hiện tại đã đủ fields cần thiết:
- `minConfidenceScore` ✅
- `maxEntrySize` ✅
- `dailyStopLossUSD` ✅
- `dailyLossTracking` ✅
- `timeframe` ✅
- `status` (RUNNING/PAUSED/ERROR) ✅

---

## 4. Modules — Thêm / Thay đổi

### 4.1 NEW: `BotExecutionWorker`

**File mới:** `services/dgt/src/workers/bot-execution.worker.ts`

```typescript
@Injectable()
export class BotExecutionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly POLL_INTERVAL_MS = 30_000; // 30 giây
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly signalModel: Model<SignalDocument>,
    private readonly botModel: Model<BotDocument>,
    private readonly accountModel: Model<AccountDocument>,
    private readonly positionModel: Model<PositionDocument>,
    private readonly tradeExecutionService: TradeExecutionService,
    private readonly botActivityLogModel: Model<BotActivityLogDocument>,
    private readonly botService: BotService,
  ) {}

  onApplicationBootstrap() {
    if (process.env['MODE'] !== 'sig') return;
    this.intervalHandle = setInterval(() => this.poll(), this.POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    // Query signals chưa được bot execute, còn trong window 25 phút
    const cutoff = new Date(Date.now() - 25 * 60 * 1000);
    const signals = await this.signalModel.find({
      status: 'ACTIVE',
      signalType: { $in: ['BUY', 'SELL'] },
      botExecutedAt: null,
      createdAt: { $gte: cutoff },
    }).lean().exec();

    for (const signal of signals) {
      await this.processSignal(signal);
    }
  }

  private async processSignal(signal: SignalDocument): Promise<void> {
    // ... validate + execute logic
  }
}
```

### 4.2 MODIFY: `app-signal.module.ts`

Thêm các imports cần thiết:

```typescript
// Thêm vào imports array
BotModule,
BotActivityLogModule,
PositionModule,
TradeModule,   // để access TradeExecutionService

// Thêm vào providers
BotExecutionWorker,
```

### 4.3 MODIFY: `signal-processors.module.ts` hoặc `signal-processors` exports

`TradeExecutionService` cần được export từ `TradeModule` và import vào `AppSignalModule`.

### 4.4 MODIFY: `Signal` — Service & Query

**File:** `services/dgt/src/modules/signal/signal.service.ts`

Thêm method (hoặc dùng raw model query trong worker):
```typescript
async findPendingBotExecution(cutoffDate: Date): Promise<Signal[]> {
  return this.model.find({
    status: SignalStatus.ACTIVE,
    signalType: { $in: [SignalType.BUY, SignalType.SELL] },
    botExecutedAt: null,
    createdAt: { $gte: cutoffDate },
  }).lean().exec();
}
```

---

## 5. Đầu việc cần thực hiện

### Phase 1 — Schema & Migration (0.5 ngày)

| # | Task | File |
|---|------|------|
| 1.1 | Thêm `botExecutedAt: Date` và `executedByBotId: ObjectId` vào Signal schema | `signal.schema.ts` |
| 1.2 | Thêm compound index `{ accountId, botExecutedAt, signalType, status }` cho query hiệu quả | `signal.schema.ts` |
| 1.3 | Build + verify TypeScript, deploy để sync index | PROD |

### Phase 2 — BotExecutionWorker (1 ngày)

| # | Task | File |
|---|------|------|
| 2.1 | Tạo `bot-execution.worker.ts` với poll loop 30s | `workers/bot-execution.worker.ts` |
| 2.2 | Implement `processSignal()` — validate 7 điều kiện | cùng file |
| 2.3 | Integrate `TradeExecutionService.executeFromSignal()` | cùng file |
| 2.4 | Implement `logActivity()` helper cho BotActivityLog | cùng file |
| 2.5 | Implement daily loss tracking check + bot PAUSED logic | cùng file |
| 2.6 | Idempotency: update `signal.botExecutedAt` trước khi execute (atomic $set) | cùng file |

### Phase 3 — Module Wiring (0.5 ngày)

| # | Task | File |
|---|------|------|
| 3.1 | Update `app-signal.module.ts` — import BotModule, PositionModule, TradeModule | `app-signal.module.ts` |
| 3.2 | Đảm bảo TradeExecutionService exported từ TradeModule | `trade.module.ts` |
| 3.3 | Đảm bảo BotService, BotActivityLog exported đúng | `bot.module.ts`, `bot-activity-log.module.ts` |

### Phase 4 — Test & Deploy (0.5 ngày)

| # | Task |
|---|------|
| 4.1 | Test DEV: tạo signal thủ công → verify bot auto-execute trong 30s |
| 4.2 | Test edge cases: signal HOLD, confidence thấp, balance thấp, open position đang có |
| 4.3 | Test idempotency: sig00 restart không double-execute |
| 4.4 | Build PROD → reload sig00 → verify BotActivityLog |

---

## 6. Timeline ước tính

| Phase | Thời gian |
|-------|-----------|
| Phase 1: Schema & Migration | 0.5 ngày |
| Phase 2: BotExecutionWorker | 1 ngày |
| Phase 3: Module Wiring | 0.5 ngày |
| Phase 4: Test & Deploy | 0.5 ngày |
| **Tổng** | **~2.5 ngày** |

---

## 7. Risks & Lưu ý

| Risk | Mức độ | Mitigation |
|------|--------|-----------|
| Double-execute nếu sig00 restart giữa chừng | Medium | Set `botExecutedAt` TRƯỚC khi call TradeExecutionService (atomic update first) |
| Signal 1h và 4h cùng tới cùng lúc → 2 positions mở | Low | Validate "no open position for symbol" trước khi execute |
| `maxEntrySize` quá lớn so với balance | Low | Validate balance check (condition 4) |
| Bot bị set ERROR do lỗi tạm thời của LLM/DB | Medium | Chỉ set ERROR khi lỗi critical, còn lại chỉ skip |
| Performance: poll 30s × nhiều signals × nhiều bots | Low | Index đúng + query có `$gte cutoff` để giới hạn window |

---

## 8. Không nằm trong scope

- Live trading thật (chỉ paper trading)
- WebSocket push notification khi bot execute (có thể add sau)
- Bot configuration UI (FE task)
- Multi-asset support (hiện chỉ PAXGUSDT)
