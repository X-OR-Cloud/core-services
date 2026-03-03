---
title: "Requirements Document - AI Digital Gold Trader (AIGT)"
type: "markdown"
labels: ["requirements", "AIGT", "trading", "AI", "gold", "datasource", "BRD"]
---

# REQUIREMENTS DOCUMENT
## AI Digital Gold Trader (AIGT)
**Version:** 1.0 | **Date:** 03/03/2026 | **Status:** Draft

---

## I. TỔNG QUAN & MỤC TIÊU

### 1.1 Mô tả sản phẩm
AIGT là hệ thống giao dịch vàng tự động ứng dụng AI, có khả năng:
- Thu thập liên tục dữ liệu thị trường, tin tức và dữ liệu kinh tế vĩ mô từ nhiều nguồn
- Phân tích, tính toán các chỉ số kỹ thuật và nhận diện xu hướng thị trường
- Đưa ra tín hiệu giao dịch hoặc tự động thực hiện giao dịch thay người dùng
- Quản lý rủi ro theo 3 lớp kiểm soát chặt chẽ
- Cung cấp báo cáo, phân tích hiệu suất cho người dùng

### 1.2 Đối tượng sử dụng
- Nhà đầu tư cá nhân muốn giao dịch vàng tự động
- Private Banks và Family Offices cần công cụ phân tích và ra quyết định

### 1.3 Mục tiêu sản phẩm
- **Tự động hóa hoàn toàn** vòng lặp: Thu thập dữ liệu → Phân tích → Tín hiệu → Thực thi
- **Kiểm soát rủi ro** nghiêm ngặt ở cả cấp độ hệ thống và người dùng
- **Tính minh bạch** trong mọi quyết định giao dịch (audit trail đầy đủ)
- **Linh hoạt** cho người dùng từ mức độ conservative đến aggressive

---

## II. NGUỒN DỮ LIỆU

### 2.1 Tổng quan 10 nguồn dữ liệu

| # | Nguồn | Loại dữ liệu | Tần suất cập nhật | Xác thực |
|---|-------|-------------|-------------------|---------|
| 1 | FRED | Kinh tế vĩ mô (Mỹ) | Hàng ngày / Hàng tháng | API Key |
| 2 | GoldAPI.io | Giá vàng Spot XAU/USD | Thời gian thực | API Key |
| 3 | Yahoo Finance | Giá futures, VIX, S&P, BTC | Theo giờ | Không cần |
| 4 | Binance Spot | Giá PAXG, Volume, Orderbook | Mỗi phút | Không cần |
| 5 | Binance Futures | Funding Rate, Open Interest, Long/Short Ratio | Mỗi phút | Không cần |
| 6 | OKX | Giá PAXG trên sàn OKX | Mỗi 5 phút | Không cần |
| 7 | Bitfinex | Giá XAUT (vàng token) | Mỗi 5 phút | Không cần |
| 8 | NewsAPI.org | Tin tức vàng & kinh tế vĩ mô | Theo giờ | API Key |
| 9 | ByteTree BOLD | Dòng tiền ETF vàng 7 ngày | Hàng ngày | Không cần |
| 10 | Paper Wallet | Ví ảo nội bộ, vị thế demo | On-demand | Nội bộ |

---

### 2.2 Chi tiết từng nguồn

#### **1. FRED — Federal Reserve Economic Data**
**Mục đích:** Cung cấp dữ liệu kinh tế vĩ mô Mỹ để phân tích bức tranh lãi suất, lạm phát và thanh khoản.

**Dữ liệu thu thập:**
| Chỉ số | Mô tả | Tần suất |
|--------|-------|---------|
| FEDFUNDS | Lãi suất điều hành Fed | Monthly |
| CPIAUCSL | Lạm phát CPI | Monthly |
| PCEPI | Lạm phát PCE | Monthly |
| M2SL | Cung tiền M2 | Weekly/Monthly |
| DTWEXBGS | USD Index (Trade Weighted) | Daily |
| RRPONTSYD | Thanh khoản Reverse Repo | Daily |
| FEDTARMD | Dự báo lãi suất Fed (Dot Plot) | Quarterly |
| DFII10 | Lãi suất thực 10 năm | Daily |
| BAMLH0A0HYM2 | Credit Spread – ICE BofA HY OAS | Daily |
| DGS10 | Treasury Yield 10 năm | Daily |
| DGS2 | Treasury Yield 2 năm | Daily |

