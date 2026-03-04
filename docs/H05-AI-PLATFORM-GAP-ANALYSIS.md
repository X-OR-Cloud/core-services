# Phân tích Đối chiếu: Yêu cầu Kỹ thuật H05 vs X-OR Stack AI

**Dự án:** Thí điểm Nền tảng Trí tuệ Nhân tạo Có Chủ quyền - H05 Bộ Công An
**Phiên bản tài liệu gốc:** v1.0 - Tháng 3/2026
**Ngày phân tích:** 2026-03-04
**Đơn vị phân tích:** X-OR Stack AI Team

---

## Ký hiệu đánh giá

| Ký hiệu | Ý nghĩa | Mô tả |
|:---:|---|---|
| ✅ | Đã đáp ứng | Chức năng đã có sẵn trong platform, sẵn sàng hoặc cần điều chỉnh nhỏ |
| 🔶 | Đáp ứng một phần | Có nền tảng/framework, cần mở rộng hoặc bổ sung module |
| ❌ | Chưa có | Hoàn toàn mới, cần phát triển từ đầu |
| ⬜ | Không thuộc phạm vi | Thuộc về infrastructure/hardware hoặc bên thứ ba |

---

## PHẦN I: PHÂN TÍCH ĐỐI CHIẾU TỔNG QUAN

### 1. Mapping kiến trúc: X-OR Stack AI → Yêu cầu H05

