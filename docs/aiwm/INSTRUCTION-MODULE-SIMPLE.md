# AIWM - Instruction Module (MVP - Simple Version)

## Overview

**Simplified Instruction Module** - Phiên bản đơn giản nhất để quản lý system prompts và guidelines cho AI Agents.

## Core Principle: Keep It Simple

**MVP Goal:** Cho Agent biết "mình là ai" và "làm việc như thế nào"

**NOT Goal (for MVP):**
- ❌ Complex versioning system
- ❌ A/B testing
- ❌ Template marketplace
- ❌ Advanced validation
- ❌ Multi-tenant sharing

---

## Entity Schema (Simplified)

### Instruction Entity

```typescript
{
  _id: ObjectId;
  instructionId: string;           // Unique ID (UUID) - for reference

  // Basic Info
  name: string;                    // "Customer Support Instructions"
  description?: string;            // Optional short description

  // Content (SIMPLIFIED - just essential fields)
  systemPrompt: string;            // Main system prompt (REQUIRED)
  guidelines?: string[];           // Simple bullet points (OPTIONAL)

  // Metadata (minimal)
  tags?: string[];                 // For search/filter
  isActive: boolean;               // Can enable/disable

  // Audit (from BaseSchema)
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
}
```

**That's it!** Không cần:
- ❌ Type/Category (có thể add sau)
- ❌ Version tracking
- ❌ Examples array
- ❌ Steps array
- ❌ Validation rules
- ❌ A/B testing fields

### Agent Schema Update (Minimal Change)

```typescript
// Agent schema - Add ONE field
{
  agentId: string;
  name: string;
  description: string;
  role: string;
  status: string;
  capabilities: string[];

  // NEW: Simple reference to instruction
  instructionId?: string;          // Optional - references Instruction._id or instructionId

  // Keep existing fields
  nodeId: string;
  totalTasks: number;
  // ... other fields
}
```

**Simple relationship:** 1 Agent → 0 or 1 Instruction (optional)

---

## API Endpoints (Minimal)

### Basic CRUD

```typescript
// Create instruction
POST   /api/instructions
{
  "name": "Customer Support Agent",
  "systemPrompt": "You are a helpful customer support agent. Be polite, empathetic, and solve problems efficiently.",
  "guidelines": [
    "Always greet the customer warmly",
    "Listen to their concerns before responding",
    "Provide clear, actionable solutions",
    "Never share sensitive information"
  ],
  "tags": ["support", "customer-service"]
}

// Response
{
  "_id": "68f123...",
  "instructionId": "inst-abc123",
  "name": "Customer Support Agent",
  "systemPrompt": "You are a helpful...",
  "guidelines": [...],
  "isActive": true,
  "createdAt": "2025-11-16T10:00:00Z"
}

// Get all instructions (with pagination & filters)
GET    /api/instructions
GET    /api/instructions?page=1&limit=10&filter[isActive]=true&filter[tags]=support

// Get by ID
GET    /api/instructions/:id

// Update instruction
PUT    /api/instructions/:id
{
  "systemPrompt": "Updated prompt...",
  "guidelines": ["Updated guideline 1", "New guideline 2"]
}

// Delete (soft delete)
DELETE /api/instructions/:id
```

### Agent Integration (Simple)

```typescript
// Assign instruction to agent (just update agent)
PUT    /api/agents/:agentId
{
  "instructionId": "inst-abc123"
}

// Get agent with instruction (populate)
GET    /api/agents/:agentId?populate=instruction
// Response
{
  "agentId": "agent-001",
  "name": "Support Agent",
  "instructionId": "inst-abc123",
  "instruction": {                    // Populated
    "name": "Customer Support Agent",
    "systemPrompt": "You are...",
    "guidelines": [...]
  }
}

// Remove instruction from agent
PUT    /api/agents/:agentId
{
  "instructionId": null
}
```

**No separate junction table!** Just a simple foreign key.

---

## Database Schema

### MongoDB Collection: `instructions`

