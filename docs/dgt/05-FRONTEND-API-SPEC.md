# DGT Frontend API Specification

> **Version**: 1.0.0 | **Base URL**: `http://localhost:3008` (local) / `https://xsai-api.x-or.cloud/dgt` (production)
>
> Tất cả API đều yêu cầu JWT Bearer Token. Token lấy từ IAM service (`POST /iam/auth/login`).

---

## Authentication

Tất cả endpoints đều yêu cầu header:

```
Authorization: Bearer <JWT_TOKEN>
```

Nếu thiếu hoặc token hết hạn, server trả về:

```json
{ "statusCode": 401, "message": "Unauthorized" }
```

---

## Dashboard APIs

> **Dùng cho**: Trang **Dashboard** (trang chủ sau đăng nhập)
>
> Hiển thị tổng quan portfolio, giá vàng/crypto realtime, và biểu đồ lịch sử giá trị danh mục.

---

### 1. Portfolio Summary

**Mục đích**: Tổng quan portfolio — tổng giá trị, PnL, phân bổ tài sản. Dùng cho các widget số liệu tóm tắt ở đầu trang Dashboard.

```
GET /dashboard/summary
```

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**: _(không có)_

**Response 200**:

```json
{
  "portfolio": {
    "totalValueUsd": 12450.75,
    "cashBalanceUsd": 7200.00,
    "positionsValueUsd": 5250.75,
    "totalPnlUsd": 2450.75,
    "totalPnlPct": 24.51,
    "realizedPnlUsd": 1200.50,
    "unrealizedPnlUsd": 1250.25
  },
  "assetAllocation": [
    {
      "symbol": "PAXGUSDT",
      "valueUsd": 5250.75,
      "pct": 42.2,
      "quantity": 1.0125
    },
    {
      "symbol": "USDT",
      "valueUsd": 7200.00,
      "pct": 57.8,
      "quantity": 7200.00
    }
  ],
  "updatedAt": "2026-03-04T08:40:20.095Z"
}
```

**Response fields**:

| Field | Type | Ý nghĩa |
|-------|------|---------|
| `portfolio.totalValueUsd` | `number` | Tổng giá trị danh mục (tiền mặt + vị thế) |
| `portfolio.cashBalanceUsd` | `number` | Số dư tiền mặt còn lại trong tài khoản |
| `portfolio.positionsValueUsd` | `number` | Tổng giá trị các vị thế đang mở (tính theo giá hiện tại) |
| `portfolio.totalPnlUsd` | `number` | Tổng lãi/lỗ (realized + unrealized), USD |
| `portfolio.totalPnlPct` | `number` | Tổng lãi/lỗ theo % so với vốn ban đầu |
| `portfolio.realizedPnlUsd` | `number` | Lãi/lỗ đã thực hiện (từ các lệnh đã đóng) |
| `portfolio.unrealizedPnlUsd` | `number` | Lãi/lỗ chưa thực hiện (từ các vị thế đang mở) |
| `assetAllocation[].symbol` | `string` | Tên tài sản (e.g. `PAXGUSDT`, `USDT`) |
| `assetAllocation[].valueUsd` | `number` | Giá trị tài sản đó theo USD |
| `assetAllocation[].pct` | `number` | Tỷ trọng trong danh mục (%) |
| `assetAllocation[].quantity` | `number` | Số lượng nắm giữ |
| `updatedAt` | `string` (ISO 8601) | Thời điểm tính toán |

**Response 404** — Chưa có default account:
```json
{
  "statusCode": 404,
  "message": "No default account found for this user"
}
```

---

### 2. Price Cards

**Mục đích**: Dữ liệu giá các asset kèm sparkline (mini chart). Dùng cho các card giá ở đầu Dashboard.

```
GET /dashboard/price-cards
```

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Tham số | Kiểu | Bắt buộc | Default | Ví dụ | Ý nghĩa |
|---------|------|----------|---------|-------|---------|
| `symbols` | `string` | Không | `PAXGUSDT,XAUTUSD,XAUUSD` | `PAXGUSDT,XAUTUSD` | Danh sách symbols cách nhau bằng dấu phẩy |
| `sparklinePoints` | `number` | Không | `7` | `14` | Số điểm dữ liệu cho mini chart |

**Response 200**:

```json
{
  "priceCards": [
    {
      "symbol": "PAXGUSDT",
      "price": 5184.39,
      "change24hUsd": -35.16,
      "change24hPct": -0.67,
      "isPositive": false,
      "high24h": 5441.14,
      "low24h": 5027.33,
      "sparkline": [5181.53, 5181.49, 5181.19, 5181.74, 5183.64, 5185.40, 5184.39],
      "source": "binance_spot",
      "timestamp": "2026-03-04T08:37:43.792Z"
    },
    {
      "symbol": "XAUTUSD",
      "price": 5133.80,
      "change24hUsd": -49.20,
      "change24hPct": -0.95,
      "isPositive": false,
      "high24h": 5389.40,
      "low24h": 4979.90,
      "sparkline": [5126.10, 5121.40, 5121.20, 5123.60, 5133.60, 5132.90, 5133.80],
      "source": "bitfinex",
      "timestamp": "2026-03-04T08:35:00.378Z"
    }
  ]
}
```

**Response fields**:

| Field | Type | Ý nghĩa |
|-------|------|---------|
| `symbol` | `string` | Mã symbol (e.g. `PAXGUSDT`) |
| `price` | `number` | Giá hiện tại (USD) |
| `change24hUsd` | `number` | Thay đổi giá so với 24h trước (USD, âm = giảm) |
| `change24hPct` | `number` | Thay đổi giá so với 24h trước (%, âm = giảm) |
| `isPositive` | `boolean` | `true` nếu giá tăng so với 24h trước |
| `high24h` | `number` | Giá cao nhất trong 24h |
| `low24h` | `number` | Giá thấp nhất trong 24h |
| `sparkline` | `number[]` | Mảng giá đóng cửa gần nhất (N điểm, để vẽ mini chart) |
| `source` | `string` | Nguồn dữ liệu: `binance_spot`, `bitfinex`, `okx`, `goldapi` |
| `timestamp` | `string` (ISO 8601) | Thời điểm cập nhật giá gần nhất |

**Lưu ý**: Nếu symbol không có dữ liệu trong DB, nó sẽ bị bỏ qua (không có trong mảng trả về).

---

### 3. Portfolio History

**Mục đích**: Lịch sử giá trị danh mục theo ngày để vẽ biểu đồ đường trên Dashboard.

> **Lưu ý**: Data được tạo bởi daily snapshot job chạy lúc 00:05 UTC mỗi ngày. Account mới sẽ có `data: []` cho đến khi job chạy lần đầu.

```
GET /dashboard/portfolio-history
```

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Tham số | Kiểu | Bắt buộc | Default | Ví dụ | Ý nghĩa |
|---------|------|----------|---------|-------|---------|
| `range` | `enum` | Không | `30d` | `7d` | Khoảng thời gian: `7d`, `30d`, `90d`, `all` |

**Response 200** (có data):

```json
{
  "range": "30d",
  "data": [
    {
      "date": "2026-02-02",
      "totalValueUsd": 10000.00,
      "cashUsd": 10000.00,
      "positionsUsd": 0.00
    },
    {
      "date": "2026-02-15",
      "totalValueUsd": 11250.50,
      "cashUsd": 6000.00,
      "positionsUsd": 5250.50
    },
    {
      "date": "2026-03-03",
      "totalValueUsd": 12450.75,
      "cashUsd": 7200.00,
      "positionsUsd": 5250.75
    }
  ],
  "summary": {
    "startValueUsd": 10000.00,
    "endValueUsd": 12450.75,
    "changePct": 24.51
  }
}
```

**Response 200** (chưa có data):

```json
{
  "range": "30d",
  "data": [],
  "summary": null
}
```

**Response fields**:

| Field | Type | Ý nghĩa |
|-------|------|---------|
| `range` | `string` | Khoảng thời gian được query |
| `data[].date` | `string` (YYYY-MM-DD) | Ngày snapshot |
| `data[].totalValueUsd` | `number` | Tổng giá trị danh mục ngày đó |
| `data[].cashUsd` | `number` | Số dư tiền mặt ngày đó |
| `data[].positionsUsd` | `number` | Giá trị vị thế ngày đó |
| `summary.startValueUsd` | `number` | Giá trị đầu kỳ |
| `summary.endValueUsd` | `number` | Giá trị cuối kỳ |
| `summary.changePct` | `number` | Thay đổi (%) so với đầu kỳ |

