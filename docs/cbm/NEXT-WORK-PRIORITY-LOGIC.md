# Next Work Priority Logic

## Overview

This document defines the logic for retrieving the next work item for a user or agent based on priority rules. The system ensures that the most important and actionable work is surfaced first.

## Endpoint

```
GET /works/next-work?assigneeType={user|agent}&assigneeId={id}
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assigneeType` | `user` \| `agent` | Yes | Type of entity requesting next work |
| `assigneeId` | `string` | Yes | ID of the user or agent |

### Response Format

```typescript
{
  work: Work | null,           // The next work item, or null if none available
  metadata: {
    priorityLevel: number,     // 1-5 indicating which priority rule matched
    priorityDescription: string, // Human-readable explanation
    matchedCriteria: string[]  // List of criteria that were satisfied
  }
}
```

## Priority Rules

The system evaluates work items in strict priority order. Once a work item is found at a given priority level, lower priorities are not evaluated.

### Priority 1: Scheduled/Recurring Tasks with Scheduled Time Reached

**Criteria:**
- Work type: `task`
- `isRecurring`: `true` (includes both `onetime` and recurring types)
- Assignee: Matches requesting user/agent
- Status: `todo`
- `startAt`: <= current time
- Not deleted: `deletedAt = null`
- Has no subtasks
- Dependencies: All dependency works must be in `done` or `cancelled` status
- Ordering: Oldest `startAt` first (most overdue first)

**Rationale:** Scheduled and recurring tasks that have reached their scheduled time are the highest priority, as they represent time-sensitive work that must be executed on schedule. This includes onetime scheduled tasks (`recurrence.type = 'onetime'`) and recurring tasks.

**Query Logic:**
```javascript
{
  type: 'task',
  isRecurring: true,
  'assignee.type': assigneeType,
  'assignee.id': assigneeId,
  status: 'todo',
  startAt: { $lte: new Date() },
  isDeleted: false,
}
// Sort: { startAt: 1 }
// Then check no subtasks + validate dependencies
```

### Priority 2: Assigned Subtasks in Todo Status

**Criteria:**
- Work type: `subtask`
- Assignee: Matches requesting user/agent
- Status: `todo`
- Not deleted: `deletedAt = null`
- Dependencies: All dependency works must be in `done` or `cancelled` status
- Ordering: Oldest `createdAt` first (FIFO)

**Rationale:** Subtasks assigned to you that are ready to start are the next highest priority.

**Query Logic:**
```javascript
{
  type: 'subtask',
  'assignee.type': assigneeType,
  'assignee.id': assigneeId,
  status: 'todo',
  isDeleted: false,
}
// Sort: { createdAt: 1 }
// Limit: 1
// Then validate dependencies
```

### Priority 3: Assigned Tasks Without Subtasks in Todo Status

**Criteria:**
- Work type: `task`
- Assignee: Matches requesting user/agent
- Status: `todo`
- Not deleted: `deletedAt = null`
- Has no subtasks: No `subtask` records exist with `parentId` pointing to this task
- Dependencies: All dependency works must be in `done` or `cancelled` status
- Ordering: Oldest `createdAt` first (FIFO)

**Rationale:** Tasks assigned to you that don't have subtasks are actionable work items.

### Priority 4: Reported Works in Blocked Status

**Criteria:**
- Work type: `task` OR `subtask` (not epic)
- Reporter: Matches requesting user/agent
- Status: `blocked`
- Not deleted: `deletedAt = null`
- Ordering: Oldest `createdAt` first (FIFO)

**Rationale:** Work items you reported that are blocked need your attention to resolve the blocker.

### Priority 5: Reported Works in Review Status

**Criteria:**
- Work type: `task` OR `subtask` (not epic)
- Reporter: Matches requesting user/agent
- Status: `review`
- Not deleted: `deletedAt = null`
- Ordering: Oldest `createdAt` first (FIFO)

**Rationale:** Work items you reported that are awaiting review need your approval.

## Dependency Validation Logic

### Validation Rules

```typescript
async function validateDependencies(work: Work): Promise<boolean> {
  // No dependencies = always valid
  if (!work.dependencies || work.dependencies.length === 0) {
    return true;
  }

  // Fetch all dependency works
  const dependencyWorks = await workModel.find({
    _id: { $in: work.dependencies },
    isDeleted: false
  });

  // All dependencies must exist
  if (dependencyWorks.length !== work.dependencies.length) {
    return false;
  }

  // All dependencies must be in 'done' or 'cancelled' status
  const allResolved = dependencyWorks.every(dep =>
    dep.status === 'done' || dep.status === 'cancelled'
  );

  return allResolved;
}
```

### When to Apply Dependency Checks

