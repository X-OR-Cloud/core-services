# Agent — Adaptive RAG Configuration API

> **Version:** v2 (Adaptive RAG)
> **Introduced in:** v1.15.0
> **Backward-compatible với:** `ragEnabled`, `ragCollectionIds`, `ragSettings` (v1 legacy)

---

## Tổng quan

**RAG (Retrieval-Augmented Generation)** cho phép agent tự động tra cứu knowledge base trước mỗi lượt phản hồi, đảm bảo câu trả lời dựa trên dữ liệu thực tế thay vì kiến thức nền của LLM.

**Adaptive RAG v2** nâng cấp lên pipeline đầy đủ gồm:

```
Tin nhắn người dùng
       ↓
1. Intent Classification   — phân loại ý định (greeting, OOD, RAG?)
       ↓
2. Collection Routing      — chọn knowledge base phù hợp với intent
       ↓
3. Vector Search           — tìm kiếm parallel/sequential
       ↓
4. Relevance Grading       — lọc chunk không liên quan (tuỳ chọn)
       ↓
5. Query Reformulation     — cải thiện câu hỏi nếu kết quả kém (tuỳ chọn)
       ↓
6. Context Injection       — inject <knowledge_context> vào message
       ↓
LLM tạo câu trả lời
```

Khi `ragConfig` được cấu hình, hệ thống **tự động xử lý toàn bộ pipeline** — agent không cần gọi tool tìm kiếm thủ công.

---

## Cấu trúc `ragConfig`

```
ragConfig
├── enabled                    # Bật/tắt toàn bộ pipeline
├── intentClassifier
│   ├── enabled                # Bật LLM-based classification
│   ├── deploymentId           # LLM dùng để classify (mặc định: deployment của agent)
│   └── intents[]              # Danh sách intent rules
│       ├── name               # Tên intent
│       ├── requiresRag        # Intent này có cần search không?
│       ├── collectionIds[]    # Override collection cho intent này
│       └── topK               # Override topK cho intent này
├── collections[]              # Danh sách knowledge base
│   ├── collectionId           # ID collection từ CBM
│   ├── label                  # Tên hiển thị
│   ├── type                   # Loại: faq | procedure | general
│   ├── topK                   # Số chunk tối đa lấy ra
│   ├── minScore               # Ngưỡng similarity tối thiểu (0–1)
│   └── intents[]              # Chỉ search collection này với các intent này
├── query
│   ├── parallelSearch         # Search tất cả collection đồng thời
│   ├── maxRetries             # Số lần reformulate query nếu kết quả kém
│   └── reformulateOnLowScore  # Tự động cải thiện câu hỏi khi điểm thấp
└── grader
    ├── relevanceEnabled       # Bật relevance grading
    ├── relevanceThreshold     # Ngưỡng để chunk được coi là relevant
    ├── hallucinationEnabled   # Bật hallucination check
    ├── hallucinationIntents[] # Chỉ check các intent này
    └── deploymentId           # LLM dùng để grade (mặc định: deployment của agent)
```

---

## Ý nghĩa các thông số

### `ragConfig.enabled`

| | |
|---|---|
| **Kiểu** | boolean |
| **Mặc định** | false |
| **Mô tả** | Bật/tắt toàn bộ Adaptive RAG pipeline. Khi `false`, hệ thống bỏ qua mọi cấu hình bên dưới và hoạt động theo legacy `ragEnabled`. |

---

### `ragConfig.intentClassifier`

Bộ phân loại ý định — quyết định xem tin nhắn người dùng có cần tra cứu knowledge base hay không, và nên tra cứu collection nào.

Hệ thống phân loại theo 3 tầng ưu tiên:
1. **Heuristic** (0 cost): slash command, greeting ngắn gọn, follow-up question
2. **History-aware heuristic**: câu ngắn nhưng đang trong luồng hội thoại về chủ đề cần RAG → tự động classify là follow-up
3. **LLM-based** (khi `enabled = true` và có deployment): gọi LLM để phân loại chính xác, có xét lịch sử 3 turns gần nhất

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `enabled` | boolean | `false` → chỉ dùng heuristic, mặc định SIMPLE_RAG cho mọi câu hỏi không phải greeting/OOD. `true` → gọi LLM để phân loại. |
| `deploymentId` | string? | ID của deployment dùng để phân loại. Nếu không điền, dùng deployment chính của agent. |
| `intents` | RagIntentRule[] | Danh sách các intent rule. Hệ thống dùng danh sách này để biết tên intent nào tồn tại và intent nào cần RAG. |

