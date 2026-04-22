# CLAUDE.md — DGT Service

Guidance for AI Agent when working with the **dgt** service.

## Behavioral Guidelines

### 1. Think Before Coding

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

- No features beyond what was asked.
- No abstractions for single-use code.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

- Don't "improve" adjacent code, comments, or formatting.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove only imports/variables/functions that YOUR changes made unused.

### 4. Goal-Driven Execution

Transform tasks into verifiable goals before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

---

## Service Overview

**DGT** (Digital Gold Trader) — paper trading and market data service for gold & crypto assets.

| | Dev | Prod |
|---|---|---|
| Port | 3008 | 3380–3389 |
| Database | `core_dgt` | `core_dgt` |

---

## Run Targets

```bash
nx run dgt:build        # Build
nx run dgt:api          # API mode (REST + Swagger, port 3008)
nx run dgt:wrk:shd      # Scheduler — registers BullMQ repeatable jobs
nx run dgt:wrk:ing      # Data ingestion — consumes jobs, runs collectors
nx run dgt:wrk:sig      # Signal generation — LLM signal processor
nx run dgt:wrk:mon      # SL/TP monitoring — polls open positions every 10s
```

Mode selection: `process.argv[2]` overrides `process.env.MODE` (nx targets pass via args).

---

## Modules

### Group 1 — User & Account (BaseService + RBAC)

| Module | Path | Description |
|--------|------|-------------|
| Account | `src/modules/account/` | Trading accounts (paper/live), exchange config, balance |
| RiskProfile | `src/modules/risk-profile/` | Risk parameters per account (SL, position size, leverage) |

### Group 2 — Market Data (SharedDataService, no RBAC)

Read-only API — data written only by workers.

| Module | Path | Description |
|--------|------|-------------|
| MarketPrice | `src/modules/market-price/` | OHLCV data from 6 sources |
| TechnicalIndicator | `src/modules/technical-indicator/` | RSI, MACD, EMA, Bollinger Bands, ATR, HV, VolumeRatio |
| MacroIndicator | `src/modules/macro-indicator/` | FRED macro series (Fed Funds, CPI, DXY…) |
| SentimentSignal | `src/modules/sentiment-signal/` | News sentiment, ETF flows, funding rates |
| NewsArticle | `src/modules/news-article/` | News articles for LLM analysis |

### Group 3 — Trading (BaseService + RBAC)

| Module | Path | Description |
|--------|------|-------------|
| Order | `src/modules/order/` | Paper orders (market / limit / stop_limit) |
| Trade | `src/modules/trade/` | Executed trade records — append-only, immutable after creation |
| Position | `src/modules/position/` | Open/closed positions with PnL tracking |

### Group 4 — Analytics (read-only aggregation)

| Module | Path | Description |
|--------|------|-------------|
| PortfolioSnapshot | `src/modules/portfolio-snapshot/` | Daily equity snapshots (written by monitor worker) |
| Analytics | `src/modules/analytics/` | PnL, equity curve, drawdown, CSV export — no own collection |
| Dashboard | `src/modules/dashboard/` | Dashboard aggregation |

### Group 5 — AI Signal & Bot (BaseService + RBAC)

| Module | Path | Description |
|--------|------|-------------|
| Signal | `src/modules/signal/` | AI-generated BUY/SELL/HOLD signals with LLM insight; TTL 90 days |
| Bot | `src/modules/bot/` | Bot state machine (CREATED → RUNNING → PAUSED → STOPPED / ERROR) |
| BotActivityLog | `src/modules/bot-activity-log/` | Append-only activity log; TTL 90 days |

### Group 6 — Logging

| Module | Path | Description |
|--------|------|-------------|
| SystemActivityLog | `src/modules/system-activity-log/` | System-wide activity logging |
| Insights | `src/modules/insights/` | Market insights and analysis data |

---

## Key Architecture Patterns

### SharedDataService

`src/shared/shared-data.service.ts` — used by all Group 2 modules. Does **not** extend BaseService (no RBAC).

Methods: `insert`, `insertMany`, `upsert`, `findLatest`, `findByRange`, `findAll`.

### NotificationService

`src/shared/notification.service.ts` — Discord (embed) and Telegram (Markdown) alerts.
- Config per account: `account.notifications.{discordWebhookUrl, telegramBotToken, telegramChatId, enabled}`
- Uses `Promise.allSettled` — one channel failure does not block the other.

### Collector Pattern

