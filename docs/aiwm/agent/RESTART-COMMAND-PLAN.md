# Restart Command for Assistant Agents — Plan

## Bối cảnh

`POST /agents/:id/restart` hiện tại với assistant agent **chỉ update DB status = inactive** và gọi `sendLifecycleCommandToNode()` — vốn chỉ áp dụng cho engineer agent có `nodeId`. Có TODO ở [agent.service.ts:1909](../../../services/aiwm/src/modules/agent/agent.service.ts#L1909): `// TODO: handle non-nodeId agents (self-deployed engineer / assistant)`.

Hệ quả: AgentRunner đang chạy trong `agt` worker không nhận được tín hiệu nào → vẫn chạy tiếp với config cũ.

`/reload` slash command có sẵn nhưng **không đủ** vì:
- Chỉ patch 4 field: `accessToken`, `instruction`, `deployment`, `settings`
- Không refresh `mcpServers`, `allowedFunctions`, `allowedToolIds`, `agentType`, `agentName`, `guardrails`, `browserCtx`
- Không reset state: `abortMap`, `processingMap`, conversation history cache

## Mục tiêu

Khi gọi `POST /agents/:id/restart` với agent type `assistant`: `AgentRunner` đang chạy ở `agt` instance đang giữ lock được **tear down hoàn toàn và spawn lại từ đầu** với toàn bộ config mới nhất từ DB — như khi worker mới khởi động.

## Out of scope

- Restart cho engineer agent (giữ nguyên flow `sendLifecycleCommandToNode`)
- Slash command `/restart` trong chat
- UI button restart
- Queue/defer restart khi agent busy (sẽ abort luôn conversation đang gen)

## Kiến trúc

### Redis channel mới (broadcast)

**Tên:** `agent:worker:cmd`

**Lý do chọn broadcast thay vì per-agent channel `aiwm:agent:cmd:{agentId}`:**
- Per-agent yêu cầu subscribe/unsubscribe động theo lock ownership → race condition khi instance vừa release lock và instance khác chưa kịp subscribe.
- Số `agt` instance trong thực tế nhỏ (1–3) và tần suất restart thấp → tối ưu network không đáng so với rủi ro lifecycle.
- Filter bằng `runners.has(agentId)` ở consumer rất rẻ (Map lookup).

**Payload:**
```ts
type AgentWorkerCmdEvent = {
  type: 'restart';
  agentId: string;
  requestedBy: string;
  reason?: string;
  ts: number;
};
```

### Flow end-to-end

```
Client → POST /agents/:id/restart (assistant)
  │
  ▼
AgentService.restartAgent()
  ├─ Update DB: status = 'inactive'
  ├─ agent.logs += 'Restart requested'
  ├─ if agent.type === 'assistant':
  │     redisPub.publish('agent:worker:cmd', { type:'restart', agentId, requestedBy, ts })
  └─ return { success: true } ──────────────────────► Client (immediate)

[All `agt` instances]
  AgentWorkerService subscriber receives event
  ├─ if !runners.has(agentId) → ignore (lock held by another instance)
  ├─ if restartingSet.has(agentId) → ignore (dedup in-flight)
  └─ restartRunnerOnDemand(agentId):
        1. restartingSet.add(agentId)
        2. runner.abortAll('restart')   // abort tất cả conv đang gen, publish system message
        3. await runner.stopAsync()     // await BLPOP consumer thoát hẳn
        4. teardown: redisBlockingMap, runners, runnerConfigHash
        5. Re-fetch agent từ DB (config có thể đã đổi)
        6. lockService.tryAcquire(agentId) lại (an toàn — không release giữa chừng)
        7. spawnRunner(agent)           // gọi connectInternal → new AgentRunner(...)
        8. agentService.addLog 'Runner restarted on-demand'
        9. restartingSet.delete(agentId)

[Nếu không instance nào giữ lock — rare]
  Không ai chạy restartRunnerOnDemand
  → Health check 30s sau (claimUnlockedAgents) sẽ spawn fresh từ DB
  → API vẫn trả success vì DB đã được update
```

## Touch points

| File | Thay đổi |
|---|---|
| [services/aiwm/src/config/redis.config.ts](../../../services/aiwm/src/config/redis.config.ts) | + `REDIS_CHANNEL_AGENT_WORKER_CMD = 'agent:worker:cmd'`<br>+ `type AgentWorkerCmdEvent` |
| [services/aiwm/src/modules/agent/agent.service.ts](../../../services/aiwm/src/modules/agent/agent.service.ts) (line ~1908) | Bỏ TODO. Thêm publish `AgentWorkerCmdEvent` khi `agent.type === 'assistant'`. Engineer flow giữ nguyên. Cần inject Redis client (kiểm tra module hiện có chưa). |
| [services/aiwm/src/modules/agent-worker/agent-runner.ts](../../../services/aiwm/src/modules/agent-worker/agent-runner.ts) | + `abortAll(reason: string)`: abort tất cả `abortMap`, publish system message cho mỗi conv.<br>`stop()` → `stopAsync(): Promise<void>`: track `consumerStoppedPromise`, await với race timeout 6s để đảm bảo BLPOP loop thoát hẳn trước khi spawn runner mới (tránh 2 consumer cùng BLPOP). |
| [services/aiwm/src/modules/agent-worker/agent-worker.service.ts](../../../services/aiwm/src/modules/agent-worker/agent-worker.service.ts) | + `startWorkerCmdSubscriber()` gọi từ `onModuleInit` (sau `startInstructionSubscriber`).<br>+ `restartingSet: Set<string>` để dedup.<br>+ `restartRunnerOnDemand(agentId)` helper.<br>Refactor `restartUpdatedAgents` để reuse phần teardown.<br>Update `onModuleDestroy` await `stopAsync`. |
| `services/aiwm/src/modules/agent/agent.module.ts` (nếu cần) | Provide Redis client cho `AgentService` nếu chưa có |

## Thay đổi chi tiết

### 1. `redis.config.ts`

```ts
export const REDIS_CHANNEL_AGENT_WORKER_CMD = 'agent:worker:cmd';

export type AgentWorkerCmdEvent = {
  type: 'restart';
  agentId: string;
  requestedBy: string;
  reason?: string;
  ts: number;
};
```

### 2. `AgentService.restartAgent()` (assistant branch)

Sau block update DB hiện tại, trước `sendLifecycleCommandToNode`:

```ts
if (agent.type === 'assistant') {
  const event: AgentWorkerCmdEvent = {
    type: 'restart',
    agentId,
    requestedBy: context.userId,
    ts: Date.now(),
  };
  await this.redisPub.publish(REDIS_CHANNEL_AGENT_WORKER_CMD, JSON.stringify(event));
  this.logger.log('Published restart command', { agentId });
} else {
  await this.sendLifecycleCommandToNode(agent, MessageType.AGENT_RESTART, true, context);
}
```

Lưu ý: `restartAgent` **không await** runner restart hoàn tất — return success ngay sau khi publish. Caller chỉ biết "lệnh đã được nhận", không biết runner đã spawn xong chưa. Acceptable vì chu trình restart ~1–2s.

### 3. `AgentRunner.abortAll()` + `stopAsync()`

```ts
abortAll(reason = 'restart'): void {
  for (const [convId, controller] of this.abortMap.entries()) {
    try {
      controller.abort();
      this.publishSystemMessage(
        convId,
        `Agent đang restart (${reason}). Cuộc hội thoại sẽ tiếp tục sau vài giây.`,
      );
    } catch (err) {
      this.logger.warn(`abortAll failed for conv=${convId}: ${(err as Error).message}`);
    }
  }
  this.abortMap.clear();
}

async stopAsync(): Promise<void> {
  this.isShuttingDown = true;
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
  this.cmdSubRedis?.disconnect();
  this.cmdSubRedis = null;
  if (this.browserInstanceManager) {
    await this.browserInstanceManager.stop().catch(() => {});
  }
  // Wait for BLPOP consumer loop to exit (tracked via consumerStoppedPromise)
  if (this.consumerStoppedPromise) {
    await Promise.race([
      this.consumerStoppedPromise,
      new Promise((r) => setTimeout(r, 6000)),
    ]);
  }
  this.writeLog('info', 'Runner stopped');
  this.logger.log('Stopped');
}
```

`startConsumer()` cần resolve `consumerStoppedPromise` khi loop break:

```ts
private consumerStoppedPromise: Promise<void> | null = null;
private resolveConsumerStopped: (() => void) | null = null;

private startConsumer() {
  this.consumerStoppedPromise = new Promise<void>((resolve) => {
    this.resolveConsumerStopped = resolve;
  });
  const consume = async () => {
    while (!this.isShuttingDown) { /* BLPOP loop */ }
    this.resolveConsumerStopped?.();
  };
  consume();
}
```

`stop()` cũ giữ lại nếu còn caller sync? → Kiểm tra trong implement, nếu chỉ có `onModuleDestroy` + `restartUpdatedAgents` thì migrate hết sang `stopAsync`.

### 4. `AgentWorkerService.startWorkerCmdSubscriber()` + `restartRunnerOnDemand()`

```ts
private restartingSet = new Set<string>();
private redisCmdSub: Redis | null = null;

private async startWorkerCmdSubscriber() {
  this.redisCmdSub = new Redis(redisConfig);
  await this.redisCmdSub.subscribe(REDIS_CHANNEL_AGENT_WORKER_CMD);
  this.redisCmdSub.on('message', (channel, raw) => {
    if (channel !== REDIS_CHANNEL_AGENT_WORKER_CMD) return;
    this.handleWorkerCmd(raw).catch((err) =>
      this.logger.error(`handleWorkerCmd error: ${err.message}`, err.stack),
    );
  });
  this.logger.log(`Subscribed to ${REDIS_CHANNEL_AGENT_WORKER_CMD}`);
}

private async handleWorkerCmd(raw: string) {
  let event: AgentWorkerCmdEvent;
  try { event = JSON.parse(raw); } catch { return; }
  if (event.type !== 'restart') return;

  const { agentId } = event;
  if (!this.runners.has(agentId)) return;        // not owned by this instance
  if (this.restartingSet.has(agentId)) return;   // dedup
  await this.restartRunnerOnDemand(agentId, event.requestedBy);
}

private async restartRunnerOnDemand(agentId: string, requestedBy: string): Promise<void> {
  this.restartingSet.add(agentId);
  try {
    const runner = this.runners.get(agentId);
    if (!runner) return;

    this.logger.log(`[restart] tearing down runner ${agentId}`);
    runner.abortAll('restart');
    await runner.stopAsync();

    this.redisBlockingMap.get(agentId)?.disconnect();
    this.redisBlockingMap.delete(agentId);
    this.runners.delete(agentId);
    this.runnerConfigHash.delete(agentId);

    const agent = await this.agentModel
      .findOne({ _id: agentId, isDeleted: { $ne: true } })
      .select('+secret')
      .lean();
    if (!agent) {
      this.logger.warn(`[restart] agent ${agentId} not found after teardown`);
      await this.lockService.release(agentId);
      return;
    }

    // Re-acquire lock (an toàn — health check khác có thể đã claim trong khoảng giây bị down)
    const reacquired = await this.lockService.tryAcquire(agentId);
    if (!reacquired) {
      this.logger.log(`[restart] lock no longer owned by this instance, skipping respawn`);
      return;
    }

    await this.spawnRunner(agent as unknown as AgentDocument);
    await this.agentService.addLog(agentId, {
      level: 'info',
      message: 'Runner restarted on-demand',
      data: { requestedBy },
    });
  } finally {
    this.restartingSet.delete(agentId);
  }
}
```

Refactor `restartUpdatedAgents`: extract phần teardown thành helper private (`teardownRunner(agentId)`) để cả 2 cùng dùng.

## Edge cases

| Case | Xử lý |
|---|---|
| Runner busy (đang gen LLM) | Vẫn restart. `abortAll` abort tất cả `AbortController`, publish system message tới mỗi conv |
| Agent type không phải assistant | `restartAgent` skip publish, fallback `sendLifecycleCommandToNode` như cũ |
| Không instance nào giữ lock | Không ai chạy `restartRunnerOnDemand`. Health check 30s sau spawn fresh từ DB. API vẫn success vì DB đã update |
| Multi-instance nhận message | Filter bằng `runners.has(agentId)`. Chỉ một instance xử lý |
| Restart chồng nhau (gọi 2 lần liên tiếp) | `restartingSet` dedup. Lần 2 ignore |
| Lock bị mất giữa teardown và respawn | `tryAcquire` lại trước `spawnRunner`. Nếu fail → bỏ qua, để health check claim |
| Pending in-memory tasks (`pendingTasks`) | Bị mất. Acceptable cho semantic restart. Log warning số lượng tasks bị mất khi teardown |
| BLPOP message in-flight khi tear down | `stopAsync` await consumer loop thoát hẳn (race timeout 6s) → tránh 2 consumer cùng BLPOP sau respawn |
| Browser context đang mở | `runner.stop()` đã `browserInstanceManager.stop()`. `stopAsync` await nó |
| Conversation history cache | Bị mất khi tạo runner mới — chấp nhận, message tiếp theo sẽ load lại từ DB |

## Risks

- **5–6 giây downtime** giữa stop và spawn: message tới Redis queue trong khoảng đó vẫn nằm trong Redis, runner mới sẽ consume. Không mất data.
- **Conversation đang generate bị abort**: user perception khó chịu. Mitigation: publish system message rõ ràng trước khi abort.
- **Refactor `stop()` → `stopAsync()`**: phải update tất cả caller (`onModuleDestroy`, `restartUpdatedAgents`) để await. Cần grep cẩn thận.
- **Nếu Redis pub/sub mất message** (rare — Redis pub/sub không persistent): runner không restart, nhưng DB đã update `inactive`. Health check sẽ phát hiện hash mismatch (nếu config có thay đổi) hoặc... thực ra **không phát hiện được nếu config không đổi**. Mitigation: chấp nhận, vì Redis pub/sub trong cùng datacenter cực kỳ ổn định. Nếu cần guarantee thì phải dùng BullMQ — overkill cho use case này.

## Verification

```bash
# Build & type check
nx run aiwm:build
npx tsc --noEmit -p services/aiwm/tsconfig.app.json

# Manual test
nx run aiwm:api    # terminal 1
nx run aiwm:agt    # terminal 2 (xem log spawn)

# Trigger restart
curl -X POST http://localhost:3003/agents/<assistant-id>/restart \
  -H "Authorization: Bearer <token>"

# Expected log sequence trong agt terminal:
# [restart] tearing down runner <id>
# Stopped
# Runner started: <name> (<id>)
# Runner restarted on-demand
```

**Test cases:**
1. Restart khi idle → tear down + respawn sạch
2. Restart khi đang generate → conv nhận system message "Agent đang restart...", conv mới tiếp tục bình thường sau ~2s
3. Restart 2 lần liên tiếp → lần 2 bị dedup
4. Restart khi agent ở instance khác → instance đó xử lý, instance hiện tại ignore
5. Update agent config (vd đổi instructionId) → restart → runner mới load instruction mới (verify qua `/inspect`)
6. Restart agent type engineer → flow cũ `sendLifecycleCommandToNode` không bị ảnh hưởng

## Micro-tasks (cho implementation)

1. Thêm constant + type vào `redis.config.ts`
2. Thêm `consumerStoppedPromise` + tracking vào `agent-runner.ts` `startConsumer`
3. Thêm `abortAll()` vào `agent-runner.ts`
4. Đổi `stop()` → `stopAsync()` trong `agent-runner.ts`
5. Update caller `stopAsync` trong `agent-worker.service.ts` `onModuleDestroy`
6. Extract helper `teardownRunner(agentId)` trong `agent-worker.service.ts`
7. Refactor `restartUpdatedAgents` dùng helper teardown
8. Thêm `restartingSet` + `restartRunnerOnDemand()` vào `agent-worker.service.ts`
9. Thêm `startWorkerCmdSubscriber()` + `handleWorkerCmd()`, gọi từ `onModuleInit`
10. Inject Redis client vào `AgentService` (kiểm tra module hiện trạng)
11. Update `AgentService.restartAgent()` publish event cho assistant, bỏ TODO
12. Build + type check
13. Manual test theo checklist
