# Knowledge Base — Entities & API Reference

CBM Knowledge Base là hệ thống RAG (Retrieval-Augmented Generation) tích hợp trong CBM service.
Cho phép lưu trữ tài liệu, tự động index (chunking + embedding), và tìm kiếm ngữ nghĩa (vector search).

---

## Kiến trúc tổng quan

```
File upload → KnowledgeFile (pending)
    ↓  [embedding worker: nx run cbm:emb]
Text extraction (pdf-parse / mammoth / OCR)
    ↓
Chunking (sentence / paragraph / fixed)
    ↓
Embedding (Qwen3-Embedding-8B via OpenAI-compatible API)
    ↓
KnowledgeChunk (MongoDB) + Qdrant (vector store)
    ↓
Vector search via POST /knowledge-collections/:id/search
```

---

## Entities

### KnowledgeCollection

Đại diện cho một kho kiến thức (knowledge domain). Org-scoped.

MongoDB collection: `knowledge_collections`

| Trường | Kiểu | Bắt buộc | Mô tả | Ví dụ |
|--------|------|----------|-------|-------|
| `_id` | `string` (ObjectId) | auto | MongoDB document ID | `"6852a1b2c3d4e5f6a7b8c9d0"` |
| `name` | `string` (max 200) | ✅ | Tên collection | `"Quy định nội bộ"` |
| `description` | `string` (max 1000) | ❌ | Mô tả giúp Agent hiểu khi nào dùng collection này | `"Chứa tài liệu nhân sự và chính sách công ty"` |
| `projectId` | `string` | ❌ | Liên kết với Project (tùy chọn) | `"6852a1b2c3d4e5f6a7b8c9d1"` |
| `status` | `enum` | auto | Trạng thái tổng hợp từ các file | `"idle"` \| `"processing"` \| `"ready"` \| `"error"` |
| `chunkingConfig` | `ChunkingConfig` | ❌ | Cấu hình chunking (dùng default nếu không set) | xem bên dưới |
| `embeddingModel` | `string` | ❌ | Override embedding model | `"Qwen/Qwen3-Embedding-8B"` |
| `qdrantCollection` | `string` | auto | Tên Qdrant collection nội bộ (ẩn với API) | `"kc_a1b2c3d4-..."` |
| `stats` | `CollectionStats` | auto | Thống kê tổng hợp | xem bên dưới |
| `owner` | `{ orgId, userId }` | auto | Chủ sở hữu (từ JWT) | `{ "orgId": "org123", "userId": "usr456" }` |
| `isDeleted` | `boolean` | auto | Soft delete flag | `false` |
| `createdAt` | `Date` | auto | Thời điểm tạo | `"2025-03-14T08:00:00.000Z"` |
| `updatedAt` | `Date` | auto | Thời điểm cập nhật | `"2025-03-14T09:00:00.000Z"` |

**ChunkingConfig:**

| Trường | Kiểu | Default | Mô tả |
|--------|------|---------|-------|
| `strategy` | `"fixed"` \| `"sentence"` \| `"paragraph"` | `"sentence"` | Chiến lược chia đoạn văn bản |
| `chunkSize` | `number` (min 64) | `512` | Kích thước chunk tính bằng ký tự |
| `chunkOverlap` | `number` (min 0) | `64` | Số ký tự overlap giữa các chunk liên tiếp |

**CollectionStats** (tự động cập nhật sau mỗi lần index):

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `totalFiles` | `number` | Tổng số file |
| `readyFiles` | `number` | Số file đã index xong |
| `processingFiles` | `number` | Số file đang xử lý |
| `errorFiles` | `number` | Số file lỗi |
| `pendingFiles` | `number` | Số file chờ index |
| `totalSize` | `number` | Tổng dung lượng (bytes) |
| `totalChunks` | `number` | Tổng số chunk đã tạo |

---

### KnowledgeFile

Đại diện cho một file vật lý được upload. Org-scoped.

MongoDB collection: `knowledge_files`

