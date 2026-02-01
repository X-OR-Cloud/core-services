# SCHD - Scheduler Service

> Job Scheduling & Orchestration Service - Quản lý và thực thi các tác vụ tự động theo lịch

**Port:** 3006

---

## Tổng quan

SCHD là service chuyên về scheduling và job orchestration. Service hỗ trợ 2 modes: API (quản lý jobs) và Worker (trigger jobs theo lịch, timeout monitoring và nhận kết quả).

SCHD chỉ quan tâm việc gửi message vào đúng queue với payload, target service sẽ tự parse và route xử lý.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SCHD Service                              │
├─────────────────┬───────────────────────────────────────────────┤
│   API Mode      │              Worker Mode                       │
│   (Port 3006)   │                                                │
├─────────────────┼───────────────────────────────────────────────┤
│ - CRUD Jobs     │ - Cron Scheduler                              │
│ - Job History   │ - Job Trigger → Redis Queue                   │
│ - Manual Trigger│ - Result Listener                             │
│                 │ - Timeout Monitor (mark failed)               │
│                 │ - Retry & Dead Letter Queue                   │
└─────────────────┴───────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Redis Queue    │
                    │    (BullMQ)      │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   ┌─────────┐         ┌─────────┐          ┌─────────┐
   │  AIWM   │         │   CBM   │          │  MONA   │
   │ Worker  │         │ Worker  │          │ Worker  │
   └────┬────┘         └────┬────┘          └────┬────┘
        │                   │                    │
        └───────────────────┴────────────────────┘
                            │
                   Result → job-results queue
```

---

## Naming Convention

Tuân theo pattern của AIWM để đảm bảo tính nhất quán:

| Type | Pattern | Example |
|------|---------|---------|
| **Queue names** | `{resource}.queue` hoặc `{resource-plural}` | `scheduled-jobs.queue`, `job-executions` |
| **Job names** | `{verb}-{noun}` | `trigger-job`, `check-timeout` |
| **Event names** | `{resource}:{action}` | `job:triggered`, `job-execution:completed` |

---

## Queue & Event Constants

### Queue Names
```typescript
export const QUEUE_NAMES = {
  // SCHD internal queues
  SCHEDULED_JOBS: 'scheduled-jobs.queue',      // Job definitions
  JOB_EXECUTIONS: 'job-executions',            // Execution tracking
  JOB_RESULTS: 'job-results',                  // Results from target services
} as const;
```

### Job Names
```typescript
export const JOB_NAMES = {
  TRIGGER_JOB: 'trigger-job',                  // Trigger a scheduled job
  CHECK_TIMEOUT: 'check-timeout',              // Check for timed out executions
  PROCESS_RESULT: 'process-result',            // Process result from target service
  RETRY_EXECUTION: 'retry-execution',          // Retry failed execution
} as const;
```

### Scheduled Job Events
```typescript
export const SCHEDULED_JOB_EVENTS = {
  CREATED: 'scheduled-job:created',
  UPDATED: 'scheduled-job:updated',
  DELETED: 'scheduled-job:deleted',
  ENABLED: 'scheduled-job:enabled',
  DISABLED: 'scheduled-job:disabled',
} as const;
```

### Job Execution Events
```typescript
export const JOB_EXECUTION_EVENTS = {
  // Lifecycle events
  TRIGGERED: 'job-execution:triggered',        // Job triggered (manual/cron)
  QUEUED: 'job-execution:queued',              // Pushed to target queue
  STARTED: 'job-execution:started',            // Target service started processing
  COMPLETED: 'job-execution:completed',        // Successfully completed
  FAILED: 'job-execution:failed',              // Failed with error
  TIMEOUT: 'job-execution:timeout',            // Timed out (no response)

  // Retry events
  RETRY_SCHEDULED: 'job-execution:retry-scheduled',
  RETRY_EXHAUSTED: 'job-execution:retry-exhausted',  // Max retries reached
} as const;
```

---

## Modules

### 1. Scheduled Job

Định nghĩa các job cần chạy theo lịch.

**Entity: ScheduledJob**
```typescript
{
  // Identity
  name: string;              // "daily-report", "cleanup-sessions"
  description: string;
  tags: string[];            // ["report", "daily"]

  // Schedule
  cronExpression: string;    // "0 0 * * *" (midnight daily)
  timezone: string;          // "Asia/Ho_Chi_Minh"

  // Target - SCHD chỉ cần biết queue và payload
  targetQueue: string;       // "aiwm.jobs", "cbm.jobs", "iam.jobs"
  payload: object;           // Target service tự parse và route xử lý

  // Execution settings
  enabled: boolean;
  priority: number;          // 1-10, higher = more priority
  timeout: number;           // Job timeout (ms), default: 300000 (5 min)
  retryConfig: {
    maxRetries: number;      // Default: 3
    backoffMs: number;       // Default: 5000
    backoffType: 'fixed' | 'exponential';  // Default: exponential
  };

  // Computed fields
  nextRunAt: Date;           // Computed from cron
  lastRunAt: Date;
  lastExecutionStatus: string;
}
```

---

### 2. Job Execution

Lịch sử thực thi của các jobs.

**Entity: JobExecution**
```typescript
{
  // Reference
  jobId: ObjectId;           // Reference to ScheduledJob
  jobName: string;           // Denormalized for query

  // Trigger info
  triggeredAt: Date;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUser?: string;  // If manual

  // Execution status
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'timeout';

  // Timing
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;         // ms

  // Result
  result?: object;           // Success output
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };

  // Retry tracking
  retryCount: number;
  retryOf?: ObjectId;        // If this is a retry
  nextRetryAt?: Date;        // Scheduled retry time

  // Correlation
  correlationId: string;
}
```

**Status Flow:**
```
pending → queued → running → completed
                          ↘ failed → (retry) → queued
                          ↘ timeout → (retry) → queued
                                    ↘ retry-exhausted (final failed)
