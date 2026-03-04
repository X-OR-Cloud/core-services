# H05 AI Platform - Executive Summary

**Dự án:** Nền tảng AI Có Chủ quyền - H05 Bộ Công An
**Platform:** X-OR Stack AI
**Ngày:** 2026-03-04

> Tài liệu tóm tắt cho lãnh đạo. Chi tiết đầy đủ xem [H05-AI-PLATFORM-GAP-ANALYSIS.md](H05-AI-PLATFORM-GAP-ANALYSIS.md)

---

## 1. Tổng quan dự án H05

H05 yêu cầu xây dựng **3 hệ thống chính** trên hạ tầng GPU on-premise:

| Hệ thống | Mô tả | Nghiệm thu GĐ1 (Q2/2026) |
|---|---|---|
| **Intelligent Assistant** | Trợ lý AI: tra cứu văn bản pháp lý, lập báo cáo, tư vấn nghiệp vụ | 50 users, accuracy ≥ 80% |
| **Speech-to-Text** | Chuyển giọng nói tiếng Việt → văn bản (lời khai, biên bản họp) | WER ≤ 15%, 50 streams |
| **AI Ops Platform** | Quản lý vòng đời mô hình AI: train → deploy → monitor → retrain | MLOps pipeline hoạt động |

---

## 2. Mức độ đáp ứng hiện tại

### Tổng quan

```
  ✅ Đã đáp ứng       ████░░░░░░░░░░░░░░░░  8%
  🔶 Đáp ứng 1 phần   ████████████████░░░░  35%
  ❌ Chưa có           ██████████████████░░  40%
  ⬜ Ngoài phạm vi     ████████░░░░░░░░░░░░  17%
```

### Theo nhóm chức năng

| Nhóm | Đáp ứng | Nhận xét |
|---|:---:|---|
| **IAM / Auth / RBAC** | ~70% | Thế mạnh. Cần bổ sung MFA, SSO, account lockout |
| **AI Ops - Model Lifecycle** | ~50% | AIWM có nền tảng tốt. Cần mở rộng versioning, lineage, model cards |
| **AI Ops - Monitoring** | ~30% | Có logging + correlation ID. Chưa có drift detection, alerting |
| **Security (app-level)** | ~45% | JWT, RBAC có. Chưa có encryption at rest, rate limiting, DLP |
| **Integration** | ~25% | REST API có. Chưa có SSO/LDAP, SIEM, gRPC |
| **Intelligent Assistant** | ~15% | Conversation tracking có. Chưa có RAG, Vector DB, NLP |
| **AI Ops - Data Mgmt** | ~10% | Chưa có data versioning, catalog, quality framework |
| **AI Ops - Training** | ~5% | Chưa quản lý quá trình training |
| **Speech-to-Text** | ~5% | Hoàn toàn mới |

---

## 3. Điểm mạnh hiện có

1. **Kiến trúc microservices** đúng hướng yêu cầu H05, dễ mở rộng
2. **AIWM** (16 modules): model registry, agent, deployment, workflow, tool management - nền tảng AI Ops sẵn sàng
3. **IAM**: JWT auth, RBAC, organization, license per service - framework vững
4. **CBM**: project/work management có thể phục vụ quản lý AI team
5. **Audit trail + Correlation ID** trên toàn bộ services

---

## 4. Khoảng trống lớn nhất

| # | Gap | Ưu tiên | Quy mô | Ảnh hưởng nghiệm thu |
|---|---|:---:|:---:|---|
| 1 | **RAG Pipeline + Vector DB** | P0 | Lớn | Trực tiếp - IA accuracy |
| 2 | **Speech-to-Text hoàn toàn mới** | P0 | Rất lớn | Trực tiếp - 50% nghiệm thu GĐ1 |
| 3 | **Training Pipeline** (MLOps) | P1 | Lớn | GĐ2 Foundation Model |
| 4 | **MFA + SSO/SAML** | P1 | Trung bình | Security compliance |
| 5 | **Data Pipeline + Versioning** | P1 | Lớn | AI Ops nghiệm thu |
| 6 | **Model Monitoring** (drift, bias) | P2 | Trung bình | AI Ops quality |
| 7 | **Inference Server adapter** | P2 | Trung bình | Model serving |
| 8 | **Encryption at rest + KMS** | P2 | Trung bình | Security audit |

---

## 5. Phân tích rủi ro

### Ma trận rủi ro

```
                          TÁC ĐỘNG
            Trung bình      Cao          Rất cao
         ┌──────────────┬────────────┬──────────────┐
  Rất    │   Test Cov.  │ Encryption │  STT VN      │
  Cao    │              │ SSO/AD     │  LLM Train   │
         │              │            │  RAG 95%     │
         ├──────────────┼────────────┼──────────────┤
  Cao    │  A/B Test    │  Drift     │  HA/DR       │
         │  Data Ver.   │  Bias      │  99.5%       │
         ├──────────────┼────────────┼──────────────┤
  T.bình │  SIEM        │            │              │
         └──────────────┴────────────┴──────────────┘
```

### 3 rủi ro nghiêm trọng nhất 🔴

#### R1: Speech-to-Text tiếng Việt
- **Vấn đề:** WER ≤ 10% cho tiếng Việt self-hosted chưa có precedent. Team không có ML/Speech expertise
- **Tác động:** Fail STT = fail 50% nghiệm thu GĐ1
- **Giải pháp:** Partner với VinAI/FPT AI/Zalo AI. Negotiate WER ≤ 15% cho GĐ1. Yêu cầu BCA cung cấp sample audio sớm

