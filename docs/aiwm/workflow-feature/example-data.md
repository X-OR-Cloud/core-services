# Example Data: Option A - Extend Execution Module

This document provides concrete examples of how Workflow feature integrates with the existing Execution module.

## Use Case: Gold Trading Analysis Workflow

This example shows a complete workflow that:
1. Fetches gold price from API
2. Analyzes trend using LLM (GPT-4)
3. Checks price threshold with rule
4. Generates formatted report
5. Sends notification if price is high

---

## 1. Workflow Template (New Collection)

**Collection**: `workflows`

```json
{
  "_id": "6789abcd1234567890abcdef",
  "name": "Gold Trading Analysis",
  "description": "Daily automated analysis of gold price trends with LLM insights",
  "version": "v1.0",
  "status": "active",
  "executionMode": "internal",
  "tags": ["trading", "finance", "automation"],

  "triggers": {
    "schedule": { // QUESTION: anh sẽ làm làm 1 module scheduler riêng về sau, ý tưởng là scheduler này sẽ trigger vào workflow, vào agent, nên có lẽ ko để trigger ở đây.
      "cron": "0 9 * * *",
      "timezone": "Asia/Ho_Chi_Minh",
      "enabled": true
    },
    "manual": true, // COMMENT: manual khác api như thế nào?
    "api": true
  },

  "settings": { // comment: trong các step đều có errorHandling chắc tạm thời chưa cần timeout và retry cho cả workflow tại phiên bản tối thiểu này.
    "timeout": 300, 
    "maxRetries": 2, 
    "notifyOnFailure": true
  },

  "owner": {
    "orgId": "org_001",
    "userId": "user_001"
  },

  "createdAt": "2025-01-10T10:00:00Z",
  "updatedAt": "2025-01-10T10:00:00Z"
}
```

---

## 2. WorkflowStep Templates (New Collection)

**Collection**: `workflow_steps`

### Step 1: Fetch Gold Price (Tool Call)

```json
{
  "_id": "step_6789abc001", // COMMENT: _id là object id mongodb nhé
  "workflowId": "6789abcd1234567890abcdef",
  "orderIndex": 0,
  "name": "Fetch Gold Price",
  "description": "Retrieve current gold price from external API",

  "stepType": "tool", // COMMENT: đổi thành type cho gọn, vì đang trong entity step rồi
  "toolConfig": {
    "toolId": "tool_gold_price_api",
    "method": "GET",
    "endpoint": "https://api.goldprice.org/v1/current",
    "headers": {
      "Authorization": "Bearer {{env.GOLD_API_KEY}}"
    },
    "timeout": 10000
  },

  "inputSchema": {
    "type": "object",
    "properties": {
      "currency": { "type": "string", "default": "USD" }
    }
  }, // COMMENT với step có orderIndex = 0 thì input này sẽ là input của Workflow? ví dụ khi trigger qua api, thì sẽ phải input các thông tin này vào endpoint trigger?

  "outputSchema": {
    "type": "object",
    "properties": {
      "price": { "type": "number" },
      "timestamp": { "type": "string" },
      "currency": { "type": "string" }
    }
  }, // Comment: đã có output schema rồi có cần thiết có outputMapping không, ở phiên bản tối thiểu có thể loại bỏ các việc mapping được không?

  "outputMapping": {
    "currentPrice": "$.price",
    "priceTimestamp": "$.timestamp",
    "currency": "$.currency"
  },

  "dependencies": [],
  "optional": false, // Comment: ở phiên bản tối thiểu chưa cần phần này
  "errorHandling": {
    "maxRetries": 3,
    "retryDelayMs": 5000,
    "continueOnError": false
  }
}
```

### Step 2: Analyze Trend with LLM