```
┌──────────────────────────────────────────────────────────────────────┐
│                     YÊU CẦU HỆ THỐNG H05                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  Intelligent     │  │  Speech-to-Text  │  │   AI Ops Platform  │  │
│  │  Assistant       │  │  System          │  │                    │  │
│  └────────┬────────┘  └────────┬─────────┘  └─────────┬──────────┘  │
│           │                    │                       │             │
├───────────┴────────────────────┴───────────────────────┴─────────────┤
│                     X-OR STACK AI PLATFORM                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   AIWM   │  │   IAM    │  │   CBM    │  │   MONA   │            │
│  │ AI Ops   │  │ Identity │  │ Business │  │ Monitor  │            │
│  │ Core     │  │ & Access │  │ Mgmt     │  │ & Alert  │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐                                         │
│  │   NOTI   │  │   AIVP   │  + Các module mới cần phát triển       │
│  │ Notify   │  │ Video    │                                         │
│  └──────────┘  └──────────┘                                         │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                  HẠ TẦNG (Infrastructure - Client quản lý)           │
│  GPU Cluster · K8s · Storage · Network · Security Appliances         │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. Tổng hợp mức độ đáp ứng theo chương

| Chương | Nội dung | Tỷ lệ | Ghi chú |
|---|---|:---:|---|
| **Mục 1** | Tóm tắt tổng quan | ⬜ | Tài liệu mô tả, không có yêu cầu kỹ thuật |
| **Mục 2** | Tổng quan dự án & mục tiêu | ⬜ | Bối cảnh, pháp lý - không áp dụng trực tiếp |
| **Mục 3.1** | Hạ tầng phần cứng | ⬜ | Hardware - client quản lý |
| **Mục 3.2** | Nền tảng phần mềm & AI Ops | ~55% | **Core scope của X-OR Stack AI** |
| **Mục 3.3** | An ninh mạng & chủ quyền dữ liệu | ~50% | Phần IAM + AIWM đáp ứng, phần infra chưa |
| **Mục 4.1** | Intelligent Assistant | ~30% | Backend infra có, AI logic chưa |
| **Mục 4.2** | Speech-to-Text | ~5% | Hoàn toàn mới |
| **Mục 4.3** | AI Ops Platform | ~55% | **Thế mạnh hiện tại**, cần mở rộng |
| **Mục 5** | Yêu cầu phi chức năng | ~50% | Auth, logging có; MFA, HA cần bổ sung |
| **Mục 6** | Yêu cầu tích hợp | ~35% | REST API có, SSO/LDAP/SIEM chưa |
| **Mục 7** | Yêu cầu dữ liệu | ~20% | Data pipeline, catalog chưa có |
| **Mục 8** | Tuân thủ & tiêu chuẩn | ~30% | Framework có, chưa audit chính thức |
| **Mục 9** | Kiểm thử & nghiệm thu | ~25% | Unit test có, ML testing chưa |

### 3. Điểm mạnh chiến lược của X-OR Stack AI

1. **Kiến trúc microservices modular** - Đúng hướng yêu cầu H05, dễ mở rộng
2. **AIWM** - Nền tảng AI Ops có sẵn: model registry, agent, deployment, workflow, tool management
3. **IAM** - Authentication/Authorization framework vững, cần bổ sung MFA/SSO
4. **CBM** - Work/Project management phục vụ quản lý task AI team
5. **Audit trail + Correlation ID** - Đã có trên toàn bộ services

### 4. Khoảng trống lớn cần fill (theo mức độ ưu tiên)

| # | Khoảng trống | Ưu tiên | Ước lượng |
|---|---|:---:|---|
| 1 | RAG Pipeline + Vector Database | P0 | Lớn |
| 2 | Speech-to-Text System | P0 | Rất lớn |
| 3 | Training Pipeline (MLOps: experiment, distributed training) | P1 | Lớn |
| 4 | MFA + SSO/SAML/OIDC | P1 | Trung bình |
| 5 | Data Pipeline + Data Versioning + Data Catalog | P1 | Lớn |
| 6 | Model Monitoring (drift, bias, explainability) | P2 | Trung bình |
| 7 | Inference Server Integration (Triton/TorchServe adapter) | P2 | Trung bình |
| 8 | SIEM/SOC Integration | P2 | Trung bình |
| 9 | Encryption at rest (AES-256, HSM) | P2 | Trung bình |
| 10 | Annotation Tool Integration | P3 | Nhỏ |

---

## PHẦN II: CHECKLIST CHI TIẾT THEO TỪNG MỤC

---

### MỤC 1: TÓM TẮT TỔNG QUAN

> Mục này chỉ là giới thiệu tài liệu, không chứa yêu cầu kỹ thuật cần đáp ứng.

| # | Nội dung | Đánh giá | Ghi chú |
|---|---|:---:|---|
| 1.1 | Giới thiệu | ⬜ | Mô tả dự án |
| 1.2 | Tầm nhìn chiến lược | ⬜ | Bối cảnh |
| 1.3 | Phạm vi tài liệu | ⬜ | Mô tả phạm vi |
| 1.4 | Đối tượng sử dụng | ⬜ | Thông tin chung |

---

### MỤC 2: TỔNG QUAN DỰ ÁN VÀ MỤC TIÊU

| # | Nội dung | Đánh giá | Ghi chú |
|---|---|:---:|---|
| 2.1 | Bối cảnh và sự cần thiết | ⬜ | Bối cảnh, không yêu cầu kỹ thuật |
| 2.2.1 | Mục tiêu tổng quát | ⬜ | Chiến lược |
| 2.2.2 | Mục tiêu cụ thể - Công nghệ | 🔶 | AIWM đáp ứng phần AI Ops; STT & IA cần phát triển |
| 2.2.2 | Mục tiêu cụ thể - Nghiệp vụ | ❌ | Chưa có ứng dụng nghiệp vụ BCA |
| 2.2.2 | Mục tiêu cụ thể - Tổ chức | ⬜ | Thuộc về đào tạo, quy trình - ngoài phạm vi SW |
| 2.3 | Phạm vi triển khai | ⬜ | Thông tin kế hoạch |
| 2.4 | Căn cứ pháp lý | ⬜ | Pháp lý, không yêu cầu kỹ thuật |

---

### MỤC 3: YÊU CẦU KIẾN TRÚC KỸ THUẬT

#### 3.1. Hạ tầng phần cứng

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-HW-TRAIN-001 | Cụm GPU huấn luyện (Blackwell B200, 8 GPU, 192GB HBM3e) | ⬜ | Không thuộc phạm vi phần mềm | Client mua sắm hardware |
| YC-HW-TRAIN-002 | Hệ thống lưu trữ huấn luyện (500TB, 100GB/s, NVMe) | ⬜ | Không thuộc phạm vi phần mềm | Client quản lý storage |
| YC-HW-TRAIN-003 | Hệ thống mạng huấn luyện (400Gbps, InfiniBand) | ⬜ | Không thuộc phạm vi phần mềm | Client quản lý network |
| YC-HW-INFER-001 | Cụm GPU suy luận GĐ1 (RTX Pro 6000 SE, 4-8 GPU) | ⬜ | Không thuộc phạm vi phần mềm | Client mua sắm |
| YC-HW-INFER-002 | Cụm GPU suy luận GĐ2 (B6000 SE, 16-32 GPU) | ⬜ | Không thuộc phạm vi phần mềm | Client mua sắm |
| YC-HW-INFER-003 | Hệ thống lưu trữ suy luận (100TB, 20GB/s) | ⬜ | Không thuộc phạm vi phần mềm | Client quản lý storage |
| YC-HW-INFRA-001 | Hệ thống nguồn điện (100kW, UPS N+1) | ⬜ | Không thuộc phạm vi phần mềm | Client quản lý DC |
| YC-HW-INFRA-002 | Hệ thống làm mát (120kW, 18-27°C) | ⬜ | Không thuộc phạm vi phần mềm | Client quản lý DC |
| YC-HW-INFRA-003 | Hệ thống mạng datacenter (100Gbps, IPMI) | ⬜ | Không thuộc phạm vi phần mềm | Client quản lý DC |

#### 3.2. Nền tảng phần mềm và AI Ops

##### YC-SW-AIOPS-001: Quản lý vòng đời mô hình (MLOps)

| Thành phần | Yêu cầu chi tiết | Đánh giá | X-OR Stack AI hiện có | Khoảng cách |
|---|---|:---:|---|---|
| **Model Registry** | Lưu trữ, phiên bản hóa, metadata tracking, model lineage, provenance | 🔶 | AIWM Model module: lưu trữ model, status lifecycle (queued→downloading→active), type (llm/vision/embedding/voice), scope (public/org/private) | Chưa có: immutable artifacts, digital signatures, hyperparameter tracking, metrics per version, model lineage graph |
| **Experiment Tracking** | Ghi nhận thí nghiệm, so sánh metrics, visualization | ❌ | Chưa có module riêng | Cần: Experiment entity, run tracking, metric comparison, dashboard. Có thể tích hợp MLflow adapter |
| **Pipeline Orchestration** | Tự động hóa workflow, dependency management, retry | 🔶 | AIWM Workflow + Execution engine: step-based execution, dependencies, retry config, error classification | Chưa có: DAG visualization, distributed execution trên K8s, trigger-based pipeline |

##### YC-SW-AIOPS-002: Quản lý dữ liệu (Data Management)

| Thành phần | Yêu cầu chi tiết | Đánh giá | X-OR Stack AI hiện có | Khoảng cách |
|---|---|:---:|---|---|
| **Data Versioning** | Phiên bản hóa datasets, snapshot, rollback, lineage | ❌ | Chưa có | Cần module Dataset Versioning trong AIWM hoặc service mới |
| **Data Quality** | Validation rules, anomaly detection, data profiling | ❌ | Chưa có | Cần Data Quality module |
| **Data Catalog** | Metadata management, search, discovery, access control | ❌ | Chưa có | Cần Data Catalog module hoặc Apache Atlas adapter |

##### YC-SW-AIOPS-003: Huấn luyện và tối ưu hóa mô hình

| Thành phần | Yêu cầu chi tiết | Đánh giá | X-OR Stack AI hiện có | Khoảng cách |
|---|---|:---:|---|---|
| **Distributed Training** | Multi-GPU/node, data/model parallelism, gradient accumulation | ❌ | AIWM quản lý model sau training, không quản lý quá trình training | Cần Training Job module orchestrate PyTorch DDP/DeepSpeed |
| **Model Optimization** | Quantization, Pruning, Distillation, LoRA/PEFT | ❌ | Chưa có | Cần Optimization Pipeline module |
| **Hyperparameter Tuning** | Automated search (Bayesian), early stopping, resource allocation | ❌ | Chưa có | Cần HPO module hoặc Optuna/Ray Tune adapter |

##### YC-SW-AIOPS-004: Triển khai và phục vụ mô hình (Model Serving)

| Thành phần | Yêu cầu chi tiết | Đánh giá | X-OR Stack AI hiện có | Khoảng cách |
|---|---|:---:|---|---|
| **Inference Server** | REST/gRPC, batch/streaming, dynamic batching | 🔶 | AIWM Deployment module: endpoint management, blue-green deployment, status tracking | Chưa tích hợp trực tiếp với Triton/TorchServe. Cần adapter layer |
| **Model Gateway** | Load balancing, rate limiting, auth | 🔶 | AIWM có JWT auth, RBAC trên API | Chưa có: traffic-level load balancing, rate limiting per model, request/response logging riêng cho inference |
| **A/B Testing** | Traffic splitting, canary, shadow mode | ❌ | Deployment có blue-green concept nhưng chưa có traffic splitting logic | Cần Traffic Management module |

##### YC-SW-AIOPS-005: Giám sát và quan sát (Monitoring & Observability)

| Thành phần | Yêu cầu chi tiết | Đánh giá | X-OR Stack AI hiện có | Khoảng cách |
|---|---|:---:|---|---|
| **Metrics Collection** | System metrics, app metrics, model metrics | 🔶 | AIWM Node module: CPU, GPU, memory, disk, network metrics. MONA service exists | Chưa có: model-specific metrics (accuracy, drift), Prometheus exporter |
| **Logging** | Centralized log aggregation, structured logging, retention | 🔶 | CorrelationIdMiddleware trên toàn service, structured logging | Chưa có: centralized aggregation (ELK), log retention policy, log rotation |
| **Tracing** | Distributed tracing, request flow, performance profiling | 🔶 | Correlation ID tracking | Chưa có: OpenTelemetry instrumentation, Jaeger integration |
| **Alerting** | Rule-based alerts, anomaly detection, escalation | ❌ | MONA có concept nhưng chưa đầy đủ | Cần: Alert rules engine, escalation policy, notification channels |

##### YC-SW-DEV-001 đến 003: Nền tảng phát triển

| Mã yêu cầu | Nội dung | Đánh giá | Ghi chú |
|---|---|:---:|---|
| YC-SW-DEV-001 | IDE/Notebooks (JupyterLab, VS Code Server) | ⬜ | Infrastructure tool, không thuộc platform |
| YC-SW-DEV-002 | Framework/thư viện (PyTorch, Transformers, Whisper...) | ⬜ | ML framework, cài trên training nodes |
| YC-SW-DEV-003 | Container & orchestration (Docker, K8s, Harbor) | ⬜ | Infrastructure, client quản lý |

##### YC-SW-DB-001 đến 003: Hệ thống cơ sở dữ liệu

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI hiện có | Khoảng cách |
|---|---|:---:|---|---|
| YC-SW-DB-001 | RDBMS (PostgreSQL/MySQL, HA, backup) | ⬜ | X-OR dùng MongoDB. RDBMS cho data warehouse nếu cần | Client quyết định |
| YC-SW-DB-002 | Vector DB (Milvus/Weaviate/Qdrant, 768-4096 dims) | ❌ | Chưa tích hợp Vector DB | Cần cho RAG pipeline. Ưu tiên P0 |
| YC-SW-DB-003 | NoSQL (MongoDB, Redis, InfluxDB) | ✅ | MongoDB (toàn bộ services), Redis (BullMQ queue) | Chưa có: Time-Series DB (InfluxDB) cho model metrics |

#### 3.3. An ninh mạng và chủ quyền dữ liệu

##### 3.3.2. Bảo mật mạng

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-SEC-NET-001 | Phân vùng mạng (Management/Training/Inference/Data zones) | ⬜ | Network infrastructure | Client quản lý |
| YC-SEC-NET-002 | Firewall và IDS/IPS | ⬜ | Network appliances | Client quản lý |
| YC-SEC-NET-003 | VPN và Remote Access | ⬜ | Network infrastructure | Client quản lý |

##### 3.3.3. Bảo mật hệ thống và ứng dụng

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-SEC-SYS-001 | Hardening OS (CIS Benchmarks, Patch, EDR) | ⬜ | OS-level | Client quản lý |
| YC-SEC-SYS-002 | **IAM (Authentication)** | | | |
| | - Multi-factor authentication (MFA) | ❌ | IAM chỉ có username/password + JWT | Cần bổ sung TOTP/OTP module |
| | - Password policy (≥12 chars, complexity) | 🔶 | IAM: 8-15 chars, uppercase/lowercase/number/special | Cần nâng lên ≥12 chars, thêm history check |
| | - Account lockout sau 5 lần | ❌ | Chưa có account lockout | Cần bổ sung vào IAM Auth module |
| YC-SEC-SYS-002 | **IAM (Authorization)** | | | |
| | - Role-Based Access Control (RBAC) | ✅ | IAM: RBAC với roles, organization, license per service | Đáp ứng |
| | - Principle of Least Privilege | 🔶 | BaseService có permission checks | Cần review và tighten permissions |
| | - SSO (SAML 2.0 / OAuth 2.0 / OIDC) | ❌ | Chưa có SSO | Cần SSO module tích hợp AD |
| YC-SEC-SYS-003 | **Bảo mật API** | | | |
| | - JWT tokens, expiration, refresh, revocation | ✅ | IAM: JWT 1h access + 7d refresh, blacklist on logout | Đáp ứng |
| | - Scope-based permissions | 🔶 | License per service, RBAC | Chưa có fine-grained scope per API |
| | - Rate limiting | ❌ | Chưa có rate limiting | Cần middleware hoặc API gateway |
| | - Input validation, SQL injection prevention | ✅ | Mongoose schema validation, NestJS pipes | Đáp ứng (NoSQL nên không có SQL injection) |

##### 3.3.4. Bảo mật dữ liệu

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-SEC-DATA-001 | **Mã hóa dữ liệu** | | | |
| | - At rest: AES-256, KMS, HSM | ❌ | Chưa có encryption at rest | Cần cấu hình MongoDB encryption + KMS |
| | - In transit: TLS 1.3 | 🔶 | HTTPS có thể cấu hình | Cần enforce TLS 1.3 trên toàn bộ |
| | - In use: Confidential Computing | ⬜ | Hardware-level feature | Client quản lý |
| YC-SEC-DATA-002 | Phân loại và gán nhãn dữ liệu (4 cấp) | ❌ | Chưa có data classification system | Cần Data Classification module |
| YC-SEC-DATA-003 | Data Loss Prevention (DLP) | ❌ | Chưa có DLP | Cần DLP module hoặc tích hợp 3rd party |
| YC-SEC-DATA-004 | **Anonymization và PII Protection** | | | |
| | - Masking | 🔶 | AIWM PII module: regex patterns cho email, phone, SSN, CCCD, bank accounts | Cần mở rộng patterns |
| | - Tokenization | ❌ | Chưa có irreversible tokenization | Cần bổ sung |
| | - Differential Privacy | ❌ | Chưa có | Advanced feature, có thể P3 |
| | - K-Anonymity | ❌ | Chưa có | Advanced feature, có thể P3 |

##### 3.3.5. Bảo mật AI và mô hình

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-SEC-AI-001 | **Model Security** | | | |
| | - Model Extraction prevention (rate limiting, watermarking) | ❌ | Chưa có rate limiting per model, chưa có watermarking | Cần bổ sung |
| | - Adversarial Attack prevention | ❌ | Chưa có | Cần input validation layer cho inference |
| | - Data Poisoning prevention | ❌ | Chưa có data provenance tracking | Cần bổ sung vào Data Pipeline |
| | - Model Inversion prevention | ❌ | Chưa có | Cần output perturbation, confidence limiting |
| YC-SEC-AI-002 | **Prompt Injection Prevention** | | | |
| | - Input filtering (blacklist/whitelist, length limits) | 🔶 | AIWM Guardrail: blockedKeywords, blockedTopics | Cần mở rộng: length limits, encoding validation |
| | - Output validation (content filtering, toxicity, PII) | 🔶 | AIWM Guardrail + PII module | Cần thêm toxicity detection |
| | - Sandboxing | ❌ | Chưa có isolated execution | Cần container-level sandboxing |
| YC-SEC-AI-003 | Bias và Fairness monitoring | ❌ | Chưa có | Cần Fairness module (SHAP, LIME integration) |

##### 3.3.6. Giám sát và ứng phó sự cố

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-SEC-MON-001 | SIEM (centralized logging, correlation, alerting) | 🔶 | Structured logging + correlation ID có | Chưa tích hợp SIEM (ELK/Splunk) |
| YC-SEC-MON-002 | SOC (24/7 monitoring, incident response) | ⬜ | Quy trình vận hành | Không thuộc phạm vi phần mềm |
| YC-SEC-MON-003 | Vulnerability Management | ⬜ | Quy trình vận hành | Không thuộc phạm vi phần mềm |

##### 3.3.7. Tuân thủ và kiểm toán

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-SEC-COMP-001 | Compliance Framework (ISO 27001, 27701, NIST, CIS) | 🔶 | Có nền tảng (audit trail, RBAC, logging) | Chưa có formal compliance mapping |
| YC-SEC-COMP-002 | Audit & Governance (internal/external/AI model audit) | 🔶 | createdBy/updatedBy, audit trail trên toàn service | Chưa có: immutable audit logs, formal audit reports |

---

### MỤC 4: YÊU CẦU CHỨC NĂNG

#### 4.1. Hệ thống Trợ lý thông minh (Intelligent Assistant)

##### YC-FUNC-IA-001: Kiến trúc tổng thể

| Tầng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| User Interface Layer (Web, Mobile, API Gateway) | 🔶 | REST API + Swagger có. WebSocket chat có | Chưa có: Web Portal UI, Mobile App |
| Application Layer (Dialog Manager, Intent/Entity, Response Validator) | ❌ | Chưa có | Cần module Dialog Manager, Intent Recognition |
| AI/ML Layer (Foundation Model, RAG, Knowledge Graph) | ❌ | Chưa có | Cần RAG pipeline, Vector DB, Knowledge Graph |
| Data Layer (Document Store, Vector DB, Structured DB) | 🔶 | MongoDB (document store) có | Chưa có: Vector DB, Knowledge Graph DB |

##### YC-FUNC-IA-002: Tra cứu văn bản và quy định

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Semantic Search (vector similarity, embedding, reranking) | ❌ | Chưa có | Cần Vector DB + Embedding model + Reranker |
| Multi-document QA (RAG pipeline, citation, confidence) | ❌ | Chưa có | Cần RAG module |
| Summarization (extractive/abstractive) | ❌ | Chưa có | Cần LLM integration cho summarization |

##### YC-FUNC-IA-003: Hỗ trợ lập báo cáo

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Template Generation | ❌ | Chưa có | Cần Report Template module |
| Content Suggestion | ❌ | Chưa có | Cần context-aware generation |
| Data Extraction (NER, relation extraction) | ❌ | Chưa có | Cần NER module cho tiếng Việt |

##### YC-FUNC-IA-004: Tư vấn nghiệp vụ

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Procedure Guidance (multi-turn, step-by-step) | 🔶 | AIWM Conversation + Message: multi-turn tracking | Cần logic layer cho procedure guidance |
| Case Analysis | ❌ | Chưa có | Cần case-based reasoning module |
| Legal Reference | ❌ | Chưa có | Cần legal knowledge base + cross-reference |

##### YC-FUNC-IA-005: Quản lý hội thoại

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Context Management (session, context window, memory) | 🔶 | AIWM Conversation module: multi-turn, tool call history | Cần: context window optimization, memory mechanisms |
| Clarification (ambiguity detection, follow-up) | ❌ | Chưa có | Cần AI logic layer |
| Multi-intent Handling | ❌ | Chưa có | Cần intent decomposition module |

##### YC-FUNC-IA-006 đến 008: Giao diện người dùng

| Mã yêu cầu | Nội dung | Đánh giá | Ghi chú |
|---|---|:---:|---|
| YC-FUNC-IA-006 | Web Portal (chat, search, dashboard, accessibility) | ❌ | Chưa có frontend. X-OR là backend platform |
| YC-FUNC-IA-007 | Mobile App (iOS/Android, voice input, offline, biometric) | ❌ | Chưa có mobile app |
| YC-FUNC-IA-008 | API Gateway (REST OpenAPI 3.0, WebSocket, rate limiting) | 🔶 | REST + Swagger có. WebSocket có. Rate limiting chưa có |

##### YC-FUNC-IA-009 đến 011: Yêu cầu hiệu năng

| Mã yêu cầu | Metric | Mục tiêu | Đánh giá | Ghi chú |
|---|---|---|:---:|---|
| YC-FUNC-IA-009 | Simple QA response time | < 2s (target), < 5s (max) | ❌ | Chưa có QA system để benchmark |
| YC-FUNC-IA-009 | Complex QA response time | < 5s (target), < 10s (max) | ❌ | Phụ thuộc RAG + LLM performance |
| YC-FUNC-IA-010 | Concurrent Users GĐ1 | 50-100 | 🔶 | Architecture hỗ trợ, chưa load test |
| YC-FUNC-IA-010 | Queries/second GĐ1 | 10-20 | 🔶 | Cần benchmark |
| YC-FUNC-IA-011 | Intent Recognition accuracy | ≥ 90% | ❌ | Chưa có intent system |
| YC-FUNC-IA-011 | Factual Correctness | ≥ 95% | ❌ | Phụ thuộc RAG quality |

#### 4.2. Hệ thống Speech-to-Text

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-FUNC-STT-001 | Kiến trúc STT (Audio Processing → ASR → Post-Processing) | ❌ | Hoàn toàn chưa có | Cần service mới hoàn toàn |
| YC-FUNC-STT-002 | Real-time Transcription, Batch, Multi-speaker | ❌ | Chưa có | Cần Whisper/Wav2Vec2 + diarization |
| YC-FUNC-STT-003 | Noise Suppression, Echo Cancellation, AGC | ❌ | Chưa có | Audio processing pipeline |
| YC-FUNC-STT-004 | Tiếng Việt + giọng địa phương + từ vựng chuyên ngành | ❌ | Chưa có | Cần fine-tune model cho tiếng Việt |
| YC-FUNC-STT-005 | Hậu xử lý (dấu câu, viết hoa, số, disfluency) | ❌ | Chưa có | Post-processing pipeline |
| YC-FUNC-STT-006 | API/SDK (REST, WebSocket, Python/Java/JS SDK) | 🔶 | NestJS REST + WebSocket framework có | Cần build STT-specific endpoints + SDK |
| YC-FUNC-STT-007 | Tích hợp (IA, Meeting, Call Center) | ❌ | Chưa có | Phụ thuộc STT service hoàn thành |
| YC-FUNC-STT-008 | WER ≤ 10% (clean), ≤ 15% (noisy), ≤ 20% (dialect) | ❌ | Chưa có model | Phụ thuộc training data + fine-tuning |
| YC-FUNC-STT-009 | Latency < 500ms, RTF < 0.3, 50 concurrent streams | ❌ | Chưa có | Phụ thuộc GPU + optimization |
| YC-FUNC-STT-010 | Uptime ≥ 99.5%, failover | ❌ | Chưa có | Cần HA architecture cho STT |

#### 4.3. Nền tảng AI Ops

##### YC-FUNC-AIOPS-001: Thu thập và tiền xử lý dữ liệu

| Giai đoạn | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Data Ingestion (multi-source, streaming/batch, schema validation) | 🔶 | DGT service có data ingestion pattern (collectors, processors) | Cần generalize thành Data Ingestion framework |
| Data Cleaning (dedup, missing values, outlier) | ❌ | Chưa có | Cần Data Cleaning module |
| Data Transformation (format, feature engineering, normalization) | ❌ | Chưa có | Cần Data Transform pipeline |
| Anonymization (PII, tokenization, differential privacy) | 🔶 | AIWM PII module có regex detection | Cần: tokenization, differential privacy |

##### YC-FUNC-AIOPS-002: Quản trị và phiên bản hóa dữ liệu

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Data Versioning | ❌ | Chưa có | Cần DVC-like module |
| Data Lineage | ❌ | Chưa có | Cần lineage tracking |
| Data Catalog | ❌ | Chưa có | Cần metadata management |
| Access Control cho data | 🔶 | IAM RBAC + License per service | Cần: row-level, dataset-level access control |

##### YC-FUNC-AIOPS-003: Chuẩn bị dữ liệu huấn luyện

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Data Splitting (train/val/test, stratified, cross-validation) | ❌ | Chưa có | Cần module |
| Data Augmentation (text, audio) | ❌ | Chưa có | Cần module |
| Labeling (annotation tools, active learning) | ❌ | Chưa có | Cần Label Studio adapter |

##### YC-FUNC-AIOPS-004: Experiment Management

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Experiment Tracking | ❌ | Chưa có | Cần MLflow adapter hoặc native module |
| Hyperparameter Tuning | ❌ | Chưa có | Cần Optuna/Ray Tune adapter |
| Resource Management (GPU scheduling, priority queues) | 🔶 | AIWM Node + Resource module: GPU tracking, node status | Cần: scheduling logic, priority queues, fair sharing |

##### YC-FUNC-AIOPS-005: Model Training

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Distributed Training | ❌ | Chưa quản lý training process | Cần Training Job orchestrator |
| Checkpointing | ❌ | Chưa có | Cần checkpoint management |
| Early Stopping | ❌ | Chưa có | Cần training monitoring hooks |

##### YC-FUNC-AIOPS-006: Model Optimization

| Kỹ thuật | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Quantization (INT8/FP8) | ❌ | Chưa có | Cần Optimization Pipeline |
| Pruning | ❌ | Chưa có | Cần module |
| Distillation | ❌ | Chưa có | Cần module |
| LoRA/PEFT | ❌ | Chưa có | Cần PEFT adapter |

##### YC-FUNC-AIOPS-007: Model Registry

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Model Storage (versioned, compression, dedup) | 🔶 | AIWM Model: lưu trữ, status tracking | Chưa có: versioned artifacts, compression |
| Model Metadata (training config, metrics, dependencies) | 🔶 | AIWM Model: type, scope, provider | Chưa có: training config, performance metrics per version |
| Model Lineage (parent models, data version, code version) | ❌ | Chưa có | Cần lineage tracking |
| Model Promotion (staging/production/archived, approval) | 🔶 | AIWM Model: status lifecycle | Chưa có: formal approval workflow, staging concept |

##### YC-FUNC-AIOPS-008: Model Serving

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Inference Server (REST/gRPC, dynamic batching) | 🔶 | AIWM Deployment: endpoint management | Cần adapter cho Triton/TorchServe |
| Model Loading (lazy, caching, version switching) | 🔶 | AIWM Deployment: version tracking | Cần: lazy loading logic, model caching |
| Scaling (HPA, load-based, GPU monitoring) | ❌ | Chưa có auto-scaling | Cần K8s HPA integration |

##### YC-FUNC-AIOPS-009: Deployment Strategies

| Strategy | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Blue-Green | 🔶 | AIWM Deployment có concept blue-green | Cần: actual traffic switching logic |
| Canary | ❌ | Chưa có | Cần traffic splitting |
| A/B Testing | ❌ | Chưa có | Cần experiment framework |
| Shadow Mode | ❌ | Chưa có | Cần dual-running mechanism |

##### YC-FUNC-AIOPS-010: Model Monitoring

| Metric | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Prediction Latency (p95 < 500ms) | ❌ | Chưa có inference latency tracking | Cần metrics collector |
| Throughput (≥ target QPS) | ❌ | Chưa có | Cần metrics collector |
| Error Rate (< 0.1%) | 🔶 | Logging có nhưng chưa aggregate | Cần error rate dashboard |
| Resource Utilization (< 80%) | 🔶 | AIWM Node: system metrics | Cần real-time monitoring dashboard |

##### YC-FUNC-AIOPS-011: Data Drift Detection

| Loại drift | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Covariate Shift | ❌ | Chưa có | Cần statistical test module |
| Concept Drift | ❌ | Chưa có | Cần performance degradation monitoring |
| Label Drift | ❌ | Chưa có | Cần output distribution monitoring |

##### YC-FUNC-AIOPS-012: Model Retraining

| Trigger | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Scheduled | 🔶 | CBM Work: recurrence (daily/weekly/monthly) | Cần connect với Training Pipeline |
| Performance Degradation | ❌ | Chưa có trigger mechanism | Cần monitoring → alert → retrain pipeline |
| Data Drift | ❌ | Chưa có | Phụ thuộc drift detection |
| New Data Available | ❌ | Chưa có | Cần incremental training support |

##### YC-FUNC-AIOPS-013: Model Governance

| Chức năng | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Model Documentation (model cards, intended use) | ❌ | Chưa có model card format | Cần Model Card module |
| Audit Trail | ✅ | createdBy/updatedBy, timestamps trên toàn bộ entities | Đáp ứng cơ bản |
| Access Control | ✅ | IAM RBAC, License per service | Đáp ứng |

##### YC-FUNC-AIOPS-014: Bias và Fairness Monitoring

| Metric | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Demographic Parity | ❌ | Chưa có | Cần Fairness module |
| Equalized Odds | ❌ | Chưa có | Cần Fairness module |
| Disparate Impact (ratio ≥ 0.8) | ❌ | Chưa có | Cần Fairness module |

##### YC-FUNC-AIOPS-015: Explainability

| Kỹ thuật | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Feature Importance (SHAP, LIME) | ❌ | Chưa có | Cần Explainability module |
| Attention Visualization | ❌ | Chưa có | Cần integration |
| Counterfactual Explanations | ❌ | Chưa có | Cần integration |

---

### MỤC 5: YÊU CẦU PHI CHỨC NĂNG

#### 5.1. Hiệu năng và khả năng mở rộng

##### YC-NFR-PERF-001: Response Time

| Loại | Mục tiêu | Đánh giá | X-OR Stack AI | Ghi chú |
|---|---|:---:|---|---|
| API Call (Simple) | < 100ms (p95) | ✅ | NestJS + MongoDB đáp ứng cho CRUD APIs | Cần benchmark chính thức |
| API Call (Complex) | < 1s (p95) | 🔶 | Phụ thuộc query complexity | Cần optimize complex queries |
| Batch Processing | < 24h | 🔶 | BullMQ queue processing có | Cần benchmark |
| Model Inference | < 200ms (p95) | ❌ | Chưa có inference pipeline | Phụ thuộc Triton/TorchServe |

##### YC-NFR-PERF-002: Throughput

| Hệ thống | GĐ1 | Đánh giá | Ghi chú |
|---|---|:---:|---|
| Intelligent Assistant | 20 QPS | ❌ | Chưa có IA system |
| Speech-to-Text | 50 concurrent | ❌ | Chưa có STT system |
| Model Training | 1 concurrent job | 🔶 | AIWM có Execution, chưa test concurrent training |
| Batch Inference | 10,000 records/hour | ❌ | Chưa có batch inference |

##### YC-NFR-SCALE-001 đến 003: Scalability

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-NFR-SCALE-001 | Horizontal Scaling (K8s HPA, LB, DB replicas) | 🔶 | Microservices architecture hỗ trợ scaling | Chưa có K8s manifests, HPA config |
| YC-NFR-SCALE-002 | Vertical Scaling (CPU/RAM/GPU upgrade) | ⬜ | Hardware-level | Client quản lý |
| YC-NFR-SCALE-003 | Data Scaling (100TB→500TB→2PB) | ⬜ | Storage-level | Client quản lý |

#### 5.2. Bảo mật và tuân thủ

##### YC-NFR-SEC-001: Authentication

| Yêu cầu | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Multi-Factor Authentication | ❌ | Chưa có MFA | Cần TOTP/SMS OTP module |
| Password policy (≥12 chars, complexity, history 5, rotate 90d) | 🔶 | IAM: 8-15 chars, complexity check | Cần: ≥12 chars, history check, rotation enforcement |
| Session management (30min timeout, max 3 concurrent, HttpOnly) | 🔶 | JWT 1h expiry | Cần: idle timeout, concurrent session limit, cookie flags |
| Account lockout (5 attempts, 30min lock) | ❌ | Chưa có | Cần bổ sung vào IAM |

##### YC-NFR-SEC-002: Authorization

| Yêu cầu | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| RBAC (roles, permissions, least privilege) | ✅ | IAM: roles, org, license per service, guards | Đáp ứng |
| Data Access Control (row-level, column masking, ABAC) | ❌ | Chưa có fine-grained data access | Cần ABAC module |
| API Authorization (OAuth 2.0 scopes, resource-level) | 🔶 | JWT + RBAC per endpoint | Chưa có: OAuth scopes, resource-level permissions |

##### YC-NFR-SEC-003: Encryption

| Yêu cầu | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| At rest: AES-256, encrypted DB/FS | ❌ | Chưa cấu hình | Cần MongoDB encryption + FS encryption |
| In transit: TLS 1.3, cert pinning, VPN | 🔶 | HTTPS capable | Cần enforce TLS 1.3, cert management |
| Key management: HSM, rotation 12 months | ❌ | Chưa có KMS | Cần KMS integration |

##### YC-NFR-SEC-004: Audit Logging

| Yêu cầu | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|:---:|---|---|
| Events to log (auth, authz, data access, config, deployments) | 🔶 | createdBy/updatedBy, correlation ID | Chưa log: auth attempts, authz decisions chi tiết |
| Log content (timestamp, user, action, resource, result, IP) | 🔶 | Có cơ bản | Cần bổ sung source IP, result status |
| Log retention (1 năm online, 5 năm archived) | ❌ | Chưa có retention policy | Cần log management solution |
| Log protection (encrypted, integrity, access control) | ❌ | Chưa có | Cần immutable log storage |

#### 5.3. Tính sẵn sàng và độ tin cậy

##### YC-NFR-AVAIL-001 đến 003: Availability

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-NFR-AVAIL-001 | Production 99.5%, Training 99.0% | 🔶 | Microservices hỗ trợ HA | Chưa có: multi-instance deployment, health monitoring |
| YC-NFR-AVAIL-002 | HA Architecture (LB, 2+ instances, DB replication) | 🔶 | Architecture hỗ trợ | Chưa có: K8s deployment, DB replication config |
| YC-NFR-AVAIL-003 | DR (RTO < 4h, RPO < 1h, backup schedule) | ❌ | Chưa có DR plan | Cần backup strategy, DR config |

##### YC-NFR-REL-001 đến 003: Reliability

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-NFR-REL-001 | Error Handling (graceful degradation, retry, circuit breaker) | 🔶 | NestJS GlobalExceptionFilter, basic error handling | Chưa có: circuit breaker, retry with backoff |
| YC-NFR-REL-002 | Data Integrity (ACID, validation, checksums) | ✅ | MongoDB transactions, Mongoose validation, schema validation | Đáp ứng cơ bản |
| YC-NFR-REL-003 | Monitoring & Alerting thresholds | ❌ | Chưa có rule-based alerting | Cần Prometheus + Alertmanager |

##### YC-NFR-MAINT-001 đến 003: Maintainability

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-NFR-MAINT-001 | Code Quality (standards, review, testing ≥80%, docs) | 🔶 | TypeScript, NestJS patterns, Swagger docs | Chưa có: ≥80% test coverage, formal code review process |
| YC-NFR-MAINT-002 | Deployment (CI/CD, rollback, change management) | 🔶 | Nx build system | Chưa có: CI/CD pipeline, automated deployment |
| YC-NFR-MAINT-003 | Observability (logging, metrics, tracing, dashboards) | 🔶 | Structured logging, correlation ID | Chưa có: Prometheus metrics, Grafana dashboards, distributed tracing |

---

### MỤC 6: YÊU CẦU TÍCH HỢP

#### 6.1. Tích hợp hệ thống nội bộ

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-INT-001 | Tích hợp hệ thống quản lý văn bản | ❌ | Chưa có connector | Cần Document Integration module |
| YC-INT-002 | Tích hợp hệ thống quản lý hồ sơ | ❌ | Chưa có connector | Cần Case Management adapter |
| YC-INT-003 | Tích hợp Active Directory (LDAP, SAML, SSO) | ❌ | IAM tự quản lý user | Cần LDAP/SAML integration trong IAM |

#### 6.2. Tích hợp hệ thống bên ngoài

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-INT-004 | Tích hợp CSDL quốc gia (VPN, mTLS, IP whitelist) | ❌ | Chưa có | Cần secure connector module |
| YC-INT-005 | Tích hợp hệ thống giám sát mạng (Syslog, SNMP) | ❌ | Chưa có | Cần SIEM adapter |

#### 6.3. API và giao thức

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-INT-006 | REST API (RESTful, JSON, versioning) | ✅ | Toàn bộ services dùng REST + Swagger/OpenAPI | Đáp ứng |
| YC-INT-006 | GraphQL | ❌ | Chưa có | Cần nếu client yêu cầu |
| YC-INT-006 | gRPC (Protobuf, streaming, LB) | ❌ | Chưa có | Cần cho high-performance internal comms |
| YC-INT-007 | Data Formats (JSON, XML, Protobuf, Avro, Parquet) | 🔶 | JSON có | Chưa có: XML, Protobuf, Avro, Parquet |
| YC-INT-008 | Message Queue (Kafka/RabbitMQ, pub-sub, DLQ) | 🔶 | BullMQ (Redis-based) | BullMQ đủ cho use case hiện tại. Kafka nếu scale lớn |

---

### MỤC 7: YÊU CẦU VỀ DỮ LIỆU

#### 7.1. Thu thập và nguồn dữ liệu

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-DATA-001 | Nguồn dữ liệu nội bộ (văn bản, hồ sơ, email, ghi âm, logs) | ❌ | Chưa có data ingestion pipeline chung | Cần Data Ingestion framework |
| YC-DATA-002 | Nguồn bên ngoài (CSDL quốc gia, Internet, public datasets) | ❌ | Chưa có | Cần external data connector |

#### 7.2. Chất lượng dữ liệu

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-DATA-003 | Data Quality (accuracy ≥95%, completeness ≥90%) | ❌ | Chưa có data quality framework | Cần module |
| YC-DATA-004 | Data Cleaning (dedup, missing values, outliers) | ❌ | Chưa có | Cần module |

#### 7.3. Gán nhãn và chuẩn bị dữ liệu

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-DATA-005 | Data Labeling (annotation, active learning) | ❌ | Chưa có | Cần Label Studio integration |
| YC-DATA-006 | Data Annotation Tools | ❌ | Chưa có | Cần adapter cho Label Studio/Prodigy |
| YC-DATA-007 | Training Data Prep (splitting, augmentation, normalization) | ❌ | Chưa có | Cần Data Prep pipeline |

#### 7.4. Quản lý và bảo vệ dữ liệu

| Mã yêu cầu | Nội dung | Đánh giá | X-OR Stack AI | Khoảng cách |
|---|---|:---:|---|---|
| YC-DATA-008 | Data Governance (ownership, catalog, policies) | ❌ | Chưa có | Cần Data Governance module |
| YC-DATA-009 | Data Privacy (PII, anonymization, consent) | 🔶 | AIWM PII detection có | Cần: consent management, full anonymization |
| YC-DATA-010 | Data Security (encryption, access control, backup) | 🔶 | IAM RBAC có | Chưa có: data encryption at rest, backup policy |

---

### MỤC 8: TUÂN THỦ VÀ TIÊU CHUẨN

#### 8.1. Tiêu chuẩn kỹ thuật

| Mã yêu cầu | Tiêu chuẩn | Đánh giá | Ghi chú |
|---|---|:---:|---|
| YC-STD-001 | Hardware (ANSI/TIA-942, ISO/IEC 22237, ASHRAE) | ⬜ | Hardware/datacenter - client |
| YC-STD-002 | Software (ISO/IEC 25010, 12207, CMMI) | 🔶 | Codebase có cấu trúc, cần formal compliance |
| YC-STD-003 | AI/ML (ISO/IEC 22989, 23053, TR 24028, IEEE 7000) | ❌ | Chưa có formal AI standards compliance |

#### 8.2. Tiêu chuẩn bảo mật

| Mã yêu cầu | Tiêu chuẩn | Đánh giá | Ghi chú |
|---|---|:---:|---|
| YC-STD-004 | ISO 27001/27002/27017/27018/27701 | 🔶 | Có security controls cơ bản, chưa audit chính thức |
| YC-STD-005 | FIPS 140-2/3, NIST SP 800-57, 800-175B | ❌ | Chưa có cryptographic module validation |
| YC-STD-006 | ISO 27006, COBIT, SOC 2 | ⬜ | Audit framework - cần bên thứ ba |

#### 8.3. Quy định pháp lý Việt Nam

| Mã yêu cầu | Văn bản | Đánh giá | Ghi chú |
|---|---|:---:|---|
| YC-STD-007 | Luật An ninh mạng, Bảo vệ DLCN, NĐ 85/2016, NĐ 53/2022 | 🔶 | Có security framework cơ bản | Cần compliance mapping chi tiết |
| YC-STD-008 | TT 39/2017, QCVN 26:2016, QCVN 30:2017 | 🔶 | Cần đánh giá chi tiết | Cần compliance checklist |

#### 8.4. Quy định quốc tế (tham khảo)

| Mã yêu cầu | Framework | Đánh giá | Ghi chú |
|---|---|:---:|---|
| YC-STD-009 | EU AI Act (risk classification, transparency, human oversight) | ❌ | Chưa có formal AI governance | Tham khảo, không bắt buộc |
| YC-STD-010 | NIST AI RMF (govern, map, measure, manage) | ❌ | Chưa có AI risk management | Tham khảo, không bắt buộc |

---

### MỤC 9: KIỂM THỬ VÀ TIÊU CHÍ NGHIỆM THU

#### 9.1-9.2. Kiểm thử chức năng

##### Intelligent Assistant Test Cases

| Test Case | Mô tả | Đánh giá | X-OR Stack AI | Ghi chú |
|---|---|:---:|---|---|
| IA-TC-001 | Tra cứu văn bản (top 5, < 2s) | ❌ | Chưa có search system | Phụ thuộc RAG |
| IA-TC-002 | QA đa tài liệu (≥80%, citation) | ❌ | Chưa có QA system | Phụ thuộc RAG + LLM |
| IA-TC-003 | Tóm tắt văn bản (10-20% bản gốc) | ❌ | Chưa có | Phụ thuộc LLM |
| IA-TC-004 | Lập báo cáo theo template | ❌ | Chưa có | Phụ thuộc template engine |
| IA-TC-005 | Hội thoại ≥5 lượt, context | 🔶 | AIWM Conversation tracking có | Cần AI logic layer |

##### Speech-to-Text Test Cases

| Test Case | Mô tả | Đánh giá | Ghi chú |
|---|---|:---:|---|
| STT-TC-001 | Tiếng Việt chuẩn (WER ≤ 10%, RTF < 0.3) | ❌ | Hoàn toàn mới |
| STT-TC-002 | Giọng địa phương (WER ≤ 20%) | ❌ | Hoàn toàn mới |
| STT-TC-003 | Multi-speaker (DER ≤ 15%, 2-5 speakers) | ❌ | Hoàn toàn mới |
| STT-TC-004 | Môi trường ồn (WER ≤ 15%, SNR ≥ 10dB) | ❌ | Hoàn toàn mới |
| STT-TC-005 | Dấu câu tự động (≥85% accuracy) | ❌ | Hoàn toàn mới |

##### AI Ops Test Cases

| Test Case | Mô tả | Đánh giá | Ghi chú |
|---|---|:---:|---|
| AIOPS-TC-001 | Distributed training (no error, checkpoints) | ❌ | Chưa có training pipeline |
| AIOPS-TC-002 | Deploy model (zero-downtime, rollback) | 🔶 | AIWM Deployment có concept | Cần thực tế test |
| AIOPS-TC-003 | Model drift detection (>5% drop → alert) | ❌ | Chưa có drift detection |
| AIOPS-TC-004 | Data versioning (version, rollback) | ❌ | Chưa có data versioning |
| AIOPS-TC-005 | A/B testing (traffic split, metrics) | ❌ | Chưa có A/B testing |

#### 9.3. Kiểm thử phi chức năng

##### Performance Testing

| Test Case | Mô tả | Đánh giá | Ghi chú |
|---|---|:---:|---|
| PERF-TC-001 | Load test IA (100 users, p95 < 5s, error < 1%) | ❌ | Chưa có IA system |
| PERF-TC-002 | Load test STT (50 streams, RTF < 0.3) | ❌ | Chưa có STT system |
| PERF-TC-003 | Stress testing (breaking point, graceful degradation) | ❌ | Chưa test |
| PERF-TC-004 | Endurance testing (24h, no memory leak) | ❌ | Chưa test |
| PERF-TC-005 | Scalability testing (scale up/down) | ❌ | Chưa có K8s deployment |

##### Security Testing

| Test Case | Mô tả | Đánh giá | Ghi chú |
|---|---|:---:|---|
| SEC-TC-001 | Vulnerability scanning (no critical/high) | ❌ | Chưa scan |
| SEC-TC-002 | Penetration testing | ❌ | Chưa test |
| SEC-TC-003 | Authentication testing (MFA, session, lockout) | 🔶 | JWT works, MFA chưa có |
| SEC-TC-004 | Authorization testing (RBAC, no escalation) | 🔶 | RBAC works, chưa formal test |
| SEC-TC-005 | Encryption testing (at rest, in transit, keys) | ❌ | Chưa có encryption at rest |

##### Reliability Testing

| Test Case | Mô tả | Đánh giá | Ghi chú |
|---|---|:---:|---|
| REL-TC-001 | Failover (< 30s, no data loss) | ❌ | Chưa có HA setup |
| REL-TC-002 | Backup & restore (RTO < 4h, RPO < 1h) | ❌ | Chưa có backup strategy |
| REL-TC-003 | DR drill | ❌ | Chưa có DR plan |
| REL-TC-004 | Data integrity (checksums, ACID) | 🔶 | MongoDB có | Chưa formal test |

#### 9.4. Kiểm thử AI/ML

| Test Case | Mô tả | Đánh giá | Ghi chú |
|---|---|:---:|---|
| ML-TC-001 | Accuracy testing (target metrics, consistent) | ❌ | Chưa có model để test |
| ML-TC-002 | Bias testing (fairness metrics, demographics) | ❌ | Chưa có fairness module |
| ML-TC-003 | Robustness testing (adversarial, noisy input) | ❌ | Chưa có |
| ML-TC-004 | Explainability testing | ❌ | Chưa có |
| ML-TC-005 | Safety testing (harmful content, PII leak, hallucination) | 🔶 | AIWM Guardrail + PII có | Cần formal testing |

#### 9.5. Tiêu chí nghiệm thu

##### GĐ1 (Q2/2026)

| Hạng mục | Đánh giá | Ghi chú |
|---|:---:|---|
| Hạ tầng phần cứng (4-8 GPU, 100TB, 100Gbps) | ⬜ | Client mua sắm |
| Nền tảng AI Ops (MLOps pipeline, model registry, monitoring) | 🔶 | AIWM có nền tảng, cần mở rộng đáng kể |
| Intelligent Assistant (50 users, <5s, ≥80% accuracy) | ❌ | Cần phát triển mới |
| Speech-to-Text (WER ≤15%, real-time, 50 streams) | ❌ | Cần phát triển mới |
| Bảo mật (vuln scan, pentest, compliance) | 🔶 | Framework có, chưa audit |
| Tài liệu (user manuals, admin guides, API docs) | 🔶 | Swagger API docs có | Cần user/admin manuals |
| Đào tạo (10 admins, 50 users) | ⬜ | Quy trình vận hành |

##### GĐ2 (Q2/2027)

| Hạng mục | Đánh giá | Ghi chú |
|---|:---:|---|
| Hạ tầng huấn luyện (8 GPU B200, 500TB, InfiniBand) | ⬜ | Client mua sắm |
| Hạ tầng suy luận (16-32 GPU, 500-1000 users, ≥99.5%) | ⬜ | Client + ops |
| Foundation Model (7B-13B params, internal data) | ❌ | Chưa có training pipeline |
| Ứng dụng mở rộng (all GĐ1 features + integration + 500-1000 users) | ❌ | Phụ thuộc GĐ1 completion |
| Vận hành (24/7, IR < 1h, change mgmt) | ⬜ | Quy trình ops |

---

## PHẦN III: TỔNG HỢP THỐNG KÊ

### Thống kê theo ký hiệu đánh giá

| Ký hiệu | Số lượng | Tỷ lệ |
|:---:|:---:|:---:|
| ✅ Đã đáp ứng | 12 | ~8% |
| 🔶 Đáp ứng một phần | 55 | ~35% |
| ❌ Chưa có | 62 | ~40% |
| ⬜ Không thuộc phạm vi | 27 | ~17% |

### Thống kê theo nhóm chức năng (chỉ tính phần thuộc phạm vi SW)

| Nhóm | ✅ | 🔶 | ❌ | Tỷ lệ đáp ứng |
|---|:---:|:---:|:---:|:---:|
| IAM / Auth / RBAC | 4 | 6 | 4 | ~70% |
| AI Ops - Model Lifecycle | 2 | 8 | 6 | ~50% |
| AI Ops - Training Pipeline | 0 | 1 | 11 | ~5% |
| AI Ops - Monitoring | 0 | 4 | 6 | ~30% |
| AI Ops - Data Management | 0 | 2 | 10 | ~10% |
| Intelligent Assistant | 0 | 4 | 14 | ~15% |
| Speech-to-Text | 0 | 1 | 10 | ~5% |
| Security (application-level) | 2 | 8 | 8 | ~45% |
| Integration | 1 | 2 | 6 | ~25% |
| Testing & Acceptance | 0 | 4 | 18 | ~10% |

---

## PHẦN IV: KHUYẾN NGHỊ CHIẾN LƯỢC

### Lộ trình đề xuất (Roadmap)

#### Phase 0: Foundation (4 tuần)
- IAM hardening: MFA, account lockout, password policy upgrade, session management
- Rate limiting middleware
- Logging & monitoring foundation (Prometheus exporter, structured audit logs)
- TLS enforcement

#### Phase 1: AI Ops Core Enhancement (8 tuần)
- AIWM Model Registry mở rộng: versioning, lineage, model cards
- Experiment Tracking module (MLflow adapter)
- Training Job orchestrator (PyTorch DDP/DeepSpeed integration)
- Inference Server adapter (Triton/TorchServe)
- Model Monitoring module (latency, accuracy, drift detection)

#### Phase 2: RAG & Intelligent Assistant (8 tuần)
- Vector Database integration (Milvus/Qdrant)
- RAG Pipeline module (embedding, retrieval, reranking, generation)
- Dialog Manager + Intent Recognition
- Knowledge Base management
- Web Portal (chat interface)

#### Phase 3: Speech-to-Text (10 tuần)
- STT service mới (NestJS)
- Whisper/Wav2Vec2 integration
- Vietnamese fine-tuning pipeline
- Audio processing pipeline (noise reduction, diarization)
- Post-processing (punctuation, formatting)
- Real-time WebSocket streaming

#### Phase 4: Data Management & Governance (6 tuần)
- Data Pipeline framework (ingestion, cleaning, transformation)
- Data Versioning module
- Data Catalog
- Data Quality monitoring
- Annotation tool integration (Label Studio adapter)

#### Phase 5: Security & Compliance (4 tuần)
- SSO/SAML/OIDC integration
- Encryption at rest
- SIEM integration
- DLP module
- Compliance mapping (ISO 27001, Vietnam regulations)
- Security testing (vulnerability scan, pentest)

#### Phase 6: Scale & Production Readiness (4 tuần)
- Kubernetes deployment manifests + HPA
- CI/CD pipeline
- HA configuration (multi-instance, DB replication)
- DR plan + backup strategy
- Performance testing & optimization
- Documentation (admin guides, user manuals)

---

## PHẦN V: PHÂN TÍCH RỦI RO & THÁCH THỨC KỸ THUẬT

### Ký hiệu mức rủi ro

| Mức | Ý nghĩa | Hành động |
|:---:|---|---|
| 🔴 | Rất cao - Có thể gây thất bại nghiệm thu | Cần giải pháp đặc biệt, partner chuyên sâu, fallback plan |
| 🟠 | Cao - Ảnh hưởng tiến độ và chất lượng đáng kể | Cần lập kế hoạch ứng phó sớm, theo dõi liên tục |
| 🟡 | Trung bình - Có thể xử lý nếu lên kế hoạch tốt | Theo dõi, phân bổ resource hợp lý |

---

### RỦI RO 1: Speech-to-Text tiếng Việt 🔴

**Yêu cầu liên quan:** YC-FUNC-STT-002 → STT-010, STT-TC-001 → TC-005

**Mô tả thách thức:**

| Thách thức | Chi tiết | Tác động |
|---|---|---|
| **Model tiếng Việt chưa mature** | Whisper/Wav2Vec2 cho tiếng Việt WER vẫn cao hơn nhiều so với tiếng Anh. Thanh điệu (6 thanh), từ đồng âm, từ mượn làm tăng độ khó | Không đạt WER target → fail nghiệm thu |
| **WER ≤ 10% clean audio** | Đây là mức tương đương Google/Azure STT cho tiếng Anh - một ngưỡng rất cao cho tiếng Việt self-hosted | Yêu cầu model quality ngang commercial service |
| **WER ≤ 20% giọng địa phương** | Cần corpus ghi âm từ nhiều vùng miền (Bắc/Trung/Nam + phương ngữ). Hiện không có public dataset đủ lớn | Phụ thuộc 100% vào data BCA cung cấp |
| **Từ vựng chuyên ngành** | Thuật ngữ pháp lý, an ninh, hành chính không có trong bất kỳ pre-trained model nào | Cần custom vocabulary + domain adaptation |
| **Real-time < 500ms + 50 streams** | Streaming ASR trên self-hosted GPU cần optimization cực kỳ tốt | Cần GPU inference pipeline chuyên dụng |
| **Speaker Diarization** | Phân biệt 2-5 người nói trong lời khai, họp → DER ≤ 15% | Cần model diarization riêng, chưa có cho tiếng Việt |

**Phân tích xác suất và tác động:**
- Xác suất xảy ra: **Rất cao** (85-95%) - Chưa có precedent STT tiếng Việt đạt WER ≤ 10% self-hosted
- Tác động: **Rất cao** - STT là 1 trong 2 ứng dụng nghiệm thu GĐ1. Fail STT = fail 50% nghiệm thu

**Lý do rủi ro cao:**
1. Team hiện tại là NestJS/TypeScript backend - **không có expertise ML/Speech**
2. Fine-tuning ASR model cần **hàng nghìn giờ audio labeled data** - BCA có thể không sẵn sàng
3. Timeline 10 tuần cho toàn bộ STT pipeline là **rất lạc quan** cho cả team có kinh nghiệm
4. Testing với giọng địa phương cần **native speakers** từ nhiều vùng miền

**Chiến lược ứng phó:**

| Giải pháp | Chi tiết | Ưu tiên |
|---|---|:---:|
| **Partner với đơn vị STT chuyên sâu** | VinAI (ViSpeech), FPT AI (FPT.AI Speech), Zalo AI - các đơn vị đã có model tiếng Việt | P0 |
| **Dùng Whisper Large-v3 làm baseline** | Fine-tune trên domain data BCA thay vì train from scratch. Whisper tiếng Việt WER ~15-20% out-of-box | P0 |
| **Negotiate WER targets** | Đề xuất BCA: GĐ1 WER ≤ 15% clean (thay vì 10%), GĐ2 mới commit ≤ 10% | P0 |
| **Phased delivery** | GĐ1: batch transcription only. Real-time streaming GĐ2 | P1 |
| **Early data collection** | Yêu cầu BCA cung cấp sample audio sớm nhất để đánh giá baseline | P0 |
| **Fallback: API-based** | Nếu self-hosted không đạt, đề xuất hybrid: on-premise Whisper + post-processing | P2 |

---

### RỦI RO 2: Foundation Model Training Pipeline 🔴

**Yêu cầu liên quan:** YC-SW-AIOPS-003, YC-FUNC-AIOPS-004 → 006, AIOPS-TC-001

**Mô tả thách thức:**

| Thách thức | Chi tiết | Tác động |
|---|---|---|
| **Distributed training 7B-13B params** | Cần 8 GPU B200 chạy đồng bộ với PyTorch DDP/DeepSpeed/FSDP. Một config sai → training diverge, mất tuần | Không train được model → không có Foundation Model cho GĐ2 |
| **Expertise cực kỳ chuyên sâu** | Hiểu gradient accumulation, mixed precision (BF16/FP8), tensor parallelism, pipeline parallelism, ZeRO optimization | Rất ít người ở VN có kinh nghiệm này ở production level |
| **Chi phí GPU time cao** | Training 7B model cần ~1000-5000 GPU-hours. Config sai = burn budget | Vượt ngân sách hoặc thiếu thời gian retry |
| **Data preparation cho LLM** | Cần data pipeline: cleaning → dedup → tokenization → formatting (instruction-tuning format). Dữ liệu tiếng Việt/chuyên ngành cần xử lý đặc biệt | Garbage in, garbage out |
| **Checkpointing & Recovery** | Training run dài (tuần), nếu crash giữa chừng mà không có checkpoint đúng → restart từ đầu | Mất thời gian và chi phí |
| **Evaluation** | Benchmark cho Vietnamese LLM chưa standardized. Đánh giá chất lượng trên domain BCA cần human evaluation | Không biết model có tốt hay không |

**Phân tích xác suất và tác động:**
- Xác suất xảy ra: **Rất cao** (80-90%) - Chưa có kinh nghiệm trong team
- Tác động: **Cao** - Foundation Model là deliverable GĐ2, nhưng pipeline cần xây từ GĐ1

**Chiến lược ứng phó:**

| Giải pháp | Chi tiết | Ưu tiên |
|---|---|:---:|
| **Không train from scratch** | Fine-tune open model (Vistral, Qwen2, Llama 3) thay vì pretrain. Giảm 90% effort và rủi ro | P0 |
| **Thuê ML Engineer consultant** | 2-3 người có kinh nghiệm distributed training, engagement 6+ tháng | P0 |
| **X-OR đóng vai trò orchestrator** | AIWM quản lý lifecycle (register model, deploy, monitor). Training thực tế do ML team + tools (MLflow, DeepSpeed) handle | P0 |
| **Start với LoRA/QLoRA** | Fine-tune adapter trên base model, cần ít GPU time hơn 100x so với full training | P1 |
| **Cloud GPU cho prototyping** | Dùng cloud (Lambda Labs, RunPod) để test pipeline trước khi chạy trên B200 on-prem | P1 |
| **Xây evaluation framework sớm** | Benchmark suite cho Vietnamese + BCA domain trước khi training | P1 |

---

### RỦI RO 3: RAG Pipeline đạt Factual Correctness ≥ 95% 🔴

**Yêu cầu liên quan:** YC-FUNC-IA-002, YC-FUNC-IA-011, IA-TC-001 → TC-004

**Mô tả thách thức:**

| Thách thức | Chi tiết | Tác động |
|---|---|---|
| **95% factual correctness** | Ngay cả GPT-4 + RAG tốt nhất cũng khó đạt 95% consistently trên domain phức tạp | Fail nghiệm thu IA |
| **Embedding tiếng Việt** | Các embedding model (BGE, E5, Cohere) chủ yếu optimize cho tiếng Anh. Tiếng Việt: từ ghép, từ Hán-Việt, viết tắt chuyên ngành | Retrieval quality thấp → generation sai |
| **Văn bản pháp lý phức tạp** | Một điều luật tham chiếu 5-10 điều khác, viết theo thể thức hành chính, ngôn ngữ hình thức | Chunking sai → context sai → answer sai |
| **Hallucination** | LLM tạo thông tin không có trong source. Với domain pháp lý, một câu sai có thể gây hậu quả nghiêm trọng | Rủi ro uy tín và pháp lý |
| **Citation chính xác** | Trích dẫn đúng số hiệu văn bản, điều khoản, khoản, điểm | Cần NER + structured parsing cho văn bản VN |
| **100,000 documents** | Vector DB phải handle index lớn, retrieval vẫn nhanh < 1s | Scaling challenge |

**Phân tích xác suất và tác động:**
- Xác suất xảy ra: **Rất cao** (80-90%) - 95% accuracy trên domain mới là thách thức industry-wide
- Tác động: **Rất cao** - IA là 1 trong 2 ứng dụng nghiệm thu GĐ1

**Chiến lược ứng phó:**

| Giải pháp | Chi tiết | Ưu tiên |
|---|---|:---:|
| **Negotiate accuracy target** | Đề xuất: 80% GĐ1, 90% GĐ2, 95% sau 1 năm vận hành. 95% ngay từ đầu là unrealistic | P0 |
| **Multi-stage RAG** | Retrieval → Reranking → Generation → Fact-checking → Citation verification. Mỗi stage tăng accuracy | P0 |
| **Domain-specific embedding** | Fine-tune embedding model trên corpus pháp lý VN thay vì dùng generic | P1 |
| **Structured document parsing** | Parse văn bản pháp lý thành structured format (điều/khoản/điểm) trước khi chunk | P1 |
| **Human-in-the-loop** | Các câu trả lời confidence < threshold → flag cho cán bộ review. Đặt expectation rõ: AI hỗ trợ, không thay thế | P0 |
| **Guardrail: "Tôi không chắc chắn"** | LLM phải nói "không biết" thay vì hallucinate. AIWM Guardrail mở rộng cho use case này | P1 |
| **Iterative improvement** | Thu thập feedback từ 50 users GĐ1 → improve retrieval + generation | P2 |

---

### RỦI RO 4: Encryption at Rest + HSM/KMS 🟠

**Yêu cầu liên quan:** YC-SEC-DATA-001, YC-NFR-SEC-003, YC-STD-005

**Mô tả thách thức:**

| Thách thức | Chi tiết | Tác động |
|---|---|---|
| **MongoDB Encryption at Rest** | Native encryption cần MongoDB Enterprise (có phí license). Community Edition không hỗ trợ | Tăng chi phí hoặc cần alternative approach |
| **HSM (Hardware Security Module)** | Thiết bị chuyên dụng (Thales Luna, Entrust nShield) - đắt ($10K-50K+), cần expertise vận hành | Budget concern + hiring specialist |
| **KMS integration** | Key Management Service cần tích hợp với toàn bộ services. Key rotation 12 tháng → automated process | Complexity tăng đáng kể |
| **FIPS 140-2/3 validation** | Quy trình certification qua NIST - mất 6-18 tháng, chi phí $50K-200K+ | Có thể không kịp timeline |
| **Encryption performance impact** | Encrypt/decrypt mọi read/write → latency tăng 10-30% | Ảnh hưởng performance targets |

**Phân tích xác suất và tác động:**
- Xác suất xảy ra: **Cao** (70%) - Budget và timeline constraint
- Tác động: **Cao** - Fail security requirements = fail compliance audit

**Chiến lược ứng phó:**

| Giải pháp | Chi tiết | Ưu tiên |
|---|---|:---:|
| **LUKS/dm-crypt filesystem encryption** | Encrypt ở OS level thay vì DB level. Miễn phí, hoạt động với MongoDB Community | P0 |
| **Percona Server for MongoDB** | Fork miễn phí của MongoDB hỗ trợ encryption at rest (data-at-rest encryption via WiredTiger) | P0 |
| **SoftHSM cho development** | Dùng software HSM cho dev/test, hardware HSM chỉ cho production | P1 |
| **HashiCorp Vault** | Open-source KMS thay thế commercial HSM cho key management | P1 |
| **Clarify FIPS requirement** | Xác nhận với BCA: FIPS là bắt buộc hay "tham khảo"? Nếu tham khảo → giảm scope đáng kể | P0 |
| **Encryption cho sensitive fields only** | Không encrypt toàn bộ DB, chỉ encrypt fields nhạy cảm (PII, classified data) | P2 |

---

### RỦI RO 5: SSO/SAML/OIDC + AD Integration 🟠

**Yêu cầu liên quan:** YC-SEC-SYS-002, YC-INT-003, YC-NFR-SEC-001

**Mô tả thách thức:**

| Thách thức | Chi tiết | Tác động |
|---|---|---|
| **AD của BCA là isolated** | Mạng nội bộ BCA không kết nối internet, AD có thể có custom schema, không standard | Không thể dev/test trước khi access thật |
| **SAML 2.0 complexity** | SAML assertion parsing, certificate management, metadata exchange - complex protocol | Dev time + testing effort lớn |
| **IAM refactor** | Hiện tại IAM quản lý user tự chứa (MongoDB). Federated identity cần dual-mode: local + AD | Breaking change trong IAM architecture |
| **MFA triển khai** | TOTP/SMS OTP cho environment không có internet → TOTP only. Cần app authenticator | User onboarding complexity |
| **Session management** | 30 phút idle timeout + max 3 concurrent sessions + HttpOnly cookies → khác hoàn toàn JWT stateless hiện tại | Cần session store (Redis), refactor auth flow |
| **Account lockout** | 5 failed attempts → 30 phút lock. Cần rate tracking per user | Cần Redis-based rate limiter cho auth |

**Phân tích xác suất và tác động:**
- Xác suất xảy ra: **Cao** (70-80%) - Phụ thuộc bên thứ ba (BCA IT team)
- Tác động: **Cao** - Authentication là gate-keeper, fail = không ai dùng được system

**Chiến lược ứng phó:**

| Giải pháp | Chi tiết | Ưu tiên |
|---|---|:---:|
| **Dual-mode IAM** | Support cả local auth (hiện tại) và federated (SAML/OIDC). Toggle per deployment | P0 |
| **Keycloak** | Open-source Identity Provider, hỗ trợ SAML, OIDC, LDAP, MFA out-of-box. Đặt trước IAM service | P0 |
| **Mock AD cho development** | Setup test AD (FreeIPA/Samba AD) để dev/test trước khi access BCA AD | P0 |
| **MFA: TOTP first** | Dùng Google Authenticator/FreeOTP. Không cần SMS (BCA không có internet) | P1 |
| **Redis session store** | Migrate từ stateless JWT sang JWT + Redis session tracking cho concurrent limit và idle timeout | P1 |
| **Phased rollout** | GĐ1: local auth + MFA. GĐ2: AD integration + SSO | P1 |

---

### RỦI RO 6: Data Drift Detection + Model Monitoring 🟠

**Yêu cầu liên quan:** YC-FUNC-AIOPS-010 → 012, YC-SW-AIOPS-005, AIOPS-TC-003

**Mô tả thách thức:**

| Thách thức | Chi tiết | Tác động |
|---|---|---|
| **Chicken-and-egg** | Cần model production → mới có data để detect drift. Cần drift detection → mới accept model vào production | Blocker cho nghiệm thu AIOPS-TC-003 |
| **NLP drift detection khó** | Text data không có fixed feature distribution. Drift trên embedding space → high-dimensional statistical tests | Research-grade problem, chưa có standard tool |
| **Baseline establishment** | Cần collect production data 2-4 tuần trước khi có ý nghĩa thống kê cho baseline | Timeline delay |
| **False positive alerts** | Statistical tests quá sensitive → alert fatigue. Quá loose → miss real drift | Tuning threshold cần domain expertise |
| **Real-time vs batch** | Monitor latency/error real-time OK. Monitor accuracy drift cần batch evaluation với ground truth | Cần annotation pipeline cho ground truth labels |

**Phân tích xác suất và tác động:**
- Xác suất xảy ra: **Trung bình** (60%) - Có thể phần nào address với simplified approach
- Tác động: **Cao** - Model monitoring là yêu cầu core của AI Ops

**Chiến lược ứng phó:**

| Giải pháp | Chi tiết | Ưu tiên |
|---|---|:---:|
| **2-tier monitoring** | Tier 1 (real-time): latency, error rate, throughput - dễ implement. Tier 2 (batch): accuracy, drift - phức tạp hơn | P0 |
| **Evidently AI** | Open-source library cho data/model drift detection. Python-based, tích hợp Prometheus | P1 |
| **Proxy metrics** | Thay vì đo accuracy trực tiếp, monitor proxy: user feedback (thumbs up/down), response length, retrieval relevance score | P1 |
| **Scheduled evaluation** | Weekly/monthly evaluation trên curated test set thay vì continuous drift detection | P1 |
| **Human review sampling** | Random sample 5% responses cho human review → tính accuracy | P2 |
| **Alert on operational metrics first** | P95 latency > 2x baseline, error rate > 1%, GPU util > 90% → trigger investigation | P0 |

---

### RỦI RO 7: HA/DR Uptime 99.5% + RTO < 4h 🟠

**Yêu cầu liên quan:** YC-NFR-AVAIL-001 → 003, REL-TC-001 → TC-003

**Mô tả thách thức:**

| Thách thức | Chi tiết | Tác động |
|---|---|---|
| **Single instance hiện tại** | Mỗi service chạy 1 instance, MongoDB single node. 1 crash = toàn bộ system down | 0% HA hiện tại |
| **K8s chưa có** | Không có container orchestration. Cần setup K8s cluster + GPU operator + networking | Nền tảng cho HA chưa tồn tại |
| **MongoDB Replica Set** | Cần tối thiểu 3 nodes (primary + secondary + arbiter). Hiện chỉ có 1 | Gấp 3 DB infrastructure |
| **DR warm standby** | Cần replica toàn bộ system ở site khác → gấp đôi hardware + sync mechanism | Budget rất lớn |
| **Failover < 30s** | Automatic failover cần health check + pod restart + connection drain. 30s là tight cho stateful services | Cần tuning extensive |
| **RPO < 1h** | Continuous backup/replication. MongoDB oplog sync + file backup | Network bandwidth giữa DC → DR site |
| **Quarterly DR drills** | Simulate failure, failover to DR, failback → cần plan + people + downtime window | Operational overhead |

**Phân tích xác suất và tác động:**
- Xác suất xảy ra: **Trung bình** (60%) - Achievable nhưng cần đầu tư lớn
- Tác động: **Rất cao** - System down trong demo/nghiệm thu = thất bại

**Chiến lược ứng phó:**

| Giải pháp | Chi tiết | Ưu tiên |
|---|---|:---:|
| **K8s deployment ASAP** | Đây là prerequisite cho mọi thứ. Dockerize → K8s manifests → basic HA | P0 |
| **MongoDB Replica Set** | 3-node minimum. Setup early, test failover | P0 |
| **Health check endpoints** | Mỗi service đã có /health. Cần: liveness + readiness probes cho K8s | P0 |
| **Redis Sentinel/Cluster** | Redis cũng cần HA cho BullMQ queues | P1 |
| **Start với 99.0%** | Negotiate: 99.0% GĐ1 (87.6h downtime OK), 99.5% GĐ2 | P0 |
| **Backup automation** | Mongodump scheduled + incremental (oplog). Test restore monthly | P1 |
| **DR simplified** | GĐ1: cold standby (backup restore). GĐ2: warm standby (async replication) | P1 |

---

### CÁC RỦI RO MỨC TRUNG BÌNH 🟡

#### Rủi ro 8: Bias & Fairness (YC-SEC-AI-003, YC-FUNC-AIOPS-014)

| Khía cạnh | Chi tiết |
|---|---|
| **Thách thức** | Không có benchmark dataset cho fairness trong context VN. Demographic parity/equalized odds cần protected attributes → BCA data có thể không label |
| **Xác suất** | Trung bình (50%) |
| **Tác động** | Trung bình - Nghiệm thu có ML-TC-002 nhưng criteria còn mở |
| **Ứng phó** | Xây simple bias check: test model trên các nhóm tuổi/giới/vùng miền. Document limitations trong model card. Đề xuất BCA cung cấp fairness criteria cụ thể |

#### Rủi ro 9: A/B Testing + Canary Deployment (YC-FUNC-AIOPS-009)

| Khía cạnh | Chi tiết |
|---|---|
| **Thách thức** | Traffic splitting cần service mesh (Istio) hoặc custom proxy. Phức tạp infrastructure, cần K8s mature |
| **Xác suất** | Trung bình (50%) |
| **Tác động** | Trung bình - AIOPS-TC-005 trong nghiệm thu |
| **Ứng phó** | GĐ1: Blue-green deployment only (AIWM đã có concept). A/B testing implement ở application level (route % users in code). Full traffic splitting GĐ2 khi K8s mature |

#### Rủi ro 10: Data Versioning + Lineage (YC-FUNC-AIOPS-002)

| Khía cạnh | Chi tiết |
|---|---|
| **Thách thức** | DVC-like system cho dataset hàng TB. Git-based versioning không scale. Custom solution cần significant dev |
| **Xác suất** | Trung bình (50%) |
| **Tác động** | Trung bình - AIOPS-TC-004 trong nghiệm thu |
| **Ứng phó** | Integrate DVC (open-source) cho versioning. AIWM thêm Dataset entity track metadata (version, size, lineage, location). Storage: S3-compatible (MinIO on-prem) |

#### Rủi ro 11: SIEM Integration (YC-SEC-MON-001)

| Khía cạnh | Chi tiết |
|---|---|
| **Thách thức** | Phụ thuộc SIEM solution BCA đang dùng/sẽ mua. Mỗi vendor (Splunk, QRadar, ELK) có format và connector khác |
| **Xác suất** | Thấp-Trung bình (40%) |
| **Tác động** | Trung bình - Security compliance |
| **Ứng phó** | Output logs ở standard format (JSON, Syslog RFC 5424). Implement log shipping agent (Fluent Bit) - works with any SIEM. Defer specific SIEM connector đến khi biết BCA chọn gì |

#### Rủi ro 12: Test Coverage ≥ 80% (YC-NFR-MAINT-001)

| Khía cạnh | Chi tiết |
|---|---|
| **Thách thức** | Codebase hiện tại coverage thấp. Retrofit tests cho existing code tốn thời gian, dễ bị deprioritize khi deadline gấp |
| **Xác suất** | Cao (70%) |
| **Tác động** | Trung bình - Code quality audit |
| **Ứng phó** | Enforce coverage cho new code (≥80% rule). Prioritize test cho critical paths: auth, model deployment, data pipeline. Dùng Jest + NestJS testing utilities (đã có setup). Nếu cần, negotiate: ≥60% GĐ1, ≥80% GĐ2 |

---

### Ma trận Rủi ro Tổng hợp

```
                            TÁC ĐỘNG
              Thấp      Trung bình      Cao        Rất cao
           ┌──────────┬─────────────┬──────────┬──────────────┐
    Rất    │          │     12      │   4, 5   │   1, 2, 3    │
    Cao    │          │             │          │              │
           ├──────────┼─────────────┼──────────┼──────────────┤
 X  Cao    │          │   9, 10     │   6, 8   │      7       │
 Á         ├──────────┼─────────────┼──────────┼──────────────┤
 C  T.bình │          │     11      │          │              │
 S         ├──────────┼─────────────┼──────────┼──────────────┤
 U  Thấp   │          │             │          │              │
 Ấ         └──────────┴─────────────┴──────────┴──────────────┘
 T

    1 = STT tiếng Việt               7 = HA/DR 99.5%
    2 = Foundation Model Training     8 = Bias & Fairness
    3 = RAG 95% Accuracy              9 = A/B Testing
    4 = Encryption/HSM               10 = Data Versioning
    5 = SSO/AD Integration           11 = SIEM Integration
    6 = Drift Detection              12 = Test Coverage
