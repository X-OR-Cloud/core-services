# SCHD Service - Kế hoạch triển khai

> Tài liệu hướng dẫn triển khai SCHD Service từ Template Service

---

## Tổng quan

| Thông tin | Giá trị |
|-----------|---------|
| Service Name | schd |
| Port | 3006 |
| Database | hydra-schd |
| Base | Clone từ `services/template` |

---

## Phase 1: Khởi tạo Service

### 1.1 Clone Template Service

```bash
# Copy template service
cp -r services/template services/schd

# Copy e2e tests (nếu cần)
cp -r services/template-e2e services/schd-e2e
```

### 1.2 Cập nhật project.json

**File:** `services/schd/project.json`

Thay đổi:
- `"name": "template"` → `"name": "schd"`
- Tất cả đường dẫn `services/template` → `services/schd`
- Build target `template:build` → `schd:build`

### 1.3 Cập nhật .env

**File:** `services/schd/.env`

```env
# MongoDB Configuration
MONGODB_URI=mongodb://10.10.0.100:27017/hydra-schd

# Redis Configuration (for BullMQ)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Service Configuration
PORT=3006
NODE_ENV=development
```

### 1.4 Cập nhật main.ts

**File:** `services/schd/src/main.ts`

Thay đổi:
- Swagger title: `SCHD - Scheduler Service`
- Swagger description: `Job Scheduling & Orchestration Service`
- Port: `3006`

### 1.5 Cập nhật app.module.ts

**File:** `services/schd/src/app/app.module.ts`

- Cập nhật database name trong MongooseModule
- Import các modules mới (ScheduledJob, JobExecution)
- Cấu hình BullMQ queues

### 1.6 Đăng ký trong Nx Workspace

**File:** `nx.json` - Thêm schd vào projects nếu cần

**File:** `.vscode/launch.json` - Thêm debug configuration

### 1.7 Cập nhật ecosystem.config.js

Thêm cấu hình PM2 cho SCHD service (api và worker modes).

---

## Phase 2: Xóa modules không cần thiết

### 2.1 Xóa các modules từ template

```bash
# Xóa modules không cần
rm -rf services/schd/src/modules/category
rm -rf services/schd/src/modules/product
rm -rf services/schd/src/modules/report

# Xóa producers/processors cũ
rm -rf services/schd/src/queues/producers/category.producer.ts
rm -rf services/schd/src/queues/producers/product.producer.ts
rm -rf services/schd/src/queues/producers/report.producer.ts
rm -rf services/schd/src/queues/processors/category.processor.ts
rm -rf services/schd/src/queues/processors/product.processor.ts
rm -rf services/schd/src/queues/processors/report.processor.ts

# Xóa thư mục reports
rm -rf services/schd/reports
```

### 2.2 Cập nhật imports trong app.module.ts

Xóa imports của CategoryModule, ProductModule, ReportModule.

---

## Phase 3: Tạo Config và Constants

### 3.1 Queue Config

**File:** `services/schd/src/config/queue.config.ts`

```typescript
export const QUEUE_NAMES = {
  // SCHD internal queues
  SCHEDULED_JOBS: 'scheduled-jobs.queue',
  JOB_EXECUTIONS: 'job-executions',
  JOB_RESULTS: 'job-results',
} as const;

export const JOB_NAMES = {
  TRIGGER_JOB: 'trigger-job',
  CHECK_TIMEOUT: 'check-timeout',
  PROCESS_RESULT: 'process-result',
  RETRY_EXECUTION: 'retry-execution',
} as const;

export const SCHEDULED_JOB_EVENTS = {
  CREATED: 'scheduled-job:created',
  UPDATED: 'scheduled-job:updated',
  DELETED: 'scheduled-job:deleted',
  ENABLED: 'scheduled-job:enabled',
  DISABLED: 'scheduled-job:disabled',
} as const;

export const JOB_EXECUTION_EVENTS = {
  TRIGGERED: 'job-execution:triggered',
  QUEUED: 'job-execution:queued',
  STARTED: 'job-execution:started',
  COMPLETED: 'job-execution:completed',
  FAILED: 'job-execution:failed',
  TIMEOUT: 'job-execution:timeout',
  RETRY_SCHEDULED: 'job-execution:retry-scheduled',
  RETRY_EXHAUSTED: 'job-execution:retry-exhausted',
} as const;
```

### 3.2 Scheduler Config

**File:** `services/schd/src/config/scheduler.config.ts`

