## Project

Manages projects with member-based RBAC and status state machine.
Projects are the top-level container for Work items and Documents.

### State Machine
```
draft → active → completed → archived
              ↘          ↗
            on_hold
```
- Soft delete allowed only for `completed` or `archived`

### Roles & Permissions
| Action | member | lead | org.owner |
|---|:---:|:---:|:---:|
| View project | ✓ | ✓ | ✓ |
| Update / state transitions | — | ✓ | ✓ |
| Delete (completed/archived) | — | ✓ | ✓ |
| Manage members | — | ✓ | ✓ |

### Workflows

#### Create and activate a project
1. `POST /projects` → status: draft
2. `POST /projects/:id/activate` → status: active
3. Add members: `POST /projects/:id/members` `{ userId, role: "member" }`

#### Complete a project
1. `POST /projects/:id/complete` → status: completed (from active or on_hold)
2. Optionally archive: `POST /projects/:id/archive`

### Business Rules
- Non-members can only see public project fields
- Lead or org.owner required for all write operations
- `on_hold` is reversible → `active` via `POST /projects/:id/activate`
- Cannot add duplicate members — check existing members first

### Agent Hints
- Error 403 with `leadIds`: not a project lead — request access from listed leads
- Error 400 "invalid status transition": check current status, only certain transitions are valid
- To find all projects where user is a member: `GET /projects?filter[memberIds]={userId}`