**Yêu cầu đặc biệt:**
- Khi CPI release ±24h → **hệ thống phải block toàn bộ giao dịch tự động** (hard rule, không bypass)
- PCE data → dùng để tính risk score, không block cứng

---

#### **2. GoldAPI.io — Giá vàng Spot**
**Mục đích:** Cung cấp giá vàng Spot XAU/USD thời gian thực, là giá tham chiếu chính cho toàn hệ thống.

**Dữ liệu thu thập:**
- Giá hiện tại XAU/USD
- Biến động giá (change, change percent)
- Timestamp chính xác

**Yêu cầu đặc biệt:**
- Sai lệch giá hiển thị ≤ 1% so với giá thị trường
- Cần fallback sang Yahoo Finance (GC=F) khi GoldAPI không khả dụng

---

#### **3. Yahoo Finance — Dữ liệu thị trường tổng hợp**
**Mục đích:** Cung cấp dữ liệu OHLCV lịch sử cho các tài sản liên quan, phục vụ tính toán chỉ số kỹ thuật và phân tích tương quan.

**Symbols theo dõi:**
| Symbol | Tài sản | Mục đích |
|--------|---------|---------|
| GC=F | Gold Futures | Proxy giá Spot XAU/USD, dữ liệu kỹ thuật |
| ^VIX | VIX Index | Chỉ số biến động / nỗi sợ thị trường |
| BTC-USD | Bitcoin | Phân tích tương quan |
| ^GSPC | S&P 500 | Phân tích tương quan |
| CL=F | WTI Crude Oil | Phân tích tương quan |
| DX-Y.NYB | US Dollar Index (DXY) | Phân tích vĩ mô |

**Dữ liệu thu thập:**
- Giá real-time (quote): Last price, change, high, low
- Dữ liệu OHLCV lịch sử (chart): dùng cho tính toán MA, RSI, MACD, ATR

---

#### **4. Binance Spot — Thị trường giao ngay**
**Mục đích:** Theo dõi giá, volume và độ sâu thanh khoản của PAXG trên sàn giao dịch lớn nhất.

**Dữ liệu thu thập:**
- **Giá hiện tại:** PAXGUSDT — Last price, 24h change, 24h high/low, volume
- **Orderbook depth:** Bid/ask 100 cấp, phân tích thanh khoản ±1-2% giá
- **Tính toán từ Orderbook:**
  - Bid-Ask Spread (%) → Nếu spread > 0.05% = **NO TRADE** (hard rule)
  - Slippage estimate cho order size thực tế
  - Liquidity score

---

#### **5. Binance Futures — Thị trường hợp đồng tương lai**
**Mục đích:** Thu thập dữ liệu thị trường derivatives để đánh giá tâm lý đám đông và vị thế giữ.

**Dữ liệu thu thập:**
- **Mark Price & Index Price:** Giá tham chiếu hợp đồng
- **Funding Rate (8h):** Chi phí giữ vị thế → dương = long trả short, âm = ngược lại
- **Open Interest:** Tổng vị thế mở (USD) → đánh giá sự tham gia thị trường
- **Long/Short Ratio:** Tỉ lệ tài khoản long vs short
- **Basis (Spot-Perp):** Chênh lệch giá spot và perp, annualized

**Ý nghĩa phân tích:**
- Funding âm + L/S ratio thấp + OI tăng = tín hiệu bullish reversal tiềm năng
- Funding cao + OI lớn = thị trường overextended, cẩn thận long

---

#### **6. OKX — Sàn giao dịch thứ 2**
**Mục đích:** So sánh chéo giá PAXG giữa các sàn để phát hiện chênh lệch giá (peg deviation analysis).

**Dữ liệu thu thập:**
- Giá PAXG-USDT hiện tại trên OKX

---

#### **7. Bitfinex — Sàn giao dịch thứ 3**
**Mục đích:** Theo dõi XAUT (vàng token của Tether) để phân tích peg deviation giữa hai loại vàng token.

**Dữ liệu thu thập:**
- Giá XAUT/USD hiện tại trên Bitfinex

**Tính toán kết hợp (Binance + OKX + Bitfinex):**
- Peg deviation: `(PAXG_price - XAUUSD_spot) / XAUUSD_spot × 100%`
- Arbitrage opportunity giữa PAXG và XAUT
- Cross-exchange volume tổng hợp

---

