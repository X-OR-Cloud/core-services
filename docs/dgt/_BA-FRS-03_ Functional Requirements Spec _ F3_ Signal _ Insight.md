# FRS-03 — Functional Requirements Specification: F3 Signal & Insight

**Dự án:** AI Digital Gold Trader  
**Module:** F3 — Signal & Insight  
**Phiên bản:** 1.1 — Revised  
**Ngày tạo:** 2026-03-11  
**Ngày cập nhật:** 2026-03-11  
**Tác giả:** BA Agent  
**Reviewer:** Nguyễn Thị Việt Hà (BA Lead)  
**Trạng thái:** Revised — Đã tích hợp feedback từ BA Lead (v1.0 → v1.1)

---

## Changelog

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0 | 2026-03-11 | Draft ban đầu — 6 Open Questions chờ trả lời |
| 1.1 | 2026-03-11 | Cập nhật dựa trên feedback BA Lead: OQ-01→OQ-06 đã resolve. Signal Engine xác định là LLM Model. Asset scope giới hạn USDT pairs. Dashboard dùng HTTP polling. Free tier được xem signal. |

---

## 1. Giới Thiệu

### 1.1 Mục Đích

Tài liệu này xác định các yêu cầu chức năng (Functional Requirements) cho module **F3 — Signal & Insight** của hệ thống AI Digital Gold Trader.

Module F3 chịu trách nhiệm tạo ra, quản lý và trình bày **tín hiệu giao dịch do AI (LLM) sinh ra** cùng **phân tích giải thích (insight)** để hỗ trợ người dùng và các bot ra quyết định giao dịch.

### 1.2 Phạm Vi

| Trong Scope | Ngoài Scope |
|---|---|
| Tạo tín hiệu BUY / SELL / HOLD bằng LLM | Thực thi lệnh giao dịch (thuộc F4 — Trade Execution) |
| Confidence score cho từng tín hiệu | Quản lý danh mục đầu tư |
| Giải thích tín hiệu bằng LLM (reasoning/insight) | Phân tích kỹ thuật thủ công bởi user |
| Lịch sử tín hiệu & filtering | Tín hiệu từ nguồn bên ngoài (3rd party) |
| Signal expiry logic | Cài đặt thuật toán AI (thuộc F2 — Bot Config) |
| Notification khi có tín hiệu mới | Quản lý tài khoản giao dịch |
| **MVP Scope: chỉ USDT pairs** | Các pairs ngoài USDT (XAG, BTC, ETH, etc. — Phase sau) |

### 1.3 Tài Liệu Liên Quan

| Tài Liệu | Mô Tả |
|---|---|
| FRS-01 | F1 — User Authentication & Profile |
| FRS-02 | F2 — Bot Management & Configuration |
| FRS-04 | F4 — Trade Execution (dependent on F3) |
| FRS-05 | F5 — Analytics & Reporting |
| BRD-01 | Business Requirements Document |
| ARCH-01 | System Architecture |
| FRS-BILL-01 | Billing & Payment (giới hạn theo tier — xác định sau) |

### 1.4 Định Nghĩa & Thuật Ngữ

| Thuật Ngữ | Định Nghĩa |
|---|---|
| Signal | Tín hiệu giao dịch do LLM tạo ra: BUY, SELL, hoặc HOLD |
| Confidence Score | Điểm tin cậy (0–100) thể hiện mức độ chắc chắn của LLM về tín hiệu |
| Insight / Reasoning | Giải thích bằng ngôn ngữ tự nhiên do LLM sinh ra, lý do AI đưa ra tín hiệu đó |
| LLM Signal Engine | Large Language Model được cấu hình với system prompt tùy chỉnh, nhận dữ liệu thị trường đầu vào và trả về signal ở định dạng structured output |
| Timeframe | Khung thời gian phân tích: 1m, 5m, 15m, 1h, 4h, 1d |
| Signal Expiry | Thời điểm tín hiệu hết hiệu lực và không còn khuyến nghị hành động |
| USDT Pair | Cặp giao dịch có đơn vị định giá là USDT — ví dụ: XAU/USDT (vàng). MVP chỉ hỗ trợ các cặp USDT |
| Bot | AI Trading Bot thuộc module F2 |

---

## 2. Yêu Cầu Chức Năng

