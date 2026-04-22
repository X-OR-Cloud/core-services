# AIWM - Instruction Module Proposal

## Overview

**Instruction Module** quản lý system prompts, behavioral guidelines, và task instructions cho AI Agents trong AIWM system.

## Why Do We Need It?

### Current Gap

**Agent entity hiện tại:**
```typescript
{
  agentId: string;
  capabilities: string[];    // Too generic - just list of strings
  permissions: string[];
  // ❌ No system prompts
  // ❌ No behavioral guidelines
  // ❌ No task instructions
  // ❌ No instruction versioning
}
```

**Problems:**
1. ❌ Agent không có hướng dẫn rõ ràng về cách làm việc
2. ❌ Không thể version control instructions
3. ❌ Không thể reuse instructions cho nhiều agents
4. ❌ Không thể A/B test different instructions
5. ❌ Không có template system cho common roles

### Solution: Instruction Module

**Benefits:**
- ✅ Centralized instruction management
- ✅ Version control cho prompts/guidelines
- ✅ Reusable instruction templates
- ✅ A/B testing support
- ✅ Role-based instruction library
- ✅ Easy updates without agent redeployment

---

## Entity Schema

### Instruction Entity

```typescript
{
  _id: ObjectId;
  instructionId: string;           // Unique ID (UUID)
  name: string;                    // "Customer Support Guidelines"
  description: string;
  version: string;                 // "1.2.0" (semantic versioning)

  // Type & Category
  type: string;                    // "system" | "task" | "behavior" | "template"
  category: string;                // "support" | "coding" | "analysis" | "general"
  targetRole: string;              // "assistant" | "analyst" | "reviewer"

  // Content
  content: {
    systemPrompt?: string;         // Main system prompt
    guidelines?: string[];         // List of guidelines
    constraints?: string[];        // Hard constraints (must follow)
    suggestions?: string[];        // Soft suggestions (should follow)

    // Behavioral rules
    tone?: string;                 // "professional" | "casual" | "friendly"
    language?: string;             // "en" | "vi" | "multilingual"
    formality?: string;            // "formal" | "informal"

    // Do's and Don'ts
    doList?: string[];             // Things to do
    dontList?: string[];           // Things to avoid

    // Examples
    examples?: Array<{
      input: string;
      expectedOutput: string;
      explanation?: string;
    }>;

    // Step-by-step instructions (for tasks)
    steps?: Array<{
      order: number;
      name: string;
      description: string;
      optional: boolean;
    }>;
  };

  // Metadata
  tags: string[];                  // ["customer-service", "polite", "escalation"]
  usageCount: number;              // How many agents use this
  averageRating?: number;          // User feedback (1-5)

  // Versioning
  parentInstructionId?: string;    // Previous version
  isLatestVersion: boolean;
  changelog?: string;              // What changed in this version

  // Status
  status: string;                  // "draft" | "active" | "archived" | "deprecated"
  isPublic: boolean;               // Can be used by other orgs?

  // Validation
  validationRules?: {
    maxResponseLength?: number;
    requiredKeywords?: string[];
    prohibitedKeywords?: string[];
  };

  // A/B Testing
  experimentId?: string;           // For A/B testing
  controlGroup?: boolean;          // Is this the control version?

  // Audit fields (from BaseSchema)
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Agent ↔ Instruction Relationship

**Option 1: Agent references Instructions**
```typescript
// Agent schema update
{
  agentId: string;
  name: string;

  // NEW: Instruction references
  instructions: {
    systemInstructionId: string;        // Main system prompt
    taskInstructionIds: string[];       // Task-specific instructions
    behaviorInstructionId?: string;     // Behavioral guidelines
  };

  // OLD: Keep for backward compatibility
  capabilities: string[];
  permissions: string[];
}
```

**Option 2: Many-to-Many via Junction Collection**
```typescript
// AgentInstruction collection (junction table)
{
  agentId: string;
  instructionId: string;
  priority: number;                // Order of instruction application
  isActive: boolean;               // Can temporarily disable
  appliedAt: Date;
  customizations?: {               // Agent-specific overrides
    additionalGuidelines?: string[];
    disabledConstraints?: string[];
  };
}
```

---

## API Endpoints

### Instruction CRUD

```typescript
// Create instruction
POST   /api/instructions
{
  "name": "Customer Support Agent Instructions v2",
  "type": "system",
  "category": "support",
  "targetRole": "assistant",
  "content": {
    "systemPrompt": "You are a helpful customer support agent...",
    "guidelines": [
      "Always greet customers warmly",
      "Listen actively to their concerns",
      "Provide clear, actionable solutions"
    ],
    "constraints": [
      "Never share user credentials",
      "Escalate sensitive issues to human agents",
      "Maintain professional tone at all times"
    ],
    "tone": "professional",
    "language": "vi",
    "doList": [
      "Use customer's name",
      "Apologize for inconvenience",
      "Offer alternative solutions"
    ],
    "dontList": [
      "Use technical jargon",
      "Make promises you can't keep",
      "Blame the customer"
    ]
  },
  "tags": ["support", "customer-service", "vietnamese"]
}