#### **8. NewsAPI.org — Tin tức tài chính**
**Mục đích:** Thu thập tin tức về vàng, kinh tế vĩ mô để phân tích sentiment thị trường.

**Dữ liệu thu thập:**
- Tiêu đề và nội dung tin tức từ Reuters, Bloomberg, CNBC, Investing.com
- Keywords: "gold price", "gold market", "finance", "trading", "economy"
- Ngôn ngữ: English

**Xử lý sau thu thập:**
- Phân tích sentiment (NLP) cho từng bài → score từ -1.0 đến +1.0
- Tổng hợp sentiment trung bình, max, min theo khoảng thời gian

---

#### **9. ByteTree BOLD — Dữ liệu ETF vàng**
**Mục đích:** Theo dõi dòng tiền vào/ra các quỹ ETF vàng để đánh giá xu hướng nắm giữ vàng của tổ chức.

**Dữ liệu thu thập:**
- Inflow/Outflow ETF vàng trong 7 ngày (oz và USD)
- Tổng AUM các quỹ ETF vàng
- Biến động 30 ngày

**Ý nghĩa phân tích:**
- Dòng tiền âm (outflow) = tổ chức bán vàng → bearish
- Dòng tiền dương (inflow) = tổ chức mua vàng → bullish

---

#### **10. Paper Wallet — Ví ảo nội bộ**
**Mục đích:** Hỗ trợ chế độ paper trading (giao dịch ảo với giá thực) để kiểm tra chiến lược trước khi dùng tiền thật.

**Dữ liệu quản lý:**
- Số dư ảo (USDT)
- Vị thế đang mở (symbol, side, entry price, size, SL/TP)
- Lịch sử giao dịch ảo
- P&L chưa thực hiện và đã thực hiện

---

## III. LUỒNG XỬ LÝ THEO BRD STAGES

### Stage 1: Data Ingestion (Thu thập dữ liệu)
**Mục tiêu:** Thu thập liên tục dữ liệu thô từ tất cả nguồn.

**Thành phần:**
- **Market Data Ingestor:** Thu thập giá vàng (GoldAPI, Yahoo Finance), tỷ giá FX, VIX, dữ liệu OHLCV từ 7 nguồn thị trường
- **Macro & News Ingestor:** Thu thập chỉ số kinh tế vĩ mô từ FRED (11 series), tin tức từ NewsAPI, dữ liệu ETF từ ByteTree
- **On-chain & Derivatives Ingestor:** Thu thập Funding Rate, OI, L/S Ratio từ Binance Futures; dữ liệu orderbook từ 3 sàn

**Yêu cầu chức năng:**
- Thu thập tự động theo lịch định sẵn
- Retry tối đa 3 lần khi lỗi kết nối (exponential backoff)
- Lưu raw data trước khi xử lý (phục vụ audit)
- Ghi log trạng thái mỗi lần fetch (thành công / lỗi / retry)
- Xử lý lỗi khi nguồn dữ liệu down → không crash hệ thống

---

### Stage 2: Feature Engineering & Indicator Calculation (Tính toán chỉ số)
**Mục tiêu:** Chuyển đổi dữ liệu thô thành các feature đặc trưng cho model AI.

**Nhóm chỉ số kỹ thuật (tính bằng công thức toán học):**

| Chỉ số | Mô tả | Chu kỳ |
|--------|-------|--------|
| RSI | Đo momentum giá (0-100) | 7, 14, 21 kỳ |
| MACD | Đo xu hướng + thời điểm đảo chiều | EMA(12), EMA(26), Signal(9) |
| Bollinger Bands | Đo volatility, phát hiện breakout | SMA(20), ±2σ |
| EMA / SMA | Xác định trend | 9, 20, 50, 200 kỳ |
| Volume Profile | Xác nhận tín hiệu giá | Volume ratio, OBV, VWAP |
| ATR | Đo biến động (dùng tính SL/TP) | 14 kỳ, khung D và W |
| Historical Volatility | Biến động annualized | 6 tháng – 1 năm |

**Nhóm chỉ số sentiment (cần mô hình NLP):**

| Chỉ số | Mô tả | Phương pháp |
|--------|-------|-------------|
| News Sentiment Score | Điểm cảm xúc tin tức (-1 đến +1) | NLP (FinBERT hoặc LLM API) |
| Social Media Sentiment | Cảm xúc đám đông retail | NLP + Anomaly detection |

