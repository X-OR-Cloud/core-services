# FRS-01: Functional Requirements Specification
## Module: AI Bot Management

| Trường | Nội dung |
|---|---|
| **Document ID** | FRS-01 |
| **Version** | 1.1 |
| **Ngày tạo** | 2026-03-07 |
| **Cập nhật** | 2026-03-11 |
| **Tác giả** | Business Analyst Agent |
| **Liên quan** | BRD-01 → REQ-F05, REQ-F06 |
| **Trạng thái** | 🟢 Updated — BA Hà sign-off C1–C3 (11/03/2026) |

---

## 1. Mục Tiêu Tài Liệu

Tài liệu này mô tả chi tiết các **yêu cầu chức năng nghiệp vụ** cho module **AI Bot Management**, bao gồm:
- Vòng đời (lifecycle) của một AI Bot
- Business rules cho từng hành động
- State machine của bot
- Acceptance criteria để Dev/QA implement và test

---

## 2. Tổng Quan Module

### 2.1 Mục Đích

Module AI Bot Management cho phép Institutional Trader:
- **Tạo mới** AI Bot với chiến lược và cấu hình rủi ro tùy chỉnh
- **Giám sát** hiệu suất bot realtime (PnL, Win Rate, Drawdown)
- **Kiểm soát** trạng thái bot (Start/Pause/Resume/Stop)
- **Điều chỉnh** cấu hình bot đang chạy khi cần
- **Xóa** bot không còn cần thiết

### 2.2 Các Thành Phần Chính

| Thành phần | Mô tả |
|---|---|
| **Bot List** | Danh sách tất cả bots của user với status và KPIs |
| **Bot Detail Card** | Thông tin chi tiết từng bot: PnL, Win Rate, Drawdown, Active Position |
| **Activity Log** | Lịch sử hành động của tất cả bots theo thời gian |
| **System KPI Bar** | Tổng hợp: Active Bots, Total PnL (24H), Active Volume, System Status |
| **Create Bot Wizard** | Form 2 bước để cấu hình và deploy bot mới |

---

## 3. Bot State Machine

### 3.1 Sơ Đồ Trạng Thái

```
                    ┌─────────────┐
                    │   CREATED   │ ← Mới tạo xong
                    └──────┬──────┘
                           │ Auto-start hoặc User start
                           ▼
              ┌────────────────────────┐
         ┌───►│       RUNNING          │◄──┐
         │    └──┬─────────┬───────────┘   │
         │       │ Pause   │ Stop/Error    │ Resume
         │       ▼         ▼               │
         │  ┌────────┐  ┌────────┐    ┌────────┐
         │  │ PAUSED │  │STOPPED │    │ PAUSED │
         │  └────┬───┘  └───┬────┘    └───┬────┘
         └───────┘          │             │
          Resume            │ Delete      │
                            ▼             │
                       ┌─────────┐        │
                       │ DELETED │        │
                       └─────────┘        │
                                          │
              ┌───────────────────────────┘
              │
         ┌────▼───┐
         │ ERROR  │ ← API lỗi, mất kết nối, vượt drawdown
         └────┬───┘
              │ User acknowledges + fix
              ▼
           STOPPED
```

### 3.2 Bảng Chuyển Trạng Thái

| Trạng thái hiện tại | Hành động | Trạng thái mới | Điều kiện |
|---|---|---|---|
| `CREATED` | Auto deploy | `RUNNING` | Bot config hợp lệ, Exchange API connected |
| `RUNNING` | Pause | `PAUSED` | User click Pause |
| `RUNNING` | Stop | `STOPPED` | User click Stop |
| `RUNNING` | API Error / Drawdown vượt ngưỡng | `ERROR` | System tự động |
| `PAUSED` | Resume | `RUNNING` | User click Resume |
| `PAUSED` | Stop | `STOPPED` | User click Stop |
| `STOPPED` | Delete | `DELETED` | User click Delete, confirm dialog |
| `ERROR` | Stop (acknowledge) | `STOPPED` | User xử lý lỗi |
| `PAUSED` | Delete | `DELETED` | User click Delete, confirm dialog |

### 3.3 Trạng Thái Không Hợp Lệ (Invalid Transitions)

| Hành động | Trạng thái không được phép | Thông báo lỗi |
|---|---|---|
| Resume | `STOPPED`, `ERROR` | "Cannot resume a stopped bot. Please restart instead." |
| Delete | `RUNNING` | "Cannot delete a running bot. Stop the bot before deleting." |
| Pause | `STOPPED`, `ERROR`, `PAUSED` | "Bot is not in a pausable state." |

