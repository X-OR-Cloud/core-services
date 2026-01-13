# MVP Simplified Analysis & Recommendations

Phân tích các comment của anh và đề xuất schema MVP tối ưu.

---

## 📋 Phân Tích Từng Comment

### 1️⃣ **Workflow Schema**

#### ❓ Line 31: Scheduler module riêng - không để trigger ở đây?

**Câu hỏi**: "anh sẽ làm làm 1 module scheduler riêng về sau, ý tưởng là scheduler này sẽ trigger vào workflow, vào agent, nên có lẽ ko để trigger ở đây."

**Trả lời**:
- ✅ **ĐỒNG Ý** - Scheduler nên là module độc lập
- Lý do:
  - Scheduler có thể trigger nhiều loại: Workflow, Agent, Deployment, Report
  - Tránh duplicate logic scheduling ở mỗi module
  - Dễ quản lý centralized (view all scheduled tasks)

**Đề xuất MVP**:
```typescript
// LOẠI BỎ trigger config khỏi Workflow schema
interface Workflow {
  _id: ObjectId;
  name: string;
  description?: string;
  version: string;
  status: 'draft' | 'active' | 'archived';
  executionMode: 'internal' | 'langgraph';
  // ❌ REMOVE: triggers
}

// Phase 2: Tạo Scheduler module riêng
interface ScheduledTask {
  _id: ObjectId;
  name: string;
  targetType: 'workflow' | 'agent' | 'deployment';
  targetId: string;  // workflowId, agentId, etc.
  schedule: {
    cron: string;
    timezone: string;
    enabled: boolean;
  };
  input?: any;
  lastRun?: Date;
  nextRun?: Date;
}
```

---

#### ❓ Line 36: Manual vs API khác nhau như thế nào?

**Câu hỏi**: "manual khác api như thế nào?"

**Trả lời**:
- **manual**: User click button trên UI (Dashboard) → POST /workflows/{id}/runs
- **api**: External system gọi API programmatically (same endpoint)
- **Kết luận**: Thực chất đều là HTTP POST, chỉ khác context

**Đề xuất MVP**:
```typescript
// CHỈ CẦN 1 trigger type: 'manual'
// Phase 1: Chỉ hỗ trợ manual trigger (user click hoặc API call)
// Phase 2: Thêm 'schedule' (via Scheduler module)
// Phase 3: Thêm 'webhook', 'event'

interface Execution {
  triggerType: 'manual' | 'schedule' | 'webhook' | 'event';
  triggerMetadata?: {
    triggeredBy: 'user' | 'system';
    userId?: string;
    source?: string;  // 'dashboard' | 'api' | 'scheduler'
  };
}
```

**MVP**: Chỉ cần `triggerType: 'manual'` (bao gồm cả user click và API call)

---

#### ❓ Line 40-44: Settings timeout/retry cho workflow level?

**Câu hỏi**: "trong các step đều có errorHandling chắc tạm thời chưa cần timeout và retry cho cả workflow tại phiên bản tối thiểu này."

**Trả lời**:
- ✅ **ĐỒNG Ý** - Step-level error handling đã đủ cho MVP
- Workflow-level settings có thể thêm Phase 2

**Đề xuất MVP**:
```typescript
interface Workflow {
  // ❌ REMOVE: settings (timeout, maxRetries) ở workflow level
  // Chỉ giữ step-level errorHandling
}

interface WorkflowStep {
  errorHandling?: {
    maxRetries?: number;      // Default: 0 (no retry)
    retryDelayMs?: number;    // Default: 1000
    continueOnError?: boolean; // Default: false
  };
}
```

---

### 2️⃣ **WorkflowStep Schema**

#### ❓ Line 66: _id là ObjectId

**Comment**: "_id là object id mongodb nhé"

**Trả lời**: ✅ Đúng rồi anh, đã fix trong schema cuối

```typescript
import { Types } from 'mongoose';

interface WorkflowStep {
  _id: Types.ObjectId;  // MongoDB ObjectId
  // ...
}
```

---

#### ❓ Line 72: Đổi stepType → type?

**Comment**: "đổi thành type cho gọn, vì đang trong entity step rồi"

**Trả lời**: ✅ **ĐỒNG Ý** - Gọn hơn và intuitive hơn

```typescript
// BEFORE
interface WorkflowStep {
  stepType: 'tool' | 'llm' | 'rule' | 'transform';
}

// AFTER (MVP)
interface WorkflowStep {
  type: 'tool' | 'llm';  // MVP chỉ 2 types
  // Phase 2: thêm 'rule' | 'transform'
}
```

---

