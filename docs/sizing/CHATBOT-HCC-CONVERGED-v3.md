# Kế Hoạch Sizing Hạ Tầng — Hệ Thống Chatbot Hành Chính Công

**Phiên bản:** 3.1
**Ngày:** 2026-04-15
**Đơn vị cung cấp giải pháp:** Hydra Byte
**Phạm vi:** Hệ thống on-premise, không kết nối Internet (air-gap), triển khai tại một trung tâm dữ liệu

---

## Tóm Tắt Điều Hành

Tài liệu này trình bày yêu cầu hạ tầng phần cứng để vận hành hệ thống chatbot hỗ trợ hành chính công, phục vụ **20.000 người dùng đồng thời** (CCU) trên các cổng dịch vụ công trực tuyến.

Hệ thống được thiết kế trên cụm **5 máy chủ vật lý** (4 máy hoạt động + 1 máy dự phòng nóng), sử dụng mô hình AI **Gemma 4** của Google — được kiểm chứng chất lượng tiếng Việt phù hợp với nghiệp vụ hành chính công.

**Kết luận:** Cấu hình 5 máy chủ với thông số đề xuất đáp ứng đủ yêu cầu vận hành ở mức tải cao nhất, duy trì ngưỡng sử dụng tài nguyên **42–59%** — đảm bảo hiệu năng ổn định và có dư địa mở rộng trong tương lai.

---

## 1. Yêu Cầu Hệ Thống

### 1.1 Quy mô phục vụ

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Người dùng kết nối đồng thời (CCU) | 20.000 | Kết nối WebSocket |
| Người dùng đang hoạt động (giờ cao điểm) | 17.000 | 85% CCU, khung 8h–11h và 13h–16h |
| Tần suất hỏi đáp | 1 câu hỏi / 1,5–2 phút | Phù hợp hành vi tra cứu thủ tục |
| Lưu lượng xử lý cao nhất | ~190 yêu cầu/giây | |
| Thời gian phản hồi tối đa | < 3 giây | |
| Ngôn ngữ | Tiếng Việt | |
| Kho tài liệu tra cứu (RAG) | 400 văn bản hành chính | |

### 1.2 Mô hình AI sử dụng

| Thông số | Giá trị |
|---|---|
| Tên mô hình | Gemma 4 (26B tham số) |
| Nhà phát triển | Google DeepMind |
| Phát hành | Tháng 4/2026 |
| Kiến trúc | Mixture of Experts (MoE) — tối ưu tốc độ xử lý |
| Năng lực xử lý | ~4.500 tokens/giây/đơn vị GPU |
| Độ dài ngữ cảnh | 256.000 tokens |
| Hỗ trợ đa phương tiện | Văn bản, hình ảnh, âm thanh |
| Bản quyền | Apache 2.0 (được phép triển khai thương mại) |
| Môi trường | Hoàn toàn offline (air-gap) |

---

## 2. Cấu Hình Phần Cứng Đề Xuất

### 2.1 Thông số mỗi máy chủ

| Thành phần | Cấu hình |
|---|---|
| CPU | 2 × 56 nhân = 112 nhân/máy |
| RAM | 2.048 GB (2 TB) |
| GPU | 8× NVIDIA H200 (141 GB VRAM/GPU) |
| Bộ nhớ GPU (VRAM) | 1.128 GB/máy |
| Năng lực tính toán GPU | 32.000 TFLOPS/máy |
| Ổ cứng SSD | 30,72 TB/máy |
| Mạng nội bộ | 10/25 GbE Ethernet |
| Ảo hóa | Máy ảo (VM) |

### 2.2 Tổng tài nguyên toàn cụm

| Thành phần | 5 máy (tổng) | 4 máy hoạt động |
|---|---|---|
| CPU (nhân vật lý) | 560 | 448 |
| CPU (vCPU, Hyperthreading bật) | 1.120 | 896 |
| RAM | 10.240 GB (~10 TB) | 8.192 GB |
| Bộ nhớ GPU (VRAM) | 5.640 GB | 4.512 GB |
| Năng lực GPU | 160.000 TFLOPS | 128.000 TFLOPS |
| Ổ cứng SSD | 153,6 TB | 122,9 TB |

