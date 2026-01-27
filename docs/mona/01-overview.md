# MONA Service - Overview

**Service Name**: MONA (MONitoring & Alerting)
**Version**: 2.0
**Date**: 2026-01-27
**Status**: Design Specification

---

## 📋 Table of Contents

1. [Introduction](#introduction)
2. [Service Information](#service-information)
3. [Business Requirements](#business-requirements)
4. [Technical Goals](#technical-goals)
5. [Architecture](#architecture)
6. [Related Documents](#related-documents)

---

## 1. Introduction

### 1.1 Purpose

**MONA** (MONitoring & Alerting) là một **independent microservice** trong Hydrabyte monorepo, cung cấp centralized platform cho metrics collection, time-series storage, data aggregation, và alerting cho toàn bộ platform ecosystem.

MONA được thiết kế để serve metrics cho **multiple services** trong monorepo (AIWM, IAM, CBM, NOTI), không chỉ riêng AIWM.

### 1.2 Scope

**✅ In Scope (MVP):**
- Centralized metrics collection từ multiple sources
  - AIWM: Node metrics (CPU, RAM, GPU, Disk, Network)
  - AIWM: Resource metrics (Container/VM usage)
  - AIWM: Deployment metrics (Inference performance)
  - Future: IAM metrics (user activity, authentication events)
  - Future: CBM metrics (business operations)
  - Future: NOTI metrics (notification delivery)
- Time-series data storage với multi-level aggregation
- REST API cho metrics push và query
- Automatic data retention và cleanup
- Alert rule evaluation engine
- Frontend-driven metadata aggregation (decoupled from entity services)

**❌ Out of Scope (Phase 2+):**
- Real-time streaming metrics (WebSocket)
- Alert delivery (delegated to NOTI service)
- Custom dashboard builder
- Anomaly detection (ML-based)
- Predictive analytics
- Integration với Prometheus/Grafana
- Metrics export (OpenTelemetry format)

### 1.3 Key Benefits

1. **Centralized Observability**: Single source of truth cho metrics across all services
2. **Service Independence**: Decoupled from business logic services
3. **Scalability**: Independent scaling cho metrics workload
4. **Historical Analysis**: Track trends và patterns over time
5. **Alerting Foundation**: Rule-based alert triggering
6. **Cost Tracking**: Aggregate usage và costs across platform

---

## 2. Service Information

### 2.1 Service Details

| Property | Value |
|----------|-------|
| **Service Name** | MONA |
| **Full Name** | MONitoring & Alerting |
| **Port** | 3004 |
| **Database** | `core_mona` |
| **Repository Path** | `services/mona/` |
| **Type** | Independent Microservice |

### 2.2 Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: MongoDB (time-series optimized)
- **Queue**: BullMQ (Redis-backed)
- **Authentication**: JWT (via IAM service)
- **API Style**: REST + Swagger documentation

### 2.3 Service Dependencies

**Runtime Dependencies**:
- **IAM Service**: User authentication (JWT validation)
- **Redis**: BullMQ job queue, distributed locking
- **MongoDB**: Metrics storage

**Consumers** (services that push metrics):
- AIWM: Node, Resource, Deployment metrics
- IAM: User activity metrics (future)
- CBM: Business metrics (future)
- NOTI: Notification delivery metrics (future)

**Data Consumers** (services that query metrics):
- Frontend applications
- Dashboard services
- Reporting systems

---

## 3. Business Requirements

### 3.1 User Stories

**As a Platform Administrator:**
- Tôi muốn monitor resource usage across all nodes và services
- Tôi muốn track system health metrics centrally
- Tôi muốn receive alerts when resources exceed thresholds
- Tôi muốn generate platform-wide usage reports

**As a DevOps Engineer:**
- Tôi muốn integrate metrics từ multiple services vào single dashboard
- Tôi muốn query historical metrics via API
- Tôi muốn configure alert rules cho critical metrics

**As a Service Developer:**
- Hệ thống của tôi (AIWM, IAM, CBM) cần push metrics easily
- Tôi muốn API endpoint đơn giản để gửi metrics
- Tôi muốn frontend tự fetch entity metadata (decoupled design)

### 3.2 Data Collection Requirements

#### Node Metrics (from AIWM)
- **Collection Interval**: 1 minute
- **Push Method**: HTTP POST to `/metrics/push/node`
- **Authentication**: Node JWT (via IAM)
- **Retention**: Raw 7 days, aggregated up to 365 days

#### Resource Metrics (from AIWM)
- **Collection Interval**: 5 minutes
- **Push Method**: HTTP POST to `/metrics/push/resource`
- **Authentication**: Node JWT or Service JWT
- **Retention**: Raw 7 days, aggregated up to 90 days

#### Deployment Metrics (from AIWM)
- **Collection Interval**: 5 minutes
- **Collection Method**: Aggregated from Execution logs
- **Retention**: Aggregated up to 90 days

---

## 4. Technical Goals

### 4.1 Performance Requirements

- **Write Throughput**: 1000+ metric pushes/minute
- **Query Latency**: < 500ms for 30-day time-range queries
- **Storage Efficiency**: Aggressive aggregation và TTL policies
- **Scalability**: Support 100+ nodes, 500+ resources, multi-instance deployment

### 4.2 Data Quality Requirements

- **Accuracy**: Metrics accurate đến 2 decimal places
- **Completeness**: Graceful handling of missing data points
- **Consistency**: UTC timestamps across all metrics
- **Integrity**: Validation before storage

### 4.3 Security Requirements

- **Authentication**: JWT for push APIs (Node JWT), User JWT for query APIs
- **Service-to-Service**: API Key authentication (X-API-Key header)
- **Authorization**: Role-based access control
- **Data Isolation**: Metrics isolated by owner/organization
- **Audit Trail**: Log all metric operations

---

## 5. Architecture

### 5.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONA Service (Port 3004)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │   Push API    │  │   Query API   │  │ Aggregation API  │   │
│  │  (Node JWT)   │  │  (User JWT)   │  │   (API Key)      │   │
│  └───────┬───────┘  └───────┬───────┘  └────────┬─────────┘   │
│          │                   │                    │             │
│          └───────────────────┼────────────────────┘             │
│                              │                                  │
│                       ┌──────▼──────┐                           │
│                       │   Service   │                           │
│                       │    Layer    │                           │
│                       └──────┬──────┘                           │
│                              │                                  │
│          ┌───────────────────┼───────────────────┐             │
│          │                   │                   │             │
│   ┌──────▼──────┐    ┌───────▼───────┐   ┌──────▼──────┐     │
│   │  MongoDB    │    │  BullMQ Queue │   │ Alert Rule  │     │
│   │  (metrics)  │    │ (aggregation) │   │   Engine    │     │
│   └─────────────┘    └───────────────┘   └──────┬──────┘     │
│                                                   │             │
│                                            ┌──────▼──────┐     │
│                                            │    NOTI     │     │
│                                            │  (future)   │     │
│                                            └─────────────┘     │
└─────────────────────────────────────────────────────────────────┘

External Systems:
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ AIWM Service │─push──► │              │         │   Frontend   │
│ (Nodes/Res)  │         │     MONA     │ ◄─query─│     App      │
└──────────────┘         │   Port 3004  │         └──────────────┘
                         │              │
┌──────────────┐         │              │
│  IAM Service │─push──► │              │
│ (User metrics)         │              │
└──────────────┘         └──────────────┘
                              ▲
┌──────────────┐              │
│ External     │──trigger─────┘
│  Cronjob     │ (aggregation)
└──────────────┘
```

### 5.2 Components

#### 5.2.1 Push API Controller
- Receive metrics từ external systems (AIWM nodes, containers)
- Validate incoming data
- Authenticate requests (Node JWT)
- Store raw metrics to MongoDB

#### 5.2.2 Query API Controller
- Provide REST endpoints for querying metrics
- Support time-range filters, pagination
- Authentication: User JWT với `metrics:read` permission
- Frontend-driven metadata aggregation (không include entity info)

#### 5.2.3 Aggregation API Controller
- Trigger endpoints cho external cronjobs
- Authentication: API Key (service-to-service)
- Manual aggregation triggers (1min→5min→1hour→1day)
- Job status tracking

#### 5.2.4 Metrics Service
- Core business logic for metrics management
- Data validation và normalization
- Query optimization
- Integration với BaseService for RBAC

#### 5.2.5 Aggregation Worker (BullMQ)
- Process aggregation jobs từ queue
- Multi-level aggregation (1min → 5min → 1hour → 1day)
- Data retention cleanup
- Redis-backed distributed processing

#### 5.2.6 Alert Rule Engine
- Evaluate alert conditions on aggregated metrics
- Trigger alerts to NOTI service
- Rule management APIs (Phase 2)

#### 5.2.7 Metrics Schema (MongoDB)
- Time-series optimized schema
- Compound indexes for fast queries
- TTL indexes for automatic cleanup

---

## 6. Related Documents

### 6.1 Design Documents
- [02-schema-design.md](./02-schema-design.md) - Database schema và indexes
- [03-api-design.md](./03-api-design.md) - REST API endpoints
- [04-aggregation-strategy.md](./04-aggregation-strategy.md) - Aggregation và retention
- [05-implementation-plan.md](./05-implementation-plan.md) - Development roadmap
- [06-node-authentication.md](./06-node-authentication.md) - Node auth flow

### 6.2 Related Services
- **AIWM** - Primary metrics producer (nodes, resources, deployments)
- **IAM** - Authentication provider (JWT tokens)
- **NOTI** - Alert delivery (future integration)
- **CBM** - Business metrics producer (future)

### 6.3 External References
- [Hydrabyte Monorepo Structure](../../README.md)
- [Template Service Guide](../../docs/TEMPLATE-SERVICE-UPGRADE.md)
- [Service Communication Patterns](../../docs/SERVICE-COMMUNICATION.md)

---

## 7. Success Criteria

### 7.1 Functional Requirements
- ✅ Services có thể push metrics via REST API
- ✅ Frontend có thể query metrics với time-range filters
- ✅ Metrics aggregated tự động via external cronjobs
- ✅ Old metrics cleanup tự động (TTL)
- ✅ API responses < 500ms cho 30-day queries
- ✅ Multi-instance deployment support (Redis-backed jobs)

### 7.2 Non-Functional Requirements
- ✅ 99% uptime cho metric collection
- ✅ Zero data loss trong push pipeline
- ✅ Storage growth < 10GB/month cho 100 nodes
- ✅ Independent scalability from business services

---

## 8. Timeline Estimate

| Phase | Tasks | Duration |
|-------|-------|----------|
| **Phase 1** | Service scaffolding, schema design | 2 days |
| **Phase 2** | Push API, Node authentication | 3 days |
| **Phase 3** | Query API, service layer | 3 days |
| **Phase 4** | Aggregation worker, retention | 2 days |
| **Phase 5** | Testing, optimization | 2 days |
| **Total** | **MVP Complete** | **12 days** |

---

## 9. Design Decisions

### 9.1 Why Separate Service?

**Rationale**:
- ✅ **Reusability**: Multiple services (AIWM, IAM, CBM) sẽ cần metrics
- ✅ **Scalability**: Metrics workload có thể scale independently
- ✅ **Separation of Concerns**: Observability là cross-cutting concern
- ✅ **Pattern**: Giống Prometheus (centralized metrics platform)

**Trade-offs**:
- ❌ Cross-service queries phức tạp hơn
- ❌ Cần frontend ghép metadata từ entity services
- ✅ Mitigated by: API-driven design, frontend-driven aggregation

### 9.2 Aggregation Approach

**Decision**: API-driven aggregation (external cronjob → MONA API)

**Rationale**:
- ✅ Flexibility: Thay đổi schedule không cần redeploy
- ✅ Monitoring: External tools track job execution
- ✅ Multi-instance friendly: No @Cron decorators

### 9.3 Alert Architecture

**Decision**: Alert evaluation in MONA, delivery in NOTI

**Rationale**:
- ✅ MONA: Rule evaluation (gần metrics data)
- ✅ NOTI: Delivery routing (email, Slack, webhook)
- ✅ Pattern: Giống Prometheus + Alertmanager

---

**Next Steps:**
1. ✅ Review overview document
2. ⏳ Review [Schema Design](./02-schema-design.md)
3. ⏳ Review [API Design](./03-api-design.md)
4. ⏳ Review [Aggregation Strategy](./04-aggregation-strategy.md)
5. ⏳ Approve và start implementation
