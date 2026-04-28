# Multi-Instance Connection Worker Plan — Connection-Level Distributed Lock + Redis Dedup

**Feature:** Scale Con worker từ 1 → N instances cho HA (high availability), kèm fix dedup persistence
**Service:** AIWM — `MODE=con`
**Branch:** `feat/multi-instance-connection-worker`
**Date:** 2026-04-26
**Related:** [`MULTI-RUNNER-SCALING-V2-PLAN.md`](../agent-worker/MULTI-RUNNER-SCALING-V2-PLAN.md) (V2 cho assistant agents)

---

## 1. Bối cảnh

### Hiện trạng

```
External Platform (Discord/Telegram/Teams/Zalo)
                ↓
           con00 (single instance)
                ↓
        ConnectionRunner per Connection
                ↓
        Redis pub/sub backbone → AGT/CWS/AWS
```

**Vấn đề:**

| # | Vấn đề | Severity |
|---|--------|----------|
| 1 | con00 crash → toàn bộ Discord/Telegram/Teams/Zalo ngừng (single point of failure) | **P0** |
| 2 | `seenExternalMessageIds` lưu in-memory Set (cap 500), mất khi restart → duplicate messages | **P0** |
| 3 | Discord reconnect emit `messageCreate` lại → duplicate khi con restart đúng lúc | **P0** |

### Yêu cầu

- 2+ instances Con worker chạy đồng thời cho HA
- Failover < 60s khi 1 instance crash
- Dedup persistent qua restart
- Không phá flow hiện tại (CWS/AGT/AWS không cần thay đổi)

---

## 2. Tại sao cần kiến trúc khác V2

V2 (cho assistant agents) dùng **competing consumers** trên notification queue. Áp dụng cho Con worker **không được** vì:

| Platform | Đặc điểm | Có thể "competing consumer"? |
|----------|----------|------------------------------|
| Discord | WS persistent — bot token chỉ allow 1 WS connection | ❌ — 2 instance connect cùng token sẽ kick nhau |
| Telegram (polling) | Long-poll `getUpdates()` mark messages đã đọc | ❌ — 2 instance poll → mất tin/duplicate |
| Telegram (webhook) | Single endpoint URL | ✅ webhook có thể LB |
| Zalo Bot (polling) | Tương tự Telegram | ❌ |
| Teams webhook | Stateless HTTP | ✅ |
| Zalo OA webhook | Stateless HTTP + token refresh | ✅ |

→ Phải dùng **owner-per-connection** pattern (như V1 cũ cho AGT, không phải V2 mới).

---

## 3. Kiến trúc đề xuất

### Sơ đồ tổng quan

```
External Platforms
       │
   ┌───┴────────────────────────────────────────────┐
   │ Persistent       │ Webhook (HTTP)              │
   │ (Discord/Telegram│ (Teams/Zalo OA/Zalo Bot WH) │
   │  polling)        │                             │
   │      │           │   Webhook receiver          │
   │      │           │   (API/CWS HTTP instance)   │
   │      │           │       │                     │
   │      │           │       ▼                     │
   │      │           │  Redis: inbound:teams:{id}  │
   │      │           │         inbound:zalo-*:{id} │
   └──────┼───────────┴───────┼─────────────────────┘
          ▼                   ▼
 ┌────────────────────────────────────────────┐
 │  con00, con01 (multi-instance)             │
 │                                             │
 │  [Startup]                                  │
 │  ConnectionLockService.tryAcquire(connId)   │
 │   ↓ winner                  ↓ loser         │
 │  Spawn ConnectionRunner    Skip runner      │
 │  (bot client + adapter)                     │
 │                                             │
 │  [Subscribers — both instances]             │
 │  inbound:* / outbound:* / connection:*      │
 │  ├─ owner: process via runner               │
 │  └─ loser: filter `if !this.runners.has()`  │
 │                                             │
 │  [Health check — every 30s]                 │
 │  claimUnlockedConnections() → failover      │
 │                                             │
 │  [Lock renewal — every 15s]                 │
 │  Renew con:lock:{connId} TTL → 45s          │
 └────────────────────────────────────────────┘
          │
          ▼
   Redis Pub/Sub Backbone
   ├─ Inbound dedup: dedup:inbound:{platform}:{externalMsgId} EX 86400
   ├─ Outbound lock: lock:outbound:{actionId} EX 10 (đã có)
   ├─ Connection lock: con:lock:{connectionId} EX 45 (mới)
   └─ Channels: chat:message-new, agent:join-room, outbound:* (giữ nguyên)
```

