# Workflow MVP - Technical Design Document

**Version**: 1.0
**Date**: 2026-01-13
**Status**: Draft - Pending Review

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Entity Design](#entity-design)
3. [State Machine & Lifecycle](#state-machine--lifecycle)
4. [API Endpoints](#api-endpoints)
5. [Data Flow Examples](#data-flow-examples)
6. [Implementation Notes](#implementation-notes)

---

## 1. Overview

### 1.1 Mục Tiêu MVP

Workflow MVP cho phép orchestrate multi-step LLM pipelines với:
- ✅ **LLM-only steps**: Chỉ hỗ trợ LLM execution trong Phase 1
- ✅ **Dependency-based execution**: Hỗ trợ sequential và parallel execution
- ✅ **Template reusability**: Workflow template có thể execute nhiều lần
- ✅ **Error handling**: Retry logic và error classification
- ✅ **Manual trigger**: User trigger via API

### 1.2 Out of Scope (Phase 2)

- ❌ Tool steps (external API calls)
- ❌ Rule engine (conditional logic)
- ❌ Transform steps (data transformation)
- ❌ Input/output mapping (JSONPath)
- ❌ Scheduler trigger (cron-based)
- ❌ Webhook trigger

---

## 2. Entity Design

### 2.1 Workflow (Template Layer)

**Collection**: `workflows`
**Purpose**: Định nghĩa workflow template (stateless, reusable)

#### Schema

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Workflow extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: 'v1.0' })
  version: string;

  @Prop({
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  })
  status: string;

  @Prop({
    enum: ['internal', 'langgraph'],
    default: 'internal'
  })
  executionMode: string;

  @Prop({ type: Object, required: true })
  owner: {
    orgId: string;
    userId: string;
  };

  // timestamps: createdAt, updatedAt (auto by Mongoose)
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
```

#### Field Descriptions

| Field | Type | Required | Description | Valid Values | Example |
|-------|------|----------|-------------|--------------|---------|
| `_id` | ObjectId | ✅ (auto) | Primary key | MongoDB ObjectId | `6789abcd1234567890abcdef` |
| `name` | string | ✅ | Tên workflow | Max 200 chars | `"Content Generation Pipeline"` |
| `description` | string | ❌ | Mô tả chi tiết | Max 1000 chars | `"Generate article with multiple steps"` |
| `version` | string | ✅ | Phiên bản | Semantic version | `"v1.0"`, `"v2.1"` |
| `status` | enum | ✅ | Trạng thái template | `draft`, `active`, `archived` | `"active"` |
| `executionMode` | enum | ✅ | Execution engine | `internal`, `langgraph` | `"internal"` (MVP) |
| `owner.orgId` | string | ✅ | Organization ID | Valid orgId | `"org_001"` |
| `owner.userId` | string | ✅ | Creator user ID | Valid userId | `"user_001"` |
| `createdAt` | Date | ✅ (auto) | Created timestamp | ISO 8601 | `"2026-01-13T10:00:00Z"` |
| `updatedAt` | Date | ✅ (auto) | Updated timestamp | ISO 8601 | `"2026-01-13T10:30:00Z"` |

#### Status Lifecycle

```
draft → active → archived
  ↑       ↓
  └───────┘
  (can be reverted)
```

- **draft**: Workflow đang được design, chưa thể execute
- **active**: Workflow có thể được execute
- **archived**: Workflow không còn được sử dụng (soft delete)

#### Example Data

```json
{
  "_id": "6789abcd1234567890abcdef",
  "name": "Content Generation Pipeline",
  "description": "Multi-step LLM pipeline for generating structured articles",
  "version": "v1.0",
  "status": "active",
  "executionMode": "internal",
  "owner": {
    "orgId": "org_001",
    "userId": "user_001"
  },
  "createdAt": "2026-01-13T10:00:00.000Z",
  "updatedAt": "2026-01-13T10:00:00.000Z"
}
```

---

### 2.2 WorkflowStep (Template Layer)

**Collection**: `workflow_steps`
**Purpose**: Định nghĩa các steps trong workflow template

#### Schema

```typescript
@Schema({ timestamps: true })
export class WorkflowStep extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true })
  orderIndex: number;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ enum: ['llm'], required: true })
  type: string;

  @Prop({ type: Object, required: true })
  llmConfig: {
    deploymentId: string;
    modelIdentifier?: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    parameters?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    };
    timeout?: number;
  };

  @Prop({ type: Object })
  inputSchema?: Record<string, any>;

  @Prop({ type: Object })
  outputSchema?: Record<string, any>;

  @Prop({ type: [Number], default: [] })
  dependencies: number[];

  @Prop({ type: Object })
  errorHandling?: {
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnError?: boolean;
  };
}

export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

