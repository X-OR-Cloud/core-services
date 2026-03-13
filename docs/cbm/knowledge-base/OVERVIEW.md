# Knowledge Base — CBM Feature Overview

## Tổng quan

Knowledge Base (KB) là tính năng mở rộng của CBM service, cung cấp khả năng RAG (Retrieval-Augmented Generation) cho AI Agent trong hệ thống AIWM.

Thay vì tạo service mới, KB được implement như các module bổ sung trong CBM vì:
- Tái sử dụng access control (project/org membership) hiện có của CBM
- Document của CBM có thể trực tiếp tham gia KB mà không cần migrate
- Ít overhead infrastructure hơn

---

## Modules mới trong CBM

| Module | Path | Description |
|--------|------|-------------|
| KnowledgeCollection | `src/modules/knowledge-collection/` | Quản lý các collection (domain) tri thức |
| File | `src/modules/knowledge-file/` | Quản lý file tải lên để indexing |
| Chunk | `src/modules/knowledge-chunk/` | Lưu các đoạn text đã chunk từ file/document |
| KnowledgeWorker | worker mode riêng | Async indexing pipeline với Redis distributed lock |

---

## Entity Design

> **Lưu ý BaseSchema:** Tất cả entity kế thừa `BaseSchema` từ `@hydrabyte/base`, đã bao gồm: `owner` (chứa `orgId`, `groupId`, `userId`, `agentId`, `appId`), `createdBy`, `updatedBy`, `deletedAt`, `isDeleted`, `metadata`, `createdAt`, `updatedAt`. **Không khai báo lại các trường này.**

---

### 1. `KnowledgeCollection` (MongoDB: `knowledge_collections`)

Đại diện cho một domain/kho tri thức. Org-scoped qua `owner.orgId`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Tên collection (vd: "Quy định nội bộ") |
| `description` | string | Mô tả để Agent hiểu khi nào nên dùng |
| `projectId` | string? | Optional — thuộc project cụ thể trong CBM |
| `status` | enum | `idle \| processing \| ready \| error` |
| `chunkingConfig` | object | Config chunking riêng (nếu không set → dùng default từ env) |
| `embeddingModel` | string | Embedding model (default từ `KB_EMBEDDING_MODEL` env) |
| `qdrantCollection` | string | Tên collection trong Qdrant (auto-generated khi tạo) |
| `stats` | object | **Thống kê tổng hợp** (xem bên dưới) |

**ChunkingConfig object:**
```typescript
{
  strategy: 'fixed' | 'sentence' | 'paragraph', // default: 'sentence'
  chunkSize: number,     // default: 512 (tokens)
  chunkOverlap: number,  // default: 64 (tokens)
}
```

**Stats object** — tính toán realtime hoặc aggregated (cập nhật mỗi khi file thay đổi trạng thái):
```typescript
{
  totalFiles: number,       // Tổng số file trong collection
  readyFiles: number,       // Số file đã index xong (embeddingStatus = 'ready')
  processingFiles: number,  // Số file đang xử lý
  errorFiles: number,       // Số file lỗi
  pendingFiles: number,     // Số file chờ xử lý
  totalSize: number,        // Tổng dung lượng file (bytes)
  totalChunks: number,      // Tổng số chunks đã tạo
}
```

> `stats` được lưu cố định trong document và cập nhật mỗi khi có thay đổi trạng thái file (không tính realtime aggregation để tránh overhead).

---

### 2. `File` (MongoDB: `knowledge_files`)

File vật lý do user upload, là nguồn dữ liệu thô để indexing. Org-scoped qua `owner.orgId`.

| Field | Type | Description |
|-------|------|-------------|
| `collectionId` | string | Thuộc KnowledgeCollection nào (bắt buộc) |
| `name` | string | Tên hiển thị |
| `fileName` | string | Tên file gốc |
| `filePath` | string | Đường dẫn local (relative từ `KB_STORAGE_PATH` env) |
| `mimeType` | string | Loại MIME của file |
| `fileSize` | number | Kích thước file (bytes) |
| `rawContent` | string | Nội dung text đã extract từ file |
| `embeddingStatus` | enum | `pending \| processing \| ready \| error` |
| `errorMessage` | string? | Mô tả lỗi nếu `embeddingStatus = 'error'` |
| `chunkCount` | number | Số chunks đã tạo (cập nhật sau khi index xong) |

**Định dạng hỗ trợ (LangChain document loaders):** PDF, DOCX, TXT, HTML, Markdown, Excel

---

### 3. `Chunk` (MongoDB: `knowledge_chunks`)

