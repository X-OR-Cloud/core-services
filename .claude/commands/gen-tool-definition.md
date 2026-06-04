# /gen-tool-definition

Generate an api-type Tool definition for a service module.

## Usage

```
/gen-tool-definition <service> <module> [baseUrl]
```

**Examples:**
```
/gen-tool-definition cbm document
/gen-tool-definition cbm project https://xsai-api.x-or.cloud/cbm
/gen-tool-definition aiwm instruction
/gen-tool-definition iam user https://xsai-api.x-or.cloud/iam
```

If `baseUrl` is omitted, infer from service name:
- `cbm` → `https://xsai-api.x-or.cloud/cbm`
- `aiwm` → `https://xsai-api.x-or.cloud/aiwm`
- `iam` → `https://xsai-api.x-or.cloud/iam`

## What to do

Given `<service>` and `<module>`, perform the following steps:

### Step 1 — Read source files

Read these files (adjust path if they don't exist):
- `services/<service>/src/modules/<module>/<module>.controller.ts`
- `services/<service>/src/modules/<module>/<module>.dto.ts`

If additional DTO or schema files are imported, read those too.

### Step 2 — Analyze endpoints

From the controller, extract all endpoints that are suitable for LLM tool use. Skip:
- File upload endpoints (`multipart/form-data`, `FileInterceptor`)
- Public/shared view endpoints that render HTML pages (`res.send(html)`)
- Internal service-to-service endpoints (guarded by `ApiKeyGuard`)
- Endpoints returning raw binary/octet-stream responses

**Include** endpoints that use `@Res() res: Response` but return **text content** (plain text, markdown, JSON string) — the agent client handles non-JSON responses by falling back to plain text.

For each suitable endpoint, extract:
- HTTP method (GET/POST/PATCH/DELETE)
- Path (including path params like `:id`)
- Handler description from `@ApiOperation({ summary: ... })`
- Request body DTO fields (for POST/PATCH)
- Query param fields (for GET)

### Step 3 — Design inputSchema per function

Rules for building `inputSchema`:
- Path params (`:id`, `:memberId`) → add as `{ type: "string", "x-in": "path" }` property, convert `:param` to `{param}` in path
- Body params → add as properties without `x-in`, they go to request body automatically (POST/PATCH)
- Query params → add as properties without `x-in`, they go to query string automatically (GET/DELETE)
- Required fields: only mark as `required` if the DTO validates them as non-optional
- `responseMapping`: add `{ dataPath: "data" }` only for list endpoints (findAll). Single-item endpoints get no responseMapping.
- Descriptions: write in Vietnamese

#### Description quality rules

**Function-level description** phải trả lời đủ 3 câu hỏi:
1. **Khi nào dùng** — mục đích rõ ràng, phân biệt với các function tương tự nếu có
2. **Side effect** — nếu có (ví dụ: "chỉ xóa được khi status=done", "reset recurring task về todo")
3. **Response chứa gì** — chỉ cần ghi nếu không hiển nhiên (ví dụ: ShareDocument trả `{ token, url, expiresAt }`)

**Property-level description:**

- **Enum có > 3 giá trị**: giải thích từng giá trị trên một dòng với format `value = ý nghĩa`
  ```
  "operation: replace=thay toàn bộ; append=thêm cuối; find-replace-text=tìm text khớp chính xác rồi thay (cần find+replace); ..."
  ```
- **Required field không hiển nhiên**: giải thích tại sao cần + format/ví dụ
  ```
  "labels: Tags phân loại để tìm kiếm. Ví dụ: ['api','guide']. Có thể để []"
  ```
- **Field phụ thuộc field khác**: ghi rõ điều kiện
  ```
  "find: đoạn text cần tìm — bắt buộc khi operation=find-replace-text hoặc append-after-text"
  "knowledgeCollectionId: bắt buộc khi embeddingEnabled=true"
  ```
- **Function phụ thuộc function khác**: ghi ở function description
  ```
  "Dùng khi GetDocumentSessionStatus trả về hasDraft=true. Không cần nếu chỉ dùng UpdateDocumentContent thông thường."
  ```

### Step 4 — Output the mongosh seed command

Output a ready-to-run `mongosh` seed command using this pattern:

```javascript
mongosh "$(grep MONGODB_URI /Users/dzung/Code/hydra-byte/hydra-services/.env | cut -d= -f2-)" --quiet --eval '
use("core_aiwm");
db.tools.insertOne({
  _id: new ObjectId(),
  name: "<ModuleName>",           // PascalCase, e.g. DocumentManagement
  type: "api",
  description: "<description>",
  category: "productivity",
  status: "active",
  scope: "org",
  execution: {
    baseUrl: "<baseUrl>",
    headers: {
      "Authorization": "Bearer {{AGENT_ACCESS_TOKEN}}",
      "Content-Type": "application/json"
    },
    timeout: 15000
  },
  functions: [ /* ... */ ],
  schema: { inputSchema: {}, outputSchema: {} },
  isDeleted: false,
  owner: { orgId: "691eb9e6517f917943ae1f9d", groupId: "", userId: "", agentId: "" },
  createdAt: new Date(),
  updatedAt: new Date()
});
'
```

### Step 5 — Summary table

After the seed command, print a summary table:

| Function | Method | Path | Notes |
|----------|--------|------|-------|
| ...      | ...    | ...  | ...   |

And note any endpoints that were **skipped** and why.

## Conventions

- Function names: PascalCase, verb + noun. Examples: `CreateDocument`, `ListProjects`, `GetWork`, `StartWork`, `BlockWork`
- State transition endpoints (no body, just id): inputSchema has only `{ id: { type: "string", x-in: "path" } }`
- Do NOT include endpoints that upload files, render HTML, or require API key auth
- orgId is always `"691eb9e6517f917943ae1f9d"` for this project