```javascript
{
  _id: ObjectId("68f123..."),
  instructionId: "inst-abc123",
  name: "Customer Support Agent",
  description: "Instructions for customer support agents",
  systemPrompt: "You are a helpful customer support agent...",
  guidelines: [
    "Always greet warmly",
    "Listen actively",
    "Provide clear solutions"
  ],
  tags: ["support", "customer-service"],
  isActive: true,

  // BaseSchema fields
  owner: {
    orgId: "68dd05b1...",
    userId: "68dcf365...",
    groupId: ""
  },
  createdBy: "68dcf365...",
  updatedBy: "68dcf365...",
  createdAt: ISODate("2025-11-16T10:00:00Z"),
  updatedAt: ISODate("2025-11-16T10:00:00Z"),
  isDeleted: false,
  isDeleted: false
}
```

### Indexes (Minimal)

```javascript
// Unique index on instructionId
db.instructions.createIndex({ instructionId: 1 }, { unique: true });

// Common queries
db.instructions.createIndex({ "owner.orgId": 1, isActive: 1, isDeleted: 1 });
db.instructions.createIndex({ tags: 1, isActive: 1 });
```

### Agent Collection Update

```javascript
// agents collection - just add one field
{
  _id: ObjectId("..."),
  agentId: "agent-001",
  name: "Support Agent",

  // NEW FIELD
  instructionId: "inst-abc123",      // Reference to instructions.instructionId

  // ... existing fields
}
```

**No index needed** - Optional populate query is rare.

---

## Implementation Plan (Simplified)

### Phase 1: Core Entity (1 day)

**Tasks:**
- [ ] Create `instruction.schema.ts` (simple schema)
- [ ] Create `instruction.service.ts` (extends BaseService)
- [ ] Create `instruction.controller.ts` (standard CRUD)
- [ ] Create `instruction.dto.ts` (Create, Update DTOs)
- [ ] Create `instruction.module.ts`

**Files:**
```
services/aiwm/src/modules/instruction/
├── instruction.schema.ts          ← Simple schema (50 lines)
├── instruction.service.ts         ← Extends BaseService (30 lines)
├── instruction.controller.ts      ← Standard CRUD (80 lines)
├── instruction.dto.ts             ← 2 DTOs (40 lines)
└── instruction.module.ts          ← Module config (20 lines)
```

**Total: ~220 lines of code**

### Phase 2: Agent Integration (0.5 day)

**Tasks:**
- [ ] Update `agent.schema.ts` - Add `instructionId` field
- [ ] Update `agent.dto.ts` - Add `instructionId` to DTOs
- [ ] Update `AgentController.findOne()` - Add populate option
- [ ] Test CRUD + populate

**Files:**
```
services/aiwm/src/modules/agent/
├── agent.schema.ts                ← Add 1 field (3 lines)
├── agent.dto.ts                   ← Add to DTOs (2 lines)
└── agent.controller.ts            ← Add populate (5 lines)
```

**Total: ~10 lines changed**

### Phase 3: Testing (0.5 day)

**Tasks:**
- [ ] Manual testing với Swagger
- [ ] Test create instruction
- [ ] Test assign to agent
- [ ] Test populate
- [ ] Update API documentation

**Total Timeline: 2 days** (vs 5 days original proposal)

---

## Code Examples

### 1. Instruction Schema (Simplified)

```typescript
// services/aiwm/src/modules/instruction/instruction.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type InstructionDocument = Instruction & Document;

@Schema({ timestamps: true })
export class Instruction extends BaseSchema {
  @Prop({ required: true, unique: true })
  instructionId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({ type: [String], default: [] })
  guidelines?: string[];

  @Prop({ type: [String], default: [] })
  tags?: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const InstructionSchema = SchemaFactory.createForClass(Instruction);

// Indexes
InstructionSchema.index({ instructionId: 1 }, { unique: true });
InstructionSchema.index({ 'owner.orgId': 1, isActive: 1, isDeleted: 1 });
```

### 2. Instruction Service (Minimal)

```typescript
// services/aiwm/src/modules/instruction/instruction.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Instruction, InstructionDocument } from './instruction.schema';

@Injectable()
export class InstructionService extends BaseService<Instruction> {
  constructor(
    @InjectModel(Instruction.name)
    private instructionModel: Model<InstructionDocument>
  ) {
    super(instructionModel);
  }

  // BaseService provides:
  // - create(dto, context)
  // - findAll(query, context)
  // - findById(id, context)
  // - update(id, dto, context)
  // - remove(id, context)

  // No custom methods needed for MVP!
}
```

