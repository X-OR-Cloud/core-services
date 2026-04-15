# Document Realtime Collaboration — Frontend API

Phase: Plan #3 — Realtime collaboration (Hocuspocus + Yjs) is live.

This guide covers the WebSocket handshake, the client-side seeding flow
(first client loads markdown into the Yjs fragment), commit/save semantics,
and the new session-status / conflict-rejection endpoints on cbm:api.

## Topology

```
Browser (BlockNote editor + y-hocuspocus-provider)
  ↕  WebSocket  (ws://cbm-rtc:3014/...)
cbm:rtc  (Hocuspocus server, port 3014)
  ↕  Mongo (draftState)   + Redis (session registry)
cbm:api  (REST, port 3004)
  POST /documents/:id/commit       ← flush draft → content markdown
  GET  /documents/:id/session-status
  PATCH /documents/:id/content     ← MCP / agent path (rejects with 409 if session active)
```

- **cbm:rtc is a separate process on port 3014.** Both cbm:api and cbm:rtc
  talk to the same Mongo + Redis, so they stay consistent.
- **MVP: one cbm:rtc replica.** State is in-memory per document — scaling to
  multiple replicas requires either sticky-session routing by docId or the
  Hocuspocus Redis extension. Not in scope for this release.

## WebSocket handshake

### URL format

```
ws://cbm-rtc:3014
```

Hocuspocus multiplexes all documents over one endpoint; the document name is
sent in the protocol payload, not the URL path. Use the client provider:

```ts
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useCreateBlockNote } from '@blocknote/react';

const documentId = '69f1a2...';

const ydoc = new Y.Doc();

// Offline cache so users can keep typing through short disconnects
const idb = new IndexeddbPersistence(`cbm-doc-${documentId}`, ydoc);

const provider = new HocuspocusProvider({
  url: import.meta.env.VITE_CBM_RTC_URL, // e.g. ws://localhost:3014
  name: `document:${documentId}`,        // REQUIRED — BE parses this as doc id
  document: ydoc,
  token: () => getJwtToken(),             // user JWT, same one as cbm:api
});
```

**Document name format:** `document:<mongo-id>`. The BE rejects any other
prefix.

**Auth:** the `token` field is the same user JWT used for cbm:api (Bearer
token). Hocuspocus's `onAuthenticate` hook verifies it, loads the document,
checks that the document's org matches the token's `orgId`, and attaches a
user context to subsequent hooks. An invalid/expired token or an
org-mismatched document rejects the handshake.

## Client-side seeding (first connect)

Yjs has no concept of "initial value", so the first client to open an empty
document must hydrate the shared fragment from the current markdown body in
Mongo. BlockNote binds automatically to the fragment — you just have to wait
for the provider to sync, check if the doc is empty, and call
`replaceBlocks` once.

```ts
const editor = useCreateBlockNote({
  collaboration: {
    provider,
    fragment: ydoc.getXmlFragment('document-store'),
    user: { name: currentUser.displayName, color: getUserColor(currentUser.id) },
    showCursorLabels: 'activity',
  },
});

// Fetch initial markdown once via REST
const initialMarkdown = await fetch(`/documents/${documentId}/content`).then(r => r.text());

provider.on('synced', async () => {
  // Only the first client to reach a still-empty doc seeds it. All later
  // clients (or reconnects after a draft exists) will see the already-seeded
  // fragment and skip this branch.
  if (editor.document.length === 0 && initialMarkdown.trim().length > 0) {
    const blocks = await editor.tryParseMarkdownToBlocks(initialMarkdown);
    editor.replaceBlocks(editor.document, blocks);
  }
});
```

**Race protection recommendation:** if you're worried about two clients
simultaneously seeding an empty doc, use a Yjs transaction with a sentinel:

```ts
const meta = ydoc.getMap('cbm-meta');
provider.on('synced', async () => {
  if (meta.get('seeded')) return;
  ydoc.transact(() => {
    if (meta.get('seeded')) return; // double-check inside transaction
    meta.set('seeded', true);
    // ...seed here...
  });
});
```

The sentinel is also useful for detecting "fresh session after commit" —
after `POST /commit`, the BE clears `draftState` and publishes a commit
event. Clients should drop the Yjs doc and reconnect to pick up the new
content (see "Handling external commits" below).

## Commit / save flow

