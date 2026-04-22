# Document Module - CBM Service

Document module cho phép quản lý tài liệu được tạo bởi AI Agent hoặc người dùng.

## Schema

**Document Fields:**
- `summary` (string, required, max 500) - Tóm tắt/tiêu đề tài liệu
- `content` (string, required) - Nội dung chính của tài liệu
- `type` (enum, required) - Loại nội dung: 'html', 'text', 'markdown', 'json'
- `labels` (string[], required) - Mảng nhãn để phân loại và tìm kiếm
- `status` (enum, optional) - Trạng thái: 'draft', 'published', 'archived' (default: 'draft')
- `scope` (enum, optional) - Phạm vi truy cập: 'public', 'org', 'private' (default: 'private')

**Inherited from BaseSchema:**
- `_id` - MongoDB ObjectId
- `owner` - User ID của người sở hữu
- `createdBy` - User ID người tạo
- `updatedBy` - User ID người cập nhật
- `deletedAt` - Soft delete timestamp
- `metadata` - Custom metadata object
- `createdAt`, `updatedAt` - Timestamps

## Features

- ✅ Full CRUD operations
- ✅ JWT Authentication
- ✅ Pagination support
- ✅ Statistics aggregation (by type, status)
- ✅ Full-text search on summary and content
- ✅ Label indexing for fast filtering
- ✅ Soft delete
- ✅ Swagger documentation

## API Endpoints

### 1. Create Document

```bash
curl -X POST http://localhost:3001/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "API Integration Guide",
    "content": "This guide explains how to integrate with our REST API...",
    "type": "markdown",
    "labels": ["api", "guide", "integration"],
    "status": "draft",
    "scope": "private"
  }'
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "summary": "API Integration Guide",
  "content": "This guide explains how to integrate with our REST API...",
  "type": "markdown",
  "labels": ["api", "guide", "integration"],
  "status": "draft",
  "scope": "private",
  "owner": "user123",
  "createdBy": "user123",
  "updatedBy": "user123",
  "createdAt": "2025-12-04T16:00:00.000Z",
  "updatedAt": "2025-12-04T16:00:00.000Z"
}
```

### 2. Get Document Content (with MIME type)

```bash
curl -X GET "http://localhost:3001/documents/507f1f77bcf86cd799439011/content" \
  -H "Authorization: Bearer $TOKEN"
```

**Response Headers:**
```
Content-Type: text/markdown; charset=utf-8
```

**Response Body:** (raw content)
```
This guide explains how to integrate with our REST API...
```

**MIME Type Mapping:**
- `html` → `text/html`
- `text` → `text/plain`
- `markdown` → `text/markdown`
- `json` → `application/json`

**Use Cases:**
- Display document content in iframe: `<iframe src="/documents/{id}/content" />`
- Download document: Use browser download or `Content-Disposition` header
- Preview in browser with correct rendering

---

### 3. List All Documents (with Pagination & Statistics)

```bash
curl -X GET "http://localhost:3001/documents?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "summary": "API Integration Guide",
      "type": "markdown",
      "labels": ["api", "guide"],
      "status": "draft",
      "createdAt": "2025-12-04T16:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  },
  "statistics": {
    "total": 45,
    "byStatus": {
      "draft": 20,
      "published": 15,
      "archived": 10
    },
    "byType": {
      "markdown": 25,
      "html": 10,
      "text": 8,
      "json": 2
    }
  }
}
```

### 4. Get Document by ID

```bash
curl -X GET "http://localhost:3001/documents/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Update Document

```bash
curl -X PATCH "http://localhost:3001/documents/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Updated API Integration Guide",
    "status": "published",
    "labels": ["api", "guide", "integration", "rest"]
  }'
```

### 6. Delete Document (Soft Delete)

```bash
curl -X DELETE "http://localhost:3001/documents/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer $TOKEN"
```

## Example Use Cases

### Create HTML Document

```bash
curl -X POST http://localhost:3001/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "User Onboarding Guide",
    "content": "<h1>Welcome</h1><p>Follow these steps to get started...</p>",
    "type": "html",
    "labels": ["onboarding", "user-guide", "tutorial"]
  }'
```

### Create JSON Configuration Document

```bash
curl -X POST http://localhost:3001/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "AI Agent Configuration Template",
    "content": "{\"model\": \"gpt-4\", \"temperature\": 0.7, \"maxTokens\": 2000}",
    "type": "json",
    "labels": ["config", "template", "ai-agent"]
  }'
```

### Publish a Draft Document

```bash
curl -X PATCH "http://localhost:3001/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "published",
    "scope": "org"
  }'
```

### Get HTML Document Content and Display in Browser

```bash
# Get the content with proper MIME type
curl -X GET "http://localhost:3001/documents/$DOCUMENT_ID/content" \
  -H "Authorization: Bearer $TOKEN"
```

**Frontend Example:**
```html
<!-- Display HTML document in iframe -->
<iframe
  src="http://localhost:3001/documents/507f1f77bcf86cd799439011/content"
  width="100%"
  height="600px"
></iframe>

<!-- Or fetch and display -->
<script>
async function displayDocument(docId, token) {
  const response = await fetch(`/documents/${docId}/content`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const contentType = response.headers.get('Content-Type');
  const content = await response.text();

  if (contentType.includes('text/html')) {
    // Display HTML
    document.getElementById('preview').innerHTML = content;
  } else if (contentType.includes('text/markdown')) {
    // Render markdown (using markdown library)
    document.getElementById('preview').innerHTML = renderMarkdown(content);
  } else if (contentType.includes('application/json')) {
    // Display formatted JSON
    document.getElementById('preview').innerHTML = `<pre>${JSON.stringify(JSON.parse(content), null, 2)}</pre>`;
  } else {
    // Display as plain text
    document.getElementById('preview').textContent = content;
  }
}
</script>
```

## Testing Steps

1. **Start CBM Service:**
   ```bash
   npx nx serve cbm
   ```

2. **Get Auth Token from IAM Service:**
   ```bash
   TOKEN=$(curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "password"}' \
     | jq -r '.accessToken')
   ```

3. **Create a test document:**
   ```bash
   curl -X POST http://localhost:3001/documents \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "summary": "Test Document",
       "content": "This is a test document content.",
       "type": "text",
       "labels": ["test", "sample"]
     }'
   ```

4. **List all documents:**
   ```bash
   curl -X GET "http://localhost:3001/documents?page=1&limit=5" \
     -H "Authorization: Bearer $TOKEN" | jq
   ```

## Indexes

The following indexes are created for performance:
- `{ type: 1, status: 1 }` - Compound index for filtering
- `{ labels: 1 }` - Array index for label search
- `{ summary: 'text', content: 'text' }` - Full-text search
- `{ createdAt: -1 }` - Sort by creation date

## Architecture Notes

- **Based on Tool Module**: This module follows the same pattern as the Tool module in AIWM service
- **BaseService**: Extends BaseService for automatic CRUD operations with RBAC
- **Statistics**: Automatically aggregates statistics by type and status on list endpoint
- **No Dependencies**: Unlike Tool module, Document has no external dependencies (no Agent checking)
- **Modern Pattern**: Uses modern controller pattern (no BaseController), @CurrentUser decorator
