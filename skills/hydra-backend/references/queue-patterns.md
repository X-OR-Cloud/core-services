# BullMQ Queue Patterns

## Overview
- **Producer**: creates jobs, injects via `@InjectQueue(QUEUE_NAME)`
- **Processor**: consumes jobs, extends `WorkerHost` with `@Processor(QUEUE_NAME)`
- **Config**: queue names + event constants in `config/queue.config.ts`
- **Redis config**: `config/redis.config.ts`

## Queue Names
```typescript
// ⚠️ NO colons in queue names — BullMQ restriction
// ❌ 'pag:inbound'
// ✅ 'pag-inbound'

export const QUEUE_NAMES = {
  INBOUND: 'myservice-inbound',
  PROCESSING: 'myservice-processing',
};

export const QUEUE_EVENTS = {
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
};
```

## Redis Config
```typescript
export const redisConfig = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
  password: process.env['REDIS_PASSWORD'] || undefined,
  db: parseInt(process.env['REDIS_DB'] || '0', 10),
  maxRetriesPerRequest: null, // Required for BullMQ
};
```

## Queue Module (registers queues + provides producers)
```typescript
@Module({
  imports: [
    BullModule.forRoot({ connection: { ...redisConfig } }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INBOUND },
      { name: QUEUE_NAMES.PROCESSING },
    ),
  ],
  providers: [InboundProducer],
  exports: [InboundProducer, BullModule],
})
export class QueueModule {}
```

## Producer
```typescript
@Injectable()
export class InboundProducer {
  constructor(@InjectQueue(QUEUE_NAMES.INBOUND) private readonly queue: Queue) {}

  async publish(data: any) {
    await this.queue.add(QUEUE_EVENTS.TASK_CREATED, {
      event: QUEUE_EVENTS.TASK_CREATED,
      data,
      timestamp: new Date().toISOString(),
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 50,
      removeOnFail: 20,
    });
  }
}
```

## Processor
```typescript
@Processor(QUEUE_NAMES.INBOUND)
export class InboundProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundProcessor.name);

  constructor(private myService: MyService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing job ${job.id}, name: ${job.name}`);
    switch (job.name) {
      case QUEUE_EVENTS.TASK_CREATED:
        return this.handleTask(job.data.data);
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
        return null;
    }
  }

  private async handleTask(data: any) {
    // Business logic here
  }
}
```

## Processors Module (registers processors)
```typescript
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INBOUND },
      { name: QUEUE_NAMES.PROCESSING },
    ),
    // Import entity modules that processors depend on
    EntityOneModule,
    EntityTwoModule,
  ],
  providers: [
    InboundProcessor,
    ProcessingProcessor,
    // Producers needed by processors
    SomeProducer,
  ],
})
export class ProcessorsModule {}
```

## systemContext for Internal Operations
Processors run without HTTP request → no JWT → no RequestContext.
Use `systemContext` to bypass RBAC:

```typescript
private get systemContext(): RequestContext {
  return {
    orgId: '', groupId: '', userId: 'system',
    agentId: '', appId: '', roles: ['universe.owner' as any],
  };
}

// Usage in processor:
const entity = await this.myService.findById(id, this.systemContext);
```

**Apply systemContext to**: all processors, webhook handlers, cron jobs — anywhere code runs without user JWT.

## Graceful Startup
Processors should NOT crash if optional config is missing:
```typescript
constructor() {
  super();
  const apiKey = process.env['API_KEY'];
  if (!apiKey) {
    this.logger.warn('API_KEY not set - feature disabled');
  } else {
    this.client = new ApiClient({ apiKey });
  }
}
```
