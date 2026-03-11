# FRS-04 — Functional Requirements Specification: F5 Analytics & Reporting

**Dự án:** AI Digital Gold Trader  
**Module:** F5 — Analytics & Reporting  
**Phiên bản:** 1.1 — Revised  
**Ngày tạo:** 2026-03-11  
**Ngày cập nhật:** 2026-03-11  
**Tác giả:** BA Agent  
**Reviewer:** Nguyễn Thị Việt Hà (BA Lead)  
**Trạng thái:** Revised — Đã tích hợp feedback từ tonyh0129 (v1.0 → v1.1)

---

## Changelog

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0 | 2026-03-11 | Draft ban đầu — 7 Open Questions chờ trả lời |
| 1.1 | 2026-03-11 | Cập nhật dựa trên feedback từ anh Tony: tất cả 7 OQs resolved. Signal accuracy = binary direction. DB stack = MongoDB on-demand + Redis cache. Retention 90 ngày all tiers. PDF tiếng Anh MVP. Sharpe Rf=0%. Email out of scope. Drawdown alert default 10%/20%. |

---

## 1. Giới Thiệu

### 1.1 Mục Đích

Tài liệu này xác định các yêu cầu chức năng cho module **F5 — Analytics & Reporting** của hệ thống AI Digital Gold Trader.

Module F5 cung cấp cho người dùng khả năng **theo dõi hiệu suất giao dịch toàn diện**: từ dashboard tổng quan real-time đến báo cáo chi tiết theo bot/asset/thời gian, biểu đồ phân tích sâu, và so sánh độ chính xác tín hiệu AI với kết quả thực tế.

### 1.2 Phạm Vi

| Trong Scope | Ngoài Scope |
|---|---|
| Dashboard PnL, win rate, số lệnh tổng hợp | Thực thi lệnh giao dịch (F4) |
| Báo cáo hiệu suất theo bot / asset / timeframe | Phân tích thị trường real-time (F3) |
| Equity curve & drawdown chart với cảnh báo ngưỡng | Tư vấn đầu tư (không phải advisory tool) |
| Export PDF (tiếng Anh, MVP) / CSV | Thuế & kế toán tự động |
| So sánh AI signal accuracy vs thực tế (binary direction) | Tích hợp nền tảng giao dịch bên ngoài |
| Lọc & drill-down theo thời gian | **Email báo cáo định kỳ tự động** (chưa trong MVP) |
| **MVP: USDT pairs** (đồng nhất với FRS-03) | PDF đa ngôn ngữ / tiếng Việt (Phase 2) |
| | Pre-computed data warehouse (ClickHouse/BigQuery) |

### 1.3 Tài Liệu Liên Quan

| Tài Liệu | Mô Tả |
|---|---|
| FRS-01 | F1 — User Authentication & Profile |
| FRS-02 | F2 — Bot Management & Configuration |
| FRS-03 | F3 — Signal & Insight |
| FRS (F4) | F4 — Trade Execution (nguồn dữ liệu giao dịch cho F5) |
| FRS-BILL-01 | Billing & Payment (giới hạn analytics theo tier — xác định sau) |
| BRD-01 | Business Requirements Document |
| ARCH-01 | System Architecture |

### 1.4 Định Nghĩa & Thuật Ngữ

| Thuật Ngữ | Định Nghĩa |
|---|---|
| PnL | Profit and Loss — Lãi/lỗ của giao dịch |
| Win Rate | Tỷ lệ lệnh thắng / tổng số lệnh đã đóng × 100% |
| Equity Curve | Đường biểu diễn tổng vốn theo thời gian |
| Drawdown | Mức sụt giảm từ đỉnh đến mức hiện tại hoặc đáy |
| Max Drawdown | Drawdown lớn nhất trong toàn bộ lịch sử |
| Sharpe Ratio | Lợi nhuận điều chỉnh theo rủi ro. **Rf = 0%** (risk-free rate) trong MVP |
| Signal Accuracy | % tín hiệu AI đúng chiều giá thực tế (Binary Direction) |
| Binary Direction | Cách đo accuracy: BUY đúng = giá tăng bất kỳ; SELL đúng = giá giảm bất kỳ trong thời gian signal hiệu lực |
| Realized PnL | Lãi/lỗ từ lệnh đã đóng |
| Unrealized PnL | Lãi/lỗ từ lệnh đang mở |
| ROI | Return on Investment — Tỷ suất sinh lợi |
| USDT Pair | Cặp giao dịch đơn vị USDT — MVP: XAU/USDT. Đồng nhất FRS-03 |

