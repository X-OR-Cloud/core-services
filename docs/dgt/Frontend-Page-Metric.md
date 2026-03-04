# Page Data Structure & Features — Kaisar AI Gold Trader

## 1. Dashboard Page
- **Purpose**: Portfolio overview and asset allocation.
- **Description**: Displays aggregated portfolio value over time, asset allocation breakdown (PAXG, XAUT, USDT), profit/loss rate, and live market prices of major assets via price cards.
- **Data Fields**:
  - `AssetAllocation`: `name` (string), `value` — percentage (number), `amount` — USD string (string), `color` (string).
  - `AssetList`: `name` (string), `label` — full name (string), `price` (string), `change` (string), `positive` — up/down flag (boolean), `holdings` (string), `pct` — weight percentage (number).
  - `PriceCard`: `name` (string), `badge` (string), `subtitle` (string), `price` (string), `change` (string), `isPositive` (boolean), `highLow` (string), `highLowLabel` (string), `sparkline` — array of `{ v: number }`, `symbol` — Binance stream symbol (string).
- **Key Metrics**:
  - Total portfolio value: displayed as USD currency string.
  - PnL (Profit & Loss): dollar value and percentage string.
- **Sample data** (`src/mockdata/dashboard.ts`):

```json
// portfolioHistory
[
  { "date": "18 Feb", "value": 45000,  "gold": 40000 },
  { "date": "19 Feb", "value": 42000,  "gold": 41000 },
  { "date": "Today",  "value": 124592, "gold": 52000  }
]

// assetAllocation
[
  { "name": "PAXG", "value": 60.2, "amount": "$74,755", "color": "#f59e0b" },
  { "name": "XAUT", "value": 25.1, "amount": "$31,148", "color": "#ea580c" },
  { "name": "USDT", "value": 14.7, "amount": "$18,688", "color": "#10b981" }
]

// assetList
[
  { "name": "PAXG", "label": "PAX Gold",    "price": "$2,345.10", "change": "+0.85%", "positive": true,  "holdings": "31.92 PAXG", "color": "#f59e0b", "pct": 60.2 },
  { "name": "XAUT", "label": "Tether Gold", "price": "$2,342.80", "change": "-0.21%", "positive": false, "holdings": "13.29 XAUT", "color": "#ea580c", "pct": 25.1 },
  { "name": "USDT", "label": "Tether USD",  "price": "$1.00",     "change": "+0.01%", "positive": true,  "holdings": "$18,688",    "color": "#10b981", "pct": 14.7 }
]

// priceCards
[
  {
    "name": "PAXG", "badge": "ERC-20", "subtitle": "Pax Gold / USDT",
    "price": "$2,345.10", "change": "+0.85%", "isPositive": true,
    "highLow": "$2,360", "highLowLabel": "24H HIGH",
    "sparkline": [{ "v": 10 }, { "v": 14 }, { "v": 11 }, { "v": 17 }, { "v": 15 }, { "v": 20 }, { "v": 22 }],
    "symbol": "paxgusdt"
  },
  {
    "name": "XAUT", "badge": "GOLD", "subtitle": "Tether Gold / USDT",
    "price": "$2,342.80", "change": "-0.21%", "isPositive": false,
    "highLow": "$2,340", "highLowLabel": "24H LOW",
    "sparkline": [{ "v": 22 }, { "v": 19 }, { "v": 21 }, { "v": 15 }, { "v": 13 }, { "v": 11 }, { "v": 10 }],
    "symbol": "xautusdt"
  }
]
```

---

## 2. Live Trading Terminal Page
- **Purpose**: Live trading interface.
- **Description**: A terminal interface providing candlestick chart (TradingView), low-latency Order Book, and live trade history (Live Trades) for gold asset pairs (PAXG/USDT, XAUT/USDT) in real time.
- **Live Trading**: Order book, ticker, chart, and recent trades data are fetched **live from Binance** via WebSockets.

---

