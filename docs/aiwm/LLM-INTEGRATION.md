# LLM Integration - Real Implementation

## Overview

Replaced mock LLM calls with real integration via **DeploymentService**, enabling workflow steps to call actual LLM endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Execution                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         ExecutionOrchestratorService.executeLLMStep()        │
│  - Validates deployment status                               │
│  - Builds prompt from template                               │
│  - Calls LLM endpoint                                        │
│  - Tracks tokens + cost                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              DeploymentService.getDeploymentEndpoint()       │
│  - Resolves Node IP + Resource Port                          │
│  - Returns: http://172.16.3.20:10060                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    axios.post()                              │
│  POST http://172.16.3.20:10060/v1/chat/completions          │
│  Body: { messages: [...], temperature: 0.7 }                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              LLM Container (vLLM / Triton)                   │
│  - Processes inference request                               │
│  - Returns: { choices: [...], usage: {...} }                │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Service Dependencies

**File**: `services/aiwm/src/modules/execution/services/execution-orchestrator.service.ts`

```typescript
@Injectable()
export class ExecutionOrchestratorService {
  constructor(
    @InjectModel(Execution.name) private executionModel: Model<Execution>,
    @InjectModel(Deployment.name) private deploymentModel: Model<Deployment>,
    private readonly eventEmitter: EventEmitter2,
    private readonly deploymentService: DeploymentService,  // NEW: Injected
  ) {}
}
```

### 2. LLM Execution Flow

**Method**: `executeLLMStep(step, input)`

#### Step 1: Validate Deployment
```typescript
const deployment = await this.deploymentModel
  .findById(deploymentId)
  .where('isDeleted').equals(false)
  .lean()
  .exec();

if (!deployment || deployment.status !== 'running') {
  throw new BadRequestException('Deployment not running');
}
```

#### Step 2: Build Prompt
```typescript
const userPrompt = this.buildUserPrompt(userPromptTemplate, input);
// Uses Handlebars to render template with input data
```

#### Step 3: Get Endpoint
```typescript
const endpoint = await this.deploymentService.getDeploymentEndpoint(deploymentId);
// Returns: http://{NODE_IP}:{CONTAINER_PORT}
```

#### Step 4: Call LLM
```typescript
const response = await axios.post(`${endpoint}/v1/chat/completions`, {
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  ...parameters, // temperature, max_tokens, etc.
}, {
  timeout: 300000, // 5 minutes
});
```

#### Step 5: Extract Response
```typescript
const content = responseData.choices[0].message.content;
const usage = responseData.usage;
const totalTokens = usage.total_tokens;
const cost = this.calculateCost(usage.prompt_tokens, usage.completion_tokens, deployment);
```

### 3. Token Tracking

**Updated Fields in ExecutionStep.result:**
```typescript
{
  success: true,
  tokensUsed: 1500,       // Total tokens
  inputTokens: 1000,      // Input tokens
  outputTokens: 500,      // Output tokens
  cost: 0.00125,          // USD cost
  duration: 2341          // Milliseconds
}
```

**Aggregated in Execution.result:**
```typescript
{
  success: true,
  summary: {
    stepsCompleted: 3,
    stepsFailed: 0,
    stepsSkipped: 0,
    totalTokensUsed: 4500,
    totalInputTokens: 3000,
    totalOutputTokens: 1500,
    totalCost: 0.00375,      // NEW: Total USD cost
    totalDurationMs: 7023
  },
  finalOutput: { ... }
}
```

### 4. Cost Calculation

**Method**: `calculateCost(inputTokens, outputTokens, deployment)`

**Current Implementation** (Placeholder):
```typescript
const inputCostPer1M = 0.5;   // $0.50 per 1M input tokens
const outputCostPer1M = 1.5;  // $1.50 per 1M output tokens

const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;

return inputCost + outputCost;
```

**Future Enhancement** (Phase 5):
- Get pricing from deployment config
- Support per-model pricing tables
- Support custom pricing tiers

### 5. Error Handling

**Connection Errors:**
```typescript
ECONNREFUSED → "LLM deployment at {endpoint} is unreachable"
ETIMEDOUT → "LLM call timed out after 5 minutes"
```

