# JobExecution Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/schd/src/modules/job-execution/
├── job-execution.schema.ts      # MongoDB schema (extends BaseSchema)
├── job-execution.dto.ts         # DTOs: ExecutionStats, RetryResponse, Filter
├── job-execution.service.ts     # Business logic: create, status transitions, stats, retry
├── job-execution.controller.ts  # REST API: 2 controllers (executions + jobs/:id/executions)
├── job-execution.module.ts      # NestJS module
└── index.ts                     # Barrel exports
```

## 2. Concept

JobExecution là bản ghi mỗi lần một ScheduledJob được thực thi. Theo dõi toàn bộ lifecycle:

```
pending → queued → running → completed
                           → failed → (retry) → pending...
                           → timeout → (retry) → pending...
```

Mỗi execution có `correlationId` (UUID) để tracking xuyên suốt giữa SCHD và target service.

## 3. Schema Fields

```
JobExecution extends BaseSchema:
  jobId: ObjectId (ref: ScheduledJob, required, indexed)
  jobName: string (required)          # Denormalized cho quick access
  triggeredAt: Date (required)        # Thời điểm trigger
  triggeredBy: 'scheduler' | 'manual' # Ai trigger
  triggeredByUser: string             # UserId nếu manual
  status: string (indexed)            # pending | queued | running | completed | failed | timeout
  queuedAt: Date                      # Thời điểm push vào queue
  startedAt: Date                     # Thời điểm target service bắt đầu xử lý
  completedAt: Date                   # Thời điểm hoàn tất
  duration: number                    # Thời gian xử lý (ms), auto-calculated
  result: Record<string, any>         # Kết quả trả về từ target service
  error: ExecutionError               # Lỗi nếu failed/timeout
    message: string (required)
    code: string
    stack: string
  retryCount: number (default: 0)     # Số lần retry hiện tại
  retryOf: ObjectId (ref: JobExecution)  # Execution gốc nếu là retry
  nextRetryAt: Date                   # Thời điểm retry tiếp theo
  correlationId: string (required, indexed)  # UUID tracking
  timeout: number                     # Timeout (ms), copy từ job
  // Inherited: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

**Indexes**:
- `{ jobId: 1, triggeredAt: -1 }` — query executions by job, newest first
- `{ status: 1, queuedAt: 1 }` — find running/queued for timeout check
- `{ triggeredAt: -1 }` — global timeline
- `{ 'owner.orgId': 1, triggeredAt: -1 }` — org-scoped queries

## 4. Status State Machine

| Status | Meaning | Set by | When |
|--------|---------|--------|------|
| `pending` | Execution created, not yet queued | SchedulerService | createExecution() |
| `queued` | Pushed to target queue | SchedulerService | markAsQueued() after triggerProducer |
| `running` | Target service started processing | Target service | markAsRunning() or via result |
| `completed` | Successfully finished | JobResultProcessor | updateFromResult(status=completed) |
| `failed` | Error occurred | JobResultProcessor | updateFromResult(status=failed) |
| `timeout` | Exceeded timeout threshold | SchedulerService | markAsTimeout() |

**Duration calculation**: `completedAt - (startedAt || queuedAt)` in milliseconds.

## 5. API Endpoints

### Execution Controller (`/executions`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/executions` | JWT | List all executions with pagination |
| GET | `/executions/stats` | JWT | Aggregated stats (total, completed, failed, successRate, avgDuration) |
| GET | `/executions/:id` | JWT | Get execution by ID |
| POST | `/executions/:id/retry` | JWT | Manually retry failed/timeout execution |

### Job Executions Controller (`/jobs/:jobId/executions`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/jobs/:jobId/executions` | JWT | Get execution history for specific job |

## 6. Service Methods

### Lifecycle Methods