```json
{
  "_id": "step_6789abc002",
  "workflowId": "6789abcd1234567890abcdef",
  "orderIndex": 1,
  "name": "Analyze Market Trend",
  "description": "Use LLM to analyze gold price trend and provide insights",

  "stepType": "llm",
  "llmConfig": {
    "deploymentId": "deployment_gpt4_prod",
    "modelIdentifier": "gpt-4.1-turbo",
    "systemPrompt": "You are an expert gold trading analyst with 20 years of experience. Analyze the provided gold price data and give insights on market trends, potential movements, and trading recommendations. Be concise and data-driven.",
    "userPromptTemplate": "Current gold price: {{currentPrice}} {{currency}} as of {{priceTimestamp}}. Please analyze the trend and provide trading insights.", // comment: có cần làm template như vậy trong phiên bản tối thiểu của workflow không, userPrompt đơn thuần sẽ là input data vào cho step thôi?
    "parameters": {
      "temperature": 0.3,
      "max_tokens": 500,
      "top_p": 0.9
    },
    "timeout": 30000
  },

  "inputMapping": { // comment: như comment ở step trước, a nghĩ chúng ta chưa cần mapping input và output, chỉ cần có schema để validate inpute và output là đủ, cơ bản output của bước trước phải match với input của bước sau.
    "currentPrice": "$.step_0.currentPrice",
    "priceTimestamp": "$.step_0.priceTimestamp",
    "currency": "$.step_0.currency"
  },

  "outputMapping": {
    "analysis": "$.content",
    "tokensUsed": "$.usage.total_tokens"
  },

  "dependencies": [0], // comment:nếu không có dependencies có nghĩa là cho dù step 0 có lỗi, thì step này vẫn chạy phải không? 
  "optional": false,
  "errorHandling": {
    "maxRetries": 2,
    "retryDelayMs": 10000,
    "continueOnError": false
  }
}
```

### Step 3: Check Price Threshold (Rule)

```json
{
  "_id": "step_6789abc003",
  "workflowId": "6789abcd1234567890abcdef",
  "orderIndex": 2,
  "name": "Check Price Threshold",
  "description": "Evaluate if gold price exceeds alert threshold",

  "stepType": "rule", // comment: tạm thời phiên bản hiện tại chúng ta chưa làm rule engin, nên type này tạm thời chưa cần xử lý
  "ruleConfig": {
    "engine": "jsonlogic",
    "condition": {
      ">": [
        { "var": "currentPrice" },
        2000
      ]
    },
    "actions": {
      "onTrue": {
        "alertLevel": "high",
        "sendNotification": true,
        "message": "Gold price exceeded $2000 threshold"
      },
      "onFalse": {
        "alertLevel": "normal",
        "sendNotification": false,
        "message": "Gold price within normal range"
      }
    }
  },

  "inputMapping": {
    "currentPrice": "$.step_0.currentPrice"
  },

  "outputMapping": {
    "alertLevel": "$.alertLevel",
    "shouldNotify": "$.sendNotification",
    "alertMessage": "$.message"
  },

  "dependencies": [0],
  "optional": false
}
```

### Step 4: Generate Report (Transform)

```json
{
  "_id": "step_6789abc004",
  "workflowId": "6789abcd1234567890abcdef",
  "orderIndex": 3,
  "name": "Generate Report",
  "description": "Format analysis results into structured report",

  "stepType": "transform", // comment: tạm thời phiên bản hiện tại chúng ta chưa làm rule engin, nên type này tạm thời chưa cần xử lý
  "transformConfig": {
    "operation": "template",
    "template": {
      "reportTitle": "Gold Trading Analysis Report",
      "date": "{{priceTimestamp}}",
      "summary": {
        "currentPrice": "{{currentPrice}} {{currency}}",
        "alertLevel": "{{alertLevel}}",
        "aiAnalysis": "{{analysis}}"
      },
      "recommendations": "{{analysis}}",
      "metadata": {
        "workflowVersion": "v1.0",
        "tokensUsed": "{{tokensUsed}}",
        "generatedAt": "{{now}}"
      }
    }
  },

  "inputMapping": {
    "currentPrice": "$.step_0.currentPrice",
    "currency": "$.step_0.currency",
    "priceTimestamp": "$.step_0.priceTimestamp",
    "analysis": "$.step_1.analysis",
    "tokensUsed": "$.step_1.tokensUsed",
    "alertLevel": "$.step_2.alertLevel"
  },

  "outputMapping": {
    "report": "$"
  },

  "dependencies": [0, 1, 2],
  "optional": false
}
```