| Trường | Kiểu | Bắt buộc | Mô tả | Ví dụ |
|--------|------|----------|-------|-------|
| `_id` | `string` (ObjectId) | auto | MongoDB document ID | `"6852a1b2c3d4e5f6a7b8c9d2"` |
| `collectionId` | `string` | ✅ | ID của KnowledgeCollection | `"6852a1b2c3d4e5f6a7b8c9d0"` |
| `name` | `string` (max 500) | ✅ | Tên hiển thị (mặc định = tên file) | `"Quy định nghỉ phép 2025"` |
| `fileName` | `string` | auto | Tên file gốc khi upload | `"nghi-phep-2025.pdf"` |
| `filePath` | `string` | auto | Đường dẫn lưu trữ trên disk (ẩn với list API) | `"orgId/kc_xxx/uuid.pdf"` |
| `mimeType` | `string` | auto | MIME type của file | `"application/pdf"` |
| `fileSize` | `number` | auto | Dung lượng file (bytes) | `1048576` |
| `rawContent` | `string` | auto | Nội dung text đã extract (ẩn với list API) | `"Điều 1. Mục đích..."` |
| `embeddingStatus` | `enum` | auto | Trạng thái index | `"pending"` \| `"processing"` \| `"ready"` \| `"error"` |
| `errorMessage` | `string` | auto | Thông tin lỗi nếu status = error | `"Text extraction failed..."` |
| `chunkCount` | `number` | auto | Số chunk đã tạo | `228` |
| `owner` | `{ orgId, userId }` | auto | Chủ sở hữu | `{ "orgId": "org123", "userId": "usr456" }` |
| `isDeleted` | `boolean` | auto | Soft delete flag | `false` |
| `createdAt` | `Date` | auto | Thời điểm tạo | `"2025-03-14T08:00:00.000Z"` |
| `updatedAt` | `Date` | auto | Thời điểm cập nhật | `"2025-03-14T09:00:00.000Z"` |

**embeddingStatus lifecycle:**
```
pending → processing → ready
                    ↘ error
```

**Supported MIME types:**
- `application/pdf` — PDF (text layer hoặc OCR fallback)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — DOCX
- `text/plain` — TXT
- `text/markdown` — Markdown
- `text/html` — HTML (strip tags)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` — XLSX (text fallback)

---

### KnowledgeChunk

Đại diện cho một đoạn văn bản (chunk) được tạo ra trong quá trình index. Dữ liệu derived — sẽ bị xóa và tạo lại khi reindex.

MongoDB collection: `knowledge_chunks`

| Trường | Kiểu | Bắt buộc | Mô tả | Ví dụ |
|--------|------|----------|-------|-------|
| `_id` | `string` (ObjectId) | auto | MongoDB document ID | `"6852a1b2c3d4e5f6a7b8c9d3"` |
| `orgId` | `string` | auto | Organization ID | `"org123"` |
| `collectionId` | `string` | auto | KnowledgeCollection ID | `"6852a1b2c3d4e5f6a7b8c9d0"` |
| `sourceType` | `"file"` \| `"document"` | auto | Nguồn gốc chunk | `"file"` |
| `sourceId` | `string` | auto | ID của KnowledgeFile | `"6852a1b2c3d4e5f6a7b8c9d2"` |
| `chunkIndex` | `number` | auto | Thứ tự chunk trong file (0-based) | `0` |
| `content` | `string` | auto | Nội dung text của chunk | `"Điều 1. Nhân viên được nghỉ 12 ngày phép..."` |
| `metadata` | `object` | auto | Metadata vị trí trong tài liệu gốc | xem bên dưới |
| `qdrantPointId` | `string` (UUID) | auto | ID tương ứng trong Qdrant | `"a1b2c3d4-e5f6-..."` |
| `createdAt` | `Date` | auto | Thời điểm tạo | `"2025-03-14T08:00:00.000Z"` |

**metadata:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `page` | `number` \| undefined | Số trang trong PDF (nếu có) |
| `section` | `string` \| undefined | Tên section/heading |
| `charStart` | `number` \| undefined | Vị trí ký tự bắt đầu trong rawContent |
| `charEnd` | `number` \| undefined | Vị trí ký tự kết thúc trong rawContent |

---

## API Endpoints

Base URL: `http://localhost:3004`
Auth: `Authorization: Bearer <jwt_token>` (tất cả endpoint đều yêu cầu JWT)

---

### Knowledge Collections

#### POST /knowledge-collections

Tạo knowledge collection mới.