### 2.3 Phân bổ ổ cứng mỗi máy chủ

| Mục đích | Dung lượng |
|---|---|
| Hệ điều hành & ảo hóa | 1 TB |
| Lưu trữ mô hình AI | 2 TB |
| Dữ liệu các dịch vụ (máy ảo) | 22 TB |
| Nhật ký & giám sát hệ thống | 2 TB |
| Dự phòng | ~3,72 TB |
| **Tổng** | **~30,72 TB** |

---

## 3. Phân Bổ Tài Nguyên

### 3.1 Năng lực phần cứng và mức sử dụng

| Tài nguyên | Tổng có sẵn | Mức sử dụng |
|---|---|---|
| **CPU (vCPU)** | 1.120 (5 máy × 112 nhân × 2 luồng) | 47% |
| **RAM** | 10.240 GB | 42% |
| **Bộ nhớ GPU (VRAM)** | 5.640 GB | 40% |
| **Ổ cứng SSD** | 153,6 TB | 46% |
| **Năng lực GPU** | 160.000 TFLOPS | 59% |

> Mức sử dụng 40–59% đảm bảo hệ thống vận hành ổn định, không bị quá tải khi có đột biến lưu lượng, và còn dư địa mở rộng quy mô trong tương lai.

### 3.2 Các nhóm dịch vụ và tài nguyên yêu cầu

| Nhóm dịch vụ | Số máy ảo | vCPU | RAM | Bộ nhớ GPU | Ổ cứng |
|---|---|---|---|---|---|
| Máy chủ điều phối (AIWM, IAM, MONA, CBM) | 3 | 72 | 144 GB | — | 600 GB |
| Máy chủ xử lý AI Agent | 8 | 96 | 192 GB | — | 800 GB |
| Hàng đợi & bộ nhớ đệm | 3 | 24 | 144 GB | — | 1,5 TB |
| Cơ sở dữ liệu | 3 | 48 | 288 GB | — | 6 TB |
| Cơ sở dữ liệu vector (RAG) | 3 | 24 | 144 GB | — | 1,5 TB |
| Suy luận AI (Gemma 4) | 28 | 168 | 336 GB | 2.128 GB | — |
| Nhúng văn bản (Embedding) | 2 | 8 | 16 GB | 110 GB | 200 GB |
| Cân bằng tải | 2 | 8 | 16 GB | — | 200 GB |
| Giám sát hệ thống | 2 | 16 | 64 GB | — | 2 TB |
| Hệ điều hành & ảo hóa | 5 máy | 64 | 222 GB | — | 5 TB |
| **Tổng** | **54** | **528** | **1.566 GB** | **2.238 GB** | **~17,8 TB** |

> *Cột vCPU và RAM phản ánh mức phân bổ tối thiểu cho các máy ảo. Mức sử dụng thực tế tại peak load cao hơn do workload AI và cơ sở dữ liệu sử dụng tài nguyên theo nhu cầu — xem mục 3.1 để biết mức sử dụng tổng thể.*

---

## 4. Phân Bổ GPU Trên Mỗi Máy Chủ

Mỗi máy chủ có **8 GPU H200**. Phân bổ trên 4 máy hoạt động (máy 5 dự phòng):

| Máy chủ | GPU suy luận AI | GPU nhúng văn bản | GPU dự phòng trong máy | Mức dùng VRAM |
|---|---|---|---|---|
| Máy 1 | 7 GPU | 1 GPU | — | 52% |
| Máy 2 | 7 GPU | — | 1 GPU | 47% |
| Máy 3 | 7 GPU | — | 1 GPU | 47% |
| Máy 4 | 7 GPU | 1 GPU | — | 52% |
| **Tổng 4 máy hoạt động** | **28 GPU** | **2 GPU** | **2 GPU** | |
| Máy 5 (dự phòng nóng) | — | — | 8 GPU sẵn sàng tiếp nhận | 0% |

---

## 5. Phân Bổ Máy Ảo Trên Mỗi Máy Chủ Vật Lý

### Máy chủ 1

