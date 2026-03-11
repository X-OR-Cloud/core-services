# FRS-02: Functional Requirements Specification
## Module: Trade Execution (Manual Trading từ AI Signal)

| Trường | Nội dung |
|---|---|
| **Document ID** | FRS-02 |
| **Version** | 1.1 |
| **Ngày tạo** | 2026-03-07 |
| **Cập nhật** | 2026-03-11 |
| **Tác giả** | Business Analyst Agent |
| **Liên quan** | BRD-01 → REQ-F03, REQ-F04 |
| **Trạng thái** | 🟢 Updated — BA Hà sign-off C4–C7 (11/03/2026) |

---

## 1. Mục Tiêu Tài Liệu

Tài liệu này mô tả chi tiết yêu cầu nghiệp vụ cho luồng **thực thi lệnh giao dịch thủ công** từ tín hiệu AI (AI Signal → Trade Confirmation → Order Execution), bao gồm:
- Luồng xác nhận lệnh end-to-end
- Business rules và risk checks trước khi thực thi
- Các trạng thái lệnh (Order lifecycle)
- Xử lý lỗi và rollback
- Acceptance criteria

---

## 2. Tổng Quan Luồng Thực Thi Lệnh

### 2.1 Luồng Happy Path

```
[Insight Page]
     │
     │ Trader click "Trade" trên Signal Card (BUY/SELL)
     ▼
[Trade Modal — Review]
     │ Hiển thị: Direction, Entry, SL, TP, AI Confidence
     │ Trader đọc warning banner
     │ Trader click "Confirm BUY/SELL"
     ▼
[Pre-Trade Risk Check]
     │ Kiểm tra: Cash balance đủ không?
     │ Kiểm tra: Vượt max exposure không?
     │ Kiểm tra: Exchange API connected không?
     │ Kiểm tra: Market giờ giao dịch không?
     ▼ (Pass)
[Submit Order → Exchange]
     │ Gửi lệnh lên Exchange (Binance)
     │ Nhận Order ID
     ▼
[Order Confirmation]
     │ Hiển thị: Success toast + Order ID
     │ Cập nhật Analytics > Open Positions
     │ Ghi Trade Log
     ▼
[Position Management]
     │ Vị thế xuất hiện trong Analytics
     │ SL/TP được đặt tự động nếu cài đặt
     │ Khi SL/TP hit hoặc Manual Close → Closed Trade
     ▼
[Trade History]
     Lệnh đóng xuất hiện trong Trade History
```

### 2.2 Luồng Khi Risk Check Fail

```
[Pre-Trade Risk Check] → FAIL
     │
     ▼
[Block Trade Modal]
     Hiển thị lý do từ chối rõ ràng:
     - "Insufficient balance: cần $X, có $Y"
     - "Exchange API disconnected. Go to Settings."
     - "Max daily exposure reached."
     │
     Trader có thể: Cancel hoặc Fix issue → Retry
```

---

## 3. Signal Card — Điều Kiện Hiển Thị Nút Trade

| Loại Signal | Nút Trade | Lý do |
|---|---|---|
| **BUY** | ✅ Enabled — "Confirm BUY" (màu xanh) | Tín hiệu hành động |
| **SELL** | ✅ Enabled — "Confirm SELL" (màu đỏ) | Tín hiệu hành động |
| **HOLD** | ❌ Disabled (greyed out) | Không có lệnh để thực hiện |
| **NO TRADE** | ❌ Disabled (greyed out) | AI khuyến nghị không giao dịch |

---

## 4. Trade Modal — Yêu Cầu Hiển Thị

### 4.1 Order Summary (bắt buộc hiển thị đầy đủ)

