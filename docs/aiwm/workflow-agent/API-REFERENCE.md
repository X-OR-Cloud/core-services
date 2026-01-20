# Workflow Agent - API Reference

Quick reference guide for AIWM APIs available to the workflow design agent.

## Base Configuration

```bash
# Base URL
BASE_URL="http://localhost:3003/aiwm-v2"

# Authentication (get token from IAM service)
IAM_URL="http://localhost:3000/iam-v2"
TOKEN="<JWT_TOKEN>"
```

## Getting Authentication Token

```bash
# Login to get JWT token
curl -X POST ${IAM_URL}/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }'

# Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}

# Use token in subsequent requests:
# -H "Authorization: Bearer ${TOKEN}"
```

---

## Workflow APIs

### List Workflows

```bash
curl -X GET "${BASE_URL}/workflows?page=1&limit=20&sortBy=createdAt&sortOrder=desc" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `sortBy` (string): Field to sort by
- `sortOrder` (string): 'asc' or 'desc'
- `search` (string): Text search on name/description

**Response:**
```json
{
  "data": [
    {
      "_id": "696d95569fc2d8af78a5bb3c",
      "name": "AI Gold Trader",
      "description": "Financial structuring pipeline",
      "version": "v1.0",
      "status": "active",
      "executionMode": "internal",
      "createdAt": "2025-01-20T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### Get Workflow Details

```bash
curl -X GET "${BASE_URL}/workflows/${WORKFLOW_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Response:**
```json
{
  "_id": "696d95569fc2d8af78a5bb3c",
  "name": "AI Gold Trader",
  "description": "Financial structuring pipeline for gold trading",
  "version": "v1.0",
  "status": "active",
  "executionMode": "internal",
  "createdBy": {
    "userId": "507f1f77bcf86cd799439011",
    "orgId": "507f1f77bcf86cd799439012"
  },
  "createdAt": "2025-01-20T10:00:00Z",
  "updatedAt": "2025-01-20T12:00:00Z"
}
```

---

### Update Workflow

```bash
curl -X PUT "${BASE_URL}/workflows/${WORKFLOW_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Workflow Name",
    "description": "Updated description",
    "status": "active"
  }'
```

---

## Workflow Step APIs

### Get All Steps for Workflow

```bash
curl -X GET "${BASE_URL}/workflow-steps/workflow/${WORKFLOW_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Response:**
```json
{
  "data": [
    {
      "_id": "696d97e09fc2d8af78a5bb66",
      "workflowId": "696d95569fc2d8af78a5bb3c",
      "name": "P1 - Spot & Forward Pricing",
      "description": "Calculate forward prices from LBMA spot data",
      "orderIndex": 0,
      "type": "llm",
      "dependencies": [],
      "llmConfig": {
        "deploymentId": "696df12f086778fa3069129a",
        "systemPrompt": "You are a commodity pricing specialist...",
        "userPromptTemplate": "LBMA Spot Price: ${{lbma_spot_price}}/oz...",
        "parameters": {
          "temperature": 0.3,
          "max_tokens": 4000
        }
      },
      "inputSchema": { ... },
      "outputSchema": { ... }
    }
  ],
  "count": 10
}
```

---

### Get Single Step Details

```bash
curl -X GET "${BASE_URL}/workflow-steps/${STEP_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Response:**
```json
{
  "_id": "696d97e09fc2d8af78a5bb66",
  "workflowId": "696d95569fc2d8af78a5bb3c",
  "name": "P1 - Spot & Forward Pricing",
  "orderIndex": 0,
  "type": "llm",
  "dependencies": [],
  "llmConfig": {
    "deploymentId": "696df12f086778fa3069129a",
    "systemPrompt": "...",
    "userPromptTemplate": "...",
    "parameters": {
      "temperature": 0.3,
      "max_tokens": 4000
    },
    "timeout": 30000
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "lbma_spot_price": {
        "type": "number",
        "description": "LBMA gold spot price in USD per ounce"
      }
    },
    "required": ["lbma_spot_price"],
    "examples": [
      { "lbma_spot_price": 2650.50 }
    ]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "base_forward_price": {
        "type": "number",
        "description": "Calculated forward price in USD per ounce"
      }
    },
    "required": ["base_forward_price"],
    "examples": [
      { "base_forward_price": 2654.32 }
    ]
  },
  "createdAt": "2025-01-20T10:00:00Z",
  "updatedAt": "2025-01-20T11:30:00Z"
}
```

---

### Update Workflow Step

```bash
curl -X PUT "${BASE_URL}/workflow-steps/${STEP_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "P2 - Cost Modeling Engine (Updated)",
    "description": "Calculate operational costs with refining and logistics",
    "llmConfig": {
      "deploymentId": "694970b17770c21561e515bf",
      "systemPrompt": "You are a financial cost analyst specializing in commodity trading operational costs...",
      "userPromptTemplate": "Refining Contract Data:\n{{refining_contract_data}}\n\nLogistics Route:\n{{logistics_route}}\n\nCalculate total operational cost per ounce.",
      "parameters": {
        "temperature": 0.2,
        "max_tokens": 1500
      },
      "timeout": 30000
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "refining_contract_data": {
          "type": "string",
          "description": "Partner refining contract with fee structure"
        },
        "logistics_route": {
          "type": "string",
          "description": "Delivery route and timeline information"
        }
      },
      "required": ["refining_contract_data"],
      "examples": [
        {
          "refining_contract_data": "Partner A: $30/oz refining fee",
          "logistics_route": "Shanghai to Singapore, 14 days, insured"
        }
      ]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "refining_fee_per_oz": {
          "type": "number",
          "description": "Refining fee in USD per ounce"
        },
        "logistics_insurance_fee": {
          "type": "number",
          "description": "Combined logistics and insurance cost in USD"
        },
        "total_operational_cost_per_oz": {
          "type": "number",
          "description": "Total operational cost in USD per ounce"
        },
        "cost_currency": {
          "type": "string",
          "description": "Currency for cost calculations"
        }
      },
      "required": ["refining_fee_per_oz", "total_operational_cost_per_oz"],
      "examples": [
        {
          "refining_fee_per_oz": 30,
          "logistics_insurance_fee": 15,
          "total_operational_cost_per_oz": 45,
          "cost_currency": "USD"
        }
      ]
    }
  }'
