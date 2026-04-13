# DGT Trading Performance Report — Tháng 4/2026

> Dữ liệu tổng hợp từ PROD database. Cập nhật: 2026-04-08

---

## Bảng Thống Kê Tài Khoản Có Phát Sinh Giao Dịch

| # | Account | Win Rate | Total PnL | Số Trades | Vốn Đầu Tư (est.) | Ghi chú |
|---|---------|----------|-----------|-----------|-------------------|---------|
| 1 🏆 | Default Paper Account (User 1) | 47.73% | **+$97.72** | 44 | ~$15,463 | Lợi nhuận tuyệt đối cao nhất |
| 2 ⭐ | huyen02-email-key (User 2) | 52.50% | **+$11.65** | 40 | ~$1,498 | Win rate tốt nhất nhóm active |
| 3 | Default Paper Account (User 3) | 44.44% | **+$6.82** | 36 | ~$1,500 | Ổn định |
| 4 | huyen-email-key (User 2) | 40.00% | **+$3.49** | 35 | ~$1,398 | Win rate thấp, vẫn có lãi |
| 5 🎯 | Default Paper Account (User 4) | 61.29% | **+$2.83** | 31 | ~$123 | Win rate cao nhất (vốn nhỏ) |
| 6 | Default Paper Account (User 2) | 35.29% | **-$0.51** | 17 | ~$5,009 | Đang lỗ nhẹ |
| | **TỔNG** | | **+$122.00** | **203** | **~$24,991** | |

> Tất cả tài khoản đều là **Paper Trading (Binance Demo)** — không có tiền thật.

---

## Cách Tính "Vốn Đầu Tư (est.)"

### Công thức:

```
Vốn Đầu Tư = SUM(notional của tất cả BUY trades)
            − SUM(notional của tất cả SELL trades)
```

Trong đó: `notional = giá khớp lệnh × số lượng PAXG`

### Ví dụ minh hoạ:

| Lệnh | Hành động | Notional | Vốn thực bỏ ra |
|------|-----------|----------|----------------|
| T-01 | BUY 1 PAXG @ $100 | $100 | $100 (vốn mới) |
| T-02 | BUY 1 PAXG @ $100 | $100 | $100 (vốn mới) |
| T-03 | BUY 1 PAXG @ $100 | $100 | $100 (vốn mới) |
| T-04 | SELL 1 PAXG @ $100 | $100 | ← Thu hồi $100 |
| T-05 | BUY 1 PAXG @ $100 | $100 | Tái đầu tư $100 từ T-04 |

```
SUM(BUY)  = $100 + $100 + $100 + $100 = $400
SUM(SELL) = $100
Vốn Đầu Tư = $400 − $100 = $300 ✅
```

Kết quả $300 = đúng với thực tế: ban đầu bỏ ra $300, lệnh T-05 dùng lại tiền thu về từ T-04 (không phải vốn mới).

---

## Tại Sao Đây Là Con Số ESTIMATE, Không Phải Vốn Chính Xác?

### Hạn chế 1: Giá PAXG thay đổi theo thời gian

- Mỗi lệnh BUY/SELL được khớp ở **giá thị trường khác nhau** tại thời điểm đó
- Ví dụ: BUY 1 PAXG @ $2,950 → SELL @ $3,050 → thu về $3,050 (nhiều hơn $100 so với vốn bỏ ra)
- Khi tái đầu tư, phần chênh lệch $100 này cũng sẽ bị cộng vào SUM(BUY) của lệnh tiếp theo
- Công thức hiện tại **không phân biệt được** phần vốn gốc và phần lời đã realise

### Hạn chế 2: Không tracking số dư ban đầu của tài khoản

- Hệ thống không lưu snapshot "balance tại thời điểm tạo account"
- Không biết người dùng đã nạp bao nhiêu USDT vào tài khoản ban đầu
- Một số tài khoản có thể đã có sẵn USDT trước khi bắt đầu trade

### Hạn chế 3: Partial fills và fees

- Lệnh có thể được khớp một phần (partial fill) → notional thực tế khác với lệnh đặt
- Phí giao dịch (hiện tại = $0 vì paper trading) → trong môi trường live sẽ ảnh hưởng

### Hạn chế 4: Chỉ tính vốn cho PAXG, không tính USDT nhàn rỗi

- Tài khoản có thể giữ USDT chờ cơ hội → không được tính vào "vốn đang hoạt động"
- Công thức trên chỉ phản ánh phần USDT đã thực sự được deploy vào lệnh BUY

---

## Cách Tính Chính Xác Hơn (Nếu Cần)

Để có con số vốn đầu tư **chính xác**, cần:

1. **Lưu snapshot balance USDT tại thời điểm tạo account** → đây là vốn gốc ban đầu
2. **Track các lần nạp thêm vốn** (deposit event) nếu có
3. **Vốn thực = Initial Balance + SUM(deposits)**

> Hiện tại hệ thống chưa có deposit tracking. Nếu cần báo cáo tài chính chính xác, đây là feature cần bổ sung.

---

## Tóm Tắt

| Chỉ số | Giá trị |
|--------|---------|
| Số tài khoản active | 6 |
| Tổng số lệnh | 203 |
| Tổng PnL | **+$122.00** |
| Vốn đầu tư ước tính | **~$24,991** |
| ROI ước tính | **~0.49%** |
| Thời gian | Kể từ khi hệ thống go-live |

> **Lưu ý:** Đây là môi trường Paper Trading (Binance Demo). Kết quả không phản ánh giao dịch tiền thật.

---

*Báo cáo tạo bởi Nyx — DGT Backend Agent*
*Có yêu cầu hoặc báo lỗi vui lòng liên hệ Nyx tại <#1479773808272347146>*