| Field | Nguồn dữ liệu | Ví dụ |
|---|---|---|
| **Symbol** | Từ Signal | PAXG/USDT |
| **Direction** | Từ Signal action | BUY / SELL |
| **Entry Price** | Từ Signal entry | $2,042.50 |
| **Stop Loss** | Từ Signal stopLoss | $2,020.00 |
| **Take Profit** | Từ Signal takeProfit | $2,085.00 |
| **AI Confidence** | Từ Signal confidence | 87% |
| **Quantity** | User tự nhập (số lượng token muốn mua/bán) *(C4 — BA Hà, 11/03/2026)* | 0.5 PAXG |
| **Estimated Value** | Entry price × Quantity | $1,021.25 |

### 4.2 Warning Banner (bắt buộc)

> *"By confirming, you authorize this trade to be executed via your connected exchange. This action cannot be undone once submitted."*

### 4.3 Action Buttons

| Button | Hành động |
|---|---|
| **Cancel** | Đóng modal, không làm gì |
| **Confirm BUY / Confirm SELL** | Trigger pre-trade risk check → submit order |

---

## 5. Business Rules

### 5.1 Pre-Trade Risk Checks

| ID | Rule | Lỗi nếu fail |
|---|---|---|
| BR-TRADE-01 | `cashBalanceUsd` phải ≥ giá trị lệnh | "Insufficient balance" |
| BR-TRADE-02 | Exchange API Key phải connected và không expired | "Exchange API disconnected" |
| BR-TRADE-03 | Signal phải còn hợp lệ (không quá **30 phút** tuổi) *(C7 — BA Hà, 11/03/2026)* | "Signal expired. Refresh signals." |
| BR-TRADE-04 | Không vượt quá `maxDailyExposure` (nếu được cài) | "Daily exposure limit reached" |
| BR-TRADE-05 | Không có vị thế ngược chiều đang mở cùng symbol (nếu không hỗ trợ hedge) | "Conflicting position exists" |

> **Phạm vi version này:** Chỉ hỗ trợ **LONG (spot)**. SHORT selling **ngoài scope** — sẽ phát triển ở phiên bản tiếp theo *(C6 — BA Hà, 11/03/2026)*.

### 5.2 Order Execution Rules

| ID | Rule |
|---|---|
| BR-TRADE-06 | Loại lệnh mặc định là **Market Order** (thực thi ngay theo giá thị trường). Limit Order sẽ phát triển ở phiên bản tiếp theo *(C5 — BA Hà, 11/03/2026)* |
| BR-TRADE-07 | Entry Price trong Signal chỉ là **tham khảo** — lệnh thực tế theo giá market tại thời điểm submit |
| BR-TRADE-08 | Stop Loss và Take Profit được quản lý bằng **Server-side Monitoring** — hệ thống tự canh giá liên tục và gửi lệnh đóng khi chạm SL/TP *(tonyh0129 — 11/03/2026)* |
| BR-TRADE-09 | Nếu exchange reject lệnh: hiển thị lỗi rõ ràng, **không trừ balance** |
| BR-TRADE-10 | Mỗi lệnh được gán **Order ID** duy nhất từ exchange để tracking |

### 5.3 Post-Trade Rules

| ID | Rule |
|---|---|
| BR-TRADE-11 | Sau khi lệnh filled: cập nhật `cashBalanceUsd` và `positionsValueUsd` ngay lập tức |
| BR-TRADE-12 | Lệnh xuất hiện trong **Analytics > Open Positions** trong ≤ 5 giây |
| BR-TRADE-13 | Ghi Trade Log với đầy đủ: symbol, direction, entry, quantity, order ID, timestamp, signal ID |
| BR-TRADE-14 | Khi SL/TP được kích hoạt: lệnh tự động đóng và chuyển sang **Trade History** |
| BR-TRADE-15 | `closeReason` phải ghi nhận: `take_profit` / `stop_loss` / `manual` |

---

## 6. Order Lifecycle

### 6.1 Các Trạng Thái Lệnh