### F3-01: Tạo Tín Hiệu Giao Dịch (Signal Generation)

#### F3-01.1 — LLM Signal Engine

**Mô tả:** Hệ thống sử dụng **LLM (Large Language Model)** được cấu hình với system prompt tùy chỉnh để phân tích dữ liệu thị trường và tạo tín hiệu giao dịch có cấu trúc. LLM nhận đầu vào là dữ liệu OHLCV + chỉ số kỹ thuật và trả về signal theo **structured output format** được định nghĩa trước.

**Yêu cầu:**

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-01.1.1 | Hệ thống phải tạo tín hiệu với 3 giá trị: **BUY**, **SELL**, **HOLD** | Must Have |
| F3-01.1.2 | Mỗi tín hiệu phải kèm **confidence score** từ 0–100 | Must Have |
| F3-01.1.3 | Tín hiệu được tạo cho từng cặp (bot_id × asset × timeframe) | Must Have |
| F3-01.1.4 | Tần suất tạo tín hiệu phụ thuộc timeframe: 1m → mỗi phút; 1h → mỗi giờ; 1d → mỗi ngày | Must Have |
| F3-01.1.5 | Tín hiệu phải được tạo trong vòng **30 giây** kể từ khi data mới được cập nhật (p95) | Must Have |
| F3-01.1.6 | Hệ thống phải hỗ trợ tạo tín hiệu cho ít nhất **100 bot đồng thời** | Must Have |
| F3-01.1.7 | Khi LLM không đủ dữ liệu hoặc confidence < 30, tín hiệu mặc định là HOLD | Must Have |
| F3-01.1.8 | LLM Signal Engine sử dụng **system prompt cố định** định nghĩa vai trò, định dạng output, và các quy tắc phân tích | Must Have |
| F3-01.1.9 | Output của LLM phải theo **structured format** (JSON) — không phải free text | Must Have |

#### F3-01.2 — Dữ Liệu Đầu Vào Cho LLM Signal Engine

**Mô tả:** Các dữ liệu được truyền vào LLM để phân tích và tạo tín hiệu. MVP scope: chỉ USDT pairs.

| Loại Dữ Liệu | Nguồn | Bắt Buộc | Ghi Chú |
|---|---|---|---|
| Giá real-time (OHLCV) của USDT pairs | Market Data Feed | Must Have | Ví dụ: XAU/USDT |
| Chỉ số kỹ thuật (RSI, MACD, MA, BB) | Tính toán nội bộ | Must Have | Tính sẵn, truyền vào LLM |
| Volume giao dịch | Market Data Feed | Must Have | |
| System prompt (cấu hình phân tích) | Bot Config (F2) | Must Have | Được định nghĩa ở F2 |
| Sentiment thị trường | News/Social Feed | Nice to Have | Phase sau |
| Dữ liệu macro (USD Index, lạm phát) | External API | Nice to Have | Phase sau |

---

### F3-02: Confidence Score

**Mô tả:** Điểm số phản ánh mức độ tin cậy của LLM về tín hiệu vừa tạo ra (output trực tiếp từ LLM trong structured response).

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-02.1 | Confidence score là số nguyên từ **0 đến 100** | Must Have |
| F3-02.2 | Hiển thị confidence kèm nhãn trực quan: Low (0–39), Medium (40–69), High (70–89), Very High (90–100) | Must Have |
| F3-02.3 | Signal có confidence < 40 phải được đánh dấu cảnh báo trực quan trên UI | Should Have |
| F3-02.4 | Bot có thể cấu hình ngưỡng confidence tối thiểu để thực thi lệnh (thuộc F2) | Must Have |
| F3-02.5 | Confidence score phải được lưu cùng signal vào database để phân tích lịch sử | Must Have |

**Mapping nhãn Confidence:**

```
0  – 39  : Low       (màu đỏ/cam)    → Cảnh báo, không khuyến khích hành động
40 – 69  : Medium    (màu vàng)      → Thận trọng
70 – 89  : High      (màu xanh lá)   → Tin cậy
90 – 100 : Very High (màu xanh đậm)  → Rất tin cậy
```

---

### F3-03: Insight / Reasoning (Giải Thích Tín Hiệu do LLM Tạo Ra)