#### ❓ Line 88: Input của step đầu = input của Workflow?

**Comment**: "với step có orderIndex = 0 thì input này sẽ là input của Workflow? ví dụ khi trigger qua api, thì sẽ phải input các thông tin này vào endpoint trigger?"

**Trả lời**: ✅ **ĐÚNG**

**Data Flow**:
```
POST /workflows/{id}/runs
Body: { "input": { "currency": "USD" } }
  ↓
Execution created with input: { "currency": "USD" }
  ↓
Step 0 (orderIndex=0) receives: { "currency": "USD" }
  ↓
Step 0 output: { "price": 2050, "currency": "USD" }
  ↓
Step 1 receives: { "price": 2050, "currency": "USD" }
```

**MVP Rule**:
- Step có dependencies = [] → nhận input từ Workflow
- Step có dependencies = [0, 1] → nhận output từ step 0 và 1 (merged)

---

#### ❓ Line 97: Có cần outputMapping không?

**Comment**: "đã có output schema rồi có cần thiết có outputMapping không, ở phiên bản tối thiểu có thể loại bỏ các việc mapping được không?"

**Trả lời**: ✅ **ĐỒNG Ý** - MVP có thể bỏ mapping

**Lý do loại bỏ mapping trong MVP**:
1. Output schema chỉ để **validate** structure
2. Mapping phức tạp (JSONPath, Handlebars) → tăng complexity
3. MVP: Output của step N = Input của step N+1 (trực tiếp, không transform)

**Đề xuất MVP**:
```typescript
interface WorkflowStep {
  // ❌ REMOVE: inputMapping
  // ❌ REMOVE: outputMapping

  inputSchema?: JSONSchema;   // Validate input structure
  outputSchema?: JSONSchema;  // Validate output structure
}

// Simple data flow:
// Step 0 output = { "price": 2050, "currency": "USD" }
// Step 1 input = { "price": 2050, "currency": "USD" } (exact same object)
```

**Phase 2**: Thêm `inputMapping` / `outputMapping` cho advanced use cases

---

#### ❓ Line 106: Optional field trong MVP?

**Comment**: "ở phiên bản tối thiểu chưa cần phần này"

**Trả lời**: ✅ **ĐỒNG Ý** - Bỏ `optional` field

```typescript
interface WorkflowStep {
  // ❌ REMOVE: optional field
  // MVP: Tất cả steps đều required
}
```

---

#### ❓ Line 130: UserPromptTemplate có cần không?

**Comment**: "có cần làm template như vậy trong phiên bản tối thiểu của workflow không, userPrompt đơn thuần sẽ là input data vào cho step thôi?"

**Clarification từ anh**: "userPromptTemplate là optional nhé, nếu không có mặc nhiên sẽ lấy json input để làm userPrompt"

**Trả lời**: ✅ **ĐỒNG Ý** - Optional field với fallback behavior

**Logic MVP**:
```typescript
// CASE 1: Có userPromptTemplate (template mode)
llmConfig: {
  systemPrompt: "You are a gold analyst",
  userPromptTemplate: "Analyze gold price: {{price}} {{currency}}"  // Optional
}
input: { price: 2050, currency: "USD" }
→ User prompt = "Analyze gold price: 2050 USD" (rendered from template)

// CASE 2: Không có userPromptTemplate (direct mode)
llmConfig: {
  systemPrompt: "You are a gold analyst"
  // No userPromptTemplate
}
input: { price: 2050, currency: "USD" }
→ User prompt = JSON.stringify(input) = '{"price":2050,"currency":"USD"}'
// Hoặc user prompt = input.toString() nếu input là string

// CASE 3: Input là string thẳng
input: "Current gold price is 2050 USD"
→ User prompt = "Current gold price is 2050 USD" (direct)
```

**Implementation**:
```typescript
function buildUserPrompt(llmConfig: LLMConfig, input: any): string {
  if (llmConfig.userPromptTemplate) {
    // Use template engine
    return Handlebars.compile(llmConfig.userPromptTemplate)(input);
  } else {
    // Fallback: convert input to string
    if (typeof input === 'string') {
      return input;
    } else {
      return JSON.stringify(input, null, 2);
    }
  }
}
```

**Recommendation**: **Giữ `userPromptTemplate` as optional** với fallback sang JSON.stringify(input)

---

#### ❓ Line 139: Bỏ inputMapping/outputMapping?

**Comment**: "a nghĩ chúng ta chưa cần mapping input và output, chỉ cần có schema để validate input và output là đủ, cơ bản output của bước trước phải match với input của bước sau."

**Trả lời**: ✅ **ĐỒNG Ý HOÀN TOÀN**

