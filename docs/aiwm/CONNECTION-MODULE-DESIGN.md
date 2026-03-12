# Connection Module - Thiết kế chi tiết

## 1. Tổng quan

### Vấn đề hiện tại

AIWM hiện có hai luồng giao tiếp tách biệt:

- **Hosted agent** (`type=hosted`): User ↔ `/ws/chat` ↔ AgentRunner ↔ LLM — full audit, full control
- **Managed agent** (`type=managed`): User ↔ Discord/Telegram ↔ Agent trực tiếp — không có log, không verify user, không kiểm soát được

### Giải pháp

Xây dựng **Connection Module** — một lớp bridge tập trung, đưa tất cả external chat provider vào AIWM pipeline. Mọi message từ Discord, Telegram (và các provider sau này) đều đi qua AIWM, được lưu dưới dạng **Action**, và xử lý bởi AgentRunner như bình thường.

---

## 2. Kiến trúc tổng quan

```
Discord User  ──WS──┐
Telegram User ──HTTP─┤
                     ▼
            [ConnectionRunner]         ← adapter per provider
                     │ normalize
                     ▼
            [RoutingService]
              - match ConnectionRoute (guildId, channelId...)
              - IAM lookup (externalId → aiwmUserId?)
              - findOrCreate Conversation
                     │
                     ▼
            [ActionService.create()]   ← full audit log
                     │
                     ▼
            Redis publish → conversation room
                     │
                     ▼
            /ws/chat AgentRunner       ← không thay đổi gì
              - LLM xử lý
              - emit actions (message, tool_use, thinking...)
                     │
                     ▼
            [ActionService.create()]   ← lưu agent actions
                     │
                     ▼
            Redis → connectionId channel
                     │
                     ▼
            [ConnectionRunner.send()]  ← forward ra platform
                     │
                     ▼
Discord/Telegram User nhận response
```

### Worker mode mới: `con`

```bash
nx run aiwm:con   # chạy ConnectionWorker, tách biệt với agt worker
```

---

## 3. Cơ chế kết nối theo provider

| Provider | Transport | Cơ chế |
|----------|-----------|--------|
| **Discord** | WebSocket persistent | Bot kết nối Discord Gateway API (discord.js), server push events |
| **Telegram** | HTTP dual-mode | Long-polling (default) hoặc Webhook (cần public URL) |

---

## 4. Entities

### 4.1 Connection

```typescript
// modules/connection/connection.schema.ts

@Schema({ timestamps: true })
export class Connection extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['discord', 'telegram'] })
  provider: string;

  @Prop({ required: true, enum: ['active', 'inactive', 'error'], default: 'active' })
  status: string;

  @Prop({ type: Object, required: true })
  config: ConnectionConfig;

  @Prop({ type: [Object], default: [] })
  routes: ConnectionRoute[];

  // owner.orgId, owner.userId từ BaseSchema
}

interface ConnectionConfig {
  botToken: string;
  applicationId?: string;   // Discord: app ID
  webhookUrl?: string;      // Telegram: webhook mode URL
  pollingMode?: boolean;    // Telegram: default true
}

interface ConnectionRoute {
  // Matching conditions
  guildId?: string;         // Discord server ID
  channelId?: string;       // Discord channel ID / Telegram chatId
  botId?: string;           // nếu multi-bot
  requireMention?: boolean; // chỉ reply khi bị @mention

  // Routing target
  agentId: string;          // ID của agent xử lý

  // Access control
  allowAnonymous?: boolean; // cho phép user ngoài org, default true
}
```

### 4.2 Action (thay thế Message)

Action là đơn vị ghi nhận mọi sự kiện trong conversation — từ message của user, thinking của agent, tool call, đến system event.

```typescript
// modules/action/action.schema.ts

// Ai thực hiện action
interface Actor {
  role: 'user' | 'agent' | 'system';

  // AIWM identity (nếu biết)
  userId?: string;    // IAM user ID
  agentId?: string;   // AIWM agent ID

  // Thông tin hiển thị (luôn có)
  displayName: string;

  // External identity (nếu đến từ Discord/Telegram)
  externalProvider?: string;   // 'discord' | 'telegram'
  externalId?: string;         // Discord userId / Telegram chatId
  externalUsername?: string;
}

@Schema({ timestamps: true })
export class Action extends BaseSchema {
  @Prop({ required: true })
  conversationId: string;

  @Prop()
  connectionId?: string;       // ref Connection nếu đến từ external provider

  @Prop({ required: true, enum: ActionType })
  type: ActionType;

  @Prop({ type: Object, required: true })
  actor: Actor;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Object })
  metadata?: ActionMetadata;

  @Prop({ type: Object })
  usage?: ActionUsage;

  @Prop({ enum: ['pending', 'processing', 'completed', 'error'], default: 'completed' })
  status: string;

  @Prop()
  parentId?: string;           // threading (reply to)
}

interface ActionMetadata {
  // tool_use
  toolName?: string;
  toolInput?: any;
  toolUseId?: string;          // link tool_use ↔ tool_result

  // tool_result
  toolResult?: any;            // raw result từ agent SDK
  toolResultId?: string;       // ref về action tool_use tương ứng

  // thinking
  thinkingContent?: string;    // nội dung thinking block (ẩn với user)

  // attachments
  attachments?: ActionAttachment[];

  // inbound từ external provider
  raw?: any;                   // raw platform event object (Discord Message, Telegram Update)
}

interface ActionUsage {
  inputTokens: number;
  outputTokens: number;
  duration: number;
}

interface ActionAttachment {
  type: 'file' | 'image' | 'video' | 'audio' | 'document';
  url: string;
  filename?: string;
  size?: number;
  mimeType?: string;
}
```