**Mô tả:** Phần giải thích bằng ngôn ngữ tự nhiên **được LLM tự động sinh ra** (không phải template-based), lý do đưa ra tín hiệu đó, giúp user hiểu và kiểm chứng quyết định của bot.

> **Đã xác nhận (OQ-03):** Insight text được tạo ra bởi **LLM** — không phải template-based từ indicators. LLM sinh insight trong cùng API call với signal generation.

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-03.1 | Mỗi tín hiệu phải có **insight text** do LLM sinh ra, tóm tắt lý do đưa ra quyết định | Must Have |
| F3-03.2 | Insight phải liệt kê **ít nhất 2 yếu tố chính** ảnh hưởng đến tín hiệu | Must Have |
| F3-03.3 | Insight được viết bằng **tiếng Anh** (phiên bản đầu), tùy chọn tiếng Việt sau | Should Have |
| F3-03.4 | Độ dài insight: tối thiểu 50 từ, tối đa 300 từ | Should Have |
| F3-03.5 | Insight phải include các chỉ số kỹ thuật cụ thể với giá trị số thực | Must Have |
| F3-03.6 | UI phải có tùy chọn **"Xem thêm"** cho insight dài | Should Have |
| F3-03.7 | User có thể **copy insight** ra clipboard | Nice to Have |
| F3-03.8 | Insight text phải được sanitize (XSS prevention) trước khi lưu và hiển thị | Must Have |

**Ví dụ Insight do LLM sinh ra (BUY signal, XAU/USDT):**

```
Signal: BUY | Confidence: 82 (High) | Asset: XAU/USDT | Timeframe: 1H

Insight (LLM-generated):
"Gold (XAU/USDT) is showing strong bullish momentum on the 1H timeframe. 
Key factors analyzed:
1. RSI (14) = 58 — approaching overbought territory but still in bullish zone
2. MACD crossed above signal line 2 candles ago — positive momentum confirmed
3. Price broke above 20-period MA at $2,685.40 — confirmed upward trend
4. Volume spike +34% vs 24h average — buying pressure confirmed

Suggested entry zone: $2,683–$2,687
Risk: Watch for resistance at $2,695 (previous high)"
```

---

### F3-04: Signal Expiry Logic (Hết Hạn Tín Hiệu)

**Mô tả:** Tín hiệu có thời hạn hiệu lực. Sau khi hết hạn, tín hiệu không còn được coi là khuyến nghị hành động.

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-04.1 | Mỗi tín hiệu phải có `expires_at` timestamp được tính tự động | Must Have |
| F3-04.2 | Thời gian hết hạn mặc định theo timeframe (xem bảng dưới) | Must Have |
| F3-04.3 | Sau khi hết hạn, tín hiệu chuyển trạng thái `EXPIRED` — không thể thực thi | Must Have |
| F3-04.4 | UI phải hiển thị countdown đếm ngược đến thời điểm signal hết hạn | Should Have |
| F3-04.5 | Tín hiệu hết hạn vẫn được lưu trong lịch sử (không xóa) | Must Have |
| F3-04.6 | Khi tín hiệu mới được tạo cho cùng (bot × asset × timeframe), tín hiệu cũ tự động `SUPERSEDED` | Must Have |
| F3-04.7 | Bot không được phép thực thi lệnh dựa trên tín hiệu đã `EXPIRED` hoặc `SUPERSEDED` | Must Have |

**Thời Gian Hết Hạn Mặc Định:**

| Timeframe | Signal Expiry | Lý Do |
|---|---|---|
| 1 phút (1m) | 3 phút | Tín hiệu ngắn hạn, thay đổi nhanh |
| 5 phút (5m) | 15 phút | |
| 15 phút (15m) | 45 phút | |
| 1 giờ (1h) | 4 giờ | |
| 4 giờ (4h) | 16 giờ | |
| 1 ngày (1d) | 3 ngày | |

**Signal States:**

```
ACTIVE     → Tín hiệu đang có hiệu lực, có thể hành động
EXPIRED    → Đã quá thời gian hết hạn
SUPERSEDED → Đã có tín hiệu mới thay thế cho cùng (bot × asset × timeframe)
EXECUTED   → Bot đã thực thi lệnh dựa trên tín hiệu này
IGNORED    → User/Bot đã bỏ qua tín hiệu (manual override)
```

