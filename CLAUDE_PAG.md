# CLAUDE_PAG.md

Guidance for AI Agent dedicated to maintaining the **PAG (Personal Agent Gateway)** service.

---

## Your Role

You are the dedicated maintainer of the PAG service (`services/pag/`). Your scope is limited to this service and its related documentation under `docs/pag/`. You may read (but not modify) shared libraries at `libs/base/` and `libs/shared/` when needed for context.

---

## Development Workflow

1. **Discuss** - Gather requirements, clarify scope
2. **Propose** - Create plan at `docs/pag/<feature>/`
3. **Approve** - Wait for confirmation before coding
4. **Branch** - Create git branch for the change
5. **Implement** - Execute the plan
6. **Verify** - Build, type-check, test

### Task Management

- Break work into micro-tasks (one file, one function per task)
- Mark each task done immediately after completion
- Keep responses concise, focused on current task

---

## Service Overview

| Key | Value |
|-----|-------|
| Path | `services/pag/` |
| Port (dev) | 3006 |
| Port (prod) | 3360–3369 |
| Database | `core_pag` (MongoDB + Mongoose) |
| Modes | `api` (REST server), `wrk` (BullMQ worker only), default (API + workers) |
| Entry | `src/main.ts` — routes to API, Worker, or full App based on `MODE` env |

---

## Commands

```bash
# Build & verify
nx run pag:build
npx tsc --noEmit -p services/pag/tsconfig.app.json
nx lint pag
nx test pag

# Run
nx run pag:api                # REST API server only (port 3006)
nx run pag:wrk                # Queue worker only (no HTTP)
# Default (MODE not set): API + worker combined

# Quick health check
curl http://localhost:3006/health
open http://localhost:3006/api-docs
```

---

## Modules

| Module | Path | Description |
|--------|------|-------------|
| **channels** | `src/modules/channels/` | Platform connections — credentials, webhook config, OAuth |
| **souls** | `src/modules/souls/` | AI agent personality & LLM config |
| **conversations** | `src/modules/conversations/` | Chat sessions with platform users |
| **messages** | `src/modules/messages/` | Message history with LLM metadata |
| **memories** | `src/modules/memories/` | Long-term user facts (RAG-style) |
| **tasks** | `src/modules/tasks/` | Reminders and todos with BullMQ scheduling |
| **stats** | `src/modules/stats/` | Operational metrics — conversations, messages, queues |
| **queues-admin** | `src/modules/queues-admin/` | Queue inspection and retry management |

---

## Architecture — Deployment Modes

PAG runs in three modes depending on the `MODE` environment variable:

| MODE | Module | Description |
|------|--------|-------------|
| `api` | `ApiModule` | HTTP endpoints only — CRUD, webhooks, stats |
| `wrk` | `WorkerModule` | Queue processors only — no HTTP |
| _(unset)_ | `AppModule` | Full stack: API + processors in one process |

---

## Queue Architecture (BullMQ)

Queue names are defined in `src/config/queue.config.ts`.

| Queue | Name | Processor | Trigger |
|-------|------|-----------|---------|
| Inbound | `pag-inbound` | `InboundProcessor` | Webhook receives user message |
| Heartbeat | `pag-heartbeat` | `HeartbeatProcessor` | Scheduled — proactive messaging |
| Memory Extract | `pag-memory-extract` | `MemoryProcessor` | After inbound processing |
| Token Refresh | `pag-token-refresh` | `TokenRefreshProcessor` | Scheduled — OAuth maintenance |
| Tasks | `pag-tasks` | `TaskProcessor` | Delayed job — task reminder time |

---

## Key Data Flows

### Flow 1: Incoming Message → AI Response

```
Webhook (Zalo/Telegram) → ChannelsService.processWebhook()
  → Find/create Conversation + save Message (user)
  → Publish to pag-inbound queue
  → InboundProcessor:
      1. Parse quick commands (xong / nhắc lại Xp/Xh)
      2. Load Soul + Conversation + Messages + Memories + Pending Tasks
      3. Call Gemini 2.5 Flash
      4. Extract <task> JSON blocks → create Tasks + schedule BullMQ jobs
      5. Save assistant Message
      6. Send reply via platform API (strip markdown for Zalo)
      7. Update Conversation.lastActiveAt
      8. Trigger pag-memory-extract if soul.memory.autoExtract = true
```

### Flow 2: Quick Task Commands

```
User sends: "xong"          → mark most recent pending Task done, cancel BullMQ job
User sends: "nhắc lại 30p"  → snooze Task by 30 minutes, reschedule BullMQ job
User sends: "nhắc lại 2h"   → snooze Task by 2 hours
```

### Flow 3: Memory Extraction

```
pag-memory-extract job → MemoryProcessor:
  1. Load recent messages from Conversation
  2. Call Gemini — extract facts as JSON blocks
  3. Upsert Memories by key (type + content)
```

### Flow 4: Proactive Messaging (Heartbeat)

```
pag-heartbeat scheduled job → HeartbeatProcessor:
  1. Load active Souls with heartbeat.enabled = true
  2. Query Conversations active within 48h
  3. Check for due Tasks or heartbeat minHoursBetween
  4. Call LLM to generate proactive message
  5. Send via platform API + save Message
```

### Flow 5: Token Refresh

```
pag-token-refresh scheduled job → TokenRefreshProcessor:
  1. Find all active Channels with refreshToken
  2. Check if accessToken expires within 1 hour
  3. Call Zalo OAuth refresh endpoint
  4. Update Channel with new tokens
```

---

## Schema Details

### Channel

