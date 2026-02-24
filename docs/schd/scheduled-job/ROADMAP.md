# ScheduledJob Module - v1.0 Roadmap

> Last updated: 2026-02-24
> Status: P0 completed — P1 next

## Implementation Status

### P0 — Core Features ✅ COMPLETED

#### P0-1: Schema & CRUD ✅
- [x] ScheduledJob schema extends BaseSchema
- [x] RetryConfig embedded sub-schema
- [x] CreateScheduledJobDto with validation (cron, targetQueue, payload)
- [x] UpdateScheduledJobDto (PartialType)
- [x] Service extends BaseService with cron-parser integration
- [x] Controller with full CRUD endpoints
- [x] Swagger documentation

#### P0-2: Cron Expression Support ✅
- [x] Validate cron expressions via `cron-parser`
- [x] Calculate nextRunAt on create/update/enable
- [x] Timezone support (default: `Asia/Ho_Chi_Minh`)
- [x] Preview next N run times endpoint (`GET /jobs/:id/next-runs`)

#### P0-3: Enable/Disable ✅
- [x] `POST /jobs/:id/enable` — set enabled=true, recalculate nextRunAt
- [x] `POST /jobs/:id/disable` — set enabled=false
- [x] `findDueJobs()` only returns enabled, non-deleted jobs

#### P0-4: Manual Trigger ✅
- [x] `POST /jobs/:id/trigger` endpoint
- [x] Placeholder response (full integration in SchedulerService)

#### P0-5: Indexes ✅
- [x] `{ name: 1 }` unique
- [x] `{ enabled: 1, nextRunAt: 1 }` compound for due job queries
- [x] `{ tags: 1 }` for tag filtering
- [x] `{ 'owner.orgId': 1 }` for org-scoped queries

---

### P1 — Enhancements (Planned)

#### P1-1: Full Manual Trigger Integration
- [ ] Wire `POST /jobs/:id/trigger` to `SchedulerService.triggerJob()`
- [ ] Create execution record + push to target queue
- [ ] Return actual executionId in response
- **Dependency**: SchedulerModule must be importable in API mode or use cross-module communication

#### P1-2: Job Validation Improvements
- [ ] Validate targetQueue format (non-empty, valid characters)
- [ ] Warn if cron runs more frequently than timeout allows
- [ ] Validate payload structure per targetQueue conventions
- **Status**: Needs design discussion

#### P1-3: Bulk Operations
- [ ] `POST /jobs/bulk/enable` — enable multiple jobs by IDs or tag
- [ ] `POST /jobs/bulk/disable` — disable multiple jobs
- [ ] Useful for maintenance windows
- **Status**: Planned

#### P1-4: Job Statistics
- [ ] Add `byTag`, `byTargetQueue`, `byStatus` aggregations in `findAll()`
- [ ] Count enabled/disabled/total
- [ ] Show next upcoming job across all jobs
- **Status**: Planned

---

### P2 — Future

#### P2-1: Job Dependencies
- [ ] Define job chains (job B runs after job A completes)
- [ ] DAG-based execution ordering
- **Status**: Needs design

#### P2-2: Job Templates
- [ ] Pre-defined job templates for common patterns
- [ ] Quick-create from template
- **Status**: Idea

#### P2-3: Rate Limiting
- [ ] Max concurrent executions per job
- [ ] Max executions per time window
- **Status**: Idea

---

## Notes

- SCHD chỉ push payload vào targetQueue — không biết logic xử lý
- Target service parse `payload.jobType` để route xử lý
- Cron expression sử dụng standard 5-field format
- Tất cả thời gian tính theo timezone của job (default: Asia/Ho_Chi_Minh)