// Index
WorkflowStepSchema.index({ workflowId: 1, orderIndex: 1 });
```

#### Field Descriptions

| Field | Type | Required | Description | Valid Values | Example |
|-------|------|----------|-------------|--------------|---------|
| `_id` | ObjectId | ✅ (auto) | Primary key | MongoDB ObjectId | `"step_6789abc001"` |
| `workflowId` | ObjectId | ✅ | Reference to Workflow | Valid Workflow._id | `"6789abcd1234567890abcdef"` |
| `orderIndex` | number | ✅ | Display order (layer) | >= 0, can duplicate | `0`, `1`, `1`, `2` |
| `name` | string | ✅ | Step name | Max 200 chars | `"Generate Outline"` |
| `description` | string | ❌ | Step description | Max 500 chars | `"Create article outline"` |
| `type` | enum | ✅ | Step type | `llm` (MVP only) | `"llm"` |
| `llmConfig` | object | ✅ | LLM configuration | See below | - |
| `llmConfig.deploymentId` | string | ✅ | Deployment ID | Valid Deployment._id | `"deployment_gpt4"` |
| `llmConfig.modelIdentifier` | string | ❌ | Model identifier | Model name | `"gpt-4.1-turbo"` |
| `llmConfig.systemPrompt` | string | ✅ | System prompt | Max 5000 chars | `"You are a content writer"` |
| `llmConfig.userPromptTemplate` | string | ❌ | User prompt template | Handlebars syntax | `"Topic: {{topic}}"` |
| `llmConfig.parameters.temperature` | number | ❌ | LLM temperature | 0.0 - 2.0 | `0.7` |
| `llmConfig.parameters.max_tokens` | number | ❌ | Max tokens | > 0 | `500` |
| `llmConfig.parameters.top_p` | number | ❌ | Top P sampling | 0.0 - 1.0 | `0.9` |
| `llmConfig.timeout` | number | ❌ | Step timeout (ms) | > 0, default: 30000 | `30000` |
| `inputSchema` | object | ❌ | Input validation schema | JSON Schema | `{ "type": "object", ... }` |
| `outputSchema` | object | ❌ | Output validation schema | JSON Schema | `{ "type": "object", ... }` |
| `dependencies` | number[] | ✅ | Dependency step indexes | Valid step indexes | `[0]`, `[0, 1]`, `[]` |
| `errorHandling.maxRetries` | number | ❌ | Max retry count | >= 0, default: 0 | `2` |
| `errorHandling.retryDelayMs` | number | ❌ | Retry delay (ms) | > 0, default: 1000 | `5000` |
| `errorHandling.continueOnError` | boolean | ❌ | Continue on error | true/false, default: false | `false` |

#### OrderIndex vs Dependencies

- **orderIndex**: UI display layer (có thể trùng cho parallel steps)
- **dependencies**: Execution order logic (must reference valid step indexes)

**Example - Parallel Steps**:
```typescript
[
  { index: 0, orderIndex: 0, dependencies: [] },        // Layer 0
  { index: 1, orderIndex: 1, dependencies: [0] },       // Layer 1
  { index: 2, orderIndex: 1, dependencies: [0] },       // Layer 1 (parallel với step 1)
  { index: 3, orderIndex: 2, dependencies: [1, 2] }     // Layer 2
]
```

#### Example Data

```json
{
  "_id": "step_6789abc001",
  "workflowId": "6789abcd1234567890abcdef",
  "orderIndex": 0,
  "name": "Generate Outline",
  "description": "Create structured article outline",
  "type": "llm",
  "llmConfig": {
    "deploymentId": "deployment_gpt4_prod",
    "modelIdentifier": "gpt-4.1-turbo",
    "systemPrompt": "You are an expert content strategist. Generate a clear, structured article outline.",
    "userPromptTemplate": "Topic: {{topic}}\nTarget audience: {{audience}}",
    "parameters": {
      "temperature": 0.3,
      "max_tokens": 500,
      "top_p": 0.9
    },
    "timeout": 30000
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "minLength": 1 },
      "audience": { "type": "string" }
    },
    "required": ["topic"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "outline": { "type": "string" },
      "sections": { "type": "array" }
    }
  },
  "dependencies": [],
  "errorHandling": {
    "maxRetries": 2,
    "retryDelayMs": 5000,
    "continueOnError": false
  },
  "createdAt": "2026-01-13T10:00:00.000Z",
  "updatedAt": "2026-01-13T10:00:00.000Z"
}
```

---

### 2.3 Execution (Runtime Layer - Extended)

**Collection**: `executions`
**Purpose**: Runtime instance của workflow execution (extended từ existing Execution schema)

#### Schema

```typescript
export enum ExecutionErrorType {
  VALIDATION_ERROR = 'validation_error',
  EXECUTION_ERROR = 'execution_error',
  TIMEOUT_ERROR = 'timeout_error',
  DEPENDENCY_ERROR = 'dependency_error',
  CONFIGURATION_ERROR = 'configuration_error',
  SYSTEM_ERROR = 'system_error'
}

@Schema({ timestamps: true })
export class Execution extends Document {
  @Prop({ required: true, unique: true })
  executionId: string;  // UUID v4

  @Prop({ required: true })
  name: string;

  @Prop({ enum: ['deployment', 'workflow'], required: true })
  executionType: string;

  @Prop({ enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], default: 'pending' })
  status: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress: number;

  // For workflow execution
  @Prop({ type: Types.ObjectId, ref: 'Workflow' })
  workflowId?: Types.ObjectId;

  @Prop()
  workflowVersion?: string;

  @Prop({ type: Object })
  workflowSnapshot?: {
    name: string;
    steps: any[];
  };

  @Prop({ enum: ['manual', 'schedule', 'webhook', 'event'] })
  triggerType?: string;

  @Prop({ type: Object })
  triggerMetadata?: {
    triggeredBy: 'user' | 'system';
    userId?: string;
    source?: string;
  };

  @Prop({ type: Object })
  input?: any;

  @Prop({ type: [Object], default: [] })
  steps: ExecutionStep[];

  @Prop({ type: Object })
  timing: {
    startedAt?: Date;
    completedAt?: Date;
    totalDurationMs?: number;
  };

  @Prop({ type: Object })
  retry?: {
    retryCount: number;
    maxRetries: number;
    retryAttempts: Array<{
      attemptNumber: number;
      startedAt: Date;
      failedAt: Date;
      error: string;
    }>;
  };

  @Prop({ type: Object })
  result?: {
    success: boolean;
    summary: {
      stepsCompleted: number;
      stepsFailed: number;
      stepsSkipped: number;
      totalTokensUsed?: number;
      totalCost?: number;
      totalDurationMs: number;
    };
    finalOutput?: any;
  };

  @Prop({ type: Object })
  error?: {
    type: ExecutionErrorType;
    message: string;
    code?: string;
    failedStepIndex?: number;
    details?: {
      stepName?: string;
      inputValidationErrors?: any[];
      outputValidationErrors?: any[];
      llmError?: {
        statusCode?: number;
        responseBody?: string;
      };
    };
    stack?: string;
    timestamp: Date;
  };

  @Prop({ type: Object, required: true })
  owner: {
    orgId: string;
    userId: string;
  };
}

export const ExecutionSchema = SchemaFactory.createForClass(Execution);