### Step 5: Send Notification (Conditional Tool)

```json
{
  "_id": "step_6789abc005",
  "workflowId": "6789abcd1234567890abcdef",
  "orderIndex": 4,
  "name": "Send Notification",
  "description": "Send email notification if alert level is high",

  "stepType": "tool",
  "toolConfig": {
    "toolId": "tool_email_service",
    "method": "POST",
    "endpoint": "https://api.emailservice.com/v1/send",
    "headers": {
      "Authorization": "Bearer {{env.EMAIL_API_KEY}}",
      "Content-Type": "application/json"
    },
    "bodyTemplate": {
      "to": "traders@company.com",
      "subject": "Gold Price Alert: {{alertLevel}}",
      "body": "{{report}}",
      "priority": "high"
    },
    "condition": {
      "if": "{{shouldNotify}}",
      "then": "execute",
      "else": "skip"
    }
  },

  "inputMapping": {
    "alertLevel": "$.step_2.alertLevel",
    "shouldNotify": "$.step_2.shouldNotify",
    "report": "$.step_3.report"
  },

  "outputMapping": {
    "emailSent": "$.success",
    "messageId": "$.messageId"
  },

  "dependencies": [2, 3],
  "optional": true,
  "errorHandling": {
    "maxRetries": 2,
    "continueOnError": true
  }
}
```

---

## 3. Execution (Extended Existing Collection)

**Collection**: `executions` (Extended schema)

### When Workflow is Triggered

```json
{
  "_id": "exec_789def456",
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",

  "// NEW FIELDS FOR WORKFLOW": "👇",
  "executionType": "workflow",
  "workflowId": "6789abcd1234567890abcdef",
  "workflowVersion": "v1.0",
  "workflowSnapshot": {
    "name": "Gold Trading Analysis",
    "steps": ["... full snapshot of workflow_steps at trigger time ..."]
  },
  "triggerType": "schedule",
  "triggerMetadata": {
    "scheduledTime": "2025-01-13T09:00:00Z",
    "actualTime": "2025-01-13T09:00:02Z"
  },

  "// EXISTING FIELDS": "👇",
  "name": "Gold Trading Analysis - Daily Run",
  "type": "workflow", // comment: trùng lặp giữa type và executionType?
  "category": "trading", // comment: bỏ trường này đễ đỡ phức tạp cho phiên bản mvp
  "status": "running",
  "progress": 40, // comment: progress sẽ tự tính toàn khi mỗi step được thay đổi phải khong

  "context": { // comment: context có cần thiết cho phiên bản MVP đầu tiên cho Workflow không?
    "orgId": "org_001",
    "userId": "user_001",
    "environment": "production"
  },

  "input": {
    "currency": "USD"
  },

  "steps": [
    "... see ExecutionStep examples below ..."
  ], // comment: đã có execution step entity riêng rồi có cần thiết trường này không?

  "primaryNodeId": null, // comment: tạm thời chưa cần xư lý xác định node triển khai
  "involvedNodeIds": [],// comment: tạm thời chưa cần xư lý xác định node triển khai

  "timing": {
    "startedAt": "2025-01-13T09:00:02Z",
    "completedAt": null,
    "timeoutSeconds": 300,
    "timeoutAt": "2025-01-13T09:05:02Z"
  },

  "retry": {
    "retryCount": 0,
    "maxRetries": 2,
    "retryAttempts": []
  },

  "result": null, // comment: resut ở đây là gì?
  "error": null,

  "owner": {
    "orgId": "org_001",
    "userId": "user_001"
  },

  "createdAt": "2025-01-13T09:00:02Z",
  "updatedAt": "2025-01-13T09:01:45Z"
}
```