```
PENDING_SUBMIT → SUBMITTED → FILLED → (đang mở) → CLOSED
                     │
                     └── REJECTED (exchange từ chối)
                     └── CANCELLED (user hủy trước khi filled)
                     └── PARTIAL_FILLED (filled một phần)
```

### 6.2 Mô Tả Trạng Thái

| Status | Mô tả | Hiển thị UI |
|---|---|---|
| `PENDING_SUBMIT` | Đang gửi lên exchange | Loading spinner |
| `SUBMITTED` | Exchange nhận lệnh, chờ filled | "Order submitted" |
| `FILLED` | Lệnh được khớp đầy đủ | Xuất hiện trong Open Positions |
| `PARTIAL_FILLED` | Khớp một phần (chỉ với Limit Order) | Hiển thị qty filled/total |
| `REJECTED` | Exchange từ chối | Error toast + lý do |
| `CANCELLED` | Đã hủy trước khi filled | Không xuất hiện trong lịch sử giao dịch |
| `CLOSED` | Vị thế đã đóng (SL/TP/Manual) | Xuất hiện trong Trade History |

---

## 7. Yêu Cầu Chức Năng Chi Tiết

### 7.1 FR-TRADE-01: Mở Trade Modal từ Signal

**Acceptance Criteria:**
- [ ] "Trade" button chỉ active với BUY và SELL signals
- [ ] Modal mở trong ≤ 500ms sau khi click
- [ ] Tất cả thông tin order summary hiển thị đầy đủ và chính xác từ signal
- [ ] Warning banner hiển thị rõ ràng trước các action buttons
- [ ] Click bên ngoài modal hoặc nút Cancel → đóng modal, không thực hiện gì

---

### 7.2 FR-TRADE-02: Pre-Trade Risk Check

**Acceptance Criteria:**
- [ ] Risk check thực hiện sau khi Trader click Confirm, trước khi gửi lên exchange
- [ ] Nếu risk check pass: tiến hành submit order (không hỏi thêm)
- [ ] Nếu risk check fail: hiển thị lý do cụ thể trong modal (không đóng modal)
- [ ] User có thể sửa issue và retry mà không cần đóng/mở lại modal
- [ ] Thời gian risk check ≤ 1 giây

---

### 7.3 FR-TRADE-03: Submit Order

**Acceptance Criteria:**
- [ ] Loading state hiển thị trong lúc gửi lệnh (spinner hoặc progress bar)
- [ ] Confirm button disabled trong lúc đang submit (tránh duplicate click)
- [ ] Khi thành công: hiển thị success toast kèm Order ID
- [ ] Khi thất bại (exchange error): hiển thị error message từ exchange, user có thể retry
- [ ] Timeout sau 10 giây nếu không nhận phản hồi từ exchange

---

### 7.4 FR-TRADE-04: Cập Nhật Analytics Sau Khi Lệnh Filled

**Acceptance Criteria:**
- [ ] Open Position xuất hiện trong Analytics ≤ 5 giây sau khi filled
- [ ] Balance (cashBalanceUsd) cập nhật đúng ngay sau khi filled
- [ ] Unrealized PnL được tính và cập nhật realtime
- [ ] Trade log ghi đủ: signal_id, order_id, symbol, side, entry, quantity, timestamp
- [ ] Dashboard portfolio value cập nhật tương ứng

---

### 7.5 FR-TRADE-05: Đóng Vị Thế

**Điều kiện đóng vị thế:**

| Cách đóng | Mô tả | closeReason |
|---|---|---|
| **Take Profit hit** | Giá chạm mức TP đã cài | `take_profit` |
| **Stop Loss hit** | Giá chạm mức SL đã cài | `stop_loss` |
| **Manual Close** | Trader chủ động đóng từ Analytics | `manual` |
| **Liquidation** | Margin call (nếu có leverage) | `liquidation` |

