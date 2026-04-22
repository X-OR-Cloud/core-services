# DGT Inspector App — API Specification

**Version:** 1.0 | **Date:** 2026-04-22 | **Audience:** FE Agent / Financial Analyst Team

---

## Tổng quan

Tài liệu này mô tả toàn bộ API cần thiết để xây dựng webapp **DGT Inspector** — công cụ debug/inspect nội bộ phục vụ team phân tích tài chính nghiên cứu sâu vào dữ liệu, tín hiệu, và hiệu suất của hệ thống DGT.

### Base URLs

| Môi trường | DGT Service | IAM Service |
|-----------|-------------|-------------|
| Local | `http://localhost:3008` | `http://localhost:3001` |
| Production | `https://xsai-api.x-or.cloud/dgt` | `https://api.x-or.cloud/dev/iam-v2` |

### Authentication

Inspector app yêu cầu user **paste Access Token** vào giao diện. Token được lưu trong memory (không persist) và đính kèm vào mọi request:

```
Authorization: Bearer <access_token>
```

Khi token hết hạn (nhận `401`), app yêu cầu user paste token mới — **không tự động refresh** (inspector app là internal tool, không cần UX phức tạp).

### Quy ước

- Tất cả timestamp là ISO 8601 UTC
- Tất cả giá trị tiền tệ là USD
- `null` = chưa có data, không phải lỗi
- Tất cả endpoint đều yêu cầu JWT trừ khi ghi chú khác

---

## Mục lục