### Nguyên tắc thiết kế

1. **Lock-based ownership per connection** — đảm bảo Discord/Telegram/Zalo bot client chỉ chạy 1 instance
2. **Pub/sub fan-out + filter** — webhook và Redis events phát đến tất cả Con instances, chỉ owner xử lý
3. **Persistent dedup** — chuyển dedup state từ RAM sang Redis, sống qua restart
4. **Failover qua lock TTL + health check** — không cần coordinator service

---

## 4. Thay đổi chi tiết

### 4.1 Phase 1 — Inbound dedup persistence

**File:** [`connection-runner.ts`](../../../services/aiwm/src/modules/connection-worker/connection-runner.ts)

**Trước:**
```typescript
private readonly seenExternalMessageIds = new Set<string>();
// ...
const dedupKey = `${msg.serverId ?? msg.channelId}:${msg.externalMessageId}`;
if (this.seenExternalMessageIds.has(dedupKey)) {
  this.logger.warn(`Duplicate inbound message skipped: ${dedupKey}`);
  return;
}
this.seenExternalMessageIds.add(dedupKey);
if (this.seenExternalMessageIds.size > 500) {
  this.seenExternalMessageIds.delete(this.seenExternalMessageIds.values().next().value!);
}
```

**Sau:**
```typescript
// Bỏ in-memory Set hoàn toàn — Redis SET NX EX là source of truth
const dedupKey = `dedup:inbound:${this.connection.platform}:${msg.serverId ?? msg.channelId}:${msg.externalMessageId}`;
const acquired = await this.redisPub.set(dedupKey, '1', 'EX', 86400, 'NX');
if (acquired !== 'OK') {
  this.logger.warn(`Duplicate inbound message skipped: ${dedupKey}`);
  return;
}
```

**Lý do TTL 86400 (24h):** Discord/Telegram messageId không bao giờ tái sử dụng trong 24h, đủ để cover restart ngắn và relay sau outage.

### 4.2 Phase 2 — `ConnectionLockService` (mới)

**File mới:** `services/aiwm/src/modules/connection-worker/connection-lock.service.ts`

```typescript
@Injectable()
export class ConnectionLockService implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectionLockService.name);
  private readonly redis: Redis;
  private readonly _instanceId: string;
  private readonly ownedLocks = new Set<string>();
  private renewTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.redis = new Redis({ ...buildRedisConfig(), lazyConnect: true });
    this._instanceId = `${process.pid}-${Date.now()}`;
  }

  get instanceId() { return this._instanceId; }

  async connect() {
    await this.redis.connect();
    this.startRenewLoop();
  }

  async tryAcquire(connectionId: string): Promise<boolean> {
    const key = `con:lock:${connectionId}`;
    const result = await this.redis.set(key, this._instanceId, 'PX', 45000, 'NX');
    if (result === 'OK') {
      this.ownedLocks.add(connectionId);
      return true;
    }
    return false;
  }

  async release(connectionId: string): Promise<void> {
    // Lua: chỉ del nếu là owner
    await this.redis.eval(
      `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
      1, `con:lock:${connectionId}`, this._instanceId,
    );
    this.ownedLocks.delete(connectionId);
  }

  private async renewAll(): Promise<void> {
    for (const connId of this.ownedLocks) {
      const key = `con:lock:${connId}`;
      const owner = await this.redis.get(key);
      if (owner === this._instanceId) {
        await this.redis.pexpire(key, 45000);
      } else {
        this.ownedLocks.delete(connId);
      }
    }
  }

  // ... startRenewLoop, releaseAll, onModuleDestroy (giống AgentLockService)
}
```

**Lưu ý:** Có thể extract base class `RedisDistributedLock` để chia sẻ với `AgentLockService`. Quyết định: **không extract trong scope này** — premature abstraction. 2 service ~50 dòng code mỗi file, copy-paste rõ ràng hơn.

### 4.3 Phase 3 — `ConnectionWorkerService` refactor

**File:** [`connection-worker.service.ts`](../../../services/aiwm/src/modules/connection-worker/connection-worker.service.ts)

**Thay đổi 1: Inject `ConnectionLockService`**
```typescript
constructor(
  // ... existing
  private readonly lockService: ConnectionLockService,
) {}
```

**Thay đổi 2: `spawnRunners()` dùng lock competition**
```typescript
private async spawnRunners() {
  const connections = await this.connectionModel.find(query).lean();
  this.logger.log(`Found ${connections.length} connection(s). Competing for locks...`);
  
  await Promise.allSettled(
    connections.map((conn) => this.trySpawnRunner(conn))
  );
}