### 4.3 ActionType Enum

```typescript
// modules/action/action.enum.ts

export enum ActionType {
  // Nội dung
  MESSAGE = 'message',         // text message từ user hoặc agent
  THINKING = 'thinking',       // agent thinking block (Claude)
  TOOL_USE = 'tool_use',       // agent gọi tool/function
  TOOL_RESULT = 'tool_result', // kết quả trả về từ tool
  ERROR = 'error',             // lỗi từ agent hoặc hệ thống

  // Sự kiện
  JOINED = 'joined',           // user/agent join conversation
  LEFT = 'left',               // user/agent leave conversation
  HANDOFF = 'handoff',         // chuyển từ agent này sang agent khác
  NOTICE = 'notice',           // thông báo hệ thống vào conversation
}
```

### Bảng role × type

| Role | Type | Ví dụ |
|------|------|-------|
| `user` | `message` | User gửi "giúp tôi viết email" |
| `agent` | `message` | Agent reply text |
| `agent` | `thinking` | Claude extended thinking block |
| `agent` | `tool_use` | Agent gọi `bash(ls -la)`, MCP tool |
| `agent` | `tool_result` | Kết quả từ tool |
| `agent` | `error` | LLM timeout, context overflow |
| `agent` | `handoff` | Chuyển từ agent A → agent B |
| `system` | `joined` | User kết nối vào conversation |
| `system` | `left` | User disconnect |
| `system` | `notice` | "Agent đang bảo trì, thử lại sau" |
| `system` | `error` | Connection mất, Redis timeout, rate limit |

---

## 5. DTOs

### 5.1 Connection DTOs

```typescript
// CreateConnectionDto
{
  name: string;
  provider: 'discord' | 'telegram';
  config: {
    botToken: string;
    applicationId?: string;
    webhookUrl?: string;
    pollingMode?: boolean;
  };
  routes?: ConnectionRoute[];
}

// UpdateConnectionDto — tất cả optional
// ConnectionRouteDto
{
  guildId?: string;
  channelId?: string;
  botId?: string;
  requireMention?: boolean;
  agentId: string;
  allowAnonymous?: boolean;
}
```

### 5.2 Action DTOs

```typescript
// CreateActionDto
{
  conversationId: string;
  connectionId?: string;
  type: ActionType;
  actor: {
    role: 'user' | 'agent' | 'system';
    userId?: string;
    agentId?: string;
    displayName: string;
    externalProvider?: string;
    externalId?: string;
    externalUsername?: string;
  };
  content: string;
  metadata?: {
    toolName?: string;
    toolInput?: any;
    toolUseId?: string;
    toolResult?: any;
    toolResultId?: string;
    thinkingContent?: string;
    attachments?: ActionAttachment[];
    raw?: any;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    duration: number;
  };
  parentId?: string;
}
```

---

## 6. APIs mới / thay đổi

### 6.1 Connection API (mới)

```
POST   /connections                           # Tạo connection
GET    /connections                           # List connections (theo org)
GET    /connections/:id                       # Chi tiết
PUT    /connections/:id                       # Update
DELETE /connections/:id                       # Soft delete
POST   /connections/:id/routes                # Thêm route
DELETE /connections/:id/routes/:routeIndex    # Xóa route
POST   /connections/:id/start                 # Start connection runner
POST   /connections/:id/stop                  # Stop connection runner
GET    /connections/:id/status                # Trạng thái runtime
```

### 6.2 Action API (mới)

```
POST   /actions                                          # Tạo action (internal/agent use)
GET    /actions/conversation/:conversationId             # List actions trong conversation
GET    /actions/conversation/:conversationId/statistics  # Thống kê
GET    /actions/:id                                      # Chi tiết action
```

### 6.3 Agent API — thay đổi

**Xóa** `channels[]` field khỏi Agent schema và các DTOs liên quan.

Các API không thay đổi, chỉ bỏ `channels` trong request/response body:
- `POST /agents` — bỏ `channels` field
- `PUT /agents/:id` — bỏ `channels` field
- `GET /agents/:id` — bỏ `channels` trong response

### 6.4 Message API — deprecated

Module `message` và các endpoints `/messages/*` sẽ được thay thế dần bởi `/actions/*`.

Giữ nguyên trong giai đoạn đầu, thêm deprecation notice vào Swagger docs.

---

## 7. Files thay đổi / thêm mới

### 7.1 Files mới