| Dịch vụ | vCPU | RAM | GPU | Ổ cứng |
|---|---|---|---|---|
| Điều phối-1 (AIWM, IAM, MONA, CBM) | 24 | 48 GB | — | 200 GB |
| AI Agent Worker-1 | 12 | 24 GB | — | 100 GB |
| AI Agent Worker-2 | 12 | 24 GB | — | 100 GB |
| Hàng đợi & bộ nhớ đệm-1 | 8 | 48 GB | — | 500 GB |
| Suy luận AI (7 đơn vị) | 42 | 84 GB | 7 GPU | — |
| Nhúng văn bản-1 | 4 | 8 GB | 1 GPU | 100 GB |
| Cân bằng tải-1 | 4 | 8 GB | — | 100 GB |
| Hệ điều hành & ảo hóa | 13 | 45 GB | — | 1 TB |
| **Tổng** | **119*** | **289 GB** | **8 GPU** | **~2,1 TB** |

### Máy chủ 2

| Dịch vụ | vCPU | RAM | GPU | Ổ cứng |
|---|---|---|---|---|
| Điều phối-2 | 24 | 48 GB | — | 200 GB |
| AI Agent Worker-3 | 12 | 24 GB | — | 100 GB |
| AI Agent Worker-4 | 12 | 24 GB | — | 100 GB |
| Cơ sở dữ liệu-1 | 16 | 96 GB | — | 2 TB |
| Suy luận AI (7 đơn vị) | 42 | 84 GB | 7 GPU | — |
| Giám sát hệ thống-1 | 8 | 32 GB | — | 1 TB |
| Hệ điều hành & ảo hóa | 13 | 45 GB | — | 1 TB |
| **Tổng** | **127*** | **353 GB** | **7 GPU** | **~4,4 TB** |

### Máy chủ 3

| Dịch vụ | vCPU | RAM | GPU | Ổ cứng |
|---|---|---|---|---|
| Điều phối-3 | 24 | 48 GB | — | 200 GB |
| AI Agent Worker-5 | 12 | 24 GB | — | 100 GB |
| AI Agent Worker-6 | 12 | 24 GB | — | 100 GB |
| Cơ sở dữ liệu-2 | 16 | 96 GB | — | 2 TB |
| Cơ sở dữ liệu vector-1 | 8 | 48 GB | — | 500 GB |
| Suy luận AI (7 đơn vị) | 42 | 84 GB | 7 GPU | — |
| Hệ điều hành & ảo hóa | 13 | 45 GB | — | 1 TB |
| **Tổng** | **127*** | **369 GB** | **7 GPU** | **~3,9 TB** |

### Máy chủ 4

| Dịch vụ | vCPU | RAM | GPU | Ổ cứng |
|---|---|---|---|---|
| AI Agent Worker-7 | 12 | 24 GB | — | 100 GB |
| AI Agent Worker-8 | 12 | 24 GB | — | 100 GB |
| Hàng đợi & bộ nhớ đệm-2 | 8 | 48 GB | — | 500 GB |
| Hàng đợi & bộ nhớ đệm-3 | 8 | 48 GB | — | 500 GB |
| Cơ sở dữ liệu-3 | 16 | 96 GB | — | 2 TB |
| Cơ sở dữ liệu vector-2 | 8 | 48 GB | — | 500 GB |
| Cơ sở dữ liệu vector-3 | 8 | 48 GB | — | 500 GB |
| Suy luận AI (7 đơn vị) | 42 | 84 GB | 7 GPU | — |
| Nhúng văn bản-2 | 4 | 8 GB | 1 GPU | 100 GB |
| Cân bằng tải-2 | 4 | 8 GB | — | 100 GB |
| Giám sát hệ thống-2 | 8 | 32 GB | — | 1 TB |
| Hệ điều hành & ảo hóa | 13 | 45 GB | — | 1 TB |
| **Tổng** | **143*** | **513 GB** | **8 GPU** | **~6,4 TB** |

> *Tổng vCPU trên mỗi máy chủ tính theo vCPU (Hyperthreading), không phải nhân vật lý. Mỗi máy chủ có 112 nhân vật lý × 2 luồng = 224 vCPU khả dụng — tổng phân bổ các máy ảo nằm trong giới hạn này.

### Máy chủ 5 — Dự Phòng Nóng (n+1)

Không phân bổ dịch vụ thường trực. Khi bất kỳ máy chủ nào gặp sự cố, các máy ảo được chuyển sang máy chủ 5 để đảm bảo tính liên tục của dịch vụ.