| Priority Level | Check Dependencies? | Reason |
|----------------|---------------------|--------|
| Priority 1 | ✅ Yes | Recurring tasks must wait for dependencies |
| Priority 2 | ✅ Yes | Subtasks in `todo` must wait for dependencies |
| Priority 3 | ✅ Yes | Tasks in `todo` must wait for dependencies |
| Priority 4 | ❌ No | Blocked work is already assigned |
| Priority 5 | ❌ No | Review work is nearly done |

## Implementation Algorithm

```typescript
async function getNextWork(
  assigneeType: 'user' | 'agent',
  assigneeId: string
): Promise<NextWorkResponse> {
  const now = new Date();

  // Priority 1: Recurring tasks with startAt reached
  const recurringTasks = await workModel.find({
    type: 'task',
    isRecurring: true,
    'assignee.type': assigneeType,
    'assignee.id': assigneeId,
    status: 'todo',
    startAt: { $lte: now },
    isDeleted: false,
  }).sort({ startAt: 1 }); // Most overdue first

  for (const task of recurringTasks) {
    const hasSubtasks = await workModel.exists({
      type: 'subtask', parentId: task._id, isDeleted: false
    });
    if (hasSubtasks) continue;

    if (await validateDependencies(task)) {
      return {
        work: task,
        metadata: {
          priorityLevel: 1,
          priorityDescription: 'Recurring task with scheduled time reached',
          matchedCriteria: ['assigned_to_me', 'task', 'recurring', 'status_todo', 'startAt_reached', 'no_subtasks', 'dependencies_met']
        }
      };
    }
  }

  // Priority 2: Assigned subtasks in todo
  const subtasks = await workModel.find({
    type: 'subtask',
    'assignee.type': assigneeType,
    'assignee.id': assigneeId,
    status: 'todo',
    isDeleted: false,
  }).sort({ createdAt: 1 });

  for (const subtask of subtasks) {
    if (await validateDependencies(subtask)) {
      return {
        work: subtask,
        metadata: {
          priorityLevel: 2,
          priorityDescription: 'Assigned subtask in todo status',
          matchedCriteria: ['assigned_to_me', 'subtask', 'status_todo', 'dependencies_met']
        }
      };
    }
  }

  // Priority 3: Assigned tasks without subtasks in todo
  const tasks = await workModel.find({
    type: 'task',
    'assignee.type': assigneeType,
    'assignee.id': assigneeId,
    status: 'todo',
    isDeleted: false,
  }).sort({ createdAt: 1 });

  for (const task of tasks) {
    const hasSubtasks = await workModel.exists({
      type: 'subtask', parentId: task._id, isDeleted: false
    });
    if (hasSubtasks) continue;

    if (await validateDependencies(task)) {
      return {
        work: task,
        metadata: {
          priorityLevel: 3,
          priorityDescription: 'Assigned task without subtasks in todo status',
          matchedCriteria: ['assigned_to_me', 'task', 'status_todo', 'no_subtasks', 'dependencies_met']
        }
      };
    }
  }

  // Priority 4: Reported works in blocked status
  const blockedWork = await workModel.findOne({
    type: { $in: ['task', 'subtask'] },
    'reporter.type': assigneeType,
    'reporter.id': assigneeId,
    status: 'blocked',
    isDeleted: false,
  }).sort({ createdAt: 1 });

  if (blockedWork) {
    return {
      work: blockedWork,
      metadata: {
        priorityLevel: 4,
        priorityDescription: 'Reported work in blocked status requiring resolution',
        matchedCriteria: ['reported_by_me', 'status_blocked']
      }
    };
  }

  // Priority 5: Reported works in review status
  const reviewWork = await workModel.findOne({
    type: { $in: ['task', 'subtask'] },
    'reporter.type': assigneeType,
    'reporter.id': assigneeId,
    status: 'review',
    isDeleted: false,
  }).sort({ createdAt: 1 });

  if (reviewWork) {
    return {
      work: reviewWork,
      metadata: {
        priorityLevel: 5,
        priorityDescription: 'Reported work in review status awaiting approval',
        matchedCriteria: ['reported_by_me', 'status_review']
      }
    };
  }

  // No work found
  return {
    work: null,
    metadata: {
      priorityLevel: 0,
      priorityDescription: 'No work available',
      matchedCriteria: []
    }
  };
}
```

## Performance Considerations

### Required Indexes

```javascript
// Assignee queries
{ 'assignee.type': 1, 'assignee.id': 1, status: 1, type: 1, deletedAt: 1, createdAt: 1 }

// Reporter queries
{ 'reporter.type': 1, 'reporter.id': 1, status: 1, type: 1, deletedAt: 1, createdAt: 1 }

// Subtask lookup
{ parentId: 1, type: 1, deletedAt: 1 }
```

### Expected Performance

- Priority 1: < 10ms (indexed query)
- Priority 2: < 50ms (may check multiple tasks)
- Priority 3: < 10ms (indexed query)
- Priority 4: < 10ms (indexed query)

---

**Document Version:** 2.0
**Last Updated:** 2026-02-26