---

### F3-05: Lịch Sử Tín Hiệu (Signal History)

**Mô tả:** Người dùng có thể xem lại toàn bộ lịch sử tín hiệu đã được tạo, lọc và phân tích hiệu quả.

> **Đã xác nhận (OQ-02):** Retention là **90 ngày** (không phân biệt tier — giới hạn theo tier sẽ được xem xét trong FRS-BILL-01 nếu cần).

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-05.1 | Hệ thống lưu trữ lịch sử tín hiệu tối thiểu **90 ngày** | Must Have |
| F3-05.2 | User có thể xem danh sách tín hiệu với phân trang | Must Have |
| F3-05.3 | Mỗi dòng lịch sử hiển thị: thời gian, asset, timeframe, loại tín hiệu, confidence, trạng thái | Must Have |
| F3-05.4 | User có thể click vào tín hiệu để xem chi tiết insight | Must Have |
| F3-05.5 | Lịch sử lưu trữ theo user (chỉ xem signal của bot thuộc user đó) | Must Have |
| F3-05.6 | Hiển thị kết quả thực tế nếu signal đã được executed (lời/lỗ) | Should Have |

#### F3-05.1 — Bộ Lọc (Filters)

User có thể lọc lịch sử tín hiệu theo:

| Filter | Loại | Options | Ghi Chú |
|---|---|---|---|
| Bot | Dropdown multi-select | Danh sách bot của user | |
| Asset | Dropdown multi-select | Các USDT pairs hiện có (MVP: XAU/USDT) | Chỉ USDT pairs trong MVP |
| Timeframe | Checkbox | 1m, 5m, 15m, 1h, 4h, 1d | |
| Signal Type | Checkbox | BUY, SELL, HOLD | |
| Confidence | Range slider | 0–100 | |
| Trạng thái | Checkbox | ACTIVE, EXPIRED, EXECUTED, IGNORED | |
| Khoảng thời gian | Date range picker | From – To (tối đa 90 ngày) | |

#### F3-05.2 — Sắp Xếp (Sorting)

| Trường | Chiều Sắp Xếp |
|---|---|
| Thời gian tạo | DESC (mặc định), ASC |
| Confidence Score | DESC, ASC |
| Asset | A→Z, Z→A |

#### F3-05.3 — Export

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-05.3.1 | User có thể export lịch sử tín hiệu ra CSV | Should Have |
| F3-05.3.2 | Export CSV bao gồm: timestamp, bot_id, asset, timeframe, signal_type, confidence, status, insight (truncated 100 chars) | Should Have |

---

### F3-06: Notification Khi Có Tín Hiệu Mới

**Mô tả:** Hệ thống thông báo người dùng khi có tín hiệu mới đáng chú ý.

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-06.1 | Gửi **in-app notification** khi bot tạo tín hiệu BUY hoặc SELL với confidence ≥ ngưỡng đã cấu hình | Must Have |
| F3-06.2 | User có thể cấu hình ngưỡng confidence để nhận notification (default: 70) | Should Have |
| F3-06.3 | User có thể tắt notification cho từng bot riêng lẻ | Should Have |
| F3-06.4 | Gửi **push notification** (web/mobile) nếu user đã đăng ký | Should Have |
| F3-06.5 | Không gửi notification cho tín hiệu HOLD (để tránh spam) — trừ khi user chọn | Should Have |
| F3-06.6 | Notification phải include: loại signal, asset, confidence, thời gian tạo | Must Have |

---

### F3-07: Signal Dashboard

**Mô tả:** Giao diện tổng quan hiển thị tín hiệu hiện tại và gần nhất của tất cả bot.

> **Đã xác nhận (OQ-05):** Dashboard sử dụng **HTTP polling 30 giây** (không dùng WebSocket trong MVP để ưu tiên đưa sản phẩm ra sớm).