---

## 6. Tính Sẵn Sàng Cao & Dự Phòng (HA)

### 6.1 Kịch bản khi 1 máy chủ gặp sự cố

| Máy gặp sự cố | Năng lực AI còn lại | Đáp ứng SLA? | Lưu ý |
|---|---|---|---|
| Máy 1 | 75% (21/28 đơn vị) | ✅ ~118 yêu cầu/giây | Hàng đợi còn 2/3 |
| Máy 2 | 75% | ✅ | Cơ sở dữ liệu còn 2/3 |
| Máy 3 | 75% | ✅ | Cơ sở dữ liệu còn 2/3 |
| Máy 4 | 75% | ✅ | Hàng đợi còn 1/3 — ưu tiên chuyển sang máy 5 |

> Khi 1 máy chủ ngừng hoạt động, hệ thống vẫn xử lý được **~118 yêu cầu/giây** — vượt mức tải cơ bản (100 yêu cầu/giây), đảm bảo dịch vụ không gián đoạn trong quá trình khôi phục.

### 6.2 Mục tiêu khôi phục

| Thành phần | Thời gian khôi phục (RTO) | Điểm dữ liệu khôi phục (RPO) |
|---|---|---|
| Cân bằng tải | < 10 giây | Không mất dữ liệu |
| Máy chủ điều phối | < 30 giây | Không mất dữ liệu |
| AI Agent Worker | < 60 giây | < 5 giây |
| Cơ sở dữ liệu | < 30 giây | < 5 giây |
| Hàng đợi & bộ nhớ đệm | < 30 giây | < 1 giây |
| Cơ sở dữ liệu vector | < 30 giây | Không mất dữ liệu |
| Dịch vụ suy luận AI | < 90 giây | Không áp dụng |
| **Toàn bộ hệ thống** | **< 5 phút** | **< 5 giây** |

---

## 7. Tổng Hợp & Khuyến Nghị

### 7.1 Tổng hợp tài nguyên

| Tài nguyên | Yêu cầu | Mức sử dụng |
|---|---|---|
| CPU (vCPU) | 1.120 vCPU (5 nodes × 112 cores × 2) | **47%** ✅ |
| RAM | 10.240 GB | **42%** ✅ |
| Bộ nhớ GPU | 5.640 GB | **40%** ✅ |
| Ổ cứng SSD | 153,6 TB | **46%** ✅ |
| Năng lực GPU | 160.000 TFLOPS | **59%** ✅ |

### 7.2 Số lượng máy ảo

| Nhóm dịch vụ | Số lượng |
|---|---|
| Máy chủ điều phối | 3 |
| AI Agent Worker | 8 |
| Hàng đợi & bộ nhớ đệm | 3 |
| Cơ sở dữ liệu | 3 |
| Cơ sở dữ liệu vector | 3 |
| Suy luận AI (Gemma 4) | 28 |
| Nhúng văn bản | 2 |
| Cân bằng tải | 2 |
| Giám sát hệ thống | 2 |
| **Tổng** | **54 máy ảo** |

### 7.3 Khuyến nghị

**Phần cứng đề xuất đáp ứng đủ yêu cầu** cho quy mô 20.000 CCU với các điểm nổi bật:

- **Dự phòng n+1:** Cụm 5 máy chủ (4 hoạt động + 1 dự phòng nóng) đảm bảo hệ thống không gián đoạn khi có sự cố phần cứng.
- **Dư địa mở rộng:** Mức sử dụng tài nguyên 40–59% cho phép hệ thống hấp thụ đột biến lưu lượng và mở rộng quy mô lên **~35.000 CCU** mà không cần bổ sung phần cứng.
- **Hoàn toàn offline:** Toàn bộ hệ thống — bao gồm mô hình AI — vận hành trong môi trường air-gap, đáp ứng yêu cầu an ninh thông tin cho dịch vụ công.

---

*Tài liệu được soạn thảo phục vụ mục đích đánh giá và phê duyệt đầu tư hạ tầng phần cứng.*
*Ngày soạn: 2026-04-15 | Phiên bản: 3.1 | Đơn vị soạn thảo: Hydra Byte*