private async trySpawnRunner(connection: ConnectionDocument) {
  const acquired = await this.lockService.tryAcquire(connection._id.toString());
  if (!acquired) {
    this.logger.log(`Skipping ${connection.name} — owned by another instance`);
    return;
  }
  await this.spawnRunner(connection);
}
```

**Thay đổi 3: Filter inbound subscribers theo ownership**

Hiện tại (mọi pmessage handler trong service):
```typescript
this.redisSub.on('pmessage', (_, channel, raw) => {
  const connectionId = extractConnId(channel);
  const runner = this.runners.get(connectionId);
  if (!runner) return; // ← guard này đã có
  runner.handleTeamsActivity(...);
});
```

Guard `if (!runner) return` đã tồn tại — **không cần thay đổi**. Loser instance tự động skip.

**Thay đổi 4: Health check → `claimUnlockedConnections()`**
```typescript
private async healthCheck() {
  await this.reconcileRunningRunners();   // existing — restart on config change
  await this.claimUnlockedConnections();  // NEW — failover
}

private async claimUnlockedConnections() {
  const connections = await this.connectionModel.find({ enabled: true, isDeleted: { $ne: true } }).lean();
  for (const conn of connections) {
    const id = conn._id.toString();
    if (this.runners.has(id)) continue;
    const acquired = await this.lockService.tryAcquire(id);
    if (acquired) {
      this.logger.log(`Claimed unlocked connection: ${conn.name} (${id})`);
      await this.spawnRunner(conn);
    }
  }
}
```

**Thay đổi 5: `onModuleDestroy()` release locks gracefully**
```typescript
async onModuleDestroy() {
  for (const [connId, runner] of this.runners.entries()) {
    await runner.stop();
    await this.lockService.release(connId);
  }
  // ...
}
```

**Thay đổi 6: Module registration**

`connection-worker.module.ts`:
```typescript
@Module({
  providers: [ConnectionWorkerService, ConnectionLockService, /* ... */],
})
export class ConnectionWorkerModule {}
```

### 4.4 Phase 4 — Optional: pinning support (`CONNECTION_IDS`)

Tương tự `AGENT_IDS` cho AGT, để chỉ định instance riêng cho high-priority connections:
```typescript
private readonly connectionIdFilter: string[] = process.env.CONNECTION_IDS
  ? process.env.CONNECTION_IDS.split(',').filter(Boolean)
  : [];