```
services/aiwm/src/
├── connection-worker.module.ts            # Entry point worker mode 'con'
└── modules/
    ├── connection/
    │   ├── connection.schema.ts
    │   ├── connection.dto.ts
    │   ├── connection.service.ts
    │   ├── connection.controller.ts
    │   └── connection.module.ts
    ├── action/
    │   ├── action.schema.ts
    │   ├── action.enum.ts
    │   ├── action.dto.ts
    │   ├── action.service.ts
    │   ├── action.controller.ts
    │   └── action.module.ts
    └── connection-worker/
        ├── connection-worker.module.ts
        ├── connection-worker.service.ts   # orchestrate runners (như AgentWorkerService)
        ├── connection-runner.ts            # lifecycle 1 connection (như AgentRunner)
        ├── routing.service.ts             # resolve route + IAM lookup
        └── adapters/
            ├── base.adapter.ts            # IConnectionAdapter interface
            ├── discord.adapter.ts         # discord.js WebSocket
            └── telegram.adapter.ts        # grammy polling/webhook
```

### 7.2 Files thay đổi

| File | Thay đổi |
|------|---------|
| `modules/agent/agent.schema.ts` | Xóa `channels: ChannelConfig[]` field |
| `modules/agent/agent.dto.ts` | Xóa `channels` khỏi CreateAgentDto, UpdateAgentDto |
| `modules/agent/agent-worker/agent-runner.ts` | Xóa logic Discord/Telegram nếu có, không thay đổi WS flow |
| `app/app.module.ts` | Thêm `ConnectionModule`, `ActionModule` |
| `services/aiwm/project.json` | Thêm target `con` cho connection worker mode |

### 7.3 Files không thay đổi

- `modules/chat/` — giữ nguyên hoàn toàn
- `modules/conversation/` — giữ nguyên, `findOrCreateForUser` dùng lại
- `modules/message/` — giữ nguyên tạm thời (deprecated sau)
- `modules/agent-worker/` — giữ nguyên hoàn toàn

---

## 8. Message flow chi tiết

### 8.1 Inbound (External → AIWM)

```
1. Discord WS event / Telegram poll update
2. ConnectionRunner → adapter.on('message')
3. Normalize → NormalizedInbound:
   { provider, externalUserId, externalUsername,
     channelId, guildId?, text, attachments?, raw }
4. RoutingService.resolve(normalizedMsg, connection):
   a. Match ConnectionRoute (guildId, channelId, requireMention check)
   b. IAM lookup: tìm user có externalId này không → lấy aiwmUserId
   c. findOrCreateForUser(externalUserId, agentId, orgId)
   → { agentId, conversationId, actor }
5. ActionService.create({
     conversationId,
     connectionId: connection._id,
     type: 'message',
     actor: {
       role: 'user',
       userId: aiwmUserId?,      // nếu tìm thấy trong IAM
       displayName: externalUsername,
       externalProvider: 'discord',
       externalId,
       externalUsername
     },
     content: text,
     metadata: { attachments?, raw: platformEvent }
   })
6. Redis publish event → conversation:{conversationId} room
7. ChatGateway forward → AgentRunner socket
```

### 8.2 Outbound (AIWM → External)

```
1. AgentRunner xử lý LLM xong
2. ActionService.create({ actor: { role: 'agent', agentId }, type: 'message', content })
3. ChatGateway emit message:new vào conversation room
4. ConnectionWorkerService lắng nghe Redis → nhận event
5. Lookup connectionId từ conversation
6. ConnectionRunner.send(channelId, content)
7. adapter.sendMessage() → Discord API / Telegram Bot API
```

---

## 9. IConnectionAdapter Interface

```typescript
interface IConnectionAdapter {
  readonly provider: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  send(target: AdapterTarget, content: string, options?: SendOptions): Promise<void>;

  // Events
  on(event: 'message', handler: (msg: NormalizedInbound) => void): this;
  on(event: 'connected', handler: () => void): this;
  on(event: 'disconnected', handler: (reason: string) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
}

interface NormalizedInbound {
  provider: string;
  externalUserId: string;
  externalUsername: string;
  channelId: string;
  guildId?: string;           // Discord
  text: string;
  attachments?: any[];
  isMention?: boolean;
  raw: any;
}

interface AdapterTarget {
  channelId: string;
  threadId?: string;
  replyToId?: string;
}
```

---

## 10. Phụ lục: So sánh Message vs Action

| | Message (hiện tại) | Action (mới) |
|--|-------------------|--------------|
| **Role** | user/assistant/system/tool | user/agent/system |
| **Type** | text/thinking/tool_call/tool_result/error/system | message/thinking/tool_use/tool_result/error/joined/left/handoff/notice |
| **Actor** | `participantId` (string) | `actor` object đầy đủ (role, userId, displayName, external info) |
| **External user** | Không có | `actor.externalProvider`, `actor.externalId` |
| **Tool data** | `toolCalls[]`, `toolResults[]` arrays | `metadata.toolUseId`, `metadata.toolResult` |
| **Platform raw** | Không có | `metadata.raw` |
| **Connection ref** | Không có | `connectionId` |
| **Usage** | `promptTokens/completionTokens/totalTokens` | `inputTokens/outputTokens/duration` |