### 3. Instruction DTOs

```typescript
// services/aiwm/src/modules/instruction/instruction.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInstructionDto {
  @ApiProperty({ example: 'Customer Support Agent' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Instructions for support agents' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 'You are a helpful customer support agent...'
  })
  @IsString()
  systemPrompt: string;

  @ApiPropertyOptional({
    example: ['Greet warmly', 'Listen actively']
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  guidelines?: string[];

  @ApiPropertyOptional({ example: ['support', 'customer-service'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class UpdateInstructionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  guidelines?: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
```

### 4. Instruction Controller (Standard CRUD)

```typescript
// services/aiwm/src/modules/instruction/instruction.controller.ts
import {
  Controller, Get, Post, Body, Put, Param, Delete,
  UseGuards, Query, NotFoundException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard, CurrentUser, PaginationQueryDto,
  ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { InstructionService } from './instruction.service';
import { CreateInstructionDto, UpdateInstructionDto } from './instruction.dto';

@ApiTags('instructions')
@ApiBearerAuth('JWT-auth')
@Controller('instructions')
export class InstructionController {
  constructor(private readonly instructionService: InstructionService) {}

  @Post()
  @ApiOperation({ summary: 'Create instruction' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateInstructionDto,
    @CurrentUser() context: RequestContext,
  ) {
    // Generate instructionId
    const instructionId = `inst-${Date.now()}`;
    return this.instructionService.create(
      { ...createDto, instructionId },
      context
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all instructions' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.instructionService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get instruction by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const instruction = await this.instructionService.findById(
      new Types.ObjectId(id) as any,
      context
    );
    if (!instruction) {
      throw new NotFoundException(`Instruction with ID ${id} not found`);
    }
    return instruction;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update instruction' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateInstructionDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.instructionService.update(id, updateDto, context);
    if (!updated) {
      throw new NotFoundException(`Instruction with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete instruction' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.instructionService.remove(id, context);
    return { message: 'Instruction deleted successfully' };
  }
}
```

### 5. Agent Schema Update

```typescript
// services/aiwm/src/modules/agent/agent.schema.ts
// Just add ONE field:

@Schema({ timestamps: true })
export class Agent extends BaseSchema {
  @Prop({ required: true, unique: true })
  agentId: string;

  @Prop({ required: true })
  name: string;

  // ... existing fields ...

  // NEW FIELD (add this)
  @Prop({ type: String, ref: 'Instruction' })
  instructionId?: string;  // Optional reference to Instruction

  // ... rest of fields ...
}
```

### 6. Agent Controller Update (Populate)

```typescript
// services/aiwm/src/modules/agent/agent.controller.ts
// Update findOne method to support populate:

@Get(':id')
async findOne(
  @Param('id') id: string,
  @Query('populate') populate: string,  // NEW: populate query param
  @CurrentUser() context: RequestContext,
) {
  const agent = await this.agentService.findById(
    new Types.ObjectId(id) as any,
    context
  );

  if (!agent) {
    throw new NotFoundException(`Agent with ID ${id} not found`);
  }

  // NEW: Populate instruction if requested
  if (populate === 'instruction' && agent.instructionId) {
    await agent.populate('instructionId');
  }

  return agent;
}
```

---

## Usage Examples

### Example 1: Create and Assign Instruction

```bash
# 1. Create instruction
curl -X POST http://localhost:3003/api/instructions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Agent",
    "systemPrompt": "You are a helpful customer support agent. Be polite, empathetic, and solve problems efficiently.",
    "guidelines": [
      "Always greet the customer warmly",
      "Listen to their concerns before responding",
      "Provide clear, actionable solutions",
      "Never share sensitive information"
    ],
    "tags": ["support", "customer-service"]
  }'

# Response:
{
  "_id": "68f123abc...",
  "instructionId": "inst-1731744000",
  "name": "Customer Support Agent",
  "systemPrompt": "You are a helpful...",
  "guidelines": [...],
  "isActive": true,
  "createdAt": "2025-11-16T10:00:00Z"
}

# 2. Assign to agent
curl -X PUT http://localhost:3003/api/agents/agent-001 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instructionId": "inst-1731744000"
  }'

