# CLAUDE.md - DGT Service

## Service Overview

DGT (Digital Gold Trader) is a paper trading and market data service for gold & crypto assets. Port 3008 (dev), 3380-3389 (prod).

Three modes: **api** (HTTP REST), **shd** (scheduler worker), **ing** (data ingestion worker).

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Account | `src/modules/account/` | Trading accounts (paper/live), exchange config, balance tracking |
| RiskProfile | `src/modules/risk-profile/` | Risk parameters per account (stop-loss, position size, leverage) |
| MarketPrice | `src/modules/market-price/` | OHLCV price data from 6 sources, read-only API |
| TechnicalIndicator | `src/modules/technical-indicator/` | Computed indicators (RSI, MACD, EMA, BB, ATR...), read-only API |
| MacroIndicator | `src/modules/macro-indicator/` | FRED macro series (Fed Funds, CPI, DXY...), read-only API |
| SentimentSignal | `src/modules/sentiment-signal/` | News sentiment, ETF flows, funding rates, read-only API |
| Order | `src/modules/order/` | Paper trading orders (market/limit/stop_limit) |
| Trade | `src/modules/trade/` | Executed trade records (immutable after creation) |
| Position | `src/modules/position/` | Open/closed positions with PnL tracking |
| Signal | `src/modules/signal/` | AI-generated trading signals (BUY/SELL/HOLD) with LLM insight |
| Bot | `src/modules/bot/` | Bot state machine (CREATED/RUNNING/PAUSED/STOPPED/ERROR) |
| BotActivityLog | `src/modules/bot-activity-log/` | Append-only activity log for bot actions, TTL 90 days |
| PortfolioSnapshot | `src/modules/portfolio-snapshot/` | Daily equity snapshots for equity curve & drawdown charts |
| Analytics | `src/modules/analytics/` | Aggregated stats, PnL chart, equity curve, drawdown, CSV export |

## Module Groups

### Group 1: User & Account (BaseService + RBAC)
- `Account`, `RiskProfile` — user-owned, full CRUD, filtered by `owner.userId`

### Group 2: Market Data (SharedDataService, no RBAC)
- `MarketPrice`, `TechnicalIndicator`, `MacroIndicator`, `SentimentSignal` — shared data, read-only API, written only by workers

### Group 3: Trading (BaseService + RBAC)
- `Order`, `Trade`, `Position` — user-owned, Trade is append-only (no update/delete)

### Group 4: Analytics (read-only aggregation)
- `PortfolioSnapshot` — daily snapshots written by monitoring worker; read by analytics
- `Analytics` — no MongoDB collection; aggregates from Position, Trade, PortfolioSnapshot

### Group 5: AI Signal & Bot (BaseService + RBAC)
- `Signal` — per-account LLM-generated signals, filtered by owner.userId; TTL 90 days
- `Bot` — bot lifecycle management with state machine validation
- `BotActivityLog` — append-only, no update/delete; TTL 90 days

## Key Architecture Patterns

### NotificationService
`src/shared/notification.service.ts` — sends alerts to Discord (embed format) and/or Telegram (Markdown).
- Config per account: `account.notifications.{discordWebhookUrl, telegramBotToken, telegramChatId, enabled}`
- Called from monitoring worker on SL/TP hit, trade execution, bot state changes
- Uses `Promise.allSettled` — one channel failure does not block the other

### SharedDataService
`src/shared/shared-data.service.ts` — generic service for Group 2. Does NOT extend BaseService (no RBAC ownership checks).
Methods: `insert`, `insertMany`, `upsert`, `findLatest`, `findByRange`, `findAll`.

### Worker Modes
- **shd** (Scheduler): Registers 10 repeatable BullMQ jobs on startup (`onModuleInit`). Clears old jobs first to prevent duplicates on restart.
- **ing** (Data Ingestion): Consumes jobs, dispatches to collectors via switch/case in `DataIngestionProcessor`.
- Both use `AppWorkerModule` (no HTTP), bootstrapped via `NestFactory.createApplicationContext()`.

### Worker Modes (Updated)
- **shd** (Scheduler): Data ingestion scheduler
- **ing** (Data Ingestion): Data collectors processor
- **sig** (Signal): Signal generation scheduler + LLM processor (queue: dgt-signal-generation)
- **mon** (Monitor): SL/TP monitoring worker — polls open positions every 10s, auto-closes on SL/TP hit