| ID | Yêu Cầu | Mức Độ |
|---|---|---|
| F3-07.1 | Dashboard hiển thị **tín hiệu ACTIVE mới nhất** của từng bot | Must Have |
| F3-07.2 | Mỗi card bot hiển thị: tên bot, asset, timeframe, signal type, confidence, thời gian còn hiệu lực | Must Have |
| F3-07.3 | Màu sắc trực quan: BUY = xanh lá, SELL = đỏ, HOLD = xám | Must Have |
| F3-07.4 | Dashboard **auto-refresh mỗi 30 giây** bằng HTTP polling | Must Have |
| F3-07.5 | User có thể click vào card để xem full insight | Must Have |
| F3-07.6 | Hiển thị countdown timer đến khi signal hết hạn | Should Have |
| F3-07.7 | Tổng hợp thống kê: X tín hiệu BUY, Y tín hiệu SELL, Z tín hiệu HOLD (hôm nay) | Should Have |

---

## 3. Non-Functional Requirements

### 3.1 Hiệu Năng

| NFR ID | Yêu Cầu | Ngưỡng |
|---|---|---|
| NFR-PERF-01 | Thời gian tạo signal (từ data update đến signal saved) | < 30 giây (p95) |
| NFR-PERF-02 | API lấy signal history (100 records) | < 500ms (p95) |
| NFR-PERF-03 | Dashboard load time (first paint) | < 2 giây |
| NFR-PERF-04 | Concurrent signal generation | ≥ 100 bots đồng thời |
| NFR-PERF-05 | LLM API call timeout | ≤ 20 giây (sau đó fallback HOLD) |

### 3.2 Độ Tin Cậy

| NFR ID | Yêu Cầu |
|---|---|
| NFR-REL-01 | Signal engine availability: ≥ 99.5% uptime |
| NFR-REL-02 | Không để bot thực thi lệnh trên tín hiệu expired (zero tolerance) |
| NFR-REL-03 | Khi LLM Engine không phản hồi trong 20s, tín hiệu fallback về HOLD — bot không tự ý giao dịch |

### 3.3 Bảo Mật

| NFR ID | Yêu Cầu |
|---|---|
| NFR-SEC-01 | User chỉ xem được signal của bot thuộc subscription của họ |
| NFR-SEC-02 | API signal history yêu cầu JWT authentication |
| NFR-SEC-03 | Insight text không chứa thông tin nhạy cảm về system prompt hoặc kiến trúc LLM nội bộ |
| NFR-SEC-04 | System prompt của LLM Signal Engine là thông tin nội bộ, không expose ra client |

### 3.4 Khả Năng Mở Rộng

| NFR ID | Yêu Cầu |
|---|---|
| NFR-SCALE-01 | Kiến trúc phải hỗ trợ scale lên ≥ 1,000 bots mà không cần redesign |
| NFR-SCALE-02 | Signal history hỗ trợ data retention 90 ngày; config có thể thay đổi sau |
| NFR-SCALE-03 | Thiết kế queue/worker để xử lý LLM calls song song cho nhiều bot |

---

## 4. API Specification (Sơ Bộ)

### 4.1 Endpoints

| Method | Endpoint | Mô Tả |
|---|---|---|
| `GET` | `/api/v1/signals` | Lấy danh sách signals (có filter, pagination) |
| `GET` | `/api/v1/signals/:signal_id` | Chi tiết 1 signal (bao gồm full insight) |
| `GET` | `/api/v1/signals/latest` | Signal ACTIVE mới nhất của từng bot (cho dashboard) |
| `GET` | `/api/v1/signals/history` | Lịch sử signals với date range filter |
| `GET` | `/api/v1/signals/export` | Export CSV (max 10,000 records) |
| `POST` | `/api/v1/signals/:signal_id/ignore` | User đánh dấu ignore signal |

### 4.2 Data Model

```json
Signal {
  "signal_id":         "uuid",
  "bot_id":            "uuid",
  "user_id":           "uuid",
  "asset":             "XAU/USDT",
  "timeframe":         "1h",
  "signal_type":       "BUY | SELL | HOLD",
  "confidence":        82,
  "confidence_label":  "High",
  "insight":           "Gold (XAU/USDT) is showing strong bullish momentum...",
  "indicators_used":   ["RSI", "MACD", "MA20", "Volume"],
  "llm_model":         "gpt-4o | gemini-pro | ...",
  "status":            "ACTIVE | EXPIRED | SUPERSEDED | EXECUTED | IGNORED",
  "created_at":        "2026-03-11T03:00:00Z",
  "expires_at":        "2026-03-11T07:00:00Z",
  "executed_at":       null,
  "superseded_by":     null
}
```