**Request body:**
```json
{
  "name": "Quy định nội bộ",
  "description": "Chứa tài liệu nhân sự và chính sách công ty năm 2025",
  "projectId": "6852a1b2c3d4e5f6a7b8c9d1",
  "chunkingConfig": {
    "strategy": "sentence",
    "chunkSize": 512,
    "chunkOverlap": 64
  },
  "embeddingModel": "Qwen/Qwen3-Embedding-8B"
}
```

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `name` | `string` (max 200) | ✅ | Tên collection |
| `description` | `string` (max 1000) | ❌ | Mô tả |
| `projectId` | `string` | ❌ | Liên kết project |
| `chunkingConfig.strategy` | `"fixed"` \| `"sentence"` \| `"paragraph"` | ❌ | Default: `"sentence"` |
| `chunkingConfig.chunkSize` | `number` (min 64) | ❌ | Default: `512` |
| `chunkingConfig.chunkOverlap` | `number` (min 0) | ❌ | Default: `64` |
| `embeddingModel` | `string` | ❌ | Default: giá trị `KB_EMBEDDING_MODEL` env |

**Response 201:**
```json
{
  "_id": "6852a1b2c3d4e5f6a7b8c9d0",
  "name": "Quy định nội bộ",
  "description": "Chứa tài liệu nhân sự và chính sách công ty năm 2025",
  "projectId": "6852a1b2c3d4e5f6a7b8c9d1",
  "status": "idle",
  "chunkingConfig": { "strategy": "sentence", "chunkSize": 512, "chunkOverlap": 64 },
  "stats": {
    "totalFiles": 0, "readyFiles": 0, "processingFiles": 0,
    "errorFiles": 0, "pendingFiles": 0, "totalSize": 0, "totalChunks": 0
  },
  "owner": { "orgId": "org123", "userId": "usr456" },
  "isDeleted": false,
  "createdAt": "2025-03-14T08:00:00.000Z",
  "updatedAt": "2025-03-14T08:00:00.000Z"
}
```

**Errors:** `400` validation, `401` unauthorized

---

#### GET /knowledge-collections

Lấy danh sách collections (org-scoped). Ẩn `qdrantCollection` và `embeddingModel`.

**Query params** (cú pháp `parseQueryString`):

| Param | Kiểu | Mô tả | Ví dụ |
|-------|------|-------|-------|
| `page` | `number` | Trang (default: 1) | `?page=1` |
| `limit` | `number` | Số item/trang (default: 20) | `?limit=10` |
| `sort` | `string` | Sắp xếp | `?sort=createdAt:desc` |
| `status` | `string` | Lọc theo status | `?status=ready` |
| `projectId` | `string` | Lọc theo project | `?projectId=6852...` |
| `name:regex` | `string` | Tìm kiếm tên (case-insensitive) | `?name:regex=quy+định` |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "6852a1b2c3d4e5f6a7b8c9d0",
      "name": "Quy định nội bộ",
      "description": "Chứa tài liệu nhân sự...",
      "status": "ready",
      "chunkingConfig": { "strategy": "sentence", "chunkSize": 512, "chunkOverlap": 64 },
      "stats": {
        "totalFiles": 3, "readyFiles": 3, "processingFiles": 0,
        "errorFiles": 0, "pendingFiles": 0, "totalSize": 2097152, "totalChunks": 450
      },
      "createdAt": "2025-03-14T08:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

#### GET /knowledge-collections/:id

Lấy chi tiết một collection.

**Path params:** `id` — ObjectId của collection

**Response 200:** Tương tự create response (full fields, không bao gồm `qdrantCollection`)

**Errors:** `401` unauthorized, `404` not found

---

#### PATCH /knowledge-collections/:id

Cập nhật tên, mô tả, hoặc chunking config.

**Path params:** `id` — ObjectId của collection

**Request body** (tất cả optional):
```json
{
  "name": "Quy định nội bộ 2025",
  "description": "Cập nhật mô tả",
  "chunkingConfig": { "strategy": "paragraph", "chunkSize": 1024, "chunkOverlap": 128 }
}
```

**Response 200:** Collection đã cập nhật

**Errors:** `400` validation, `401` unauthorized, `404` not found

---

#### DELETE /knowledge-collections/:id

Soft delete collection.

**Path params:** `id` — ObjectId của collection

**Response 200:**
```json
{ "success": true }
```

