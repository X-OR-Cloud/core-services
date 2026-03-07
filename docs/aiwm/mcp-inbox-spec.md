# MCP Inbox — Agent-to-Agent Messaging Specification

**Version:** 1.0 (Draft)
**MCP Server name:** `Inbox`
**Tool prefix:** `mcp__Inbox__*`
**Scope:** Internal agent-to-agent messaging via AIWM backend

---

## Overview

`mcp__Inbox__*` is a built-in MCP server that enables agents to send and receive messages with each other asynchronously through the AIWM platform.

This is distinct from:
- `mcp__Chat__*` — sending content to the **current user** via the active platform session (Discord, Telegram, AIWM chat)
- Future `mcp__User__*` — direct messaging to a specific user outside the active session

The Inbox follows an **async inbox model**: agents send messages that are stored by AIWM and delivered on the next heartbeat cycle. Latency is approximately 60 seconds (one heartbeat interval).

### Key concepts

| Concept | Description |
|---------|-------------|
| **Message** | A text payload sent from one agent to another, stored by AIWM |
| **Inbox** | Messages received by this agent (`status: unread / read`) |
| **Sent** | Messages sent by this agent (`status: unread / read / all`) |
| **Read** | Action that marks a received message as read and returns its content |
| **Heartbeat trigger** | AIWM notifies the agent of unread messages via `systemMessage` in the heartbeat response |

---

## Heartbeat Integration

When the heartbeat response contains unread messages and no active work is in progress, AIWM sends a `systemMessage` to the agent with the following format:

```json
{
  "type": "inbox",
  "unreadCount": 2,
  "messages": [
    {
      "messageId": "msg_abc123",
      "fromAgentId": "agent_xyz",
      "fromAgentName": "DataAgent",
      "sentAt": "2026-03-07T10:30:00Z",
      "preview": "Can you process the latest report?"
    },
    {
      "messageId": "msg_abc124",
      "fromAgentId": "agent_uvw",
      "fromAgentName": "MonitorAgent",
      "sentAt": "2026-03-07T10:28:00Z",
      "preview": "Alert: threshold exceeded on metric XYZ"
    }
  ]
}
```

The agent then decides whether to call `mcp__Inbox__Read` on each message and optionally reply via `mcp__Inbox__Send`.

---

## Tools

### 1. `Send`

Send a message to another agent's inbox.

**Tool name:** `mcp__Inbox__Send`

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toAgentId` | string | yes | Target agent ID (from `ListAgents` in `mcp_builtin`) |
| `content` | string | yes | Message body text |
| `subject` | string | no | Optional subject/title for context |
| `replyToMessageId` | string | no | If this is a reply, reference the original message ID |

**Response:**

```json
{
  "messageId": "msg_abc123",
  "toAgentId": "agent_xyz",
  "sentAt": "2026-03-07T10:30:00Z",
  "status": "delivered"
}
```

**Notes:**
- `status` is `delivered` when AIWM has accepted the message (not yet read by recipient)
- Agent discovery: use `mcp_builtin` tools `ListAgents` or `ListProjectMembers` to find `agentId` values

---

### 2. `GetMessages`

Retrieve messages from this agent's inbox (messages **received** by this agent).

**Tool name:** `mcp__Inbox__GetMessages`

**Input:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `status` | string | no | `unread` | Filter: `unread`, `read`, or `all` |
| `limit` | number | no | `20` | Max number of messages to return |
| `offset` | number | no | `0` | Pagination offset |

**Response:**

```json
{
  "total": 5,
  "messages": [
    {
      "messageId": "msg_abc123",
      "fromAgentId": "agent_xyz",
      "fromAgentName": "DataAgent",
      "subject": "Report request",
      "preview": "Can you process the latest report?",
      "sentAt": "2026-03-07T10:30:00Z",
      "status": "unread"
    }
  ]
}
```

**Notes:**
- Returns metadata only (no full content). Call `Read` to get full content and mark as read.
- Default filter is `unread` to minimize token usage.

---

### 3. `GetSent`

Retrieve messages **sent** by this agent — useful for checking delivery status or reviewing sent history.

**Tool name:** `mcp__Inbox__GetSent`

**Input:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `status` | string | no | `all` | Filter by recipient read status: `unread` (recipient hasn't read), `read` (recipient has read), or `all` |
| `limit` | number | no | `20` | Max number of messages to return |
| `offset` | number | no | `0` | Pagination offset |

**Response:**

```json
{
  "total": 3,
  "messages": [
    {
      "messageId": "msg_abc120",
      "toAgentId": "agent_xyz",
      "toAgentName": "DataAgent",
      "subject": "Task assignment",
      "preview": "Please analyze the Q1 data",
      "sentAt": "2026-03-07T09:00:00Z",
      "recipientStatus": "read",
      "readAt": "2026-03-07T09:01:05Z"
    }
  ]
}
```

**Notes:**
- `recipientStatus: unread` means the target agent has not yet read the message.
- `readAt` is only present when `recipientStatus: read`.

---

### 4. `Read`

Read the full content of a specific message and mark it as **read**.

**Tool name:** `mcp__Inbox__Read`

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messageId` | string | yes | The message ID to read |

**Response:**

```json
{
  "messageId": "msg_abc123",
  "fromAgentId": "agent_xyz",
  "fromAgentName": "DataAgent",
  "subject": "Report request",
  "content": "Can you process the latest Q1 sales report and send me a summary? The file is at /workspace/reports/q1.xlsx",
  "sentAt": "2026-03-07T10:30:00Z",
  "replyToMessageId": null,
  "markedReadAt": "2026-03-07T10:31:00Z"
}
```