---

## 2. Yêu Cầu Chức Năng

### F5-01: Dashboard Tổng Quan (Overview Dashboard)

**Mô tả:** Trang tổng quan hiển thị hiệu suất giao dịch của toàn bộ danh mục bot theo thời gian thực.

#### F5-01.1 — Metrics Tổng Hợp (Summary Cards)

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-01.1.1 | Hiển thị **Total PnL** (Realized + Unrealized) theo khoảng thời gian đã chọn | Must Have |
| F5-01.1.2 | Hiển thị **Win Rate** (%) trên toàn bộ lệnh đã đóng trong kỳ | Must Have |
| F5-01.1.3 | Hiển thị **Tổng số lệnh**: đã đóng / đang mở / bị hủy | Must Have |
| F5-01.1.4 | Hiển thị **ROI (%)** theo kỳ đã chọn | Must Have |
| F5-01.1.5 | Hiển thị **Max Drawdown (%)** trong kỳ | Must Have |
| F5-01.1.6 | Hiển thị **Best Bot** (bot có PnL cao nhất trong kỳ) | Should Have |
| F5-01.1.7 | Mỗi metric card phải có chỉ số delta so với kỳ trước (▲/▼ %) | Should Have |
| F5-01.1.8 | Dashboard tự động refresh dữ liệu mỗi **60 giây** | Must Have |

#### F5-01.2 — Bộ Lọc Thời Gian Dashboard

| Filter | Options | Ghi Chú |
|---|---|---|
| Preset | Hôm nay / 7 ngày / 30 ngày / 90 ngày / Năm nay | |
| Custom | Date range picker (From – To) | Tối đa 90 ngày (MVP retention) |
| Bot | All / chọn 1 hoặc nhiều bot | |
| Asset | All / XAU/USDT | **MVP: chỉ USDT pairs** (đồng nhất FRS-03) |

> Mặc định khi load: **7 ngày gần nhất, tất cả bot, tất cả asset**.

---

### F5-02: Báo Cáo Hiệu Suất (Performance Report)

**Mô tả:** Báo cáo chi tiết hiệu suất giao dịch với khả năng drill-down đa chiều.

#### F5-02.1 — Báo Cáo Theo Bot

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-02.1.1 | Bảng tóm tắt từng bot: PnL, Win Rate, số lệnh, ROI, Max Drawdown | Must Have |
| F5-02.1.2 | Có thể click vào từng bot để xem báo cáo chi tiết | Must Have |
| F5-02.1.3 | Sắp xếp bảng theo: PnL, Win Rate, số lệnh, ROI (ASC/DESC) | Should Have |
| F5-02.1.4 | So sánh 2 bot với nhau trên cùng biểu đồ | Nice to Have |

#### F5-02.2 — Báo Cáo Theo Asset

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-02.2.1 | PnL, Win Rate, số lệnh theo từng USDT pair (MVP: XAU/USDT) | Must Have |
| F5-02.2.2 | Biểu đồ tròn (pie chart) phân bổ volume giao dịch theo asset | Should Have |

#### F5-02.3 — Báo Cáo Theo Thời Gian

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-02.3.1 | PnL theo ngày / tuần / tháng (bar chart) | Must Have |
| F5-02.3.2 | Win Rate theo ngày / tuần / tháng (line chart) | Should Have |
| F5-02.3.3 | Số lệnh theo giờ trong ngày (heatmap) — phát hiện giờ giao dịch hiệu quả | Nice to Have |

#### F5-02.4 — Chi Tiết Từng Lệnh (Trade Log)

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-02.4.1 | Danh sách đầy đủ các lệnh đã đóng với: bot, asset, side, entry price, exit price, PnL, duration | Must Have |
| F5-02.4.2 | Phân trang 20 records/trang | Must Have |
| F5-02.4.3 | Filter trade log: bot, asset, side (BUY/SELL), kết quả (Lời/Lỗ), khoảng thời gian | Must Have |
| F5-02.4.4 | Hiển thị signal ID đã trigger lệnh (liên kết với F3) | Should Have |

---

### F5-03: Biểu Đồ Equity Curve & Drawdown

**Mô tả:** Biểu đồ trực quan hóa tăng trưởng vốn và mức độ rủi ro theo thời gian.