---

## 4. ExecutionStep (Extended Existing Embedded Schema)

### Step 0: Fetch Gold Price (Running)

```json
{
  "index": 0,
  "name": "Fetch Gold Price",
  "status": "completed",
  "progress": 100,

  "// NEW FIELD": "👇",
  "stepType": "tool",

  "// FOR TOOL TYPE": "👇",
  "toolConfig": {
    "toolId": "tool_gold_price_api",
    "method": "GET",
    "endpoint": "https://api.goldprice.org/v1/current"
  },

  "input": {
    "currency": "USD"
  },

  "output": {
    "price": 2050.75,
    "timestamp": "2025-01-13T09:00:15Z",
    "currency": "USD",
    "change24h": 15.25,
    "changePercent": 0.75
  },

  "dependencies": [],
  "optional": false,

  "timing": {
    "startedAt": "2025-01-13T09:00:02Z",
    "completedAt": "2025-01-13T09:00:15Z",
    "durationMs": 13000
  },

  "result": {
    "success": true,
    "statusCode": 200
  },

  "error": null,

  "metadata": {
    "apiResponseTime": 2500,
    "retryCount": 0
  }
}
```

### Step 1: Analyze Trend with LLM (Running)

```json
{
  "index": 1,
  "name": "Analyze Market Trend",
  "status": "running",
  "progress": 50,

  "stepType": "llm",

  "llmConfig": {
    "deploymentId": "deployment_gpt4_prod",
    "modelIdentifier": "gpt-4.1-turbo",
    "systemPrompt": "You are an expert gold trading analyst...",
    "parameters": {
      "temperature": 0.3,
      "max_tokens": 500
    }
  },

  "input": {
    "currentPrice": 2050.75,
    "priceTimestamp": "2025-01-13T09:00:15Z",
    "currency": "USD",
    "userPrompt": "Current gold price: 2050.75 USD as of 2025-01-13T09:00:15Z. Please analyze the trend and provide trading insights."
  },

  "output": null,

  "dependencies": [0],
  "optional": false,

  "timing": {
    "startedAt": "2025-01-13T09:00:16Z",
    "completedAt": null,
    "durationMs": null
  },

  "result": null,
  "error": null,

  "metadata": {
    "llmRequestId": "req_abc123",
    "estimatedTokens": 350
  }
}
```

### Step 2: Check Price Threshold (Pending)

```json
{
  "index": 2,
  "name": "Check Price Threshold",
  "status": "pending",
  "progress": 0,

  "stepType": "rule",

  "ruleConfig": {
    "engine": "jsonlogic",
    "condition": {
      ">": [{ "var": "currentPrice" }, 2000]
    }
  },

  "input": null,
  "output": null,

  "dependencies": [0],
  "optional": false,

  "timing": {
    "startedAt": null,
    "completedAt": null,
    "durationMs": null
  },

  "result": null,
  "error": null
}
```

### Step 3: Generate Report (Pending)

```json
{
  "index": 3,
  "name": "Generate Report",
  "status": "pending",
  "progress": 0,

  "stepType": "transform",

  "transformConfig": {
    "operation": "template",
    "template": {
      "reportTitle": "Gold Trading Analysis Report",
      "date": "{{priceTimestamp}}",
      "summary": { "..." : "..." }
    }
  },

  "input": null,
  "output": null,

  "dependencies": [0, 1, 2],
  "optional": false,

  "timing": {
    "startedAt": null,
    "completedAt": null,
    "durationMs": null
  },

  "result": null,
  "error": null
}
```

### Step 4: Send Notification (Pending)