```

---

### Tổng hợp chiến lược ứng phó theo nhóm

#### Nhóm A: Cần Partner/Thuê chuyên gia (Rủi ro 1, 2, 3)

| Hành động | Timeline | Responsible |
|---|---|---|
| Identify và liên hệ partner STT (VinAI/FPT AI/Zalo AI) | Tuần 1-2 | PM + Tech Lead |
| Tuyển/thuê 2-3 ML Engineers có kinh nghiệm distributed training | Tuần 1-4 | HR + Tech Lead |
| Negotiate accuracy targets với BCA (STT WER, IA accuracy) | Tuần 1-2 | PM + BD |
| Yêu cầu BCA cung cấp sample data (audio, văn bản) sớm | Tuần 1 | PM |
| Setup evaluation framework (benchmark Vietnamese NLP/STT) | Tuần 3-6 | ML Team |

#### Nhóm B: Cần khảo sát thực tế BCA (Rủi ro 4, 5, 11)

| Hành động | Timeline | Responsible |
|---|---|---|
| Khảo sát AD infrastructure BCA (version, schema, network) | Trước ký HĐ | Tech Lead |
| Xác nhận FIPS/HSM requirement: bắt buộc hay tham khảo? | Trước ký HĐ | PM + Legal |
| Xác nhận SIEM solution BCA đang dùng | Trước ký HĐ | Tech Lead |
| Mock environment cho dev/test (FreeIPA, SoftHSM) | Tuần 1-4 | DevOps |

#### Nhóm C: Cần đầu tư infrastructure (Rủi ro 7)

| Hành động | Timeline | Responsible |
|---|---|---|
| Dockerize toàn bộ services | Tuần 1-2 | DevOps + Dev |
| Setup K8s cluster (dev/staging) | Tuần 2-4 | DevOps |
| MongoDB Replica Set (3 nodes) | Tuần 2-4 | DevOps |
| Redis Sentinel/Cluster | Tuần 3-4 | DevOps |
| CI/CD pipeline (GitHub Actions/GitLab CI) | Tuần 4-6 | DevOps |
| Backup automation + test restore | Tuần 4-6 | DevOps |

#### Nhóm D: Có thể xử lý nội bộ (Rủi ro 6, 8, 9, 10, 12)

| Hành động | Timeline | Responsible |
|---|---|---|
| Implement operational monitoring (latency, error rate) vào AIWM | Phase 1 | Dev Team |
| Integrate DVC cho data versioning | Phase 4 | Dev Team |
| Blue-green deployment hoàn thiện trong AIWM | Phase 1 | Dev Team |
| Enforce test coverage rule cho new code | Ngay lập tức | Dev Team |
| Simple bias check framework | Phase 1 | Dev + ML Team |

---

### Risk Register - Theo dõi liên tục

| # | Rủi ro | Mức | Owner | Status | Review Date | Notes |
|---|---|:---:|---|---|---|---|
| 1 | STT tiếng Việt | 🔴 | Tech Lead + ML Partner | Open | Weekly | Cần partner ASAP |
| 2 | Foundation Model Training | 🔴 | ML Team Lead | Open | Weekly | Cần hire ML Engineers |
| 3 | RAG 95% Accuracy | 🔴 | Tech Lead | Open | Weekly | Negotiate targets |
| 4 | Encryption/HSM | 🟠 | DevOps Lead | Open | Bi-weekly | Clarify FIPS requirement |
| 5 | SSO/AD Integration | 🟠 | IAM Dev | Open | Bi-weekly | Cần khảo sát BCA |
| 6 | Drift Detection | 🟠 | Dev Team | Open | Monthly | After model deployed |
| 7 | HA/DR 99.5% | 🟠 | DevOps Lead | Open | Bi-weekly | K8s first |
| 8 | Bias & Fairness | 🟡 | ML Team | Open | Monthly | After model trained |
| 9 | A/B Testing | 🟡 | Dev Team | Open | Monthly | After K8s ready |
| 10 | Data Versioning | 🟡 | Dev Team | Open | Monthly | Phase 4 |
| 11 | SIEM Integration | 🟡 | DevOps | Open | Monthly | After SIEM confirmed |
| 12 | Test Coverage | 🟡 | Dev Team | Open | Bi-weekly | Start now |

---

*Tài liệu này là kết quả phân tích nội bộ của team X-OR Stack AI, dùng để đánh giá mức độ sẵn sàng khi tham gia dự án H05 - Bộ Công An.*