| # | Nhóm | Endpoints |
|---|------|-----------|
| 1 | [Auth](#1-auth) | Token paste, profile |
| 2 | [Signal Audit Trail](#2-signal-audit-trail) | Context, Raw LLM, Accuracy |
| 3 | [Technical Indicator History](#3-technical-indicator-history) | Series lịch sử indicators |
| 4 | [Trade Attribution](#4-trade-attribution) | Liên kết trade ↔ signal |
| 5 | [Market Data Raw](#5-market-data-raw) | OHLCV candles, multi-source |
| 6 | [Performance Deep Dive](#6-performance-deep-dive) | PnL phân tích sâu |
| 7 | [Bot Decision Inspector](#7-bot-decision-inspector) | Logic quyết định bot |
| 8 | [Macro & Sentiment](#8-macro--sentiment) | Dữ liệu vĩ mô, sentiment |
| 9 | [System Data Quality](#9-system-data-quality) | Độ tươi mới data, gaps |
| 10 | [Existing APIs](#10-existing-apis-tận-dụng-trực-tiếp) | API sẵn có dùng lại |

---

## 1. Auth

### 1.1 Lấy thông tin user hiện tại

**Mục đích:** Verify token hợp lệ và hiển thị thông tin user đang dùng inspector.

```
GET /auth/profile
```
> Base: **IAM Service**

**Response 200:**
```json
{
  "_id": "69a1b2c3d4e5f6a7b8c9d0e1",
  "email": "dev@x-or.cloud",
  "username": "devuser",
  "fullname": "Hoàng Việt Dũng",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

**Mục đích trong inspector:** App hiển thị "Đang inspect với tư cách: devuser" để xác nhận token đúng người.

---

## 2. Signal Audit Trail

Nhóm API quan trọng nhất cho việc phân tích chất lượng signal — giúp hiểu **LLM đã nhìn thấy gì** và **quyết định dựa trên gì**.

### 2.1 Danh sách signals

**Mục đích:** Điểm khởi đầu — lấy danh sách signals để chọn một signal cần inspect sâu.

```
GET /signals
```

**Query parameters:**

| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `timeframe` | `string` | `1h,4h` | Filter theo timeframe: `1h`, `4h`, `15m` |
| `status` | `string` | _(tất cả)_ | `ACTIVE`, `EXPIRED`, `EXECUTED`, `IGNORED`, `SUPERSEDED` |
| `signalType` | `string` | `BUY,SELL` | `BUY`, `SELL`, `HOLD` |
| `accountId` | `string` | _(tất cả accounts)_ | MongoDB ObjectId |
| `page` | `number` | `1` | |
| `limit` | `number` | `20` | |
| `sort` | `string` | `createdAt:desc` | |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69c1d2e3f4a5b6c7d8e9f0a1",
      "asset": "PAXGUSDT",
      "timeframe": "4h",
      "signalType": "BUY",
      "confidence": 78,
      "confidenceLabel": "high",
      "status": "EXECUTED",
      "priceAtCreation": 3142.50,
      "entry": 3145.00,
      "takeProfit": 3290.00,
      "stopLoss": 3070.00,
      "insight": "Strong bullish momentum with declining DXY and positive ETF inflows.",
      "keyFactors": [
        { "factor": "RSI momentum", "weight": "Strong" },
        { "factor": "DXY weakening", "weight": "Moderate" }
      ],
      "indicatorsUsed": ["RSI14", "MACD", "EMA50", "ATR14"],
      "macroFactors": ["Weakening USD (DXY=101.2)", "Positive ETF inflows +8500oz"],
      "llmModel": "gemini-2.0-flash-exp",
      "expiresAt": "2026-04-20T00:00:00Z",
      "executedAt": "2026-04-18T08:15:00Z",
      "createdAt": "2026-04-18T04:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 145 },
  "statistics": { "total": 145 }
}
```

**Ý nghĩa các fields:**

| Field | Ý nghĩa |
|-------|---------|
| `signalType` | Hướng tín hiệu: `BUY` (mua), `SELL` (bán), `HOLD` (giữ) |
| `confidence` | Độ tin cậy 0–100. LLM tự đánh giá dựa trên mức độ đồng thuận của các chỉ số |
| `confidenceLabel` | `low` (<50), `medium` (50–69), `high` (70–84), `very_high` (≥85) |
| `status` | Trạng thái vòng đời signal (xem bảng enum bên dưới) |
| `priceAtCreation` | Giá PAXG tại thời điểm LLM generate signal — dùng để đánh giá signal đúng/sai |
| `entry` | Giá entry LLM đề xuất (gần với `priceAtCreation`, trong ~0.5%) |
| `takeProfit` | Giá mục tiêu chốt lời LLM đề xuất |
| `stopLoss` | Giá cắt lỗ LLM đề xuất |
| `keyFactors` | Các yếu tố chính LLM đưa ra để giải thích signal |
| `macroFactors` | Điều kiện vĩ mô ảnh hưởng tín hiệu (DXY, ETF flows...) |

**`status` enum:**

| Giá trị | Ý nghĩa |
|---------|---------|
| `ACTIVE` | Còn hiệu lực, chưa hết hạn |
| `EXPIRED` | Đã quá `expiresAt` mà không được execute |
| `EXECUTED` | Bot hoặc user đã mở lệnh theo signal này |
| `IGNORED` | User chủ động bỏ qua |
| `SUPERSEDED` | Bị thay thế bởi signal mới hơn cùng asset/timeframe |

---

### 2.2 Chi tiết signal đầy đủ

**Mục đích:** Xem toàn bộ thông tin của một signal, bao gồm tất cả fields không có trong danh sách.

```
GET /signals/:id
```

**Response 200:** Giống object signal trong 2.1 nhưng đầy đủ hơn với `dataSnapshot` không xuất hiện trong list.

---

### 2.3 Context data khi tạo signal ⭐

**Mục đích:** Đây là API quan trọng nhất cho inspector — cho phép xem chính xác **LLM đã nhận input gì** để tạo ra signal này. Giúp chuyên gia tài chính kiểm tra xem data đầu vào có hợp lý không, có missing data không, và indicator values tại thời điểm đó là bao nhiêu.

```
GET /signals/:id/context
```

**Response 200:**
```json
{
  "signalId": "69c1d2e3f4a5b6c7d8e9f0a1",
  "asset": "PAXGUSDT",
  "timeframe": "4h",
  "signalType": "BUY",
  "confidence": 78,
  "confidenceLabel": "high",
  "priceAtCreation": 3142.50,
  "entry": 3145.00,
  "takeProfit": 3290.00,
  "stopLoss": 3070.00,
  "createdAt": "2026-04-18T04:00:00Z",
  "dataSnapshot": {
    "indicator": {
      "timestamp": "2026-04-18T04:00:00Z",
      "rsi14": 62.4,
      "macdLine": 12.5,
      "macdSignal": 10.2,
      "macdHistogram": 2.3,
      "ema9": 3138.0,
      "ema20": 3120.0,
      "ema50": 3080.0,
      "ema200": 2950.0,
      "sma20": 3115.0,
      "bbUpper": 3250.0,
      "bbMiddle": 3115.0,
      "bbLower": 2980.0,
      "atr14": 45.2,
      "atr14Pct": 1.44,
      "volumeRatio": 1.31,
      "hv30d": 18.5
    },
    "macro": [
      { "seriesId": "VIXCLS", "name": "VIX", "value": 16.8, "unit": "index", "timestamp": "2026-04-17T00:00:00Z" },
      { "seriesId": "DTWEXBGS", "name": "DXY", "value": 101.2, "unit": "index", "timestamp": "2026-04-17T00:00:00Z" },
      { "seriesId": "DFII10", "name": "10Y Real Yield", "value": 1.65, "unit": "%", "timestamp": "2026-04-17T00:00:00Z" },
      { "seriesId": "FEDFUNDS", "name": "Fed Funds Rate", "value": 4.75, "unit": "%", "timestamp": "2026-04-01T00:00:00Z" }
    ],
    "sentiment": {
      "source": "bytetree",
      "timestamp": "2026-04-17T08:00:00Z",
      "newsSentimentMean": 0.42,
      "geopoliticalRiskScore": 35.0,
      "eventImpactLevel": "medium",
      "etfFlow7dOz": 8542.5,
      "etfAumUsd": 58000000000,
      "fundingRateAnnualized": 7.2,
      "longShortRatio": 1.28,
      "openInterestUsd": 945000000,
      "keyEvents": ["BlackRock ETF inflows surge", "China central bank gold buying"],
      "analysisSummary": "Strong institutional demand with positive ETF flows despite moderate geopolitical risk."
    },
    "newsArticles": [
      {
        "title": "Gold ETF Inflows Hit 3-Month High as Dollar Weakens",
        "sourceName": "Reuters",
        "publishedAt": "2026-04-17T14:30:00Z",
        "description": "Gold-backed ETFs recorded their highest weekly inflows since January...",
        "sentiment": 0.65,
        "sentimentLabel": "positive",
        "sentimentReason": "Positive ETF flow data and dollar weakness cited as bullish for gold"
      }
    ],
    "marketContext": {
      "source": "binance_spot",
      "candleCount": 60,
      "fromTimestamp": "2026-04-14T20:00:00Z",
      "toTimestamp": "2026-04-18T04:00:00Z",
      "openPrice": 3090.00,
      "highPrice": 3168.50,
      "lowPrice": 3078.20,
      "closePrice": 3142.50
    }
  }
}
```

**Ý nghĩa các sections trong `dataSnapshot`:**

| Section | Ý nghĩa |
|---------|---------|
| `indicator` | Snapshot TechnicalIndicator tại thời điểm generate — đây là giá trị thực tế LLM nhận được |
| `macro` | Giá trị từng FRED series tại thời điểm generate. Mỗi series 1 record mới nhất. `null` = chưa có data ingestion |
| `sentiment` | ETF flows (ByteTree), funding rate (Binance Futures), news sentiment score tổng hợp |
| `newsArticles` | Các bài báo được đưa vào LLM prompt. Mỗi bài có sentiment score riêng |
| `marketContext` | Metadata về candle data: bao nhiêu nến, từ lúc nào đến lúc nào, giá OHLC tổng thể |

**Điểm cần chú ý khi phân tích:**
- `indicator = null` → signal được tạo khi chưa có indicator data — signal chất lượng thấp
- `macro` thiếu series → collector FRED chưa chạy đủ
- `candleCount` ít hơn expected (60 cho 1h, 240 cho 4h) → signal thiếu context lịch sử

---

### 2.4 Raw LLM prompt và response ⭐

**Mục đích:** Xem raw text prompt mà hệ thống gửi cho LLM và raw response nhận về — cho phép phân tích chất lượng prompt engineering, phát hiện hallucination, và hiểu tại sao LLM đưa ra kết quả cụ thể.

```
GET /signals/:id/raw-llm
```

**Response 200:**
```json
{
  "signalId": "69c1d2e3f4a5b6c7d8e9f0a1",
  "llmModel": "gemini-2.0-flash-exp",
  "llmInput": {
    "system": "You are a professional gold trading analyst...",
    "user": "Analyze the following market data for PAXGUSDT (4h timeframe):\n\nTECHNICAL INDICATORS:\nRSI(14): 62.4 — Approaching overbought\nMACD Line: 12.5, Signal: 10.2, Histogram: +2.3 (BULLISH crossover)\n...\n\nMACRO CONDITIONS:\nVIX: 16.8 (LOW stress)\nDXY: 101.2 (neutral for gold)\n...\n\nReturn JSON in this exact format: {...}"
  },
  "llmRawResponse": {
    "signal_type": "BUY",
    "confidence": 78,
    "entry": 3145.00,
    "take_profit": 3290.00,
    "stop_loss": 3070.00,
    "macro_factors": ["Weakening USD (DXY=101.2)", "Positive ETF inflows +8500oz"],
    "insight": "Strong bullish momentum with declining DXY and positive ETF inflows.",
    "indicators_used": ["RSI14", "MACD", "EMA50", "ATR14"],
    "key_factors": [
      { "factor": "RSI momentum", "weight": "Strong" },
      { "factor": "DXY weakening", "weight": "Moderate" }
    ]
  }
}
```

**Ý nghĩa:**

| Field | Ý nghĩa |
|-------|---------|
| `llmModel` | Model cụ thể đã dùng để generate signal này |
| `llmInput.system` | System prompt — định nghĩa vai trò và quy tắc cho LLM |
| `llmInput.user` | User prompt — data thực tế gửi cho LLM (formatted text) |
| `llmRawResponse` | Object JSON LLM trả về trước khi được parse và lưu vào Signal schema |

> `llmInput = null` hoặc `llmRawResponse = null` → Signal được tạo thủ công qua API (không phải LLM-generated), hoặc hệ thống cũ chưa lưu raw data.

---

## 3. Technical Indicator History

### 3.1 Series lịch sử indicators ⭐

**Mục đích:** Lấy chuỗi thời gian của tất cả indicator values cho một symbol/timeframe — dùng để vẽ chart phân tích kỹ thuật, quan sát xu hướng indicator theo thời gian, và so sánh với biến động giá.

```
GET /technical-indicators/history
```

**Query parameters:**

| Param | Type | Required | Default | Mô tả |
|-------|------|----------|---------|-------|
| `symbol` | `string` | ✓ | — | Ví dụ: `PAXGUSDT`, `XAUUSD` |
| `timeframe` | `string` | — | _(tất cả)_ | `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `from` | `ISO 8601` | — | 7 ngày trước | Thời điểm bắt đầu |
| `to` | `ISO 8601` | — | Hiện tại | Thời điểm kết thúc |
| `limit` | `number` | — | `200` | Tối đa `1000` records |
| `fields` | `string` | — | _(tất cả)_ | Comma-separated: `rsi14,macdLine,ema20` |

**Response 200 (không có `fields`):**
```json
{
  "data": [
    {
      "symbol": "PAXGUSDT",
      "timeframe": "1h",
      "timestamp": "2026-04-18T00:00:00Z",
      "rsi14": 58.3,
      "macdLine": 8.2,
      "macdSignal": 7.1,
      "macdHistogram": 1.1,
      "ema9": 3128.0,
      "ema20": 3115.0,
      "ema50": 3080.0,
      "ema200": 2950.0,
      "sma20": 3112.0,
      "bbUpper": 3240.0,
      "bbMiddle": 3112.0,
      "bbLower": 2984.0,
      "atr14": 44.1,
      "atr14Pct": 1.41,
      "volumeRatio": 1.18,
      "hv30d": 17.8
    },
    {
      "symbol": "PAXGUSDT",
      "timeframe": "1h",
      "timestamp": "2026-04-18T01:00:00Z",
      "rsi14": 62.4,
      "macdLine": 12.5,
      "...": "..."
    }
  ],
  "total": 168
}
```

**Response 200 (có `fields=rsi14,macdLine,macdSignal`):**
```json
{
  "data": [
    {
      "symbol": "PAXGUSDT",
      "timeframe": "1h",
      "timestamp": "2026-04-18T00:00:00Z",
      "rsi14": 58.3,
      "macdLine": 8.2,
      "macdSignal": 7.1
    }
  ],
  "total": 168
}
```

**Danh sách `fields` hợp lệ:**

| Field | Mô tả |
|-------|-------|
| `rsi14` | RSI 14 periods (0–100). >70 = overbought, <30 = oversold |
| `macdLine` | MACD line (EMA12 - EMA26) |
| `macdSignal` | MACD signal line (EMA9 của macdLine) |
| `macdHistogram` | Histogram = macdLine - macdSignal. Dương = bullish momentum |
| `ema9` | EMA 9 periods — short-term trend |
| `ema20` | EMA 20 periods — medium-term trend |
| `ema50` | EMA 50 periods — intermediate trend |
| `ema200` | EMA 200 periods — long-term trend |
| `sma20` | SMA 20 — Bollinger Bands middle line |
| `bbUpper` | Bollinger Band upper (SMA20 + 2σ) — resistance zone |
| `bbMiddle` | Bollinger Band middle = SMA20 |
| `bbLower` | Bollinger Band lower (SMA20 - 2σ) — support zone |
| `atr14` | ATR 14 — absolute volatility (USD) |
| `atr14Pct` | ATR14 / price × 100 — volatility % |
| `volumeRatio` | Volume hiện tại / volume trung bình 20 periods. >1.5 = abnormal volume |
| `hv30d` | Historical Volatility 30 ngày (annualized %) |

**Ghi chú:** Mỗi record tương ứng với 1 lần compute job chạy (5 phút/lần). Data được sort theo `timestamp: asc` để thuận tiện vẽ chart.

---

### 3.2 Latest indicator snapshot

**Mục đích:** Nhanh chóng xem trạng thái indicator hiện tại.

```
GET /technical-indicators/latest?symbol=PAXGUSDT&timeframe=1h
```

**Response 200:** 1 record giống format trong 3.1 nhưng là record mới nhất.

---

## 4. Trade Attribution

### 4.1 Toàn bộ lịch sử giao dịch đã đóng

**Mục đích:** Danh sách các position đã đóng — mỗi entry là 1 "trade" hoàn chỉnh với entry/exit price, PnL, lý do đóng.

```
GET /analytics/trades
```

**Query parameters:**

| Param | Type | Default | |
|-------|------|---------|--|
| `range` | `string` | `30d` | `24h`, `7d`, `30d`, `90d`, `all` |
| `accountId` | `string` | default account | |
| `page` | `number` | `1` | |
| `limit` | `number` | `20` | |

**Response 200:**
```json
{
  "data": [
    {
      "id": "T-045",
      "symbol": "PAXGUSDT",
      "side": "LONG",
      "entryPrice": 3080.00,
      "exitPrice": 3290.00,
      "quantity": 0.5,
      "realizedPnlUsd": 105.00,
      "realizedPnlPct": 6.82,
      "isPositive": true,
      "closeReason": "take_profit",
      "openedAt": "2026-04-16T10:00:00Z",
      "closedAt": "2026-04-18T08:15:00Z",
      "durationMinutes": 2895,
      "durationFormatted": "48h 15m",
      "date": "18 Apr 2026"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

**Ý nghĩa `closeReason`:**

| Giá trị | Ý nghĩa |
|---------|---------|
| `take_profit` | Bot tự đóng khi giá chạm take profit target |
| `stop_loss` | Bot tự đóng khi giá chạm stop loss |
| `manual` | User đóng tay |
| `null` | Không rõ lý do (data cũ) |

> **Lưu ý:** Để liên kết trade này với signal gốc, cần dùng `GET /positions` để lấy `signalId`, sau đó dùng `GET /signals/:signalId/context` để xem đầy đủ.

---

### 4.2 Danh sách positions (raw)

**Mục đích:** Xem raw position data bao gồm `signalId` — dùng để trace từ trade → signal.

```
GET /positions
```

**Query parameters:**

| Param | Type | Mô tả |
|-------|------|-------|
| `status` | `string` | `open` hoặc `closed` |
| `accountId` | `string` | MongoDB ObjectId |
| `page` | `number` | |
| `limit` | `number` | |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69d1e2f3a4b5c6d7e8f9a0b1",
      "accountId": "69a1b2c3d4e5f6a7b8c9d0e1",
      "symbol": "PAXGUSDT",
      "side": "long",
      "entryPrice": 3080.00,
      "exitPrice": 3290.00,
      "quantity": 0.5,
      "notionalUsd": 1540.00,
      "unrealizedPnl": 0,
      "realizedPnl": 105.00,
      "stopLossPrice": 2960.00,
      "takeProfitPrice": 3290.00,
      "status": "closed",
      "closeReason": "take_profit",
      "openedAt": "2026-04-16T10:00:00Z",
      "closedAt": "2026-04-18T08:15:00Z",
      "botId": "69b1c2d3e4f5a6b7c8d9e0f1",
      "signalId": "69c1d2e3f4a5b6c7d8e9f0a1"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 45 }
}
```

**Field quan trọng cho inspector:**

| Field | Ý nghĩa |
|-------|---------|
| `signalId` | ID signal gốc → dùng để gọi `GET /signals/:id/context` để xem data LLM nhận |
| `botId` | ID bot đã thực thi trade này |
| `closeReason` | Tại sao lệnh đóng |

---

## 5. Market Data Raw

### 5.1 OHLCV candles theo range

**Mục đích:** Lấy dữ liệu nến thô trong một khoảng thời gian cụ thể — dùng để vẽ candlestick chart, kiểm tra giá tại thời điểm signal được tạo, và phân tích price action.

```
GET /market-prices?symbol=PAXGUSDT&source=binance_spot&timeframe=1h&from=2026-04-01T00:00:00Z&to=2026-04-22T00:00:00Z
```

**Query parameters:**

| Param | Type | Required | Mô tả |
|-------|------|----------|-------|
| `symbol` | `string` | ✓ | `PAXGUSDT`, `XAUTUSDT`, `XAUUSD` |
| `source` | `string` | — | `binance_spot`, `binance_futures`, `bitfinex`, `okx`, `goldapi`, `yahoo` |
| `timeframe` | `string` | — | `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `from` | `ISO 8601` | — | Bắt đầu range |
| `to` | `ISO 8601` | — | Kết thúc range |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69e1f2a3b4c5d6e7f8a9b0c1",
      "symbol": "PAXGUSDT",
      "source": "binance_spot",
      "timeframe": "1h",
      "open": 3078.20,
      "high": 3145.00,
      "low": 3070.50,
      "close": 3142.50,
      "volume": 1842.35,
      "timestamp": "2026-04-18T04:00:00Z",
      "extra": {}
    }
  ],
  "total": 168
}
```

**`source` enum và ý nghĩa:**

| Source | Dữ liệu |
|--------|---------|
| `binance_spot` | Giá PAXG/USDT trên Binance Spot — nguồn chính cho trading |
| `binance_futures` | Giá PAXG Futures — có thêm funding rate, open interest |
| `bitfinex` | Giá XAUT/USD trên Bitfinex |
| `okx` | Giá PAXG/USDT trên OKX |
| `goldapi` | Giá XAU/USD spot (gold price index) |
| `yahoo` | Giá GC=F (COMEX Gold Futures), VIX, SPX từ Yahoo Finance |

> **TTL:** Market price data có TTL 1 năm. Data cũ hơn 1 năm sẽ bị xóa tự động.

---

### 5.2 Latest price per symbol

**Mục đích:** Giá hiện tại của một symbol — dùng để tham chiếu nhanh.

```
GET /market-prices/latest?symbol=PAXGUSDT&source=binance_spot&timeframe=1m
```

**Response 200:** 1 record OHLCV giống format 5.1.

---

## 6. Performance Deep Dive

### 6.1 Analytics summary theo kỳ

**Mục đích:** Tổng hợp hiệu suất giao dịch — win rate, PnL, profit factor — theo khoảng thời gian.

```
GET /analytics/summary?range=30d&accountId=<id>
```

**Response 200:**
```json
{
  "range": "30d",
  "summary": {
    "netPnlUsd": 892.40,
    "netPnlPct": 8.92,
    "realizedPnlUsd": 735.50,
    "unrealizedPnlUsd": 156.90,
    "totalVolumeUsd": 218000.00,
    "totalTrades": 45,
    "winRate": 66.7,
    "wins": 30,
    "losses": 15,
    "avgWinUsd": 81.72,
    "avgLossUsd": -49.17,
    "profitFactor": 3.33
  }
}
```

**Ý nghĩa metrics:**

| Metric | Ý nghĩa |
|--------|---------|
| `winRate` | % trades có PnL > 0. Trên 50% là dương |
| `profitFactor` | Tổng lãi / Tổng lỗ. Trên 1.5 là tốt, trên 2.0 là rất tốt |
| `avgWinUsd` | Lãi trung bình mỗi winning trade |
| `avgLossUsd` | Lỗ trung bình mỗi losing trade (âm) |
| `netPnlPct` | % so với `initialBalance` của account |

---

### 6.2 PnL chart theo ngày

**Mục đích:** Series daily PnL và cumulative PnL — dùng để vẽ bar chart + line chart.

```
GET /analytics/pnl-chart?range=30d&accountId=<id>
```

**Response 200:**
```json
{
  "range": "30d",
  "data": [
    { "date": "2026-04-01", "dailyPnlUsd": 125.50, "cumulativePnlUsd": 125.50 },
    { "date": "2026-04-02", "dailyPnlUsd": -45.20, "cumulativePnlUsd": 80.30 },
    { "date": "2026-04-18", "dailyPnlUsd": 210.80, "cumulativePnlUsd": 892.40 }
  ]
}
```

> Ngày không có giao dịch bị bỏ qua. FE cần fill `0` nếu muốn chart liên tục.

---

### 6.3 Equity curve

**Mục đích:** Đường vốn theo thời gian từ daily snapshots — cho thấy tổng giá trị portfolio thay đổi ra sao.

```
GET /analytics/equity-curve?range=30d&accountId=<id>
```

**Response 200:**
```json
{
  "range": "30d",
  "data": [
    { "timestamp": "2026-03-23T00:00:00Z", "equity": 10000.00, "cumulativePnl": 0, "roiPct": 0 },
    { "timestamp": "2026-04-18T00:00:00Z", "equity": 10892.40, "cumulativePnl": 892.40, "roiPct": 8.92 }
  ]
}
```

---

### 6.4 Drawdown chart

**Mục đích:** Mức sụt giảm từ đỉnh — chỉ số quan trọng để đánh giá risk của chiến lược.

```
GET /analytics/drawdown?range=30d&accountId=<id>
```

**Response 200:**
```json
{
  "range": "30d",
  "maxDrawdownPct": -8.5,
  "data": [
    { "timestamp": "2026-03-23T00:00:00Z", "equity": 10000.00, "drawdownPct": 0 },
    { "timestamp": "2026-04-05T00:00:00Z", "equity": 9150.00, "drawdownPct": -8.5 },
    { "timestamp": "2026-04-18T00:00:00Z", "equity": 10892.40, "drawdownPct": 0 }
  ]
}
```

**Ý nghĩa:**
- `drawdownPct` luôn ≤ 0. Giá trị càng âm = càng tệ
- `maxDrawdownPct` = điểm thấp nhất trong kỳ
- Khi `drawdownPct = 0` nghĩa là đang ở mức equity cao nhất từ trước đến nay trong kỳ

---

### 6.5 Asset performance breakdown

**Mục đích:** Phân bổ và hiệu suất từng tài sản trong danh mục.

```
GET /analytics/asset-performance?range=7D&accountId=<id>
```

**Response 200:**
```json
{
  "range": "7D",
  "currency": "USDT",
  "totalValue": 10892.40,
  "assets": [
    {
      "symbol": "PAXGUSDT",
      "quantity": 1.5,
      "priceUsd": 3142.50,
      "valueUsd": 4713.75,
      "allocationPct": 43.3,
      "changePct": 6.82,
      "changeUsd": 300.50,
      "isPositive": true,
      "series": []
    },
    {
      "symbol": "USDT",
      "quantity": 6178.65,
      "priceUsd": 1,
      "valueUsd": 6178.65,
      "allocationPct": 56.7,
      "changePct": 0,
      "changeUsd": 0,
      "isPositive": true,
      "series": []
    }
  ],
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

---

## 7. Bot Decision Inspector

### 7.1 Danh sách bots

**Mục đích:** Xem tất cả bots và cấu hình của chúng — từ đây chọn bot để inspect sâu hơn.

```
GET /bots?page=1&limit=20&status=RUNNING
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69b1c2d3e4f5a6b7c8d9e0f1",
      "name": "PAXG 4h Trend Bot",
      "status": "RUNNING",
      "tradingMode": "sandbox",
      "asset": "PAXGUSDT",
      "timeframe": "4h",
      "totalCapital": 5000.00,
      "maxEntrySize": 500.00,
      "stopLoss": 2.5,
      "takeProfit": 5.0,
      "maxDrawdownLimit": 10,
      "dailyStopLossUSD": 500,
      "minConfidenceScore": 70,
      "riskPerTrade": 1.0,
      "maxPositionExposure": 10,
      "lastActiveAt": "2026-04-22T09:45:00Z",
      "errorMessage": null,
      "dailyLossTracking": {
        "date": "2026-04-22",
        "lossUsd": 45.20
      },
      "stats": {
        "totalPnl": 892.40,
        "winRate": 66.7,
        "totalTrades": 45,
        "currentDrawdownPct": 2.1
      },
      "createdAt": "2026-03-01T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3 },
  "statistics": { "total": 3 }
}
```

**Fields quan trọng cho inspector:**

| Field | Ý nghĩa |
|-------|---------|
| `minConfidenceScore` | Ngưỡng tối thiểu để bot execute signal. Signal có confidence < giá trị này sẽ bị bỏ qua |
| `dailyLossTracking.lossUsd` | Tổng lỗ tích lũy hôm nay. Khi >= `dailyStopLossUSD` → bot tự dừng |
| `stats.currentDrawdownPct` | Drawdown hiện tại. Khi >= `maxDrawdownLimit` → bot tự dừng |
| `status` | Trạng thái hiện tại của bot |

---

### 7.2 Activity logs của bot

**Mục đích:** Nhật ký từng hành động bot đã thực hiện — mua, bán, bỏ qua signal, lỗi. Đây là "black box" của bot decision making.

```
GET /bot-activity-logs?botId=<id>&page=1&limit=50
```

**Query parameters:**

| Param | Type | Mô tả |
|-------|------|-------|
| `botId` | `string` | Filter theo bot cụ thể |
| `accountId` | `string` | Filter theo account |
| `actionType` | `string` | `buy`, `sell`, `info`, `warning`, `error` |
| `page` | `number` | |
| `limit` | `number` | |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69f1a2b3c4d5e6f7a8b9c0d1",
      "botId": "69b1c2d3e4f5a6b7c8d9e0f1",
      "accountId": "69a1b2c3d4e5f6a7b8c9d0e1",
      "action": "Open LONG PAXGUSDT",
      "actionType": "buy",
      "details": "Signal confidence 78 (≥ threshold 70). Entry at 3145.00. SL=3070.00, TP=3290.00.",
      "metadata": {
        "signalId": "69c1d2e3f4a5b6c7d8e9f0a1",
        "signalConfidence": 78,
        "entryPrice": 3145.00,
        "quantity": 0.5
      },
      "performedBy": "system",
      "status": "SUCCESS",
      "createdAt": "2026-04-18T08:15:00Z"
    },
    {
      "_id": "69f1a2b3c4d5e6f7a8b9c0d2",
      "botId": "69b1c2d3e4f5a6b7c8d9e0f1",
      "accountId": "69a1b2c3d4e5f6a7b8c9d0e1",
      "action": "Skip signal — confidence below threshold",
      "actionType": "info",
      "details": "Signal confidence 62 < threshold 70. Skipped.",
      "metadata": {
        "signalId": "69c1d2e3f4a5b6c7d8e9f0a3",
        "signalConfidence": 62,
        "threshold": 70
      },
      "performedBy": "system",
      "status": "INFO",
      "createdAt": "2026-04-18T12:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 203 },
  "statistics": { "total": 203 }
}
```

**`actionType` và ý nghĩa:**

| Giá trị | Ý nghĩa |
|---------|---------|
| `buy` | Bot đã mở LONG position |
| `sell` | Bot đã đóng position (take profit / stop loss) |
| `info` | Thông tin: bot skip signal, bot cycle check, v.v. |
| `warning` | Cảnh báo: daily loss sắp đạt limit, drawdown cao |
| `error` | Lỗi: exchange API fail, order không được khớp |

> `metadata.signalId` trong log → dùng để gọi `GET /signals/:id/context` xem đầy đủ context của signal đó.

---

## 8. Macro & Sentiment

### 8.1 Risk score vĩ mô

**Mục đích:** Risk score tổng thể dựa trên VIX — chỉ số đầu tiên nên xem khi phân tích môi trường thị trường.

```
GET /insights/macro/risk-score
```

**Response 200:**
```json
{
  "riskScore": 37,
  "riskLabel": "MEDIUM RISK",
  "vix": 18.5,
  "vixChange24h": 2.15,
  "note": "Volatility moderate. Standard position sizing recommended.",
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

**Công thức:** `riskScore = min(100, round((VIX / 50) × 100))`

| riskScore | riskLabel | Hành động khuyến nghị |
|-----------|-----------|----------------------|
| 0–33 | `LOW RISK` | Favorable — có thể full position |
| 34–66 | `MEDIUM RISK` | Standard position sizing |
| 67–100 | `HIGH RISK` | Giảm position hoặc tạm dừng |

---

### 8.2 Trade gate

**Mục đích:** Cổng giao dịch — OPEN hay BLOCKED. Khi BLOCKED (VIX quá cao), bot sẽ không mở lệnh mới.

```
GET /insights/macro/trade-gate
```

**Response 200 (OPEN):**
```json
{
  "status": "OPEN",
  "reason": null,
  "nextEvent": {
    "name": "Federal Funds Rate",
    "date": "2026-04-30",
    "window": null,
    "inDays": 8
  },
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

**Response 200 (BLOCKED):**
```json
{
  "status": "BLOCKED",
  "reason": "VIX at 42.5 — high market stress detected.",
  "nextEvent": null,
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

> Điều kiện BLOCKED: `riskScore > 75` (tương đương VIX > ~37.5)

---

### 8.3 Macro feed

**Mục đích:** Latest values của tất cả macro indicators từ FRED + key events từ ByteTree.

```
GET /insights/macro/feed
```

**Response 200:**
```json
{
  "indicators": [
    { "seriesId": "FEDFUNDS", "name": "Federal Funds Rate", "value": 4.75, "unit": "%", "timestamp": "2026-04-01T00:00:00Z", "source": "fred", "frequency": "monthly" },
    { "seriesId": "VIXCLS", "name": "CBOE Volatility Index", "value": 18.5, "unit": "index", "timestamp": "2026-04-21T00:00:00Z", "source": "fred", "frequency": "daily" },
    { "seriesId": "DTWEXBGS", "name": "USD Trade Weighted Index", "value": 101.2, "unit": "index", "timestamp": "2026-04-21T00:00:00Z", "source": "fred", "frequency": "daily" },
    { "seriesId": "DFII10", "name": "10-Year Real Yield", "value": 1.65, "unit": "%", "timestamp": "2026-04-21T00:00:00Z", "source": "fred", "frequency": "daily" },
    { "seriesId": "CPIAUCSL", "name": "CPI (YoY)", "value": 3.2, "unit": "%", "timestamp": "2026-04-01T00:00:00Z", "source": "fred", "frequency": "monthly" }
  ],
  "feed": [
    { "timestamp": "2026-04-20T00:00:00Z", "source": "bytetree", "event": "Gold ETF inflows +12,500oz this week", "summary": null }
  ],
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

**FRED Series quan trọng:**

| seriesId | Tên | Ý nghĩa với gold |
|----------|-----|-----------------|
| `VIXCLS` | VIX | Volatility thị trường. >30 = stress cao → gold có thể tăng |
| `DTWEXBGS` | DXY | USD Index. DXY giảm → gold tăng (tương quan nghịch) |
| `DFII10` | Real Yield 10Y | Real yield tăng → gold kém hấp dẫn (không có yield) |
| `FEDFUNDS` | Fed Funds Rate | Rate cao → USD mạnh → headwind cho gold |
| `CPIAUCSL` | CPI | Lạm phát cao → gold là hedge |
| `T10Y2Y` | Yield Curve | Âm = inverted curve → recession risk → gold tăng |

---

### 8.4 Chính sách tiền tệ

**Mục đích:** Tổng hợp monetary policy — Fed Funds Rate, real yield, yield curve — đây là các yếu tố vĩ mô quan trọng nhất ảnh hưởng đến giá gold.

```
GET /insights/macro/monetary
```

**Response 200:**
```json
{
  "stance": "RESTRICTIVE",
  "fedFundsRate": 4.75,
  "realYield10y": 1.65,
  "yieldCurveSpread": -0.25,
  "indicators": [
    { "seriesId": "FEDFUNDS", "name": "Federal Funds Rate", "value": 4.75, "unit": "%", "timestamp": "2026-04-01T00:00:00Z", "frequency": "monthly" }
  ],
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

| `stance` | Điều kiện | Ý nghĩa |
|----------|-----------|---------|
| `RESTRICTIVE` | Fed Funds > 5% | Chính sách thắt chặt — USD mạnh — headwind cho gold |
| `NEUTRAL` | 3–5% | Trung tính |
| `ACCOMMODATIVE` | < 3% | Nới lỏng — USD yếu — tailwind cho gold |

---

### 8.5 Gold liquidity

**Mục đích:** DXY + ETF flows + Futures data — tổng hợp thanh khoản và dòng tiền vào gold.

```
GET /insights/macro/liquidity
```

**Response 200:**
```json
{
  "dxy": {
    "value": 101.2,
    "signal": "NEUTRAL",
    "timestamp": "2026-04-21T00:00:00Z"
  },
  "etfFlows": {
    "flow7dOz": 12500.5,
    "aumUsd": 58000000000,
    "timestamp": "2026-04-20T00:00:00Z"
  },
  "futures": {
    "fundingRateAnnualized": 7.2,
    "longShortRatio": 1.28,
    "openInterestUsd": 945000000,
    "timestamp": "2026-04-22T06:00:00Z"
  },
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

**Ý nghĩa:**

| Field | Ý nghĩa |
|-------|---------|
| `dxy.signal` | `BULLISH_GOLD` (DXY<100), `NEUTRAL` (100–105), `BEARISH_GOLD` (DXY>105) |
| `etfFlows.flow7dOz` | Dòng vào/ra ETF vàng 7 ngày (oz). Dương = inflow = bullish |
| `etfFlows.aumUsd` | Tổng AUM ETF vàng toàn cầu (USD) — proxy cho institutional demand |
| `futures.fundingRateAnnualized` | Funding rate hàng năm. Cao = longs trả shorts = thị trường bullish nhưng crowded |
| `futures.longShortRatio` | Tỷ lệ long/short. >1.5 = crowded longs = potential reversal risk |
| `futures.openInterestUsd` | Tổng open interest USD — đo lường participation |

---

### 8.6 Sentiment & volatility

**Mục đích:** News sentiment + ATR volatility + Futures data tổng hợp cho một symbol.

```
GET /insights/data/sentiment-volatility?symbol=PAXGUSDT
```

**Response 200:**
```json
{
  "symbol": "PAXGUSDT",
  "volatility": {
    "atr14Pct": 1.44,
    "hv30d": 18.5,
    "level": "MEDIUM"
  },
  "sentiment": {
    "score": 0.42,
    "label": "BULLISH",
    "geopoliticalRisk": 35.0,
    "eventImpact": "medium",
    "updatedAt": "2026-04-22T06:00:00Z"
  },
  "futures": {
    "fundingRateAnnualized": 7.2,
    "longShortRatio": 1.28,
    "openInterestUsd": 945000000
  },
  "updatedAt": "2026-04-22T08:00:00Z"
}
```

**Ý nghĩa:**

| Field | Ý nghĩa |
|-------|---------|
| `volatility.atr14Pct` | ATR% hiện tại. <1% = low vol, 1–2.5% = medium, >2.5% = high |
| `volatility.hv30d` | Historical volatility 30 ngày (annualized). So sánh với ATR để detect vol expansion |
| `sentiment.score` | -1 đến +1. >0.3 = bullish, <-0.3 = bearish |
| `sentiment.geopoliticalRisk` | Score rủi ro địa chính trị 0–100 từ news analysis |

---

### 8.7 Raw macro indicator data

**Mục đích:** Query trực tiếp MacroIndicator collection — dùng để xem lịch sử một series cụ thể theo thời gian.

```
GET /macro-indicators?seriesId=VIXCLS&from=2026-01-01T00:00:00Z&to=2026-04-22T00:00:00Z
```

**Query parameters:**

| Param | Type | Mô tả |
|-------|------|-------|
| `seriesId` | `string` | FRED series ID: `VIXCLS`, `FEDFUNDS`, `DFII10`, v.v. |
| `from` | `ISO 8601` | |
| `to` | `ISO 8601` | |
| `limit` | `number` | Default 100 |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69g1h2i3j4k5l6m7n8o9p0q1",
      "seriesId": "VIXCLS",
      "name": "CBOE Volatility Index",
      "value": 18.5,
      "unit": "index",
      "timestamp": "2026-04-21T00:00:00Z",
      "releaseDate": null,
      "source": "fred",
      "frequency": "daily",
      "forecast": null,
      "actual": 18.5,
      "impactLevel": "high"
    }
  ],
  "total": 90
}
```

---

### 8.8 Raw sentiment signal data

**Mục đích:** Query trực tiếp SentimentSignal collection — xem ETF flow và funding rate theo thời gian.

```
GET /sentiment-signals?source=bytetree&limit=30
```

**Query parameters:**

| Param | Type | Mô tả |
|-------|------|-------|
| `source` | `string` | `newsapi`, `bytetree`, `binance_futures`, `llm_analysis` |
| `from` | `ISO 8601` | |
| `to` | `ISO 8601` | |
| `limit` | `number` | Default 100 |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69h1i2j3k4l5m6n7o8p9q0r1",
      "timestamp": "2026-04-21T08:00:00Z",
      "source": "bytetree",
      "newsSentimentMean": null,
      "geopoliticalRiskScore": null,
      "etfFlow7dOz": 12500.5,
      "etfAumUsd": 58000000000,
      "fundingRateAnnualized": null,
      "keyEvents": ["Gold ETF inflows surge on Fed pivot expectations"],
      "analysisSummary": "Strong institutional demand driven by expectations of rate cuts."
    }
  ],
  "total": 30
}
```

> Mỗi source lưu riêng các fields phù hợp. `bytetree` → ETF flows. `binance_futures` → funding rate, long/short ratio. `newsapi` → sentiment score.

---

## 9. System Data Quality

### 9.1 Danh sách accounts

**Mục đích:** Xem tất cả accounts và số dư — cần để chọn accountId cho các API khác.

```
GET /accounts
```

**Response 200:**
```json
{
  "data": [
    {
      "_id": "69a1b2c3d4e5f6a7b8c9d0e1",
      "label": "Default Paper Account",
      "accountType": "paper",
      "exchange": "binance",
      "balance": 10892.40,
      "initialBalance": 10000.00,
      "currency": "USDT",
      "status": "active",
      "isDefault": true,
      "apiKeyStatus": "untested"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1 }
}
```

---

### 9.2 Full technical indicators snapshot

**Mục đích:** Snapshot đầy đủ indicator hiện tại + MACD crossover + RSI zone — view nhanh trạng thái kỹ thuật hiện tại.

```
GET /insights/data/technical-indicators?symbol=PAXGUSDT&timeframe=1h
```

**Response 200:**
```json
{
  "symbol": "PAXGUSDT",
  "timeframe": "1h",
  "data": {
    "rsi14": 62.4,
    "macd": { "line": 12.5, "signal": 10.2, "histogram": 2.3 },
    "ema": { "ema9": 3138.0, "ema20": 3120.0, "ema50": 3080.0, "ema200": 2950.0 },
    "sma20": 3115.0,
    "bollingerBands": { "upper": 3250.0, "middle": 3115.0, "lower": 2980.0 },
    "atr14": 45.2,
    "atr14Pct": 1.44,
    "volumeRatio": 1.31,
    "hv30d": 18.5
  },
  "updatedAt": "2026-04-22T09:45:00Z"
}
```

---

### 9.3 Advanced metrics + latest signal

**Mục đích:** RSI zone, MACD crossover, BB width, và signal ACTIVE mới nhất — tổng hợp trong 1 call.

```
GET /insights/data/advanced-metrics?symbol=PAXGUSDT&timeframe=1h
```

**Response 200:**
```json
{
  "symbol": "PAXGUSDT",
  "timeframe": "1h",
  "data": {
    "rsi": { "value": 62.4, "zone": "APPROACHING_OVERBOUGHT" },
    "macd": { "line": 12.5, "signal": 10.2, "histogram": 2.3, "crossover": "BULLISH" },
    "bollingerBands": { "upper": 3250.0, "middle": 3115.0, "lower": 2980.0, "width": 8.54 },
    "ema": { "ema20": 3120.0, "ema50": 3080.0, "ema200": 2950.0 },
    "atr": { "value": 45.2, "pct": 1.44 },
    "volumeRatio": 1.31
  },
  "signal": {
    "type": "BUY",
    "confidence": 78,
    "confidenceLabel": "high",
    "expiresAt": "2026-04-22T16:00:00Z"
  },
  "updatedAt": "2026-04-22T09:45:00Z"
}
```

**`rsi.zone` enum:**

| Giá trị | RSI range | Ý nghĩa |
|---------|-----------|---------|
| `OVERSOLD` | < 30 | Bán quá mức → potential reversal up |
| `APPROACHING_OVERSOLD` | 30–45 | Tiếp cận oversold |
| `NEUTRAL` | 45–55 | Trung tính |
| `APPROACHING_OVERBOUGHT` | 55–70 | Tiếp cận overbought |
| `OVERBOUGHT` | > 70 | Mua quá mức → potential reversal down |

**`macd.crossover` enum:**

| Giá trị | Ý nghĩa |
|---------|---------|
| `BULLISH` | MACD line vừa cắt lên trên Signal line → momentum tăng |
| `BEARISH` | MACD line vừa cắt xuống dưới Signal line → momentum giảm |
| `UNKNOWN` | Null hoặc không đủ data |

---

## 10. Existing APIs — Tận dụng trực tiếp

Các API này đã có sẵn, inspector app dùng trực tiếp không cần thay đổi backend:

| Method | Endpoint | Mục đích trong inspector |
|--------|----------|--------------------------|
| GET | `/dashboard/summary` | Portfolio overview card |
| GET | `/dashboard/price-cards` | Giá realtime PAXG, XAUT, XAU/USD |
| GET | `/dashboard/market-status?symbol=PAXGUSDT` | Market structure hiện tại |
| GET | `/dashboard/macro-context` | DXY, VIX, trade gate nhanh |
| GET | `/dashboard/market-indicators?symbol=PAXGUSDT` | RSI, Fear&Greed, S/R levels |
| GET | `/dashboard/ai-activity?limit=50` | Activity feed gần nhất |
| GET | `/analytics/positions/open` | Vị thế đang mở |
| GET | `/bots/stats` | Tổng quan bot (active, PnL, volume) |
| GET | `/signals/latest` | Signals ACTIVE hiện tại |
| GET | `/insights/macro/calendar` | Lịch sự kiện kinh tế sắp tới |
| GET | `/insights/data/liquidity-heatmap?symbol=PAXGUSDT` | Volume heatmap 24h |

---

## Appendix A — Endpoints mới trong phiên này

Các endpoints được thêm vào DGT service đặc biệt cho inspector:

| Method | Endpoint | File thay đổi |
|--------|----------|---------------|
| GET | `/signals/:id/context` | [signal.controller.ts](../../services/dgt/src/modules/signal/signal.controller.ts) |
| GET | `/signals/:id/raw-llm` | [signal.controller.ts](../../services/dgt/src/modules/signal/signal.controller.ts) |
| GET | `/technical-indicators/history` | [technical-indicator.controller.ts](../../services/dgt/src/modules/technical-indicator/technical-indicator.controller.ts) |

---

## Appendix B — Endpoints cần implement thêm (P1)

Các endpoints này cần implement thêm ở backend trước khi FE có thể dùng:

| Method | Endpoint | Mô tả | Effort |
|--------|----------|-------|--------|
| GET | `/analytics/trades/:positionId/attribution` | Trade → Signal linkage đầy đủ | Medium |
| GET | `/analytics/pnl-by-confidence` | PnL breakdown theo confidence bucket | Medium |
| GET | `/analytics/winners-vs-losers` | So sánh indicator values win vs loss | Medium |
| GET | `/bot-activity-logs/stats?botId=` | Aggregate stats: execute vs skip count | Low |
| GET | `/debug/system/data-freshness` | Collector health — last run per source | Medium |
| GET | `/debug/system/indicator-coverage` | % candles có đủ indicator data | Low |
