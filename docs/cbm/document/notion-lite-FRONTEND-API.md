# Document Notion-lite — Frontend API

Phase: Plan #2 — Document Notion-lite (BE ready).

This document describes the new/changed backend endpoints that the Document
editor FE needs to integrate with. All endpoints require
`Authorization: Bearer <jwt>` unless stated otherwise.

## Schema changes (response shape)

`Document` responses from `GET /documents`, `GET /documents/:id`, and
`PATCH /documents/:id` now include these new fields:

```json
{
  "_id": "...",
  "summary": "...",
  "type": "markdown",
  "content": "...",
  "labels": [],
  "status": "draft",
  "shareMode": "private",
  "projectId": "...",
  "embeddingEnabled": false,
  "embeddingStatus": null,
  "knowledgeCollectionId": null,

  "attachments": [
    { "fileId": "69f...", "kind": "image", "placeholder": "file:69f..." }
  ],
  "mentions": [
    { "kind": "document", "id": "69a..." },
    { "kind": "work", "id": "69b..." }
  ],
  "hasActiveDraft": false,
  "draftUpdatedAt": null
}
```

- `attachments` and `mentions` are **derived indexes** — rebuilt automatically
  every time the content is saved. FE does not need to maintain them.
- `hasActiveDraft` is always `false` in Plan #2 (no Yjs session yet).

## Markdown conventions

The editor must serialize the following constructs using these exact schemes so
that the BE's reference extractor can index them correctly:

### Attachment (image / video / file)

```markdown
![alt text](file:<fileId>)
```

- `<fileId>` is a 24-hex ObjectId returned by `POST /documents/:id/attachments`
- `kind` is derived by the BE from the alt text:
  - `video` or `video:...` → `video`
  - `file` or `file:...` → `file`
  - anything else → `image`
- Do **not** hard-code S3 URLs in content — they expire. Always use the
  `file:<id>` placeholder and resolve via `GET /files/:id/url`.

### Mention

```markdown
[Design Spec v2](@document:69a1...)
[Fix login](@work:69b2...)
[Project Hydra](@project:69c3...)
[@Tony Hoang](@user:69d4...)
[KB: Product docs](@knowledge-collection:69e5...)
```

- Scheme: `[label](@<kind>:<objectId>)`
- Allowed kinds: `document`, `work`, `project`, `user`, `knowledge-collection`
- Label text is a snapshot — it does not auto-refresh if the target resource is
  renamed.

## New endpoints

### 1. Upload attachment

```
POST /documents/:id/attachments
Content-Type: multipart/form-data
```

**Body (form-data):**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | binary | ✅ | Max 50MB, image/video/file/pdf/text |
| `name` | string | ❌ | Display name, default = original filename |

**Response `201 Created`:**

```json
{
  "fileId": "69f1a2b3c4d5e6f708091011",
  "placeholder": "file:69f1a2b3c4d5e6f708091011",
  "kind": "image",
  "name": "screenshot.png",
  "fileName": "screenshot.png",
  "mimeType": "image/png",
  "fileSize": 123456
}
```

**FE usage:**
```
1. User drops an image into the editor
2. POST /documents/:id/attachments with the file
3. Insert `![screenshot.png](file:<fileId>)` at cursor
4. When rendering, resolve the URL:
     GET /files/:fileId/url → { url, expiresIn }
   Cache the URL for ~50% of expiresIn and re-fetch on 401/403
```

**Errors:**
- `400` — MIME type not supported for attachment purpose, or
  `ownerId` / `ownerKind` validation failure
- `403` — caller lacks write access on the document
- `404` — document not found
- `413` — file > 50MB

### 2. Commit draft (stub in Plan #2)

```
POST /documents/:id/commit
Content-Type: application/json
```

**Body:**

```json
{ "content": "# Updated markdown body…" }
```

The `content` field is optional. In Plan #2 this endpoint is a convenience for
FE save — it simply updates the document content body and returns a stub
response. In Plan #3 it will flush the Yjs draft state and broadcast to
collaborators.

**Response `201`:**

When `content` is provided:
```json
{
  "hasActiveDraft": false,
  "committed": true,
  "message": "Content saved (no active draft session in Plan #2)."
}
```

When `content` is omitted:
```json
{
  "hasActiveDraft": false,
  "committed": false,
  "message": "No active draft session. Realtime collaboration (Plan #3) is not enabled yet."
}
```

**FE guidance for Plan #2:**
- Implement the Save button to call `POST /documents/:id/commit` with
  `{ content: <serialized markdown> }`. When Plan #3 ships, the same button
  will trigger the Yjs flush instead, with no API contract change on the FE
  side (the BE will accept both).
- Don't show a "draft" badge yet — `hasActiveDraft` is always `false`.

### 3. Existing endpoints — unchanged, but payload includes new fields

| Endpoint | Change |
|---|---|
| `GET /documents` | `data[]` entries include `attachments`, `mentions`, `hasActiveDraft` |
| `GET /documents/:id` | Same + no content body (use `/content` for raw) |
| `GET /documents/:id/content` | Unchanged — returns raw content with mime header |
| `PATCH /documents/:id` | Re-extracts references whenever `content` changes; any attachments removed from the new content are **soft-deleted automatically** |
| `PATCH /documents/:id/content` | Same auto-extraction; MCP ops work as before |
| `DELETE /documents/:id` | Cascade-soft-deletes all referenced attachments |

## Attachment lifecycle

1. **Upload** — `POST /documents/:id/attachments` creates a `File` record with
   `purpose='attachment'`, `ownerRef={kind:'document', id:<docId>}`.
2. **Insert placeholder** — FE writes `![alt](file:<id>)` in the markdown. On
   the next save (`PATCH /documents/:id` or `/commit`), the BE extracts the
   reference and adds it to the document's `attachments` index.
3. **Adopt orphan** — if a file was uploaded but not yet referenced, the BE
   leaves it alone. As soon as the placeholder appears in content, the BE sets
   `ownerRef` on the file (if still unassigned).
4. **Remove from content** — when the placeholder is removed from content in a
   save, the BE diffs `before` vs `after` attachments and **soft-deletes** the
   orphaned file records. The S3 object is retained until a separate GC runs.
5. **Delete document** — cascade soft-deletes all attachment files in the
   document's `attachments` index.

## Mentions lifecycle

- Mentions are **read-only references**. The BE does not validate that the
  target resource exists, and it does not notify the mentioned user/resource.
- FE is responsible for:
  - rendering each mention as a chip with kind-specific styling
  - looking up the resource on hover/click for a preview card
  - handling "resource not found or not accessible" gracefully

## Error format

Standard NestJS errors with correlation id:

```json
{
  "statusCode": 400,
  "message": "…",
  "error": "Bad Request",
  "correlationId": "…"
}
```

## Questions to confirm with BE before FE rollout

1. Should mention suggestions use a new `GET /search/mentionable` endpoint, or
   reuse existing module list endpoints (documents, works, etc.)? — not built
   yet, FE can prototype with existing per-module list endpoints and call them
   with `?search=<query>&limit=10`.
2. The `POST /documents/:id/commit` currently accepts a `content` body for
   Plan #2 compatibility. Plan #3 will deprecate that in favor of Yjs flush.
   Keep the client code consolidated into a single `saveDocument()` function so
   the transition is painless.
3. The editor ("Ask AI") flow pushes a selection reference into the global
   chat widget as a new reference type — tracked in Plan #2 backend docs but
   not implemented yet on AIWM context builder. FE can ship the UX with a TODO
   until the AIWM side lands.