```json
{
  "index": 4,
  "name": "Send Notification",
  "status": "pending",
  "progress": 0,

  "stepType": "tool",

  "toolConfig": {
    "toolId": "tool_email_service",
    "method": "POST",
    "condition": {
      "if": "{{shouldNotify}}",
      "then": "execute",
      "else": "skip"
    }
  },

  "input": null,
  "output": null,

  "dependencies": [2, 3],
  "optional": true,

  "timing": {
    "startedAt": null,
    "completedAt": null,
    "durationMs": null
  },

  "result": null,
  "error": null
}
```

---

## 5. Complete Execution After All Steps

```json
{
  "_id": "exec_789def456",
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",

  "executionType": "workflow",
  "workflowId": "6789abcd1234567890abcdef",
  "workflowVersion": "v1.0",
  "triggerType": "schedule",

  "name": "Gold Trading Analysis - Daily Run",
  "status": "completed",
  "progress": 100,

  "steps": [
    {
      "index": 0,
      "name": "Fetch Gold Price",
      "status": "completed",
      "stepType": "tool",
      "output": {
        "price": 2050.75,
        "timestamp": "2025-01-13T09:00:15Z",
        "currency": "USD"
      },
      "timing": {
        "startedAt": "2025-01-13T09:00:02Z",
        "completedAt": "2025-01-13T09:00:15Z",
        "durationMs": 13000
      }
    },
    {
      "index": 1,
      "name": "Analyze Market Trend",
      "status": "completed",
      "stepType": "llm",
      "output": {
        "content": "Based on the current gold price of $2050.75 USD, the market shows a bullish trend with a 0.75% increase in the last 24 hours. The price has broken above the $2000 psychological barrier, indicating strong buying pressure. Key factors: 1) Economic uncertainty driving safe-haven demand, 2) Weakening USD creating favorable conditions, 3) Technical indicators suggest continued upward momentum. Recommendation: Consider taking profits on existing long positions while maintaining core holdings. Watch for resistance at $2080.",
        "usage": {
          "prompt_tokens": 125,
          "completion_tokens": 145,
          "total_tokens": 270
        }
      },
      "timing": {
        "startedAt": "2025-01-13T09:00:16Z",
        "completedAt": "2025-01-13T09:01:05Z",
        "durationMs": 49000
      }
    },
    {
      "index": 2,
      "name": "Check Price Threshold",
      "status": "completed",
      "stepType": "rule",
      "output": {
        "alertLevel": "high",
        "sendNotification": true,
        "message": "Gold price exceeded $2000 threshold"
      },
      "timing": {
        "startedAt": "2025-01-13T09:01:06Z",
        "completedAt": "2025-01-13T09:01:06Z",
        "durationMs": 50
      }
    },
    {
      "index": 3,
      "name": "Generate Report",
      "status": "completed",
      "stepType": "transform",
      "output": {
        "report": {
          "reportTitle": "Gold Trading Analysis Report",
          "date": "2025-01-13T09:00:15Z",
          "summary": {
            "currentPrice": "2050.75 USD",
            "alertLevel": "high",
            "aiAnalysis": "Based on the current gold price of $2050.75 USD, the market shows a bullish trend..."
          },
          "recommendations": "Consider taking profits on existing long positions while maintaining core holdings. Watch for resistance at $2080.",
          "metadata": {
            "workflowVersion": "v1.0",
            "tokensUsed": 270,
            "generatedAt": "2025-01-13T09:01:07Z"
          }
        }
      },
      "timing": {
        "startedAt": "2025-01-13T09:01:07Z",
        "completedAt": "2025-01-13T09:01:08Z",
        "durationMs": 1000
      }
    },
    {
      "index": 4,
      "name": "Send Notification",
      "status": "completed",
      "stepType": "tool",
      "output": {
        "success": true,
        "messageId": "msg_xyz789",
        "emailSent": true
      },
      "timing": {
        "startedAt": "2025-01-13T09:01:09Z",
        "completedAt": "2025-01-13T09:01:12Z",
        "durationMs": 3000
      }
    }
  ],

  "timing": {
    "startedAt": "2025-01-13T09:00:02Z",
    "completedAt": "2025-01-13T09:01:12Z",
    "totalDurationMs": 70000
  },

  "result": {
    "success": true,
    "summary": {
      "stepsCompleted": 5,
      "stepsFailed": 0,
      "stepsSkipped": 0,
      "totalTokensUsed": 270,
      "totalCost": 0.0054,
      "alertsTriggered": 1
    },
    "finalOutput": {
      "report": "... full report object ...",
      "notificationSent": true
    }
  },

  "error": null,

  "createdAt": "2025-01-13T09:00:02Z",
  "updatedAt": "2025-01-13T09:01:12Z"
}
```