#### Các intent built-in được hỗ trợ

| Intent name | `requiresRag` gợi ý | Ý nghĩa |
|-------------|---------------------|---------|
| `GREETING` | false | Chào hỏi, cảm ơn — không cần tra cứu |
| `SKIP_OOD` | false | Câu hỏi ngoài phạm vi (Out-Of-Domain) |
| `SKIP_GUARD` | false | Vi phạm guardrail — để guardrail module xử lý |
| `SKIP_PII` | false | Chứa thông tin cá nhân nhạy cảm |
| `SIMPLE_RAG` | true | Câu hỏi đơn chủ đề, tra cứu 1–2 collection |
| `COMPLEX_RAG` | true | Câu hỏi phức tạp, nhiều chủ đề, cần tổng hợp nhiều nguồn |

> Tên intent là **tự do** — có thể định nghĩa tên riêng phù hợp với domain. Các tên trên chỉ là gợi ý phổ biến.

#### `intents[].topK` và `intents[].collectionIds`

Dùng để **override** cấu hình mặc định cho từng intent. Ví dụ: `COMPLEX_RAG` có thể cần `topK` cao hơn, hoặc tra cứu thêm collection chuyên biệt.

---

### `ragConfig.collections`

Danh sách knowledge base (từ CBM Knowledge Collections) mà agent được phép tra cứu.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `collectionId` | string | ID của Knowledge Collection trong CBM. |
| `label` | string? | Tên gợi nhớ, chỉ dùng cho quản lý — không hiển thị với người dùng. |
| `type` | `faq` \| `procedure` \| `general` | Phân loại collection để hỗ trợ routing logic tùy chỉnh sau này. Hiện tại chưa ảnh hưởng đến hành vi. |
| `topK` | number (1–20) | Số chunk tối đa lấy từ collection này mỗi lượt tra cứu. **Ảnh hưởng trực tiếp đến chất lượng và chi phí.** |
| `minScore` | number (0–1) | Ngưỡng similarity tối thiểu. Chunk có điểm thấp hơn bị loại ngay từ CBM. **Tăng giá trị này để giảm nhiễu, giảm để tăng recall.** |
| `intents` | string[]? | Whitelist intent được phép dùng collection này. **Để trống = áp dụng cho tất cả RAG intents.** Dùng khi muốn collection chuyên biệt chỉ phục vụ một số intent. |

---

### `ragConfig.query`

Điều chỉnh cách hệ thống thực hiện vector search.

| Trường | Kiểu | Mặc định | Mô tả |
|--------|------|----------|-------|
| `parallelSearch` | boolean | true | `true` → search tất cả collection cùng lúc (nhanh hơn). `false` → search tuần tự (ít tải server hơn, chậm hơn). |
| `maxRetries` | number (0–3) | 1 | Số lần tối đa reformulate câu hỏi và search lại khi kết quả có điểm thấp. `0` = không retry. |
| `reformulateOnLowScore` | boolean | false | Khi `true` và không có chunk nào qua `minScore`, hệ thống dùng LLM để viết lại câu hỏi và search lại. Cần deployment được cấu hình. |

---

### `ragConfig.grader`

Bộ đánh giá chất lượng kết quả sau khi search — giúp loại bỏ chunk kém liên quan trước khi inject vào context.