**MVP Rule**:
```typescript
// Simple pass-through (no mapping)
Step 0 output → Step 1 input (direct)
Step 1 output → Step 2 input (direct)

// Nếu step có multiple dependencies:
Step 0 output: { price: 2050 }
Step 1 output: { analysis: "bullish" }
Step 2 input: { price: 2050, analysis: "bullish" }  // Merged
```

**Schema chỉ để validate**:
```typescript
interface WorkflowStep {
  inputSchema?: {
    type: 'object',
    properties: {
      price: { type: 'number', required: true },
      currency: { type: 'string' }
    }
  };

  outputSchema?: {
    type: 'object',
    properties: {
      price: { type: 'number' },
      analysis: { type: 'string' }
    }
  };
}

// At runtime:
// 1. Validate step input against inputSchema
// 2. Execute step
// 3. Validate step output against outputSchema
// 4. Pass output to next step (no transformation)
```

---

#### ❓ Line 150: Dependencies behavior?

**Comment**: "nếu không có dependencies có nghĩa là cho dù step 0 có lỗi, thì step này vẫn chạy phải không?"

**Clarification từ anh**: "vậy có cần orderIndex hay không?"

**Trả lời**:

**Dependencies vs OrderIndex**:
- **`dependencies`**: Logic control (step này phụ thuộc step nào)
- **`orderIndex`**: Display order (thứ tự hiển thị trên UI)

**MVP Decision**: ✅ **CẦN CẢ HAI FIELDS**

**Lý do**:
1. **orderIndex**: Thứ tự hiển thị steps trên UI (0, 1, 2, 3...)
2. **dependencies**: Logic execution order (có thể chạy parallel)

**Example - Sequential Workflow**:
```typescript
// Simple sequential workflow
[
  { index: 0, orderIndex: 0, dependencies: [] },        // Run first
  { index: 1, orderIndex: 1, dependencies: [0] },       // Wait step 0
  { index: 2, orderIndex: 2, dependencies: [1] }        // Wait step 1
]
```

**Example - Parallel Workflow**:
```typescript
// Parallel execution
[
  { index: 0, orderIndex: 0, dependencies: [] },        // Run first
  { index: 1, orderIndex: 1, dependencies: [0] },       // Wait step 0
  { index: 2, orderIndex: 2, dependencies: [0] },       // Wait step 0 (parallel with step 1)
  { index: 3, orderIndex: 3, dependencies: [1, 2] }     // Wait both step 1 & 2
]

Execution flow:
  Step 0
    ├─> Step 1 (parallel)
    └─> Step 2 (parallel)
        └─> Step 3 (after both complete)
```

**MVP Logic**:
```typescript
// Step với dependencies = []
// → Chạy ngay khi workflow start (không đợi step nào)

// Step với dependencies = [0]
// → Chỉ chạy khi step 0 COMPLETED (status = 'completed')
// → Nếu step 0 FAILED → step 1 bị SKIPPED (không chạy)

// Step với dependencies = [0, 1]
// → Chỉ chạy khi BOTH step 0 và step 1 COMPLETED
// → Nếu 1 trong 2 failed → step này bị SKIPPED
```

**Orchestration Flow**:
```typescript
async processReadySteps(execution: Execution) {
  for (const step of execution.steps.sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (step.status !== 'pending') continue;

    // Check if all dependencies completed
    const allDepsCompleted = step.dependencies.every(depIndex => {
      const depStep = execution.steps[depIndex];
      return depStep.status === 'completed';
    });

    if (allDepsCompleted) {
      await this.executeStep(execution, step);  // Execute in parallel if multiple ready
    }
  }
}
```

**Conclusion**: Giữ cả `orderIndex` (UI display) và `dependencies` (execution control)

---

#### ❓ Line 170 & 218: Rule & Transform types trong MVP?

**Comment**: "tạm thời phiên bản hiện tại chúng ta chưa làm rule engine, nên type này tạm thời chưa cần xử lý"

**Clarification từ anh**: "Tool cũng chưa ưu tiên trong MVP nhé, tạm thời chỉ llm."

**Trả lời**: ✅ **ĐỒNG Ý** - MVP chỉ focus LLM

**MVP Step Types**:
```typescript
// MVP Phase 1: CHỈ LLM
type StepType = 'llm';

// Phase 2: Thêm Tool
type StepType = 'llm' | 'tool';

// Phase 3: Full feature
type StepType = 'llm' | 'tool' | 'rule' | 'transform' | 'agent' | 'human';
```