`src/collectors/base.collector.ts` — abstract base with `fetchWithRetry()`:
- Exponential backoff; 429 → waits `retry-after`; 401/403 → no retry.
- Each collector implements `collect()`: Fetch → Transform → Save.

### Technical Indicator Computation

Triggered by scheduled BullMQ job (`compute_indicators`, every 5 min) — not post-save hooks.
- `src/indicators/math.util.ts`: pure functions (SMA, EMA, RSI, MACD, Bollinger Bands, ATR, HV, VolumeRatio).
- `src/indicators/indicator-computation.service.ts`: reads last 220 MarketPrice candles → computes 17 fields → upserts TechnicalIndicator.

### Exchange Adapters

`src/exchange/adapters/` — Binance, Bybit, OKX, local simulation (paper trading).
`exchange-adapter.factory.ts` creates adapter instances from account exchange config.

### Worker Bootstrap

Workers use `NestFactory.createApplicationContext()` (no HTTP). Each mode loads its own NestJS module:
- `AppSchedulerModule` — shd
- `AppIngestionModule` — ing
- `AppSignalModule` — sig
- `AppMonitorModule` — mon

---

## Datasource Schedules

| Datasource | Interval | Destination |
|---|---|---|
| GoldAPI (XAU/USD) | 1 min | MarketPrice |
| Binance Spot (PAXG) | 1 min | MarketPrice |
| Binance Futures (PAXG) | 1 min | MarketPrice + SentimentSignal |
| OKX (PAXG/USDT) | 5 min | MarketPrice |
| Bitfinex (XAUT/USD) | 5 min | MarketPrice |
| Yahoo Finance (6 symbols: GC=F, VIX, BTC, SPX, CL, DXY) | 1 hour | MarketPrice |
| NewsAPI + LLM analysis | 1 hour | SentimentSignal |
| FRED (11 macro series) | Daily | MacroIndicator |
| ByteTree BOLD (ETF flows) | Daily | SentimentSignal |
| compute_indicators | 5 min | TechnicalIndicator |
| Signal generation (LLM) | 1h / 4h per account | Signal |
| Signal expiry check | 1 min | Signal (status → EXPIRED) |

---

## Environment Variables

```
MONGODB_URI          # MongoDB connection string
PORT                 # API port (default 3008)
MODE                 # api | shd | ing | sig | mon (overridden by argv[2])
REDIS_HOST           # BullMQ Redis host
REDIS_PORT           # BullMQ Redis port
REDIS_PASSWORD       # Redis password (optional)
REDIS_DB             # Redis DB index

GOLDAPI_KEY          # GoldAPI.io key
FRED_API_KEY         # FRED API key
NEWSAPI_KEY          # NewsAPI.org key
BINANCE_API_KEY      # Optional, for private endpoints
BINANCE_SECRET_KEY   # Optional

LLM_BASE_URL         # OpenAI-compatible base URL
LLM_API_KEY          # LLM API key
LLM_MODEL            # Default model (e.g. gpt-4o-mini)
LLM_SIGNAL_MODEL     # Model for signal generation (fallback: LLM_MODEL → gpt-4o-mini)
```

### LLM Provider Support

| Provider | LLM_BASE_URL | Example model |
|----------|-------------|---------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash-exp` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio (local) | `http://localhost:1234/v1` | any loaded model |
| LiteLLM (self-hosted) | custom URL | multi-provider proxy |

---

## Debug / Testing Endpoints

No auth required — **disable in production**.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/signals/trigger-generation` | `{ accountId, asset?, timeframe? }` | Trigger LLM signal immediately |
| POST | `/positions/debug-create` | `{ accountId, symbol, side, entryPrice, quantity, stopLossPrice?, takeProfitPrice? }` | Create position directly |

---

## Verification

```bash
nx run dgt:build
npx tsc --noEmit -p services/dgt/tsconfig.app.json
nx run dgt:api
curl http://localhost:3008/health
open http://localhost:3008/api-docs
```

---

## Related Docs

- [`docs/dgt/01-ARCHITECTURE.md`](../../docs/dgt/01-ARCHITECTURE.md) — Architecture overview
- [`docs/dgt/02-ENTITY-DESIGN.md`](../../docs/dgt/02-ENTITY-DESIGN.md) — Entity & schema design
- [`docs/dgt/03-DATA-INGESTION-FLOW.md`](../../docs/dgt/03-DATA-INGESTION-FLOW.md) — Data ingestion flow
- [`docs/dgt/PLAN-MVP-v1.0.md`](../../docs/dgt/PLAN-MVP-v1.0.md) — MVP implementation plan
