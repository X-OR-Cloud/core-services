# ScheduledJob Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/schd/src/modules/scheduled-job/
├── scheduled-job.schema.ts      # MongoDB schema (extends BaseSchema)
├── scheduled-job.dto.ts         # DTOs: Create, Update, TriggerJobResponse, NextRunsQuery
├── scheduled-job.service.ts     # Business logic (extends BaseService) + cron-parser
├── scheduled-job.controller.ts  # REST API endpoints
├── scheduled-job.module.ts      # NestJS module
└── index.ts                     # Barrel exports
```

## 2. Concept

ScheduledJob là entity chứa định nghĩa job cần chạy theo lịch. Mỗi job có:

- **Cron expression** + timezone → xác định lịch chạy
- **Target queue** → queue của service sẽ xử lý job
- **Payload** → dữ liệu gửi kèm, target service tự parse `payload.jobType` để phân loại xử lý

SCHD không biết chi tiết logic xử lý — chỉ push event vào queue và theo dõi kết quả.

## 3. Schema Fields

```
ScheduledJob extends BaseSchema:
  name: string (required, unique)        # Tên job duy nhất
  description: string                     # Mô tả
  tags: string[]                          # Tags để filter
  cronExpression: string (required)       # Cron expression (5-field)
  timezone: string (default: 'Asia/Ho_Chi_Minh')
  targetQueue: string (required)          # Queue đích (e.g., 'aiwm.jobs')
  payload: Record<string, any>            # Payload gửi kèm
  enabled: boolean (default: true)        # Bật/tắt job
  priority: number (1-10, default: 5)     # Độ ưu tiên
  timeout: number (default: 300000)       # Timeout (ms), 5 phút
  retryConfig: RetryConfig                # Cấu hình retry
    maxRetries: number (default: 3)
    backoffMs: number (default: 5000)
    backoffType: 'fixed' | 'exponential' (default: 'exponential')
  nextRunAt: Date                         # Thời điểm chạy tiếp theo (auto-calculated)
  lastRunAt: Date                         # Lần chạy gần nhất
  lastExecutionStatus: string             # Status lần chạy gần nhất
  // Inherited: owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

**Indexes**: `{ name: 1 }` (unique), `{ enabled: 1, nextRunAt: 1 }`, `{ tags: 1 }`, `{ 'owner.orgId': 1 }`

## 4. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/jobs` | JWT | Create scheduled job (validate cron, calculate nextRunAt) |
| GET | `/jobs` | JWT | List jobs with pagination |
| GET | `/jobs/:id` | JWT | Get job by ID |
| PUT | `/jobs/:id` | JWT | Update job (recalculate nextRunAt if cron/timezone changed) |
| DELETE | `/jobs/:id` | JWT | Soft delete job |
| POST | `/jobs/:id/enable` | JWT | Enable job + recalculate nextRunAt |
| POST | `/jobs/:id/disable` | JWT | Disable job |
| POST | `/jobs/:id/trigger` | JWT | Manually trigger job execution |
| GET | `/jobs/:id/next-runs` | JWT | Preview next N run times (default: 5) |

## 5. Service Methods

### Public Methods

| Method | Description |
|--------|-------------|
| `create(dto, context)` | Validate cron, calculate nextRunAt, merge retry defaults, save |
| `updateJob(id, dto, context)` | Validate cron if changed, recalculate nextRunAt |
| `enable(id, context)` | Set enabled=true, recalculate nextRunAt |
| `disable(id, context)` | Set enabled=false |
| `remove(id, context)` | Soft delete |
| `findDueJobs(now)` | Find enabled jobs where nextRunAt <= now |
| `updateAfterExecution(jobId, status)` | Update lastRunAt, lastExecutionStatus, nextRunAt |
| `getNextRuns(cron, timezone, count)` | Preview next N run times |

### Private Methods

| Method | Description |
|--------|-------------|
| `validateCronExpression(cron)` | Parse cron expression, throw BadRequestException if invalid |
| `calculateNextRunAt(cron, timezone)` | Calculate next run time using cron-parser |

## 6. Cron Expression Support

Sử dụng `cron-parser` library. Hỗ trợ standard 5-field cron:

```
┌───────── minute (0-59)
│ ┌───────── hour (0-23)
│ │ ┌───────── day of month (1-31)
│ │ │ ┌───────── month (1-12)
│ │ │ │ ┌───────── day of week (0-7, 0 and 7 = Sunday)
* * * * *
```

Examples:
- `0 0 * * *` — Mỗi ngày lúc 00:00
- `*/5 * * * *` — Mỗi 5 phút
- `0 9 * * 1-5` — 9:00 sáng thứ 2-6
- `0 0 1 * *` — Ngày 1 hàng tháng

## 7. Dependencies

- **cron-parser**: Parse và validate cron expressions
- **BaseService**: CRUD operations, pagination, soft delete
- **JwtAuthGuard + CurrentUser**: Authentication + context

## 8. Usage Example

```bash
# Create a daily cleanup job targeting AIWM
curl -X POST http://localhost:3006/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "daily-session-cleanup",
    "description": "Clean up expired sessions",
    "cronExpression": "0 2 * * *",
    "timezone": "Asia/Ho_Chi_Minh",
    "targetQueue": "aiwm.jobs",
    "payload": {
      "jobType": "maintenance",
      "action": "cleanup-sessions",
      "params": { "olderThanDays": 30 }
    },
    "tags": ["maintenance", "daily"]
  }'

# Preview next run times
curl http://localhost:3006/jobs/:id/next-runs?count=5 \
  -H "Authorization: Bearer $TOKEN"

# Manually trigger
curl -X POST http://localhost:3006/jobs/:id/trigger \
  -H "Authorization: Bearer $TOKEN"
```