**Acceptance Criteria:**
- [ ] Khi SL/TP hit: vị thế tự động đóng và chuyển sang Trade History ≤ 5 giây
- [ ] Trade History hiển thị: entry, exit, PnL, duration, closeReason
- [ ] Realized PnL cập nhật ngay vào Analytics Summary
- [ ] Balance cập nhật sau khi đóng vị thế

---

## 8. Xử Lý Lỗi (Error Handling)

| Tình huống | Xử lý |
|---|---|
| Exchange API timeout | Retry tối đa 3 lần, mỗi lần cách 2 giây. Nếu vẫn fail → hiển thị "Exchange timeout. Please try again." |
| Insufficient balance | Block submit. Hiển thị: "Insufficient balance. Available: $X" |
| Signal đã hết hạn | Block submit. Hiển thị: "This signal has expired. Please check for new signals." |
| Exchange API key expired | Block submit. Hiển thị: "Exchange API key expired. Go to Settings to update." |
| Order partially filled | Coi như filled toàn phần cho UX đơn giản (log số lượng thực tế) |
| Duplicate order (user click 2 lần) | Idempotency check — chỉ submit 1 lần |

---

## 9. Acceptance Criteria Tổng Hợp (Module Level)

- [ ] **REQ-F04-AC-01**: Trade button chỉ active với BUY/SELL signals, HOLD/NO TRADE bị disabled
- [ ] **REQ-F04-AC-02**: Order summary trong modal hiển thị đầy đủ và chính xác
- [ ] **REQ-F04-AC-03**: Risk check chạy trước khi submit, block rõ ràng nếu fail
- [ ] **REQ-F04-AC-04**: Lệnh filled xuất hiện trong Open Positions ≤ 5 giây
- [ ] **REQ-F04-AC-05**: Trade History cập nhật sau khi đóng vị thế với đầy đủ thông tin
- [ ] **REQ-F04-AC-06**: Không thực hiện duplicate order dù user click nhiều lần
- [ ] **REQ-F04-AC-07**: Mọi lỗi exchange hiển thị thông báo rõ ràng, không crash UI

---

## 10. Open Questions

| ID | Vấn đề | Kết quả |
|---|---|---|
| OQ-01 | Quantity (số lượng mua) được tính như thế nào? User tự nhập hay hệ thống tự tính? | ✅ **User tự nhập** *(BA Hà — 11/03/2026)* |
| OQ-02 | Có hỗ trợ Limit Order không, hay chỉ Market Order? | ✅ **Market Order only** — Limit Order → phiên bản tiếp theo *(BA Hà — 11/03/2026)* |
| OQ-03 | SL/TP đặt qua OCO hay server-side monitoring? | ✅ **Server-side Monitoring** — hệ thống tự canh và gửi lệnh *(tonyh0129 — 11/03/2026)* |
| OQ-04 | Có hỗ trợ SHORT selling không hay chỉ LONG (spot)? | ✅ **Ngoài scope** phiên bản này — phiên bản tiếp theo *(BA Hà — 11/03/2026)* |
| OQ-05 | Signal "expiry" là bao lâu? (em tạm dùng 1 giờ) | ✅ **30 phút** *(BA Hà — 11/03/2026)* |
| OQ-06 | Tích hợp exchange nào ngoài Binance trong phạm vi hiện tại? | ✅ **Chỉ Binance** — confirmed BRD-01 |

---

## 11. Lịch Sử Thay Đổi

| Version | Ngày | Tác giả | Thay đổi |
|---|---|---|---|
| 1.0 DRAFT | 2026-03-07 | BA Agent | Tạo mới |
| 1.1 | 2026-03-11 | BA Agent / XORA | C4: Thêm Quantity field (user tự nhập); C5: BR-TRADE-06 Market Order only, Limit Order → v2; C6: SHORT selling ngoài scope v1; C7: BR-TRADE-03 signal expiry 30 phút; OQ-01,02,04,05,06 resolved; OQ-03 resolved: Server-side Monitoring (tonyh0129) |