---

## 4. Business Rules

### 4.1 Tạo Bot (Create Bot)

| ID | Rule |
|---|---|
| BR-BOT-01 | Giới hạn số bots đồng thời **theo plan** của tài khoản; mặc định **5 bots** (bao gồm cả PAUSED, STOPPED) *(C2 — BA Hà, 11/03/2026)* |
| BR-BOT-02 | Bot name phải unique trong tài khoản (không trùng tên) |
| BR-BOT-03 | `totalCapital` phải ≤ `cashBalanceUsd` của tài khoản tại thời điểm tạo |
| BR-BOT-04 | `maxEntrySize` phải ≤ `totalCapital` |
| BR-BOT-05 | `stopLoss` và `takeProfit` phải được cài đặt (bắt buộc) |
| BR-BOT-06 | `maxDrawdownLimit` phải nằm trong khoảng 1% – 15% |
| BR-BOT-07 | `dailyStopLossUSD` phải > 0 và < `totalCapital` |
| BR-BOT-08 | Trading Mode **Live** yêu cầu Exchange API Key đã được kết nối và verified |
| BR-BOT-09 | Trading Mode **Sandbox** không yêu cầu Exchange API Key, không thực thi lệnh thật |

### 4.2 Dừng Bot (Stop/Pause)

| ID | Rule |
|---|---|
| BR-BOT-10 | Khi bot bị **STOP**: Tất cả lệnh pending phải bị hủy ngay lập tức |
| BR-BOT-11 | Khi bot bị **STOP**: Các vị thế đang mở **tự động đóng** theo Market Order ngay lập tức *(C1 — BA Hà, 11/03/2026)* |
| BR-BOT-12 | Khi bot bị **PAUSE**: Bot ngừng mở lệnh mới nhưng **vẫn quản lý** vị thế hiện tại (SL/TP vẫn active) |
| BR-BOT-13 | **STOP ALL BOTS** áp dụng rule BR-BOT-10 và BR-BOT-12 cho tất cả bots cùng lúc |
| BR-BOT-14 | Khi `maxDrawdownLimit` bị vượt: Bot **tự động STOP** và ghi log lý do |
| BR-BOT-15 | Khi `dailyStopLossUSD` bị vượt: Bot **tự động STOP** trong ngày, reset lúc 00:00 UTC |

### 4.3 Cập Nhật Cấu Hình (Update Config)

| ID | Rule |
|---|---|
| BR-BOT-16 | Có thể update config khi bot đang **RUNNING hoặc PAUSED** |
| BR-BOT-17 | Thay đổi `totalCapital` chỉ có hiệu lực từ **lệnh tiếp theo** (không ảnh hưởng vị thế đang mở) |
| BR-BOT-18 | Thay đổi `stopLoss` / `takeProfit` **áp dụng ngay** cho cả vị thế đang mở |
| BR-BOT-19 | Thay đổi `tradingMode` từ Sandbox → Live **yêu cầu bot phải STOPPED trước** |
| BR-BOT-20 | Mọi thay đổi config phải được **ghi vào Activity Log** |

### 4.4 Xóa Bot (Delete Bot)

| ID | Rule |
|---|---|
| BR-BOT-21 | Chỉ được xóa bot khi status là `STOPPED` hoặc `PAUSED` |
| BR-BOT-22 | Xóa bot **không xóa** lịch sử giao dịch và Activity Log |
| BR-BOT-23 | Xóa bot **không đóng** các vị thế đang mở (nếu có từ lúc paused) |
| BR-BOT-24 | Yêu cầu **confirm dialog** trước khi thực hiện xóa |

---

## 5. Yêu Cầu Chức Năng Chi Tiết

### 5.1 FR-BOT-01: Xem Danh Sách Bot

**Mô tả:** Trader xem tất cả bots với trạng thái và metrics tóm tắt.

**Dữ liệu hiển thị mỗi bot:**