```typescript
export const SCHEDULER_CONFIG = {
  // Timeout check interval (ms)
  TIMEOUT_CHECK_INTERVAL: 60000, // 1 minute

  // Default job settings
  DEFAULT_TIMEOUT: 300000, // 5 minutes
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_BACKOFF_MS: 5000,
  DEFAULT_TIMEZONE: 'Asia/Ho_Chi_Minh',

  // Worker settings
  WORKER_CONCURRENCY: 5,
} as const;
```

---

## Phase 4: Tạo Module ScheduledJob

### 4.1 Cấu trúc thư mục

```
services/schd/src/modules/scheduled-job/
├── scheduled-job.module.ts
├── scheduled-job.controller.ts
├── scheduled-job.service.ts
├── scheduled-job.schema.ts
├── scheduled-job.dto.ts
└── interfaces/
    └── scheduled-job.interface.ts
```

### 4.2 Schema

**File:** `scheduled-job.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ScheduledJobDocument = ScheduledJob & Document;

@Schema({ timestamps: true })
export class RetryConfig {
  @Prop({ default: 3 })
  maxRetries: number;

  @Prop({ default: 5000 })
  backoffMs: number;

  @Prop({ enum: ['fixed', 'exponential'], default: 'exponential' })
  backoffType: string;
}

@Schema({ timestamps: true, collection: 'scheduled_jobs' })
export class ScheduledJob extends BaseSchema {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ required: true })
  cronExpression: string;

  @Prop({ default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @Prop({ required: true })
  targetQueue: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, any>;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 5, min: 1, max: 10 })
  priority: number;

  @Prop({ default: 300000 }) // 5 minutes
  timeout: number;

  @Prop({ type: RetryConfig, default: () => ({}) })
  retryConfig: RetryConfig;

  @Prop()
  nextRunAt: Date;

  @Prop()
  lastRunAt: Date;

  @Prop()
  lastExecutionStatus: string;
}

export const ScheduledJobSchema = SchemaFactory.createForClass(ScheduledJob);

// Indexes
ScheduledJobSchema.index({ name: 1 }, { unique: true });
ScheduledJobSchema.index({ enabled: 1, nextRunAt: 1 });
ScheduledJobSchema.index({ tags: 1 });
```

### 4.3 DTOs

**File:** `scheduled-job.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  IsArray,
  Min,
  Max,
  IsEnum,
} from 'class-validator';

export class RetryConfigDto {
  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ default: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  backoffMs?: number;

  @ApiPropertyOptional({ enum: ['fixed', 'exponential'], default: 'exponential' })
  @IsOptional()
  @IsEnum(['fixed', 'exponential'])
  backoffType?: string;
}

export class CreateScheduledJobDto {
  @ApiProperty({ example: 'daily-cleanup' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Clean up expired sessions daily' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: ['maintenance', 'daily'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ example: '0 0 * * *' })
  @IsString()
  @IsNotEmpty()
  cronExpression: string;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'iam.jobs' })
  @IsString()
  @IsNotEmpty()
  targetQueue: string;

  @ApiProperty({ example: { jobType: 'maintenance', action: 'cleanup' } })
  @IsObject()
  payload: Record<string, any>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ default: 300000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  timeout?: number;

  @ApiPropertyOptional()
  @IsOptional()
  retryConfig?: RetryConfigDto;
}

export class UpdateScheduledJobDto extends PartialType(CreateScheduledJobDto) {}
```

### 4.4 Service

**File:** `scheduled-job.service.ts`

- Extend `BaseService` từ `@hydrabyte/base`
- Override `create()` để tính `nextRunAt` từ cron expression
- Thêm methods: `enable()`, `disable()`, `trigger()`, `getNextRuns()`
- Sử dụng `cron-parser` để parse cron expression

### 4.5 Controller

**File:** `scheduled-job.controller.ts`

- CRUD endpoints chuẩn
- Thêm endpoints: `POST /:id/enable`, `POST /:id/disable`, `POST /:id/trigger`, `GET /:id/next-runs`
- Sử dụng `@CurrentUser()` decorator
- Swagger documentation với error decorators

---

## Phase 5: Tạo Module JobExecution

### 5.1 Cấu trúc thư mục

```
services/schd/src/modules/job-execution/
├── job-execution.module.ts
├── job-execution.controller.ts
├── job-execution.service.ts
├── job-execution.schema.ts
├── job-execution.dto.ts
└── interfaces/
    └── job-execution.interface.ts
```

### 5.2 Schema