#### F5-03.1 — Equity Curve

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-03.1.1 | Line chart hiển thị tổng vốn (vốn gốc + PnL tích lũy) theo trục thời gian | Must Have |
| F5-03.1.2 | Có thể chọn xem: tất cả bot / từng bot riêng lẻ | Must Have |
| F5-03.1.3 | Trục X: ngày/giờ (tùy zoom level); Trục Y: giá trị tuyệt đối (USD) hoặc % ROI | Must Have |
| F5-03.1.4 | Hover tooltip hiển thị: ngày, tổng vốn, PnL tích lũy, ROI (%) | Must Have |
| F5-03.1.5 | Highlight điểm đỉnh (Peak) và điểm đáy (Trough) trên chart | Should Have |
| F5-03.1.6 | Hỗ trợ zoom in/out và pan trên chart | Should Have |
| F5-03.1.7 | Đường benchmark: đường ngang tham chiếu vốn ban đầu | Should Have |

#### F5-03.2 — Drawdown Chart

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-03.2.1 | Area chart hiển thị % drawdown so với đỉnh gần nhất theo thời gian | Must Have |
| F5-03.2.2 | Vùng drawdown được tô màu đỏ theo độ đậm nhạt theo mức độ | Must Have |
| F5-03.2.3 | Hiển thị Max Drawdown rõ ràng với annotation giá trị % | Must Have |
| F5-03.2.4 | Cảnh báo trực quan khi drawdown vượt ngưỡng: **🟡 Warning ≥ 10%** (default), **🔴 Danger ≥ 20%** (default). User có thể config từ 5%–50%, bước 5% | Must Have |

#### F5-03.3 — Các Chỉ Số Rủi Ro

| Chỉ Số | Mô Tả | Công Thức / Ghi Chú | Mức Độ |
|---|---|---|---|
| Max Drawdown (%) | Mức sụt giảm lớn nhất từ peak | Peak-to-trough trong kỳ | Must Have |
| Average Drawdown (%) | Drawdown trung bình | | Should Have |
| Sharpe Ratio | Lợi nhuận / độ lệch chuẩn | **Rf = 0%**. `Sharpe = Mean(daily_return) / Std(daily_return) × √252` | Should Have |
| Profit Factor | Tổng lợi nhuận / tổng thua lỗ | Absolute values | Should Have |
| Average Win / Average Loss | Trung bình lệnh lời / lệnh lỗ | | Must Have |
| Largest Win / Largest Loss | Lệnh lời lớn nhất / lệnh lỗ lớn nhất | | Should Have |
| Recovery Factor | Net PnL / Max Drawdown | | Nice to Have |

> **Sharpe Ratio (OQ-05 resolved):** Sử dụng **Rf = 0%** (risk-free rate = 0) trong MVP. Hiển thị tooltip "(risk-free rate = 0%)" trên UI để transparent. Phù hợp với gold/crypto trading context nơi không có benchmark risk-free rate chuẩn.

---

### F5-04: So Sánh AI Signal Accuracy vs Kết Quả Thực Tế

**Mô tả:** Đánh giá độ chính xác dự đoán của AI bằng cách đối chiếu tín hiệu với diễn biến giá thực tế.

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-04.1 | Tính **Signal Accuracy (%)** = số tín hiệu đúng chiều / tổng tín hiệu EXECUTED | Must Have |
| F5-04.2 | Phân tích accuracy theo: signal type (BUY/SELL), confidence level, timeframe, asset | Must Have |
| F5-04.3 | Bảng thống kê: tổng tín hiệu, đúng, sai, accuracy (%) theo từng mức confidence | Must Have |
| F5-04.4 | Line chart: accuracy trend theo thời gian (cải thiện hay suy giảm) | Should Have |
| F5-04.5 | Scatter plot: Confidence score vs Actual PnL của lệnh tương ứng | Nice to Have |
| F5-04.6 | Thống kê: signal nào có confidence cao nhất nhưng sai (false positives) | Should Have |

**Định Nghĩa "Tín Hiệu Đúng" — Binary Direction (MVP)**

> **Đã xác nhận (OQ-01):** Dùng phương án **Binary Direction** cho MVP — đơn giản nhất, cho phép ra sản phẩm nhanh và thu thập data thực tế trước.

```
BUY signal đúng:  Giá ĐÓNG tại thời điểm expires_at > Giá lúc signal được tạo
                  (giá tăng bất kỳ — không cần đạt ngưỡng %)

SELL signal đúng: Giá ĐÓNG tại thời điểm expires_at < Giá lúc signal được tạo
                  (giá giảm bất kỳ)

HOLD signal:      Không tính vào accuracy (excluded from denominator)

Accuracy (%) = Số BUY/SELL signals đúng chiều / Tổng BUY/SELL signals EXECUTED × 100
```

