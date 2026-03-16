# RAG Integration Plan for Agent Runner

## Overview

Enable Retrieval-Augmented Generation (RAG) for hosted agents (`type='assistant'`) bằng cách tích hợp Knowledge Collections từ CBM vào message processing pipeline của `AgentRunner`.

**Approach:** Two-layer filter + inject context vào user message cuối cùng trong `messages` array trước khi gọi `generateText()`.

---

## Architecture Decision

### Tầng xử lý: AgentRunner

RAG được xử lý tại `AgentRunner.handleMessage()` vì:
- Là điểm duy nhất có đủ context: message content, conversationId, agent config
- Có thể inject trước `generateText()` call mà không ảnh hưởng các tầng khác
- ChatGateway và ConnectionWorker không cần biết về RAG

### Vị trí inject: User message (human turn)

Theo Anthropic best practice: context là **data** thuộc về human turn, không phải instruction.

```
messages array:
[
  { role: 'user', content: '...' },       ← history
  { role: 'assistant', content: '...' },
  ...
  {
    role: 'user',
    content: '<knowledge_context>        ← RAG inject vào đây
      <source id="1" score="0.91">...</source>
      <source id="2" score="0.85">...</source>
    </knowledge_context>\n\n[user message gốc]'
  }
]
```

System prompt **không thay đổi** — giữ nguyên `<system>` + `<context>` + `<runtime>` pattern hiện tại.

---

## Two-Layer Filter

```
message đến
   ↓
[Tầng 1: Heuristic - 0 cost]
  - agent.ragEnabled === false → skip
  - ragCollectionIds.length === 0 → skip
  - message.length < 15 → skip
  - message.startsWith('/') → skip
   ↓ (pass)
[Tầng 2: Vector search - 1 embedding call]
  - Gọi CBM search API cho từng collection
  - minScore filter lọc noise tự động
  - results.length === 0 → skip (không inject gì)
   ↓ (có results)
[Augment user message]
  - Wrap chunks trong <knowledge_context> XML tags
  - Prepend vào user message cuối
   ↓
generateText({ system, messages: augmentedHistory, tools })
```

---

## Schema Changes

### Agent Schema (`agent.schema.ts`)

Thêm 3 fields mới:

```typescript
// RAG configuration
ragEnabled: boolean;               // default false
ragCollectionIds: Types.ObjectId[] // refs đến CBM KnowledgeCollection
ragSettings: {
  topK: number;                    // số chunks trả về, default 5
  minScore: number;                // ngưỡng similarity, default 0.7
};
```

---

## AgentRunnerConfig Changes (`agent-runner.ts`)

Thêm vào `AgentRunnerConfig` interface:

```typescript
ragEnabled?: boolean;
ragCollections?: Array<{
  collectionId: string;
  topK: number;
  minScore: number;
}>;
searchKnowledgeInternal?: (
  collectionId: string,
  query: string,
  topK: number,
  minScore: number
) => Promise<Array<{ score: number; content: string }>>;
```

---

## Implementation Plan

### Step 1 — Agent Schema: thêm RAG fields

**File:** `services/aiwm/src/modules/agent/agent.schema.ts`

- Thêm `ragEnabled: boolean` (default `false`)
- Thêm `ragCollectionIds: [{ type: Types.ObjectId }]`
- Thêm `ragSettings` nested object với `topK` (default `5`) và `minScore` (default `0.7`)

### Step 2 — Agent DTOs: expose RAG config qua API

**Files:**
- `services/aiwm/src/modules/agent/dto/create-agent.dto.ts`
- `services/aiwm/src/modules/agent/dto/update-agent.dto.ts`
- `services/aiwm/src/modules/agent/dto/agent-connect-response.dto.ts`

Thêm `ragEnabled`, `ragCollectionIds`, `ragSettings` vào CreateAgentDto và UpdateAgentDto.

`AgentConnectResponseDto` cần expose RAG config để `AgentWorkerService` truyền vào runner.

### Step 3 — buildConnectResponse: truyền RAG config

**File:** `services/aiwm/src/modules/agent/agent.service.ts`

Trong `buildConnectResponse()`, thêm RAG fields vào response:
```typescript
ragEnabled: agent.ragEnabled ?? false,
ragCollections: (agent.ragCollectionIds ?? []).map(id => ({
  collectionId: id.toString(),
  topK: agent.ragSettings?.topK ?? 5,
  minScore: agent.ragSettings?.minScore ?? 0.7,
})),
```

### Step 4 — AgentWorkerService: inject RAG config + callback vào runner

**File:** `services/aiwm/src/modules/agent-worker/agent-worker.service.ts`

Trong `trySpawnRunner()`, thêm vào `AgentRunnerConfig`:

```typescript
ragEnabled: connectResponse.ragEnabled,
ragCollections: connectResponse.ragCollections,
searchKnowledgeInternal: async (collectionId, query, topK, minScore) => {
  // Gọi CBM Knowledge Collection search API
  // POST http://{CBM_HOST}:{CBM_PORT}/knowledge-collections/:id/search
  // Authorization: Bearer {agentToken}
  return this.cbmKnowledgeService.search(collectionId, query, topK, minScore, agentToken);
},
```

Cần inject `CbmKnowledgeService` (HTTP client wrapper) vào `AgentWorkerModule`.

### Step 5 — CbmKnowledgeService: HTTP client gọi CBM API

**File mới:** `services/aiwm/src/modules/agent-worker/cbm-knowledge.service.ts`

```typescript
@Injectable()
export class CbmKnowledgeService {
  async search(
    collectionId: string,
    query: string,
    topK: number,
    minScore: number,
    bearerToken: string
  ): Promise<Array<{ score: number; content: string }>> {
    // POST {CBM_URL}/knowledge-collections/{collectionId}/search
    // Body: { query, topK }
    // Filter results by score >= minScore
    // Return: [{ score, content }]
  }
}
```