// Get all instructions
GET    /api/instructions?type=system&category=support&status=active

// Get instruction by ID
GET    /api/instructions/:id

// Update instruction (creates new version)
PUT    /api/instructions/:id
{
  "content": {
    "systemPrompt": "Updated prompt..."
  },
  "changelog": "Added more examples for edge cases"
}

// Delete instruction (soft delete)
DELETE /api/instructions/:id

// Get instruction versions
GET    /api/instructions/:id/versions

// Restore previous version
POST   /api/instructions/:id/restore/:versionId

// Test instruction (dry run)
POST   /api/instructions/:id/test
{
  "input": "Customer is angry about delayed shipment",
  "context": {...}
}
```

### Agent ↔ Instruction Management

```typescript
// Assign instruction to agent
POST   /api/agents/:agentId/instructions
{
  "instructionId": "inst-customer-support-v2",
  "priority": 1,
  "customizations": {
    "additionalGuidelines": [
      "Focus on VIP customers"
    ]
  }
}

// Get agent's instructions
GET    /api/agents/:agentId/instructions

// Update instruction assignment
PUT    /api/agents/:agentId/instructions/:instructionId
{
  "priority": 2,
  "isActive": false
}

// Remove instruction from agent
DELETE /api/agents/:agentId/instructions/:instructionId

// Get effective instructions (merged result)
GET    /api/agents/:agentId/instructions/effective
// Returns: Merged system + task + behavior instructions
```

### Instruction Templates

```typescript
// Get instruction templates
GET    /api/instructions/templates?role=assistant&category=support

// Create instruction from template
POST   /api/instructions/from-template/:templateId
{
  "name": "My Custom Support Instructions",
  "customizations": {
    "language": "vi",
    "companyName": "ACME Corp"
  }
}
```

### A/B Testing

```typescript
// Create A/B test experiment
POST   /api/instructions/experiments
{
  "name": "Test friendlier tone",
  "controlInstructionId": "inst-v1",
  "variantInstructionId": "inst-v2-friendly",
  "agentIds": ["agent-1", "agent-2", "agent-3"],
  "splitRatio": 0.5,              // 50/50 split
  "duration": 7                    // days
}