```

**Skip nếu không cần:** chỉ thêm khi có yêu cầu cụ thể. Default là empty → tất cả instance compete cho tất cả connections.

### 4.5 Phase 5 — `ecosystem.config.js`

Thêm `con01`:
```js
{
  name: 'core.aiwm.con01',
  script: './dist/services/aiwm/main.js',
  exec_mode: 'fork',
  env: { NODE_ENV: 'production', MODE: 'con', SERVICE_NAME: 'aiwm' },
  env_file: '.env',
  error_file: './logs/aiwm-con-01-error.log',
  out_file: './logs/aiwm-con-01-out.log',
  max_memory_restart: '1G',
  kill_timeout: 15000,
  autorestart: true,
}
```

---

## 5. Flow examples

### Case A: Startup bình thường

```
T=0: con00 + con01 cùng start
     con00.spawnRunners():
       - connection A → tryAcquire(A) OK → spawn runner A
       - connection B → tryAcquire(B) OK → spawn runner B
     con01.spawnRunners() (vài ms sau):
       - connection A → tryAcquire(A) FAIL → skip
       - connection B → tryAcquire(B) FAIL → skip

T=30s: con01 health check → claimUnlockedConnections():
       - không có connection unlocked → no-op

→ Tất cả connections do con00 own. con01 chờ failover.
```

### Case B: Discord message inbound (con00 owns)

```
User Discord → Discord WS → con00.DiscordAdapter._handleMessage()
                          → ConnectionRunner._handleInbound()
                          → SET dedup:inbound:discord:... NX OK
                          → save Action
                          → Redis pub: agent:join-room
                          → Redis pub: chat:message-new

con01: không nhận messageCreate (Discord client không chạy)
```

### Case C: Teams webhook (con00 owns)

```
Teams webhook → API HTTP instance → SET signature OK
                                  → Redis pub: inbound:teams:{connId}

con00 nhận pmessage:
  runner = this.runners.get(connId) → exists → process
con01 nhận pmessage:
  runner = this.runners.get(connId) → undefined → skip ✓

→ Chỉ con00 xử lý.
```

### Case D: con00 crash

```
T=0:    con00 crash mid-processing
T=0-45s: con:lock:{*} chưa expire → con01 không claim được (mọi tryAcquire FAIL)
        → Discord/Telegram polling ngừng (con00 đã chết)
        → Webhook events vào Redis pub → con01 nhận → skip (không có runner)
        → 45s downtime cho TẤT CẢ connections

T=45s:  con:lock:{*} expire (Redis tự xóa)
T=45-75s: con01 health check chạy (chu kỳ 30s) → claimUnlockedConnections()
         → tryAcquire OK → spawn runner cho từng connection
         → Discord client reconnect, Telegram polling khôi phục
         → Webhook events resume processing

→ Total downtime per connection: 45-75s
```

### Case E: Outbound message (engineer agent → Discord)

```
Engineer agent → AWS gateway: emit message:send
AWS:           save Action → SET lock:outbound:{actionId} NX OK
               → Redis pub: outbound:message

con00 nhận: 
  acquire lock:outbound (đã acquired bởi AWS — wait... actually lock:outbound was set by AWS)
  → Actually AWS sets the lock, then publishes. con00/con01 both subscribe.
  → con00 finds runner for connId → process → adapter.send(Discord)
  → con01 finds NO runner → skip

