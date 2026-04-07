## Document

Text documents (html / markdown / json) linked to a Project.
Supports content versioning and shareable public links.

### Supported Formats
- `html` — rich text
- `markdown` — markdown content
- `text` — plain text
- `json` — structured JSON data

### Workflows

#### Create a document
1. `POST /documents` `{ projectId, title, format, content }`
2. Document is immediately readable by project members

#### Share document publicly
1. `POST /documents/:id/share` → returns `{ shareToken, shareUrl }`
2. Public access (no auth): `GET /documents/public/:shareToken`
3. Revoke: `DELETE /documents/:id/share`

### Business Rules
- Must be linked to an existing active Project
- Project members can create and update documents
- Only project leads can delete documents
- Share links do not expire by default — revoke manually when done

### Agent Hints
- Error 404 on share link: token may have been revoked — regenerate with `POST /documents/:id/share`
- To search documents by content: `GET /documents?search={keyword}&filter[projectId]={id}`
- Format cannot be changed after creation — create a new document instead