> **Lộ trình nâng cấp:** Sau khi có data thực tế (≥ 3 tháng), có thể nâng lên threshold-based (ngưỡng % theo timeframe) trong Phase 2.

---

### F5-05: Export Báo Cáo

**Mô tả:** Cho phép người dùng xuất báo cáo dưới dạng file để lưu trữ hoặc chia sẻ.

#### F5-05.1 — Export CSV

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-05.1.1 | Export Trade Log ra CSV (toàn bộ hoặc theo filter hiện tại) | Must Have |
| F5-05.1.2 | Export Signal History với accuracy annotation ra CSV | Should Have |
| F5-05.1.3 | CSV encoding: UTF-8 BOM (để mở đúng ký tự đặc biệt trong Excel) | Must Have |
| F5-05.1.4 | Giới hạn export: tối đa 50,000 records / request | Must Have |

**CSV Trade Log Columns:**

```
trade_id, bot_id, bot_name, asset, side, entry_time, exit_time,
entry_price, exit_price, quantity, pnl, pnl_pct, duration_minutes,
signal_id, signal_confidence, status
```

#### F5-05.2 — Export PDF

> **Đã xác nhận (OQ-04):** PDF **tiếng Anh** trong MVP. Tiếng Việt (font rendering) là Phase 2, không implement trong phiên bản đầu tiên.

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F5-05.2.1 | Export Performance Report (snapshot tại thời điểm export) ra PDF | Must Have |
| F5-05.2.2 | PDF include: summary metrics, equity curve chart, drawdown chart, trade log (top 50) | Must Have |
| F5-05.2.3 | PDF có branding: logo, tên user, ngày export, khoảng thời gian báo cáo | Should Have |
| F5-05.2.4 | PDF được generate server-side (không phụ thuộc browser), **nội dung tiếng Anh (MVP)** | Must Have |
| F5-05.2.5 | Thời gian generate PDF ≤ 10 giây (p95) | Should Have |
| F5-05.2.6 | Link download có TTL 15 phút sau khi generate xong | Must Have |

---

### F5-06: Thống Kê Nhanh (Quick Stats)

**Mô tả:** Các widget thống kê nhanh xuất hiện ở nhiều nơi trong app.

| Widget | Vị Trí | Nội Dung | Mức Độ |
|---|---|---|---|
| Bot Performance Badge | F2 Bot List | PnL hôm nay, Win Rate 7 ngày | Must Have |
| Mini Equity Sparkline | Bot Detail | Equity curve 7 ngày dạng mini | Should Have |
| Today's PnL Banner | App Header | PnL tổng hợp hôm nay (all bots) | Should Have |
| Signal Accuracy Badge | F3 Signal Card | Accuracy % của bot đó (30 ngày) | Should Have |

---

## 3. Non-Functional Requirements

### 3.1 Hiệu Năng

| NFR ID | Yêu Cầu | Ngưỡng |
|---|---|---|
| NFR-PERF-01 | Dashboard load time (full render với charts) | < 3 giây (p95) |
| NFR-PERF-02 | API query performance report (30 ngày, 5 bots) | < 1 giây (p95) |
| NFR-PERF-03 | API query trade log (1,000 records) | < 500ms (p95) |
| NFR-PERF-04 | Export PDF | < 10 giây (p95) |
| NFR-PERF-05 | Export CSV (10,000 records) | < 5 giây (p95) |

### 3.2 Độ Chính Xác Dữ Liệu

| NFR ID | Yêu Cầu |
|---|---|
| NFR-ACC-01 | PnL, Win Rate phải nhất quán với dữ liệu trade execution (F4) — không được tính sai |
| NFR-ACC-02 | Số liệu dashboard và báo cáo export phải khớp nhau (zero discrepancy) |
| NFR-ACC-03 | Dữ liệu analytics phải có timestamp rõ ràng (timezone: UTC, hiển thị theo timezone user) |
| NFR-ACC-04 | Khi có lỗi data (giá bị thiếu, lệnh chưa sync), hiển thị cảnh báo thay vì tính sai |

### 3.3 Bảo Mật

| NFR ID | Yêu Cầu |
|---|---|
| NFR-SEC-01 | User chỉ xem được dữ liệu của bot/tài khoản của mình |
| NFR-SEC-02 | API analytics yêu cầu JWT authentication |
| NFR-SEC-03 | Export file được generate server-side; link download có TTL 15 phút |
| NFR-SEC-04 | Không cache analytics data của user này cho user khác |

### 3.4 Khả Năng Mở Rộng