## 3. AI Bot Management Page
- **Purpose**: AI trading bot management.
- **Description**: View active, paused, or error bots; monitor per-bot performance (PnL, win rate, max drawdown) and the bot's market action history.
- **Data Fields**:
  - `Bot`: `id` (string), `name` (string), `badge` — strategy label enum (string), `status` — running/paused/stopped/error (string), `statusLabel` (string), `strategy` (string), `exchange` (string), `uptime` (string), `totalPnl` (string), `totalPnlPct` (string), `pnlPositive` (boolean), `todayPnl` (string), `winRate` (string), `winRecord` (string), `drawdown` (string), `drawdownMax` (string), `position` — active position object (object), `errorMsg` (string).
  - `ActivityLog`: `time` (string), `bot` (string), `action` (string), `actionType` — buy/sell/warning/info/error (string), `details` (string), `status` — SUCCESS/WARNING/ERROR/INFO (string).
- **Key Metrics**:
  - `activeBots`: total running bots (number).
  - `totalPnl`: aggregate PnL from all bots (string).
  - `activeVolume`: trading volume under bot management (string).
- **Sample data** (`src/mockdata/aibot.ts`):

```json
// botStats
{
  "activeBots": 3,
  "maxBots": 5,
  "totalPnl": "+$1,245.80",
  "totalPnlPct": "+2.4%",
  "activeVolume": "$45,200",
  "systemOk": true
}

// bots (excerpt)
[
  {
    "id": "alpha-trend-xaut",
    "name": "Alpha Trend XAUT",
    "badge": "AI STRATEGY",
    "status": "running",
    "strategy": "Trend Following",
    "exchange": "Binance",
    "uptime": "4d 12h",
    "totalPnl": "+$842.50",
    "totalPnlPct": "+12.4%",
    "pnlPositive": true,
    "todayPnl": "+$124.20",
    "winRate": "68.5%",
    "winRecord": "42/61",
    "drawdown": "3.2%",
    "drawdownMax": "15%",
    "position": { "side": "LONG", "symbol": "XAUT/USDT", "pnl": "+$45.28", "entry": "2,450.00" }
  },
  {
    "id": "momentum-s",
    "name": "Momentum S",
    "badge": "LEGACY",
    "status": "stopped",
    "statusLabel": "API Error",
    "strategy": "Trend",
    "exchange": "Binance",
    "uptime": "—",
    "totalPnl": "-$32.00",
    "totalPnlPct": "-0.8%",
    "pnlPositive": false,
    "winRate": "51.0%",
    "winRecord": "8/15",
    "drawdown": "4.2%",
    "drawdownMax": "10%",
    "errorMsg": "Connection Lost",
    "errorSub": "The bot stopped due to API key expiration. Please update configuration."
  }
]

// activityLogs (excerpt)
[
  {
    "time": "14:32:05",
    "bot": "Alpha Trend XAUT",
    "action": "Buy Order Filled",
    "actionType": "buy",
    "details": "Bought 1.5 XAUT @ $2,450.00",
    "status": "SUCCESS"
  },
  {
    "time": "13:20:48",
    "bot": "Momentum S",
    "action": "API Error",
    "actionType": "error",
    "details": "API key expired — bot halted",
    "status": "ERROR"
  }
]
```

### Bot Actions API

All actions target a specific bot by `botId`. No existing implementation — **needs to be built**.

#### `PATCH /api/bots/:botId/status` — Stop / Pause / Resume

```json
// Request body
{ "action": "pause" }   // "pause" | "stop" | "resume"

// Response (success)
{
  "botId": "alpha-trend-xaut",
  "action": "pause",
  "previousStatus": "running",
  "newStatus": "paused",
  "statusLabel": "Manually paused",
  "timestamp": "2026-03-03T14:10:00Z"
}

// Response (error)
{
  "error": "INVALID_TRANSITION",
  "message": "Cannot resume a bot with status 'stopped'. Please restart instead."
}
```

#### `PATCH /api/bots/:botId/config` — Update Bot Configuration

```json
// Request body (all fields optional — partial update)
{
  "tradingMode":   "live",
  "maxEntrySize":  "$500",
  "takeProfit":    "2.5%",
  "stopLoss":      "1.0%",
  "maxDrawdown":   10,
  "exchange":      "Binance",
  "riskProfile":  "Balanced"
}

// Response (success)
{
  "botId": "alpha-trend-xaut",
  "updated": ["maxEntrySize", "takeProfit", "stopLoss"],
  "config": {
    "tradingMode":  "live",
    "maxEntrySize": "$500",
    "takeProfit":   "2.5%",
    "stopLoss":     "1.0%",
    "maxDrawdown":  10,
    "exchange":     "Binance",
    "riskProfile":  "Balanced"
  },
  "timestamp": "2026-03-03T14:15:00Z"
}
```