// Get experiment results
GET    /api/instructions/experiments/:experimentId/results
```

---

## Use Cases & Examples

### Use Case 1: Customer Support Agent

**System Instruction:**
```json
{
  "instructionId": "inst-support-v2",
  "name": "Customer Support System Prompt",
  "type": "system",
  "content": {
    "systemPrompt": "You are a professional customer support agent for ACME Corp. Your primary goal is to help customers resolve their issues quickly and efficiently while maintaining a friendly, professional demeanor.",
    "guidelines": [
      "Greet customers warmly by name",
      "Listen actively and show empathy",
      "Provide clear, step-by-step solutions",
      "Confirm issue resolution before closing"
    ],
    "constraints": [
      "Never share customer passwords or payment details",
      "Escalate to human agent if customer is upset or issue is complex",
      "Do not make refund promises - direct to billing team"
    ],
    "tone": "professional",
    "language": "vi",
    "doList": [
      "Acknowledge customer frustration",
      "Apologize for inconvenience",
      "Provide ETA for resolution",
      "Offer follow-up communication"
    ],
    "dontList": [
      "Use technical jargon",
      "Blame other departments",
      "Rush the conversation",
      "Leave issues unresolved"
    ],
    "examples": [
      {
        "input": "My order hasn't arrived yet!",
        "expectedOutput": "I sincerely apologize for the delay with your order. Let me check the status for you right away. May I have your order number?",
        "explanation": "Empathetic, action-oriented, requests needed info"
      }
    ]
  }
}
```

**Behavioral Instruction:**
```json
{
  "instructionId": "inst-behavior-polite",
  "name": "Polite & Professional Behavior",
  "type": "behavior",
  "content": {
    "tone": "professional",
    "formality": "formal",
    "doList": [
      "Use 'anh/chị' appropriately in Vietnamese",
      "Say 'xin lỗi' when appropriate",
      "End with 'Em có thể giúp gì thêm không?'"
    ],
    "dontList": [
      "Use informal pronouns (tao/mày)",
      "Use emoticons excessively",
      "Make sarcastic comments"
    ]
  }
}
```

### Use Case 2: Code Review Agent

**Task Instruction:**
```json
{
  "instructionId": "inst-task-code-review",
  "name": "Code Review Checklist",
  "type": "task",
  "category": "coding",
  "content": {
    "steps": [
      {
        "order": 1,
        "name": "Code Quality Check",
        "description": "Review code style, naming conventions, and best practices",
        "optional": false
      },
      {
        "order": 2,
        "name": "Security Audit",
        "description": "Check for SQL injection, XSS, hardcoded secrets",
        "optional": false
      },
      {
        "order": 3,
        "name": "Test Coverage",
        "description": "Verify unit tests exist and cover edge cases",
        "optional": false
      },
      {
        "order": 4,
        "name": "Performance Review",
        "description": "Check for N+1 queries, inefficient algorithms",
        "optional": true
      },
      {
        "order": 5,
        "name": "Documentation",
        "description": "Ensure complex logic is documented",
        "optional": true
      }
    ],
    "validationRules": {
      "requiredKeywords": ["✅", "❌", "⚠️"],
      "prohibitedKeywords": ["LGTM without review"]
    }
  }
}
```

### Use Case 3: Multilingual Agent

**Language Instruction:**
```json
{
  "instructionId": "inst-lang-vi-en",
  "name": "Vietnamese-English Bilingual",
  "type": "behavior",
  "content": {
    "language": "multilingual",
    "guidelines": [
      "Detect customer's preferred language from first message",
      "Respond in the same language",
      "If unsure, default to Vietnamese for Vietnamese names",
      "Can code-switch if customer does"
    ],
    "examples": [
      {
        "input": "Hello, I need help",
        "expectedOutput": "Hello! I'm happy to help you. What can I assist you with today?",
        "explanation": "Detected English, respond in English"
      },
      {
        "input": "Xin chào, em cần hỗ trợ",
        "expectedOutput": "Xin chào anh/chị! Em rất vui được hỗ trợ. Anh/chị cần em giúp gì ạ?",
        "explanation": "Detected Vietnamese, respond in Vietnamese"
      }
    ]
  }
}
```

---

## Implementation Plan

### Phase 1: Schema & CRUD (2 days)

**Tasks:**
- [ ] Create `Instruction` schema
- [ ] Create `InstructionService` (CRUD operations)
- [ ] Create `InstructionController` (REST API)
- [ ] Create DTOs (Create, Update, Query)
- [ ] Add indexes (instructionId, type, category, status)

**Files:**
```
services/aiwm/src/modules/instruction/
├── instruction.schema.ts
├── instruction.service.ts
├── instruction.controller.ts
├── instruction.dto.ts
└── instruction.module.ts
```

### Phase 2: Agent Integration (1 day)

**Tasks:**
- [ ] Update `Agent` schema with instruction references
- [ ] Create `AgentInstructionService`
- [ ] Add endpoints: assign/remove instructions
- [ ] Implement instruction merging logic (effective instructions)

**Files:**
```
services/aiwm/src/modules/agent/
├── agent.schema.ts                    # Update
├── agent-instruction.service.ts       # New
└── agent.controller.ts                # Add endpoints
```

### Phase 3: Versioning & Templates (1 day)

**Tasks:**
- [ ] Implement instruction versioning
- [ ] Create template library
- [ ] Add version restore functionality
- [ ] Create common templates (support, coding, analysis)

### Phase 4: Testing & Documentation (1 day)

**Tasks:**
- [ ] Unit tests for InstructionService
- [ ] Integration tests for Agent ↔ Instruction
- [ ] API documentation
- [ ] Usage examples

**Total:** 5 days

---

## Database Schema

### MongoDB Collections

**instructions:**
```javascript
{
  _id: ObjectId("..."),
  instructionId: "inst-support-v2",
  name: "Customer Support Instructions v2",
  type: "system",
  category: "support",
  content: {
    systemPrompt: "...",
    guidelines: [...],
    constraints: [...]
  },
  version: "2.0.0",
  parentInstructionId: "inst-support-v1",
  isLatestVersion: true,
  status: "active",
  owner: { orgId: "...", userId: "..." },
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

**Indexes:**
```javascript
db.instructions.createIndex({ instructionId: 1 }, { unique: true });
db.instructions.createIndex({ type: 1, category: 1, status: 1 });
db.instructions.createIndex({ "owner.orgId": 1, status: 1 });
db.instructions.createIndex({ parentInstructionId: 1 });
db.instructions.createIndex({ isLatestVersion: 1, status: 1 });
```

**agent_instructions (junction table):**
```javascript
{
  _id: ObjectId("..."),
  agentId: "agent-001",
  instructionId: "inst-support-v2",
  priority: 1,
  isActive: true,
  customizations: {
    additionalGuidelines: [...]
  },
  appliedAt: ISODate("..."),
  owner: { orgId: "...", userId: "..." }
}
```

**Indexes:**
```javascript
db.agent_instructions.createIndex({ agentId: 1, instructionId: 1 }, { unique: true });
db.agent_instructions.createIndex({ agentId: 1, priority: 1 });
db.agent_instructions.createIndex({ instructionId: 1 });
```

---

## Integration with Execution

When executing agent tasks, instructions are merged and sent to worker:

**Execution Flow:**
```typescript
// 1. Create execution for agent task
POST /api/executions
{
  "category": "agent",
  "type": "agent-chat",
  "resourceType": "agent",
  "resourceId": "agent-001",
  "steps": [
    {
      "index": 0,
      "name": "Load agent instructions",
      "command": {
        "type": "agent.loadInstructions",
        "resource": { type: "agent", id: "agent-001" }
      }
    },
    {
      "index": 1,
      "name": "Execute chat",
      "command": {
        "type": "agent.execute",
        "resource": { type: "agent", id: "agent-001" },
        "data": {
          "userMessage": "Hello",
          "instructions": {
            // Merged effective instructions from step 0
          }
        }
      },
      "dependsOn": [0]
    }
  ]
}

// 2. ExecutionOrchestrator merges instructions
const effectiveInstructions = await instructionService.getEffectiveInstructions(agentId);
// Returns:
{
  systemPrompt: "...",        // From system instruction
  guidelines: [...],          // Merged from all instructions
  constraints: [...],         // Hard constraints from all
  tone: "professional",       // From behavior instruction
  steps: [...]                // From task instruction
}

// 3. Worker receives merged instructions
// 4. Worker applies instructions when executing agent
```

---

## Benefits for AIWM System

### 1. **Centralized Management**
- All agent instructions in one place
- Easy to update across multiple agents
- Version control for all changes

### 2. **Reusability**
- Create instruction templates for common roles
- Share instructions across agents
- Reduce duplication

### 3. **Flexibility**
- A/B test different instruction variants
- Customize instructions per agent
- Easy rollback to previous versions

### 4. **Scalability**
- Add new instruction types without schema changes
- Support multi-language instructions
- Handle complex instruction hierarchies

### 5. **Compliance & Audit**
- Track who created/updated instructions
- Maintain changelog for all versions
- Ensure agents follow company policies

---

## Example: Creating a Support Agent with Instructions

```bash
# 1. Create system instruction
curl -X POST http://localhost:3003/api/instructions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support System Prompt",
    "type": "system",
    "category": "support",
    "content": {
      "systemPrompt": "You are a professional customer support agent...",
      "guidelines": ["Greet warmly", "Show empathy"],
      "constraints": ["Never share credentials"]
    }
  }'
# Response: { instructionId: "inst-sys-001" }

# 2. Create behavioral instruction
curl -X POST http://localhost:3003/api/instructions \
  -d '{
    "name": "Polite Vietnamese Behavior",
    "type": "behavior",
    "content": {
      "tone": "professional",
      "language": "vi",
      "doList": ["Use anh/chị"],
      "dontList": ["Use slang"]
    }
  }'
# Response: { instructionId: "inst-behav-001" }

# 3. Create agent
curl -X POST http://localhost:3003/api/agents \
  -d '{
    "agentId": "agent-support-001",
    "name": "Customer Support Agent",
    "role": "assistant"
  }'

# 4. Assign instructions to agent
curl -X POST http://localhost:3003/api/agents/agent-support-001/instructions \
  -d '{
    "instructionId": "inst-sys-001",
    "priority": 1
  }'

curl -X POST http://localhost:3003/api/agents/agent-support-001/instructions \
  -d '{
    "instructionId": "inst-behav-001",
    "priority": 2
  }'

# 5. Get effective instructions for agent
curl http://localhost:3003/api/agents/agent-support-001/instructions/effective
# Response: Merged instructions from both inst-sys-001 and inst-behav-001
```

---

## Comparison with Other Approaches

### Approach 1: Instructions in Agent Schema (Current)
```typescript
// ❌ Problems
{
  agentId: "agent-001",
  capabilities: ["chat", "email"],  // Too generic
  // No version control
  // No reusability
  // Hard to update multiple agents
}
```

### Approach 2: Hardcoded in Code
```typescript
// ❌ Problems
const SYSTEM_PROMPT = "You are...";  // In code
// No runtime updates
// No A/B testing
// Requires redeployment
```

### Approach 3: Instruction Module (Proposed)
```typescript
// ✅ Benefits
{
  instructionId: "inst-001",
  version: "2.0.0",
  content: { systemPrompt: "..." },
  // Runtime updates
  // Version control
  // Reusable
  // A/B testable
}
```

---

## Conclusion

**Instruction Module** là một missing piece quan trọng trong AIWM system. Nó giải quyết vấn đề:

1. ✅ Agent thiếu hướng dẫn rõ ràng
2. ✅ Không version control được prompts
3. ✅ Không reuse được instructions
4. ✅ Không A/B test được
5. ✅ Phải redeploy để update instructions

**Recommendation:**
- **Priority:** HIGH
- **Complexity:** MEDIUM
- **Timeline:** 5 days
- **Dependencies:** Agent module (already exists)
- **Should be:** Phase 6 or earlier

---

**Document Version:** 1.0
**Created:** 2025-11-16
**Status:** Proposal - Pending Approval