---

## 6. Schema Comparison: Before vs After

### Before (Current Execution Schema)

```typescript
interface Execution {
  executionId: string;
  name: string;
  type: string;
  category: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: ExecutionStep[];
  primaryNodeId?: string;
  // ... other fields
}

interface ExecutionStep {
  index: number;
  name: string;
  status: string;
  command?: string;      // For node worker commands
  nodeId?: string;
  dependencies: number[];
  // ... other fields
}
```

### After (Extended for Workflow)

```typescript
interface Execution {
  // EXISTING FIELDS
  executionId: string;
  name: string;
  type: string;
  category: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: ExecutionStep[];
  primaryNodeId?: string;

  // NEW FIELDS FOR WORKFLOW
  executionType: 'deployment' | 'workflow';
  workflowId?: string;
  workflowVersion?: string;
  workflowSnapshot?: {
    name: string;
    steps: WorkflowStepTemplate[];
  };
  triggerType?: 'manual' | 'api' | 'schedule' | 'webhook';
  triggerMetadata?: any;
  // ... other fields
}

interface ExecutionStep {
  // EXISTING FIELDS
  index: number;
  name: string;
  status: string;
  dependencies: number[];
  optional?: boolean;

  // EXTENDED FIELD
  stepType: 'command' | 'llm' | 'rule' | 'transform' | 'tool' | 'agent';

  // FOR DEPLOYMENT (existing)
  command?: string;
  nodeId?: string;

  // FOR WORKFLOW (new)
  llmConfig?: {
    deploymentId: string;
    modelIdentifier: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    parameters: any;
    timeout?: number;
  };

  ruleConfig?: {
    engine: 'jsonlogic' | 'custom';
    condition: any;
    actions: {
      onTrue: any;
      onFalse: any;
    };
  };

  transformConfig?: {
    operation: 'template' | 'map' | 'filter' | 'aggregate';
    template?: any;
    script?: string;
  };

  toolConfig?: {
    toolId: string;
    method: string;
    endpoint: string;
    headers?: any;
    bodyTemplate?: any;
    condition?: any;
  };

  // Data mapping
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;

  // Error handling
  errorHandling?: {
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnError?: boolean;
  };

  // ... other fields
}
```

---

## 7. API Request Examples

### Create Workflow

```http
POST /workflows
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Gold Trading Analysis",
  "description": "Daily automated analysis of gold price trends",
  "version": "v1.0",
  "status": "active",
  "executionMode": "internal",
  "triggers": {
    "schedule": {
      "cron": "0 9 * * *",
      "timezone": "Asia/Ho_Chi_Minh"
    },
    "manual": true
  },
  "settings": {
    "timeout": 300,
    "maxRetries": 2
  }
}
```

### Add Workflow Steps

```http
POST /workflows/6789abcd1234567890abcdef/steps
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "steps": [
    {
      "orderIndex": 0,
      "name": "Fetch Gold Price",
      "stepType": "tool",
      "toolConfig": { "..." },
      "dependencies": []
    },
    {
      "orderIndex": 1,
      "name": "Analyze Market Trend",
      "stepType": "llm",
      "llmConfig": { "..." },
      "dependencies": [0]
    }
    // ... more steps
  ]
}
```

### Trigger Workflow

