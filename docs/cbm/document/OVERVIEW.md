# Document Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/cbm/src/modules/document/
├── document.schema.ts      # MongoDB schema (extends BaseSchema)
├── document.dto.ts         # DTOs: Create, Update, DocumentQuery, UpdateContent
├── document.service.ts     # Business logic (extends BaseService)
├── document.controller.ts  # REST API endpoints
└── document.module.ts      # NestJS module
```

## 2. Mục đích

Document module quản lý tài liệu text-based (HTML, Markdown, JSON, Plain text) do user hoặc AI agent tạo. Hỗ trợ advanced content operations (find-replace, append, section editing) phù hợp cho AI agent thao tác nội dung.

## 3. Schema Fields

```
Document extends BaseSchema:
  summary: string (required, max 500)          // Tiêu đề / tóm tắt
  content: string (required)                   // Nội dung chính
  type: 'html' | 'text' | 'markdown' | 'json' (required)
  labels: string[] (default: [])               // Labels phân loại và tìm kiếm
  status: 'draft' | 'published' | 'archived' (default: 'draft')
  projectId?: string                          // Optional reference to Project
  // Inherited from BaseSchema: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
```

**Indexes**: `{ type: 1, status: 1 }`, `{ labels: 1 }`, `{ summary: 'text', content: 'text' }`, `{ createdAt: -1 }`, `{ projectId: 1 }`

## 4. API Endpoints

### CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/documents` | User JWT | Tạo document |
| GET | `/documents` | User JWT | Danh sách + statistics (byStatus, byType). Excludes `content` |
| GET | `/documents/:id` | User JWT | Metadata document (excludes `content`) |
| GET | `/documents/:id/content` | User JWT | Trả content với MIME type header phù hợp |
| PATCH | `/documents/:id` | User JWT | Cập nhật metadata (summary, labels, status, type) |
| PATCH | `/documents/:id/content` | User JWT | Advanced content operations (7 loại) |
| DELETE | `/documents/:id` | User JWT | Soft delete |

### Content Operations (PATCH `/documents/:id/content`)

| Operation | Mô tả | Fields cần |
|-----------|-------|------------|
| `replace` | Thay toàn bộ content | `content` |
| `find-replace-text` | Tìm và thay text (case-insensitive) | `find`, `replace` |
| `find-replace-regex` | Tìm và thay bằng regex | `pattern`, `replace`, `flags?` |
| `find-replace-markdown` | Thay nội dung section markdown | `section`, `sectionContent` |
| `append` | Thêm vào cuối document | `content` |
| `append-after-text` | Thêm sau đoạn text cụ thể | `find`, `content` |
| `append-to-section` | Thêm vào cuối section markdown | `section`, `content` |

## 5. findAll Response

`GET /documents` trả về response kèm statistics:

```
{
  data: Document[]           // Excludes `content` field
  pagination: { total, page, limit }
  statistics: {
    total: number,
    byStatus: { draft: N, published: N, archived: N },
    byType: { html: N, text: N, markdown: N, json: N }
  }
}
```

**Search**: Query param `?search=keyword` tìm trong summary, content, và labels.

## 6. Content Endpoint

`GET /documents/:id/content` trả content với MIME type header:

| Document type | MIME type |
|---------------|-----------|
| `html` | `text/html; charset=utf-8` |
| `text` | `text/plain; charset=utf-8` |
| `markdown` | `text/markdown; charset=utf-8` |
| `json` | `application/json; charset=utf-8` |

## 7. DTOs

### CreateDocumentDto
- `summary` (required): string, min 1, max 500
- `content` (required): string, min 1
- `type` (required): enum `['html', 'text', 'markdown', 'json']`
- `labels` (required): string[]
- `projectId` (optional): string — ref to Project
- ~~`status`~~ — không có trong DTO. System forces `'draft'` khi create

### UpdateDocumentDto
- All fields optional (partial update)
- Same validations as CreateDocumentDto

### DocumentQueryDto (extends PaginationQueryDto)
- `search` (optional): string — tìm kiếm trong summary, content, labels

### UpdateContentDto
- `operation` (required): enum (7 operations)
- `content` (optional): nội dung mới
- `find` (optional): text cần tìm
- `replace` (optional): text thay thế
- `pattern` (optional): regex pattern
- `flags` (optional): regex flags (default: `'g'`)
- `section` (optional): markdown heading (e.g., `## API Spec`)
- `sectionContent` (optional): nội dung mới cho section

## 8. Key Design Decisions

### Content tách biệt khỏi metadata
- `findById()` excludes `content` field → giảm response size cho list/metadata queries
- `findByIdWithContent()` trả đầy đủ → chỉ dùng cho `/content` endpoint
- `findAll()` excludes `content` từ tất cả items

### Ownership filtering
- Mọi query đều filter theo `owner.orgId` từ JWT context
- Đảm bảo tenant isolation

## 9. Dependencies

- **MongooseModule**: Document schema registration
- **BaseService** (`@hydrabyte/base`): CRUD operations, pagination, aggregation, RBAC

**Exports**: `DocumentService`, `MongooseModule`

## 10. Existing Documentation

- `docs/cbm/document/FRONTEND-API.md` — Frontend API integration guide
- `docs/cbm/document/ROADMAP.md` — Planned improvements
