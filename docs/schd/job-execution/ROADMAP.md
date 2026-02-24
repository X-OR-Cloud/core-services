# JobExecution Module - v1.0 Roadmap

> Last updated: 2026-02-24
> Status: P0 completed — P1 next

## Implementation Status

### P0 — Core Features ✅ COMPLETED

#### P0-1: Schema & Status Machine ✅
- [x] JobExecution schema extends BaseSchema
- [x] ExecutionError embedded sub-schema
- [x] Status enum: pending → queued → running → completed/failed/timeout
- [x] correlationId (UUID) for cross-service tracking
- [x] retryOf reference for retry chain tracking

#### P0-2: Lifecycle Methods ✅
- [x] `createExecution()` — create with pending status + correlationId
- [x] `markAsQueued()` — set queued status + queuedAt
- [x] `markAsRunning()` — set running status + startedAt
- [x] `updateFromResult()` — update from target service result + calculate duration
- [x] `markAsTimeout()` — set timeout status + error

#### P0-3: Timeout Detection ✅
- [x] `findTimedOutExecutions()` — MongoDB query with $expr for timeout check
- [x] Integrated with SchedulerService cron (every minute)
- [x] Auto-retry on timeout based on retryConfig

#### P0-4: Retry Logic ✅
- [x] `scheduleRetry()` — calculate backoff delay (fixed/exponential)
- [x] Max retry check against job's retryConfig.maxRetries
- [x] Delay cap at MAX_BACKOFF_MS (1 hour)
- [x] New execution created with retryOf link

#### P0-5: Stats & Queries ✅
- [x] `getStats()` — aggregated stats by status + avgDuration
- [x] `findByJobId()` — paginated execution history per job
- [x] Dual controller: `/executions` (global) + `/jobs/:id/executions` (per job)

#### P0-6: Result Processor ✅
- [x] `JobResultProcessor` consuming `job-results` queue
- [x] Updates execution status + result/error
- [x] Updates job's lastExecutionStatus
- [x] Emits lifecycle events via EventEmitter2

#### P0-7: Indexes ✅
- [x] `{ jobId: 1, triggeredAt: -1 }` compound
- [x] `{ status: 1, queuedAt: 1 }` for timeout queries
- [x] `{ triggeredAt: -1 }` for timeline
- [x] `{ 'owner.orgId': 1, triggeredAt: -1 }` org-scoped

---

### P1 — Enhancements (Planned)

#### P1-1: Full Manual Retry Integration
- [ ] Wire `POST /executions/:id/retry` to SchedulerService
- [ ] Create new execution with retryOf + push to target queue
- [ ] Return actual executionId instead of placeholder
- **Dependency**: SchedulerService accessible from controller or via event

#### P1-2: Execution Cleanup
- [ ] Auto-cleanup old executions (configurable retention period)
- [ ] Cron job to delete executions older than N days
- [ ] Keep summary stats even after cleanup
- **Status**: Planned

#### P1-3: Real-time Status Updates
- [ ] WebSocket/SSE for live execution status changes
- [ ] Dashboard-friendly event stream
- [ ] Integrate with NOTI service for notifications
- **Dependency**: NOTI service

#### P1-4: Advanced Filtering
- [ ] Filter by status, triggeredBy, dateRange in `/executions`
- [ ] Search by correlationId
- [ ] Sort by duration, triggeredAt
- **Status**: Planned

---

### P2 — Future

#### P2-1: Execution Logs
- [ ] Store stdout/stderr from target service
- [ ] Streaming log support during execution
- **Status**: Needs design

#### P2-2: Execution Metrics
- [ ] Per-job success rate over time (daily/weekly/monthly)
- [ ] P50/P95/P99 duration percentiles
- [ ] Failure pattern detection
- **Status**: Idea — may belong to MONA service

#### P2-3: Cancel Running Execution
- [ ] `POST /executions/:id/cancel` — send cancel signal to target service
- [ ] Requires target service to support cancellation protocol
- **Status**: Needs design

---

## Notes

- correlationId là UUID unique mỗi execution, dùng để match giữa trigger message và result message
- duration tính từ startedAt (hoặc queuedAt nếu không có startedAt) đến completedAt
- Retry tạo execution mới (không update execution cũ), giữ full audit trail
- Target service cần push result vào `job-results` queue với format chuẩn (xem OVERVIEW.md section 11)
