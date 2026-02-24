# CLAUDE.md - SCHD Service

## Service Overview

SCHD (Scheduler Service) is the job scheduling and orchestration service. Port 3006 (dev), 3360-3369 (prod).

Dual mode: API (REST endpoints for job management) + Worker (cron scheduler, result listener, timeout monitor).

## Modules

| Module | Path | Description |
|--------|------|-------------|
| ScheduledJob | `src/modules/scheduled-job/` | Cron-based job definitions with targetQueue + payload |
| JobExecution | `src/modules/job-execution/` | Execution history, stats, retry tracking |

## Module-Specific Documentation

When working on a specific module, read the corresponding docs:

- **ScheduledJob module**: Read `docs/schd/scheduled-job/OVERVIEW.md` + `docs/schd/scheduled-job/ROADMAP.md`
- **JobExecution module**: Read `docs/schd/job-execution/OVERVIEW.md` + `docs/schd/job-execution/ROADMAP.md`
- **Design overview**: Read `docs/schd/README.md`
- **Implementation plan**: Read `docs/schd/IMPLEMENTATION-PLAN.md`

## Key Architecture Patterns

### Multi-Mode Support

Mode is determined by `--mode=worker` CLI argument:

- **API mode** (default): REST endpoints for CRUD scheduled jobs, view executions, stats
- **Worker mode**: Loads `SchedulerModule` with cron-based job checker, timeout monitor, result processor

```typescript
const isWorkerMode = process.argv.includes('--mode=worker');
...(isWorkerMode ? [SchedulerModule] : []),
```

### Queue System (BullMQ)

- **Producer**: `JobTriggerProducer` — dynamically creates queues per `targetQueue`, pushes job payload
- **Processor**: `JobResultProcessor` — consumes `job-results` queue, updates execution status
- **Config**: `src/config/queue.config.ts` (queue names, job names, event names)
- **Redis**: `src/config/redis.config.ts`

### Job Flow

```
Scheduler checks cron → finds due jobs
  → Create JobExecution (status: pending)
  → Push to targetQueue via JobTriggerProducer (status: queued)
  → Target service processes job
  → Target service pushes result to job-results queue
  → JobResultProcessor updates execution (status: completed/failed)
  → If failed/timeout → retry with exponential backoff
```

### Naming Conventions (aligned with AIWM)

- Queue names: `{resource}.queue` (e.g., `scheduled-jobs.queue`)
- Job names: `{verb}-{noun}` (e.g., `trigger-job`)
- Event names: `{resource}:{action}` (e.g., `job-execution:completed`)

## Commands

```bash
nx run schd:api    # API mode (REST endpoints)
nx run schd:wrk    # Worker mode (scheduler + result listener)
nx run schd:build  # Build
```

## PM2 Production Deployment

| Instance | Port | Mode |
|----------|------|------|
| `core.schd.api00` | 3360 | API |
| `core.schd.api01` | 3361 | API |
| `core.schd.worker00` | — | Worker (fork mode) |
