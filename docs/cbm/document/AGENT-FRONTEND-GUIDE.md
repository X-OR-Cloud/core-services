# Document Feature — FE Agent Integration Guide

> **Audience:** Frontend Agent building the Document editor UI.  
> **Stack assumption:** React, BlockNote (Notion-like editor), Yjs, Hocuspocus WebSocket client.  
> **Base URL:** `https://api.x-or.cloud/cbm` (or `http://localhost:3004` locally).  
> **Auth:** All requests require `Authorization: Bearer <jwt>` unless marked `(public)`.

---

## 1. Mental Model

A Document has **two content layers**:

| Layer | Where | When |
|---|---|---|
| **Committed content** | `content` field in MongoDB | Ground truth. Agents read/write this via REST. |
| **Draft state** | `draftState` (Yjs binary) in MongoDB + synced live via WebSocket | Active collab session. Cleared on commit. |

**The flow:**
```
Open doc → Check session status → Connect WebSocket (Hocuspocus)
         → Editor loads, seeds committed content if no draft
         → User edits → Yjs syncs live (other cursors see changes)
         → User clicks Save → POST /commit → draft flushed to committed content
         → Next agent read sees updated committed content
```

**Key rule:** Once a WebSocket session is active, REST `PATCH /:id/content` from agents will be **rejected with 409**. Agents must wait for the session to end, or the user must commit first.

---

## 2. Document Lifecycle States

```
[created]
    │
    ├─ No collab session → REST editable by agents
    │
    └─ collab session open (hasActiveDraft=true)
           │
           ├─ Editors connected → live Yjs sync
           │
           └─ Last editor disconnects (session TTL = 600s)
                      │
                      └─ POST /commit → content updated, draftState cleared
```

---

## 3. REST API Reference

### 3.1 Create Document

```
POST /documents
```

**Body:**
```json
{
  "summary": "Meeting notes Q2",
  "content": "# Meeting Notes\n\nAgenda...",
  "type": "markdown",
  "projectId": "<objectId>",
  "shareMode": "organization",
  "labels": ["meeting", "q2"]
}
```

**Fields:**
| Field | Type | Required | Notes |
|---|---|---|---|
| `summary` | string (max 500) | ✅ | Title shown in list views |
| `content` | string | ✅ | Initial content (markdown recommended) |
| `type` | `html` \| `text` \| `markdown` \| `json` | ✅ | Use `markdown` for agent-native format |
| `projectId` | ObjectId string | ❌ | Links document to a project |
| `shareMode` | `private` \| `organization` | ❌ | Default: `private` |
| `labels` | string[] | ❌ | Tags for filtering |
| `knowledgeCollectionId` | ObjectId string | ❌ | Link to RAG knowledge base |

**Response:** Full document entity (see Section 6).

---

### 3.2 List Documents

```
GET /documents?page=1&limit=20&projectId=<id>&status=published&search=meeting
```

**Query params:**
| Param | Example | Notes |
|---|---|---|
| `page` | `1` | Pagination |
| `limit` | `20` | Max results |
| `projectId` | `<objectId>` | Filter by project |
| `status` | `draft` \| `published` \| `archived` | Filter by status |
| `search` | `meeting notes` | Full-text search on summary + content |
| `labels:in` | `meeting,q2` | Filter by labels (comma-separated) |
| `sort` | `createdAt:desc` | Default: `createdAt:desc` |

**Response:** `{ data: DocumentSummary[], pagination: { total, page, limit } }`

> Note: `content` field is **excluded** from list response to keep payloads small.

---

### 3.3 Get Document Metadata

```
GET /documents/:id
```

Returns document entity **without** `content`. Use to check status, attachments, mentions, session state.

---

### 3.4 Get Document Content

```
GET /documents/:id/content
```

Returns raw content string with `Content-Type: text/markdown` (or appropriate MIME).

**Use case:** Agent reads this to understand document before editing.

---

### 3.5 Update Metadata

```
PATCH /documents/:id
```

**Body** (all fields optional):
```json
{
  "summary": "Updated title",
  "status": "published",
  "shareMode": "organization",
  "labels": ["q2", "approved"],
  "projectId": "<objectId>"
}
```

> Does **not** touch content. Use this to update title, labels, status lifecycle.

---

### 3.6 Update Content (Agent/Programmatic)

```
PATCH /documents/:id/content
```

**⚠️ Blocked when collab session is active.** Returns 409 if `hasActiveDraft=true` and editors are connected.

**Body:**
```json
{
  "operation": "replace",
  "content": "# New Content\n\nFull replacement."
}
```

**Available operations:**

