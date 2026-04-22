# Notification Service - Real-time Notification System

**Service Name:** noti
**Port:** 3002
**Status:** ✅ Production Ready
**Version:** 1.0.0

---

## 📋 Overview

The Notification Service provides a **real-time notification system** for the Hydra Services ecosystem. It supports three communication methods:

1. **REST API** - CRUD operations for notifications
2. **WebSocket (Socket.IO)** - Real-time push notifications
3. **Queue (BullMQ)** - Event-driven notifications from other services

### Key Features

- ✅ Real-time WebSocket notifications with Socket.IO
- ✅ 4 event types: system.notification, service.event, service.alert, agent.event
- ✅ JWT authentication for both REST and WebSocket
- ✅ Room-based broadcasting (user, org, agent rooms)
- ✅ BullMQ queue integration with Redis
- ✅ MongoDB persistence with read/unread tracking
- ✅ RBAC and audit trail (BaseService pattern)
- ✅ Swagger/OpenAPI documentation
- ✅ Production-ready patterns from Template Service
- ✅ Support for 1,000+ concurrent connections

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+
- MongoDB running on `10.10.0.100:27017` (or update `.env`)
- Redis running on `127.0.0.1:6379` (or update `.env`)
- JWT token from IAM service for authentication

### 2. Install Dependencies

Dependencies are already installed at monorepo root level.

### 3. Configure Environment

Edit `services/noti/.env`:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://10.10.0.100:27017/hydra-noti

# Redis Configuration (for BullMQ)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Service Configuration
PORT=3002
NODE_ENV=development
```

### 4. Start Service

```bash
# Development with hot reload
npx nx serve noti

# Production build
npx nx build noti
node dist/services/noti/main.js
```

Service will be available at:
- **REST API**: http://localhost:3002/api
- **WebSocket**: ws://localhost:3002/notifications
- **Swagger Docs**: http://localhost:3002/api-docs
- **Health Check**: http://localhost:3002/api/health

---

## 🏥 Health Check

The service provides a `/health` endpoint for monitoring:

```bash
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "info": {
    "version": "1.0.0",
    "gitCommit": "1acbbb8",
    "uptime": 143.69,
    "environment": "development"
  },
  "details": {
    "database": {
      "status": "up"
    }
  }
}
```

---

## 🔐 Authentication

All API endpoints and WebSocket connections require **JWT authentication**.

### Getting a Token

First, authenticate with the IAM service:

```bash
# Login to IAM service
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "tonyh",
    "password": "123zXc_-"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "68dcf365f6a92c0d4911b619",
    "username": "tonyh"
  }
}
```

### Using the Token

**REST API:**
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:3002/api/notifications \
  -H "Authorization: Bearer $TOKEN"
```

**WebSocket:**
```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3002/notifications', {
  auth: { token: 'your-jwt-token' }
});
```

---

## 📡 REST API Endpoints

### Notifications

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/notifications` | Get all notifications (paginated) | ✅ Yes |
| GET | `/api/notifications/unread-count` | Get unread count for user | ✅ Yes |
| GET | `/api/notifications/unread` | Get unread notifications | ✅ Yes |
| GET | `/api/notifications/:id` | Get notification by ID | ✅ Yes |
| PATCH | `/api/notifications/:id/read` | Mark notification as read | ✅ Yes |
| PATCH | `/api/notifications/:id` | Update notification | ✅ Yes |
| DELETE | `/api/notifications/:id` | Soft delete notification | ✅ Yes |

### Examples

**Get all notifications:**
```bash
curl "http://localhost:3002/api/notifications?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

**Get unread count:**
```bash
curl "http://localhost:3002/api/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN"
```

**Mark as read:**
```bash
curl -X PATCH "http://localhost:3002/api/notifications/123/read" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔌 WebSocket Integration

### Client Connection

```typescript
import { io } from 'socket.io-client';

// Connect with JWT token
const socket = io('ws://localhost:3002/notifications', {
  auth: { token: 'your-jwt-token' }
});