**Config:** URL CBM lấy từ `shared` library config (cùng pattern các service khác gọi nhau).

### Step 6 — AgentRunner: augmentWithRagContext()

**File:** `services/aiwm/src/modules/agent-worker/agent-runner.ts`

**6a.** Thêm `ragEnabled`, `ragCollections`, `searchKnowledgeInternal` vào constructor, lưu vào private fields.

**6b.** Thêm private method `augmentWithRagContext()`:

```typescript
private async augmentWithRagContext(
  history: CoreMessage[],
  userContent: string
): Promise<CoreMessage[]> {
  // Tầng 1: Heuristic checks
  if (!this.config.ragEnabled) return history;
  if (!this.config.ragCollections?.length) return history;
  if (userContent.length < 15) return history;
  if (userContent.startsWith('/')) return history;

  // Tầng 2: Vector search - collect chunks từ tất cả collections
  const allChunks: Array<{ score: number; content: string }> = [];
  for (const col of this.config.ragCollections) {
    try {
      const results = await this.config.searchKnowledgeInternal!(
        col.collectionId, userContent, col.topK, col.minScore
      );
      allChunks.push(...results);
    } catch (err) {
      this.writeLog('warn', 'RAG search failed', { collectionId: col.collectionId, error: (err as Error).message });
    }
  }

  if (!allChunks.length) return history;

  // Sort by score desc, take top overall
  const topChunks = allChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, this.config.ragCollections[0]?.topK ?? 5);

  // Build XML context block
  const contextBlock = [
    '<knowledge_context>',
    ...topChunks.map((c, i) =>
      `<source id="${i + 1}" score="${c.score.toFixed(2)}">\n${c.content}\n</source>`
    ),
    '</knowledge_context>',
  ].join('\n');

  // Inject vào user message cuối
  const augmented = [...history];
  const lastIdx = augmented.length - 1;
  if (augmented[lastIdx]?.role === 'user') {
    augmented[lastIdx] = {
      ...augmented[lastIdx],
      content: `${contextBlock}\n\n${augmented[lastIdx].content}`,
    };
  }

  this.writeLog('info', 'RAG context injected', { chunks: topChunks.length });
  return augmented;
}
```

**6c.** Gọi trong `handleMessage()` sau normalize history, trước `generateText()`:

```typescript
// Line ~354 (sau normalize history)
history = await this.augmentWithRagContext(history, content);

// Line ~382 (generateText gọi như bình thường)
const result = await generateText({ system, messages: history, ... });
```

### Step 7 — AgentWorkerModule: register CbmKnowledgeService

**File:** `services/aiwm/src/modules/agent-worker/agent-worker.module.ts`

Thêm `CbmKnowledgeService` vào `providers` và `HttpModule` vào `imports`.

---

## API Changes

### Create/Update Agent

`POST /agents` và `PUT /agents/:id` nhận thêm:

```json
{
  "ragEnabled": true,
  "ragCollectionIds": ["68abc123...", "68def456..."],
  "ragSettings": {
    "topK": 5,
    "minScore": 0.7
  }
}
```

### Agent Connect Response

`POST /agents/:id/connect` trả về thêm:

```json
{
  "ragEnabled": true,
  "ragCollections": [
    { "collectionId": "68abc123...", "topK": 5, "minScore": 0.7 }
  ]
}
```

---

## Data Flow Summary

```
User message
  → ChatGateway broadcasts message:new
  → AgentRunner.handleMessage()
      → fetchHistory()              [DB query]
      → normalize history
      → augmentWithRagContext()     [NEW]
          → heuristic check
          → CbmKnowledgeService.search() × N collections  [HTTP → CBM]
          → inject <knowledge_context> vào history[last]
      → generateText({ system, messages: augmentedHistory, tools })
      → emit message:send
```

---

## CBM Knowledge Search API Reference

**Endpoint:** `POST /knowledge-collections/:id/search`

**Request:**
```json
{ "query": "string", "topK": 5 }
```

**Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "score": 0.91,
      "payload": {
        "content": "chunk text...",
        "collectionId": "...",
        "sourceId": "...",
        "sourceType": "file"
      }
    }
  ]
}
```

`minScore` filter được áp dụng tại `CbmKnowledgeService` sau khi nhận response (CBM API không nhận `minScore` param).

---

## Files To Modify / Create

| File | Action | Description |
|------|--------|-------------|
| `services/aiwm/src/modules/agent/agent.schema.ts` | Modify | Add `ragEnabled`, `ragCollectionIds`, `ragSettings` |
| `services/aiwm/src/modules/agent/dto/create-agent.dto.ts` | Modify | Add RAG fields |
| `services/aiwm/src/modules/agent/dto/update-agent.dto.ts` | Modify | Add RAG fields |
| `services/aiwm/src/modules/agent/dto/agent-connect-response.dto.ts` | Modify | Add RAG config in response |
| `services/aiwm/src/modules/agent/agent.service.ts` | Modify | `buildConnectResponse()` includes RAG fields |
| `services/aiwm/src/modules/agent-worker/agent-runner.ts` | Modify | Add `augmentWithRagContext()`, call in `handleMessage()` |
| `services/aiwm/src/modules/agent-worker/agent-worker.service.ts` | Modify | Pass RAG config + `searchKnowledgeInternal` callback to runner |
| `services/aiwm/src/modules/agent-worker/agent-worker.module.ts` | Modify | Register `CbmKnowledgeService`, import `HttpModule` |
| `services/aiwm/src/modules/agent-worker/cbm-knowledge.service.ts` | **Create** | HTTP client wrapper for CBM knowledge search |