| Method | Description |
|--------|-------------|
| `createExecution(params, context?)` | Create new execution record (status: pending) |
| `markAsQueued(executionId)` | Set status=queued, queuedAt=now |
| `markAsRunning(executionId)` | Set status=running, startedAt=now |
| `updateFromResult(params)` | Update from target service result (completed/failed) + calculate duration |
| `markAsTimeout(executionId)` | Set status=timeout, calculate duration, set error |

### Query Methods

| Method | Description |
|--------|-------------|
| `findTimedOutExecutions()` | Find queued/running executions that exceeded timeout |
| `findByJobId(jobId, page, limit, context)` | Paginated executions for a job |
| `getStats(jobId?, startDate?, endDate?, context)` | Aggregated statistics |

### Retry Methods

| Method | Description |
|--------|-------------|
| `scheduleRetry(execution, job)` | Calculate backoff delay, check max retries, return shouldRetry |

## 7. Retry Logic

Retry xử lý trong `scheduleRetry()`:

1. Check `execution.retryCount >= job.retryConfig.maxRetries` → stop if exceeded
2. Calculate delay based on backoff type:
   - **fixed**: `backoffMs` constant
   - **exponential**: `backoffMs * 2^retryCount`
3. Cap delay at `MAX_BACKOFF_MS` (1 hour)
4. Update execution with `nextRetryAt`
5. Return `{ shouldRetry, nextRetryAt, retryCount }`

SchedulerService sau đó tạo execution mới với `retryOf` pointing to failed execution.

## 8. Stats Response

```typescript
ExecutionStatsResponseDto {
  total: number           // Tổng executions
  completed: number       // Thành công
  failed: number          // Thất bại
  timeout: number         // Hết thời gian
  running: number         // Đang chạy
  pending: number         // Chờ xử lý
  queued: number          // Đã đưa vào queue
  successRate: number     // % thành công (2 decimal)
  avgDuration: number     // Thời gian trung bình (ms, completed only)
}
```

## 9. Timeout Detection

Worker mode chạy cron mỗi phút (`checkTimeoutExecutions`):

```
Find executions WHERE:
  status IN ('queued', 'running')
  AND queuedAt EXISTS
  AND timeout > 0
  AND (now - queuedAt) > timeout
```

Khi phát hiện timeout:
1. Mark execution as timeout
2. Emit `job-execution:timeout` event
3. Check retry config → create retry execution if applicable

## 10. Dependencies

- **ScheduledJob schema**: Reference via `jobId` for job info and retry config
- **BaseService**: Inherited CRUD, pagination, soft delete
- **EventEmitter2**: Emit lifecycle events (completed, failed, timeout, retry)
- **uuid**: Generate correlationId

## 11. Queue Integration

### Outgoing (via SchedulerService + JobTriggerProducer)
- Push job payload to `targetQueue` → target service processes

### Incoming (via JobResultProcessor)
- Listen on `job-results` queue
- Target service pushes result: `{ executionId, correlationId, status, result, error }`
- Processor calls `updateFromResult()` → updates execution + job status

### Result Message Format (from target service)

```typescript
{
  executionId: string;       // SCHD execution ID
  correlationId: string;     // UUID from trigger message
  status: 'completed' | 'failed';
  result?: Record<string, any>;
  error?: { message: string; code?: string };
  startedAt: string;         // ISO date
  completedAt: string;       // ISO date
  processedBy: string;       // Service identifier
}
```

## 12. Usage Example

```bash
# Get execution stats
curl http://localhost:3006/executions/stats \
  -H "Authorization: Bearer $TOKEN"

# Get stats for specific job
curl "http://localhost:3006/executions/stats?jobId=JOB_ID" \
  -H "Authorization: Bearer $TOKEN"

# Get job execution history
curl http://localhost:3006/jobs/JOB_ID/executions?page=1&limit=20 \
  -H "Authorization: Bearer $TOKEN"

# Retry failed execution
curl -X POST http://localhost:3006/executions/EXEC_ID/retry \
  -H "Authorization: Bearer $TOKEN"
```