// Indexes
ExecutionSchema.index({ executionId: 1 });
ExecutionSchema.index({ workflowId: 1, status: 1 });
ExecutionSchema.index({ 'owner.orgId': 1, 'owner.userId': 1 });
```

#### Field Descriptions

| Field | Type | Required | Description | Valid Values | Example |
|-------|------|----------|-------------|--------------|---------|
| `_id` | ObjectId | ✅ (auto) | Primary key | MongoDB ObjectId | - |
| `executionId` | string | ✅ | Unique execution ID | UUID v4 | `"exec-uuid-12345..."` |
| `name` | string | ✅ | Execution name | Max 200 chars | `"Content Pipeline - Run #1"` |
| `executionType` | enum | ✅ | Execution type | `deployment`, `workflow` | `"workflow"` |
| `status` | enum | ✅ | Current status | See state machine | `"running"` |
| `progress` | number | ✅ (auto) | Progress percentage | 0-100 | `50` |
| `workflowId` | ObjectId | ✅ (workflow) | Reference to Workflow | Valid Workflow._id | - |
| `workflowVersion` | string | ✅ (workflow) | Workflow version | Version string | `"v1.0"` |
| `workflowSnapshot` | object | ✅ (workflow) | Workflow snapshot | Full workflow definition | - |
| `triggerType` | enum | ✅ | How was triggered | `manual` (MVP only) | `"manual"` |
| `triggerMetadata` | object | ❌ | Trigger metadata | - | - |
| `input` | any | ❌ | Initial input data | Any JSON | `{"topic": "AI"}` |
| `steps` | array | ✅ | Execution steps | ExecutionStep[] | See below |
| `timing` | object | ✅ | Timing information | - | - |
| `retry` | object | ❌ | Retry information | - | - |
| `result` | object | ❌ | Final result | Populated when completed | - |
| `error` | object | ❌ | Error information | Populated when failed | - |
| `owner` | object | ✅ | Trigger user | orgId + userId | - |

#### ExecutionStep (Embedded Schema)

```typescript
export class ExecutionStep {
  index: number;                    // Step index (runtime)
  name: string;                     // Step name
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;                 // 0-100

  type: 'command' | 'llm';         // Step type (MVP: 'llm' for workflow)

  // For deployment
  command?: string;
  nodeId?: string;

  // For workflow LLM step
  llmConfig?: {
    deploymentId: string;
    modelIdentifier?: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    parameters?: any;
  };

  input?: any;                      // Step input data
  output?: any;                     // Step output data

  dependencies: number[];           // Dependency step indexes

  errorHandling?: {
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnError?: boolean;
  };

  timing: {
    startedAt?: Date;
    completedAt?: Date;
    durationMs?: number;
  };

  result?: {
    success: boolean;
    statusCode?: number;
    tokensUsed?: number;
  };

  error?: {
    type?: ExecutionErrorType;
    message: string;
    code?: string;
    details?: any;
    stack?: string;
  };

  metadata?: any;
}
```

#### Example Data

```json
{
  "_id": "exec_789def456",
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",
  "name": "Content Generation Pipeline - Run #1",
  "executionType": "workflow",
  "status": "running",
  "progress": 25,

  "workflowId": "6789abcd1234567890abcdef",
  "workflowVersion": "v1.0",
  "workflowSnapshot": {
    "name": "Content Generation Pipeline",
    "steps": [
      "... full snapshot of WorkflowStep[] at trigger time ..."
    ]
  },

  "triggerType": "manual",
  "triggerMetadata": {
    "triggeredBy": "user",
    "userId": "user_002",
    "source": "dashboard"
  },

  "input": {
    "topic": "Artificial Intelligence in Healthcare",
    "audience": "healthcare professionals"
  },

  "steps": [
    {
      "index": 0,
      "name": "Generate Outline",
      "status": "completed",
      "progress": 100,
      "type": "llm",
      "llmConfig": { "..." },
      "input": {
        "topic": "Artificial Intelligence in Healthcare",
        "audience": "healthcare professionals"
      },
      "output": {
        "outline": "1. Introduction\n2. Current Applications\n3. Future Trends\n4. Challenges\n5. Conclusion",
        "sections": ["Introduction", "Current Applications", "Future Trends", "Challenges", "Conclusion"]
      },
      "dependencies": [],
      "timing": {
        "startedAt": "2026-01-13T10:00:10Z",
        "completedAt": "2026-01-13T10:00:25Z",
        "durationMs": 15000
      },
      "result": {
        "success": true,
        "tokensUsed": 320
      }
    },
    {
      "index": 1,
      "name": "Write Introduction",
      "status": "running",
      "progress": 50,
      "type": "llm",
      "llmConfig": { "..." },
      "input": {
        "outline": "1. Introduction\n2. Current Applications...",
        "sections": ["Introduction", "..."]
      },
      "output": null,
      "dependencies": [0],
      "timing": {
        "startedAt": "2026-01-13T10:00:26Z",
        "completedAt": null,
        "durationMs": null
      }
    }
  ],

  "timing": {
    "startedAt": "2026-01-13T10:00:10Z",
    "completedAt": null,
    "totalDurationMs": null
  },

  "owner": {
    "orgId": "org_001",
    "userId": "user_002"
  },

  "createdAt": "2026-01-13T10:00:00Z",
  "updatedAt": "2026-01-13T10:00:30Z"
}
```

---

## 3. State Machine & Lifecycle

### 3.1 Execution Status Lifecycle

```
                    ┌──────────┐
                    │ pending  │
                    └────┬─────┘
                         │
                         │ startExecution()
                         ↓
                    ┌──────────┐
              ┌─────┤ running  ├─────┐
              │     └────┬─────┘     │
              │          │           │
  Step failed │          │ All steps │
  (no retry)  │          │ completed │
              │          ↓           │
              │     ┌──────────┐    │
              └────→│  failed  │    │
                    └──────────┘    │
                                    ↓
                               ┌──────────┐
                               │completed │
                               └──────────┘

                    ┌──────────┐
         User ──────│cancelled │ (future)
         action     └──────────┘
```

### 3.2 ExecutionStep Status Lifecycle

```
┌─────────┐
│ pending │
└────┬────┘
     │
     │ processReadySteps()
     │ (dependencies satisfied)
     ↓
┌─────────┐
│ running │────────┐
└────┬────┘        │ Dependency failed
     │             │ (skip this step)
     │             ↓
     │        ┌─────────┐
     │        │ skipped │
     │        └─────────┘
     │
     ├─── Success ──────┐
     │                  ↓
     │             ┌───────────┐
     │             │ completed │
     │             └───────────┘
     │
     └─── Failed ───────┐
                        ↓
                   ┌────────┐
                   │ failed │
                   └────────┘
                        │
                        │ hasRetries?
                        ├─ Yes → Reset to 'pending', increment retryCount
                        └─ No  → Mark Execution as 'failed'