| Field | Mô tả | Hiển thị khi |
|---|---|---|
| Bot Name | Tên bot | Luôn |
| Badge (Strategy) | AI STRATEGY / LEGACY / CUSTOM | Luôn |
| Status Indicator | RUNNING 🟢 / PAUSED 🟡 / STOPPED ⚪ / ERROR 🔴 | Luôn |
| Exchange | Binance, ... | Luôn |
| Uptime | Thời gian bot đang chạy, e.g. "4d 12h" | Khi RUNNING/PAUSED |
| Total PnL (USD + %) | Tổng lãi/lỗ từ khi tạo bot | Luôn |
| Today PnL | PnL trong ngày hôm nay | Luôn |
| Win Rate | Tỷ lệ lệnh thắng (%) và record (wins/total) | Luôn |
| Drawdown hiện tại / Max | Drawdown % so với max allowed | Khi RUNNING/PAUSED |
| Active Position | Side, Symbol, Entry, Unrealized PnL | Khi có vị thế mở |
| Error Message | Mô tả lỗi chi tiết | Khi status = ERROR |
| Action Buttons | Pause/Resume/Stop/Delete/Edit | Theo trạng thái |

**Acceptance Criteria:**
- [ ] Danh sách load trong ≤ 2 giây
- [ ] Status icon đổi màu đúng theo trạng thái
- [ ] Action buttons chỉ hiển thị các hành động hợp lệ theo state machine
- [ ] PnL dương hiển thị màu xanh, âm hiển thị màu đỏ
- [ ] Khi không có bot nào: hiển thị empty state với nút "Create New Bot"

---

### 5.2 FR-BOT-02: Tạo Bot Mới (2-Step Wizard)

**Step 1 — Risk Configuration:**

| Field | Loại | Bắt buộc | Validation |
|---|---|---|---|
| Risk Profile | Radio: Conservative / Balanced / Aggressive | ✅ | Phải chọn 1 |
| Max Drawdown Limit | Slider: 1% – 15% | ✅ | Mặc định theo Risk Profile |
| Daily Stop Loss (USD) | Number input | ✅ | > 0, < totalCapital |

**Risk Profile Defaults:**

| Profile | Max Drawdown | Daily Stop Loss (gợi ý) |
|---|---|---|
| Conservative | 5% | $200 |
| Balanced | 10% | $500 |
| Aggressive | 15% | $1,000 |

**Step 2 — AI Configuration:**

| Field | Loại | Bắt buộc | Validation |
|---|---|---|---|
| Asset Pair | Dropdown: PAXG/USDT, XAUT/USDT | ✅ | Phải chọn 1 |
| Trading Mode | Toggle: Sandbox / Live | ✅ | Live yêu cầu API Key |
| Exchange API Account | Dropdown (từ danh sách API đã kết nối) | ✅ khi Live | Phải verified |
| Total Capital (USD) | Number input | ✅ | ≤ cashBalance, > 0 |
| Max Entry Size (USD) | Number input | ✅ | ≤ totalCapital |
| Take Profit (%) | Number input | ✅ | > 0, < 100 |
| Stop Loss (%) | Number input | ✅ | > 0, < 100 |

**Acceptance Criteria:**
- [ ] Không cho submit Step 1 khi validation fail, hiển thị lỗi inline
- [ ] Nút "Next" Step 1 chỉ active khi tất cả fields hợp lệ
- [ ] Khi chọn Live mode mà chưa có API Key: hiển thị warning + link đến Settings
- [ ] Total Capital hiển thị available balance để user tham khảo
- [ ] Confirm screen tóm tắt toàn bộ config trước khi Deploy
- [ ] Sau Deploy thành công: redirect về Bot List, bot mới ở đầu danh sách

---

### 5.3 FR-BOT-03: Stop / Pause / Resume Bot

**Acceptance Criteria chung:**
- [ ] Hiển thị **confirm dialog** trước khi Stop hoặc Stop All (không cần confirm cho Pause/Resume)
- [ ] Action phải hoàn thành trong ≤ 3 giây
- [ ] Status icon cập nhật ngay sau khi action thành công
- [ ] Activity Log ghi nhận: thời gian, tên bot, hành động, người thực hiện (user/system)
- [ ] Nếu action thất bại: hiển thị error toast, trạng thái bot **không thay đổi**
- [ ] **Stop All Bots**: confirm dialog rõ ràng số lượng bots sẽ bị dừng

---

### 5.4 FR-BOT-04: Cập Nhật Cấu Hình Bot

**Acceptance Criteria:**
- [ ] Form edit hiển thị giá trị hiện tại của bot
- [ ] Chỉ cho phép sửa các fields hợp lệ (không cho sửa `tradingMode` khi bot đang RUNNING)
- [ ] Preview thay đổi trước khi lưu
- [ ] Sau khi lưu: Activity Log ghi nhận field nào thay đổi, giá trị cũ → mới
- [ ] Thay đổi `stopLoss`/`takeProfit` áp dụng ngay, hiển thị confirmation