**Nhóm chỉ số on-chain và vĩ mô:**
- DXY trend và tương quan với giá vàng
- VIX regime (Low < 15, Normal 15-30, High > 30)
- Crypto Fear & Greed Index (0-100)
- Fed Rate direction (hiking/pausing/cutting)
- ETF inflow/outflow trend
- Funding Rate annualized
- Exchange flow net

---

### Stage 3: AI Prediction & Signal Generation (Phân tích & Ra tín hiệu)
**Mục tiêu:** Sử dụng Feature Matrix từ Stage 2 để đưa ra tín hiệu BUY/SELL/HOLD với confidence score.

**3A. Mô hình dự đoán giá (Ensemble):**
- **LSTM** (primary): Nhận chuỗi 100 timesteps, dự đoán giá tại t+1, t+5, t+15 phút
- **Transformer** (secondary): Tương tự LSTM, bắt pattern xa hơn trong chuỗi
- **XGBoost** (classification): Phân loại trực tiếp BUY/SELL/HOLD từ feature matrix
- **Ensemble logic:** Kết hợp 3 model theo trọng số động

**3B. Conflict Resolution:**
- 3/3 model đồng ý → thực thi tín hiệu + tăng confidence
- 2/3 model đồng ý → thực thi tín hiệu, ghi chú model bất đồng
- 1/3 model đồng ý → **HOLD** (không có sự đồng thuận)

**3C. Timing Optimization (rule-based):**
- Block giao dịch khi thanh khoản quá thấp (volume < 30% trung bình)
- Block khi spread > 2× trung bình
- Block 30 phút trước sự kiện kinh tế lớn (FOMC, CPI)
- Block cuối tuần khi volume crypto quá thấp

**Output signal:**
- Direction: BUY / SELL / HOLD
- Confidence score (0-100%)
- Mức signal: Strong (>75%), Moderate (60-75%), Weak (50-60%)
- Suggested entry price, Stop Loss, Take Profit
- Lý do tổng hợp từ các chỉ số

---

### Stage 4: Risk Management (Quản lý rủi ro 3 lớp)
**Mục tiêu:** Kiểm soát rủi ro trước khi cho phép thực thi lệnh.

**Lớp 1 — System Hard Limits (ẩn, không thể tắt):**
| Tham số | Giới hạn cứng |
|---------|--------------|
| Max position size | 30% portfolio/asset |
| Max concurrent positions | 5 vị thế |
| Stop-Loss | Bắt buộc, không thể tắt |
| Stop-Loss range | 0.5% – 10% |
| Max daily loss | 15% |
| Risk per trade | Tối đa 5% portfolio |
| Min Risk:Reward | 1:1 |
| Max leverage | 5x |
| Min confidence score | 50% |
| Max orders/phút | 10 orders |
| Min trade size | $10 |
| CPI event block | ±24h quanh CPI release |
| Spread check | > 0.05% → NO TRADE |
| Emergency stop | Price spike >15%/phút, API errors >5 liên tiếp |

**Lớp 2 — User Configurable:**
| Tham số | Phạm vi | Mặc định |
|---------|---------|---------|
| Max position size | 5% – 30% | 15% |
| Max concurrent positions | 1 – 5 | 3 |
| Stop-Loss % | 0.5% – 10% | 2.5% |
| Take-Profit mode | Đơn giản / Nâng cao (3 tiers) | Đơn giản, 5% |
| Max daily loss | 2% – 15% | 5% |
| Progressive drawdown protection | ON/OFF | ON |
| Risk per trade | 0.5% – 5% | 1.5% |
| Min R:R Ratio | 1:1 – 1:5 | 1:2 |
| Leverage | 1x – 5x | 1x |
| Min confidence score | 50% – 90% | 60% |

**Lớp 3 — Preset Templates:**
| Template | Mô tả |
|---------|-------|
| Conservative | Risk thấp nhất, ít lệnh, chất lượng cao |
| Moderate | Cân bằng rủi ro/lợi nhuận |
| Aggressive | Risk cao, nhiều lệnh hơn |

---

### Stage 5: Order Execution & Monitoring (Thực thi lệnh)
**Mục tiêu:** Chuyển đổi tín hiệu đã được phê duyệt rủi ro thành lệnh thực tế trên sàn.