### 4.3 LLM Structured Output Format (Required)

LLM Signal Engine phải trả về JSON theo cấu trúc sau (không được phép trả về free text):

```json
{
  "signal_type":   "BUY",
  "confidence":    82,
  "insight":       "Gold (XAU/USDT) is showing strong bullish...",
  "indicators_used": ["RSI", "MACD", "MA20", "Volume"],
  "key_factors":   [
    {"factor": "RSI(14) = 58", "weight": "high"},
    {"factor": "MACD crossover confirmed", "weight": "high"}
  ]
}
```

### 4.4 Pagination Response Format

```json
{
  "data": [ ...signals ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 243,
    "total_pages": 13
  },
  "filters_applied": {
    "bot_id": ["uuid-1"],
    "timeframe": ["1h", "4h"],
    "confidence_min": 70
  }
}
```

---

## 5. User Flows

### 5.1 Flow 1 — Xem Signal Dashboard

```
[User vào Dashboard]
    ↓
Hệ thống load danh sách bot của user
    ↓
Với mỗi bot: lấy signal ACTIVE mới nhất (HTTP GET /api/v1/signals/latest)
    ↓
Hiển thị grid card: Signal type | Confidence | Countdown
    ↓
Auto-refresh mỗi 30 giây bằng HTTP polling
    ↓
User click vào card
    ↓
Modal/drawer hiển thị full insight (LLM-generated)
    ↓
User có thể: Xem chi tiết | Copy insight | Ignore signal
```

### 5.2 Flow 2 — Tín Hiệu Mới Được Tạo (LLM Engine)

```
[Market data update — USDT pair có data mới]
    ↓
Signal Engine chuẩn bị input: OHLCV + kỹ thuật + system prompt
    ↓
Gửi request đến LLM API → LLM trả về structured JSON
    ↓
Validate output (JSON schema check, confidence range 0-100)
    ↓
Lưu signal mới vào DB → signal cũ (cùng bot × asset × timeframe) → SUPERSEDED
    ↓
Gửi in-app notification (nếu BUY/SELL và confidence ≥ ngưỡng)
    ↓
Dashboard tự cập nhật khi polling interval tới (≤ 30 giây)
    ↓
Nếu bot có Auto-trade enabled → trigger F4 Trade Execution
```

### 5.3 Flow 3 — Xem Lịch Sử Tín Hiệu

```
[User vào Signal History]
    ↓
Mặc định: 20 signals gần nhất, tất cả bot, 7 ngày gần nhất
    ↓
User áp dụng filters (bot, asset USDT, timeframe, confidence, date range)
    ↓
Hệ thống trả về kết quả phân trang
    ↓
User click vào signal → xem insight chi tiết (LLM-generated)
    ↓
User có thể export CSV
```

### 5.4 Flow 4 — Signal Expiry

```
[expires_at đến]
    ↓
Scheduler job chạy mỗi phút → scan signals ACTIVE quá hạn
    ↓
Cập nhật status → EXPIRED
    ↓
Nếu bot đang chờ thực thi signal này → hủy lệnh pending
    ↓
UI countdown hết → hiển thị "Signal Expired" badge (cập nhật ở polling interval tiếp theo)
```

### 5.5 Flow 5 — LLM Timeout / Fallback

```
[Market data update]
    ↓
Gửi request đến LLM API
    ↓
[LLM không phản hồi trong 20 giây]
    ↓
Hệ thống tạo signal HOLD với confidence = 0, insight = "Signal engine unavailable"
    ↓
Ghi log lỗi → alert admin
    ↓
Bot không thực thi lệnh (HOLD = giữ nguyên)
```

---

## 6. Business Rules