**File:** `job-execution.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type JobExecutionDocument = JobExecution & Document;

@Schema({ timestamps: true })
export class ExecutionError {
  @Prop({ required: true })
  message: string;

  @Prop()
  code: string;

  @Prop()
  stack: string;
}

@Schema({ timestamps: true, collection: 'job_executions' })
export class JobExecution extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'ScheduledJob', required: true })
  jobId: Types.ObjectId;

  @Prop({ required: true })
  jobName: string;

  @Prop({ required: true })
  triggeredAt: Date;

  @Prop({ enum: ['scheduler', 'manual'], required: true })
  triggeredBy: string;

  @Prop()
  triggeredByUser: string;

  @Prop({
    enum: ['pending', 'queued', 'running', 'completed', 'failed', 'timeout'],
    default: 'pending',
  })
  status: string;

  @Prop()
  queuedAt: Date;

  @Prop()
  startedAt: Date;

  @Prop()
  completedAt: Date;

  @Prop()
  duration: number;

  @Prop({ type: Object })
  result: Record<string, any>;

  @Prop({ type: ExecutionError })
  error: ExecutionError;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ type: Types.ObjectId, ref: 'JobExecution' })
  retryOf: Types.ObjectId;

  @Prop()
  nextRetryAt: Date;

  @Prop({ required: true })
  correlationId: string;

  @Prop()
  timeout: number;
}

export const JobExecutionSchema = SchemaFactory.createForClass(JobExecution);

// Indexes
JobExecutionSchema.index({ jobId: 1, triggeredAt: -1 });
JobExecutionSchema.index({ status: 1, queuedAt: 1 });
JobExecutionSchema.index({ correlationId: 1 });
JobExecutionSchema.index({ triggeredAt: -1 });
```

### 5.3 Service

**File:** `job-execution.service.ts`

- Extend `BaseService`
- Methods: `createExecution()`, `updateStatus()`, `markAsTimeout()`, `scheduleRetry()`
- Query methods: `findByJob()`, `getStats()`

### 5.4 Controller

**File:** `job-execution.controller.ts`

- `GET /executions` - List all executions
- `GET /executions/:id` - Get execution detail
- `GET /executions/stats` - Get statistics
- `POST /executions/:id/retry` - Retry failed execution

---

## Phase 6: Queue System

### 6.1 Cấu trúc thư mục

```
services/schd/src/queues/
├── queue.module.ts
├── processors.module.ts
├── producers/
│   ├── job-trigger.producer.ts
│   └── index.ts
└── processors/
    ├── job-result.processor.ts
    ├── timeout-checker.processor.ts
    └── index.ts
```

### 6.2 Job Trigger Producer

**File:** `job-trigger.producer.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class JobTriggerProducer {
  constructor(
    // Dynamic queue injection based on targetQueue
  ) {}

  async triggerJob(execution: JobExecution, job: ScheduledJob): Promise<void> {
    const queue = this.getQueue(job.targetQueue);

    await queue.add(JOB_NAMES.TRIGGER_JOB, {
      executionId: execution._id.toString(),
      jobId: job._id.toString(),
      jobName: job.name,
      payload: job.payload,
      correlationId: execution.correlationId,
      triggeredAt: execution.triggeredAt.toISOString(),
      timeout: job.timeout,
      metadata: {
        retryCount: execution.retryCount,
        priority: job.priority,
      },
    }, {
      priority: job.priority,
      attempts: 1, // SCHD handles retry logic
    });
  }
}
```

### 6.3 Job Result Processor

**File:** `job-result.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../config/queue.config';

@Processor(QUEUE_NAMES.JOB_RESULTS)
export class JobResultProcessor extends WorkerHost {
  constructor(
    private readonly executionService: JobExecutionService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { executionId, status, result, error, startedAt, completedAt } = job.data;

    await this.executionService.updateFromResult({
      executionId,
      status,
      result,
      error,
      startedAt: new Date(startedAt),
      completedAt: new Date(completedAt),
    });
  }
}
```

### 6.4 Timeout Checker Processor

**File:** `timeout-checker.processor.ts`

- Sử dụng BullMQ repeatable job để check timeout mỗi phút
- Query executions quá timeout
- Mark as timeout và schedule retry nếu cần

---

## Phase 7: Scheduler Worker

### 7.1 Cấu trúc thư mục

```
services/schd/src/scheduler/
├── scheduler.module.ts
├── scheduler.service.ts
└── cron-parser.util.ts
```

### 7.2 Scheduler Service

