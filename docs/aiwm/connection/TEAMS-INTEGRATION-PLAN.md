# MS Teams Integration Plan — Connection Worker

## Overview

Thêm Microsoft Teams vào Connection Worker như platform thứ 3, bên cạnh Discord và Telegram.

**SDK:** `@microsoft/agents-sdk` (Microsoft 365 Agents SDK — replacement cho botbuilder, MIT license, free, không cần Office 365 license hay Azure subscription để self-host)

---

## Architecture

### Message Flow

```
Inbound:
  Teams → POST /connections/:id/webhook (api mode)
    → verify Teams signature + parse Activity
    → publish Redis: inbound:teams:{connectionId}
    → con worker subscribe
    → ConnectionRunner._handleInbound()     ← reuse toàn bộ
    → Redis: chat:message-new → Agent

Outbound:
  Agent reply → Redis: outbound:message
    → con worker → TeamsAdapter.send()
    → Graph API → Teams channel
```

API mode chỉ verify + forward. Toàn bộ routing, slash commands, audit log, outbound handling nằm trong `con` worker — không thay đổi.

### TeamsAdapter — stateless

Teams không hỗ trợ long-polling. Bot nhận message qua webhook (Teams POST vào server). Do đó TeamsAdapter không có persistent connection như Discord WebSocket.

- `start()` — validate credentials, lấy OAuth token ban đầu
- `stop()` — cleanup token
- `send()` — gọi Graph API để gửi message
- `sendTyping()` — gọi Graph API typing indicator
- Không có event loop — message đến qua Redis bridge từ API mode

---

## Schema Changes

### 1. `ConnectionProvider`

```typescript
// Before
export type ConnectionProvider = 'discord' | 'telegram';

// After
export type ConnectionProvider = 'discord' | 'telegram' | 'teams';
```

### 2. `ConnectionConfig`

```typescript
export interface ConnectionConfig {
  // Discord / Telegram
  botToken?: string;

  // Discord (rename từ applicationId) + Teams (Microsoft App ID)
  appId?: string;

  // Teams only
  appPassword?: string;      // Azure AD client secret
  appToken?: string;         // cached OAuth bearer token (runtime)
  appTokenExpiresAt?: Date;  // token expiry
  tenantId?: string;         // Azure AD tenant ID

  // Telegram only
  webhookUrl?: string;
  pollingMode?: boolean;
}
```

**Migration:** `applicationId` → `appId` trong existing Discord records.

### 3. `ConnectionRoute`

```typescript
export interface ConnectionRoute {
  serverId?: string;         // Discord: guildId | Teams: teamId (rename từ guildId)
  channelId?: string;        // Discord channel / Telegram chatId / Teams channelId
  botId?: string;
  tenantId?: string;         // Teams: Azure tenant ID (NEW)
  requireMention?: boolean;
  agentId: string;
  allowAnonymous?: boolean;
}
```

**Migration:** `guildId` → `serverId` trong existing Discord records.

### 4. `NormalizedInbound` (base.adapter.ts)

```typescript
export interface NormalizedInbound {
  provider: string;
  externalUserId: string;
  externalUsername: string;
  channelId: string;
  serverId?: string;         // rename từ guildId
  tenantId?: string;         // Teams only (NEW)
  serviceUrl?: string;       // Teams only — cần để reply (NEW)
  conversationId?: string;   // Teams only — Teams conversation reference (NEW)
  text: string;
  attachments?: any[];
  isMention?: boolean;
  raw: any;
}
```

---

## New Files

### `teams.adapter.ts`

```
services/aiwm/src/modules/connection-worker/adapters/teams.adapter.ts
```

Responsibilities:
- `start()`: OAuth2 client credentials flow → lấy bearer token, lưu vào `config.appToken` + `config.appTokenExpiresAt`
- `processActivity(body, headers)`: verify Teams signature, parse Activity → emit `message` event với `NormalizedInbound`
- `send(target, text)`: POST Graph API `v1/teams/{teamId}/channels/{channelId}/messages` với bearer token
- `sendTyping(target)`: POST Graph API typing indicator
- `_refreshTokenIfNeeded()`: check expiry, refresh trước 5 phút

### `teams-webhook.controller.ts`

```
services/aiwm/src/modules/connection/teams-webhook.controller.ts
```

Endpoints:
- `POST /connections/:id/webhook` — nhận Teams Activity, verify, publish Redis `inbound:teams:{id}`
- `GET /connections/:id/webhook` — Teams URL verification challenge (trả về `validationToken` query param)

---

## Modified Files

### `connection-runner.ts`

- `_createAdapter()`: thêm `case 'teams'`
- Subscribe Redis channel `inbound:teams:{connectionId}` trong `start()`
- Unsubscribe trong `stop()`

### `connection-worker.service.ts`

- Subscribe Redis channel pattern `inbound:teams:*` khi init
- Forward payload → runner tương ứng theo connectionId

