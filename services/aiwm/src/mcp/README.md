# MCP Built-in Tools

This directory contains built-in MCP tools that integrate with CBM and other services in the Hydra ecosystem.

## Architecture

```
mcp/
├── builtin/                    # Built-in tools registry
│   ├── cbm/                   # CBM service tools
│   │   ├── document-management/
│   │   │   ├── tools.ts       # 15 tool definitions
│   │   │   ├── schemas.ts     # Zod validation schemas
│   │   │   ├── executors.ts   # Execution logic
│   │   │   └── index.ts       # Exports
│   │   ├── project-management/
│   │   │   ├── tools.ts       # 14 tool definitions
│   │   │   ├── schemas.ts     # Zod validation schemas
│   │   │   ├── executors.ts   # Execution logic
│   │   │   └── index.ts       # Exports
│   │   └── work-management/
│   │       ├── tools.ts       # 19 tool definitions
│   │       ├── schemas.ts     # Zod validation schemas
│   │       ├── executors.ts   # Execution logic
│   │       └── index.ts       # Exports
│   └── index.ts               # Built-in tools registry (48 tools total)
├── types.ts                   # Common types
├── utils.ts                   # Helper functions
└── README.md                  # This file
```

## How It Works

1. **Tool Definition**: Each built-in tool is defined in `tools.ts` with:
   - Name (e.g., `CreateDocument`)
   - Description
   - Type (`builtin`)
   - Category (e.g., `DocumentManagement`)
   - Input schema (Zod)
   - Executor function

2. **Schema Validation**: Zod schemas in `schemas.ts` validate tool inputs before execution

3. **Execution**: Executors in `executors.ts` make authenticated API calls to CBM service using the agent's JWT token

4. **Registration**: Tools are registered in `bootstrap-mcp.ts` when an agent connects

## Available Built-in Tools

### DocumentManagement (15 tools)

| Tool Name | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `CreateDocument` | POST | `/documents` | Create a new document |
| `ListDocuments` | GET | `/documents` | List documents with filters |
| `GetDocument` | GET | `/documents/:id` | Get document metadata by ID |
| `GetDocumentContent` | GET | `/documents/:id/content` | Get raw document content |
| `UpdateDocument` | PATCH | `/documents/:id` | Update metadata + content + type |
| `UpdateDocumentContent` | PATCH | `/documents/:id/content` | Update content via operation |
| `DeleteDocument` | DELETE | `/documents/:id` | Soft delete document |
| `ReplaceDocumentContent` | PATCH | `/documents/:id/content` | Replace entire content |
| `SearchAndReplaceTextInDocument` | PATCH | `/documents/:id/content` | Find & replace text |
| `SearchAndReplaceRegexInDocument` | PATCH | `/documents/:id/content` | Find & replace via regex |
| `ReplaceMarkdownSectionInDocument` | PATCH | `/documents/:id/content` | Replace markdown section by heading |
| `AppendToDocument` | PATCH | `/documents/:id/content` | Append to end of document |
| `AppendAfterTextInDocument` | PATCH | `/documents/:id/content` | Append after specific text |
| `AppendToMarkdownSectionInDocument` | PATCH | `/documents/:id/content` | Append to end of markdown section |
| `ShareDocument` | POST | `/documents/:id/share` | Create time-limited share link (TTL 60-86400s) |

### ProjectManagement (14 tools)

| Tool Name | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `CreateProject` | POST | `/projects` | Create project with name, summary, description, lead, members, dates, tags |
| `ListProjects` | GET | `/projects` | List projects with pagination and search |
| `GetProject` | GET | `/projects/:id` | Get project details |
| `UpdateProject` | PATCH | `/projects/:id` | Update name, summary, description, dates, tags |
| `DeleteProject` | DELETE | `/projects/:id` | Soft delete (completed/archived only) |
| `ActivateProject` | POST | `/projects/:id/activate` | `draft → active` |
| `HoldProject` | POST | `/projects/:id/hold` | `active → on_hold` |
| `ResumeProject` | POST | `/projects/:id/resume` | `on_hold → active` |
| `CompleteProject` | POST | `/projects/:id/complete` | `active → completed` |
| `ArchiveProject` | POST | `/projects/:id/archive` | `completed → archived` |
| `ListProjectMembers` | GET | `/projects/:id/members` | List all members with roles |
| `AddProjectMember` | POST | `/projects/:id/members` | Add user/agent as member |
| `UpdateProjectMember` | PATCH | `/projects/:id/members/:memberId` | Update member role |
| `RemoveProjectMember` | DELETE | `/projects/:id/members/:memberId` | Remove member from project |