| NFR ID | Yêu Cầu |
|---|---|
| NFR-SCALE-01 | Hỗ trợ query analytics cho user có > 10,000 lệnh giao dịch mà không timeout |
| NFR-SCALE-02 | **MVP: On-demand MongoDB Aggregation Pipeline** + **Redis cache 5 phút** cho dashboard summary. Không cần pre-computed data warehouse trong MVP. Migrate sang pre-aggregation nếu cần khi scale. |
| NFR-SCALE-03 | Analytics data retention: **90 ngày** (đồng nhất FRS-03, không phân biệt tier trong MVP) |

---

## 4. API Specification (Sơ Bộ)

### 4.1 Endpoints

| Method | Endpoint | Mô Tả |
|---|---|---|
| `GET` | `/api/v1/analytics/summary` | Dashboard summary metrics (PnL, win rate, ROI...) |
| `GET` | `/api/v1/analytics/performance` | Báo cáo hiệu suất (theo bot/asset/time) |
| `GET` | `/api/v1/analytics/equity-curve` | Dữ liệu equity curve (time series) |
| `GET` | `/api/v1/analytics/drawdown` | Dữ liệu drawdown (time series) |
| `GET` | `/api/v1/analytics/trades` | Trade log (có filter, pagination) |
| `GET` | `/api/v1/analytics/signal-accuracy` | Thống kê accuracy AI signal (binary direction) |
| `POST` | `/api/v1/analytics/export/csv` | Tạo export CSV job (async) |
| `POST` | `/api/v1/analytics/export/pdf` | Tạo export PDF job (async, tiếng Anh) |
| `GET` | `/api/v1/analytics/export/status/:job_id` | Check export job status |
| `GET` | `/api/v1/analytics/export/download/:job_id` | Download file (TTL 15 phút) |

### 4.2 Data Models

**Summary Response:**
```json
{
  "period": { "from": "2026-03-01", "to": "2026-03-11" },
  "total_pnl": 1250.75,
  "total_pnl_pct": 5.24,
  "realized_pnl": 980.50,
  "unrealized_pnl": 270.25,
  "win_rate": 68.5,
  "total_trades": 142,
  "winning_trades": 97,
  "losing_trades": 45,
  "roi_pct": 5.24,
  "max_drawdown_pct": -3.8,
  "sharpe_ratio": 1.42,
  "sharpe_risk_free_rate": 0,
  "best_bot": { "bot_id": "uuid", "name": "Gold Scalper", "pnl": 620.00 },
  "vs_previous_period": { "pnl_delta_pct": 12.3, "win_rate_delta": 2.1 },
  "cache_generated_at": "2026-03-11T09:55:00Z"
}
```

**Equity Curve Point:**
```json
{
  "timestamp": "2026-03-11T10:00:00Z",
  "equity": 25250.75,
  "roi_pct": 5.24,
  "cumulative_pnl": 1250.75,
  "drawdown_pct": -1.2
}
```

**Trade Log Record:**
```json
{
  "trade_id": "uuid",
  "bot_id": "uuid",
  "bot_name": "Gold Scalper",
  "asset": "XAU/USDT",
  "side": "BUY",
  "entry_time": "2026-03-11T09:15:00Z",
  "exit_time": "2026-03-11T11:30:00Z",
  "entry_price": 2683.40,
  "exit_price": 2691.20,
  "quantity": 0.5,
  "pnl": 3.90,
  "pnl_pct": 0.29,
  "duration_minutes": 135,
  "signal_id": "uuid",
  "signal_confidence": 82,
  "status": "CLOSED"
}
```

### 4.3 Query Parameters Phổ Biến

```
?from=2026-03-01&to=2026-03-11     # Date range (max 90 ngày)
&bot_id=uuid1,uuid2                # Filter by bot
&asset=XAU/USDT                    # Filter by USDT pair
&page=1&limit=20                   # Pagination
&sort=pnl&order=desc               # Sorting
```

---

## 5. User Flows

### 5.1 Flow 1 — Xem Dashboard Tổng Quan

```
[User vào trang Analytics]
    ↓
Load dashboard: 7 ngày gần nhất, tất cả bot (mặc định)
    ↓
MongoDB Aggregation Pipeline tính summary → Redis cache 5 phút
    ↓
Hiển thị summary cards: Total PnL, Win Rate, ROI, Drawdown
    ↓
Render Equity Curve + Drawdown Chart
    ↓
Nếu drawdown ≥ 10% → hiển thị cảnh báo 🟡 Warning
Nếu drawdown ≥ 20% → hiển thị cảnh báo 🔴 Danger
    ↓
User thay đổi filter (date range / bot)
    ↓
Dashboard re-fetch dữ liệu, re-render (invalidate cache nếu filter thay đổi)
```