---

### 5.5 FR-BOT-05: Activity Log

**Dữ liệu mỗi log entry:**

| Field | Mô tả |
|---|---|
| Time | Timestamp chính xác đến giây |
| Bot Name | Tên bot thực hiện hành động |
| Action | Tên hành động (Buy Order Filled, Stop Loss Triggered, API Error, ...) |
| Action Type | `buy` / `sell` / `warning` / `info` / `error` |
| Details | Mô tả chi tiết (số lượng, giá, lý do) |
| Status | `SUCCESS` / `WARNING` / `ERROR` / `INFO` |

**Acceptance Criteria:**
- [ ] Log hiển thị theo thứ tự mới nhất trước
- [ ] Color-coded theo Action Type (xanh buy, đỏ sell/error, vàng warning)
- [ ] Filter được theo bot name và action type
- [ ] Hiển thị ít nhất 100 entries gần nhất
- [ ] Timestamp đồng bộ theo UTC, hiển thị theo local time của user

---

### 5.6 FR-BOT-06: System Status & Alerts

**System Status Indicator (KPI Bar):**

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| `OPTIMAL` 🟢 | Tất cả services hoạt động bình thường | "System Optimal" |
| `DEGRADED` 🟡 | Một hoặc nhiều services có vấn đề | "Degraded — Check logs" |
| `OFFLINE` 🔴 | Mất kết nối với backend hoàn toàn | "System Offline" |

**Alert Triggers (cần implement):**

| Trigger | Hành động |
|---|---|
| Bot chuyển sang ERROR | Toast notification *(email alert: phiên bản sau — C3, BA Hà 11/03/2026)* |
| Drawdown vượt 80% ngưỡng | Warning toast (early warning) |
| Drawdown vượt 100% ngưỡng | Bot auto-stop + critical alert |
| Daily Stop Loss vượt 80% | Warning toast |
| Daily Stop Loss vượt 100% | Bot auto-stop ngày đó |
| Mất kết nối Exchange API | Bot auto-stop + error alert |

---

## 6. Acceptance Criteria Tổng Hợp (Module Level)

- [ ] **REQ-F05-AC-01**: Tất cả trạng thái bot (running/paused/stopped/error) hiển thị đúng và real-time
- [ ] **REQ-F05-AC-02**: State machine tuân thủ đúng — không cho phép invalid transitions
- [ ] **REQ-F05-AC-03**: Bot auto-stop khi vượt max drawdown, ghi log lý do rõ ràng
- [ ] **REQ-F05-AC-04**: STOP ALL BOTS dừng tất cả bots trong ≤ 5 giây
- [ ] **REQ-F05-AC-05**: Activity Log ghi đầy đủ mọi hành động, không bỏ sót
- [ ] **REQ-F06-AC-01**: Bot mới tạo xuất hiện trong danh sách sau ≤ 3 giây
- [ ] **REQ-F06-AC-02**: Sandbox bot không được gửi lệnh thật lên exchange
- [ ] **REQ-F06-AC-03**: Live bot không thể tạo nếu thiếu valid API Key

---

## 7. Dependencies & Open Questions

| ID | Vấn đề | Kết quả |
|---|---|---|
| OQ-01 | Khi Stop bot, vị thế đang mở có tự đóng không hay để user tự xử lý? | ✅ **Tự động đóng** theo Market Order *(BA Hà — 11/03/2026)* |
| OQ-02 | Giới hạn 5 bots/account có phải là cứng hay configurable theo plan? | ✅ **Theo plan**, mặc định 5 *(BA Hà — 11/03/2026)* |
| OQ-03 | Email alert có trong scope hiện tại không? | ✅ **Ngoài scope** — phiên bản sau *(BA Hà — 11/03/2026)* |
| OQ-04 | System Status "DEGRADED" hiện tại do nguyên nhân gì? | ⏳ Chờ Dev Team xác nhận |
| OQ-05 | Bot có hỗ trợ multiple positions cùng lúc hay chỉ 1 active position? | ⏳ Chờ Dev Team xác nhận |

---

## 8. Lịch Sử Thay Đổi

| Version | Ngày | Tác giả | Thay đổi |
|---|---|---|---|
| 1.0 DRAFT | 2026-03-07 | BA Agent | Tạo mới |
| 1.1 | 2026-03-11 | XORA | C1: Stop bot tự đóng vị thế; C2: Bot limit theo plan (default 5); C3: Email alert v2 — BA Hà sign-off |