**Luồng thực thi:**
1. Nhận TradeOrder từ Stage 4
2. Chọn loại lệnh (Market / Limit / Stop)
3. Chia nhỏ lệnh lớn (Smart Execution) để giảm slippage
4. Gửi lệnh đến sàn qua API key của người dùng
5. Theo dõi trạng thái lệnh (Pending → Filled / Cancelled / Partial)
6. Cập nhật vị thế và P&L real-time

**Yêu cầu đặc biệt:**
- Gửi lệnh đến sàn trong ≤ 500ms
- API key mã hóa, không lưu plaintext
- Bắt buộc 2FA trước khi bật live trading
- Kill switch: người dùng tắt bot ngay lập tức ≤ 2 giây
- Exchange error → retry 3 lần → pause bot + thông báo người dùng

---

### Stage 6: Broker/Exchange Connector (Kết nối sàn)
**Mục tiêu:** Tích hợp API với các sàn giao dịch để đẩy lệnh thực tế.

**Sàn giao dịch hỗ trợ:**
- Binance (PAXG/USDT Spot và Futures)
- OKX
- Bybit (tương lai)

**Yêu cầu:**
- Hỗ trợ Market Order, Limit Order, Stop Loss/Take Profit
- Theo dõi trạng thái lệnh real-time
- Xử lý partial fill, order rejection
- Không lưu Secret Key dưới dạng plaintext

---

### Stage 7: Reporting Layer (Báo cáo & Dashboard)
**Mục tiêu:** Tổng hợp và hiển thị thông tin cho người dùng theo thời gian thực.

**Nội dung Dashboard:**
- Tổng giá trị portfolio (USD), cập nhật realtime
- Performance chart (24h, 7d, 30d, 90d, 1y)
- Giá PAXG/XAUT real-time từ nhiều sàn
- Biểu đồ phân bổ tài sản (pie chart)

**Analytics:**
- Win Rate, Average Win/Loss, Sharpe Ratio, Max Drawdown
- Phân tích riêng: AI Bot vs Manual trading
- AI Chatbot hỗ trợ phân tích hiệu suất cá nhân

---

### Stage 8: Final Delivery (Báo cáo cho khách hàng)
**Yêu cầu:**
- Xuất báo cáo PDF tự động (daily, weekly, monthly)
- Push notification khi có tín hiệu mới, lệnh khớp, cảnh báo rủi ro
- Export data dạng CSV/JSON
- API endpoint cho external consumption (authenticated)
- Lưu lịch sử data tối thiểu 1 năm; audit log 2 năm (regulatory)

---

## IV. THIẾT KẾ ENTITY (Sơ bộ)

### Group 1 — User & Account Management (4 entities)

| Entity | Mô tả | Trường chính |
|--------|-------|-------------|
| **User** | Tài khoản người dùng hệ thống | id, email, role, auth_method, status, created_at |
| **Account** | Tài khoản giao dịch | user_id, balance, account_type (live/paper), exchange, status |
| **RiskProfile** | Cấu hình rủi ro cá nhân | user_id, risk_appetite, max_drawdown, position_size, time_horizon, preset_template |
| **ApiKey** | Khóa API kết nối sàn | user_id, exchange, key_encrypted, permissions, enabled, last_used |

### Group 2 — Market Data (4 entities)

| Entity | Mô tả | Trường chính |
|--------|-------|-------------|
| **MarketPrice** | Giá tài sản theo thời gian | symbol, open, high, low, close, volume, timestamp, source, timeframe |
| **TechnicalIndicator** | Các chỉ số kỹ thuật đã tính toán | symbol, timestamp, rsi_14, macd_line, macd_signal, ema_20, ema_50, atr_14, bb_upper, bb_lower, volume_ratio |
| **MacroIndicator** | Dữ liệu kinh tế vĩ mô | series_id, name, value, unit, timestamp, source, release_date |
| **SentimentSignal** | Tín hiệu cảm xúc thị trường | timestamp, news_sentiment_mean, social_sentiment, fg_value, fg_classification, etf_flow_7d, source |

### Group 3 — Trading & Execution (5 entities)

| Entity | Mô tả | Trường chính |
|--------|-------|-------------|
| **TradingSignal** | Tín hiệu giao dịch từ AI | symbol, direction, confidence, strength, entry_price, sl_price, tp_price, reasoning, generated_at |
| **Order** | Lệnh giao dịch | user_id, signal_id, symbol, side, type, quantity, price, status, exchange, created_at |
| **Trade** | Giao dịch thực tế đã khớp | order_id, filled_price, filled_qty, fees, exchange_trade_id, executed_at |
| **Position** | Vị thế đang mở | user_id, symbol, side, entry_price, quantity, current_price, unrealized_pnl, sl_price, tp_price, opened_at |
| **OrderExecution** | Chi tiết thực thi lệnh | order_id, step, exchange_response, latency_ms, status, timestamp |