```

**Response:**
```json
{
  "_id": "696d97ebffbe9aed3d5dc7df",
  "name": "P2 - Cost Modeling Engine (Updated)",
  "updatedAt": "2025-01-20T13:00:00Z",
  ...
}
```

---

### Reorder Workflow Steps

```bash
curl -X PUT "${BASE_URL}/workflow-steps/workflow/${WORKFLOW_ID}/reorder" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "stepOrders": [
      { "stepId": "696d97e09fc2d8af78a5bb66", "orderIndex": 0 },
      { "stepId": "696d97ebffbe9aed3d5dc7df", "orderIndex": 1 },
      { "stepId": "696d97f69fc2d8af78a5bb6a", "orderIndex": 2 }
    ]
  }'
```

**Response:**
```json
{
  "data": [
    { "_id": "696d97e09fc2d8af78a5bb66", "orderIndex": 0, ... },
    { "_id": "696d97ebffbe9aed3d5dc7df", "orderIndex": 1, ... },
    { "_id": "696d97f69fc2d8af78a5bb6a", "orderIndex": 2, ... }
  ],
  "count": 3
}
```

---

## Execution APIs

### Get Workflow Input Schema

**Purpose:** Understand what inputs are required before executing workflow

```bash
curl -X GET "${BASE_URL}/executions/workflows/${WORKFLOW_ID}/input-schema" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Response:**
```json
{
  "workflowId": "696d95569fc2d8af78a5bb3c",
  "workflowName": "AI Gold Trader",
  "description": "Financial structuring pipeline",
  "requiredInputs": [
    {
      "stepId": "696d97e09fc2d8af78a5bb66",
      "stepName": "P1 - Spot & Forward Pricing",
      "description": "Calculate forward prices",
      "orderIndex": 0,
      "inputSchema": {
        "type": "object",
        "properties": {
          "lbma_spot_price": { "type": "number" }
        },
        "required": ["lbma_spot_price"]
      },
      "isRequired": true
    },
    {
      "stepId": "696d97ebffbe9aed3d5dc7df",
      "stepName": "P2 - Cost Modeling",
      "orderIndex": 0,
      "inputSchema": { ... },
      "isRequired": true
    }
  ]
}
```

