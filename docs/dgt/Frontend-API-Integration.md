# Frontend API Integration Guide — Kaisar AI Gold Trader

**Base URL**: `http://localhost:3008`
**Base URL Prod**: `https://xsai-api.x-or.cloud/dgt`
**Auth**: JWT Bearer token — thêm header `Authorization: Bearer <token>` cho mọi endpoint có Auth = ✅
**Swagger UI**: `http://localhost:3008/api-docs`

---

## 1. Dashboard Page

### 1.1 Price Cards — Giá thị trường realtime

#### `GET /market-prices/latest`
**Auth**: ✅
**Mô tả**: Lấy giá mới nhất của một symbol (dùng để hiển thị price card PAXG, XAUT).

**Query params**:
| Field | Type | Required | Ý nghĩa | Ví dụ |
|-------|------|----------|----------|-------|
| `symbol` | string | ✅ | Symbol cần query | `PAXGUSDT` |
| `source` | string | ❌ | Nguồn dữ liệu | `binance_spot` |
| `timeframe` | string | ❌ | Khung thời gian | `1m`, `1h` |

**Response example**:
```json
{
  "symbol": "PAXGUSDT",          // Symbol
  "source": "binance_spot",      // Nguồn dữ liệu
  "timeframe": "1m",             // Khung thời gian
  "open": 2341.50,               // Giá mở cửa nến
  "high": 2348.20,               // Giá cao nhất nến
  "low": 2339.80,                // Giá thấp nhất nến
  "close": 2345.10,              // Giá đóng cửa / giá hiện tại
  "volume": 1234.56,             // Khối lượng
  "openTime": "2026-03-11T10:00:00.000Z",  // Thời điểm mở nến
  "closeTime": "2026-03-11T10:00:59.000Z"  // Thời điểm đóng nến
}
```

#### `GET /market-prices`
**Auth**: ✅
**Mô tả**: Lấy lịch sử giá theo range (dùng cho sparkline chart trong price card).

**Query params**:
| Field | Type | Required | Ý nghĩa | Ví dụ |
|-------|------|----------|----------|-------|
| `symbol` | string | ✅ | Symbol | `PAXGUSDT` |
| `source` | string | ❌ | Nguồn | `binance_spot` |
| `timeframe` | string | ❌ | Khung thời gian | `1h` |
| `from` | string (ISO date) | ❌ | Từ ngày | `2026-03-04T00:00:00Z` |
| `to` | string (ISO date) | ❌ | Đến ngày | `2026-03-11T23:59:59Z` |

**Response example** (array):
```json
[
  {
    "symbol": "PAXGUSDT",
    "source": "binance_spot",
    "timeframe": "1h",
    "open": 2330.00,
    "high": 2342.50,
    "low": 2328.10,
    "close": 2340.20,   // Dùng làm điểm sparkline { v: 2340.20 }
    "volume": 892.30,
    "openTime": "2026-03-10T09:00:00.000Z",
    "closeTime": "2026-03-10T09:59:59.000Z"
  }
  // ...thêm nhiều nến
]
```

### 1.2 Portfolio Summary — Tóm tắt portfolio

Dùng API `/analytics/summary` (xem mục **4. Analytics Page** bên dưới).

**Mapping sang Dashboard fields**:
| Dashboard field | API field |
|-----------------|-----------|
| Total PnL USD | `summary.netPnlUsd` |
| Total PnL % | `summary.netPnlPct` |

### 1.2 Chỉ số còn thiếu — Bổ sung sau
- `AssetAllocation` (PAXG/XAUT/USDT breakdown by value) — cần aggregate từ Position
- `portfolioHistory` (time series tổng giá trị portfolio) — dùng `/analytics/equity-curve`
- `holdings` per asset — cần endpoint riêng

---

## 2. Live Trading Terminal Page

### 2.1 Dữ liệu Realtime (Binance WebSocket)

Trang này lấy dữ liệu **trực tiếp từ Binance WebSocket** — không qua DGT API:

| Stream | URL | Dữ liệu |
|--------|-----|---------|
| Ticker | `wss://stream.binance.com:9443/ws/paxgusdt@ticker` | Giá realtime |
| Order Book | `wss://stream.binance.com:9443/ws/paxgusdt@depth20` | Depth 20 levels |
| Recent Trades | `wss://stream.binance.com:9443/ws/paxgusdt@trade` | Live trades |
| Klines | `wss://stream.binance.com:9443/ws/paxgusdt@kline_1m` | Nến 1 phút |