### 5.2 Flow 2 — Xem Báo Cáo Chi Tiết Bot

```
[User chọn Bot X từ bảng Performance]
    ↓
Load báo cáo riêng cho Bot X: PnL, Win Rate, Equity Curve
    ↓
Hiển thị Trade Log của Bot X (phân trang)
    ↓
User filter trade log: asset (USDT pairs), side, date range
    ↓
User click trade → xem signal đã trigger lệnh đó
    ↓
Link sang F3 Signal Detail
```

### 5.3 Flow 3 — Export Báo Cáo PDF (tiếng Anh)

```
[User click "Export PDF"]
    ↓
Modal: chọn khoảng thời gian + filter
    ↓
User confirm → hệ thống tạo async export job (server-side, tiếng Anh)
    ↓
Hiển thị progress indicator ("Generating report...")
    ↓
Job hoàn thành (≤ 10 giây) → download link xuất hiện
    ↓
User download PDF
    ↓
Link hết hạn sau 15 phút
```

### 5.4 Flow 4 — Xem Signal Accuracy (Binary Direction)

```
[User vào tab "AI Accuracy"]
    ↓
Hiển thị overall Signal Accuracy % (30 ngày gần nhất)
    ↓
Cách tính: BUY đúng = giá tăng; SELL đúng = giá giảm (tại expires_at)
    ↓
Bảng breakdown: theo confidence level / signal type
    ↓
User chọn bot cụ thể → accuracy riêng cho bot đó
    ↓
Line chart: accuracy trend theo tuần
    ↓
User export CSV accuracy report
```

---

## 6. Business Rules

| Rule ID | Mô Tả |
|---|---|
| BR-F5-01 | PnL chỉ tính từ lệnh **đã đóng** (Realized). Unrealized PnL hiển thị riêng, không cộng vào Win Rate |
| BR-F5-02 | Win Rate = lệnh có PnL > 0 / tổng lệnh đã đóng (không tính lệnh bị hủy) |
| BR-F5-03 | Max Drawdown tính từ đỉnh vốn cao nhất đến đáy trong cùng khoảng thời gian được chọn |
| BR-F5-04 | Signal Accuracy chỉ tính trên signals có trạng thái EXECUTED (đã được bot thực thi). HOLD excluded |
| BR-F5-05 | **Analytics data retention: 90 ngày cho tất cả tiers trong MVP** (đồng nhất FRS-03). Giới hạn theo tier sẽ xem xét trong FRS-BILL-01 nếu cần |
| BR-F5-06 | **Export PDF/CSV khả dụng cho tất cả users trong MVP**. Giới hạn theo tier (nếu có) xác định trong FRS-BILL-01 |
| BR-F5-07 | Analytics data: **on-demand MongoDB Aggregation Pipeline**. Dashboard summary được **cache Redis 5 phút**. Cache bị invalidate khi có trade mới hoặc filter thay đổi |
| BR-F5-08 | Timezone hiển thị theo cài đặt của user (default: UTC+7 cho thị trường VN) |
| BR-F5-09 | **Sharpe Ratio: Rf = 0%** (risk-free rate = 0). Hiển thị tooltip giải thích trên UI. Áp dụng cho tất cả tiers trong MVP |
| BR-F5-10 | Export CSV tối đa 50,000 records; nếu vượt, hệ thống thông báo và chia nhỏ request |
| BR-F5-11 | **Drawdown alert thresholds (mặc định):** 🟡 Warning ≥ 10%, 🔴 Danger ≥ 20%. User có thể config từ 5%–50% (bước 5%). Cảnh báo hiển thị trực tiếp trên chart và gửi in-app notification |
| BR-F5-12 | **Signal Accuracy — Binary Direction (MVP):** BUY đúng = giá đóng tại `expires_at` > giá lúc tạo signal. SELL đúng = giá đóng < giá lúc tạo. Không cần đạt ngưỡng % cụ thể. Phase 2: có thể nâng lên threshold-based sau khi có data thực tế |

---

## 7. Acceptance Criteria

### AC-F5-01: Dashboard Summary

**Given** user vào trang Analytics với filter mặc định (7 ngày, tất cả bot)  
**When** trang được load  
**Then:**
- [ ] Hiển thị đủ 6 summary cards: Total PnL, Win Rate, Số lệnh, ROI, Max Drawdown, Best Bot
- [ ] Dữ liệu lấy từ MongoDB aggregation, cache Redis 5 phút
- [ ] Số liệu chính xác khớp với trade log (có thể kiểm chứng)
- [ ] Load xong trong vòng 3 giây (p95)
- [ ] Delta vs kỳ trước hiển thị đúng chiều (▲/▼)