# 3. Get agent with instruction
curl "http://localhost:3003/api/agents/agent-001?populate=instruction" \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "agentId": "agent-001",
  "name": "Support Agent",
  "instructionId": "inst-1731744000",
  "instruction": {
    "_id": "68f123abc...",
    "name": "Customer Support Agent",
    "systemPrompt": "You are a helpful...",
    "guidelines": [...]
  }
}
```

### Example 2: Update Instruction

```bash
# Update system prompt
curl -X PUT http://localhost:3003/api/instructions/68f123abc \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "systemPrompt": "You are a professional customer support agent. Your goal is to help customers efficiently while maintaining a warm, empathetic tone.",
    "guidelines": [
      "Greet customers by name when possible",
      "Actively listen and show empathy",
      "Provide step-by-step solutions",
      "Confirm resolution before closing"
    ]
  }'

# All agents using this instruction will get updated prompt automatically
```

### Example 3: Remove Instruction from Agent

```bash
# Remove instruction
curl -X PUT http://localhost:3003/api/agents/agent-001 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instructionId": null
  }'
```

---

## What We Removed (vs Original Proposal)

| Feature | Original | Simplified | Reason |
|---------|----------|------------|--------|
| Entity Fields | 20+ fields | 6 fields | Keep only essentials |
| Type/Category | Enum fields | None | Can add via tags |
| Versioning | Full system | `updatedAt` | Simple is enough |
| Examples | Structured array | None | Can add to systemPrompt |
| Steps | Task steps | None | Can add to guidelines |
| Validation | Rules object | None | Can add later |
| A/B Testing | Experiment fields | None | Too early |
| Parent-child | Relationships | None | Not needed |
| Junction Table | agent_instructions | None | Simple FK is enough |
| API Endpoints | 15+ endpoints | 5 endpoints | CRUD only |
| **Total Code** | ~1500 lines | **~220 lines** | **7x simpler** |

---

## Future Enhancements (Post-MVP)

When needed, we can add:

1. **Type/Category Fields** (Phase 2)
   ```typescript
   type: "system" | "task" | "behavior";
   category: string;
   ```

2. **Examples Array** (Phase 3)
   ```typescript
   examples?: Array<{
     input: string;
     output: string;
   }>;
   ```

3. **Versioning** (Phase 4)
   ```typescript
   version: string;
   parentInstructionId?: string;
   ```

4. **Multiple Instructions per Agent** (Phase 5)
   ```typescript
   // Agent schema
   instructionIds: string[];  // Array instead of single
   ```

But for **MVP**, we don't need any of these!

---

## Comparison: Complex vs Simple

### Original Proposal
```
❌ Instruction: 25 fields, 300 lines
❌ Junction table: AgentInstruction entity
❌ 15+ API endpoints
❌ Versioning system
❌ A/B testing
❌ Template library
❌ ~1500 lines of code
❌ 5 days implementation
```

### Simplified MVP
```
✅ Instruction: 6 fields, 50 lines
✅ Simple FK in Agent
✅ 5 API endpoints (standard CRUD)
✅ Use updatedAt for tracking
✅ No A/B testing
✅ No templates
✅ ~220 lines of code
✅ 2 days implementation
```

**Result:** **7x simpler**, **2.5x faster** to implement, easier to maintain!

---

## Summary

### What MVP Provides

✅ **Core Functionality:**
- Agents có system prompts
- Agents có guidelines
- Update prompts without code changes
- Reuse instructions across agents
- RBAC protection (from BaseSchema)
- Soft delete support

✅ **Simple Architecture:**
- 1 entity (Instruction)
- 1 reference field in Agent
- Standard CRUD APIs
- Optional populate query

✅ **Fast Implementation:**
- 2 days vs 5 days
- ~220 lines vs ~1500 lines
- Easy to test
- Easy to extend later

### What We Skip (For Now)

⏳ **Can Add Later:**
- Type/Category fields
- Versioning system
- Example arrays
- A/B testing
- Template library
- Multiple instructions per agent

---

**Recommendation:**
- ✅ Start with this simplified version
- ✅ Add to Phase 6 (or earlier if needed)
- ✅ Priority: MEDIUM-HIGH
- ✅ Timeline: 2 days
- ✅ Can extend later based on real usage

---

**Document Version:** 2.0 (Simplified)
**Created:** 2025-11-16
**Status:** Ready for Implementation