### WorkManagement (19 tools)

| Tool Name | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `CreateWork` | POST | `/works` | Create epic, task, or subtask |
| `ScheduleWork` | POST | `/works` | Schedule one-time task (auto sets recurrence=onetime) |
| `CreateRecurringWork` | POST | `/works` | Create recurring task (interval/daily/weekly/monthly) |
| `ListWorks` | GET | `/works` | List works with filters |
| `GetWork` | GET | `/works/:id` | Get work details |
| `UpdateWork` | PATCH | `/works/:id` | Update metadata, recurrence, assignee |
| `DeleteWork` | DELETE | `/works/:id` | Soft delete (done/cancelled only) |
| `AssignAndTodoWork` | POST | `/works/:id/assign-and-todo` | `backlog → todo` with assignee |
| `StartWork` | POST | `/works/:id/start` | `todo → in_progress` |
| `BlockWork` | POST | `/works/:id/block` | `in_progress → blocked` (requires reason) |
| `UnblockWork` | POST | `/works/:id/unblock` | `blocked → todo` (optional feedback) |
| `RequestReviewForWork` | POST | `/works/:id/request-review` | `in_progress → review` |
| `RejectReviewForWork` | POST | `/works/:id/reject-review` | `review → todo` (requires feedback) |
| `CompleteWork` | POST | `/works/:id/complete` | `review → done` |
| `ReopenWork` | POST | `/works/:id/reopen` | `done/cancelled → in_progress` |
| `CancelWork` | POST | `/works/:id/cancel` | any → `cancelled` |
| `GetNextWork` | GET | `/works/next-work` | Get highest-priority work for user/agent |
| `RecalculateEpicStatus` | POST | `/works/:id/recalculate-status` | Recalculate epic status from child tasks |
| `CanTriggerWork` | GET | `/works/:id/can-trigger` | Check if work is ready to trigger agent |

## Enabling Built-in Tools for an Agent

1. **Create a built-in tool entry in AIWM** (type=`builtin`):
```bash
curl -X POST http://localhost:3003/tools \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DocumentManagement",
    "description": "Built-in tool for managing documents",
    "type": "builtin",
    "status": "active"
  }'
```

2. **Get the tool ID** from response and add to agent's `allowedToolIds`

3. **Generate agent JWT token**:
```bash
curl -X POST http://localhost:3003/agents/{agentId}/token \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"expiresIn": 3600}'
```

4. **Connect to MCP server** with agent token and call `tools/list`

## Adding New Built-in Tools

### 1. Create Tool Module

```bash
mkdir -p services/aiwm/src/mcp/builtin/cbm/my-new-tool
```

### 2. Define Schemas (`schemas.ts`)

```typescript
import * as z from 'zod';

export const MyOperationSchema = z.object({
  field1: z.string().describe('Description'),
  field2: z.number().optional().describe('Optional field'),
});
```

### 3. Implement Executors (`executors.ts`)

```typescript
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse } from '../../../utils';

export async function executeMyOperation(
  args: { field1: string; field2?: number },
  context: ExecutionContext
): Promise<ToolResponse> {
  const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
  const response = await makeServiceRequest(`${cbmBaseUrl}/my-endpoint`, {
    method: 'POST',
    context,
    body: JSON.stringify(args),
  });
  return formatToolResponse(response);
}
```

### 4. Define Tools (`tools.ts`) and export from `index.ts`

### 5. Register in `services/aiwm/src/mcp/builtin/index.ts`

```typescript
export const BuiltInTools: ToolDefinition[] = [
  ...DocumentManagementTools,
  ...ProjectManagementTools,
  ...WorkManagementTools,
  ...MyNewTools, // Add here
];
```

## Environment Variables

- `CBM_SERVICE_URL` (default: `http://localhost:3001`) — used as `context.cbmBaseUrl`

## Security

- All built-in tools require agent JWT authentication
- Token is forwarded from agent connection to CBM service calls
- RBAC enforced at CBM level (project.lead / project.member / org.owner roles)