---

### AC-F5-02: Equity Curve Chart

**Given** user có ít nhất 5 lệnh đã đóng trong khoảng thời gian đã chọn  
**When** equity curve chart được render  
**Then:**
- [ ] Chart hiển thị đường liên tục từ ngày bắt đầu đến hôm nay
- [ ] Hover tooltip hiển thị: ngày, equity, PnL tích lũy, ROI%
- [ ] Có thể zoom in/out
- [ ] Điểm Peak và Trough được đánh dấu

---

### AC-F5-03: Drawdown Chart & Alert

**Given** user xem drawdown chart  
**When** chart được render và drawdown vượt ngưỡng  
**Then:**
- [ ] Vùng drawdown hiển thị màu đỏ (đậm hơn khi drawdown sâu hơn)
- [ ] Max Drawdown được annotate rõ ràng với giá trị %
- [ ] Không hiển thị drawdown dương (floor = 0%)
- [ ] Khi drawdown ≥ 10%: hiện icon 🟡 Warning và in-app notification
- [ ] Khi drawdown ≥ 20%: hiện icon 🔴 Danger và in-app notification

---

### AC-F5-04: Trade Log Filter

**Given** user áp dụng filter trên Trade Log  
**When** filter được áp dụng  
**Then:**
- [ ] Chỉ hiển thị trade khớp với filter
- [ ] Phân trang hoạt động đúng (20/trang)
- [ ] Tổng số records khớp với số được hiển thị
- [ ] User chỉ thấy trade của bot thuộc họ

---

### AC-F5-05: Export PDF (tiếng Anh)

**Given** user click Export PDF với khoảng thời gian hợp lệ  
**When** export job hoàn thành  
**Then:**
- [ ] File PDF download được trong ≤ 10 giây
- [ ] PDF có đủ: summary metrics, equity chart, drawdown chart, trade log
- [ ] PDF nội dung tiếng Anh (không yêu cầu tiếng Việt trong MVP)
- [ ] Số liệu trong PDF khớp với số liệu trên dashboard (zero discrepancy)
- [ ] Link download hết hạn sau 15 phút

---

### AC-F5-06: Signal Accuracy — Binary Direction

**Given** bot đã có ít nhất 20 signals EXECUTED (BUY/SELL)  
**When** user xem tab AI Accuracy  
**Then:**
- [ ] Signal Accuracy % = (số signal đúng chiều / tổng EXECUTED BUY+SELL) × 100
- [ ] BUY đúng = giá tại expires_at > giá lúc tạo signal (bất kỳ mức tăng)
- [ ] SELL đúng = giá tại expires_at < giá lúc tạo signal
- [ ] HOLD không được tính vào denominator
- [ ] Bảng breakdown theo confidence level (Low/Medium/High/Very High) chính xác
- [ ] Trend chart hiển thị đúng chiều (cải thiện/suy giảm)

---

### AC-F5-07: Sharpe Ratio

**Given** user xem Risk Metrics section  
**When** Sharpe Ratio được hiển thị  
**Then:**
- [ ] Sharpe = `Mean(daily_return) / Std(daily_return) × √252` với Rf = 0%
- [ ] UI hiển thị tooltip "(risk-free rate = 0%)" khi hover
- [ ] Giá trị Sharpe phản ánh đúng khoảng thời gian đang được filter

---

### AC-F5-08: Analytics Retention & Access

**Given** user ở bất kỳ tier nào (Free, Basic, Pro, Elite)  
**When** họ query analytics hoặc click Export  
**Then:**
- [ ] Có thể xem dữ liệu tối đa 90 ngày (không giới hạn theo tier trong MVP)
- [ ] Export PDF/CSV khả dụng (không bị block theo tier trong MVP)
- [ ] Tier restrictions sẽ được cập nhật sau khi FRS-BILL-01 được phê duyệt

---

## 8. Phụ Thuộc & Tích Hợp

### 8.1 Dependencies — Upstream