#### R2: Foundation Model Training
- **Vấn đề:** Distributed training 7B-13B params cần ML Engineers chuyên sâu mà team không có
- **Tác động:** Không có Foundation Model cho GĐ2
- **Giải pháp:** Fine-tune open model (Vistral/Qwen2/Llama 3) thay vì train from scratch. Thuê 2-3 ML Engineers. X-OR làm orchestrator, không làm training

#### R3: RAG đạt 95% Factual Correctness
- **Vấn đề:** 95% accuracy trên domain pháp lý VN là thách thức industry-wide. Embedding tiếng Việt chưa mature
- **Tác động:** Fail IA = fail 50% còn lại của nghiệm thu GĐ1
- **Giải pháp:** Negotiate 80% GĐ1 → 95% sau 1 năm vận hành. Multi-stage RAG. Human-in-the-loop cho low-confidence answers

### 4 rủi ro cao 🟠

| # | Rủi ro | Giải pháp chính |
|---|---|---|
| R4 | **Encryption/HSM** - MongoDB Enterprise license, HSM đắt | LUKS filesystem encryption + Percona MongoDB (free). Clarify FIPS: bắt buộc hay tham khảo? |
| R5 | **SSO/AD** - BCA AD isolated, không test trước được | Keycloak (open-source IdP) + Mock AD dev. Phased: local auth GĐ1, AD GĐ2 |
| R6 | **Drift Detection** - Chicken-and-egg, chưa có model để monitor | 2-tier: operational metrics (real-time) + accuracy sampling (batch). Dùng Evidently AI |
| R7 | **HA/DR 99.5%** - Hiện 0% HA, single instance | K8s deployment ASAP. MongoDB Replica Set 3 nodes. Negotiate 99.0% GĐ1 |

---

## 6. Hành động cần thực hiện ngay

### Trước ký hợp đồng

| # | Hành động | Owner |
|---|---|---|
| 1 | Negotiate accuracy targets: STT WER ≤ 15% GĐ1, IA accuracy 80% GĐ1 | PM + BD |
| 2 | Xác nhận FIPS/HSM: bắt buộc hay tham khảo? | PM + Legal |
| 3 | Khảo sát AD infrastructure BCA | Tech Lead |
| 4 | Identify partner STT (VinAI/FPT AI/Zalo AI) | PM + Tech Lead |
| 5 | Yêu cầu BCA cung cấp sample data (audio + văn bản) | PM |

### Tuần 1-4 sau ký HĐ

| # | Hành động | Owner |
|---|---|---|
| 1 | Tuyển/thuê 2-3 ML Engineers (distributed training + NLP) | HR + Tech Lead |
| 2 | Dockerize toàn bộ services + setup K8s cluster | DevOps |
| 3 | MongoDB Replica Set (3 nodes) + Redis Sentinel | DevOps |
| 4 | IAM hardening: MFA (TOTP), account lockout, password policy | Dev Team |
| 5 | Setup mock AD (FreeIPA) cho development | DevOps |

---

## 7. Roadmap tổng quan

```
          Q2/2026                    Q3/2026              Q4/2026           Q1-Q2/2027
 ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐  ┌──────────────┐
 │ Phase 0: Foundation │  │ Phase 2: RAG + IA    │  │ Phase 4: Data   │  │ Phase 6:     │
 │ (IAM, K8s, HA)      │  │ (Vector DB, Dialog)  │  │ (Pipeline,      │  │ Scale &      │
 │ 4 tuần              │  │ 8 tuần               │  │  Versioning)    │  │ Production   │
 ├─────────────────────┤  ├──────────────────────┤  │ 6 tuần          │  │ 4 tuần       │
 │ Phase 1: AI Ops     │  │ Phase 3: STT         │  ├─────────────────┤  └──────────────┘
 │ (Registry, Monitor, │  │ (Whisper, Vietnamese │  │ Phase 5:        │
 │  Training adapter)  │  │  fine-tune, stream)  │  │ Security &      │
 │ 8 tuần              │  │ 10 tuần              │  │ Compliance      │
 └─────────────────────┘  └──────────────────────┘  │ 4 tuần          │
                                                    └─────────────────┘
      ▼ GĐ1 Nghiệm thu                                    ▼ GĐ2 Nghiệm thu
```

**Tổng thời gian:** ~44 tuần (11 tháng)
**Nhân sự cần bổ sung:** 2-3 ML Engineers, 1 DevOps/SRE, 1 STT Partner

---

## 8. Kết luận

**X-OR Stack AI có nền tảng tốt** cho AI Ops Platform (~50-55% đáp ứng ở core modules), nhưng có **3 gap quan trọng** cần xử lý sớm:

1. **STT và IA** - cần partner ML chuyên sâu, không thể tự build với team hiện tại
2. **Security hardening** - MFA, encryption, SSO cần cho compliance
3. **Production readiness** - K8s, HA, CI/CD là prerequisite cho mọi thứ

**Khuyến nghị chiến lược:** X-OR Stack AI đóng vai trò **AI Ops Orchestrator** (quản lý lifecycle, deploy, monitor, govern) - thế mạnh hiện tại. Partner cho ML workloads (STT, LLM training, RAG optimization) với đơn vị chuyên sâu.

---

*Tham chiếu chi tiết: [H05-AI-PLATFORM-GAP-ANALYSIS.md](H05-AI-PLATFORM-GAP-ANALYSIS.md)*