```
platform: zalo_oa | telegram | facebook | discord | whatsapp
status: active | inactive | error
credentials: { appId, appSecret, oaId, accessToken, refreshToken, tokenExpiresAt }
webhook: { verifyToken, secret, url }
```

### Soul

```
slug: string (unique — e.g. "transgpt")
llm: { provider, model, temperature, maxTokens, apiKeyRef }
persona: { systemPrompt, greeting, tone, pronouns }
memory: { enabled, maxHistoryMessages, summaryAfter, autoExtract }
tools: Tool[]
queue: { concurrency (default 3), timeoutMs (default 30000) }
heartbeat: { enabled, minHoursBetween }
```

### Conversation

```
channelId, soulId, platformUser: { id, username, displayName }
status: active | idle | closed
lastActiveAt: Date   ← 48h activity window for Zalo
summary: string      ← rolling summary for token optimization
```

### Message

```
role: user | assistant | system
content: string
platformMessage: { messageId, timestamp, ... }  ← original webhook data
llm: { provider, model, promptTokens, completionTokens, latencyMs }
toolCalls: [{ name, input, output }]
```

### Memory

```
platformUserId: string
type: fact | preference | schedule | note | personal | interest | goal | relationship | event
source: extracted | user_told | bot_inferred | auto_extraction
content: string
confidence: number (0–1)
expiresAt?: Date
```

### Task

```
platformUserId, conversationId, channelId, soulId
type: reminder | todo
status: pending | done | cancelled | overdue | snoozed
source: user_request | auto_extraction
dueAt: Date
bullJobId?: string   ← used to cancel/reschedule BullMQ job
```

---

## Platform Integrations

### Zalo OA

- Webhook events: `user_send_text`, `user_send_image/gif/sticker/audio/file/location/link`, `user_submit_info`, `follow`, `unfollow`
- Non-text messages receive a Vietnamese fallback response
- `follow`/`unfollow`/re-engagement events forwarded to Discord webhook
- 48h message window limit (Zalo API `-216` error) — tracked via `conversation.lastActiveAt`
- OAuth v4 PKCE flow for token acquisition
- Token auto-refresh when within 1 hour of expiry

### Telegram

- Webhook events: text messages only currently
- Extracts sender ID, username, display name

### AI Provider

- **Provider**: Google Generative AI
- **Model**: Gemini 2.5 Flash
- **Context built per request**: system prompt + Vietnam time (UTC+7) + memories + conversation history + pending tasks
- **Output parsing**: strips `<task>` JSON blocks before sending; strips markdown for Zalo

---

## Access Control

PAG does **not** use the standard RBAC `BaseService` pattern — it has no `orgId`-scoped multi-tenancy. Data is scoped by:

- `platformUserId` — per-user memories and tasks
- `channelId` / `soulId` — per-channel/soul conversations and messages
- No JWT guard on webhook endpoints (signature verification via `verifyToken`/`secret`)
- API management endpoints should be protected (internal or admin use)

---

## Database Collections

| Collection | Schema | Notes |
|------------|--------|-------|
| `channels` | Channel | Stores encrypted OAuth credentials |
| `souls` | Soul | AI personality configs, unique slug |
| `conversations` | Conversation | Per-user sessions, 48h activity window |
| `messages` | Message | Full history with LLM metadata |
| `memories` | Memory | Long-term user facts, confidence-scored |
| `tasks` | Task | Scheduled reminders, BullMQ job ref |

---

## External Integrations

| System | Library | Config |
|--------|---------|--------|
| MongoDB | `mongoose` | `MONGODB_URI`, DB: `core_pag` |
| Redis | `bullmq` / `ioredis` | `REDIS_*` env vars |
| Zalo OA API | `axios` | `ZALO_OA_API_URL`, credentials in Channel doc |
| Telegram Bot API | `axios` | Bot token in Channel doc |
| Google Generative AI | `@google/generative-ai` | `GEMINI_API_KEY` or per-soul `apiKeyRef` |
| Discord | webhook URL | `PAG_DISCORD_WEBHOOK_URL` — event notifications |

---

## Stats & Observability

**`StatsService`** exposes:

| Method | Description |
|--------|-------------|
| `getOverallStats()` | Total conversations, messages today, active users (24h), channel status counts, total memories, pending tasks |
| `getUnansweredConversations(sinceHours)` | Conversations where last message is from user (unanswered) |
| `getUserProfile(platformUserId)` | Full profile: conversations + memories + tasks for a user |

**`QueuesAdminService`** exposes:

| Method | Description |
|--------|-------------|
| `getQueueStatus()` | waiting/active/failed/completed/delayed counts per queue |
| `retryFailedJobs(queueName)` | Retry all failed jobs in a queue (max 100) |

---

## Important Conventions

1. **No BaseService RBAC** — PAG doesn't use org-scoped multi-tenancy; access is by platform identity
2. **48h Zalo window** — always check `lastActiveAt` before sending; Zalo returns `-216` for stale conversations
3. **BullMQ job tracking** — Tasks store `bullJobId`; always cancel the old job when snoozed/done
4. **Soft delete only** — never hard delete; all schemas support `isDeleted`
5. **Strip markdown for Zalo** — Zalo renders plain text; strip before sending assistant messages
6. **`<task>` extraction** — AI can embed `<task>` JSON in responses; always strip before delivering to user
7. **Soul slug** — primary lookup key for AI config; use `findBySlug()` not `findById()`
8. **Memory upsert by key** — memories are upserted on `(platformUserId, type, content)` key to avoid duplicates
9. **Conversation summary** — updated periodically to compress history and stay within token limits
10. **Worker startup catchup** — `TaskProcessor` calls `getOverdueTasks()` on startup to reschedule missed reminders