| Module | Dữ Liệu Cần | Ghi Chú |
|---|---|---|
| F1 — Auth | user_id, subscription tier | Phân quyền (tier restriction: xác định sau trong FRS-BILL-01) |
| F2 — Bot Management | bot_id, bot_name, initial_capital | Danh sách bot cho filter |
| F4 — Trade Execution | Toàn bộ trade records (đóng + mở), asset (USDT pairs) | Nguồn dữ liệu chính cho aggregation |
| F3 — Signal & Insight | signal_id, signal_type, confidence, created_at, expires_at | So sánh accuracy (binary direction) |
| Market Data | Giá OHLCV historical (USDT pairs) | Giá đóng tại expires_at để tính signal accuracy |
| MongoDB | Aggregation Pipeline, query layer | Database chính MVP |
| Redis | Cache layer (TTL 5 phút cho summary) | Performance optimization |

### 8.2 Dependencies — Downstream

| Module | Cần Gì Từ F5 | Ghi Chú |
|---|---|---|
| F2 — Bot Management | PnL, Win Rate per bot (quick stats) | Widget hiển thị trên danh sách bot |
| F3 — Signal | Signal accuracy badge | Hiển thị trên signal card |
| Notification System | Cảnh báo drawdown vượt ngưỡng (10%, 20%) | Trigger in-app alert |

---

## 9. Open Questions — Đã Giải Quyết ✅

> **Tất cả 7 Open Questions đã được anh Tony (tonyh0129) xác nhận ngày 11/03/2026. Không còn OQ nào đang chờ.**

| # | Câu Hỏi | Quyết Định | Áp Dụng |
|---|---|---|---|
| OQ-01 ✅ | Ngưỡng X% "signal đúng"? | **Binary Direction** — giá đúng hướng bất kể %. Phase 2 nâng lên threshold-based | F5-04, BR-F5-12, AC-F5-06 |
| OQ-02 ✅ | Pre-aggregation hay on-demand? DB stack? | **On-demand MongoDB Aggregation + Redis cache 5p** (MVP) | NFR-SCALE-02, BR-F5-07, 8.1 |
| OQ-03 ✅ | Analytics retention theo tier? | **90 ngày tất cả tiers** (đồng nhất FRS-03). Tier restriction xem xét trong FRS-BILL-01 | BR-F5-05, AC-F5-08 |
| OQ-04 ✅ | PDF cần tiếng Việt không? | **Chưa cần trong MVP** — PDF tiếng Anh. Tiếng Việt là Phase 2 | F5-05.2, BR-F5-06 |
| OQ-05 ✅ | Sharpe Ratio risk-free rate? | **Rf = 0%** — phổ biến trong gold/crypto; hiển thị tooltip transparent | F5-03.3, BR-F5-09, AC-F5-07 |
| OQ-06 ✅ | Email báo cáo định kỳ? | **Không implement trong MVP** — ngoài scope | 1.2 Out of Scope |
| OQ-07 ✅ | Drawdown cảnh báo ngưỡng? | **🟡 Warning 10%, 🔴 Danger 20%** mặc định; user configurable 5%–50% | F5-03.2.4, BR-F5-11, AC-F5-03 |

---

## 10. Rủi Ro

| Risk ID | Mô Tả | Khả Năng | Tác Động | Giảm Thiểu |
|---|---|---|---|---|
| R-01 | MongoDB aggregation chậm khi user có nhiều lệnh (> 10,000) → UX xấu | Trung bình | Cao | Index đúng cột (user_id, created_at, bot_id); Redis cache 5p cho summary; monitor query time |
| R-02 | Số liệu PnL không khớp giữa dashboard và export → mất trust người dùng | Trung bình | Rất cao | Single source of truth từ MongoDB; test nghiêm ngặt; zero discrepancy requirement |
| R-03 | PDF export timeout khi dữ liệu lớn | Trung bình | Trung bình | Async job pattern; timeout 30s với retry; giới hạn trade log top 50 trong PDF |
| R-04 | Signal accuracy Binary Direction quá "dễ đúng" → metric kém ý nghĩa về tài chính | Trung bình | Thấp | Chấp nhận cho MVP; ghi chú rõ methodology; nâng cấp threshold-based sau Phase 1 khi có data |
| R-05 | User hiểu nhầm Unrealized PnL là lãi thực → khiếu nại | Trung bình | Trung bình | Ghi chú rõ "Unrealized" kèm tooltip; màu sắc phân biệt Realized vs Unrealized |
| R-06 | Redis cache stale → dashboard hiển thị data cũ | Thấp | Trung bình | TTL 5 phút; force invalidate khi có trade mới; hiển thị "updated X minutes ago" trên UI |

---

*Phiên bản 1.1 — Revised — Đã tích hợp toàn bộ feedback từ anh Tony (tonyh0129) ngày 11/03/2026.*  
*Tất cả Open Questions đã được đóng. Tài liệu sẵn sàng để anh Tony complete và chuyển sang Technical Design Review.*