**Lý do chỉ LLM trong MVP**:
- ✅ `llm`: Core feature, call LLM via Deployment
  - Đơn giản nhất để implement
  - Demo được workflow orchestration
  - Đủ để validate architecture
- ❌ `tool`: External API call → Phase 2
  - Cần handle HTTP client, error codes, timeouts
  - Cần security considerations (API keys, auth)
- ❌ `rule`: Conditional logic → Phase 3
- ❌ `transform`: Data transformation → Phase 3

**MVP Example - LLM Only**:
```typescript
// Workflow: Multi-step LLM pipeline
{
  "name": "Content Generation Pipeline",
  "steps": [
    {
      "orderIndex": 0,
      "type": "llm",
      "name": "Generate Outline",
      "llmConfig": {
        "deploymentId": "gpt4_deployment",
        "systemPrompt": "Generate article outline",
        "userPromptTemplate": "Topic: {{topic}}"
      },
      "dependencies": []
    },
    {
      "orderIndex": 1,
      "type": "llm",
      "name": "Write Introduction",
      "llmConfig": {
        "deploymentId": "gpt4_deployment",
        "systemPrompt": "Write introduction paragraph",
        "userPromptTemplate": "Outline: {{outline}}"
      },
      "dependencies": [0]
    },
    {
      "orderIndex": 2,
      "type": "llm",
      "name": "Write Body",
      "llmConfig": {
        "deploymentId": "gpt4_deployment",
        "systemPrompt": "Write main content",
        "userPromptTemplate": "Outline: {{outline}}"
      },
      "dependencies": [0]
    },
    {
      "orderIndex": 3,
      "type": "llm",
      "name": "Write Conclusion",
      "llmConfig": {
        "deploymentId": "gpt4_deployment",
        "systemPrompt": "Write conclusion",
        "userPromptTemplate": "Content: {{introduction}} {{body}}"
      },
      "dependencies": [1, 2]
    }
  ]
}
```

**Use Cases với chỉ LLM**:
- Multi-step content generation
- Code review pipeline (analyze → suggest → refactor)
- Customer support (classify → draft response → refine)
- Data analysis (extract → analyze → summarize)

**Conclusion**: MVP chỉ implement `type: 'llm'`, bỏ tool/rule/transform

---

### 3️⃣ **Execution Schema**

#### ❓ Line 337: Trùng lặp type vs executionType?

**Comment**: "trùng lặp giữa type và executionType?"

**Trả lời**: ✅ **ĐÚNG** - Có sự trùng lặp

**Phân tích**:
```typescript
// Current schema (confusing)
interface Execution {
  type: string;              // 'workflow' | 'deployment' | ...?
  executionType: string;     // 'workflow' | 'deployment'
  // → Redundant!
}
```

**Đề xuất MVP**:
```typescript
// Option A: Chỉ giữ executionType (Recommended)
interface Execution {
  executionType: 'deployment' | 'workflow';
  // ❌ REMOVE: type field

  // For workflow execution:
  workflowId?: string;
  workflowVersion?: string;

  // For deployment execution:
  deploymentId?: string;
  modelId?: string;
}

// Option B: Rename type → category
interface Execution {
  executionType: 'deployment' | 'workflow';
  category?: string;  // 'trading' | 'analytics' | 'notification'
}
```

**Recommendation**: **Option A** - Bỏ `type`, chỉ giữ `executionType`

---

#### ❓ Line 338: Bỏ category field?

**Comment**: "bỏ trường này đễ đỡ phức tạp cho phiên bản mvp"

**Trả lời**: ✅ **ĐỒNG Ý**

```typescript
interface Execution {
  // ❌ REMOVE: category
  // MVP: Không cần categorize executions
  // Phase 2: Có thể thêm tags[] thay vì category
}
```

---

#### ❓ Line 340: Progress tự tính?

**Comment**: "progress sẽ tự tính toàn khi mỗi step được thay đổi phải không"

**Trả lời**: ✅ **ĐÚNG**

```typescript
// Auto-calculate progress
function calculateProgress(execution: Execution): number {
  const totalSteps = execution.steps.length;
  const completedSteps = execution.steps.filter(
    s => s.status === 'completed'
  ).length;

  return Math.round((completedSteps / totalSteps) * 100);
}

// Update after each step completes
async updateStepStatus(executionId: string, stepIndex: number, status: string) {
  await Execution.updateOne(
    { executionId },
    {
      $set: {
        [`steps.${stepIndex}.status`]: status,
        progress: this.calculateProgress(execution)  // Auto-update
      }
    }
  );
}
```

---

#### ❓ Line 342: Context cần thiết cho MVP?