| Rule ID | Mô Tả |
|---|---|
| BR-F3-01 | Một bot tại một thời điểm chỉ có tối đa 1 signal ACTIVE per (asset × timeframe) |
| BR-F3-02 | Signal với confidence < 30 tự động đặt là HOLD, không phụ thuộc LLM output |
| BR-F3-03 | Bot không được thực thi lệnh dựa trên signal EXPIRED hoặc SUPERSEDED (zero tolerance) |
| BR-F3-04 | **Free tier có thể xem signal** (không giới hạn trong MVP). Giới hạn theo tier (nếu có) sẽ được xác định trong FRS-BILL-01 |
| BR-F3-05 | Signal history chỉ trả về data của bot thuộc user đang đăng nhập |
| BR-F3-06 | Khi LLM Engine không khả dụng > 5 phút, hệ thống ghi log và cảnh báo admin |
| BR-F3-07 | Insight text phải được sanitize trước khi lưu (XSS prevention) |
| BR-F3-08 | Export CSV giới hạn tối đa 10,000 records / request |
| BR-F3-09 | MVP chỉ hỗ trợ USDT pairs. Việc mở rộng sang pairs khác là scope của Phase sau |
| BR-F3-10 | LLM system prompt là thông tin nội bộ — không expose nội dung prompt ra API response hoặc UI |

---

## 7. Acceptance Criteria

### AC-F3-01: Signal Generation (LLM)

**Given** bot đang hoạt động với data thị trường USDT pair đang được cập nhật  
**When** có dữ liệu OHLCV mới cho timeframe được cấu hình  
**Then:**
- [ ] LLM Signal Engine được gọi với đủ input (OHLCV + kỹ thuật + system prompt)
- [ ] Signal mới được tạo trong vòng 30 giây
- [ ] Signal có đủ: signal_type, confidence (0-100), insight (LLM-generated), expires_at
- [ ] Signal cũ cho cùng (bot × asset × timeframe) chuyển sang SUPERSEDED
- [ ] In-app notification được gửi nếu confidence ≥ ngưỡng và type ≠ HOLD
- [ ] Khi LLM timeout (> 20s) → fallback signal HOLD được tạo

---

### AC-F3-02: Signal Dashboard (HTTP Polling)

**Given** user đang xem Signal Dashboard  
**When** trang được load  
**Then:**
- [ ] Hiển thị signal ACTIVE mới nhất của tất cả bot thuộc user
- [ ] BUY = xanh lá, SELL = đỏ, HOLD = xám
- [ ] Có countdown timer đến expires_at
- [ ] Dashboard tự refresh trong ≤ 30 giây bằng HTTP polling

---

### AC-F3-03: Confidence Score & LLM Output Validation

**Given** LLM tạo ra một structured output  
**When** signal được lưu vào database  
**Then:**
- [ ] Confidence là số nguyên 0–100 (validate trước khi lưu)
- [ ] Hiển thị nhãn: Low / Medium / High / Very High
- [ ] Confidence < 40 hiển thị cảnh báo trực quan
- [ ] Confidence < 30 → signal_type bị override về HOLD
- [ ] Output không hợp lệ (ngoài schema) → fallback HOLD, ghi log lỗi

---

### AC-F3-04: Signal Expiry

**Given** một signal đang ở trạng thái ACTIVE  
**When** `expires_at` đã qua  
**Then:**
- [ ] Signal chuyển trạng thái → EXPIRED
- [ ] Bot không thể thực thi lệnh từ signal này
- [ ] UI hiển thị "Signal Expired"
- [ ] Signal vẫn tồn tại trong lịch sử (retention 90 ngày)

---

### AC-F3-05: Signal History & Filter

**Given** user vào trang Signal History  
**When** user áp dụng filter (bot, asset USDT, timeframe, date range)  
**Then:**
- [ ] Kết quả chỉ hiển thị signals khớp với filter
- [ ] Phân trang hoạt động đúng (20 records/page mặc định)
- [ ] User chỉ thấy signal của bot thuộc họ
- [ ] Export CSV hoạt động và download đúng format, tối đa 10,000 records

---

### AC-F3-06: Insight Text (LLM-Generated)

**Given** một BUY/SELL signal được tạo bởi LLM  
**When** user xem chi tiết signal  
**Then:**
- [ ] Insight text hiển thị đầy đủ (LLM-generated, không phải template)
- [ ] Liệt kê ít nhất 2 yếu tố kỹ thuật cụ thể với giá trị số thực
- [ ] Độ dài 50–300 từ
- [ ] Insight không chứa thông tin về system prompt hoặc kiến trúc nội bộ

---

### AC-F3-07: Free Tier Access

**Given** user đang ở tier Free  
**When** user vào Signal Dashboard hoặc Signal History  
**Then:**
- [ ] User có thể xem signal của tất cả bot của mình (không bị block)
- [ ] Không hiện thông báo "Upgrade to view signals"
- [ ] Signal history hiển thị bình thường (retention 90 ngày)