#### `DELETE /api/bots/:botId` — Delete Bot

```json
// Request: DELETE /api/bots/alpha-trend-xaut
// No request body required.
// Pre-condition: bot must be in "stopped" or "paused" status.

// Response (success)
{
  "botId":   "alpha-trend-xaut",
  "deleted": true,
  "message": "Bot 'Alpha Trend XAUT' has been permanently deleted.",
  "timestamp": "2026-03-03T14:20:00Z"
}

// Response (error — bot still running)
{
  "error": "BOT_ACTIVE",
  "message": "Cannot delete a running bot. Stop the bot before deleting."
}
```

> **Note**: None of the above endpoints exist yet in the codebase. They will need to be implemented in the backend and wired to UI button handlers in `AIBotManagementPage`.

---

## 4. Analytics Page
- **Purpose**: Performance analysis and trade history.
- **Description**: Provides portfolio performance reports, net PnL charts over time ranges (24h, 7d, 30d, 90d, All), list of open positions, and closed trade history.
- **Data Fields**:
  - `OpenPosition`: `symbol` (string), `side` — LONG/SHORT (string), `entry` (string), `pnl` (string), `pnlPositive` (boolean).
  - `TradeHistoryItem`: `id` (string), `symbol` (string), `side` (string), `entry` (string), `exit` (string), `pnl` (string), `pnlPositive` (boolean), `duration` (string), `date` (string).
  - `AnalyticsSummary`: `netPnl` (string), `netPnlPct` (string), `realized` (string), `unrealized` (string), `totalVolume` (string), `totalTrades` (number), `winRate` (number), `wins` (number), `losses` (number).
- **Key Metrics**:
  - `winRate`: win rate of trades (number).
  - `totalTrades` / `wins` / `losses`: trade counts (number).
- **Sample data** (`src/mockdata/analytics.ts`):

```json
// openPositions (excerpt)
[
  { "symbol": "PAXG/USDT", "side": "LONG",  "entry": "2,045.50", "pnl": "+$124.50", "pnlPositive": true  },
  { "symbol": "XAUT/USDT", "side": "SHORT", "entry": "2,038.10", "pnl": "+$45.20",  "pnlPositive": true  },
  { "symbol": "PAXG/USDT", "side": "LONG",  "entry": "2,050.00", "pnl": "-$12.80",  "pnlPositive": false }
]

// tradeHistory (excerpt)
[
  { "id": "T-001", "symbol": "PAXG/USDT", "side": "LONG",  "entry": "$2,310.00", "exit": "$2,345.10", "pnl": "+$175.50", "pnlPositive": true,  "duration": "4h 22m", "date": "28 Feb 2026" },
  { "id": "T-002", "symbol": "XAUT/USDT", "side": "SHORT", "entry": "$2,368.00", "exit": "$2,342.80", "pnl": "+$126.00", "pnlPositive": true,  "duration": "2h 10m", "date": "27 Feb 2026" },
  { "id": "T-003", "symbol": "PAXG/USDT", "side": "LONG",  "entry": "$2,290.00", "exit": "$2,278.50", "pnl": "-$57.50",  "pnlPositive": false, "duration": "6h 05m", "date": "26 Feb 2026" }
]

// rangeData["7d"].summary
{
  "netPnl": "+$892.40",
  "netPnlPct": "+3.9%",
  "realized": "+$735.50",
  "unrealized": "+$156.90",
  "totalVolume": "$218K",
  "totalTrades": 12,
  "winRate": 75,
  "wins": 9,
  "losses": 3
}
```

---

## 5. Market Intelligence / Insight Page
- **Purpose**: AI trading signals (Smart Signals only).
- **Description**: Displays AI-computed real-time trading signals (BUY/SELL/HOLD/NO TRADE) for gold asset pairs.
- **Note**: Macro and On-chain tabs are **temporarily hidden** — not included in current scope.
- **Data Fields**:
  - `Signal`: `id` (string), `symbol` (string), `action` — BUY/SELL/HOLD/NO TRADE (string), `timeAgo` (string), `strategy` (string), `confidence` (number), `signalStrength` — 1–3 (number), `entry` (string), `stopLoss` (string), `takeProfit` (string), `warningLabel` (string), `warningDetail` (string), `description` (string).