| Operation | Purpose | Extra fields |
|---|---|---|
| `replace` | Full content replacement | `content` |
| `append` | Add to end of document | `content` |
| `append-after-text` | Insert after a specific paragraph | `content`, `afterText` |
| `append-to-section` | Insert under a markdown heading | `content`, `sectionHeading` |
| `find-replace-text` | Exact string replacement | `findText`, `replaceText` |
| `find-replace-regex` | Regex replacement | `findPattern`, `replaceText`, `regexFlags?` |
| `find-replace-markdown` | Markdown-aware block replacement | `findText`, `replaceText` |

**Examples:**
```json
// Append a new section
{ "operation": "append-to-section", "sectionHeading": "## Action Items", "content": "- [ ] Review PR #42" }

// Fix a typo
{ "operation": "find-replace-text", "findText": "statment", "replaceText": "statement" }

// Agent inserts summary block
{ "operation": "append-after-text", "afterText": "# Meeting Notes", "content": "\n> AI Summary: ..." }
```

---

### 3.7 Soft Delete Document

```
DELETE /documents/:id
```

Cascade soft-deletes all attachment files. Requires project.lead or org.owner role.

---

### 3.8 Share Link (Public Access)

```
POST /documents/:id/share
Body: { "ttlSeconds": 86400 }
Response: { "token": "<jwt>", "expiresAt": "<ISO datetime>" }

GET /documents/shared/:token   (public, no auth)
Response: { document metadata + content }
```

**Use case:** Share read-only view with external users. Token is stateless JWT, no DB entry.

---

### 3.9 Enable RAG Embedding

```
PATCH /documents/:id/embedding
Body: { "enabled": true, "knowledgeCollectionId": "<id>" }
```

When enabled, document content is chunked and indexed into Qdrant for AI retrieval.

---

### 3.10 Upload Attachment

```
POST /documents/:id/attachments
Content-Type: multipart/form-data
Field: file (max 50MB)
```

**Response:**
```json
{
  "fileId": "<objectId>",
  "placeholder": "![filename.png](file:<objectId>)",
  "url": "<presigned S3 URL>"
}
```

**Usage:** After upload, paste `placeholder` into markdown content at the cursor position. The server parses `file:<id>` references to track attachment lifecycle.

---

### 3.11 Commit Draft (Save collab session)

```
POST /documents/:id/commit
Body: { "content": "# Full markdown content from editor..." }
```

**Purpose:** Called when user clicks "Save" in BlockNote editor. The FE serializes the Yjs-backed editor to markdown, then POSTs it here.

**What happens server-side:**
1. Overwrites `content` with the submitted markdown
2. Clears `draftState` (Yjs binary)
3. Sets `hasActiveDraft = false`
4. Publishes `cbm:document-committed` event (other services can react)
5. Cascade-orphaned attachments (files in old `attachments[]` not referenced in new content) are soft-deleted

**Response:** Updated document entity.

---

### 3.12 Session Status

```
GET /documents/:id/session-status
```

**Response:**
```json
{
  "hasActiveDraft": true,
  "draftUpdatedAt": "2026-04-21T10:30:00Z",
  "activeEditorCount": 2
}
```

**Use case:**
- Poll this every 30s to show "X editors online" badge
- Check before agent edit: if `hasActiveDraft=true`, warn user instead of editing
- Show unsaved draft indicator when `hasActiveDraft=true && activeEditorCount=0` (draft exists, nobody connected — needs commit)

---

## 4. Realtime Collaboration (WebSocket)

### 4.1 Connection

**Protocol:** Hocuspocus over WebSocket  
**Endpoint:** `ws://localhost:3014` (dev) / `wss://rtc.x-or.cloud` (prod)  
**Port:** 3014 (separate process `cbm:rtc`)

```typescript
import { HocuspocusProvider } from '@hocuspocus/provider';

const provider = new HocuspocusProvider({
  url: 'wss://rtc.x-or.cloud',
  name: `document:<mongoDocumentId>`,   // MUST match this exact format
  token: jwtToken,                       // Same JWT as REST API
});
```

### 4.2 Authentication

The server verifies the JWT and extracts `orgId`. Access is granted if:
- User belongs to the same org as the document's creator (`createdBy.orgId` match), **or**
- User has `universe.owner` or `organization.owner` role (super-admin)

On auth failure → WebSocket closes with error.

### 4.3 Client-Side Seeding (Critical Step)

The server returns an **empty Yjs document** when there is no existing draft. The client must seed it with the committed content:

```typescript
provider.on('synced', async ({ state }) => {
  const ydoc = provider.document;
  const xmlFragment = ydoc.get('default', Y.XmlFragment);

  // Only seed if Yjs doc is truly empty (no prior draft)
  const hasContent = xmlFragment.length > 0;
  if (!hasContent) {
    const rawMarkdown = await fetch(`/cbm/documents/${docId}/content`).then(r => r.text());
    const blocks = await editor.tryParseMarkdownToBlocks(rawMarkdown);
    editor.replaceBlocks(editor.document, blocks);
    // Now Yjs syncs this seeded content to all peers
  }
});
```

**Why client-side?** The server runs NestJS without a browser DOM — it cannot run BlockNote's markdown parser. Only the FE does the markdown → Yjs block conversion.

### 4.4 Presence (Who's Online)

```typescript
// Awareness = lightweight per-connection state (name, cursor, color)
provider.setAwarenessField('user', {
  name: currentUser.fullName,
  color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16),
});

provider.awareness.on('change', () => {
  const states = Array.from(provider.awareness.getStates().values());
  const onlineUsers = states.map(s => s.user).filter(Boolean);
  setOnlineUsers(onlineUsers); // Show avatars in toolbar
});
```

### 4.5 Commit Flow

When user clicks Save:

```typescript
async function commitDocument() {
  // 1. Serialize current Yjs editor state to markdown
  const markdown = await editor.blocksToMarkdownLossy(editor.document);

  // 2. POST to commit endpoint
  const res = await fetch(`/cbm/documents/${docId}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ content: markdown }),
  });

  if (res.ok) {
    // 3. Optionally disconnect WebSocket to release session
    provider.disconnect();
    showToast('Saved!');
  }
}
```

### 4.6 Auto-Save Strategy (Recommended)

```
User edits → Yjs syncs live (no REST call needed)
Every 60s → POST /commit (background auto-save)
On tab close / navigate away → POST /commit (beforeunload)
On explicit Save button → POST /commit + show confirmation
```

The draft is also **persisted to MongoDB** by the Hocuspocus server on every Yjs update (debounced 2s), so data is never lost even without commit — but the committed content field won't update until POST /commit is called.

---

## 5. Mentions & Attachments (Markdown Conventions)

### 5.1 Attachment Embeds

Images and files embedded in content use this syntax:

```markdown
![alt text](file:<fileObjectId>)
```

**Example:**
```markdown
Here is the architecture diagram:

![System Architecture](file:6634a1b2c3d4e5f678901234)
```

**How it works:**
- FE uploads file → receives `placeholder` string from `/attachments` endpoint
- FE inserts placeholder at cursor
- Server parses these references to build the `attachments[]` array on the document
- On commit, server detects removed references and soft-deletes orphaned files

### 5.2 Mentions

Cross-references to other entities use this syntax:

```markdown
[label](@kind:objectId)
```

**Supported kinds:**

| Kind | Example | Renders As |
|---|---|---|
| `user` | `[Tony](@user:6634a...)` | @mention, shows avatar |
| `document` | `[Meeting Notes](@document:6634a...)` | Link to document |
| `work` | `[TASK-42](@work:6634a...)` | Link to work item |
| `project` | `[Project Alpha](@project:6634a...)` | Link to project |
| `knowledge-collection` | `[KB: Legal](@knowledge-collection:6634a...)` | Link to KB |

**FE implementation:** Trigger mention picker on `@` keystroke. Search users/documents/works, insert placeholder on selection.

---

## 6. Document Entity Schema

Full document object returned by most endpoints:

```typescript
interface Document {
  _id: string;
  summary: string;            // Title / short description
  content: string;            // Excluded in list endpoints
  type: 'html' | 'text' | 'markdown' | 'json';
  labels: string[];
  status: 'draft' | 'published' | 'archived';
  projectId?: string;
  shareMode: 'private' | 'organization';
  embeddingEnabled: boolean;
  knowledgeCollectionId?: string;
  embeddingStatus: 'pending' | 'processing' | 'ready' | 'error' | null;

  // Collab fields
  hasActiveDraft: boolean;    // true = active or uncommitted Yjs draft
  draftUpdatedAt?: string;    // ISO datetime of last Yjs write
  draftState?: any;           // Yjs binary (never expose to user)

  // References (parsed from markdown content)
  attachments: Array<{
    fileId: string;
    kind: 'image' | 'video' | 'file';
    placeholder: string;      // e.g. "![name.png](file:<id>)"
  }>;
  mentions: Array<{
    kind: 'document' | 'work' | 'project' | 'user' | 'knowledge-collection';
    id: string;
  }>;

  // Audit
  createdBy: { userId: string; orgId: string };
  updatedBy: { userId: string; orgId: string };
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}
```

---

## 7. Agent-Assisted Writing

### 7.1 How Agents Edit Documents

Agents (AI assistants) edit documents via REST, not WebSocket. The access model:

```
[Session Active?]
  YES → Agent receives 409 DOCUMENT_IN_ACTIVE_SESSION
            → FE should show: "A live editing session is in progress. 
               Please save and close the editor before asking the AI to edit."
  NO  → Agent uses PATCH /:id/content with appropriate operation