→ Chỉ owner gửi 1 lần. Lock cũ `lock:outbound:{actionId}` vẫn đảm bảo dedup.
```

---

## 6. Edge cases & Safeguards

### 6.1 Lock TTL expire khi runner đang xử lý webhook dài

**Risk:** xử lý webhook >45s → renew miss → con01 claim → 2 runner cho 1 connection.

**Mitigation:** Renew interval 15s, TTL 45s → có 3 lần renew window. Không có webhook nào xử lý >45s thực tế (Discord max 15s, Teams max 15s, Zalo OA max 30s).

### 6.2 con00 + con01 cùng start, race condition spawn

**Risk:** cả 2 cùng `tryAcquire(connectionId)` đồng thời.

**Mitigation:** SET NX atomic. Chỉ 1 win. Loser nhận `result !== 'OK'` → skip.

### 6.3 Webhook event mất khi owner đang restart

**Risk:** webhook publish vào Redis pub/sub → owner offline → cả 2 instance nhận nhưng chỉ owner có runner. Nếu owner đang chết → message bị skip ở instance kia.

**Trade-off:** đây là limit của pub/sub vs pull-queue. Acceptable vì:
- Discord/Telegram có retry tự động
- Teams retry 3 lần với exponential backoff
- Zalo OA retry 5 lần

**Future work:** chuyển `inbound:*` từ pub/sub sang LIST + BRPOP để buffer events qua restart. Phase 2 plan riêng.

### 6.4 Dedup Redis key không expired vì TTL quá dài

**Risk:** key `dedup:inbound:*` tích lũy nếu volume lớn.

**Tính toán:** 1000 msg/giờ × 24h = 24,000 keys. ~50 bytes each → ~1.2MB. Negligible.

### 6.5 Discord bot client reconnect storm khi failover

**Risk:** con01 spawn N runners đồng thời → N Discord WS connections cùng lúc → Discord rate limit (1/5s per token).

**Mitigation:** Discord.js có built-in queue, không có rate limit issue. Verified theo discord.js docs.

### 6.6 In-flight message khi crash

**Risk:** con00 đã pop tin từ Discord, đang process, crash giữa chừng → tin mất.

**Mitigation:** Chấp nhận trade-off. Discord không có "ack" pattern như queue. Để bù: 
- Save Action với role=user TRƯỚC khi process → có audit trail
- User có thể gửi lại nếu không thấy response trong vài giây

---

## 7. Files cần thay đổi

| File | Loại | Mô tả |
|------|------|-------|
| `services/aiwm/src/modules/connection-worker/connection-runner.ts` | Medium | Thay `seenExternalMessageIds` Set → Redis SET NX |
| `services/aiwm/src/modules/connection-worker/connection-lock.service.ts` | New | ConnectionLockService (mới) |
| `services/aiwm/src/modules/connection-worker/connection-worker.service.ts` | Major | `trySpawnRunner` lock check, `claimUnlockedConnections`, lifecycle hooks |
| `services/aiwm/src/modules/connection-worker/connection-worker.module.ts` | Minor | Register `ConnectionLockService` provider |
| `ecosystem.config.js` | Minor | Add `core.aiwm.con01` entry |

**Không thay đổi:**
- AGT, CWS, AWS gateway (kiến trúc hoàn toàn độc lập)
- Webhook controller (vẫn publish Redis như cũ)
- Adapter files (DiscordAdapter, TelegramAdapter, ...)
- Connection schema
- Routing service

---

## 8. Phân tích conflict với CWS / Agent Worker

| Khía cạnh | Đánh giá |
|----------|---------|
| **Redis pub/sub channels** | ✅ Phân chia rõ ràng. Con worker dùng `inbound:*`, `outbound:*`, `connection:*`. AGT dùng `chat:notify:*`, `chat:cmd:*`, `chat:response:*`. CWS dùng `chat:message-new`, `chat:response:*`. Không overlap. |
| **`outbound:message` channel** | ✅ Có 3 publishers (AWS gateway, CWS, AGT channel-send tool) — đã có `lock:outbound:{actionId}` EX 10 NX dedup cross-instance. Hoạt động đúng ngay khi thêm con01. |
| **MongoDB writes** | ✅ Action collection có nhiều writers, mỗi write có actionId riêng. Không có shared mutable state. |
| **Lock keys** | ✅ Tên prefix khác nhau: `agt:conv:*` (AGT), `con:lock:*` (Con — mới), `lock:chat-msg:*` (CWS), `lock:outbound:*` (chung). Không đè. |
| **In-memory state** | ✅ Hoàn toàn độc lập per process — discord.js Client (Con), Socket.IO server (CWS/AWS), AbortController (AGT). |
| **Lifecycle dependencies** | ✅ Cả 3 module có thể start/stop độc lập. Không có thứ tự bắt buộc. |

**Kết luận:** Không có conflict. Có thể deploy con01 mà không restart CWS/AGT/AWS.

---

## 9. Acceptance Criteria

- [ ] 2 instances con00 + con01 chạy đồng thời. Mỗi connection do đúng 1 instance own.
- [ ] Inbound dedup hoạt động qua restart: gửi tin → restart con00 → Discord retry messageCreate → tin không bị duplicate.
- [ ] Failover: kill con00 → trong vòng 60-75s, con01 claim tất cả connections, Discord/Telegram resume hoạt động.
- [ ] Webhook (Teams/Zalo OA) → đến đúng owner instance, không double-process.
- [ ] Outbound (engineer agent → Discord): chỉ 1 message gửi xuống Discord, không có duplicate.
- [ ] Cross-module: chat từ Discord user → assistant agent (qua CWS+AGT V2) → response về Discord — flow vẫn hoạt động đúng.
- [ ] TypeScript build pass, lint pass.

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Failover 45-75s gây user experience kém | Medium | Medium | Document expected behavior, monitor crash frequency, alert nếu > 1 lần/tuần |
| Webhook mất khi owner offline | Low | Low-Medium | Platform retry tự động cover. Future: chuyển sang LIST queue. |
| Lock không release khi con crash hard (kill -9) | Low | Low | TTL tự expire 45s → no leak |
| Dedup Redis growth | Very Low | Low | 24h TTL tự cleanup |
| Discord rate limit khi mass spawn | Very Low | Low | Discord.js queue handles it |
| Con instance memory leak qua thời gian | Medium | Medium | pm2 max_memory_restart 1G + autorestart đã có |

---

## 11. Implementation Phases

### Phase 1 — Inbound dedup (1h)
- Thay `seenExternalMessageIds` Set sang Redis SET NX trong `connection-runner.ts`
- Test: gửi message → restart con → resend → verify không duplicate
- **Có thể deploy độc lập (vẫn 1 con instance)** — fix một bug riêng

### Phase 2 — ConnectionLockService (1h)
- Tạo file mới với 4 methods: `tryAcquire`, `release`, `renewAll`, `connect`
- Reuse pattern từ `AgentLockService`
- Register provider trong module

### Phase 3 — ConnectionWorkerService refactor (2h)
- `trySpawnRunner` với lock check
- `claimUnlockedConnections` trong health check
- Release locks trong `onModuleDestroy`
- Logging update để track ownership

### Phase 4 — Ecosystem config (15 phút)
- Add `core.aiwm.con01` entry
- Update comment block

### Phase 5 — Testing (2h)
- Test scenarios: startup race, normal flow, failover, restart, dedup persistence
- Verify cross-module integration: Discord → assistant agent (via V2) → Discord

### Phase 6 — Deploy (30 phút)
- Phase 6.1: deploy Phase 1 trước, verify dedup → 1-2 ngày soak
- Phase 6.2: deploy Phase 2-4 + start con01, verify failover

**Total estimated effort:** ~7 hours

---

## 12. Migration path

### Stage 1: Phase 1 only (deploy ngay)
- Build + restart con00 với Redis dedup
- Vẫn 1 instance, không thay kiến trúc
- Risk: minimal — chỉ thay implementation của dedup
- Rollback: revert commit nếu có vấn đề

### Stage 2: Phase 2-5 (sau khi Stage 1 stable 1-2 ngày)
- Build + restart con00 với new lock logic
- Start con01
- Monitor logs verify lock distribution và failover

### Rollback plan
- Nếu Stage 2 fail: stop con01, revert con00 code, restart
- Lock keys (`con:lock:*`) sẽ tự expire → không leak state
- Dedup keys (`dedup:inbound:*`) compatible giữa V1/V2 — không cần clear

---

## 13. Open Questions / Future Work

1. **Webhook reliability cho failover** — chuyển từ pub/sub sang LIST + BRPOP để buffer events qua restart. Phase 2 plan riêng nếu thấy thực sự cần (sau 1-2 tháng monitoring).

2. **Connection-level health metrics** — emit metrics khi ownership change, lock acquire/release. Tích hợp vào MONA service.

3. **Geographic distribution** — nếu cần Con worker chạy ở multiple regions, cần thêm region-aware routing. Out of scope.
