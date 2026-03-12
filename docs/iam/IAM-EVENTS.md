# IAM Event Broadcasting

IAM phát tán sự kiện người dùng và tổ chức qua BullMQ (Redis) theo mô hình **fan-out queue**: mỗi subscriber service có một queue riêng biệt, đảm bảo các service nhận event độc lập, không ảnh hưởng lẫn nhau.

## Tổng quan kiến trúc

```
IAM Service (Producer)
  └── IamEventProducer
        ├── push → [iam.events.noti]  → NOTI Worker consume
        └── push → [iam.events.dgt]   → DGT Worker consume
```

**Đặc điểm quan trọng:**

- **Fan-out độc lập**: NOTI consume xong không ảnh hưởng DGT, và ngược lại. Mỗi service có hàng đợi riêng.
- **ACK tự động**: BullMQ mark job `completed` khi `process()` resolve; throw exception → `failed` → retry theo config.
- **Non-blocking**: IAM emit event theo kiểu fire-and-forget — failure emit **không** làm fail operation chính (create user, login SSO, v.v.).
- **Dồn ứ**: Nếu consumer worker của một service không chạy, job chỉ tích lũy trong queue của service đó, không ảnh hưởng các queue khác.

---

## Queue Names

| Queue | Subscriber |
|-------|-----------|
| `iam.events.noti` | NOTI Service |
| `iam.events.dgt` | DGT Service |

> Khi cần thêm subscriber mới, liên hệ IAM team để thêm queue mới vào `QUEUE_NAMES` và `ALL_IAM_SUBSCRIBER_QUEUES` trong `services/iam/src/queues/queue.config.ts`.

---

## Các Events

### `user.created`

Kích hoạt khi:
- Tạo user mới qua `POST /users` (local account)
- User mới đăng nhập lần đầu qua Google SSO (auto-provisioning)

```typescript
{
  event: 'user.created',
  timestamp: '2026-03-13T10:00:00.000Z', // ISO 8601
  correlationId?: 'req-abc123',           // từ X-Correlation-ID header, nếu có
  data: {
    userId: '67cdef1234567890abcdef12',   // MongoDB ObjectId string
    username: 'john.doe@example.com',     // email
    role: 'organization.viewer',          // role được gán
    orgId: '67aabb1234567890abcdef00',    // orgId (rỗng nếu universe-level)
    provider: 'local' | 'google',         // phân biệt local vs Google SSO
    status: 'active',
    fullname?: 'John Doe',
  }
}
```

### `user.updated`

Kích hoạt khi:
- Cập nhật thông tin user qua `PUT /users/:id`
- Thay đổi role qua `PATCH /users/:id/change-role`

```typescript
{
  event: 'user.updated',
  timestamp: '2026-03-13T10:05:00.000Z',
  correlationId?: 'req-xyz456',
  data: {
    userId: '67cdef1234567890abcdef12',
    username: 'john.doe@example.com',
    orgId: '67aabb1234567890abcdef00',
    updatedFields: ['role', 'status'],     // danh sách field đã thay đổi
    role?: 'organization.editor',          // có nếu role thay đổi
    status?: 'active',                     // có nếu status thay đổi
    fullname?: 'John Doe',                 // có nếu fullname thay đổi
  }
}
```

### `user.deleted`

Kích hoạt khi soft-delete user qua `DELETE /users/:id`.

```typescript
{
  event: 'user.deleted',
  timestamp: '2026-03-13T10:10:00.000Z',
  correlationId?: 'req-del789',
  data: {
    userId: '67cdef1234567890abcdef12',
    username: 'john.doe@example.com',
    orgId: '67aabb1234567890abcdef00',
    deletedBy: '67aabb0000000000abcdef01',  // userId của người thực hiện xóa
  }
}
```

### `organization.created`

Kích hoạt khi tạo tổ chức mới qua `POST /organizations`.

```typescript
{
  event: 'organization.created',
  timestamp: '2026-03-13T09:00:00.000Z',
  correlationId?: 'req-org001',
  data: {
    orgId: '67aabb1234567890abcdef00',
    name: 'Acme Corp',
    createdBy: '67aabb0000000000abcdef01',  // userId của người tạo
  }
}
```

### `organization.updated`

Kích hoạt khi cập nhật tổ chức qua `PUT /organizations/:id`.

```typescript
{
  event: 'organization.updated',
  timestamp: '2026-03-13T09:30:00.000Z',
  data: {
    orgId: '67aabb1234567890abcdef00',
    name: 'Acme Corp',
    updatedBy: '67aabb0000000000abcdef01',
    updatedFields: ['name', 'description'],
  }
}
```

### `organization.deleted`

Kích hoạt khi soft-delete tổ chức qua `DELETE /organizations/:id`.

```typescript
{
  event: 'organization.deleted',
  timestamp: '2026-03-13T09:45:00.000Z',
  data: {
    orgId: '67aabb1234567890abcdef00',
    deletedBy: '67aabb0000000000abcdef01',
  }
}
```

---

## Hướng dẫn tích hợp Consumer

### Bước 1 — Cài đặt dependencies

```bash
# Đã có sẵn trong monorepo root package.json
@nestjs/bullmq, bullmq, ioredis
```

### Bước 2 — Tạo queue config

Trong service của bạn, tạo config connect Redis và đăng ký queue `iam.events.<service>`:

```typescript
// src/queues/iam-events.config.ts
import { BullModule } from '@nestjs/bullmq';

export const IAM_EVENTS_QUEUE = 'iam.events.noti'; // hoặc 'iam.events.dgt'

export const registerIamEventsQueue = () =>
  BullModule.registerQueue({ name: IAM_EVENTS_QUEUE });
```

> **Lưu ý**: Dùng đúng tên queue của service mình (`iam.events.noti` cho NOTI, `iam.events.dgt` cho DGT). Tên này phải khớp với tên IAM đã đăng ký trong producer.

### Bước 3 — Tạo Processor

```typescript
// src/queues/processors/iam-event.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IamQueueEvent } from './iam-event.types'; // copy type từ docs hoặc định nghĩa local

@Processor('iam.events.noti') // tên queue của service bạn
export class IamEventProcessor extends WorkerHost {
  private readonly logger = new Logger(IamEventProcessor.name);

  async process(job: Job<IamQueueEvent>): Promise<void> {
    const { event, data, timestamp } = job.data;

    this.logger.log(`Processing IAM event: ${event} (Job: ${job.id})`);

    switch (event) {
      case 'user.created':
        await this.handleUserCreated(data as any);
        break;
      case 'user.updated':
        await this.handleUserUpdated(data as any);
        break;
      case 'user.deleted':
        await this.handleUserDeleted(data as any);
        break;
      case 'organization.created':
        await this.handleOrgCreated(data as any);
        break;
      default:
        this.logger.debug(`Unhandled IAM event: ${event} — skipped`);
    }
  }

  private async handleUserCreated(data: { userId: string; username: string; provider: string; orgId: string }) {
    // Implement logic cho service của bạn
    // VD NOTI: gửi welcome notification
    // VD DGT: tạo account mặc định
  }

  private async handleUserUpdated(data: { userId: string; updatedFields: string[] }) {
    // ...
  }

  private async handleUserDeleted(data: { userId: string; orgId: string }) {
    // ...
  }

  private async handleOrgCreated(data: { orgId: string; name: string }) {
    // ...
  }
}
```

### Bước 4 — Đăng ký vào Module

```typescript
// src/queues/iam-events.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IamEventProcessor } from './processors/iam-event.processor';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      },
    }),
    BullModule.registerQueue({ name: 'iam.events.noti' }), // tên queue của service bạn
  ],
  providers: [IamEventProcessor],
})
export class IamEventsModule {}
```

### Bước 5 — Import vào AppModule

```typescript
// src/app/app.module.ts
import { IamEventsModule } from '../queues/iam-events.module';

@Module({
  imports: [
    // ... các module khác
    IamEventsModule,
  ],
})
export class AppModule {}
```

---

## Retry & Error Handling

BullMQ mặc định retry 3 lần với exponential backoff khi job fail. Để tùy chỉnh:

```typescript
BullModule.registerQueue({
  name: 'iam.events.noti',
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  },
});
```

**Nguyên tắc xử lý trong Processor:**
- Throw exception → job vào `failed` → BullMQ retry tự động
- Return bình thường (kể cả không làm gì) → job `completed`, không retry
- Với event không cần xử lý: `return` luôn, đừng throw

---

## Environment Variables

Cần đảm bảo các service consumer có cùng Redis config với IAM:

| Variable | Default | Mô tả |
|----------|---------|-------|
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password (nếu có) |
| `REDIS_DB` | `0` | Redis database index |

---

## Type Definitions (copy vào service consumer)

```typescript
// Có thể copy toàn bộ hoặc chỉ lấy events cần thiết

export interface IamUserCreatedEvent {
  event: 'user.created';
  timestamp: string;
  correlationId?: string;
  data: {
    userId: string;
    username: string;
    role: string;
    orgId: string;
    provider: 'local' | 'google';
    status: string;
    fullname?: string;
  };
}

export interface IamUserUpdatedEvent {
  event: 'user.updated';
  timestamp: string;
  correlationId?: string;
  data: {
    userId: string;
    username: string;
    orgId: string;
    updatedFields: string[];
    role?: string;
    status?: string;
    fullname?: string;
  };
}

export interface IamUserDeletedEvent {
  event: 'user.deleted';
  timestamp: string;
  correlationId?: string;
  data: {
    userId: string;
    username: string;
    orgId: string;
    deletedBy: string;
  };
}

export interface IamOrganizationCreatedEvent {
  event: 'organization.created';
  timestamp: string;
  correlationId?: string;
  data: {
    orgId: string;
    name: string;
    createdBy: string;
  };
}

export interface IamOrganizationUpdatedEvent {
  event: 'organization.updated';
  timestamp: string;
  correlationId?: string;
  data: {
    orgId: string;
    name: string;
    updatedBy: string;
    updatedFields: string[];
  };
}

export interface IamOrganizationDeletedEvent {
  event: 'organization.deleted';
  timestamp: string;
  correlationId?: string;
  data: {
    orgId: string;
    deletedBy: string;
  };
}

export type IamQueueEvent =
  | IamUserCreatedEvent
  | IamUserUpdatedEvent
  | IamUserDeletedEvent
  | IamOrganizationCreatedEvent
  | IamOrganizationUpdatedEvent
  | IamOrganizationDeletedEvent;
```