**Errors:** `401` unauthorized, `404` not found

---

#### POST /knowledge-collections/:id/search

Vector search (RAG query) trong collection.

**Path params:** `id` — ObjectId của collection

**Request body:**
```json
{
  "query": "chính sách nghỉ phép cho nhân viên mới",
  "topK": 5
}
```

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `query` | `string` | ✅ | Câu hỏi hoặc nội dung cần tìm |
| `topK` | `number` (min 1) | ❌ | Số kết quả trả về (default: 5) |

**Response 200:**
```json
{
  "results": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "score": 0.8123,
      "payload": {
        "chunkId": "6852a1b2c3d4e5f6a7b8c9d3",
        "sourceId": "6852a1b2c3d4e5f6a7b8c9d2",
        "sourceType": "file",
        "collectionId": "6852a1b2c3d4e5f6a7b8c9d0",
        "orgId": "org123",
        "content": "Điều 3. Phép năm: Nhân viên được hưởng 12 ngày phép năm sau khi ký hợp đồng lao động chính thức..."
      }
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "score": 0.7654,
      "payload": {
        "chunkId": "6852a1b2c3d4e5f6a7b8c9d4",
        "sourceId": "6852a1b2c3d4e5f6a7b8c9d2",
        "sourceType": "file",
        "collectionId": "6852a1b2c3d4e5f6a7b8c9d0",
        "orgId": "org123",
        "content": "Nhân viên thử việc chưa đủ điều kiện hưởng phép năm trong 60 ngày đầu..."
      }
    }
  ]
}
```

| Trường response | Kiểu | Mô tả |
|-----------------|------|-------|
| `results[].id` | `string` | Qdrant point ID (UUID) |
| `results[].score` | `number` | Điểm cosine similarity (0–1, càng cao càng liên quan) |
| `results[].payload.chunkId` | `string` | MongoDB KnowledgeChunk ID |
| `results[].payload.sourceId` | `string` | MongoDB KnowledgeFile ID |
| `results[].payload.sourceType` | `"file"` \| `"document"` | Loại nguồn |
| `results[].payload.content` | `string` | Nội dung text của chunk |

**Lưu ý:** Kết quả luôn được lọc theo `collectionId` + `orgId` của caller để đảm bảo cách ly dữ liệu.

---

### Knowledge Files

#### POST /knowledge-files/upload

Upload file để index vào knowledge base.

**Content-Type:** `multipart/form-data`
**Max file size:** 50 MB

**Form fields:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `file` | `binary` | ✅ | File cần upload |
| `collectionId` | `string` | ✅ | ID của KnowledgeCollection |
| `name` | `string` | ❌ | Tên hiển thị (mặc định = tên file gốc) |

**Ví dụ curl:**
```bash
curl -X POST http://localhost:3004/knowledge-files/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/document.pdf" \
  -F "collectionId=6852a1b2c3d4e5f6a7b8c9d0" \
  -F "name=Quy định nghỉ phép 2025"
```

**Response 201:**
```json
{
  "_id": "6852a1b2c3d4e5f6a7b8c9d2",
  "collectionId": "6852a1b2c3d4e5f6a7b8c9d0",
  "name": "Quy định nghỉ phép 2025",
  "fileName": "document.pdf",
  "mimeType": "application/pdf",
  "fileSize": 1048576,
  "embeddingStatus": "pending",
  "chunkCount": 0,
  "owner": { "orgId": "org123", "userId": "usr456" },
  "isDeleted": false,
  "createdAt": "2025-03-14T08:00:00.000Z",
  "updatedAt": "2025-03-14T08:00:00.000Z"
}
```

**Errors:** `400` file quá lớn / validation, `401` unauthorized

**Lưu ý:** Sau khi upload, file có `embeddingStatus: "pending"`. Worker (`nx run cbm:emb`) sẽ tự động pick up và index file.

---

#### GET /knowledge-files

Lấy danh sách files (org-scoped). Ẩn `rawContent` và `filePath`.

**Query params:**

| Param | Kiểu | Mô tả | Ví dụ |
|-------|------|-------|-------|
| `page` | `number` | Trang | `?page=1` |
| `limit` | `number` | Số item/trang | `?limit=20` |
| `sort` | `string` | Sắp xếp | `?sort=createdAt:desc` |
| `collectionId` | `string` | Lọc theo collection | `?collectionId=6852...` |
| `embeddingStatus` | `string` | Lọc theo status | `?embeddingStatus=ready` |
| `name:regex` | `string` | Tìm kiếm tên | `?name:regex=quy+định` |

