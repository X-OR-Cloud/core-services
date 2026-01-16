# Metrics Module - Design Documentation

**Status**: Schema v2.0 - Documentation Updated
**Version**: 2.0
**Date**: 2026-01-14
**Author**: Backend Development Team

> **Important**: This documentation reflects v2.0 schema changes. See [CHANGELOG-v2.md](./CHANGELOG-v2.md) for details on what changed from v1.0.

---

## 📚 Document Index

This folder contains comprehensive design documentation for the Metrics Module.

### Core Documents

1. **[01-overview.md](./01-overview.md)** - Module Overview
   - Business requirements
   - Technical goals
   - Architecture overview
   - Success criteria
   - Open questions for review

2. **[02-schema-design.md](./02-schema-design.md)** - Database Schema Design ✨ v2.0
   - MetricSnapshot schema definition
   - Metric types (Node, Resource, Deployment, System)
   - Enhanced CPU schema (multi-socket support)
   - Enhanced Network schema (per-interface details)
   - System information tracking
   - Indexes strategy
   - Data samples
   - Storage estimates

3. **[03-api-design.md](./03-api-design.md)** - REST API Design ✨ v2.0
   - Push API endpoints (node/resource metrics)
   - Query API endpoints (time-range queries)
   - Authentication & authorization
   - Rate limiting
   - Error handling
   - API examples (cURL, TypeScript, Python)

4. **[04-aggregation-strategy.md](./04-aggregation-strategy.md)** - Aggregation & Retention ✨ v2.0
   - Multi-level aggregation (1min → 5min → 1hour → 1day)
   - Data retention policies
   - Cron job scheduling
   - Performance optimization
   - TTL indexes

5. **[05-implementation-plan.md](./05-implementation-plan.md)** - Development Roadmap ✨ v2.0
   - 4 phases, 10 days total
   - Task breakdown with acceptance criteria
   - Testing strategy
   - Risk management
   - Deliverables checklist

6. **[CHANGELOG-v2.md](./CHANGELOG-v2.md)** - Version 2.0 Changes 🆕
   - Schema structure changes
   - Field name updates
   - Enhanced monitoring capabilities
   - Migration guide

---

## 🎯 Quick Start

### For Reviewers

**Recommended Reading Order**:
1. Start with [01-overview.md](./01-overview.md) để hiểu big picture
2. Review [02-schema-design.md](./02-schema-design.md) để verify data model
3. Check [03-api-design.md](./03-api-design.md) để verify API contracts
4. Review [04-aggregation-strategy.md](./04-aggregation-strategy.md) cho storage strategy
5. Finally [05-implementation-plan.md](./05-implementation-plan.md) cho timeline