### Group 4 — Risk Management (4 entities)

| Entity | Mô tả | Trường chính |
|--------|-------|-------------|
| **RiskMetric** | Chỉ số rủi ro danh mục | user_id, var_95, cvar_95, sharpe_ratio, max_drawdown, daily_pnl, calculated_at |
| **PortfolioRisk** | Trạng thái rủi ro tổng thể | user_id, total_exposure, concentration_risk, correlation_risk, risk_level, timestamp |
| **RiskAlert** | Cảnh báo khi vượt giới hạn | user_id, alert_type, severity, triggered_value, threshold_value, message, resolved, created_at |
| **StressTestResult** | Kết quả kiểm tra stress | user_id, scenario_name, estimated_loss, loss_percentage, tested_at |

### Group 5 — Operational & Reporting (4 entities)

| Entity | Mô tả | Trường chính |
|--------|-------|-------------|
| **AuditLog** | Lịch sử toàn bộ actions | user_id, action_type, entity_type, entity_id, details, ip_address, timestamp |
| **Report** | Báo cáo hiệu suất | user_id, report_type, period, total_pnl, win_rate, trade_count, generated_at, file_url |
| **Dashboard** | Cấu hình giao diện | user_id, widgets, layout, theme, updated_at |
| **Notification** | Thông báo người dùng | user_id, type, channel, message, read, created_at |

---

## V. LUỒNG THU THẬP DỮ LIỆU (Minimal Approach)

### 5.1 Nguyên tắc thiết kế
- Mỗi datasource có 1 Collector Service riêng biệt
- Mỗi Collector thực hiện đúng 3 bước: **Fetch → Transform → Save**
- Cấu hình datasource khai báo tĩnh (không cần dynamic management giai đoạn đầu)
- Lỗi một datasource không ảnh hưởng đến datasource khác

### 5.2 Lịch thu thập dữ liệu

| Tần suất | Nguồn dữ liệu |
|---------|--------------|
| Mỗi 1 phút | GoldAPI, Binance Spot (PAXG price, orderbook), Binance Futures (funding rate, OI) |
| Mỗi 5 phút | OKX (PAXG price), Bitfinex (XAUT price) |
| Mỗi 1 giờ | Yahoo Finance (OHLCV, VIX, DXY), NewsAPI (tin tức mới nhất) |
| Hàng ngày (2AM UTC) | FRED (chỉ số vĩ mô), ByteTree BOLD (ETF flows) |
| On-demand | Paper Wallet (mọi thao tác giao dịch ảo) |

### 5.3 Cơ chế Retry
- Tối đa 3 lần retry khi lỗi kết nối
- Delay giữa các lần retry: 1s → 2s → 4s (exponential backoff)
- Lỗi 401/403 → không retry (lỗi xác thực, cần can thiệp)
- Lỗi 429 (rate limit) → chờ theo header `Retry-After` nếu có

### 5.4 Xử lý dữ liệu
**Fetch → Transform → Validate → Save**

- **Fetch:** Gọi API, timeout 5-10s, lưu raw response cho audit
- **Transform:** Ánh xạ field sang schema entity, chuẩn hóa kiểu dữ liệu, thêm metadata (source, collected_at)
- **Validate:** Kiểm tra required fields, khoảng giá trị hợp lệ, phát hiện outlier đơn giản
- **Save:** Upsert vào collection tương ứng, ghi log kết quả

### 5.5 Ánh xạ Datasource → Entity

| Datasource | Entity đích |
|-----------|------------|
| GoldAPI, Yahoo Finance (GC=F), Binance Spot, OKX, Bitfinex | **MarketPrice** |
| Yahoo Finance (VIX, BTC, S&P, Oil, DXY) | **MarketPrice** |
| FRED | **MacroIndicator** |
| NewsAPI, ByteTree BOLD | **SentimentSignal** |
| Binance Futures | **MarketPrice** + **SentimentSignal** |
| Tính toán từ MarketPrice | **TechnicalIndicator** |
| Paper Wallet | **Position**, **Order**, **Trade** |