- **Key Metrics**:
  - `confidence`: AI model confidence score percentage (number).
- **Sample data** (`src/mockdata/insight.ts`):

```json
// signals (excerpt)
[
  {
    "id": "sig-001", "symbol": "PAXG/USDT", "action": "BUY",
    "timeAgo": "5 min ago", "strategy": "H4 Strategy",
    "confidence": 87, "signalStrength": 3,
    "entry": "$2,042.50", "stopLoss": "$2,020.00", "takeProfit": "$2,085.00",
    "isNew": true, "locked": false
  },
  {
    "id": "sig-002", "symbol": "XAUT/USDT", "action": "NO TRADE",
    "timeAgo": "1 hour ago", "strategy": "Liquidity Check",
    "warningLabel": "Spread > 0.05%", "warningDetail": "Current: 0.12%",
    "description": "Liquidity is currently too low for safe entry. AI suggests waiting for the US session open."
  },
  {
    "id": "sig-003", "symbol": "PAXG/USDT", "action": "SELL",
    "timeAgo": "2 hours ago", "strategy": "Mean Reversion",
    "confidence": 72, "signalStrength": 2,
    "entry": "$2,055.00", "stopLoss": "$2,065.00", "takeProfit": "$2,030.00",
    "isNew": false, "locked": false
  },
  {
    "id": "sig-004", "symbol": "XAUT/USDT", "action": "HOLD",
    "timeAgo": "4 hours ago", "strategy": "Trend Following",
    "trendAnalysis": "Trend Analysis", "trendValue": "Neutral",
    "description": "Price consolidating between $2,035 and $2,050. No clear directional bias.",
    "lastPrice": "$2,041.80", "support": "$2,030.00"
  }
]
```

### Modals (`src/pages/InsightPage.tsx`)

Each `SignalCard` exposes 4 action buttons that open the following modals:

#### `AnalysisModal`
- **Trigger**: "Analysis" button on a signal card.
- **Props**: `sig: Signal`, `onClose: () => void`
- **Purpose**: Displays full AI reasoning behind the signal.
- **Content**:
  - AI Confidence Score — `LinearProgress` bar + percentage label.
  - Signal Strength — star rating (1–3) with label (Moderate / Strong / Very Strong).
  - Price Levels — Entry, Stop Loss, Take Profit displayed as highlighted pills.
  - AI Reasoning — bullet list of 4–5 contextual reasons auto-generated per action type (BUY/SELL/HOLD/NO TRADE).

```json
// Reasons generated per action (hardcoded logic in component)
{
  "BUY":  ["H4 bullish engulfing pattern confirmed", "RSI recovering from oversold zone (38→52)", "Volume surge +32% vs 20-day avg", "DXY pullback supports gold demand", "EMA 50/200 golden cross approaching"],
  "SELL": ["Bearish RSI divergence on H4", "Price rejected at key resistance $2,060", "Volume declining on pushes higher", "DXY strength dampening gold", "ATR contracting — breakout likely downward"],
  "HOLD": ["Trend exhaustion signals detected", "Price ranging inside $2,035–$2,050 band", "No clear catalyst in next 4h", "Macro uncertainty ahead of CPI data"]
}
```

---

#### `ChartModal`
- **Trigger**: "Chart" button on a signal card.
- **Props**: `sig: Signal`, `onClose: () => void`
- **Purpose**: Displays a price chart (AreaChart via Recharts) for the signal's symbol.
- **Content**:
  - Header: symbol name, current price, % change chip with trend icon.
  - Time range selector: `1H` / `4H` / `1D` / `1W` — slices generated mock price data accordingly.
  - Area chart with gradient fill colored by signal action (green for BUY, red for SELL, amber for HOLD/NO TRADE).
  - Key levels overlay: Entry, Stop Loss, Take Profit as reference lines.
  - Info row: Strategy name, Confidence %, Signal Strength stars.

```json
// Chart data point shape (generated by genChartData())
{ "time": "10:00", "price": 2039.8 }
// Base price: PAXG → 2039.8, XAUT → 2041.5
// Range slices: 1H = last 8 points, 4H = last 24 points, 1D/1W = all 48 points
```

---