---

### Test Single Workflow Step

**Purpose:** Validate step configuration with real LLM execution (CRITICAL for refactoring)

```bash
curl -X POST "${BASE_URL}/executions/workflows/${WORKFLOW_ID}/steps/${STEP_ID}/test" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "lbma_spot_price": 2650.50,
      "delivery_timeline_days": 90,
      "forward_curve_data": "3M: +$2.50, 6M: +$4.80, 12M: +$8.20"
    }
  }'
```

**Response (Success):**
```json
{
  "executionId": "678xyz456def789",
  "status": "completed",
  "message": "Step test completed successfully",
  "output": {
    "base_forward_price": 2654.32,
    "market_structure": "Contango",
    "calculation_method": "Linear interpolation",
    "base_currency": "USD"
  },
  "metadata": {
    "executionTime": 4200,
    "tokenUsage": {
      "total": 2847,
      "reasoning": 1234,
      "output": 1613
    },
    "finishReason": "stop"
  }
}
```

**Response (Failure - Schema Validation):**
```json
{
  "executionId": "678xyz456def789",
  "status": "failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Output does not match schema",
    "details": {
      "field": "total_operational_cost_per_oz",
      "error": "required field missing",
      "actualOutput": {
        "itemized_costs": {
          "refining": 30,
          "logistics": 15
        }
      }
    }
  }
}
```

**Response (Failure - LLM Timeout):**
```json
{
  "executionId": "678xyz456def789",
  "status": "failed",
  "error": {
    "code": "STEP_TIMEOUT",
    "message": "Step execution exceeded timeout limit",
    "timeout": 30000
  }
}
```

**Response (Warning - Truncated Output):**
```json
{
  "executionId": "678xyz456def789",
  "status": "completed",
  "output": { ... },
  "warnings": [
    {
      "code": "OUTPUT_TRUNCATED",
      "message": "LLM response truncated (finish_reason: length). Consider increasing max_tokens.",
      "recommendation": "Increase max_tokens from 1000 to 4000-8000 for thinking models"
    }
  ]
}
```

---

### Execute Complete Workflow (Async)

```bash
curl -X POST "${BASE_URL}/executions/workflows/${WORKFLOW_ID}/execute" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "696d97e09fc2d8af78a5bb66": {
        "lbma_spot_price": 2650.50,
        "delivery_timeline_days": 90
      },
      "696d97ebffbe9aed3d5dc7df": {
        "refining_contract_data": "Partner A: $30/oz"
      }
    },
    "sync": false
  }'
```

**Response:**
```json
{
  "executionId": "678xyz123abc456",
  "status": "queued",
  "message": "Workflow execution queued successfully"
}
```

**Then poll for status:**
```bash
curl -X GET "${BASE_URL}/executions/${EXECUTION_ID}/status" \
  -H "Authorization: Bearer ${TOKEN}"
```

---

### Execute Complete Workflow (Sync)

```bash
curl -X POST "${BASE_URL}/executions/workflows/${WORKFLOW_ID}/execute" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "696d97e09fc2d8af78a5bb66": { "lbma_spot_price": 2650.50 },
      "696d97ebffbe9aed3d5dc7df": { "refining_contract_data": "..." }
    },
    "sync": true
  }'
```