### 5.6 Xử lý lỗi và giám sát
- Ghi log chi tiết mỗi lần fetch (thành công/lỗi/retry)
- Cảnh báo khi một datasource liên tục thất bại (> 5 lần liên tiếp)
- Dashboard trạng thái datasource (last successful fetch, error rate)
- Không crash hệ thống khi bất kỳ datasource nào down

---

## VI. CÁC TÍNH NĂNG CHÍNH (Feature Modules)

### 6.1 Login & Authentication
- Đăng nhập qua Social (Google, X) và Email OTP
- JWT token (access 15 phút, refresh 7 ngày)
- Rate limit: 5 lần/phút/IP; block 15 phút sau 10 lần sai liên tiếp
- Bắt buộc 2FA trước khi bật live trading

### 6.2 Dashboard
- Tổng giá trị portfolio real-time (sai lệch ≤ 1% so với sàn)
- Performance chart theo timeframe (24h, 7d, 30d, 90d, 1y)
- Giá PAXG/XAUT real-time từ WebSocket (cập nhật ≤ 3 giây)
- Biểu đồ phân bổ tài sản

### 6.3 Insight (Phân tích thị trường)
- **Tab Signal:** Hiển thị tín hiệu AI (BUY/SELL/HOLD, confidence, entry/SL/TP)
- **Tab Macro:** Dashboard các chỉ số vĩ mô (Fed Rate, CPI, PCE, DXY, M2, Reverse Repo)
- Phân tích sentiment tin tức, geopolitical risk score
- Chỉ số on-chain: Funding Rate, Open Interest, Liquidation Heatmap
- Chỉ số kỹ thuật: EMA crossover, ATR, Historical Volatility, VIX
- Stress indicators: Credit Spread, CDS Index, Correlation chart

### 6.4 AI Bot
- **Strategy 1 (Trend Following):** EMA crossover + ATR filter + Volume confirmation
- **Strategy 2 (Mean Reversion/Arbitrage):** Peg deviation + Orderbook imbalance + Funding rate
- **Custom Bot:** Người dùng tùy chỉnh parameters trong phạm vi cho phép
- Sandbox mode (paper trading) trước khi chạy tiền thật
- Kill switch: tắt bot ngay lập tức

### 6.5 Live Trading
- Giao diện chart candlestick với overlay indicators
- Đặt lệnh: Market, Limit, Stop Loss/Take Profit
- Real-time orderbook, funding rate countdown, liquidation heatmap
- Quản lý vị thế mở và lịch sử giao dịch

### 6.6 My Analytics
- KPI cá nhân: Win Rate, PnL, Sharpe Ratio, Max Drawdown
- So sánh AI Bot vs Manual trading
- AI Chatbot phân tích hiệu suất cá nhân

### 6.7 User Profile & Risk Settings
- Cấu hình Risk Appetite (Low/Medium/High/Aggressive)
- Time Horizon (Scalp/Intraday/Swing/Position)
- Quản lý API Key (tạo/xóa, masked display)
- Notification preferences (push, email, telegram)

---

## VII. YÊU CẦU PHI CHỨC NĂNG

### 7.1 Hiệu suất
- Dashboard load ≤ 3 giây
- Giá update ≤ 3 giây qua WebSocket
- Signal generation latency ≤ 30 giây end-to-end
- Gửi lệnh đến sàn ≤ 500ms

### 7.2 Độ tin cậy
- Uptime target: 99.5%
- Không mất dữ liệu khi 1 nguồn data down
- Auto-reconnect WebSocket (max 5 lần, backoff 1-2-4-8-16s)
- Database backup hàng ngày

### 7.3 Bảo mật
- HTTPS bắt buộc cho tất cả endpoints
- API Key mã hóa, không lưu Secret Key plaintext
- 2FA bắt buộc cho live trading
- Mọi user chỉ truy cập data của chính mình (IDOR protection)
- Pentest định kỳ: 0 critical/high vulnerability

### 7.4 Compliance & Audit
- Ghi log mọi action (trade, login, config change, risk event)
- Audit log immutable (append-only, không xóa/sửa)
- Retention: Trade audit 2 năm, Login audit 90 ngày
- Export data hỗ trợ CSV/JSON cho compliance

---

*Document này phản ánh yêu cầu tại thời điểm 03/03/2026, dựa trên BRD v1.0, AIGT Process, và Datasources Specification.*