Lưu các đoạn text đã chia nhỏ. Đây là đơn vị được vector hóa và lưu vào Qdrant. **Không kế thừa BaseSchema** vì không cần owner/audit trail — chỉ là dữ liệu phái sinh từ File/Document.

| Field | Type | Description |
|-------|------|-------------|
| `orgId` | string | Org scope (từ collection, để filter Qdrant) |
| `collectionId` | string | Thuộc KnowledgeCollection nào |
| `sourceType` | enum | `file \| document` |
| `sourceId` | string | ID của KnowledgeFile hoặc CBM Document |
| `chunkIndex` | number | Thứ tự chunk trong tài liệu gốc |
| `content` | string | Nội dung text của chunk |
| `metadata` | object | Thông tin bổ trợ (page, section, vị trí ký tự...) |
| `qdrantPointId` | string | ID point trong Qdrant (UUID) |
| `createdAt` | Date | Thời điểm tạo |

**Chunk metadata object:**
```typescript
{
  page?: number,       // Trang trong PDF
  section?: string,    // Chương/mục
  charStart?: number,  // Vị trí ký tự bắt đầu trong rawContent
  charEnd?: number,    // Vị trí ký tự kết thúc
}
```

---

### 4. CBM `Document` — Extension fields

Document hiện có của CBM được bổ sung các trường để tham gia KB (xử lý tương tự File):

| Field mới | Type | Description |
|-----------|------|-------------|
| `embeddingEnabled` | boolean | Bật/tắt RAG embedding cho document này |
| `knowledgeCollectionId` | string? | Link vào KnowledgeCollection |
| `embeddingStatus` | enum | `pending \| processing \| ready \| error` |

Khi `embeddingEnabled = true`, content của Document được chunk → embed → đẩy vào Qdrant với `sourceType = 'document'`.

---

### 5. Qdrant Vector Points

Mỗi chunk → một point trong Qdrant collection (tên collection = `KnowledgeCollection.qdrantCollection`):

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Qdrant point ID (= `Chunk.qdrantPointId`) |
| `vector` | float[] | Embedding vector (Qwen3-Embedding-8B) |
| `payload.chunkId` | string | MongoDB `_id` của Chunk |
| `payload.sourceId` | string | ID của file/document gốc |
| `payload.sourceType` | string | `file \| document` |
| `payload.collectionId` | string | ID của KnowledgeCollection |
| `payload.orgId` | string | Để filter theo org |
| `payload.content` | string | Nội dung text (trả về kết quả không cần query MongoDB thêm) |

---

## Indexing Pipeline (Worker)

Worker chạy mode riêng (`nx run cbm:kb-wrk`), hỗ trợ nhiều instance với Redis distributed lock — theo pattern AIWM AgentWorker (`services/aiwm/src/modules/agent-worker/`).

```
Upload file
    │
    ▼
File.embeddingStatus = "pending"
KnowledgeCollection.stats được cập nhật
    │
    ▼
Worker picks up job
Lock key: kb:lock:file:{fileId} (TTL 5 phút, renew mỗi 1 phút)
    │
    ▼
1. Extract text (LangChain document loaders)
   → lưu rawContent vào File
    │
    ▼
2. Chunking (theo chunkingConfig của Collection hoặc default)
   → tạo Chunk records trong MongoDB
    │
    ▼
3. Embedding batch (Qwen3-Embedding-8B API)
    │
    ▼
4. Upsert vào Qdrant
   → cập nhật qdrantPointId cho từng Chunk
    │
    ▼
File.embeddingStatus = "ready"
File.chunkCount = N
KnowledgeCollection.stats được cập nhật
```

**Khi xóa File:** xóa tất cả Chunk records + Qdrant points tương ứng, cập nhật stats collection.

---

## Query Flow (RAG)

```
Agent/User đặt câu hỏi
    │
    ▼
POST /knowledge-collections/:id/search
{ query: "...", topK: 5 }
    │
    ▼
1. Embed câu hỏi (Qwen3-Embedding-8B)
    │
    ▼
2. Qdrant vector search
   filter: { collectionId, orgId }
   top-K kết quả tương đồng nhất
    │
    ▼
3. Trả về list chunks: { content, metadata, sourceId, sourceType, score }
    │
    ▼
Agent augment vào system prompt → LLM generate với citations
```

---

## API Endpoints