**Key Review Points**:
- [ ] Business requirements match expectations?
- [ ] Schema design covers all use cases?
- [ ] API design matches frontend needs?
- [ ] Retention policy acceptable?
- [ ] Timeline realistic?
- [ ] Open questions in [01-overview.md](./01-overview.md#9-open-questions) answered?

### For Implementers

**Prerequisites**:
- Read all 5 documents thoroughly
- Understand time-series data concepts
- Familiar with NestJS, MongoDB, BullMQ
- Review related modules (Node, Resource, Deployment)

**Starting Point**:
- Follow [05-implementation-plan.md](./05-implementation-plan.md) Phase 1
- Use schemas from [02-schema-design.md](./02-schema-design.md)
- Copy DTOs from [03-api-design.md](./03-api-design.md)
- Reference code examples in all docs

---

## 📊 Module Summary

### Purpose
Thu thập, lưu trữ và phân tích time-series metrics cho toàn bộ infrastructure (nodes, resources, deployments).

### Key Features
- ✅ **Push API**: Nodes/containers push metrics định kỳ
- ✅ **Query API**: Frontend query metrics với time-range filters
- ✅ **Multi-level Aggregation**: 1min → 5min → 1hour → 1day
- ✅ **Automatic Retention**: TTL-based cleanup (7d → 365d)
- ✅ **RBAC**: Organization-scoped data isolation

### Metrics Types
1. **Node Metrics**: CPU, RAM, GPU, Disk, Network
2. **Resource Metrics**: Container/VM resource usage
3. **Deployment Metrics**: Inference performance (latency, tokens, cost)
4. **System Metrics**: Platform-wide aggregated stats

### Storage Estimates
- **100 nodes**: ~10GB/month raw data
- **With aggregation**: ~4.5GB total (stable)

### Timeline
- **Phase 1**: Foundation (3 days)
- **Phase 2**: Core Features (3 days)
- **Phase 3**: Aggregation (2 days)
- **Phase 4**: Testing (2 days)
- **Total**: 10 days

---

## 🔗 Related Documentation

### AIWM Service
- [AIWM Service README](../../../services/aiwm/README.md)
- [Kaisar AI Ops Overview](../../KAISAR-AI-OPS-OVERVIEW.md)

### Related Modules
- [Node API](../aiwm-node-api.md) - Source of node metrics
- [Resource Management](../resource-management-proposal.md) - Source of resource metrics
- [Deployment API](../API-DEPLOYMENT-INFERENCE.md) - Source of inference metrics
- [Reports Module](../reports-api-frontend-integration.md) - Consumer of metrics

### Development Guides
- [CLAUDE.md](../../../CLAUDE.md) - AI agent development instructions
- [Template Service Guide](../../TEMPLATE-SERVICE-UPGRADE.md) - Service patterns

---

## 📝 Design Principles

### 1. Storage Efficiency
- Single collection với discriminator
- Multi-level aggregation
- Aggressive TTL policies
- Efficient indexes

### 2. Query Performance
- Compound indexes for common queries
- Pagination for large results
- Field selection support
- Pre-aggregated data

### 3. Scalability
- Queue-based aggregation (BullMQ)
- Batch processing
- Horizontal scaling support
- Independent worker processes

### 4. Security
- JWT authentication
- RBAC data isolation
- Rate limiting
- Ownership validation

### 5. Maintainability
- Clear schema definitions
- Comprehensive docs
- Automated testing
- Monitoring built-in

---

## 🚀 Next Steps

### Before Implementation
1. ✅ Complete design review
2. ✅ Answer open questions in overview
3. ✅ Get stakeholder approval
4. ✅ Setup development environment
5. ✅ Create GitHub issue/ticket

### During Implementation
1. Follow implementation plan phases
2. Write tests alongside code
3. Update docs as needed
4. Regular code reviews
5. Integration testing early

### After Implementation
1. Performance testing
2. Load testing
3. Production deployment
4. Monitoring setup
5. User documentation

---

## ❓ Open Questions

**For Anh Dzung to decide**:

1. **Real-time Streaming**: Có cần WebSocket streaming metrics không? (Suggest: Phase 2)
2. **Individual Request Metrics**: Track individual LLM requests hay chỉ aggregated? (Suggest: Aggregated only for MVP)
3. **Prometheus Export**: Cần export metrics sang Prometheus format không? (Suggest: Phase 2)
4. **Retention Policy**: 7d raw / 90d aggregated có phù hợp? (Alternative: 3d / 30d to save storage)
5. **Push Interval**: 1 minute có quá frequent không? (Alternative: 5 minutes to reduce load)

**Please review và provide feedback trước khi start implementation!**

---

## 📞 Contact

**Questions về design?**
- Review comments in GitHub
- Discussion trong issue ticket
- Technical design meetings

**Implementation blockers?**
- Escalate to tech lead
- Check Slack #backend-dev
- Refer to CLAUDE.md

---

## 📄 Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-01-14 | Initial design documents | Backend Team |
| 2.0 | 2026-01-14 | Schema enhancements: consolidated metrics structure, enhanced CPU/Network fields, added systemInfo | Backend Team |

---

**Status**: ✅ **v2.0 Schema Approved** - All documentation updated to reflect v2.0 changes.

**Review Deadline**: TBD
**Implementation Start**: After approval
**Target Completion**: 10 working days from start