// Connection events
socket.on('connected', (data) => {
  console.log('Connected:', data);
  // { message: 'Connected to notification service', userId: '...', rooms: [...] }
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

### Listening to Notification Events

The service emits 4 types of events:

#### 1. system.notification

```typescript
socket.on('system.notification', (notification) => {
  console.log('System Notification:', notification);
  // { title, message, severity, notificationMetadata, data, recipients }
  showNotification(notification.title, notification.message, notification.severity);
});
```

#### 2. service.event

```typescript
socket.on('service.event', (event) => {
  console.log('Service Event:', event);
  // { name, notificationMetadata, data, recipients }
  const title = generateTitleFromEvent(event.name);
  const message = generateMessageFromEvent(event.name, event.data);
  showNotification(title, message);
});
```

#### 3. service.alert

```typescript
socket.on('service.alert', (alert) => {
  console.log('Service Alert:', alert);
  // { title, message, severity, notificationMetadata, data, recipients }
  showAlert(alert.title, alert.message, alert.severity);
});
```

#### 4. agent.event

```typescript
socket.on('agent.event', (event) => {
  console.log('Agent Event:', event);
  // { name, title?, message?, severity?, notificationMetadata, data, recipients }
  const title = event.title || generateTitleFromEvent(event.name);
  const message = event.message || generateMessageFromEvent(event.name, event.data);
  showNotification(title, message, event.severity);
});
```

### Room-Based Subscriptions

When connecting, clients **automatically join rooms** based on JWT payload:

- **user:{userId}** - Notifications for specific user
- **org:{orgId}** - Notifications for organization
- **agent:{agentId}** - Notifications for agent (if exists)

No manual subscription needed - the WebSocket Gateway auto-joins rooms based on JWT.

---

## 📨 Queue Integration (BullMQ)

### Emitting Events from Other Services

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class YourService {
  constructor(
    @InjectQueue('noti') private notiQueue: Queue,
  ) {}

  async sendNotification() {
    // 1. System Notification
    await this.notiQueue.add('system.notification', {
      event: 'system.notification',
      data: {
        title: 'System Maintenance',
        message: 'The system will be down for maintenance at 2 AM',
        severity: 'high',
        metadata: {
          correlationId: 'maint-001',
          timestamp: new Date().toISOString(),
        },
        recipients: {
          broadcast: true,  // Send to all connected clients
        },
      },
    });

    // 2. Service Event
    await this.notiQueue.add('service.event', {
      event: 'service.event',
      data: {
        name: 'user.created',
        metadata: {
          correlationId: 'user-123',
          orgId: 'org-456',
          userId: 'user-789',
          timestamp: new Date().toISOString(),
        },
        data: {
          userId: 'user-789',
          username: 'john.doe',
          email: 'john@example.com',
        },
        recipients: {
          orgIds: ['org-456'],  // Send to organization
        },
      },
    });

    // 3. Service Alert
    await this.notiQueue.add('service.alert', {
      event: 'service.alert',
      data: {
        title: 'High CPU Usage',
        message: 'CPU usage is above 90% for the last 5 minutes',
        severity: 'critical',
        metadata: {
          correlationId: 'alert-001',
          timestamp: new Date().toISOString(),
        },
        recipients: {
          userIds: ['admin-1', 'admin-2'],  // Send to specific users
        },
      },
    });

    // 4. Agent Event
    await this.notiQueue.add('agent.event', {
      event: 'agent.event',
      data: {
        name: 'agent.task.completed',
        title: 'Task Completed',
        message: 'Data processing task has been completed successfully',
        severity: 'normal',
        metadata: {
          correlationId: 'task-001',
          agentId: 'agent-123',
          userId: 'user-456',
          timestamp: new Date().toISOString(),
        },
        data: {
          taskId: 'task-001',
          duration: 1234,
          recordsProcessed: 5000,
        },
        recipients: {
          agentIds: ['agent-123'],
          userIds: ['user-456'],
        },
      },
    });
  }
}
```

### Event Processing Flow

```
Service A → Emit Event → Queue (noti)
                            ↓
              NotificationProcessor (consumes)
                            ↓
                ┌───────────┴───────────┐
                ↓                       ↓
         Save to MongoDB      Emit to WebSocket
                                       ↓
                              Connected Clients
```

---

## 📊 Architecture

### Service Structure

```
services/noti/
├── src/
│   ├── modules/
│   │   └── notification/
│   │       ├── notification.schema.ts      # Mongoose schema with 4 event types
│   │       ├── notification.service.ts     # Business logic (extends BaseService)
│   │       ├── notification.controller.ts  # REST API endpoints
│   │       ├── notification.gateway.ts     # WebSocket gateway (Socket.IO)
│   │       ├── notification.module.ts      # Module configuration
│   │       └── dto/
│   │           ├── create-notification.dto.ts
│   │           ├── update-notification.dto.ts
│   │           ├── notification-response.dto.ts
│   │           └── mark-read.dto.ts
│   ├── queues/
│   │   ├── queue.config.ts                 # BullMQ configuration
│   │   ├── queue.types.ts                  # TypeScript interfaces
│   │   ├── queue.module.ts                 # Queue module
│   │   ├── producers/
│   │   │   └── notification.producer.ts    # Event producers
│   │   └── processors/
│   │       └── notification.processor.ts   # Event consumers
│   ├── app.module.ts                       # Main application module
│   └── main.ts                             # Bootstrap (REST + WebSocket)
└── .env                                    # Environment configuration
```

### Key Design Patterns

1. **Event-Driven Architecture**: All state changes emit events via BullMQ
2. **Room-Based Broadcasting**: WebSocket uses rooms (user:{id}, org:{id}, agent:{id})
3. **Polymorphic Schema**: Single schema handles 4 event types with optional fields
4. **BaseService Pattern**: RBAC and audit trail from `@hydrabyte/base`
5. **Modern Controllers**: Use @CurrentUser decorator (not BaseController)

### Database Schema

```typescript
{
  event: string,                    // system.notification | service.event | service.alert | agent.event
  title?: string,                   // For system.notification, service.alert
  message?: string,                 // For system.notification, service.alert
  severity?: string,                // low | normal | high | critical
  name?: string,                    // For service.event, agent.event
  notificationMetadata: {
    notificationId: string,
    correlationId?: string,
    orgId?: string,
    userId?: string,
    agentId?: string,
    timestamp: string
  },
  data?: object,                    // Additional event-specific data
  recipients: {
    userIds?: string[],
    orgIds?: string[],
    agentIds?: string[],
    broadcast?: boolean
  },
  deliveryStatus: string,           // pending | delivered | failed
  readByUserIds: string[],          // Track who read the notification

  // From BaseSchema
  owner: { orgId, userId, groupId, agentId, appId },
  createdBy: string,
  updatedBy: string,
  isDeleted: boolean,
  deletedAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🎯 Event Types

### 1. system.notification

**Purpose:** System-wide notifications (maintenance, updates, announcements)

**Required Fields:** title, message, severity, metadata, recipients

**Example:**
```json
{
  "event": "system.notification",
  "title": "System Maintenance",
  "message": "Scheduled maintenance tonight at 2 AM",
  "severity": "high",
  "notificationMetadata": {
    "correlationId": "maint-001",
    "timestamp": "2025-10-18T00:00:00Z"
  },
  "recipients": {
    "broadcast": true
  }
}
```

### 2. service.event

**Purpose:** Service-specific events (user.created, order.completed, etc.)

**Required Fields:** name, metadata, recipients

**Example:**
```json
{
  "event": "service.event",
  "name": "user.created",
  "notificationMetadata": {
    "correlationId": "user-123",
    "orgId": "org-456",
    "userId": "user-789",
    "timestamp": "2025-10-18T00:00:00Z"
  },
  "data": {
    "userId": "user-789",
    "username": "john.doe"
  },
  "recipients": {
    "orgIds": ["org-456"]
  }
}
```

### 3. service.alert

**Purpose:** Critical alerts requiring immediate attention

**Required Fields:** title, message, severity, metadata, recipients

**Example:**
```json
{
  "event": "service.alert",
  "title": "High CPU Usage",
  "message": "CPU usage is above 90%",
  "severity": "critical",
  "notificationMetadata": {
    "correlationId": "alert-001",
    "timestamp": "2025-10-18T00:00:00Z"
  },
  "recipients": {
    "userIds": ["admin-1", "admin-2"]
  }
}
```

### 4. agent.event

**Purpose:** Agent-specific events (thinking, tool_use, completed, etc.)

**Required Fields:** name, metadata, recipients

**Optional Fields:** title, message, severity

**Example:**
```json
{
  "event": "agent.event",
  "name": "agent.task.completed",
  "title": "Task Completed",
  "message": "Data processing completed successfully",
  "severity": "normal",
  "notificationMetadata": {
    "correlationId": "task-001",
    "agentId": "agent-123",
    "userId": "user-456",
    "timestamp": "2025-10-18T00:00:00Z"
  },
  "data": {
    "taskId": "task-001",
    "duration": 1234,
    "recordsProcessed": 5000
  },
  "recipients": {
    "agentIds": ["agent-123"],
    "userIds": ["user-456"]
  }
}
```

---

## 🛠️ Development

### Building

```bash
# Build service
npx nx build noti

# Build with watch mode
npx nx build noti --watch
```

### Testing

```bash
# Run unit tests
npx nx test noti

# Run unit tests with coverage
npx nx test noti --coverage

# Run e2e tests
npx nx test noti-e2e
```

### Linting

```bash
# Lint service
npx nx lint noti

# Lint with auto-fix
npx nx lint noti --fix
```

---

## 🧪 Manual Testing

### 1. Test REST API

```bash
# Get JWT token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get all notifications
curl "http://localhost:3002/api/notifications?limit=50" \
  -H "Authorization: Bearer $TOKEN"

# Get unread count
curl "http://localhost:3002/api/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN"

# Mark as read
curl -X PATCH "http://localhost:3002/api/notifications/123/read" \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Test WebSocket

Create a test client file `test-websocket.js`:

```javascript
const io = require('socket.io-client');

const socket = io('ws://localhost:3002/notifications', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});

socket.on('system.notification', (notification) => {
  console.log('System Notification:', notification);
});

socket.on('service.event', (event) => {
  console.log('Service Event:', event);
});

socket.on('service.alert', (alert) => {
  console.log('Service Alert:', alert);
});

socket.on('agent.event', (event) => {
  console.log('Agent Event:', event);
});
```

Run: `node test-websocket.js`

### 3. Test Queue

```bash
# Use Redis CLI to check queue
redis-cli

> KEYS bull:noti:*
> LLEN bull:noti:wait
> LLEN bull:noti:active
> LLEN bull:noti:completed
> LLEN bull:noti:failed
```

---

## 🚨 Common Issues

### Redis Connection Failed

**Problem:** `Error: connect ETIMEDOUT`

**Solution:**
- Verify Redis is running: `redis-cli ping`
- Check REDIS_HOST and REDIS_PORT in `.env`
- Ensure Redis is accessible from the service

### WebSocket Connection Failed

**Problem:** Client cannot connect to WebSocket

**Solutions:**
- Verify JWT token is valid and not expired
- Check token is sent in correct format: `auth.token` or `Authorization` header
- Verify WebSocket URL: `ws://localhost:3002/notifications`
- Check CORS settings if connecting from browser

### Not Receiving Notifications

**Problem:** Connected but not receiving events

**Solutions:**
- Check user is in correct room (userId, orgId in JWT)
- Verify recipients configuration in event data
- Check WebSocket event listeners are attached before events are emitted
- Verify Redis connection (BullMQ needs Redis)

---

## 📚 Documentation

- **Integration Guide:** [NOTIFICATION-SERVICE-INTEGRATION.md](../../docs/NOTIFICATION-SERVICE-INTEGRATION.md)
- **Requirements:** [NOTIFICATION-SERVICE-REQUIREMENTS.md](../../docs/NOTIFICATION-SERVICE-REQUIREMENTS.md)
- **Event Flows:** [NOTIFICATION-SERVICE-FLOWS-V2.md](../../docs/NOTIFICATION-SERVICE-FLOWS-V2.md)
- **Implementation Plan:** [NOTIFICATION-SERVICE-PLAN.md](../../docs/NOTIFICATION-SERVICE-PLAN.md)
- **Swagger API Docs:** http://localhost:3002/api-docs

---

## 🎓 Best Practices

### 1. Event Naming

Use descriptive, hierarchical event names:

```
✅ Good: 'user.created', 'order.completed', 'payment.failed'
❌ Bad: 'created', 'done', 'error'
```

### 2. Severity Levels

Choose appropriate severity:
- **critical**: System failures, security issues
- **high**: Important events requiring attention
- **normal**: Standard notifications
- **low**: Informational events

### 3. Recipients

Be specific with recipients to avoid unnecessary notifications:

```typescript
// ✅ Good: Target specific users/orgs
recipients: {
  userIds: ['user-123'],
  orgIds: ['org-456']
}

// ❌ Avoid: Broadcasting unless truly necessary
recipients: {
  broadcast: true
}
```

### 4. Correlation IDs

Always include correlationId for debugging and tracing:

```typescript
metadata: {
  correlationId: 'unique-request-id',
  timestamp: new Date().toISOString()
}
```

---

## 📦 Dependencies

Key packages (already installed at root):

```json
{
  "@nestjs/mongoose": "^x.x.x",
  "@nestjs/bullmq": "^x.x.x",
  "@nestjs/websockets": "^x.x.x",
  "@nestjs/platform-socket.io": "^x.x.x",
  "@nestjs/swagger": "^x.x.x",
  "mongoose": "^x.x.x",
  "bullmq": "^x.x.x",
  "socket.io": "^x.x.x",
  "class-validator": "^x.x.x",
  "class-transformer": "^x.x.x"
}
```

---

## 🤝 Contributing

When improving this service:

1. Keep patterns consistent with Template Service
2. Document all changes in this README
3. Update integration guide when adding new features
4. Add examples for new event types
5. Test thoroughly before committing

---

## 📄 License

Part of Hydra Services monorepo.

---

**Generated with Notification Service v1.0.0** 🔔