```

---

## Worker Mode Features

### 1. Cron Scheduler
- Load tất cả enabled jobs khi startup
- Check mỗi phút để trigger jobs đến hạn
- Update `nextRunAt` sau mỗi lần trigger

### 2. Job Trigger
- Tạo JobExecution record (status: pending)
- Push job message tới target queue
- Update status: queued

### 3. Result Listener
- Subscribe `job-results` queue
- Update JobExecution với result
- Emit events cho real-time tracking

### 4. Timeout Monitor
- Chạy periodic check (mỗi 1 phút)
- Tìm executions có status `running` hoặc `queued` quá timeout
- Mark failed với error: `JOB_TIMEOUT`
- Trigger retry nếu còn retry attempts

```typescript
// Timeout check logic
async checkTimeoutExecutions() {
  const now = new Date();

  // Find executions that exceeded timeout
  const timedOutExecutions = await this.executionModel.find({
    status: { $in: ['queued', 'running'] },
    $expr: {
      $gt: [
        { $subtract: [now, '$queuedAt'] },
        '$timeout'  // timeout from job config
      ]
    }
  });

  for (const execution of timedOutExecutions) {
    await this.markAsTimeout(execution);
  }
}

async markAsTimeout(execution: JobExecution) {
  execution.status = 'timeout';
  execution.completedAt = new Date();
  execution.error = {
    message: 'Job execution timed out',
    code: 'JOB_TIMEOUT',
  };
  await execution.save();

  // Emit event
  this.eventEmitter.emit(JOB_EXECUTION_EVENTS.TIMEOUT, execution);

  // Check retry
  if (execution.retryCount < execution.maxRetries) {
    await this.scheduleRetry(execution);
  } else {
    this.eventEmitter.emit(JOB_EXECUTION_EVENTS.RETRY_EXHAUSTED, execution);
  }
}
```

### 5. Retry Handler
- Exponential backoff: `delay = backoffMs * (2 ^ retryCount)`
- Tạo new execution với `retryOf` reference
- Max retries → emit `retry-exhausted` event

---

## Message Formats

### Job Trigger Message (SCHD → Target Service)
```typescript
// Message pushed to target queue (e.g., aiwm.jobs)
{
  executionId: string;       // JobExecution._id
  jobId: string;             // ScheduledJob._id
  jobName: string;
  payload: object;           // Job-specific data (target service tự parse)
  correlationId: string;
  triggeredAt: string;       // ISO timestamp
  timeout: number;           // Timeout in ms
  metadata: {
    retryCount: number;
    priority: number;
  }
}
```

### Job Result Message (Target Service → SCHD)
```typescript
// Message pushed to job-results queue
{
  executionId: string;       // JobExecution._id
  correlationId: string;
  status: 'completed' | 'failed';
  result?: object;           // Success output
  error?: {
    message: string;
    code?: string;
  };
  startedAt: string;         // When processing started
  completedAt: string;       // When processing finished
  processedBy: string;       // Worker identifier
}
```

---

## API Endpoints

### Scheduled Jobs
```
POST   /jobs                       # Create scheduled job
GET    /jobs                       # List jobs (paginated)
GET    /jobs/:id                   # Get job detail
PATCH  /jobs/:id                   # Update job
DELETE /jobs/:id                   # Soft delete job
POST   /jobs/:id/enable            # Enable job
POST   /jobs/:id/disable           # Disable job
POST   /jobs/:id/trigger           # Manual trigger
GET    /jobs/:id/next-runs         # Preview next N run times
```

### Job Executions
```
GET    /executions                 # List all executions (paginated)
GET    /executions/:id             # Get execution detail
GET    /jobs/:id/executions        # Executions for specific job
POST   /executions/:id/retry       # Retry failed/timeout execution
GET    /executions/stats           # Execution statistics
```

### Health & Status
```
GET    /health                     # Service health
GET    /scheduler/status           # Scheduler status
```

---

## Use Cases

### 1. Worker Task: Session Cleanup
```json
{
  "name": "cleanup-expired-sessions",
  "cronExpression": "0 * * * *",
  "timezone": "Asia/Ho_Chi_Minh",
  "targetQueue": "iam.jobs",
  "payload": {
    "jobType": "maintenance",
    "action": "cleanup-sessions",
    "olderThanHours": 24
  }
}
```

### 2. Worker Task: Daily Reports
```json
{
  "name": "daily-usage-report",
  "cronExpression": "0 6 * * *",
  "timezone": "Asia/Ho_Chi_Minh",
  "targetQueue": "mona.jobs",
  "payload": {
    "jobType": "generate-report",
    "reportType": "daily-usage",
    "recipients": ["admin@example.com"]
  },
  "timeout": 600000
}
```

### 3. Worker Task: AI Model Health Check
```json
{
  "name": "model-health-check",
  "cronExpression": "*/5 * * * *",
  "timezone": "Asia/Ho_Chi_Minh",
  "targetQueue": "aiwm.jobs",
  "payload": {
    "jobType": "health-check",
    "checkType": "all-models"
  },
  "timeout": 60000,
  "retryConfig": {
    "maxRetries": 2,
    "backoffMs": 5000,
    "backoffType": "fixed"
  }
}
```

### 4. Agent Task: Daily Summary Report
```json
{
  "name": "daily-summary-by-agent",
  "description": "AI Agent tổng hợp báo cáo hoạt động hàng ngày",
  "cronExpression": "0 18 * * *",
  "timezone": "Asia/Ho_Chi_Minh",
  "targetQueue": "aiwm.jobs",
  "payload": {
    "jobType": "agent-task",
    "agentId": "675abc123def456...",
    "prompt": "Tổng hợp báo cáo hoạt động ngày hôm nay bao gồm: số lượng users mới, transactions, và các sự cố đã xảy ra. Đưa ra nhận xét và đề xuất.",
    "conversationMode": "new",
    "maxTokens": 2000,
    "temperature": 0.7
  },
  "timeout": 120000
}
```

### 5. Agent Task: Weekly Trend Analysis
```json
{
  "name": "weekly-trend-analysis",
  "description": "AI Agent phân tích xu hướng tuần",
  "cronExpression": "0 9 * * 1",
  "timezone": "Asia/Ho_Chi_Minh",
  "targetQueue": "aiwm.jobs",
  "payload": {
    "jobType": "agent-task",
    "agentId": "675def789abc123...",
    "prompt": "Phân tích xu hướng sử dụng hệ thống trong tuần qua. So sánh với tuần trước và đưa ra các đề xuất cải thiện.",
    "conversationMode": "new"
  },
  "timeout": 180000,
  "retryConfig": {
    "maxRetries": 2,
    "backoffMs": 10000,
    "backoffType": "exponential"
  }
}
```

---

## Tech Stack

- **Framework:** NestJS
- **Database:** MongoDB
- **Queue:** BullMQ (Redis-based)
- **Scheduler:** BullMQ repeatable jobs
- **Timezone:** date-fns-tz

---

## Modes

### API Mode
```bash
nx run schd:api
```
- REST API server
- Job management endpoints
- Swagger documentation

### Worker Mode
```bash
nx run schd:wrk
```
- Cron scheduler daemon
- Job trigger processor
- Result listener
- Timeout monitor (runs every minute)
- Retry handler

---

## Roadmap

### Phase 1 (MVP)
- [ ] ScheduledJob CRUD
- [ ] JobExecution tracking
- [ ] Cron scheduler với BullMQ
- [ ] Job trigger → target queue
- [ ] Result listener
- [ ] Timeout monitor

### Phase 2
- [ ] Manual trigger API
- [ ] Retry với exponential backoff
- [ ] Dead letter queue
- [ ] Execution statistics dashboard

### Phase 3
- [ ] Job dependencies (DAG)
- [ ] Rate limiting per service
- [ ] Alert integration với NOTI
- [ ] One-time scheduled jobs

---

**Status:** Planning
**Last Updated:** 2025-02-01
