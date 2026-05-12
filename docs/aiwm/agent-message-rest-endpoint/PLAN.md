# Plan — `POST /agents/:id/message` (gửi message tới agent qua REST)

## Mục tiêu

Cho phép gửi một message tới agent qua HTTP (không cần nối chat socket), đi đúng luồng xử lý như WS event `message:send`:
- Lưu Action (message của user)
- Route tới agent (`assistant` → Redis queue cho agt worker; `engineer` → broadcast vào conversation room qua AWS)
- Broadcast `message:new` cho các socket đang xem conversation (nếu có)

**Response của agent là bất đồng bộ** (fire-and-forget): endpoint trả ngay `{ conversationId, actionId }`. Caller lấy reply qua `GET /conversations/:id/actions` (poll) hoặc nối chat socket.

## Quyết định đã chốt

| Vấn đề | Quyết định |
|--------|-----------|
| Trả response | Fire-and-forget — endpoint trả ngay sau khi enqueue |
| conversationId | Optional trong body — có thì dùng lại, không có thì `ConversationService.resolveConversation` theo `agent.conversationMode` |

## Thiết kế

### 1. Tách logic dispatch ra service dùng chung

Hiện `handleSendMessage` (WS) và handler `chat:message-new` (Redis, từ Connection worker) đang lặp gần hết logic routing. Tạo một service mới — ví dụ `ChatDispatchService` (đặt trong `chat-gateway/` hoặc `conversation/`) với method:

```ts
dispatchUserMessage(params: {
  orgId: string;
  agentId: string;
  conversationId?: string;
  userId: string;
  username?: string;
  fullname?: string;
  content: string;
  type?: string;                 // message | system | ...
  attachments?: ...[];
  references?: ...[];
  sources?: ...[];
  workId?: string;
}): Promise<{ conversationId: string; actionId: string; skipped: boolean }>
```

Nội dung method (rút từ `handleSendMessage` lines 802–952, bỏ phần thao tác `client`/`this.server`):
1. Resolve `conversationId`: nếu không truyền → `conversationService.resolveConversation({ orgId, agentId, userId, mode: agent.conversationMode, sessionTimeoutMs, userType: 'user' })`
2. `actionService.createActionDirect(...)` — lưu message của user → lấy `actionId`
3. Check `agent.status === 'sleep'` → tạo NOTICE action + `skipAgent = true`
4. `redisPub.set('conv:trigger-platform:{convId}', 'portal', 'EX', 600)`
5. `publish chat:message-new` với payload `{ actionId, conversationId, agentId, orgId, role, content, attachments, userId, username, fullname, platform: 'portal', skipAgent, msgNonce }` — CWS/AWS subscribe sẽ:
   - broadcast `message:new` cho socket trong room
   - nếu `assistant` & `!skipAgent` → `rpush chat:task:{agentId}:{convId}` + `lpush chat:notify:{agentId}` (kích hoạt agt worker)
   - nếu `engineer` → `socketsJoin` agent sockets vào room
6. Return `{ conversationId, actionId, skipped: skipAgent }`

> Dùng lại đường `chat:message-new` (giống Connection worker — [connection-worker.service.ts:160](../../../services/aiwm/src/modules/connection-worker/connection-worker.service.ts#L160), handler [chat.gateway.ts:247](../../../services/aiwm/src/modules/chat-gateway/chat.gateway.ts#L247)) nghĩa là **không cần `this.server` trong API process** — chỉ thao tác Redis. CWS process lo phần socket.

**Refactor kèm theo (tùy chọn, khuyến nghị):** cho `ChatWsGateway.handleSendMessage` gọi `dispatchUserMessage` để xoá trùng lặp. Nếu muốn giữ "surgical" thì để gateway nguyên, chỉ thêm service mới — nhưng sẽ có 3 chỗ lặp logic. → **Cần bạn quyết: refactor gateway hay không.**

### 2. REST endpoint

Thêm vào `AgentController` ([agent.controller.ts](../../../services/aiwm/src/modules/agent/agent.controller.ts)):

```ts
@Post(':id/message')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Send a message to an agent (async — reply arrives via conversation actions / chat socket)' })
async sendMessage(
  @Param('id') agentId: string,
  @Body() dto: SendAgentMessageDto,         // { content, conversationId?, type?, attachments?, references?, sources?, workId? }
  @CurrentUser() ctx: RequestContext,
) {
  return this.dispatchService.dispatchUserMessage({
    orgId: ctx.orgId, agentId, userId: ctx.userId,
    username: ctx.username, fullname: ctx.fullname,
    conversationId: dto.conversationId,
    content: dto.content, type: dto.type,
    attachments: dto.attachments, references: dto.references,
    sources: dto.sources, workId: dto.workId,
  });
}
```

- `SendAgentMessageDto` trong `agent.dto.ts` với `class-validator`.
- Module wiring: `AgentModule` cần import được `ChatDispatchService` (kéo theo `ConversationModule`, `ActionModule`, và Redis pub client). Kiểm tra cycle — nếu nặng, đặt `ChatDispatchService` trong một module nhỏ độc lập (`ChatDispatchModule`) để cả `AgentModule` lẫn `ChatGatewayModule` import.
- Endpoint sống ở **MODE=api** (port 3330). Redis pub client phải dùng `buildRedisConfig()` (không phải constant) theo lưu ý timing trong CLAUDE.md.

### 3. Validation / quyền

- `JwtAuthGuard` — chỉ user JWT (có `orgId`).
- Verify agent tồn tại, `isDeleted: false`, `orgId === ctx.orgId` → nếu không, 404.
- (Tùy chọn) chặn nếu `agent.status` ∈ {suspended, inactive} → trả thông báo rõ ràng thay vì âm thầm enqueue.

## Files thay đổi

| File | Thay đổi |
|------|---------|
| `services/aiwm/src/modules/chat-gateway/chat-dispatch.service.ts` (mới) | Logic `dispatchUserMessage` |
| `services/aiwm/src/modules/chat-gateway/chat-dispatch.module.ts` (mới, nếu cần) | Export service |
| `services/aiwm/src/modules/agent/agent.controller.ts` | Thêm `POST :id/message` |
| `services/aiwm/src/modules/agent/agent.dto.ts` | `SendAgentMessageDto` |
| `services/aiwm/src/modules/agent/agent.module.ts` | Import `ChatDispatchModule` |
| `services/aiwm/src/modules/chat-gateway/chat.gateway.ts` | (tùy chọn) refactor `handleSendMessage` gọi service mới |
| `docs/aiwm/CHAT-WEBSOCKET-EVENTS.md` hoặc doc mới | Ghi chú endpoint REST |

## Verify

1. `./node_modules/.bin/nx build aiwm` — pass
2. TypeScript check (theo hướng dẫn CLAUDE.md)
3. Chạy `nx run aiwm:api` + `nx run aiwm:cws` + `nx run aiwm:agt`
4. `curl -XPOST .../agents/<assistantAgentId>/message -d '{"content":"hello"}'` → nhận `{ conversationId, actionId }`; kiểm tra agt worker log nhận task; `GET /conversations/:id/actions` thấy reply của agent
5. Test với `engineer` agent đang nối AWS → agent nhận `message:new`
6. Test agent `sleep` → trả về kèm NOTICE, không enqueue

## Open questions

1. **Refactor `handleSendMessage` để dùng chung service?** (giảm trùng lặp vs. giữ surgical) — đề xuất: có.
2. Endpoint có cần chặn `agent.status` không phù hợp (suspended/inactive) không, hay cứ enqueue?
3. Có cần trả thêm gì trong response không (vd `agentType`, `queued: true/false`)?