**Response (waits for completion):**
```json
{
  "executionId": "678xyz123abc456",
  "status": "completed",
  "message": "Workflow execution completed successfully",
  "output": {
    "base_forward_price": 2654.32,
    "market_structure": "Contango",
    "total_operational_cost_per_oz": 45,
    "optimized_sale_price": 2500,
    "net_margin_percentage": 12.5
  },
  "executionTime": 28500,
  "stepResults": [
    {
      "stepId": "696d97e09fc2d8af78a5bb66",
      "stepName": "P1 - Spot & Forward Pricing",
      "status": "completed",
      "output": { ... },
      "executionTime": 4200
    },
    {
      "stepId": "696d97ebffbe9aed3d5dc7df",
      "stepName": "P2 - Cost Modeling",
      "status": "completed",
      "output": { ... },
      "executionTime": 3800
    }
  ]
}
```

---

### Get Execution Status

```bash
curl -X GET "${BASE_URL}/executions/${EXECUTION_ID}/status" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Response:**
```json
{
  "executionId": "678xyz123abc456",
  "workflowId": "696d95569fc2d8af78a5bb3c",
  "status": "running",
  "progress": 50,
  "startedAt": "2025-01-20T11:00:00Z",
  "steps": [
    {
      "stepId": "696d97e09fc2d8af78a5bb66",
      "stepName": "P1 - Spot & Forward Pricing",
      "status": "completed",
      "progress": 100,
      "output": {
        "base_forward_price": 2654.32,
        "market_structure": "Contango"
      },
      "completedAt": "2025-01-20T11:01:30Z"
    },
    {
      "stepId": "696d97ebffbe9aed3d5dc7df",
      "stepName": "P2 - Cost Modeling",
      "status": "running",
      "progress": 45,
      "startedAt": "2025-01-20T11:01:30Z"
    }
  ]
}
```

---

## Deployment APIs

### List Deployments

```bash
curl -X GET "${BASE_URL}/deployments?page=1&limit=20" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Response:**
```json
{
  "data": [
    {
      "_id": "694970b17770c21561e515bf",
      "name": "GPT-4 Turbo - Production",
      "modelId": "507f1f77bcf86cd799439013",
      "status": "running",
      "provider": "openai",
      "createdAt": "2025-01-15T08:00:00Z"
    },
    {
      "_id": "696df12f086778fa3069129a",
      "name": "Kimi K2 - Thinking Model",
      "modelId": "507f1f77bcf86cd799439014",
      "status": "running",
      "provider": "moonshot",
      "createdAt": "2025-01-18T10:00:00Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

---

### Get Deployment Details

```bash
curl -X GET "${BASE_URL}/deployments/${DEPLOYMENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Response:**
```json
{
  "_id": "696df12f086778fa3069129a",
  "name": "Kimi K2 - Thinking Model",
  "description": "Moonshot AI Kimi K2 model for complex reasoning tasks",
  "modelId": "507f1f77bcf86cd799439014",
  "status": "running",
  "provider": "moonshot",
  "endpoint": {
    "url": "https://api.x-or.cloud/dev/aiwm-v2/deployments/696df12f086778fa3069129a/inference/v1/chat/completions",
    "description": "## Integration Guide\n\nKimi K2 is a thinking model...\n\n### Recommended Parameters\n- temperature: 0.3-0.5\n- max_tokens: 4000-8000 (REQUIRED for thinking models)"
  },
  "capabilities": {
    "supportsThinking": true,
    "maxTokens": 16000,
    "supportsStreaming": true
  }
}
```

---

## Common Usage Patterns

### Pattern 1: Review Existing Workflow

```bash
# 1. Get workflow details
WORKFLOW_ID="696d95569fc2d8af78a5bb3c"
curl -X GET "${BASE_URL}/workflows/${WORKFLOW_ID}" -H "Authorization: Bearer ${TOKEN}"

# 2. Get all workflow steps
curl -X GET "${BASE_URL}/workflow-steps/workflow/${WORKFLOW_ID}" -H "Authorization: Bearer ${TOKEN}"

# 3. For each step, get detailed config
STEP_ID="696d97e09fc2d8af78a5bb66"
curl -X GET "${BASE_URL}/workflow-steps/${STEP_ID}" -H "Authorization: Bearer ${TOKEN}"

# 4. Analyze schemas, prompts, dependencies
# 5. Document issues in ARCHITECTURE.md and REFACTOR-PLAN.md
```

