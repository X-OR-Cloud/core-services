# Metrics Module - Overview

**Version**: 1.0
**Date**: 2026-01-14
**Status**: Draft - Pending Review

---

## 📋 Table of Contents

1. [Introduction](#introduction)
2. [Business Requirements](#business-requirements)
3. [Technical Goals](#technical-goals)
4. [Module Architecture](#module-architecture)
5. [Related Documents](#related-documents)

---

## 1. Introduction

### 1.1 Purpose

Metrics Module là hệ thống thu thập, lưu trữ và phân tích dữ liệu time-series cho toàn bộ infrastructure và workload của nền tảng AIWM. Module này cung cấp foundation cho monitoring, alerting, analytics, và capacity planning.

### 1.2 Scope

**✅ In Scope (MVP):**
- Thu thập metrics từ Nodes (CPU, RAM, GPU, Disk, Network)
- Thu thập metrics từ Resources (Container/VM resource usage)
- Thu thập metrics từ Deployments (Inference performance)
- Lưu trữ time-series data với multiple aggregation levels
- REST API để query metrics
- Push API cho nodes/VMs định kỳ đẩy metrics về
- Automatic data retention và cleanup
- Basic dashboard data aggregation

**❌ Out of Scope (Phase 2+):**
- Real-time streaming metrics (WebSocket push to frontend)
- Alerting engine (Alert Module - separate)
- Custom dashboard builder (Dashboard Module - separate)
- Anomaly detection (ML-based)
- Predictive analytics
- Integration với Prometheus/Grafana
- Metrics export (OpenTelemetry format)

### 1.3 Key Benefits

1. **Historical Analysis**: Phân tích xu hướng sử dụng tài nguyên theo thời gian
2. **Performance Monitoring**: Track inference latency, throughput, error rates
3. **Cost Tracking**: Tổng hợp token usage và cost theo deployment/time period
4. **Capacity Planning**: Dự đoán nhu cầu tài nguyên tương lai dựa trên trends
5. **Troubleshooting**: Debug performance issues bằng historical data
6. **Compliance**: Audit trail cho resource usage

---

## 2. Business Requirements

### 2.1 User Stories

**As a Platform Administrator:**
- Tôi muốn xem CPU/RAM/GPU usage của tất cả nodes theo thời gian để identify bottlenecks
- Tôi muốn track disk space usage để plan storage capacity
- Tôi muốn monitor network traffic để optimize bandwidth
- Tôi muốn tạo reports về system health cho management

**As a DevOps Engineer:**
- Tôi muốn track container resource usage để optimize resource allocation
- Tôi muốn analyze deployment performance metrics để tune configurations
- Tôi muốn receive historical data via API để integrate với monitoring tools

**As a Product Owner:**
- Tôi muốn track inference request counts và token usage để calculate costs
- Tôi muốn analyze model performance trends để improve service quality
- Tôi muốn generate monthly/quarterly reports về platform usage

**As a Node Operator:**
- Hệ thống của tôi (node/VM) cần push metrics lên server định kỳ
- Tôi muốn API endpoint đơn giản để gửi batch metrics

### 2.2 Data Collection Requirements

#### Node Metrics (Push by Node Daemon)
- **Collection Interval**: 1 minute (configurable)
- **Push Method**: HTTP POST to `/metrics/push/node`
- **Retention**: Raw data 7 days, aggregated data up to 365 days

#### Resource Metrics (Push by Container Runtime)
- **Collection Interval**: 5 minutes (configurable)
- **Push Method**: HTTP POST to `/metrics/push/resource`
- **Retention**: Raw data 7 days, aggregated data up to 90 days

#### Deployment Metrics (Calculated by AIWM)
- **Collection Interval**: 5 minutes (from Execution logs)
- **Collection Method**: Internal aggregation from Execution collection
- **Retention**: Aggregated data up to 90 days

---

## 3. Technical Goals

### 3.1 Performance Requirements

- **Write Throughput**: Hỗ trợ 1000+ metric pushes/minute
- **Query Latency**: < 500ms for time-range queries (up to 30 days)
- **Storage Efficiency**: Efficient aggregation và data retention policies
- **Scalability**: Support 100+ nodes và 500+ resources

### 3.2 Data Quality Requirements

- **Accuracy**: Metrics phải accurate đến 2 decimal places
- **Completeness**: Handle missing data points (gaps in time-series)
- **Consistency**: Timestamps phải consistent (UTC timezone)
- **Integrity**: Validate metrics data before storage

### 3.3 Security Requirements

- **Authentication**: All push endpoints require JWT authentication
- **Authorization**: Role-based access (nodes can only push their own metrics)
- **Data Isolation**: Metrics isolated by orgId
- **Audit Trail**: Log all metric push operations

---

## 4. Module Architecture

### 4.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      AIWM Service                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Metrics Module                            │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │                                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │   Push API   │  │  Query API   │  │ Aggregator  │ │ │
│  │  │              │  │              │  │  (BullMQ)   │ │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │ │
│  │         │                  │                  │        │ │
│  │         └──────────────────┼──────────────────┘        │ │
│  │                            │                           │ │
│  │                     ┌──────▼──────┐                    │ │
│  │                     │   Service   │                    │ │
│  │                     │    Layer    │                    │ │
│  │                     └──────┬──────┘                    │ │
│  │                            │                           │ │
│  │                     ┌──────▼──────┐                    │ │
│  │                     │  MongoDB    │                    │ │
│  │                     │ Collection  │                    │ │
│  │                     │  (metrics)  │                    │ │
│  │                     └─────────────┘                    │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘

External Systems:
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Node    │─push──► │  AIWM    │         │ Frontend │
│  Daemon  │         │ Metrics  │ ◄─query─│   App    │
└──────────┘         │   API    │         └──────────┘
                     └──────────┘
┌──────────┐               │
│Container │─push──────────┘
│ Runtime  │
└──────────┘
```

### 4.2 Components

#### 4.2.1 Push API Controller
- Receive metrics from external systems (nodes, containers)
- Validate incoming data
- Authenticate requests (JWT)
- Store raw metrics to MongoDB

#### 4.2.2 Query API Controller
- Provide REST endpoints for querying metrics
- Support time-range filters
- Support aggregation (avg, sum, min, max)
- Return paginated results

#### 4.2.3 Metrics Service
- Core business logic for metrics management
- Data validation and normalization
- Query optimization
- Integration với BaseService for RBAC

#### 4.2.4 Aggregation Worker (BullMQ)
- Periodic aggregation jobs (1min → 5min → 1hour → 1day)
- Data retention cleanup
- Statistics calculation
- Scheduled via cron

#### 4.2.5 Metrics Schema (MongoDB)
- Time-series optimized schema
- Compound indexes for fast queries
- TTL indexes for automatic cleanup

---

## 5. Related Documents

### 5.1 Design Documents
- [02-schema-design.md](./02-schema-design.md) - Entity schemas và database design
- [03-api-design.md](./03-api-design.md) - REST API endpoints và contracts
- [04-aggregation-strategy.md](./04-aggregation-strategy.md) - Data aggregation và retention
- [05-implementation-plan.md](./05-implementation-plan.md) - Development roadmap

### 5.2 Related Modules
- **Node Module** - Source of node hardware metrics
- **Resource Module** - Source of container/VM metrics
- **Deployment Module** - Source of inference metrics
- **Execution Module** - Source of workflow execution metrics
- **Reports Module** - Consumer of aggregated metrics data

### 5.3 External References
- [AIWM Service README](../../services/aiwm/README.md)
- [Kaisar AI Ops Overview](../KAISAR-AI-OPS-OVERVIEW.md)
- [Template Service Guide](../TEMPLATE-SERVICE-UPGRADE.md)

---

## 6. Success Criteria

### 6.1 Functional Requirements
- ✅ Nodes có thể push metrics mỗi phút via API
- ✅ Frontend có thể query metrics với time-range filters
- ✅ Metrics được aggregated tự động theo schedule
- ✅ Old metrics được cleanup tự động (TTL)
- ✅ API responses < 500ms cho 30-day queries

### 6.2 Non-Functional Requirements
- ✅ 99% uptime cho metric collection
- ✅ Zero data loss trong push pipeline
- ✅ Storage growth < 10GB/month cho 100 nodes
- ✅ Backward compatible với existing modules

---

## 7. Timeline Estimate

| Phase | Tasks | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | Schema design, basic push API | 3 days | None |
| **Phase 2** | Query API, service layer | 3 days | Phase 1 |
| **Phase 3** | Aggregation worker, retention | 2 days | Phase 2 |
| **Phase 4** | Testing, optimization | 2 days | Phase 3 |
| **Total** | **MVP Complete** | **10 days** | |

---

## 8. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Storage explosion | High | Medium | Implement aggressive TTL, efficient aggregation |
| Query performance degradation | High | Medium | Proper indexing, query optimization, pagination |
| Missing data points | Medium | High | Handle gaps gracefully, interpolation optional |
| Network failures in push | Low | Medium | Retry logic in node daemon, buffering |
| Schema changes breaking compatibility | Medium | Low | Versioned schemas, migration scripts |

---

## 9. Open Questions

**For Review:**
1. Có cần support real-time WebSocket streaming metrics không? (Suggest: Phase 2)
2. Có cần metrics cho individual LLM requests không hay chỉ aggregated? (Suggest: Aggregated only)
3. Có cần export metrics sang Prometheus format không? (Suggest: Phase 2)
4. Retention policy có phù hợp không? (Current: 7d raw, 90d aggregated)
5. Push interval 1 minute có quá frequent không? (Alternative: 5 minutes)

---

**Next Steps:**
1. ✅ Review document này
2. ⏳ Review [Schema Design](./02-schema-design.md)
3. ⏳ Review [API Design](./03-api-design.md)
4. ⏳ Approve và create implementation plan