```

### 3.3 State Transition Details

#### 3.3.1 Execution.status Transitions

| From | To | Trigger | Condition | Actions |
|------|-----|---------|-----------|---------|
| `pending` | `running` | `POST /executions/:id/start` | Execution exists | • Set status = 'running'<br>• Set timing.startedAt<br>• Call processReadySteps() |
| `running` | `completed` | Last step completed | All steps status in ['completed', 'skipped'] | • Set status = 'completed'<br>• Set timing.completedAt<br>• Calculate result.summary<br>• Set progress = 100 |
| `running` | `failed` | Step failed & no retry | Any step status = 'failed' | • Set status = 'failed'<br>• Set timing.completedAt<br>• Populate error object<br>• Skip remaining steps |
| `failed` | `running` | `POST /executions/:id/retry` | retryCount < maxRetries | • Increment retry.retryCount<br>• Reset failed steps to 'pending'<br>• Call processReadySteps() |

#### 3.3.2 ExecutionStep.status Transitions

| From | To | Trigger | Condition | Actions |
|------|-----|---------|-----------|---------|
| `pending` | `running` | processReadySteps() | All dependencies completed | • Set status = 'running'<br>• Set timing.startedAt<br>• Execute step (call LLM) |
| `pending` | `skipped` | Dependency failed | Any dependency status = 'failed' | • Set status = 'skipped'<br>• Do not execute |
| `running` | `completed` | Step execution success | LLM call successful | • Set status = 'completed'<br>• Set output<br>• Set timing.completedAt<br>• Call processReadySteps() |
| `running` | `failed` | Step execution failed | LLM call failed | • Set status = 'failed'<br>• Set error object<br>• Check retry logic |
| `failed` | `pending` | Retry logic | retryCount < maxRetries | • Reset status = 'pending'<br>• Increment step retry counter<br>• Clear error |

### 3.4 Auto-calculated Fields

#### 3.4.1 Execution.progress

```typescript
function calculateProgress(execution: Execution): number {
  const totalSteps = execution.steps.length;
  if (totalSteps === 0) return 0;

  const completedSteps = execution.steps.filter(
    s => s.status === 'completed' || s.status === 'skipped'
  ).length;

  return Math.round((completedSteps / totalSteps) * 100);
}