**Notes:**
- Calling `Read` always marks the message as read, regardless of previous status.
- If the message was already read, `markedReadAt` reflects the first time it was read.

---

## AIWM API Endpoints Required

The following REST endpoints need to be implemented on the AIWM backend. All endpoints require agent JWT authentication (`Authorization: Bearer <accessToken>`).

### Send a message

```
POST /api/agents/messages
```

**Request body:**
```json
{
  "toAgentId": "agent_xyz",
  "subject": "optional subject",
  "content": "message body",
  "replyToMessageId": "msg_optional"
}
```

**Response:** `201 Created`
```json
{
  "messageId": "msg_abc123",
  "toAgentId": "agent_xyz",
  "sentAt": "2026-03-07T10:30:00Z",
  "status": "delivered"
}
```

---

### Get inbox (received messages)

```
GET /api/agents/messages/inbox?status=unread&limit=20&offset=0
```

**Query params:** `status` (`unread` | `read` | `all`), `limit`, `offset`

**Response:** `200 OK`
```json
{
  "total": 5,
  "messages": [...]
}
```

---

### Get sent messages

```
GET /api/agents/messages/sent?status=all&limit=20&offset=0
```

**Query params:** `status` (`unread` | `read` | `all`), `limit`, `offset`

**Response:** `200 OK`
```json
{
  "total": 3,
  "messages": [...]
}
```

---

### Read a message (mark as read + get content)

```
POST /api/agents/messages/:messageId/read
```

**No request body.**

**Response:** `200 OK`
```json
{
  "messageId": "msg_abc123",
  "fromAgentId": "agent_xyz",
  "fromAgentName": "DataAgent",
  "subject": "...",
  "content": "full message text",
  "sentAt": "...",
  "replyToMessageId": null,
  "markedReadAt": "..."
}
```

---

## Heartbeat Response Change

The `POST /api/agents/heartbeat` response needs to include an `inbox` field when there are unread messages:

**Current response (no change):**
```json
{
  "status": "ok",
  "systemMessage": null
}
```

**New response when unread messages exist and agent is idle:**
```json
{
  "status": "ok",
  "systemMessage": {
    "type": "inbox",
    "unreadCount": 2,
    "messages": [
      {
        "messageId": "msg_abc123",
        "fromAgentId": "agent_xyz",
        "fromAgentName": "DataAgent",
        "sentAt": "2026-03-07T10:30:00Z",
        "preview": "Can you process the latest report?"
      }
    ]
  }
}
```

**Rules:**
- Only include `inbox` in `systemMessage` if agent is not currently busy (AIWM can track this via heartbeat `status` field: `idle` vs `busy`)
- `preview` should be truncated to ~100 characters to minimize payload size
- If `systemMessage` already has a scheduled task/work, inbox notification should wait for next heartbeat

---

## Message Data Model

```
AgentMessage {
  _id          : ObjectId          // internal DB ID
  messageId    : string            // public ID (e.g. "msg_abc123")
  fromAgentId  : ObjectId ref Agent
  toAgentId    : ObjectId ref Agent
  subject      : string?
  content      : string            // full message body
  replyToId    : ObjectId?         // reference to parent message
  status       : "delivered" | "read"
  sentAt       : Date
  readAt        : Date?
  projectId    : ObjectId ref Project  // scoped to project for security
}
```

**Security notes:**
- An agent can only read messages addressed to itself (`toAgentId == currentAgent`)
- An agent can only see its own sent messages (`fromAgentId == currentAgent`)
- Messages are scoped to `projectId` — cross-project messaging is not allowed
- Message content is stored as plaintext; encryption is out of scope for v1

---

## Client-side Implementation Plan (any-agent)

Once AIWM endpoints are ready, the implementation in `any-agent` will:

1. **Create `src/tools/InboxMcpServer.ts`** — MCP server `name: 'Inbox'` with 4 tools: `Send`, `GetMessages`, `GetSent`, `Read`. Context includes `agentId` and `accessToken` from AIWM connect response.

2. **Register in `ClaudeCode.ts`** — always-on builtin (no config flag needed), similar to `Chat` MCP server.

3. **Add allowed tools** — `mcp__Inbox__Send`, `mcp__Inbox__GetMessages`, `mcp__Inbox__GetSent`, `mcp__Inbox__Read` always included in `allowedTools`.

4. **Update `HeartbeatService.ts`** — parse `systemMessage.type === 'inbox'` and format the prompt:

```
You have {unreadCount} unread message(s) in your inbox:
- msg_abc123 from DataAgent (2026-03-07 10:30): "Can you process the latest report?"
- msg_abc124 from MonitorAgent (2026-03-07 10:28): "Alert: threshold exceeded on metric XYZ"

Use mcp__Inbox__Read to read each message and respond if needed.
```

5. **Add `formatToolUse` cases** in `ClaudeCode.ts` for display in Discord verbose logs.

---

## Example Agent Interaction Flow

```
[10:30] DataAgent sends message to ReportAgent
        POST /api/agents/messages
        { toAgentId: "report_agent", content: "Please analyze Q1 data" }
        → messageId: "msg_001"

[10:31] Heartbeat cycle — AIWM checks ReportAgent inbox
        ReportAgent is idle (status: idle in last heartbeat)
        → heartbeat response includes systemMessage with inbox notification

[10:31] HeartbeatService in ReportAgent formats systemMessage
        → agent processes: calls mcp__Inbox__Read("msg_001")
        → reads full content
        → performs analysis task
        → calls mcp__Inbox__Send({ toAgentId: "data_agent", replyToMessageId: "msg_001", content: "Analysis complete. Summary: ..." })

[10:32] Next heartbeat — DataAgent notified of reply
        → DataAgent reads reply via mcp__Inbox__Read
```
