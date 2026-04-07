## Work

Work items (epic / task / subtask) within a Project. Support state machine,
recurring schedules, and priority ordering.

### Types
- `epic` — large work container
- `task` — standard work unit (can be under epic)
- `subtask` — granular step (must be under task)

### State Machine
```
backlog → todo → in_progress → review → done
                     ↓                   ↓
                  blocked           (reopen)
                     ↓
                 cancelled ← (any status)
done / cancelled → reopen → in_progress
```

### Workflows

#### Standard task flow
1. `POST /works` `{ projectId, type, title }` → status: backlog
2. `POST /works/:id/start` → backlog/todo → in_progress
3. `POST /works/:id/review` → in_progress → review
4. `POST /works/:id/complete` → review → done

#### Recurring tasks
- Set `recurring: { frequency: "weekly", interval: 1 }` on create
- On complete → status resets to `todo`, `startAt` recalculated automatically
- To stop recurrence: PATCH `{ recurring: null }`

### Business Rules
- Project must be `active` to create work items
- `subtask` requires `parentId` pointing to a `task`
- Blocked status requires `blockedReason` field
- `priority` field used for manual ordering (lower = higher priority)

### Agent Hints
- Error 400 "project not active": activate the project first via `POST /projects/:id/activate`
- Error 400 "invalid parent type": subtasks can only be under tasks, not epics
- To list all incomplete tasks in a project: `GET /works?filter[projectId]={id}&filter[status][nin]=done,cancelled`
- To find overdue tasks: `GET /works?filter[projectId]={id}&filter[dueDate][lt]={today}`