### Collector Pattern
`src/collectors/base.collector.ts` — abstract base class with:
- `fetchWithRetry()`: exponential backoff, 429 rate-limit handling (waits retry-after), 401/403 no-retry
- Each collector implements `collect()`: Fetch → Transform → Save

### Technical Indicator Computation
Triggered as a scheduled job (`compute_indicators`, every 5 min) — NOT post-save hooks.
- `math.util.ts`: pure functions (SMA, EMA, RSI, MACD, Bollinger Bands, ATR, HV, VolumeRatio)
- `indicator-computation.service.ts`: reads last 220 MarketPrice candles, computes 17 fields, upserts TechnicalIndicator

### Mode Selection (main.ts)
`process.argv[2]` takes priority over `process.env.MODE` (important: nx targets pass mode via args).

## Datasource Schedules

| Datasource | Interval | Destination |
|---|---|---|
| GoldAPI (XAU/USD) | 1 min | MarketPrice |
| Binance Spot (PAXG) | 1 min | MarketPrice |
| Binance Futures (PAXG) | 1 min | MarketPrice + SentimentSignal |
| OKX (PAXG/USDT) | 5 min | MarketPrice |
| Bitfinex (XAUT/USD) | 5 min | MarketPrice |
| Yahoo Finance (6 symbols) | 1 hour | MarketPrice |
| NewsAPI + LLM | 1 hour | SentimentSignal |
| FRED (11 macro series) | Daily | MacroIndicator |
| ByteTree BOLD (ETF flows) | Daily | SentimentSignal |
| compute_indicators | 5 min | TechnicalIndicator |
| Signal Generation (LLM) | 1h / 4h per account | Signal |
| Signal Expiry Check | 1 min | Signal (status→EXPIRED) |

## Environment Variables

```
MONGODB_URI          # MongoDB connection string
PORT                 # API port (default 3008)
MODE                 # api | shd | ing | sig | mon (overridden by argv[2])
REDIS_HOST           # BullMQ Redis host
REDIS_PORT           # BullMQ Redis port
REDIS_PASSWORD       # Redis password (optional)
REDIS_DB             # Redis DB index
GOLDAPI_KEY          # GoldAPI.io key (required for goldapi collector)
FRED_API_KEY         # FRED API key (required for fred collector)
NEWSAPI_KEY          # NewsAPI.org key (required for newsapi collector)
LLM_BASE_URL         # OpenAI-compatible base URL (e.g. https://api.openai.com/v1)
LLM_API_KEY          # LLM API key
LLM_MODEL            # Default LLM model (e.g. gpt-4o-mini, gemini-2.0-flash-exp)
LLM_SIGNAL_MODEL     # LLM model for signal generation (fallback: LLM_MODEL → gpt-4o-mini)
BINANCE_API_KEY      # Binance API key (optional, for private endpoints)
BINANCE_SECRET_KEY   # Binance secret key (optional)
```

### LLM Provider Support

`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` use the OpenAI-compatible `/chat/completions` format.
Supported providers (set `LLM_BASE_URL` accordingly):

| Provider | LLM_BASE_URL | Example model |
|----------|-------------|---------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash-exp` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio (local) | `http://localhost:1234/v1` | any loaded model |
| LiteLLM (self-hosted) | custom URL | multi-provider proxy |

## Commands

```bash
nx run dgt:build     # Build
nx run dgt:api       # API mode (REST, port 3008)
nx run dgt:wrk:shd   # Scheduler worker
nx run dgt:wrk:ing   # Data ingestion worker
nx run dgt:wrk:sig   # Signal generation worker
nx run dgt:wrk:mon   # SL/TP monitoring worker
```

## Debug / Testing Endpoints

No auth required — **disable in production**.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/signals/trigger-generation` | `{ accountId, asset?, timeframe? }` | Trigger LLM signal immediately |
| POST | `/positions/debug-create` | `{ accountId, symbol, side, entryPrice, quantity, stopLossPrice?, takeProfitPrice? }` | Create position directly |

## Module-Specific Documentation

- **Architecture**: `docs/dgt/01-ARCHITECTURE.md`
- **Entity Design**: `docs/dgt/02-ENTITY-DESIGN.md`
- **Data Ingestion Flow**: `docs/dgt/03-DATA-INGESTION-FLOW.md`
- **Implementation Plan**: `docs/dgt/PLAN-MVP-v1.0.md`