#### `WatchlistModal`
- **Trigger**: "Watch" (star) button on a signal card.
- **Props**: `initialSymbol: string`, `onClose: () => void`
- **Purpose**: Manage a session-scoped watchlist of symbols.
- **Content**:
  - List of watched symbols, each showing: symbol name, current price, 24h change with trend icon.
  - The triggering symbol is auto-added to the top of the list and highlighted in blue.
  - Each row has a delete (trash) icon to remove the symbol from the list.
  - Empty state shown when list is cleared.
  - Footer note: *"Watchlist is saved for this session only"* — not persisted.

```json
// Default watchlist entries (DEFAULT_WATCHLIST constant)
[
  { "symbol": "XAU/USD",   "price": 2041.50, "change": "+0.32%", "up": true  },
  { "symbol": "PAXG/USDT", "price": 2039.80, "change": "+0.28%", "up": true  },
  { "symbol": "XAG/USD",   "price": 23.45,   "change": "-0.12%", "up": false }
]
```

---

#### `TradeModal`
- **Trigger**: "Trade" button on a signal card (only for BUY/SELL signals; HOLD and NO TRADE are disabled).
- **Props**: `sig: Signal`, `onClose: () => void`, `onConfirm: () => void`
- **Purpose**: Order confirmation dialog before executing a trade via connected exchange.
- **Content**:
  - Symbol avatar + action badge header.
  - Order summary table: Direction, Entry Price, Stop Loss, Take Profit, AI Confidence.
  - Warning banner: *"By confirming, you authorize this trade to be executed via your connected exchange."*
  - Action buttons: **Cancel** (closes modal) / **Confirm {action}** (calls `onConfirm`, shows Snackbar success toast).
- **Note**: `onConfirm` currently only triggers a UI success toast — **no real order execution implemented**.

```json
// Order summary fields displayed in modal
{
  "Direction":     "BUY",
  "Entry Price":   "$2,042.50",
  "Stop Loss":     "$2,020.00",
  "Take Profit":   "$2,085.00",
  "AI Confidence": "87%"
}
```

---

## 6. Create AI Bot Page
- **Purpose**: Configure and deploy a new bot.
- **Description**: 2-step wizard: 1. Configure risk tolerance and loss limits. 2. Select asset pair, trading mode (Sandbox / Live), allocated capital, and basic trading parameters.
- **Data Fields**:
  - `RiskSettings`: `riskProfile` — Conservative/Balanced/Aggressive (string), `maxDrawdownLimit` (number), `dailyStopLossUSD` (string).
  - `AIConfig`: `tradingMode` — Sandbox/Live (string), `assetType` (string), `exchangeApiAccount` (string), `totalCapital` (string), `maxEntrySize` (string), `takeProfit` (string), `stopLoss` (string).
- **Key Metrics**:
  - `maxDrawdownSlider`: percentage (number).
- **Sample data**: Entered via UI Forms — no static mock data.

---

## 7. Settings & Security Page
- **Purpose**: Fund account and API configuration.
- **Description**: Configure institutional identity profile, manage secure API keys for exchanges, set permissions, and define macro leverage limits for the entire system.
- **Data Fields**:
  - `InstitutionalProfile`: `entityName` — fund manager name (string), `terminalId` — Terminal Access ID (string), `apiKey` (string).
  - `RiskConstraint`: `title` — rule title (string), `subtitle` — description (string), `value` — current cap value (string), `defaultValue` (number), `min` (number), `max` (number), `minLabel` (string), `maxLabel` (string).
- **Key Metrics**:
  - `Max Exposure`, `Leverage Cap`: (number).
- **Sample data** (`src/mockdata/settings.ts`):

```json
// institutionalProfileMock
{
  "entityName": "Obsidian Capital Management",
  "terminalId": "OBS-8824-ALPHA-SECURE",
  "apiKey": "••••••••••••••••••••••••••••••"
}

// riskConstraintsMock (excerpt)
[
  {
    "title": "Maximum Daily Drawdown",
    "subtitle": "System-Wide Auto-Liquidation Threshold",
    "value": "5.0%", "defaultValue": 5, "min": 1, "max": 15,
    "minLabel": "1% CONSERVATIVE", "maxLabel": "15% AGGRESSIVE"
  },
  {
    "title": "Leverage Cap (Aggregate)",
    "subtitle": "Maximum Effective Gearing",
    "value": "3.0x", "defaultValue": 3, "min": 1, "max": 20,
    "minLabel": "1:1 NO LEVERAGE", "maxLabel": "1:20 HIGH OCTANE"
  }
]
```