| Trường | Kiểu | Mặc định | Mô tả |
|--------|------|----------|-------|
| `relevanceEnabled` | boolean | false | Bật relevance grading — dùng LLM để đánh giá từng chunk có thực sự liên quan đến câu hỏi không. Chi phí thêm 1 LLM call per chunk. |
| `relevanceThreshold` | number (0–1) | 0.5 | Ngưỡng để chunk được coi là relevant khi `relevanceEnabled = false` — chỉ dựa trên similarity score từ CBM. Khi `relevanceEnabled = true`, LLM quyết định yes/no. |
| `hallucinationEnabled` | boolean | false | Sau khi LLM tạo xong câu trả lời, kiểm tra câu trả lời có bám sát context không. Nếu phát hiện hallucination, câu trả lời được đánh dấu nhưng **không bị chặn** (fail-open). |
| `hallucinationIntents` | string[]? | [] | Chỉ chạy hallucination check với các intent này. Để trống = check tất cả. Dùng để tối ưu chi phí — ví dụ chỉ check `COMPLEX_RAG`. |
| `deploymentId` | string? | — | Deployment dùng cho relevance grading và hallucination check. Mặc định dùng deployment chính của agent. |

---

## API Endpoints

### Cập nhật ragConfig cho agent

```
PATCH /agents/:id
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Request body (chỉ cần gửi các trường cần update):**

```json
{
  "ragConfig": {
    "enabled": true,
    "intentClassifier": {
      "enabled": false,
      "intents": [
        { "name": "GREETING",    "requiresRag": false },
        { "name": "SKIP_OOD",    "requiresRag": false },
        { "name": "SIMPLE_RAG",  "requiresRag": true  },
        { "name": "COMPLEX_RAG", "requiresRag": true, "topK": 8 }
      ]
    },
    "collections": [
      {
        "collectionId": "69f020f5f11db9f3992ca592",
        "label": "FAQ",
        "type": "faq",
        "topK": 3,
        "minScore": 0.72
      },
      {
        "collectionId": "69b76ce8a153252bddfc934f",
        "label": "Thủ tục hành chính",
        "type": "procedure",
        "topK": 3,
        "minScore": 0.72
      }
    ],
    "query": {
      "parallelSearch": true,
      "maxRetries": 1,
      "reformulateOnLowScore": false
    },
    "grader": {
      "relevanceEnabled": false,
      "relevanceThreshold": 0.5,
      "hallucinationEnabled": false,
      "hallucinationIntents": []
    }
  }
}
```

**Sample response `200 OK`:**

```json
{
  "_id": "69abc123def456",
  "name": "HCC Chatbot",
  "status": "idle",
  "ragEnabled": false,
  "ragConfig": {
    "enabled": true,
    "intentClassifier": {
      "enabled": false,
      "deploymentId": null,
      "intents": [
        { "name": "GREETING",    "requiresRag": false },
        { "name": "SKIP_OOD",    "requiresRag": false },
        { "name": "SIMPLE_RAG",  "requiresRag": true  },
        { "name": "COMPLEX_RAG", "requiresRag": true, "topK": 8 }
      ]
    },
    "collections": [
      {
        "collectionId": "69f020f5f11db9f3992ca592",
        "label": "FAQ",
        "type": "faq",
        "topK": 3,
        "minScore": 0.72,
        "intents": []
      },
      {
        "collectionId": "69b76ce8a153252bddfc934f",
        "label": "Thủ tục hành chính",
        "type": "procedure",
        "topK": 3,
        "minScore": 0.72,
        "intents": []
      }
    ],
    "query": {
      "parallelSearch": true,
      "maxRetries": 1,
      "reformulateOnLowScore": false
    },
    "grader": {
      "relevanceEnabled": false,
      "relevanceThreshold": 0.5,
      "hallucinationEnabled": false,
      "hallucinationIntents": [],
      "deploymentId": null
    }
  },
  "updatedAt": "2026-05-06T03:00:00.000Z"
}
```

---

### Lấy ragConfig hiện tại của agent

```
GET /agents/:id
Authorization: Bearer <user_token>
```

**Sample response `200 OK`:** *(trường ragConfig có trong response object)*

```json
{
  "_id": "69abc123def456",
  "name": "HCC Chatbot",
  "ragConfig": {
    "enabled": true,
    "intentClassifier": { "enabled": false, "intents": [...] },
    "collections": [...],
    "query": { "parallelSearch": true, "maxRetries": 1, "reformulateOnLowScore": false },
    "grader": { "relevanceEnabled": false, "relevanceThreshold": 0.5, "hallucinationEnabled": false }
  }
}
```

---

### Tắt Adaptive RAG

Để tắt, set `ragConfig.enabled = false` hoặc set `ragConfig = null`:

```
PATCH /agents/:id
```

```json
{ "ragConfig": null }
```

Hệ thống sẽ fallback về legacy `ragEnabled`/`ragCollectionIds`/`ragSettings` nếu có.

---

## Trong AgentConnect response (engineer agents)

Khi engineer agent gọi `POST /agents/:id/connect`, response trả về `ragConfig` để agent biết cấu hình hiện tại:

```json
{
  "accessToken": "eyJ...",
  "instruction": { "id": "...", "systemPrompt": "..." },
  "ragEnabled": false,
  "ragCollections": [],
  "ragConfig": {
    "enabled": true,
    "intentClassifier": { ... },
    "collections": [ ... ],
    "query": { ... },
    "grader": { ... }
  }
}
```

> **Lưu ý cho engineer agents:** `ragConfig` chỉ có giá trị tham khảo. Pipeline Adaptive RAG chạy **server-side** trong `AgentRunner` (MODE=agt). Engineer agents tự xử lý RAG theo logic riêng nếu muốn.

---

## Quan hệ giữa v1 và v2

| Trường | Version | Trạng thái |
|--------|---------|------------|
| `ragEnabled` | v1 | Legacy — vẫn hoạt động |
| `ragCollectionIds` | v1 | Legacy — vẫn hoạt động |
| `ragSettings.topK` | v1 | Legacy — vẫn hoạt động |
| `ragSettings.minScore` | v1 | Legacy — vẫn hoạt động |
| `ragConfig` | v2 | **Khuyến nghị** — override toàn bộ v1 khi `enabled = true` |

**Ưu tiên xử lý trong AgentRunner:**
- Nếu `ragConfig.enabled = true` → dùng Adaptive RAG v2, bỏ qua `ragEnabled`
- Nếu `ragConfig` null hoặc `enabled = false` → dùng legacy v1 pipeline

---

## Hướng dẫn cấu hình theo use case

### Chatbot hành chính công (DVC/HCC)

- `intentClassifier.enabled = false` — heuristic đủ dùng, tiết kiệm chi phí
- 2 collections: FAQ (topK=3) + Thủ tục (topK=3)
- `parallelSearch = true` — luôn search song song
- `grader.relevanceEnabled = false` — minScore đã đủ để lọc
- `reformulateOnLowScore = false` — giữ đơn giản

### Agent hỗ trợ kỹ thuật (nhiều loại tài liệu)

- `intentClassifier.enabled = true` — phân loại để route đúng collection
- Định nghĩa intents: `TROUBLESHOOT`, `HOW_TO`, `SPEC_LOOKUP`, `GREETING`, `SKIP_OOD`
- Mỗi intent map tới collection chuyên biệt qua `intents[]` whitelist
- `grader.relevanceEnabled = true`, threshold = 0.6 — lọc keỹ hơn vì tài liệu kỹ thuật phức tạp

### Agent tư vấn pháp lý (yêu cầu độ chính xác cao)

- `intentClassifier.enabled = true`
- `grader.relevanceEnabled = true`, `hallucinationEnabled = true`
- `hallucinationIntents = ["COMPLEX_RAG"]` — chỉ check câu hỏi phức tạp
- `reformulateOnLowScore = true`, `maxRetries = 2` — cố gắng tìm thêm

---

## Ghi chú kỹ thuật

- Context được inject vào message người dùng dưới dạng XML block `<knowledge_context>` trước khi LLM xử lý
- System prompt của agent cần được cập nhật để **không** gọi KnowledgeSearch tool thủ công khi dùng Adaptive RAG v2 (xem [System Prompt v11](../agent-worker/ADAPTIVE-RAG-SYSTEM-PROMPT-GUIDE.md))
- Intent classification có **history-aware**: câu ngắn (< 15 ký tự) sau một assistant response dài sẽ tự động được classify là follow-up RAG question
- Khi agent runner reload (`/reload`), `ragConfig` được fetch lại từ DB — không cần restart