**Response 200:**
```json
{
  "data": [
    {
      "_id": "6852a1b2c3d4e5f6a7b8c9d2",
      "collectionId": "6852a1b2c3d4e5f6a7b8c9d0",
      "name": "Quy định nghỉ phép 2025",
      "fileName": "document.pdf",
      "mimeType": "application/pdf",
      "fileSize": 1048576,
      "embeddingStatus": "ready",
      "chunkCount": 228,
      "createdAt": "2025-03-14T08:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

#### GET /knowledge-files/:id

Lấy chi tiết file, bao gồm `rawContent` (nội dung text đã extract).

**Path params:** `id` — ObjectId của file

**Response 200:**
```json
{
  "_id": "6852a1b2c3d4e5f6a7b8c9d2",
  "collectionId": "6852a1b2c3d4e5f6a7b8c9d0",
  "name": "Quy định nghỉ phép 2025",
  "fileName": "document.pdf",
  "mimeType": "application/pdf",
  "fileSize": 1048576,
  "rawContent": "Điều 1. Mục đích\nQuy định này nhằm...",
  "embeddingStatus": "ready",
  "chunkCount": 228,
  "createdAt": "2025-03-14T08:00:00.000Z"
}
```

**Errors:** `401` unauthorized, `404` not found

---

#### DELETE /knowledge-files/:id

Xóa file, tất cả chunks (MongoDB), và vectors tương ứng (Qdrant).

**Path params:** `id` — ObjectId của file

**Response 200:**
```json
{ "success": true }
```

**Errors:** `401` unauthorized, `404` not found

---

#### POST /knowledge-files/:id/reindex

Trigger reindex file (reset `embeddingStatus` về `pending`, xóa chunks cũ). Worker sẽ tự động xử lý lại.

**Path params:** `id` — ObjectId của file

**Response 200:**
```json
{
  "_id": "6852a1b2c3d4e5f6a7b8c9d2",
  "embeddingStatus": "pending",
  "chunkCount": 0,
  ...
}
```

**Errors:** `401` unauthorized, `404` not found

**Khi nào dùng reindex:**
- Thay đổi `chunkingConfig` của collection
- File bị lỗi trong lần index trước
- Cần index lại sau khi nâng cấp embedding model

---

## Environment Variables

| Biến | Mô tả | Default |
|------|-------|---------|
| `KB_STORAGE_PATH` | Thư mục lưu file upload | `/data/cbm/knowledge` |
| `KB_EMBEDDING_API_URL` | URL embedding API (OpenAI-compatible) | `http://localhost:8080` |
| `KB_EMBEDDING_API_KEY` | API key embedding | _(trống)_ |
| `KB_EMBEDDING_MODEL` | Tên embedding model | `Qwen/Qwen3-Embedding-8B` |
| `QDRANT_URL` | URL Qdrant server | `http://localhost:6333` |
| `QDRANT_API_KEY` | API key Qdrant | _(trống)_ |
| `KB_OCR_API_URL` | URL OCR API (OpenAI chat/completions, Vision LLM) | _(trống — OCR disabled)_ |
| `KB_OCR_API_KEY` | API key OCR | _(trống)_ |
| `KB_OCR_MODEL` | Vision LLM model cho OCR | `Qwen/Qwen2.5-VL-72B-Instruct` |
| `KB_OCR_MAX_PAGES` | Số trang tối đa OCR mỗi file | `50` |

**OCR fallback:** Nếu PDF text layer < 100 ký tự và `KB_OCR_API_URL` được cấu hình, hệ thống sẽ render PDF sang PNG (via pdf2pic + GraphicsMagick + Ghostscript) và gửi từng trang tới Vision LLM để extract text.

---

## Worker

Embedding worker chạy độc lập với API server:

```bash
nx run cbm:emb
```

Worker polling mỗi 5 giây, lấy các file có `embeddingStatus: "pending"`, và chạy full indexing pipeline. Sử dụng Redis distributed lock để tránh xử lý trùng file khi chạy nhiều worker instance.