**API Errors:**
```typescript
error.response.status → Forward LLM provider error
```

**Example**:
```json
{
  "statusCode": 400,
  "message": "LLM API error (429): Rate limit exceeded"
}
```

## Module Configuration

**File**: `services/aiwm/src/modules/execution/execution.module.ts`

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Execution.name, schema: ExecutionSchema },
    ]),
    ScheduleModule.forRoot(),
    forwardRef(() => NodeModule),
    WorkflowModule,
    WorkflowStepModule,
    DeploymentModule,  // NEW: For LLM calls
  ],
  // ...
})
export class ExecutionModule {}
```

## API Endpoint Format

The LLM integration uses **OpenAI-compatible API format**:

**Request:**
```bash
POST http://{NODE_IP}:{PORT}/v1/chat/completions
Content-Type: application/json

{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Tell me a story about {{topic}}" }
  ],
  "temperature": 0.7,
  "max_tokens": 500
}
```

**Response:**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Once upon a time..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 100,
    "total_tokens": 150
  }
}
```

## Testing

### Prerequisites

1. **Running Deployment**:
   - Deployment must have `status: 'running'`
   - Node must be online with valid IP
   - Resource must have containerPorts configured

2. **LLM Container**:
   - Container must support OpenAI-compatible API
   - Endpoint: `http://{NODE_IP}:{PORT}/v1/chat/completions`

### Test Workflow

```bash
# 1. Trigger workflow
curl -X POST http://localhost:3305/executions/workflows/{workflowId}/trigger \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"input": {"topic": "brave knight"}}'

# Response
{
  "executionId": "69660d4216d5a01dcce5dc8f",
  "status": "queued",
  "message": "Workflow execution queued successfully"
}

# 2. Check execution status
curl http://localhost:3305/executions/69660d4216d5a01dcce5dc8f/status \
  -H "Authorization: Bearer {token}"

# 3. View worker logs
pm2 logs core.aiwm.worker00
```

### Expected Logs

**Worker logs should show**:
```
[ExecutionOrchestratorService] Calling LLM via deployment 696...
[ExecutionOrchestratorService] System Prompt: You are a creative writer...
[ExecutionOrchestratorService] User Prompt: Write a story about brave knight...
[ExecutionOrchestratorService] LLM call completed in 2341ms - Tokens: 150 (in: 50, out: 100)
[ExecutionOrchestratorService] Step 0 completed in 2345ms
```

### Success Criteria

✅ Workflow execution completes without errors
✅ Each step shows real LLM output (not mock)
✅ Token usage tracked accurately
✅ Cost calculated correctly
✅ Total metrics aggregated in execution.result

## Future Enhancements

### Phase 5 - Advanced Features

1. **Dynamic Pricing**:
   - Store per-model pricing in database
   - Support tiered pricing (volume discounts)
   - Support custom billing rules

2. **Retry Logic**:
   - Retry failed LLM calls with exponential backoff
   - Handle rate limits (429 errors)
   - Circuit breaker pattern

3. **Streaming Support**:
   - Support streaming LLM responses
   - Update step progress in real-time
   - WebSocket events for streaming

4. **Caching**:
   - Cache LLM responses by input hash
   - Reduce costs for repeated queries
   - TTL-based cache invalidation

5. **Multi-Provider Support**:
   - Support API-based deployments (OpenAI, Anthropic, Google)
   - Unified interface across providers
   - Provider-specific error handling

## Benefits

1. **Real LLM Integration** - Workflows now call actual LLM endpoints
2. **Token Tracking** - Accurate token usage per step and execution
3. **Cost Visibility** - Track USD costs for each workflow run
4. **Error Handling** - Proper error messages for LLM failures
5. **Performance Metrics** - Track duration per step and total execution
6. **Scalability** - Worker mode separates LLM processing from API

## Files Modified

1. `execution-orchestrator.service.ts` - LLM integration logic
2. `execution.module.ts` - Import DeploymentModule
3. `LLM-INTEGRATION.md` - This documentation

---

**Status**: ✅ Implemented and Build Successful
**Next**: Test with real deployment