### `connection.schema.ts`

- Update `ConnectionProvider` enum
- Update `ConnectionConfig` interface
- Update `ConnectionRoute` interface (`guildId` → `serverId`, thêm `tenantId`)
- Update Mongoose schema validators

### `discord.adapter.ts`

- Đổi `guildId` → `serverId` trong `NormalizedInbound`

### `telegram.adapter.ts`

- Đổi `guildId` → `serverId` (nếu có)

### `routing.service.ts`

- Đổi `guildId` → `serverId` trong route matching logic

---

## Implementation Steps

1. **DB Migration** — chạy script MongoDB trực tiếp vào `core_aiwm` (xem section bên dưới)
2. **Schema code** — update `connection.schema.ts` (provider enum, config fields, route fields)
3. **Base adapter** — rename `guildId` → `serverId` trong `NormalizedInbound`, thêm Teams fields
4. **Update existing adapters** — Discord rename `guildId` → `serverId`, Telegram tương tự
5. **Update routing service** — `guildId` → `serverId`
6. **TeamsAdapter** — implement `teams.adapter.ts`
7. **Webhook controller** — `POST/GET /connections/:id/webhook`
8. **ConnectionRunner** — thêm Teams Redis bridge (subscribe `inbound:teams:{id}`)
9. **ConnectionWorkerService** — subscribe `inbound:teams:*`, forward to runner
10. **Register controller** — add to ConnectionModule
11. **TypeScript check + build**

---

## DB Migration

Collection: `connections` trong database `core_aiwm` (xem `MONGODB_URI` trong `.env`).

### Script

```javascript
// Migration: applicationId → appId, guildId → serverId
// Run: mongosh $MONGODB_URI/core_aiwm migration.js

// 1. config.applicationId → config.appId (Discord connections)
db.connections.updateMany(
  { 'config.applicationId': { $exists: true } },
  [
    { $set: { 'config.appId': '$config.applicationId' } },
    { $unset: 'config.applicationId' },
  ]
);

// 2. routes[].guildId → routes[].serverId
db.connections.find({ 'routes.guildId': { $exists: true } }).forEach(doc => {
  const updatedRoutes = doc.routes.map(r => {
    if (r.guildId !== undefined) {
      const { guildId, ...rest } = r;
      return { ...rest, serverId: guildId };
    }
    return r;
  });
  db.connections.updateOne({ _id: doc._id }, { $set: { routes: updatedRoutes } });
});
```

### Rollback

```javascript
// Rollback: appId → applicationId, serverId → guildId

db.connections.updateMany(
  { 'config.appId': { $exists: true }, provider: 'discord' },
  [
    { $set: { 'config.applicationId': '$config.appId' } },
    { $unset: 'config.appId' },
  ]
);

db.connections.find({ 'routes.serverId': { $exists: true } }).forEach(doc => {
  const updatedRoutes = doc.routes.map(r => {
    if (r.serverId !== undefined) {
      const { serverId, ...rest } = r;
      return { ...rest, guildId: serverId };
    }
    return r;
  });
  db.connections.updateOne({ _id: doc._id }, { $set: { routes: updatedRoutes } });
});
```

---

## Redis Channels

| Channel | Publisher | Subscriber | Purpose |
|---------|-----------|------------|---------|
| `inbound:teams:{connectionId}` | API webhook controller | con worker | Bridge Teams inbound từ api → con |
| `outbound:message` | ChatGateway | con worker | Agent response → platform (existing) |
| `outbound:typing` | ChatGateway | con worker | Typing indicator (existing) |
| `chat:message-new` | con worker | ChatGateway | Inbound message → agent (existing) |
| `agent:join-room` | con worker | ChatGateway | Force agent into room (existing) |

---

## Teams Bot Setup (External — không code)

Yêu cầu: tài khoản **Microsoft 365 Developer Program** (sandbox E5, free 90 ngày tự renew) — không hỗ trợ tài khoản Microsoft cá nhân.

Để test:
1. Đăng nhập [Teams Developer Portal](https://dev.teams.microsoft.com) bằng tài khoản M365 dev
2. Tạo **Azure AD App Registration** tại [portal.azure.com](https://portal.azure.com) → lấy `appId` + tạo client secret (`appPassword`)
3. Tạo Bot tại Developer Portal → gắn `appId` vào, cấu hình Bot endpoint: `https://<host>/connections/<id>/webhook`
4. Tạo Teams app manifest, install bot vào Teams channel để test

---

## Open Questions

- [ ] Confirm `@microsoft/agents-sdk` API cho verify signature + parse Activity (cần đọc docs khi implement)
- [ ] Teams typing indicator có hoạt động qua Graph API không, hay cần Bot Framework connector?
- [ ] Message splitting cho Teams (giới hạn 28KB per message — không cần split như Discord 2000 chars)