// Auto-update after each step status change
await Execution.updateOne(
  { executionId },
  {
    $set: {
      [`steps.${stepIndex}.status`]: newStatus,
      progress: calculateProgress(execution)
    }
  }
);
```

#### 3.4.2 Execution.result (when completed)

```typescript
function buildExecutionResult(execution: Execution): ExecutionResult {
  const completedSteps = execution.steps.filter(s => s.status === 'completed');
  const failedSteps = execution.steps.filter(s => s.status === 'failed');
  const skippedSteps = execution.steps.filter(s => s.status === 'skipped');

  const totalTokens = completedSteps.reduce(
    (sum, step) => sum + (step.result?.tokensUsed || 0),
    0
  );

  return {
    success: failedSteps.length === 0,
    summary: {
      stepsCompleted: completedSteps.length,
      stepsFailed: failedSteps.length,
      stepsSkipped: skippedSteps.length,
      totalTokensUsed: totalTokens,
      totalCost: calculateCost(totalTokens),
      totalDurationMs: execution.timing.totalDurationMs
    },
    finalOutput: execution.steps[execution.steps.length - 1]?.output
  };
}
```

---

## 4. API Endpoints

### 4.1 Workflow Management (CRUD)

#### 4.1.1 Create Workflow

```http
POST /workflows
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Content Generation Pipeline",
  "description": "Multi-step LLM pipeline",
  "version": "v1.0",
  "status": "draft",
  "executionMode": "internal"
}
```

**Response (201)**:
```json
{
  "_id": "6789abcd1234567890abcdef",
  "name": "Content Generation Pipeline",
  "description": "Multi-step LLM pipeline",
  "version": "v1.0",
  "status": "draft",
  "executionMode": "internal",
  "owner": {
    "orgId": "org_001",
    "userId": "user_001"
  },
  "createdAt": "2026-01-13T10:00:00Z",
  "updatedAt": "2026-01-13T10:00:00Z"
}
```

#### 4.1.2 List Workflows

```http
GET /workflows?status=active&page=1&limit=10
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "data": [
    {
      "_id": "6789abcd1234567890abcdef",
      "name": "Content Generation Pipeline",
      "version": "v1.0",
      "status": "active",
      "createdAt": "2026-01-13T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

#### 4.1.3 Get Workflow

```http
GET /workflows/:id
Authorization: Bearer <jwt_token>
```

**Response (200)**: Full workflow object

#### 4.1.4 Update Workflow

```http
PUT /workflows/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Content Pipeline v2",
  "status": "active"
}
```

**Response (200)**: Updated workflow object

#### 4.1.5 Delete Workflow (Soft Delete)

```http
DELETE /workflows/:id
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "message": "Workflow archived successfully"
}
```

---

### 4.2 WorkflowStep Management

#### 4.2.1 Add Steps to Workflow

```http
POST /workflows/:workflowId/steps
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "steps": [
    {
      "orderIndex": 0,
      "name": "Generate Outline",
      "type": "llm",
      "llmConfig": {
        "deploymentId": "deployment_gpt4_prod",
        "systemPrompt": "You are a content strategist",
        "userPromptTemplate": "Topic: {{topic}}",
        "parameters": {
          "temperature": 0.3,
          "max_tokens": 500
        }
      },
      "dependencies": []
    },
    {
      "orderIndex": 1,
      "name": "Write Introduction",
      "type": "llm",
      "llmConfig": {
        "deploymentId": "deployment_gpt4_prod",
        "systemPrompt": "You are a content writer"
      },
      "dependencies": [0]
    }
  ]
}
```

**Response (201)**:
```json
{
  "message": "Steps added successfully",
  "steps": [
    {
      "_id": "step_6789abc001",
      "workflowId": "6789abcd1234567890abcdef",
      "orderIndex": 0,
      "name": "Generate Outline",
      "...": "..."
    },
    {
      "_id": "step_6789abc002",
      "workflowId": "6789abcd1234567890abcdef",
      "orderIndex": 1,
      "name": "Write Introduction",
      "...": "..."
    }
  ]
}
```

#### 4.2.2 List Steps

```http
GET /workflows/:workflowId/steps
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "data": [
    {
      "_id": "step_6789abc001",
      "orderIndex": 0,
      "name": "Generate Outline",
      "type": "llm",
      "dependencies": []
    },
    {
      "_id": "step_6789abc002",
      "orderIndex": 1,
      "name": "Write Introduction",
      "type": "llm",
      "dependencies": [0]
    }
  ]
}
```

#### 4.2.3 Update Step

```http
PUT /workflow-steps/:stepId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Generate Detailed Outline",
  "llmConfig": {
    "temperature": 0.5
  }
}
```

**Response (200)**: Updated step object

#### 4.2.4 Delete Step

```http
DELETE /workflow-steps/:stepId
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "message": "Step deleted successfully"
}
```

---

### 4.3 Workflow Execution

#### 4.3.1 Trigger Workflow

```http
POST /workflows/:workflowId/runs
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "input": {
    "topic": "Artificial Intelligence in Healthcare",
    "audience": "healthcare professionals"
  }
}
```

**Response (201)**:
```json
{
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",
  "workflowId": "6789abcd1234567890abcdef",
  "status": "pending",
  "message": "Workflow execution created. Call POST /executions/:executionId/start to begin."
}
```

**Flow**:
1. Validate workflow exists and status = 'active'
2. Load workflow steps
3. Create snapshot of workflow + steps
4. Create Execution document with:
   - executionType = 'workflow'
   - workflowId, workflowVersion, workflowSnapshot
   - input from request
   - owner = current user
   - status = 'pending'
   - steps = converted from WorkflowStep[] to ExecutionStep[]
5. Return executionId

#### 4.3.2 Start Execution

```http
POST /executions/:executionId/start
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",
  "status": "running",
  "message": "Execution started"
}
```

**Flow**:
1. Update execution status = 'running'
2. Set timing.startedAt
3. Call `executionOrchestrator.startExecution(executionId)`
4. Return immediately (execution runs async)

#### 4.3.3 Get Execution Status

```http
GET /executions/:executionId
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",
  "workflowId": "6789abcd1234567890abcdef",
  "name": "Content Generation Pipeline - Run #1",
  "status": "running",
  "progress": 50,
  "steps": [
    {
      "index": 0,
      "name": "Generate Outline",
      "status": "completed",
      "progress": 100,
      "timing": {
        "startedAt": "2026-01-13T10:00:10Z",
        "completedAt": "2026-01-13T10:00:25Z",
        "durationMs": 15000
      }
    },
    {
      "index": 1,
      "name": "Write Introduction",
      "status": "running",
      "progress": 50
    }
  ],
  "timing": {
    "startedAt": "2026-01-13T10:00:10Z"
  },
  "owner": {
    "orgId": "org_001",
    "userId": "user_002"
  }
}
```

#### 4.3.4 Get Step Details

```http
GET /executions/:executionId/steps/:stepIndex
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "index": 1,
  "name": "Write Introduction",
  "status": "completed",
  "type": "llm",
  "input": {
    "outline": "1. Introduction\n2. Current Applications..."
  },
  "output": {
    "introduction": "Artificial Intelligence is revolutionizing healthcare..."
  },
  "timing": {
    "startedAt": "2026-01-13T10:00:26Z",
    "completedAt": "2026-01-13T10:00:45Z",
    "durationMs": 19000
  },
  "result": {
    "success": true,
    "tokensUsed": 420
  }
}
```

#### 4.3.5 List Executions

```http
GET /executions?executionType=workflow&status=running&page=1&limit=10
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "data": [
    {
      "executionId": "exec-uuid-...",
      "workflowId": "6789abcd1234567890abcdef",
      "name": "Content Pipeline - Run #1",
      "status": "running",
      "progress": 50,
      "createdAt": "2026-01-13T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 120,
    "pages": 12
  }
}
```

#### 4.3.6 Retry Failed Execution

```http
POST /executions/:executionId/retry
Authorization: Bearer <jwt_token>
```

**Response (200)**:
```json
{
  "executionId": "exec-uuid-...",
  "status": "running",
  "retryCount": 1,
  "message": "Execution retry started"
}
```

**Flow**:
1. Check execution status = 'failed'
2. Check retry.retryCount < retry.maxRetries
3. Increment retry.retryCount
4. Reset failed steps to 'pending', clear errors
5. Set status = 'running'
6. Call `executionOrchestrator.startExecution(executionId)`

---

### 4.4 API Summary Table

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| **Workflow CRUD** |
| POST | `/workflows` | Create workflow | ✅ |
| GET | `/workflows` | List workflows | ✅ |
| GET | `/workflows/:id` | Get workflow | ✅ |
| PUT | `/workflows/:id` | Update workflow | ✅ |
| DELETE | `/workflows/:id` | Archive workflow | ✅ |
| **WorkflowStep CRUD** |
| POST | `/workflows/:id/steps` | Add steps | ✅ |
| GET | `/workflows/:id/steps` | List steps | ✅ |
| PUT | `/workflow-steps/:id` | Update step | ✅ |
| DELETE | `/workflow-steps/:id` | Delete step | ✅ |
| **Execution** |
| POST | `/workflows/:id/runs` | Trigger workflow | ✅ |
| POST | `/executions/:id/start` | Start execution | ✅ |
| GET | `/executions/:id` | Get execution status | ✅ |
| GET | `/executions/:id/steps/:index` | Get step details | ✅ |
| GET | `/executions` | List executions | ✅ |
| POST | `/executions/:id/retry` | Retry failed execution | ✅ |

---

## 5. Data Flow Examples

### 5.1 Complete Flow: Create & Execute Workflow

#### Step 1: Create Workflow

```http
POST /workflows
{
  "name": "Simple Content Pipeline",
  "version": "v1.0",
  "status": "draft"
}
```

→ Response: `workflowId = "wf_123"`

#### Step 2: Add Steps

```http
POST /workflows/wf_123/steps
{
  "steps": [
    {
      "orderIndex": 0,
      "name": "Generate Outline",
      "type": "llm",
      "llmConfig": {
        "deploymentId": "gpt4_deployment",
        "systemPrompt": "Create outline",
        "userPromptTemplate": "Topic: {{topic}}"
      },
      "dependencies": []
    },
    {
      "orderIndex": 1,
      "name": "Write Content",
      "type": "llm",
      "llmConfig": {
        "deploymentId": "gpt4_deployment",
        "systemPrompt": "Write content"
      },
      "dependencies": [0]
    }
  ]
}
```

#### Step 3: Activate Workflow

```http
PUT /workflows/wf_123
{
  "status": "active"
}
```

#### Step 4: Trigger Execution

```http
POST /workflows/wf_123/runs
{
  "input": {
    "topic": "Climate Change"
  }
}
```

→ Response: `executionId = "exec_456"`

#### Step 5: Start Execution

```http
POST /executions/exec_456/start
```

→ Backend async flow begins:

```
1. ExecutionOrchestrator.startExecution(exec_456)
2. Set status = 'running', timing.startedAt
3. processReadySteps()
   ├─ Find steps with dependencies = [] and status = 'pending'
   ├─ Execute step 0: Generate Outline
   │  ├─ Set step.status = 'running'
   │  ├─ Build user prompt: "Topic: Climate Change"
   │  ├─ Call LLM via deployment
   │  ├─ Set step.output = { outline: "..." }
   │  ├─ Set step.status = 'completed'
   │  └─ Update execution.progress = 50%
   └─ Call processReadySteps() again
      ├─ Find steps with dependencies = [0] (satisfied)
      ├─ Execute step 1: Write Content
      │  ├─ Set step.status = 'running'
      │  ├─ Input = step 0 output: { outline: "..." }
      │  ├─ Call LLM
      │  ├─ Set step.output = { content: "..." }
      │  ├─ Set step.status = 'completed'
      │  └─ Update execution.progress = 100%
      └─ All steps completed
         ├─ Set execution.status = 'completed'
         ├─ Set timing.completedAt
         └─ Calculate result.summary
```

#### Step 6: Poll Status

```http
GET /executions/exec_456

→ Response:
{
  "status": "completed",
  "progress": 100,
  "steps": [
    { "index": 0, "status": "completed", "output": { "outline": "..." } },
    { "index": 1, "status": "completed", "output": { "content": "..." } }
  ],
  "result": {
    "success": true,
    "summary": {
      "stepsCompleted": 2,
      "stepsFailed": 0,
      "stepsSkipped": 0,
      "totalTokensUsed": 740,
      "totalDurationMs": 34000
    },
    "finalOutput": { "content": "..." }
  }
}
```

---

### 5.2 Parallel Execution Example

```typescript
// Workflow with parallel steps
[
  {
    "orderIndex": 0,
    "name": "Fetch Data",
    "dependencies": []
  },
  {
    "orderIndex": 1,  // Same layer
    "name": "Process A",
    "dependencies": [0]
  },
  {
    "orderIndex": 1,  // Same layer (parallel)
    "name": "Process B",
    "dependencies": [0]
  },
  {
    "orderIndex": 2,
    "name": "Combine Results",
    "dependencies": [1, 2]
  }
]

// Execution flow:
// Step 0: Fetch Data → completed
// ↓
// Step 1 (Process A) and Step 2 (Process B) execute in parallel
// await Promise.all([executeStep(1), executeStep(2)])
// ↓
// Step 3: Combine Results (waits for both step 1 and 2)
```

---

### 5.3 Error Handling Example

#### Scenario: Step 1 fails, has retry

```
Step 0: completed ✅
Step 1: running → failed ❌
  → error: { type: 'execution_error', message: 'LLM timeout' }
  → retryCount = 0, maxRetries = 2
  → Reset step 1 to 'pending'
  → processReadySteps() → execute step 1 again
  → Step 1: running → completed ✅
Step 2: pending → running → completed ✅
```

#### Scenario: Step 1 fails, no retry left

```
Step 0: completed ✅
Step 1: running → failed ❌
  → retryCount = 2, maxRetries = 2 (no more retries)
  → Set execution.status = 'failed'
  → Set execution.error = { type: 'execution_error', failedStepIndex: 1, ... }
Step 2: pending → skipped (dependency failed)
```

---

## 6. Implementation Notes

### 6.1 Validation Rules

#### Workflow Validation

```typescript
// When creating/updating workflow
validateWorkflow(workflow: Workflow) {
  if (!workflow.name || workflow.name.length > 200) {
    throw new Error('Invalid workflow name');
  }

  if (!['draft', 'active', 'archived'].includes(workflow.status)) {
    throw new Error('Invalid workflow status');
  }
}
```

#### WorkflowStep Validation

```typescript
validateWorkflowSteps(steps: WorkflowStep[]) {
  // Rule 1: orderIndex >= 0
  steps.forEach(step => {
    if (step.orderIndex < 0) {
      throw new Error('orderIndex must be >= 0');
    }
  });

  // Rule 2: orderIndex values must be continuous (no gaps)
  const uniqueIndexes = [...new Set(steps.map(s => s.orderIndex))].sort();
  for (let i = 0; i < uniqueIndexes.length; i++) {
    if (uniqueIndexes[i] !== i) {
      throw new Error(`Missing layer ${i} in orderIndex sequence`);
    }
  }

  // Rule 3: Dependencies must reference valid step indexes
  steps.forEach(step => {
    step.dependencies.forEach(depIndex => {
      if (depIndex < 0 || depIndex >= steps.length) {
        throw new Error(`Invalid dependency index: ${depIndex}`);
      }

      // Dependency must be in earlier layer
      const depStep = steps.find(s => s.index === depIndex);
      if (depStep.orderIndex >= step.orderIndex) {
        throw new Error(
          `Step ${step.index} (layer ${step.orderIndex}) cannot depend on ` +
          `step ${depIndex} (layer ${depStep.orderIndex})`
        );
      }
    });
  });

  // Rule 4: LLM config must have valid deploymentId
  steps.forEach(step => {
    if (step.type === 'llm') {
      if (!step.llmConfig.deploymentId) {
        throw new Error('LLM step must have deploymentId');
      }
      if (!step.llmConfig.systemPrompt) {
        throw new Error('LLM step must have systemPrompt');
      }
    }
  });
}
```

### 6.2 Execution Orchestration Logic

```typescript
class ExecutionOrchestrator {
  async startExecution(executionId: string) {
    const execution = await this.executionService.findByExecutionId(executionId);

    // Update status to running
    await this.executionService.updateStatus(executionId, 'running', {
      'timing.startedAt': new Date()
    });

    // Process ready steps
    await this.processReadySteps(execution);
  }

  async processReadySteps(execution: Execution) {
    // Find steps that are ready to execute
    const readySteps = execution.steps.filter(step => {
      if (step.status !== 'pending') return false;

      // Check if all dependencies are completed
      return step.dependencies.every(depIndex => {
        const depStep = execution.steps[depIndex];
        return depStep.status === 'completed';
      });
    });

    if (readySteps.length === 0) {
      // No ready steps, check if execution is complete
      await this.checkAndFinalizeExecution(execution);
      return;
    }

    // Execute ready steps in parallel
    await Promise.all(
      readySteps.map(step => this.executeStep(execution, step))
    );
  }

  async executeStep(execution: Execution, step: ExecutionStep) {
    try {
      // Update step status to running
      await this.executionService.updateStepStatus(
        execution.executionId,
        step.index,
        'running',
        { 'timing.startedAt': new Date() }
      );

      // Validate input schema
      if (step.inputSchema) {
        this.validateStepInput(step.input, step.inputSchema);
      }

      // Execute based on step type
      let output;
      if (step.type === 'llm') {
        output = await this.executeLLMStep(step);
      } else {
        throw new Error(`Unsupported step type: ${step.type}`);
      }

      // Validate output schema
      if (step.outputSchema) {
        this.validateStepOutput(output, step.outputSchema);
      }

      // Update step status to completed
      await this.executionService.updateStepStatus(
        execution.executionId,
        step.index,
        'completed',
        {
          output,
          'timing.completedAt': new Date(),
          'timing.durationMs': Date.now() - step.timing.startedAt.getTime()
        }
      );

      // Process next ready steps
      await this.processReadySteps(execution);

    } catch (error) {
      await this.handleStepError(execution, step, error);
    }
  }

  async executeLLMStep(step: ExecutionStep): Promise<any> {
    // Build user prompt
    const userPrompt = this.buildUserPrompt(step.llmConfig, step.input);

    // Get deployment
    const deployment = await this.deploymentService.findById(
      step.llmConfig.deploymentId
    );

    if (!deployment || deployment.status !== 'running') {
      throw new Error('Deployment not available');
    }

    // Call LLM
    const response = await axios.post(
      deployment.runtime.endpoint,
      {
        model: step.llmConfig.modelIdentifier || deployment.modelId,
        messages: [
          { role: 'system', content: step.llmConfig.systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        ...step.llmConfig.parameters
      },
      { timeout: step.llmConfig.timeout || 30000 }
    );

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage
    };
  }

  buildUserPrompt(llmConfig: any, input: any): string {
    if (llmConfig.userPromptTemplate) {
      // Use Handlebars template
      return Handlebars.compile(llmConfig.userPromptTemplate)(input);
    } else {
      // Fallback: stringify input
      if (typeof input === 'string') {
        return input;
      } else {
        return JSON.stringify(input, null, 2);
      }
    }
  }

  async handleStepError(execution: Execution, step: ExecutionStep, error: any) {
    const errorType = this.classifyError(error);

    // Check retry logic
    if (step.errorHandling?.maxRetries > 0 &&
        step.retryCount < step.errorHandling.maxRetries) {
      // Retry step
      await this.executionService.incrementStepRetry(
        execution.executionId,
        step.index
      );

      // Reset step to pending
      await this.executionService.updateStepStatus(
        execution.executionId,
        step.index,
        'pending'
      );

      // Process again after delay
      await this.delay(step.errorHandling.retryDelayMs || 1000);
      await this.processReadySteps(execution);
    } else {
      // Mark step as failed
      await this.executionService.updateStepStatus(
        execution.executionId,
        step.index,
        'failed',
        {
          error: {
            type: errorType,
            message: error.message,
            code: error.code,
            details: this.extractErrorDetails(error),
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date()
          }
        }
      );

      // Mark execution as failed
      await this.executionService.updateStatus(
        execution.executionId,
        'failed',
        {
          'timing.completedAt': new Date(),
          error: {
            type: errorType,
            message: `Step ${step.index} (${step.name}) failed: ${error.message}`,
            failedStepIndex: step.index,
            details: { stepName: step.name }
          }
        }
      );

      // Skip remaining dependent steps
      await this.skipDependentSteps(execution, step.index);
    }
  }

  async checkAndFinalizeExecution(execution: Execution) {
    const allCompleted = execution.steps.every(
      s => s.status === 'completed' || s.status === 'skipped'
    );

    if (!allCompleted) return;

    const result = this.buildExecutionResult(execution);

    await this.executionService.updateStatus(
      execution.executionId,
      'completed',
      {
        'timing.completedAt': new Date(),
        'timing.totalDurationMs': Date.now() - execution.timing.startedAt.getTime(),
        result,
        progress: 100
      }
    );
  }
}
```

### 6.3 Performance Considerations

1. **Indexing**:
   - `executions.executionId` (unique)
   - `executions.workflowId + executions.status` (composite)
   - `executions.owner.orgId + executions.owner.userId` (composite)
   - `workflow_steps.workflowId + workflow_steps.orderIndex` (composite)

2. **Pagination**: Always paginate list endpoints (default: 10 items)

3. **Snapshot Strategy**: Store full workflow snapshot in execution to ensure reproducibility

4. **Async Execution**: Execution runs asynchronously after `/executions/:id/start`, return immediately

---

### 6.4 Async Execution Architecture

#### 6.4.1 Overview

Workflow execution MUST run asynchronously để tránh timeout và cho phép parallel processing. MVP sử dụng **BullMQ** (queue-based approach).

#### 6.4.2 Queue Architecture

```
User Request → API → Create Execution → Push to Queue → Return ExecutionID
                                              ↓
                                         BullMQ Queue
                                              ↓
                                      Background Worker
                                              ↓
                                  ExecutionOrchestrator
                                              ↓
                                      Process Steps
                                              ↓
                                   Update Execution Status
```

#### 6.4.3 BullMQ Integration

**Queue Setup**:

```typescript
// queues/workflow-execution.queue.ts
import { Queue } from 'bullmq';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkflowExecutionQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue('workflow-executions', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    });
  }

  async addExecutionJob(executionId: string) {
    return this.queue.add('execute-workflow', {
      executionId
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  }
}
```

**Worker Setup**:

```typescript
// queues/workflow-execution.worker.ts
import { Worker } from 'bullmq';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkflowExecutionWorker {
  private worker: Worker;

  constructor(
    private readonly orchestrator: ExecutionOrchestratorService
  ) {
    this.worker = new Worker(
      'workflow-executions',
      async (job) => {
        const { executionId } = job.data;
        await this.orchestrator.executeWorkflow(executionId);
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`Workflow execution ${job.data.executionId} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Workflow execution ${job.data.executionId} failed:`, err);
    });
  }
}
```

#### 6.4.4 API Flow với Queue

```typescript
// execution.service.ts
async triggerWorkflow(workflowId: string, input: any, context: RequestContext) {
  // 1. Validate workflow
  const workflow = await this.workflowService.findById(workflowId, context);
  if (workflow.status !== 'active') {
    throw new BadRequestException('Workflow is not active');
  }

  // 2. Create execution record (status = 'pending')
  const execution = await this.create({
    executionType: 'workflow',
    workflowId,
    input,
    status: 'pending',
    owner: context
  });

  // 3. Push to queue
  await this.workflowQueue.addExecutionJob(execution.executionId);

  // 4. Emit event
  this.eventEmitter.emit('workflow-execution:queued', {
    executionId: execution.executionId,
    workflowId
  });

  // 5. Return immediately
  return {
    executionId: execution.executionId,
    status: 'pending',
    message: 'Workflow execution queued successfully'
  };
}
```

#### 6.4.5 Event Naming Convention

Theo pattern `<resource>:<action>`:

**Workflow Events**:
- `workflow:created` - Workflow template created
- `workflow:updated` - Workflow template updated
- `workflow:activated` - Workflow status changed to active
- `workflow:archived` - Workflow status changed to archived
- `workflow:deleted` - Workflow deleted

**Workflow Execution Events** (quan trọng nhất):
- `workflow:triggered` - User triggers workflow execution
- `workflow-execution:queued` - Execution added to BullMQ queue
- `workflow-execution:started` - Worker begins processing
- `workflow-execution:step-started` - Individual step starts
- `workflow-execution:step-completed` - Individual step completes
- `workflow-execution:step-failed` - Individual step fails
- `workflow-execution:completed` - Entire workflow completes
- `workflow-execution:failed` - Workflow execution fails

**WorkflowStep Events**:
- `workflow-step:created` - Step added to workflow
- `workflow-step:updated` - Step configuration updated
- `workflow-step:deleted` - Step removed from workflow
- `workflow-step:reordered` - Steps reordered

**Queue & Job Names**:
```typescript
const QUEUE_NAMES = {
  WORKFLOW_EXECUTION: 'workflow-executions',
};

const JOB_NAMES = {
  EXECUTE_WORKFLOW: 'execute-workflow',
};
```

#### 6.4.6 Event Emitter Usage

```typescript
// ExecutionOrchestratorService
async executeWorkflow(executionId: string) {
  const execution = await this.executionService.findByExecutionId(executionId);

  // Emit: execution started
  this.eventEmitter.emit('workflow-execution:started', {
    executionId,
    workflowId: execution.workflowId
  });

  try {
    // Update status to running
    await this.executionService.updateStatus(executionId, 'running');

    // Process steps
    await this.processSteps(execution);

    // Emit: execution completed
    this.eventEmitter.emit('workflow-execution:completed', {
      executionId,
      result: execution.result
    });
  } catch (error) {
    // Emit: execution failed
    this.eventEmitter.emit('workflow-execution:failed', {
      executionId,
      error: error.message
    });
    throw error;
  }
}

async executeStep(execution: Execution, step: ExecutionStep) {
  // Emit: step started
  this.eventEmitter.emit('workflow-execution:step-started', {
    executionId: execution.executionId,
    stepIndex: step.index,
    stepName: step.name
  });

  try {
    // Execute step...
    const output = await this.executeLLMStep(step);

    // Emit: step completed
    this.eventEmitter.emit('workflow-execution:step-completed', {
      executionId: execution.executionId,
      stepIndex: step.index,
      output
    });
  } catch (error) {
    // Emit: step failed
    this.eventEmitter.emit('workflow-execution:step-failed', {
      executionId: execution.executionId,
      stepIndex: step.index,
      error: error.message
    });
    throw error;
  }
}
```

#### 6.4.7 WebSocket Integration (Future Enhancement)

```typescript
// Gateway listens to events and broadcasts to clients
@WebSocketGateway()
export class WorkflowGateway {
  @WebSocketServer()
  server: Server;

  constructor(private eventEmitter: EventEmitter2) {
    // Subscribe to execution events
    this.eventEmitter.on('workflow-execution:step-completed', (payload) => {
      this.server
        .to(`execution:${payload.executionId}`)
        .emit('step:completed', payload);
    });

    this.eventEmitter.on('workflow-execution:completed', (payload) => {
      this.server
        .to(`execution:${payload.executionId}`)
        .emit('execution:completed', payload);
    });
  }

  @SubscribeMessage('subscribe:execution')
  handleSubscribe(client: Socket, executionId: string) {
    client.join(`execution:${executionId}`);
  }
}
```

#### 6.4.8 Client Polling vs WebSocket

**MVP: Polling** (simple, no WebSocket setup needed)

```typescript
// Client polls every 2 seconds
setInterval(async () => {
  const response = await fetch(`/executions/${executionId}`);
  const data = await response.json();

  if (data.status === 'completed' || data.status === 'failed') {
    // Stop polling
    clearInterval(interval);
  }

  // Update UI with progress
  updateUI(data);
}, 2000);
```

**Phase 2: WebSocket** (realtime updates)

```typescript
// Client subscribes to execution updates
socket.emit('subscribe:execution', executionId);

socket.on('step:completed', (data) => {
  console.log(`Step ${data.stepIndex} completed`);
  updateUI(data);
});

socket.on('execution:completed', (data) => {
  console.log('Workflow completed!');
  showResults(data.result);
});
```

#### 6.4.9 Queue Monitoring & Management

```typescript
// Admin endpoint to view queue status
@Get('admin/queue/status')
async getQueueStatus() {
  const queue = new Queue('workflow-executions');

  return {
    waiting: await queue.getWaitingCount(),
    active: await queue.getActiveCount(),
    completed: await queue.getCompletedCount(),
    failed: await queue.getFailedCount()
  };
}

// Clean up completed jobs (run daily)
@Cron('0 0 * * *')
async cleanupCompletedJobs() {
  const queue = new Queue('workflow-executions');
  await queue.clean(24 * 3600 * 1000, 100, 'completed'); // Keep 24h
  await queue.clean(7 * 24 * 3600 * 1000, 100, 'failed'); // Keep 7 days
}
```

---

## 📌 Next Steps

1. **Review this design document**
2. **Create implementation plan** với detailed tasks
3. **Generate Mongoose schemas**
4. **Implement services & controllers**
5. **Setup BullMQ queue & worker**
6. **Implement event emitters**
7. **Write unit tests**
8. **Integration testing**
9. **API documentation (Swagger)**

---

**End of Document**