**Comment**: "context có cần thiết cho phiên bản MVP đầu tiên cho Workflow không?"

**Clarification từ anh**: "trong owner đã có orgId và userId, context ở đây ý em là user trigger workflow đúng không, còn owner chỉ là người tạo workflow? Bản chất khi trigger sẽ tạo execution với owner tương ứng user thực thi rồi mà có cần thiết trường context không?"

**Trả lời**: ✅ **KHÔNG CẦN** - Đã có owner field

**Phân tích**:
```typescript
// Workflow (Template)
{
  _id: "workflow_123",
  name: "Gold Analysis",
  owner: {
    orgId: "org_001",    // Organization tạo workflow
    userId: "user_001"   // User tạo workflow template
  }
}

// Execution (Runtime instance)
{
  executionId: "exec_456",
  workflowId: "workflow_123",
  owner: {
    orgId: "org_001",    // Organization trigger execution (= user's org)
    userId: "user_002"   // User trigger execution
  }
  // ❌ KHÔNG CẦN: context (duplicate with owner)
}
```

**So sánh Owner vs Context**:

| Field | Purpose | Example |
|-------|---------|---------|
| **Workflow.owner** | Người tạo workflow template | User A creates "Gold Analysis" workflow |
| **Execution.owner** | Người trigger execution | User B runs "Gold Analysis" workflow |
| ~~Execution.context~~ | ❌ Duplicate | Same as Execution.owner |

**MVP Decision**: ❌ **BỎ context field**, chỉ dùng `owner`

**Lý do**:
1. **owner** đã đủ: Có orgId + userId của người trigger
2. **Không duplicate**: Context chỉ là bản sao của owner
3. **Đơn giản hơn**: Một nguồn sự thật (owner), không confuse

**Implementation**:
```typescript
// When trigger workflow
async triggerWorkflow(workflowId: string, input: any, user: RequestContext) {
  const workflow = await this.workflowService.findById(workflowId);

  // Check permission: user's org must match workflow's org
  if (user.orgId !== workflow.owner.orgId) {
    throw new ForbiddenException('Cannot trigger workflow from different organization');
  }

  const execution = await this.executionService.create({
    executionType: 'workflow',
    workflowId: workflow._id,
    name: `${workflow.name} - Run`,
    owner: {
      orgId: user.orgId,    // Execution owner = trigger user
      userId: user.userId
    },
    input,
    status: 'pending'
  });

  return execution;
}
```

**Query Examples**:
```typescript
// Find executions by trigger user
await Execution.find({ 'owner.userId': 'user_002' });

// Find executions by organization
await Execution.find({ 'owner.orgId': 'org_001' });

// Find executions of a workflow
await Execution.find({ workflowId: 'workflow_123' });
```

**Conclusion**: Bỏ `context`, chỉ giữ `owner` field

---

#### ❓ Line 354: Steps array vs separate collection?

**Comment**: "đã có execution step entity riêng rồi có cần thiết trường này không?"

**Trả lời**: ⚠️ **CẦN GIẢI THÍCH**

**Current Design**: Embedded document (steps trong Execution)
```typescript
interface Execution {
  executionId: string;
  steps: ExecutionStep[];  // Embedded array
}

// Pros:
// ✅ Single query để lấy execution + steps
// ✅ Atomic update (update step và execution cùng lúc)
// ✅ Phù hợp với workflow (steps ít, < 20 steps)

// Cons:
// ❌ Document size limit (16MB) nếu có quá nhiều steps
// ❌ Không query được steps riêng lẻ
```

**Alternative**: Separate collection
```typescript
// Collection: executions
interface Execution {
  executionId: string;
  // No steps array
}

// Collection: execution_steps
interface ExecutionStep {
  _id: ObjectId;
  executionId: string;  // Foreign key
  index: number;
  // ...
}

// Pros:
// ✅ No document size limit
// ✅ Query steps independently

// Cons:
// ❌ 2 queries để lấy execution + steps
// ❌ Không atomic update
```

**Recommendation**:
- **MVP**: **Embedded document** (current design)
  - Workflows thường < 20 steps
  - Performance tốt hơn (1 query)
  - Code đơn giản hơn
- **Phase 2**: Nếu có workflows với > 50 steps, cân nhắc separate collection

---

#### ❓ Line 356-357: NodeId fields trong MVP?

**Comment**: "tạm thời chưa cần xử lý xác định node triển khai"

**Trả lời**: ✅ **ĐỒNG Ý**