---

### Pattern 2: Refactor Single Step

```bash
# 1. Get current step config
STEP_ID="696d97ebffbe9aed3d5dc7df"
curl -X GET "${BASE_URL}/workflow-steps/${STEP_ID}" -H "Authorization: Bearer ${TOKEN}" > step-before.json

# 2. Design new config (flatten schemas, translate prompts, etc.)
# Save to STEP-DESIGNS/P2-cost-modeling.json

# 3. Update step via API
curl -X PUT "${BASE_URL}/workflow-steps/${STEP_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d @STEP-DESIGNS/P2-cost-modeling.json

# 4. Test immediately
curl -X POST "${BASE_URL}/executions/workflows/${WORKFLOW_ID}/steps/${STEP_ID}/test" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "refining_contract_data": "Partner A: $30/oz refining fee",
      "logistics_route": "Shanghai to Singapore, 14 days"
    }
  }' > test-result.json

# 5. Verify output schema compliance
# 6. Document results in TEST-RESULTS.md
```

---

### Pattern 3: Test Complete Workflow

```bash
# 1. Get input schema
curl -X GET "${BASE_URL}/executions/workflows/${WORKFLOW_ID}/input-schema" \
  -H "Authorization: Bearer ${TOKEN}" > input-schema.json

# 2. Prepare test input based on schema
cat > workflow-input.json <<EOF
{
  "input": {
    "696d97e09fc2d8af78a5bb66": {
      "lbma_spot_price": 2650.50,
      "delivery_timeline_days": 90
    },
    "696d97ebffbe9aed3d5dc7df": {
      "refining_contract_data": "Partner A: $30/oz"
    }
  },
  "sync": true
}
EOF

# 3. Execute workflow
curl -X POST "${BASE_URL}/executions/workflows/${WORKFLOW_ID}/execute" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d @workflow-input.json > execution-result.json

# 4. Analyze results
# 5. Document in TEST-RESULTS.md
```

---

## Error Handling

### Authentication Errors (401)
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Token expired"
}
```
**Solution:** Get new JWT token from IAM service

### Validation Errors (400)
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "inputSchema.properties.field1",
      "message": "Invalid JSON Schema: missing 'type' field"
    }
  ]
}
```
**Solution:** Fix JSON schema validation errors

### Not Found Errors (404)
```json
{
  "statusCode": 404,
  "message": "Workflow not found",
  "id": "696d95569fc2d8af78a5bb3c"
}
```
**Solution:** Verify workflow/step IDs are correct

### Deployment Errors (502/503)
```json
{
  "statusCode": 502,
  "message": "Deployment unavailable",
  "deploymentId": "694970b17770c21561e515bf"
}
```
**Solution:** Check deployment status via `GET /deployments/:id`

---

## Tips for Agent Usage

1. **Always test after updates:** Use step test endpoint immediately after updating
2. **Check deployment status:** Verify deployment is "running" before testing
3. **Use sync execution for testing:** Easier to debug with immediate results
4. **Monitor token usage:** Thinking models use 2-3x more tokens
5. **Handle timeouts gracefully:** Increase timeout for complex reasoning tasks
6. **Validate schemas:** Use JSON Schema validators before sending to API
7. **Document everything:** Save API responses to workspace files for reference

---

## Quick Reference

| Task | Endpoint | Method |
|------|----------|--------|
| List workflows | `/workflows` | GET |
| Get workflow | `/workflows/:id` | GET |
| Get all steps | `/workflow-steps/workflow/:workflowId` | GET |
| Get step | `/workflow-steps/:id` | GET |
| Update step | `/workflow-steps/:id` | PUT |
| Test step | `/executions/workflows/:workflowId/steps/:stepId/test` | POST |
| Get input schema | `/executions/workflows/:workflowId/input-schema` | GET |
| Execute workflow | `/executions/workflows/:workflowId/execute` | POST |
| Get execution status | `/executions/:id/status` | GET |
| List deployments | `/deployments` | GET |

---

For complete API documentation, see the exploration agent report with full endpoint specifications.