---

## Analytics APIs

> **Dùng cho**: Trang **Analytics** (phân tích hiệu suất giao dịch)
>
> Hiển thị thống kê PnL, danh sách vị thế đang mở, lịch sử giao dịch, và biểu đồ PnL theo ngày.

---

### 4. Analytics Summary

**Mục đích**: Tổng hợp hiệu suất giao dịch theo khoảng thời gian. Dùng cho các metric card ở đầu trang Analytics.

```
GET /analytics/summary
```

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Tham số | Kiểu | Bắt buộc | Default | Ví dụ | Ý nghĩa |
|---------|------|----------|---------|-------|---------|
| `range` | `enum` | Không | `7d` | `30d` | Khoảng thời gian: `24h`, `7d`, `30d`, `90d`, `all` |
| `accountId` | `string` | Không | _(default account)_ | `69a7efe3...` | ID tài khoản cụ thể (nếu user có nhiều tài khoản) |

**Response 200**:

```json
{
  "range": "7d",
  "summary": {
    "netPnlUsd": 2450.75,
    "netPnlPct": 24.51,
    "realizedPnlUsd": 1200.50,
    "unrealizedPnlUsd": 1250.25,
    "totalVolumeUsd": 45600.00,
    "totalTrades": 12,
    "winRate": 66.7,
    "wins": 8,
    "losses": 4,
    "avgWinUsd": 312.50,
    "avgLossUsd": -187.25,
    "profitFactor": 3.33
  }
}
```

**Response fields**:

| Field | Type | Ý nghĩa |
|-------|------|---------|
| `range` | `string` | Khoảng thời gian query |
| `summary.netPnlUsd` | `number` | Tổng lãi/lỗ ròng (realized + unrealized), USD |
| `summary.netPnlPct` | `number` | Tổng lãi/lỗ (%) so với vốn ban đầu |
| `summary.realizedPnlUsd` | `number` | Lãi/lỗ đã thực hiện trong kỳ, USD |
| `summary.unrealizedPnlUsd` | `number` | Lãi/lỗ chưa thực hiện (toàn bộ vị thế đang mở), USD |
| `summary.totalVolumeUsd` | `number` | Tổng khối lượng giao dịch trong kỳ, USD |
| `summary.totalTrades` | `number` | Tổng số lệnh đã đóng trong kỳ |
| `summary.winRate` | `number` | Tỷ lệ lệnh thắng (%) |
| `summary.wins` | `number` | Số lệnh thắng |
| `summary.losses` | `number` | Số lệnh thua |
| `summary.avgWinUsd` | `number` | Trung bình lãi mỗi lệnh thắng, USD |
| `summary.avgLossUsd` | `number` | Trung bình lỗ mỗi lệnh thua, USD (giá trị âm) |
| `summary.profitFactor` | `number` | Tổng lãi / Tổng lỗ (> 1 là tốt) |

---

### 5. Open Positions

**Mục đích**: Danh sách các vị thế đang mở hiện tại. Dùng cho bảng "Open Positions" trong trang Analytics.

```
GET /analytics/positions/open
```

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Tham số | Kiểu | Bắt buộc | Default | Ví dụ | Ý nghĩa |
|---------|------|----------|---------|-------|---------|
| `accountId` | `string` | Không | _(default account)_ | `69a7efe3...` | ID tài khoản cụ thể |
| `page` | `number` | Không | `1` | `2` | Trang (pagination) |
| `limit` | `number` | Không | `20` | `10` | Số bản ghi mỗi trang |

**Response 200**:

```json
{
  "data": [
    {
      "id": "69a8b2c3...",
      "symbol": "PAXGUSDT",
      "side": "LONG",
      "entryPrice": 5100.00,
      "currentPrice": 5184.39,
      "quantity": 1.0125,
      "notionalUsd": 5186.39,
      "unrealizedPnlUsd": 85.49,
      "unrealizedPnlPct": 1.67,
      "isPositive": true,
      "stopLossPrice": 4900.00,
      "takeProfitPrice": 5500.00,
      "leverage": 1,
      "openedAt": "2026-02-28T10:30:00.000Z",
      "durationHours": 109.5
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

**Response fields**:

| Field | Type | Ý nghĩa |
|-------|------|---------|
| `data[].id` | `string` | ID của position |
| `data[].symbol` | `string` | Mã tài sản |
| `data[].side` | `string` | Hướng: `LONG` hoặc `SHORT` |
| `data[].entryPrice` | `number` | Giá mở vị thế, USD |
| `data[].currentPrice` | `number` | Giá hiện tại, USD |
| `data[].quantity` | `number` | Số lượng |
| `data[].notionalUsd` | `number` | Giá trị danh nghĩa, USD |
| `data[].unrealizedPnlUsd` | `number` | Lãi/lỗ chưa thực hiện, USD |
| `data[].unrealizedPnlPct` | `number` | Lãi/lỗ chưa thực hiện (%) |
| `data[].isPositive` | `boolean` | `true` nếu đang lãi |
| `data[].stopLossPrice` | `number\|null` | Giá stop-loss (nếu có) |
| `data[].takeProfitPrice` | `number\|null` | Giá take-profit (nếu có) |
| `data[].leverage` | `number` | Đòn bẩy (1 = spot) |
| `data[].openedAt` | `string` (ISO 8601) | Thời điểm mở vị thế |
| `data[].durationHours` | `number` | Thời gian đã giữ (giờ) |
| `total` | `number` | Tổng số vị thế đang mở |
| `page` | `number` | Trang hiện tại |
| `limit` | `number` | Số bản ghi mỗi trang |

---

### 6. Trade History

**Mục đích**: Lịch sử giao dịch (các vị thế đã đóng) theo khoảng thời gian. Dùng cho bảng "Trade History" trong trang Analytics.

```
GET /analytics/trades
```

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Tham số | Kiểu | Bắt buộc | Default | Ví dụ | Ý nghĩa |
|---------|------|----------|---------|-------|---------|
| `range` | `enum` | Không | `30d` | `7d` | Khoảng thời gian: `24h`, `7d`, `30d`, `90d`, `all` |
| `accountId` | `string` | Không | _(default account)_ | `69a7efe3...` | ID tài khoản cụ thể |
| `page` | `number` | Không | `1` | `1` | Trang (pagination) |
| `limit` | `number` | Không | `20` | `10` | Số bản ghi mỗi trang |

**Response 200**:

```json
{
  "data": [
    {
      "id": "T-012",
      "symbol": "PAXGUSDT",
      "side": "LONG",
      "entryPrice": 5050.00,
      "exitPrice": 5250.00,
      "quantity": 0.5,
      "realizedPnlUsd": 100.00,
      "realizedPnlPct": 3.96,
      "isPositive": true,
      "closeReason": "take_profit",
      "openedAt": "2026-02-25T09:00:00.000Z",
      "closedAt": "2026-03-01T14:30:00.000Z",
      "durationMinutes": 8730,
      "durationFormatted": "145h 30m",
      "date": "01 Mar 2026"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

**Response fields**:

| Field | Type | Ý nghĩa |
|-------|------|---------|
| `data[].id` | `string` | ID hiển thị dạng `T-001`, `T-002`, ... |
| `data[].symbol` | `string` | Mã tài sản |
| `data[].side` | `string` | Hướng: `LONG` hoặc `SHORT` |
| `data[].entryPrice` | `number` | Giá vào lệnh, USD |
| `data[].exitPrice` | `number` | Giá thoát lệnh, USD |
| `data[].quantity` | `number` | Số lượng |
| `data[].realizedPnlUsd` | `number` | Lãi/lỗ thực hiện, USD |
| `data[].realizedPnlPct` | `number` | Lãi/lỗ thực hiện (%) so với vốn lệnh |
| `data[].isPositive` | `boolean` | `true` nếu lãi |
| `data[].closeReason` | `string\|null` | Lý do đóng: `take_profit`, `stop_loss`, `manual`, `liquidation` |
| `data[].openedAt` | `string` (ISO 8601) | Thời điểm mở |
| `data[].closedAt` | `string` (ISO 8601) | Thời điểm đóng |
| `data[].durationMinutes` | `number` | Thời gian giữ (phút) |
| `data[].durationFormatted` | `string` | Thời gian giữ dạng đọc được (e.g. `2h 30m`, `145h 30m`) |
| `data[].date` | `string` | Ngày đóng lệnh dạng `DD Mon YYYY` |
| `total` | `number` | Tổng số lệnh trong kỳ |
| `page` | `number` | Trang hiện tại |
| `limit` | `number` | Số bản ghi mỗi trang |

---

### 7. PnL Chart

**Mục đích**: Dữ liệu lãi/lỗ theo ngày để vẽ biểu đồ (daily + cumulative). Dùng cho biểu đồ "PnL Over Time" trong trang Analytics.

```
GET /analytics/pnl-chart
```

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:

| Tham số | Kiểu | Bắt buộc | Default | Ví dụ | Ý nghĩa |
|---------|------|----------|---------|-------|---------|
| `range` | `enum` | Không | `7d` | `30d` | Khoảng thời gian: `24h`, `7d`, `30d`, `90d`, `all` |
| `accountId` | `string` | Không | _(default account)_ | `69a7efe3...` | ID tài khoản cụ thể |

**Response 200**:

```json
{
  "range": "7d",
  "data": [
    {
      "date": "2026-02-26",
      "dailyPnlUsd": 120.50,
      "cumulativePnlUsd": 120.50
    },
    {
      "date": "2026-02-27",
      "dailyPnlUsd": -45.25,
      "cumulativePnlUsd": 75.25
    },
    {
      "date": "2026-03-01",
      "dailyPnlUsd": 380.00,
      "cumulativePnlUsd": 455.25
    }
  ]
}
```

**Response fields**:

| Field | Type | Ý nghĩa |
|-------|------|---------|
| `range` | `string` | Khoảng thời gian query |
| `data[].date` | `string` (YYYY-MM-DD) | Ngày |
| `data[].dailyPnlUsd` | `number` | PnL ngày đó, USD (âm = lỗ) |
| `data[].cumulativePnlUsd` | `number` | PnL tích lũy từ đầu kỳ đến ngày đó, USD |

**Lưu ý**: Các ngày không có giao dịch sẽ bị bỏ qua (không có trong mảng). Frontend nên nội suy nếu cần liên tục.

---

## Tổng hợp — Frontend Page Mapping

| API Endpoint | Method | Trang FE | Vị trí hiển thị |
|---|---|---|---|
| `GET /dashboard/summary` | GET | **Dashboard** | Widget tổng quan (Total Value, PnL, Asset Allocation) |
| `GET /dashboard/price-cards` | GET | **Dashboard** | Cards giá vàng/crypto với sparkline |
| `GET /dashboard/portfolio-history` | GET | **Dashboard** | Biểu đồ đường "Portfolio Value Over Time" |
| `GET /analytics/summary` | GET | **Analytics** | Metric cards (Win Rate, PnL, Volume, Profit Factor) |
| `GET /analytics/positions/open` | GET | **Analytics** | Bảng "Open Positions" |
| `GET /analytics/trades` | GET | **Analytics** | Bảng "Trade History" |
| `GET /analytics/pnl-chart` | GET | **Analytics** | Biểu đồ "Daily PnL / Cumulative PnL" |

---

## Error Responses

Tất cả error response đều theo format chuẩn:

```json
{
  "statusCode": 404,
  "message": "No default account found for this user",
  "timestamp": "2026-03-04T08:40:20.095Z",
  "path": "/dashboard/summary",
  "correlationId": "1179047c-a46f-4b9e-9906-fa1348081a04"
}
```

| HTTP Code | Trường hợp |
|-----------|-----------|
| `401` | Thiếu token hoặc token hết hạn |
| `404` | Không tìm thấy account (chưa tạo account hoặc sai `accountId`) |
| `400` | Sai tham số request |
| `500` | Lỗi server |

---

## Notes cho Frontend

1. **Account**: User cần tạo account trước khi dùng các API trừ `price-cards`. Tạo bằng `POST /accounts`.
2. **Portfolio History**: Cần chờ daily snapshot job (chạy 00:05 UTC). Nếu `data: []` → hiển thị trạng thái "Chưa có dữ liệu".
3. **PnL Chart**: Ngày không có trade sẽ không có trong mảng. FE nên fill `0` cho các ngày thiếu nếu muốn biểu đồ liên tục.
4. **Price Cards**: Realtime từ Binance/Bitfinex. Nên poll mỗi 30-60 giây.
5. **Default account**: Nếu không truyền `accountId`, API tự dùng account có `isDefault: true`.

---

**Last Updated**: 2026-03-04
**Service Port**: 3008 (local), 3380-3383 (production)