```http
POST /workflows/6789abcd1234567890abcdef/runs
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "input": {
    "currency": "USD"
  },
  "context": {
    "environment": "production"
  }
}

// Response
{
  "success": true,
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",
  "status": "pending",
  "message": "Workflow execution started"
}
```

### Get Execution Status

```http
GET /executions/exec-uuid-12345678-abcd-1234-5678-123456789abc
Authorization: Bearer <jwt_token>

// Response
{
  "executionId": "exec-uuid-12345678-abcd-1234-5678-123456789abc",
  "executionType": "workflow",
  "workflowId": "6789abcd1234567890abcdef",
  "status": "running",
  "progress": 40,
  "steps": [
    {
      "index": 0,
      "name": "Fetch Gold Price",
      "status": "completed",
      "progress": 100
    },
    {
      "index": 1,
      "name": "Analyze Market Trend",
      "status": "running",
      "progress": 50
    }
    // ...
  ]
}
```

### Get Step Details

```http
GET /executions/exec-uuid-12345678-abcd-1234-5678-123456789abc/steps/1
Authorization: Bearer <jwt_token>

// Response
{
  "index": 1,
  "name": "Analyze Market Trend",
  "status": "running",
  "stepType": "llm",
  "input": {
    "currentPrice": 2050.75,
    "priceTimestamp": "2025-01-13T09:00:15Z"
  },
  "output": null,
  "timing": {
    "startedAt": "2025-01-13T09:00:16Z",
    "completedAt": null,
    "durationMs": null
  }
}
```

---

## 8. Key Benefits of Option A

### 1. Code Reuse

```typescript
// ExecutionOrchestrator can handle BOTH deployment and workflow
class ExecutionOrchestrator {
  async processStep(execution: Execution, step: ExecutionStep) {
    switch (step.stepType) {
      case 'command':
        return this.executeNodeCommand(step);  // Existing
      case 'llm':
        return this.executeLLMStep(step);       // New
      case 'rule':
        return this.executeRuleStep(step);      // New
      case 'transform':
        return this.executeTransformStep(step); // New
      case 'tool':
        return this.executeToolStep(step);      // New
    }
  }
}
```

### 2. Unified Monitoring

```typescript
// Single dashboard for all executions
GET /executions?executionType=workflow
GET /executions?executionType=deployment

// Same status tracking, same retry logic, same audit trail
```

### 3. Consistent Data Model

```typescript
// All executions follow same structure
interface Execution {
  executionId: string;
  status: ExecutionStatus;
  steps: ExecutionStep[];
  timing: TimingInfo;
  result: ExecutionResult;
}

// Easy to query, easy to aggregate, easy to report
```

### 4. Backward Compatible

```typescript
// Old deployments still work
const deployment = await executionService.create({
  executionType: 'deployment',  // Default if not specified
  type: 'model_deployment',
  steps: [
    { stepType: 'command', command: 'download_model', ... }
  ]
});

// New workflows use extended features
const workflow = await executionService.create({
  executionType: 'workflow',
  workflowId: 'wf_123',
  steps: [
    { stepType: 'llm', llmConfig: { ... } }
  ]
});
```

---

## Summary

**Option A** extends the existing `Execution` module to support workflows:

- ✅ **Minimal new collections**: Only `workflows` and `workflow_steps` (templates)
- ✅ **Reuse existing orchestration**: ExecutionOrchestrator handles both deployment and workflow
- ✅ **Unified data model**: All executions in one collection with `executionType` discriminator
- ✅ **Backward compatible**: Existing deployments continue to work
- ✅ **Consistent API**: Same `/executions` endpoints for monitoring
- ✅ **Less code duplication**: Single retry logic, single dependency graph, single event system

**Key Concept**: Workflow is just a special type of Execution with:
- Template-based creation (from `workflows` collection)
- Different step types (`llm`, `rule`, `transform` instead of just `command`)
- Trigger mechanisms (`schedule`, `api`, `webhook`)
- Input/output mapping between steps