---

## 8. Phụ Thuộc & Tích Hợp

### 8.1 Dependencies — Upstream (F3 cần từ module khác)

| Module | Dữ Liệu Cần | Ghi Chú |
|---|---|---|
| F1 — Auth | user_id, subscription tier | Để phân quyền xem signal |
| F2 — Bot Management | bot_id, asset (USDT pair), timeframe, confidence threshold, system prompt config | Signal được tạo per bot config |
| Market Data Service | OHLCV data real-time — USDT pairs | Nguồn dữ liệu đầu vào cho LLM |
| LLM Engine (External API) | Signal output JSON (type, confidence, insight, key_factors) | Core computation — LLM Model |
| Technical Indicator Calculator | RSI, MACD, MA, BB values | Pre-computed, truyền vào LLM context |

### 8.2 Dependencies — Downstream (Module khác cần từ F3)

| Module | Cần Gì Từ F3 | Ghi Chú |
|---|---|---|
| F4 — Trade Execution | Signal ACTIVE + confidence ≥ ngưỡng | Trigger thực thi lệnh |
| Notification Service | Signal mới với type BUY/SELL | Push thông báo |
| F5 — Analytics/Reporting | Signal history data, accuracy metrics | Báo cáo hiệu suất |

---

## 9. Open Questions — Đã Giải Quyết ✅

> **Tất cả 6 Open Questions đã được Chị Hà (BA Lead) trả lời ngày 11/03/2026. Không còn OQ nào đang chờ.**

| # | Câu Hỏi | Quyết Định | Áp Dụng |
|---|---|---|---|
| OQ-01 ✅ | Thuật toán AI nào để tạo signal? | **LLM Model** với system prompt + structured output | F3-01.1, F3-03, 1.4, 8.1 |
| OQ-02 ✅ | Retention signal history bao lâu? | **90 ngày** (không phân biệt tier trong MVP) | F3-05.1, BR-F3-04 |
| OQ-03 ✅ | Insight do LLM hay template-based? | **LLM-generated** (không phải template) | F3-03 |
| OQ-04 ✅ | Support multiple assets? | **Chỉ USDT pairs trong MVP** (XAG, BTC, etc. là Phase sau) | 1.2, 1.4, F3-01.2, BR-F3-09 |
| OQ-05 ✅ | WebSocket hay polling cho dashboard? | **HTTP Polling 30 giây** (MVP — đơn giản để ra sớm) | F3-07.4, Flow 2 |
| OQ-06 ✅ | Free tier có xem signal không? | **Free tier có thể xem** (không giới hạn trong MVP) | BR-F3-04, AC-F3-07 |

---

## 10. Rủi Ro

| Risk ID | Mô Tả | Khả Năng | Tác Động | Giảm Thiểu |
|---|---|---|---|---|
| R-01 | LLM API chậm / timeout → tín hiệu stale → bot giao dịch sai | Trung bình | Cao | SLA < 20s timeout, fallback HOLD, monitoring |
| R-02 | Bot thực thi lệnh trên signal đã EXPIRED | Thấp | Rất cao | Hard validation trước mọi lệnh (BR-F3-03, zero tolerance) |
| R-03 | LLM tạo insight không chính xác hoặc hallucination | Trung bình | Cao | Output validation; user disclaimer; log & review |
| R-04 | Quá nhiều notification gây user fatigue → tắt notif | Cao | Trung bình | Smart filtering; user-configurable threshold |
| R-05 | Scale vượt 100 bot đồng thời → LLM API rate limit / queue tắc | Trung bình | Cao | Queue/worker architecture; LLM API rate limit management |
| R-06 | HTTP polling 30s gây độ trễ hiển thị signal mới | Trung bình | Thấp | Chấp nhận cho MVP; upgrade sang WebSocket ở Phase sau nếu cần |

---

*Phiên bản 1.1 — Revised — Đã tích hợp toàn bộ feedback từ Nguyễn Thị Việt Hà (BA Lead) ngày 11/03/2026.*  
*Tất cả Open Questions đã được đóng. Tài liệu sẵn sàng cho Technical Design Review.*