```typescript
interface Execution {
  // ❌ REMOVE trong MVP (chỉ cần cho deployment)
  // primaryNodeId?: string;
  // involvedNodeIds?: string[];

  // Chỉ workflow execution không cần node
  // Deployment execution vẫn cần node
}

// Conditional fields based on executionType:
if (executionType === 'deployment') {
  execution.primaryNodeId = nodeId;
} else {
  // workflow không cần node
}
```

---

#### ❓ Line 372: Result là gì?

**Comment**: "result ở đây là gì?"

**Clarification từ anh**: "Trường error có thể phân loại thành các loại error chung không? ví dụ: invalid input, hoặc output, lỗi trong quá trình execution..."

**Trả lời**: **Final summary khi execution hoàn thành**

```typescript
// Error classification
enum ExecutionErrorType {
  VALIDATION_ERROR = 'validation_error',        // Input/output schema validation failed
  EXECUTION_ERROR = 'execution_error',          // Error during step execution
  TIMEOUT_ERROR = 'timeout_error',              // Step or execution timeout
  DEPENDENCY_ERROR = 'dependency_error',        // Dependency step failed
  CONFIGURATION_ERROR = 'configuration_error',  // Invalid step config (deployment not found, etc.)
  SYSTEM_ERROR = 'system_error'                 // Internal system error
}

interface Execution {
  result?: {
    success: boolean;
    summary: {
      stepsCompleted: number;
      stepsFailed: number;
      stepsSkipped: number;
      totalTokensUsed?: number;  // For LLM steps
      totalCost?: number;
      totalDurationMs: number;
    };
    finalOutput?: any;  // Last step output (if needed)
  };

  error?: {
    type: ExecutionErrorType;      // ✅ NEW: Error classification
    message: string;
    code?: string;                 // Error code (e.g., 'E001', 'DEPLOY_NOT_FOUND')
    failedStepIndex?: number;      // Which step failed
    details?: {                    // ✅ NEW: Structured error details
      stepName?: string;
      inputValidationErrors?: any[];   // Schema validation errors
      outputValidationErrors?: any[];
      llmError?: {
        statusCode?: number;
        responseBody?: string;
      };
    };
    stack?: string;                // Stack trace (only in dev)
    timestamp: Date;               // When error occurred
  };
}

// Populated when status changes to 'completed' or 'failed'
```

**Error Type Examples**:

**1. VALIDATION_ERROR** - Input/Output validation failed
```typescript
{
  type: 'validation_error',
  message: 'Step input validation failed',
  failedStepIndex: 1,
  details: {
    stepName: 'Analyze Trend',
    inputValidationErrors: [
      {
        field: 'price',
        message: 'Required field missing',
        expectedType: 'number'
      }
    ]
  }
}
```

**2. EXECUTION_ERROR** - Error during step execution
```typescript
{
  type: 'execution_error',
  message: 'LLM request failed',
  code: 'LLM_REQUEST_FAILED',
  failedStepIndex: 1,
  details: {
    stepName: 'Analyze Trend',
    llmError: {
      statusCode: 500,
      responseBody: 'Internal server error'
    }
  }
}
```

**3. TIMEOUT_ERROR** - Step timeout
```typescript
{
  type: 'timeout_error',
  message: 'Step execution timeout after 30s',
  code: 'STEP_TIMEOUT',
  failedStepIndex: 1,
  details: {
    stepName: 'Analyze Trend',
    timeoutMs: 30000
  }
}
```

**4. DEPENDENCY_ERROR** - Dependency step failed
```typescript
{
  type: 'dependency_error',
  message: 'Cannot execute step because dependency failed',
  code: 'DEPENDENCY_FAILED',
  failedStepIndex: 2,
  details: {
    stepName: 'Generate Report',
    failedDependencies: [
      { index: 1, name: 'Analyze Trend', status: 'failed' }
    ]
  }
}
```

**5. CONFIGURATION_ERROR** - Invalid config
```typescript
{
  type: 'configuration_error',
  message: 'Deployment not found',
  code: 'DEPLOYMENT_NOT_FOUND',
  failedStepIndex: 1,
  details: {
    stepName: 'Analyze Trend',
    deploymentId: 'deployment_xyz',
    reason: 'Deployment does not exist or is not active'
  }
}
```

**6. SYSTEM_ERROR** - Internal error
```typescript
{
  type: 'system_error',
  message: 'Database connection failed',
  code: 'DB_CONNECTION_ERROR',
  stack: 'Error: ... (only in dev mode)'
}
```

---

## 🎯 MVP Schema - Simplified Version

Dựa trên phân tích các comment, đây là schema **tối giản** cho MVP:

### 1. Workflow (Template)

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

  @Prop({ enum: ['draft', 'active', 'archived'], default: 'draft' })
  status: string;

  @Prop({ enum: ['internal', 'langgraph'], default: 'internal' })
  executionMode: string;

  @Prop({ type: Object })
  owner: {
    orgId: string;
    userId: string;
  };

  // ❌ REMOVED: triggers (move to Scheduler module later)
  // ❌ REMOVED: settings (use step-level errorHandling)
  // ❌ REMOVED: tags (simplify MVP)
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
```

### 2. WorkflowStep (Template)

```typescript
@Schema({ timestamps: true })
export class WorkflowStep extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true })
  orderIndex: number;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  // ✅ CHANGED: stepType → type
  // ✅ MVP: Only 'llm' type
  @Prop({ enum: ['llm'], required: true })
  type: string;

  // ❌ REMOVED: toolConfig (Phase 2)
  // Tool configuration will be added in Phase 2

  // LLM configuration
  @Prop({ type: Object, required: true })
  llmConfig: {
    deploymentId: string;
    modelIdentifier?: string;
    systemPrompt: string;
    userPromptTemplate?: string;  // ✅ OPTIONAL: fallback to JSON.stringify(input)
    parameters?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    };
    timeout?: number;  // Default: 30000ms
  };

  // Schema for validation only (no mapping)
  @Prop({ type: Object })
  inputSchema?: Record<string, any>;

  @Prop({ type: Object })
  outputSchema?: Record<string, any>;

  // ❌ REMOVED: inputMapping (Phase 2)
  // ❌ REMOVED: outputMapping (Phase 2)

  @Prop({ type: [Number], default: [] })
  dependencies: number[];

  // ❌ REMOVED: optional (MVP all steps required)

  @Prop({ type: Object })
  errorHandling?: {
    maxRetries?: number;      // Default: 0
    retryDelayMs?: number;    // Default: 1000
    continueOnError?: boolean; // Default: false
  };
}

export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);
```

### 3. Execution (Extended)

```typescript
// Error type enum
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

  // ❌ REMOVED: type (duplicate with executionType)

  @Prop({ enum: ['deployment', 'workflow'], required: true })
  executionType: string;

  // ❌ REMOVED: category (simplify MVP)

  @Prop({ enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], default: 'pending' })
  status: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress: number;  // Auto-calculated

  // For workflow execution
  @Prop({ type: Types.ObjectId, ref: 'Workflow' })
  workflowId?: Types.ObjectId;

  @Prop()
  workflowVersion?: string;

  @Prop({ type: Object })
  workflowSnapshot?: {
    name: string;
    steps: any[];  // Full snapshot of WorkflowStep[]
  };

  @Prop({ enum: ['manual', 'schedule', 'webhook', 'event'] })
  triggerType?: string;  // MVP: only 'manual'

  @Prop({ type: Object })
  triggerMetadata?: {
    triggeredBy: 'user' | 'system';
    userId?: string;
    source?: string;
  };

  // ❌ REMOVED: context (duplicate with owner)
  // Owner contains orgId + userId of trigger user

  @Prop({ type: Object })
  input?: any;

  // Embedded steps
  @Prop({ type: [Object], default: [] })
  steps: ExecutionStep[];

  // ❌ REMOVED: primaryNodeId (only for deployment)
  // ❌ REMOVED: involvedNodeIds (only for deployment)
  // Conditional: only set if executionType = 'deployment'

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
    type: ExecutionErrorType;  // ✅ NEW: Error classification
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
    orgId: string;    // Organization of trigger user
    userId: string;   // User who triggered execution
  };
}

export const ExecutionSchema = SchemaFactory.createForClass(Execution);
```

### 4. ExecutionStep (Embedded Schema)

```typescript
export class ExecutionStep {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;  // 0-100

  // ✅ CHANGED: stepType → type
  type: 'command' | 'llm';  // MVP: only 'llm' for workflow

  // For deployment (existing)
  command?: string;
  nodeId?: string;

  // For workflow (new) - MVP: only LLM
  // ❌ REMOVED: toolConfig (Phase 2)

  llmConfig?: {
    deploymentId: string;
    modelIdentifier?: string;
    systemPrompt: string;
    userPromptTemplate?: string;  // Optional
    parameters?: any;
  };

  input?: any;
  output?: any;

  dependencies: number[];