### 2.2 Chỉ số còn thiếu — Bổ sung sau
- Khớp lệnh order (place order from Terminal) — cần endpoint `/trades/from-signal` hoặc endpoint order riêng

---

## 3. AI Bot Management Page

### 3.1 Lấy danh sách bots

#### `GET /bots`
**Auth**: ✅
**Mô tả**: Lấy toàn bộ bot của user hiện tại.

**Query params** (tùy chọn):
| Field | Type | Ý nghĩa | Ví dụ |
|-------|------|----------|-------|
| `status` | string | Lọc theo trạng thái | `RUNNING`, `PAUSED`, `STOPPED`, `ERROR` |
| `page` | number | Trang | `1` |
| `limit` | number | Số item | `20` |

**Response example**:
```json
{
  "data": [
    {
      "_id": "67d0a1b2c3d4e5f6a7b8c9d0",      // Bot ID
      "name": "Gold Trend Bot",                   // Tên bot
      "status": "RUNNING",                        // CREATED | RUNNING | PAUSED | STOPPED | ERROR | DELETED
      "tradingMode": "sandbox",                   // sandbox | live
      "asset": "PAXGUSDT",                        // Asset đang giao dịch
      "timeframe": "1h",                          // 1h | 4h
      "accountId": "69b0f1ccb37fe2f00470be1e",   // Account ID
      "totalCapital": 10000,                      // Tổng vốn phân bổ (USD)
      "maxEntrySize": 1000,                       // Kích thước lệnh tối đa (USD)
      "stopLoss": 2.5,                            // Stop loss % trên mỗi trade
      "takeProfit": 5.0,                          // Take profit % trên mỗi trade
      "maxDrawdownLimit": 10,                     // Drawdown tối đa trước khi bot tự dừng (%)
      "dailyStopLossUSD": 500,                    // Tổng lỗ ngày tối đa (USD)
      "minConfidenceScore": 70,                   // Chỉ trade signal có confidence >= giá trị này
      "lastActiveAt": "2026-03-11T10:30:00.000Z",// Lần hoạt động cuối
      "errorMessage": null,                       // Thông báo lỗi nếu status=ERROR
      "dailyLossTracking": {
        "date": "2026-03-11",                     // Ngày tracking
        "lossUsd": 120.50                         // Lỗ đã tích lũy hôm nay (USD)
      },
      "stats": {
        "totalPnl": 842.50,                       // Tổng PnL tất cả trade (USD)
        "winRate": 68.5,                          // Tỷ lệ thắng (%)
        "totalTrades": 61,                        // Tổng số trade đã thực hiện
        "currentDrawdownPct": 3.2                 // Drawdown hiện tại (%)
      },
      "createdAt": "2026-02-15T08:00:00.000Z",
      "updatedAt": "2026-03-11T10:30:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

**Mapping sang UI fields**:
| UI field | API field |
|----------|-----------|
| `uptime` | Tính từ `createdAt` đến now |
| `totalPnl` | `stats.totalPnl` |
| `winRate` | `stats.winRate` |
| `winRecord` | `stats.totalTrades` + tính từ winRate |
| `drawdown` | `stats.currentDrawdownPct` |
| `drawdownMax` | `maxDrawdownLimit` |
| `errorMsg` | `errorMessage` |

---

### 3.2 Lấy chi tiết bot

#### `GET /bots/:id`
**Auth**: ✅
**Params**: `id` — Bot ObjectId
**Response**: Giống 1 item trong array của `GET /bots`

---

### 3.3 Tạo bot mới

#### `POST /bots`
**Auth**: ✅

**Request body**:
```json
{
  "accountId": "69b0f1ccb37fe2f00470be1e",  // ObjectId của account (required)
  "name": "Gold Trend Bot",                   // Tên bot, unique per user (required)
  "tradingMode": "sandbox",                   // "sandbox" | "live" (required)
  "asset": "PAXGUSDT",                        // Default: "PAXGUSDT" (optional)
  "timeframe": "1h",                          // "1h" | "4h" (required)
  "totalCapital": 10000,                      // Tổng vốn USD, min 1 (required)
  "maxEntrySize": 1000,                       // Lệnh tối đa USD, min 1 (required)
  "stopLoss": 2.5,                            // Stop loss %, 0.1–100 (required)
  "takeProfit": 5.0,                          // Take profit %, 0.1–100 (required)
  "maxDrawdownLimit": 10,                     // Max drawdown %, 1–15 (required)
  "dailyStopLossUSD": 500,                    // Daily loss limit USD, min 1 (required)
  "minConfidenceScore": 70                    // Min confidence 0–100, default 70 (optional)
}
```

**Response**: Bot object vừa tạo (giống item trong `GET /bots`)

---

### 3.4 Cập nhật cấu hình bot

#### `PUT /bots/:id`
**Auth**: ✅
**Params**: `id` — Bot ObjectId

**Request body** (tất cả optional — partial update):
```json
{
  "name": "Renamed Bot",
  "tradingMode": "live",
  "totalCapital": 15000,
  "maxEntrySize": 1500,
  "stopLoss": 3.0,
  "takeProfit": 6.0,
  "maxDrawdownLimit": 12,
  "dailyStopLossUSD": 600,
  "minConfidenceScore": 75
}
```

**Response**: Bot object sau khi update

---

### 3.5 Điều khiển trạng thái bot

#### `POST /bots/:id/start`
**Auth**: ✅ | **Mô tả**: Khởi động bot (CREATED/PAUSED → RUNNING)

#### `POST /bots/:id/pause`
**Auth**: ✅ | **Mô tả**: Tạm dừng bot (RUNNING → PAUSED)

#### `POST /bots/:id/resume`
**Auth**: ✅ | **Mô tả**: Tiếp tục bot (PAUSED → RUNNING)

#### `POST /bots/:id/stop`
**Auth**: ✅ | **Mô tả**: Dừng hẳn bot (RUNNING/PAUSED → STOPPED)

**Params**: `id` — Bot ObjectId
**Request body**: Không cần
**Response example**:
```json
{
  "_id": "67d0a1b2c3d4e5f6a7b8c9d0",
  "name": "Gold Trend Bot",
  "status": "PAUSED",           // Trạng thái mới sau transition
  "lastActiveAt": "2026-03-11T10:45:00.000Z",
  // ...các fields khác
}
```

**State machine hợp lệ**:
| Từ → Đến | Action |
|----------|--------|
| CREATED → RUNNING | `/start` |
| RUNNING → PAUSED | `/pause` |
| PAUSED → RUNNING | `/resume` |
| RUNNING → STOPPED | `/stop` |
| PAUSED → STOPPED | `/stop` |
| ERROR → RUNNING | `/start` |

**Error response** (transition không hợp lệ — HTTP 400):
```json
{
  "statusCode": 400,
  "message": "Invalid status transition: STOPPED → PAUSED"
}
```

---

### 3.6 Xoá bot

#### `DELETE /bots/:id`
**Auth**: ✅ | **Tiền điều kiện**: Bot phải ở trạng thái `STOPPED` hoặc `PAUSED`

**Response example**:
```json
{
  "_id": "67d0a1b2c3d4e5f6a7b8c9d0",
  "deletedAt": "2026-03-11T11:00:00.000Z"   // Soft delete
}
```

**Error** (bot đang RUNNING — HTTP 400):
```json
{
  "statusCode": 400,
  "message": "Cannot delete a running bot. Stop the bot before deleting."
}
```

---

### 3.7 Bot Activity Log (History)

#### `GET /bot-activity-logs` *(chỉ số còn thiếu — cần endpoint)*
**Mô tả**: Lấy lịch sử hành động của bot (buy/sell/error/warning).
**Hiện tại**: Schema đã có, cần bổ sung controller endpoint.

**Dữ liệu sẽ trả về**:
```json
{
  "data": [
    {
      "botId": "67d0a1b2c3d4e5f6a7b8c9d0",
      "accountId": "69b0f1ccb37fe2f00470be1e",
      "action": "Buy Order Filled",          // Mô tả hành động
      "actionType": "buy",                   // buy | sell | info | warning | error
      "details": "Bought 0.5 PAXG @ $2,345.10",
      "metadata": { "orderId": "...", "price": 2345.10 },
      "performedBy": "system",               // user | system
      "status": "SUCCESS",                   // SUCCESS | WARNING | ERROR | INFO
      "createdAt": "2026-03-11T10:32:05.000Z",
      "expiresAt": "2026-06-09T10:32:05.000Z"  // TTL 90 ngày
    }
  ]
}
```

**Mapping sang UI ActivityLog**:
| UI field | API field |
|----------|-----------|
| `time` | Format `createdAt` → `HH:mm:ss` |
| `bot` | Join từ `botId` → bot name |
| `action` | `action` |
| `actionType` | `actionType` |
| `details` | `details` |
| `status` | `status` |

### 3.8 Summary Stats (botStats)
**Chỉ số còn thiếu — Bổ sung sau**: Cần aggregate endpoint:
- `activeBots`: count bots status=RUNNING
- `totalPnl`: sum `stats.totalPnl` across all bots
- `activeVolume`: sum `totalCapital` của running bots

---

## 4. Analytics Page

### 4.1 Performance Summary

#### `GET /analytics/summary`
**Auth**: ✅

**Query params**:
| Field | Type | Default | Ý nghĩa | Ví dụ |
|-------|------|---------|----------|-------|
| `range` | string | `7d` | Khoảng thời gian | `24h`, `7d`, `30d`, `90d`, `all` |
| `accountId` | string | ❌ | Lọc account cụ thể. Nếu không truyền → dùng account isDefault=true | `69b0f1ccb37fe2f00470be1e` |

**Response example**:
```json
{
  "range": "7d",              // Khoảng thời gian đang query
  "summary": {
    "netPnlUsd": 892.40,      // Tổng PnL (realized + unrealized) tính bằng USD
    "netPnlPct": 3.92,        // PnL % trên initialBalance
    "realizedPnlUsd": 735.50, // PnL đã chốt (từ vị thế đóng)
    "unrealizedPnlUsd": 156.90, // PnL chưa chốt (vị thế đang mở)
    "totalVolumeUsd": 218000, // Tổng khối lượng giao dịch (USD)
    "totalTrades": 12,        // Tổng số trade đã đóng trong kỳ
    "winRate": 75.0,          // Tỷ lệ thắng (%)
    "wins": 9,                // Số trade thắng
    "losses": 3,              // Số trade thua
    "avgWinUsd": 81.72,       // PnL trung bình mỗi trade thắng (USD)
    "avgLossUsd": -19.17,     // PnL trung bình mỗi trade thua (USD, âm)
    "profitFactor": 12.75     // Tổng lãi / Tổng lỗ (ratio)
  }
}
```

**Mapping sang UI AnalyticsSummary**:
| UI field | API field |
|----------|-----------|
| `netPnl` | Format `summary.netPnlUsd` → `"+$892.40"` |
| `netPnlPct` | Format `summary.netPnlPct` → `"+3.9%"` |
| `realized` | `summary.realizedPnlUsd` |
| `unrealized` | `summary.unrealizedPnlUsd` |
| `totalVolume` | Format `summary.totalVolumeUsd` → `"$218K"` |
| `totalTrades` | `summary.totalTrades` |
| `winRate` | `summary.winRate` |
| `wins` | `summary.wins` |
| `losses` | `summary.losses` |

---

### 4.2 Open Positions

#### `GET /analytics/positions/open`
**Auth**: ✅

**Query params**:
| Field | Type | Default | Ý nghĩa |
|-------|------|---------|----------|
| `accountId` | string | ❌ | Account ID (default account nếu không có) |
| `page` | number | `1` | Trang |
| `limit` | number | `20` | Số item mỗi trang |

**Response example**:
```json
{
  "data": [
    {
      "id": "67d0a1b2c3d4e5f6a7b8c9d0",   // Position ID
      "symbol": "PAXGUSDT",                 // Symbol
      "side": "LONG",                       // "LONG" | "SHORT"
      "entryPrice": 2310.00,               // Giá vào lệnh
      "currentPrice": 2345.10,             // Giá hiện tại
      "quantity": 0.5,                     // Số lượng
      "notionalUsd": 1155.00,             // Giá trị vị thế (USD)
      "unrealizedPnlUsd": 17.55,          // Lãi/lỗ chưa chốt (USD)
      "unrealizedPnlPct": 1.52,           // Lãi/lỗ chưa chốt (%)
      "isPositive": true,                  // true = đang lãi, false = đang lỗ
      "stopLossPrice": 2260.00,           // Giá stop loss
      "takeProfitPrice": 2420.00,         // Giá take profit
      "leverage": 1,                       // Đòn bẩy
      "openedAt": "2026-03-11T06:00:00.000Z",  // Thời điểm mở vị thế
      "durationHours": 4.5                // Thời gian nắm giữ (giờ)
    }
  ],
  "total": 3,    // Tổng số open positions
  "page": 1,
  "limit": 20
}
```

**Mapping sang UI OpenPosition**:
| UI field | API field |
|----------|-----------|
| `symbol` | `symbol` (thêm `/` → `PAXG/USDT`) |
| `side` | `side` |
| `entry` | Format `entryPrice` → `"$2,310.00"` |
| `pnl` | Format `unrealizedPnlUsd` → `"+$17.55"` |
| `pnlPositive` | `isPositive` |

---

### 4.3 Trade History (Closed Trades)

#### `GET /analytics/trades`
**Auth**: ✅

**Query params**:
| Field | Type | Default | Ý nghĩa |
|-------|------|---------|----------|
| `range` | string | `30d` | `24h`, `7d`, `30d`, `90d`, `all` |
| `accountId` | string | ❌ | Account ID |
| `page` | number | `1` | Trang |
| `limit` | number | `20` | Số item |

**Response example**:
```json
{
  "data": [
    {
      "id": "T-012",                          // ID hiển thị (T-NNN, đánh số từ mới nhất)
      "symbol": "PAXGUSDT",
      "side": "LONG",                         // "LONG" | "SHORT"
      "entryPrice": 2310.00,                 // Giá vào
      "exitPrice": 2345.10,                  // Giá thoát
      "quantity": 0.5,                       // Số lượng
      "realizedPnlUsd": 17.55,              // PnL đã chốt (USD)
      "realizedPnlPct": 1.52,              // PnL % trên notional
      "isPositive": true,                    // Lãi hay lỗ
      "closeReason": "take_profit",          // take_profit | stop_loss | manual | bot | expired
      "openedAt": "2026-03-10T08:00:00.000Z",
      "closedAt": "2026-03-10T12:22:00.000Z",
      "durationMinutes": 262,               // Thời gian nắm giữ (phút)
      "durationFormatted": "4h 22m",        // Thời gian định dạng sẵn
      "date": "10 Mar 2026"                 // Ngày đóng (định dạng hiển thị)
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

**Mapping sang UI TradeHistoryItem**:
| UI field | API field |
|----------|-----------|
| `id` | `id` |
| `symbol` | `symbol` |
| `side` | `side` |
| `entry` | Format `entryPrice` → `"$2,310.00"` |
| `exit` | Format `exitPrice` → `"$2,345.10"` |
| `pnl` | Format `realizedPnlUsd` → `"+$17.55"` |
| `pnlPositive` | `isPositive` |
| `duration` | `durationFormatted` |
| `date` | `date` |

---

### 4.4 PnL Chart

#### `GET /analytics/pnl-chart`
**Auth**: ✅

**Query params**: `range` (default `7d`), `accountId`

**Response example**:
```json
{
  "range": "7d",
  "data": [
    {
      "date": "2026-03-05",          // Ngày (YYYY-MM-DD)
      "dailyPnlUsd": 124.50,        // PnL trong ngày đó (USD)
      "cumulativePnlUsd": 124.50    // PnL tích lũy từ đầu kỳ (USD)
    },
    {
      "date": "2026-03-06",
      "dailyPnlUsd": -32.10,
      "cumulativePnlUsd": 92.40
    },
    {
      "date": "2026-03-07",
      "dailyPnlUsd": 800.00,
      "cumulativePnlUsd": 892.40
    }
  ]
}
```

**Ghi chú**: Ngày không có trade sẽ được bỏ qua (không có data point với daily=0) cho đến khi có trade đầu tiên.

---

### 4.5 Equity Curve

#### `GET /analytics/equity-curve`
**Auth**: ✅

**Query params**: `range` (default `30d`), `accountId`

**Response example**:
```json
{
  "range": "30d",
  "data": [
    {
      "timestamp": "2026-02-10T00:00:00.000Z",  // Thời điểm snapshot
      "equity": 10124.50,                         // Giá trị portfolio tại thời điểm này (USD)
      "cumulativePnl": 124.50,                   // PnL tích lũy (realized + unrealized)
      "roiPct": 1.24                             // ROI % so với initialBalance
    },
    {
      "timestamp": "2026-02-11T00:00:00.000Z",
      "equity": 10342.80,
      "cumulativePnl": 342.80,
      "roiPct": 3.43
    }
  ]
}
```

**Ghi chú**: Data từ `PortfolioSnapshot` — được tạo mỗi ngày bởi monitoring worker. Nếu chưa có snapshot thì array rỗng.

---

### 4.6 Drawdown Chart

#### `GET /analytics/drawdown`
**Auth**: ✅

**Query params**: `range` (default `30d`), `accountId`

**Response example**:
```json
{
  "range": "30d",
  "maxDrawdownPct": -8.50,     // Drawdown tối đa trong kỳ (số âm, %)
  "data": [
    {
      "timestamp": "2026-02-10T00:00:00.000Z",
      "equity": 10124.50,       // Giá trị portfolio
      "drawdownPct": 0          // Drawdown % so với peak (0 = tại peak, âm = dưới peak)
    },
    {
      "timestamp": "2026-02-20T00:00:00.000Z",
      "equity": 9274.13,
      "drawdownPct": -8.50      // Đang ở mức -8.5% dưới peak
    }
  ]
}
```

---

### 4.7 Export CSV

#### `GET /analytics/export/csv`
**Auth**: ✅ | **Response**: File download (không phải JSON)

**Query params**: `range` (default `30d`), `accountId`

**Cách dùng**:
```javascript
// Trigger download trong browser
const url = `/analytics/export/csv?range=30d`;
const link = document.createElement('a');
link.href = url;
link.click();
// File được download với tên: trades-30d-2026-03-11.csv
```

**Headers response**:
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="trades-30d-2026-03-11.csv"
```

---

## 5. Market Intelligence / Insight Page

### 5.1 Lấy danh sách Signals

#### `GET /signals`
**Auth**: ✅
**Mô tả**: Lấy toàn bộ signal của user theo các filter.

**Query params**:
| Field | Type | Ý nghĩa | Ví dụ |
|-------|------|----------|-------|
| `status` | string | Lọc theo trạng thái | `ACTIVE`, `EXPIRED`, `EXECUTED`, `IGNORED` |
| `asset` | string | Lọc theo asset | `PAXGUSDT` |
| `timeframe` | string | Lọc theo timeframe | `1h`, `4h` |
| `sort` | string | Sắp xếp | `createdAt:desc` |
| `page` | number | Trang | `1` |
| `limit` | number | Số item | `20` |

**Response example**:
```json
{
  "data": [
    {
      "_id": "67d0a1b2c3d4e5f6a7b8c9d0",   // Signal ID
      "accountId": "69b0f1ccb37fe2f00470be1e",
      "asset": "PAXGUSDT",                  // Asset
      "timeframe": "1h",                    // "1h" | "4h"
      "signalType": "BUY",                  // "BUY" | "SELL" | "HOLD"
      "confidence": 87,                     // Điểm tin cậy 0–100
      "confidenceLabel": "high",            // "low" | "medium" | "high" | "very_high"
      "insight": "Bullish momentum confirmed by RSI recovery and volume surge. Gold demand supported by DXY pullback. H1 structure suggests continued uptrend.",  // AI insight đầy đủ
      "indicatorsUsed": ["RSI", "MACD", "EMA50", "EMA200", "BB"],  // Indicator đã dùng
      "keyFactors": [
        { "factor": "RSI recovering from oversold", "weight": "high" },
        { "factor": "Volume +32% vs 20-day avg", "weight": "medium" },
        { "factor": "DXY pullback", "weight": "medium" }
      ],
      "llmModel": "gpt-4o-mini",            // Model LLM đã dùng
      "status": "ACTIVE",                   // ACTIVE | EXPIRED | SUPERSEDED | EXECUTED | IGNORED
      "priceAtCreation": 2042.50,          // Giá lúc tạo signal
      "expiresAt": "2026-03-11T14:00:00.000Z",  // Thời điểm hết hạn
      "executedAt": null,                   // Thời điểm thực thi (nếu EXECUTED)
      "supersededBy": null,                 // ID signal thay thế (nếu SUPERSEDED)
      "createdAt": "2026-03-11T10:00:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### 5.2 Lấy Signals ACTIVE mới nhất

#### `GET /signals/latest`
**Auth**: ✅
**Mô tả**: Chỉ trả về signal có `status=ACTIVE`, sắp xếp theo `createdAt` mới nhất.
**Response**: Cùng format với `GET /signals`

**Query params bổ sung**:
| Field | Type | Ý nghĩa |
|-------|------|----------|
| `asset` | string | Lọc theo asset (ví dụ: chỉ hiện PAXGUSDT) |
| `timeframe` | string | Lọc theo timeframe |

---

### 5.3 Lấy chi tiết Signal

#### `GET /signals/:id`
**Auth**: ✅
**Params**: `id` — Signal ObjectId
**Response**: 1 signal object (giống item trong array)

---

### 5.4 Ignore Signal

#### `PATCH /signals/:id/ignore`
**Auth**: ✅
**Mô tả**: Đánh dấu signal là IGNORED (bỏ qua, không trade).

**Params**: `id` — Signal ObjectId
**Request body**: Không cần
**Response**: Signal object sau khi update với `status: "IGNORED"`

---

### 5.5 Thực thi Signal (Trade from Signal)

#### `POST /trades/from-signal`
**Auth**: ✅
**Mô tả**: Tạo Order + Trade + Position từ một signal đang ACTIVE.

**Request body**:
```json
{
  "signalId": "67d0a1b2c3d4e5f6a7b8c9d0",  // Signal ID (required)
  "accountId": "69b0f1ccb37fe2f00470be1e"   // Account ID (required)
}
```

**Pre-conditions** (backend tự kiểm tra):
- Signal phải `status=ACTIVE`
- Signal chưa expired (`expiresAt > now`)
- Signal được tạo trong vòng 30 phút
- Signal type phải là `BUY` hoặc `SELL` (không trade HOLD)

**Response example** (HTTP 201):
```json
{
  "order": {
    "_id": "...",
    "accountId": "...",
    "symbol": "PAXGUSDT",
    "side": "buy",
    "orderType": "market",
    "quantity": 0.477,           // Tính từ balance / priceAtCreation
    "status": "filled",
    "averageFilledPrice": 2042.50,
    "source": "system",
    "filledAt": "2026-03-11T10:05:00.000Z"
  },
  "trade": {
    "_id": "...",
    "orderId": "...",
    "symbol": "PAXGUSDT",
    "side": "buy",
    "filledPrice": 2042.50,
    "filledQuantity": 0.477,
    "notionalUsd": 973.27,
    "fees": 0,
    "executedAt": "2026-03-11T10:05:00.000Z"
  },
  "position": {
    "_id": "...",
    "symbol": "PAXGUSDT",
    "side": "long",
    "entryPrice": 2042.50,
    "quantity": 0.477,
    "notionalUsd": 973.27,
    "stopLossPrice": 1991.24,    // entryPrice * (1 - stopLoss%)
    "takeProfitPrice": 2124.20,  // entryPrice * (1 + takeProfit%)
    "status": "open",
    "monitoringStatus": "active"
  }
}
```

**Error responses**:
```json
// Signal đã hết hạn (HTTP 400)
{ "statusCode": 400, "message": "Signal has expired" }

// Signal type là HOLD (HTTP 400)
{ "statusCode": 400, "message": "Cannot execute a HOLD signal" }

// Signal quá cũ (HTTP 400)
{ "statusCode": 400, "message": "Signal is too old to execute (>30 min)" }
```

---

### 5.6 Mapping Signal → UI `InsightPage`

| UI field | API field |
|----------|-----------|
| `id` | `_id` |
| `symbol` | Format `asset` → `PAXG/USDT` |
| `action` | `signalType` (`BUY`/`SELL`/`HOLD`) |
| `timeAgo` | Tính từ `createdAt` → `"5 min ago"` |
| `strategy` | Format `timeframe` → `"H1 Strategy"` / `"H4 Strategy"` |
| `confidence` | `confidence` |
| `signalStrength` | Map từ `confidenceLabel`: low=1, medium=2, high=3, very_high=3 |
| `description` | `insight` |
| `entry` | Format `priceAtCreation` → `"$2,042.50"` |
| `stopLoss` | Tính: `priceAtCreation * 0.98` (2% SL default) |
| `takeProfit` | Tính: `priceAtCreation * 1.04` (4% TP default) |

---

## 6. Create AI Bot Page

### 6.1 Tạo bot

Dùng `POST /bots` (xem mục **3.3**).

**Mapping từ form 2-step wizard**:

**Step 1 — Risk Settings**:
| Form field | API field |
|------------|-----------|
| `riskProfile` (Conservative/Balanced/Aggressive) | Preset `maxDrawdownLimit` + `dailyStopLossUSD` |
| `maxDrawdownLimit` slider | `maxDrawdownLimit` (1–15) |
| `dailyStopLossUSD` | `dailyStopLossUSD` |

**Step 2 — AI Config**:
| Form field | API field |
|------------|-----------|
| `tradingMode` (Sandbox/Live) | `tradingMode` (`sandbox`/`live`) |
| `assetType` | `asset` (`PAXGUSDT`) |
| `totalCapital` | `totalCapital` (number) |
| `maxEntrySize` | `maxEntrySize` (number) |
| `takeProfit` % | `takeProfit` (number) |
| `stopLoss` % | `stopLoss` (number) |
| `timeframe` | `timeframe` (`1h`/`4h`) |

**Account ID**: Lấy từ `GET /accounts` (account `isDefault=true`)

---

## 7. Settings & Security Page

### 7.1 Lấy thông tin Account

#### `GET /accounts`
**Auth**: ✅
**Mô tả**: Lấy account của user.

**Response example**:
```json
{
  "data": [
    {
      "_id": "69b0f1ccb37fe2f00470be1e",
      "accountType": "paper",           // "paper" | "live"
      "exchange": "binance",            // "binance" | "okx" | "bybit"
      "label": "My Paper Account",
      "balance": 9027.73,              // Số dư hiện tại (USD)
      "initialBalance": 10000,         // Số dư ban đầu
      "currency": "USDT",
      "status": "active",              // "active" | "suspended" | "closed"
      "isDefault": true,
      "notifications": {
        "discordWebhookUrl": "https://discord.com/api/webhooks/...",
        "telegramBotToken": "123456:ABC...",
        "telegramChatId": "-100...",
        "enabled": true               // Bật/tắt toàn bộ notification
      }
    }
  ]
}
```

---

### 7.2 Cập nhật Notification Config

#### `PATCH /accounts/:id`
**Auth**: ✅

**Request body**:
```json
{
  "notifications": {
    "discordWebhookUrl": "https://discord.com/api/webhooks/xxx/yyy",  // Discord Webhook URL
    "telegramBotToken": "123456789:AABBcc...",  // Telegram Bot Token
    "telegramChatId": "-1001234567890",         // Telegram Chat/Channel ID
    "enabled": true                             // Bật/tắt notification
  }
}
```

**Response**: Account object sau update

---

### 7.3 Chỉ số còn thiếu — Bổ sung sau
- Exchange API Key management (Binance/OKX API key + secret)
- Institutional Profile (entity name, terminal ID)
- Global risk constraints (Max Exposure, Leverage Cap)

---

## Appendix: Error Response Format

Tất cả lỗi đều theo format chuẩn:

```json
{
  "statusCode": 400,             // HTTP status code
  "message": "Mô tả lỗi",       // Thông báo lỗi
  "correlationId": "abc-123"     // Request ID để trace log
}
```

| HTTP Code | Ý nghĩa |
|-----------|---------|
| 400 | Dữ liệu không hợp lệ / business rule vi phạm |
| 401 | Chưa xác thực (thiếu/sai JWT) |
| 403 | Không có quyền (đúng user nhưng không phải owner) |
| 404 | Không tìm thấy resource |
| 500 | Lỗi server |

---

## Appendix: Authentication Flow

```
1. POST /auth/login  (IAM service - port 3001)
   Body: { email, password }
   Response: { access_token: "eyJ..." }

2. Mọi request DGT: thêm header
   Authorization: Bearer eyJ...
```
