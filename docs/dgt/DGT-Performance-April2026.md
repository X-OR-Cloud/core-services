# DGT — Thống Kê Giao Dịch (Tháng 4/2026)

> Paper Trading (Binance Demo) · Cập nhật: 2026-04-08

---

## Tài Khoản Có Phát Sinh Giao Dịch

| # | Account | Win Rate | Total PnL | Số Trades | Vốn Đầu Tư (est.) | Ghi chú |
|---|---------|----------|-----------|-----------|-------------------|---------|
| 1 🏆 | Default Paper Account (User 1) | 47.73% | **+$97.72** | 44 | ~$15,463 | Lợi nhuận cao nhất |
| 2 ⭐ | huyen02-email-key (User 2) | 52.50% | **+$11.65** | 40 | ~$1,498 | Win rate tốt nhất |
| 3 | Default Paper Account (User 3) | 44.44% | **+$6.82** | 36 | ~$1,500 | Ổn định |
| 4 | huyen-email-key (User 2) | 40.00% | **+$3.49** | 35 | ~$1,398 | Win rate thấp, vẫn có lãi |
| 5 🎯 | Default Paper Account (User 4) | 61.29% | **+$2.83** | 31 | ~$123 | Win rate cao nhất (vốn nhỏ) |
| 6 | Default Paper Account (User 2) | 35.29% | **-$0.51** | 17 | ~$5,009 | Đang lỗ nhẹ |
| | **TỔNG** | | **+$122.00** | **203** | **~$24,991** | |

---

## Cách Tính "Vốn Đầu Tư (est.)"

**Công thức:**
```
Vốn Đầu Tư = SUM(BUY notional) − SUM(SELL notional)
```
`notional = giá khớp lệnh × số lượng PAXG`

**Ý tưởng:** Trừ đi phần SELL để loại bỏ tiền tái đầu tư (không tính lại là vốn mới).

**Ví dụ:**

| Lệnh | Hành động | Notional |
|------|-----------|----------|
| T-01 | BUY 1 PAXG @ $100 | $100 |
| T-02 | BUY 1 PAXG @ $100 | $100 |
| T-03 | BUY 1 PAXG @ $100 | $100 |
| T-04 | SELL 1 PAXG @ $100 | $100 |
| T-05 | BUY lại bằng tiền T-04 | $100 |

```
SUM(BUY) $400 − SUM(SELL) $100 = Vốn đầu tư $300 ✅
```
→ Đúng: T-05 dùng lại tiền từ T-04, không phải vốn mới bỏ thêm.

---

## Tại Sao Là "Est." (Ước Tính)?

1. **Giá PAXG biến động** — Khi SELL lời rồi tái đầu tư, phần lời cũng bị tính vào BUY tiếp theo → công thức không phân biệt được vốn gốc vs lời đã realised
2. **Không lưu balance ban đầu** — Hệ thống chưa snapshot số dư lúc tạo account → không biết vốn khởi điểm chính xác
3. **USDT nhàn rỗi không được tính** — Tiền đang giữ chờ lệnh không phản ánh trong công thức này

> Để tính chính xác hơn cần bổ sung: lưu initial balance + track deposit. Hiện tại chưa có.

---

*Báo cáo: Nyx — DGT Backend Agent · Có câu hỏi liên hệ <#1479773808272347146>*