  // ❌ REMOVED: optional (MVP all required)
  // ❌ REMOVED: inputMapping (Phase 2)
  // ❌ REMOVED: outputMapping (Phase 2)

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
    type?: ExecutionErrorType;  // ✅ NEW: Error classification
    message: string;
    code?: string;
    details?: any;
    stack?: string;
  };

  metadata?: any;
}
```

---

## 📊 Comparison: Full vs MVP

| Feature | Full Design | MVP (Simplified) | Reason |
|---------|-------------|------------------|--------|
| **Workflow triggers** | schedule/manual/api/webhook | ❌ None (manual only via API) | Scheduler is separate module |
| **Workflow settings** | timeout, maxRetries | ❌ Removed | Use step-level errorHandling |
| **Step types** | tool/llm/rule/transform/agent | ✅ tool/llm only | Rule/transform need engine |
| **Step field** | stepType | ✅ type | Simpler naming |
| **Step optional** | Yes | ❌ No | All steps required in MVP |
| **Input/Output mapping** | JSONPath expressions | ❌ No mapping | Pass-through only |
| **UserPromptTemplate** | Handlebars template | ✅ Keep | Simple & useful |
| **Execution type vs category** | Both | ✅ executionType only | Remove duplication |
| **Context** | orgId/userId/environment | ✅ orgId/userId only | Simplify |
| **Node fields** | primaryNodeId/involvedNodeIds | ❌ Not for workflow | Only for deployment |
| **Progress** | Manual set | ✅ Auto-calculated | No manual intervention |

---

## 🚀 MVP Implementation Checklist

### Phase 1: Core (Week 1-2)
- [ ] Workflow schema (name, version, status, executionMode)
- [ ] WorkflowStep schema (type: tool/llm, dependencies, errorHandling)
- [ ] Execution schema (extend existing with executionType, workflowId)
- [ ] ExecutionStep embedded schema (add type, toolConfig, llmConfig)

### Phase 1: Service Layer (Week 3-4)
- [ ] WorkflowService (CRUD workflows)
- [ ] WorkflowStepService (CRUD steps)
- [ ] Extend ExecutionService (handle workflow execution)
- [ ] Extend ExecutionOrchestrator (add executeLLMStep, executeToolStep)

### Phase 1: API (Week 5-6)
- [ ] POST /workflows (create template)
- [ ] GET /workflows (list templates)
- [ ] POST /workflows/{id}/steps (add steps)
- [ ] POST /workflows/{id}/runs (trigger execution)
- [ ] GET /executions/{executionId} (monitor progress)

### Phase 2: Advanced Features (Later)
- [ ] Scheduler module (trigger workflows on schedule)
- [ ] Rule engine (JSONLogic for conditional steps)
- [ ] Transform engine (data transformation)
- [ ] Input/output mapping (JSONPath expressions)
- [ ] Optional steps (continueOnError with dependency skip)

---

## ✅ Key MVP Principles

1. **Simplicity First**: Chỉ implement features cần thiết
2. **No Mapping**: Output step N = Input step N+1 (direct pass)
3. **Two Step Types**: Tool (API call) + LLM (deployment call)
4. **Manual Trigger Only**: Scheduler là Phase 2
5. **Embedded Steps**: Keep steps inside Execution document
6. **Auto Progress**: Calculate based on completed steps
7. **Pass-Through Data**: No JSONPath, no Handlebars (except userPromptTemplate)
8. **Required Steps**: No optional steps in MVP

---

## 📝 Example MVP Workflow

```json
{
  "name": "Gold Analysis MVP",
  "version": "v1.0",
  "status": "active",
  "executionMode": "internal",
  "steps": [
    {
      "orderIndex": 0,
      "name": "Fetch Gold Price",
      "type": "tool",
      "toolConfig": {
        "toolId": "gold_api",
        "method": "GET",
        "endpoint": "https://api.gold.com/price"
      },
      "dependencies": [],
      "errorHandling": { "maxRetries": 2 }
    },
    {
      "orderIndex": 1,
      "name": "Analyze Trend",
      "type": "llm",
      "llmConfig": {
        "deploymentId": "gpt4_deployment",
        "systemPrompt": "You are a gold analyst",
        "userPromptTemplate": "Analyze: {{price}}"
      },
      "dependencies": [0],
      "errorHandling": { "maxRetries": 1 }
    }
  ]
}
```

**Trigger**:
```http
POST /workflows/{id}/runs
{
  "input": { "currency": "USD" }
}
```

**Data Flow**:
```
Step 0: Fetch Gold Price
  Input: { "currency": "USD" }
  Output: { "price": 2050, "currency": "USD" }

Step 1: Analyze Trend
  Input: { "price": 2050, "currency": "USD" }  ← Direct from Step 0
  (Template: "Analyze: {{price}}" → "Analyze: 2050")
  Output: { "analysis": "Bullish trend" }
```

Simple, clear, minimal complexity! 🎯