### KnowledgeCollection

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/knowledge-collections` | Tạo collection mới |
| `GET` | `/knowledge-collections` | Danh sách (org-scoped, **không trả `qdrantCollection`**) |
| `GET` | `/knowledge-collections/:id` | Chi tiết đầy đủ |
| `PATCH` | `/knowledge-collections/:id` | Cập nhật name/description/chunkingConfig |
| `DELETE` | `/knowledge-collections/:id` | Soft delete |
| `POST` | `/knowledge-collections/:id/search` | Vector search trong collection |

**GET list exclude fields:** `qdrantCollection`, `embeddingModel` (chi tiết kỹ thuật, không cần ở list view).

---

### File

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/knowledge-files/upload` | Upload file (multipart/form-data) + gán collectionId |
| `GET` | `/knowledge-files` | Danh sách files (**không trả `rawContent`, `filePath`**) |
| `GET` | `/knowledge-files/:id` | Chi tiết đầy đủ (có `rawContent`) |
| `DELETE` | `/knowledge-files/:id` | Xóa file + chunks + Qdrant points |
| `POST` | `/knowledge-files/:id/reindex` | Trigger reindex (reset status về `pending`) |

**GET list exclude fields:** `rawContent`, `filePath` (nội dung lớn, không cần ở list).

---

### Chunk

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/knowledge-chunks` | Danh sách chunks (filter by `collectionId`, `sourceId`, **không trả `content`**) |
| `GET` | `/knowledge-chunks/:id` | Chi tiết chunk (có `content`) |

**GET list exclude fields:** `content` (nội dung text có thể rất dài).

---

### Document (CBM) — Extended endpoint

| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/documents/:id/embedding` | Bật/tắt embedding, gán `knowledgeCollectionId` |

---

## FindMany Pattern (theo Instruction module)

Tất cả `findAll` override `selectFields` để loại trừ trường có nội dung lớn:

```typescript
// KnowledgeCollectionService
async findAll(options, context) {
  options.selectFields = ['-qdrantCollection', '-embeddingModel'];
  options.statisticFields = ['status'];
  return super.findAll(options, context);
}

// KnowledgeFileService (File)
async findAll(options, context) {
  options.selectFields = ['-rawContent', '-filePath'];
  options.statisticFields = ['embeddingStatus'];
  return super.findAll(options, context);
}

// KnowledgeChunkService (Chunk)
async findAll(options, context) {
  options.selectFields = ['-content'];
  return super.findAll(options, context);
}
```

---

## AIWM MCP Tools

Khai báo vào AIWM builtin tools (`services/aiwm/src/mcp/builtin/`):

| Tool | Parameters | Description |
|------|-----------|-------------|
| `kb_search` | `query`, `collectionId`, `topK?` | Tìm kiếm trong một collection |
| `kb_list_collections` | `projectId?` | Liệt kê các collection khả dụng |
| `kb_get_file_info` | `fileId` | Lấy metadata file gốc (không có rawContent) |

---

## Environment Variables (CBM)

```bash
# Knowledge Base storage
KB_STORAGE_PATH=/data/cbm/knowledge   # Thư mục lưu file upload

# Worker
KB_WORKER_CONCURRENCY=3               # Số file xử lý đồng thời mỗi instance

# Embedding
KB_EMBEDDING_API_URL=http://...       # OpenAI-compatible endpoint
KB_EMBEDDING_API_KEY=...
KB_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...

# Chunking defaults (override per collection)
KB_CHUNK_STRATEGY=sentence            # fixed | sentence | paragraph
KB_CHUNK_SIZE=512                     # tokens
KB_CHUNK_OVERLAP=64                   # tokens
```

---

## Implementation Plan

### Phase 1 — Core modules
1. Schema + Module: `KnowledgeCollection`, `KnowledgeFile` (File), `KnowledgeChunk` (Chunk)
2. Extend `Document` schema với embedding fields
3. API endpoints CRUD + search

### Phase 2 — Indexing Worker
4. LangChain document loaders (PDF, DOCX, TXT, HTML, MD, Excel)
5. Chunking service (fixed/sentence/paragraph strategy)
6. Embedding service (Qwen3 API batch)
7. Qdrant client integration
8. Worker mode với Redis distributed lock (pattern AgentWorker)
9. Stats aggregation khi file thay đổi trạng thái

### Phase 3 — MCP Integration
10. Khai báo 3 MCP tools vào AIWM builtin
11. Reindex flow cho Document

---

## Tham khảo

- Distributed lock pattern: `services/aiwm/src/modules/agent-worker/agent-lock.service.ts`
- FindMany + selectFields pattern: `services/aiwm/src/modules/instruction/instruction.service.ts`
- CBM Document schema: `services/cbm/src/modules/document/document.schema.ts`
- BaseSchema fields: `libs/base/src/lib/base.schema.ts`
- AIWM MCP builtin tools: `services/aiwm/src/mcp/builtin/`