```

### 7.2 Recommended Agent Edit Patterns

**Append a section written by agent:**
```json
PATCH /documents/:id/content
{ "operation": "append", "content": "\n## AI-Generated Summary\n\n..." }
```

**Insert context-aware content:**
```json
{ "operation": "append-after-text", "afterText": "## Action Items", "content": "\n- [ ] AI suggested: Review the Q2 budget\n" }
```

**Improve a section:**
```json
{ "operation": "find-replace-markdown", "findText": "old paragraph text", "replaceText": "improved paragraph text" }
```

### 7.3 Conflict Handling in UI

When `PATCH /documents/:id/content` returns 409:

```json
{
  "statusCode": 409,
  "error": "DOCUMENT_IN_ACTIVE_SESSION",
  "message": "A live editing session is active. Commit the draft first."
}
```

**Recommended UX:**
```
┌─────────────────────────────────────────────┐
│ ⚠️  Document is being edited live            │
│                                             │
│ 2 editors are currently in this document.   │
│ AI editing is paused during live sessions.  │
│                                             │
│ [Ask editors to save]  [Check again]        │
└─────────────────────────────────────────────┘
```

---

## 8. Access Control Summary

| Action | Creator | Project Member | Project Lead | Org Owner |
|---|---|---|---|---|
| View document | ✅ | ✅* | ✅ | ✅ |
| Edit content | ✅ | ✅* | ✅ | ✅ |
| Update metadata | ✅ | ✅* | ✅ | ✅ |
| Delete document | ❌ | ❌ | ✅ | ✅ |
| Upload attachment | ✅ | ✅* | ✅ | ✅ |
| Commit draft | ✅ | ✅* | ✅ | ✅ |
| Enable embedding | ✅ | ✅* | ✅ | ✅ |

`*` = only if document's `shareMode='organization'` or document is in a project the user is a member of.

**Private documents without projectId:** Only creator and org.owner can access.

---

## 9. Error Reference

| Code | Status | Meaning |
|---|---|---|
| `DOCUMENT_IN_ACTIVE_SESSION` | 409 | Agent tried to edit while live session active |
| `DOCUMENT_NOT_FOUND` | 404 | Invalid `_id` or soft-deleted |
| `SHARE_LINK_EXPIRED` | 410 | Share token TTL elapsed |
| `INVALID_SHARE_TOKEN` | 400 | Malformed or tampered JWT share token |
| `TEXT_NOT_FOUND` | 400 | `find-replace-text` / `append-after-text` target not found in content |
| `FORBIDDEN` | 403 | Insufficient role for action |

---

## 10. Recommended UI Components

### Document List
- Table/card view with `summary`, `status` badge, `labels`, `updatedAt`
- Search bar → `?search=`
- Filter by `projectId`, `status`, `labels:in`
- "X editors online" badge from `/session-status`

### Document Editor (BlockNote)
- Full-width Notion-style editor
- Toolbar: Bold, Italic, Heading, Code, Image upload, Mention picker (`@`)
- Top bar: Status select, Share button, Save button
- Presence bar: Avatar stack of online editors (from Yjs awareness)
- Unsaved draft indicator: "Draft auto-saved at HH:MM. Click Save to commit."
- AI assist button: Opens agent chat sidebar → agent edits via REST operations

### Draft State Indicator Logic
```
hasActiveDraft=false                → No indicator (clean committed state)
hasActiveDraft=true, activeEditors>0 → "X editors editing live"
hasActiveDraft=true, activeEditors=0 → "Unsaved draft from HH:MM — Save to commit"
```

---

## 11. Quick Start Checklist for FE Agent

- [ ] Install: `@blocknote/react`, `@blocknote/core`, `@hocuspocus/provider`, `yjs`
- [ ] Implement `GET /documents` list page
- [ ] Implement `POST /documents` create modal
- [ ] Implement `GET /documents/:id/content` → seed BlockNote on `synced`
- [ ] Wire Hocuspocus provider with `document:<id>` room name and JWT token
- [ ] Implement `POST /documents/:id/commit` on Save button
- [ ] Implement `POST /documents/:id/attachments` on image/file paste or upload
- [ ] Implement `@` mention picker (search users, documents, works)
- [ ] Show presence avatars from `provider.awareness`
- [ ] Show 409 conflict UX when agent edit is blocked
- [ ] Poll `GET /documents/:id/session-status` for draft/editor count indicator