**File:** `scheduler.service.ts`

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private isRunning = false;

  async onModuleInit() {
    await this.loadJobs();
    this.isRunning = true;
  }

  async onModuleDestroy() {
    this.isRunning = false;
  }

  // Check every minute for due jobs
  @Cron(CronExpression.EVERY_MINUTE)
  async checkDueJobs() {
    if (!this.isRunning) return;

    const now = new Date();
    const dueJobs = await this.jobService.findDueJobs(now);

    for (const job of dueJobs) {
      await this.triggerJob(job);
    }
  }

  private async triggerJob(job: ScheduledJob) {
    // Create execution record
    const execution = await this.executionService.createExecution({
      jobId: job._id,
      jobName: job.name,
      triggeredBy: 'scheduler',
    });

    // Push to target queue
    await this.triggerProducer.triggerJob(execution, job);

    // Update job's nextRunAt
    await this.jobService.updateNextRunAt(job._id);
  }
}
```

---

## Phase 8: Multi-mode Support

### 8.1 Main entry points

**File:** `services/schd/src/main.ts` - API mode (default)

**File:** `services/schd/src/main.worker.ts` - Worker mode

```typescript
// main.worker.ts
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  console.log('SCHD Worker started');

  // Keep process running
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap();
```

### 8.2 Worker Module

**File:** `services/schd/src/worker.module.ts`

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot(...),
    BullModule.forRoot(...),
    SchedulerModule,
    ProcessorsModule,
    ScheduledJobModule,
    JobExecutionModule,
  ],
})
export class WorkerModule {}
```

### 8.3 Cập nhật project.json

```json
{
  "targets": {
    "api": {
      "executor": "@nx/js:node",
      "options": {
        "buildTarget": "schd:build",
        "args": ["--mode=api"]
      }
    },
    "wrk": {
      "executor": "@nx/js:node",
      "options": {
        "buildTarget": "schd:build",
        "args": ["--mode=worker"]
      }
    }
  }
}
```

---

## Phase 9: Testing & Verification

### 9.1 Build Test

```bash
# Build service
nx run schd:build

# TypeScript check
npx tsc --noEmit -p services/schd/tsconfig.app.json
```

### 9.2 API Mode Test

```bash
# Start API mode
nx run schd:api

# Test health endpoint
curl http://localhost:3006/health

# Test Swagger
open http://localhost:3006/api-docs
```

### 9.3 Worker Mode Test

```bash
# Start worker mode
nx run schd:wrk

# Check logs for scheduler running
```

### 9.4 Integration Test

```bash
# Create a test job
curl -X POST http://localhost:3006/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "test-job",
    "cronExpression": "* * * * *",
    "targetQueue": "aiwm.jobs",
    "payload": { "jobType": "test" }
  }'

# Manual trigger
curl -X POST http://localhost:3006/jobs/{id}/trigger \
  -H "Authorization: Bearer $TOKEN"

# Check executions
curl http://localhost:3006/jobs/{id}/executions \
  -H "Authorization: Bearer $TOKEN"
```

---

## Checklist tổng hợp

### Phase 1: Khởi tạo
- [ ] Clone template service
- [ ] Cập nhật project.json
- [ ] Cập nhật .env
- [ ] Cập nhật main.ts
- [ ] Cập nhật app.module.ts
- [ ] Đăng ký trong nx.json
- [ ] Cập nhật ecosystem.config.js

### Phase 2: Cleanup
- [ ] Xóa modules không cần (category, product, report)
- [ ] Xóa producers/processors cũ
- [ ] Cập nhật imports

### Phase 3: Config
- [ ] Tạo queue.config.ts
- [ ] Tạo scheduler.config.ts

### Phase 4: ScheduledJob Module
- [ ] Schema
- [ ] DTOs
- [ ] Service
- [ ] Controller
- [ ] Module

### Phase 5: JobExecution Module
- [ ] Schema
- [ ] DTOs
- [ ] Service
- [ ] Controller
- [ ] Module

### Phase 6: Queue System
- [ ] Queue module
- [ ] Job trigger producer
- [ ] Job result processor
- [ ] Timeout checker

### Phase 7: Scheduler Worker
- [ ] Scheduler service
- [ ] Cron parser utility

### Phase 8: Multi-mode
- [ ] main.worker.ts
- [ ] worker.module.ts
- [ ] project.json targets

### Phase 9: Testing
- [ ] Build test
- [ ] API mode test
- [ ] Worker mode test
- [ ] Integration test

---

## Dependencies cần thêm

```bash
# Cron parser
npm install cron-parser

# Date timezone
npm install date-fns date-fns-tz

# NestJS Schedule (cho worker)
npm install @nestjs/schedule
```

---

## Cập nhật PORT-ALLOCATION.md

Thêm SCHD vào danh sách:

| Service | Local Port | Production Range |
|---------|------------|------------------|
| SCHD | 3006 | 3360-3369 |

---

**Estimated Implementation:** Phụ thuộc vào độ phức tạp và testing
**Last Updated:** 2025-02-01