```
POST /documents/:id/commit
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Body:**
```json
{ "content": "# Serialized markdown body…" }
```

The client serializes the live editor state to markdown before posting:

```ts
async function saveDocument() {
  const markdown = await editor.blocksToMarkdownLossy();
  await fetch(`/documents/${documentId}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ content: markdown }),
  });
}
```

**Response `201`:**

- With content:
  ```json
  {
    "hasActiveDraft": false,
    "committed": true,
    "message": "Draft committed successfully."
  }
  ```
- Without content:
  ```json
  {
    "hasActiveDraft": false,
    "committed": false,
    "message": "No content provided. Send the current editor state as `content` (markdown) to commit."
  }
  ```

**What the BE does on commit:**
1. Verifies write access on the document (same rules as `PATCH /documents/:id`).
2. Re-extracts `attachments`/`mentions` from the new content and diffs
   orphaned attachments against the previous snapshot — orphans are
   soft-deleted automatically (same as a normal update).
3. Writes `content` + clears `draftState`, `draftUpdatedAt`, `hasActiveDraft`.
4. Publishes a `cbm:document-committed` event on Redis so cbm:rtc can kick
   connected clients.
5. Returns the updated flags.

**Why the client serializes markdown:** cbm:rtc runs as a headless Node
process and does not load BlockNote/ProseMirror. Serializing on the client
lets us keep cbm:rtc lightweight and avoid jsdom. The caller is authenticated
with write access, so trusting its serialized output is acceptable.

## Session status for the UI

```
GET /documents/:id/session-status
Authorization: Bearer <jwt>
```

**Response `200`:**
```json
{
  "hasActiveDraft": true,
  "draftUpdatedAt": "2026-04-14T10:23:45.123Z",
  "activeEditorCount": 2
}
```

**FE usage:**
- Show a "Draft (2 editors)" chip in the document header when
  `hasActiveDraft === true`.
- When `hasActiveDraft` flips from `true` → `false` (via SSE/polling or a
  commit ACK), hide the chip and show a "Saved" toast.
- The `activeEditorCount` is derived from Redis presence; it's accurate
  within ~5s and is best-effort.

**Polling recommendation:** poll every 10-15s only while the editor is open.
A real-time push will come in a later phase.

## MCP / agent conflict handling (DOCUMENT_IN_ACTIVE_SESSION)

When an agent tries to edit a document while a live collab session is open,
the cbm:api endpoints return **`409 Conflict`** with a structured payload:

```json
{
  "statusCode": 409,
  "error": "DOCUMENT_IN_ACTIVE_SESSION",
  "message": "Document is currently being edited by 2 user(s) in a live collaboration session. Your edit was not applied. Please ask the user to apply your suggestion manually via chat, or retry later when the session ends.",
  "documentId": "69f1a2...",
  "activeUserCount": 2
}
```

The following endpoints return this error when a session is active:

| Endpoint | Notes |
|---|---|
| `PATCH /documents/:id/content` | MCP update-content ops |
| `PATCH /documents/:id` with `content` in body | Direct content edit |
| `PATCH /documents/:id` without `content` | **Allowed** — metadata-only edits bypass the check |

The agent tool executor on AIWM catches this code and reports back to the
user via chat, typically along with the suggested new content so the user
can paste it manually. No FE handling is required unless you build a
non-chat agent UI.

## Handling external commits (someone else saves while you're editing)

Scenario: user A and user B are both connected to `document:X`. User A
clicks **Save**. The BE commits A's content, clears `draftState`, and
publishes the commit event. Now user B's Yjs state is stale — their local
fragment still holds the old blocks plus any edits B made after A's save.

**Current behavior (MVP):**

- cbm:rtc does not automatically disconnect B's client in this release.
- B's next keystroke writes a new Yjs update that will overwrite A's saved
  content on next commit (last-writer-wins within the collab window).

**Recommended FE handling until Phase 3.1 adds force-disconnect broadcast:**

1. Poll `GET /documents/:id/session-status` every 10s.
2. If `draftUpdatedAt` is much older than the client's local
   `provider.synced` timestamp, show a "Content changed outside your
   session" banner and prompt the user to reload.
3. On reload, drop the Y.Doc, construct a fresh one, and let the seeding
   flow hydrate from the new `content`.

A later iteration will publish a `document-committed` Redis event from
cbm:api → cbm:rtc → client via a broadcast message, eliminating the need
for polling.

## Offline behavior

- `y-indexeddb` persists the Yjs state locally so users can type offline.
- On reconnect, Yjs merges the local state with the server state. No data
  loss within the window that matters for a doc editor (minutes to hours).
- Provider lifecycle events: subscribe to `provider.on('status', ({ status }) => …)`
  to show an offline/online indicator. `status` is one of
  `connecting | connected | disconnected`.

## Environment variables (ops)

The cbm:rtc process reads:

| Var | Default | Purpose |
|---|---|---|
| `CBM_RTC_PORT` | `3014` | Listen port |
| `CBM_RTC_HOST` | `0.0.0.0` | Bind address |
| `MONGODB_URI` | — | Shared with cbm:api |
| `REDIS_*` | — | Shared with cbm:api |
| `JWT_SECRET` | — | Must match cbm:api to verify tokens |

Run with:

```
nx run cbm:rtc
```

or

```
MODE=rtc node dist/services/cbm/main.js
```

## Migration / data concerns

- **No backfill needed.** The `draftState`, `draftUpdatedAt`, and
  `hasActiveDraft` fields were added in Plan #2 (with default null/false)
  so existing documents are already forward-compatible.
- Documents that have never been opened in the new editor will start with
  `draftState: null` and be seeded by the first client.
- Documents that were updated via MCP stay as-is — MCP writes directly to
  `content`, bypassing Yjs.

## Error codes quick reference

| Code | Meaning | FE action |
|---|---|---|
| 401 on handshake | JWT invalid/expired | Re-auth and retry |
| Access denied during handshake | Doc in another org / caller lacks write | Show permission error, close editor |
| 404 on commit | Document deleted while session open | Redirect to document list |
| 409 DOCUMENT_IN_ACTIVE_SESSION | Agent tried to write during a session | N/A — agent handles |
| 410 Gone on share token | Share link expired | Show expired link message |

## Open questions / future work

- **Hocuspocus Redis extension** — to scale cbm:rtc beyond one replica.
- **Server-side commit broadcast** — cbm:api → cbm:rtc push so clients get
  "someone committed" notifications without polling.
- **Permission revocation mid-session** — currently requires client reload;
  future work will force-disconnect from the server side.
- **Version history** — snapshots of `content` on each commit. Not in Plan #3.
