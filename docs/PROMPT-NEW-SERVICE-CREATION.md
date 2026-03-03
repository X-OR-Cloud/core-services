# Prompt Template: Creating New Service

**Document Version:** 1.0
**Date:** 2025-10-17
**Purpose:** Template prompt for creating new NestJS microservices following Template Service pattern

---

## 📋 Quick Start Prompt

Copy and paste this prompt to Claude Code Agent, replacing `[SERVICE_NAME]` and `[ENTITIES]` with your values:

```
I need you to create a new microservice called [SERVICE_NAME] in the hydra-services monorepo.

Follow the exact pattern of Template Service with these requirements:

**Service Details:**
- Service Name: [SERVICE_NAME] (e.g., "inventory", "billing", "notification")
- Port: [PORT] (e.g., 3003, 3004, 3005)
- Entities: [ENTITY_LIST] (e.g., "Product, Warehouse, StockMovement")

**Requirements:**
1. Use Template Service as the reference implementation
2. Include ALL production-ready features:
   - ✅ Health check endpoint (/health)
   - ✅ Error standardization (GlobalExceptionFilter)
   - ✅ Correlation ID middleware
   - ✅ RBAC integration with BaseService
   - ✅ Audit trail (createdBy/updatedBy)
   - ✅ Modern controller pattern (@CurrentUser decorator)
   - ✅ Swagger error decorators (@ApiCreateErrors, etc.)
   - ✅ Pagination support (PaginationQueryDto)
   - ✅ JWT authentication (JwtStrategy + PassportModule)

3. Follow the monorepo structure:
   - Location: services/[SERVICE_NAME]/
   - Use Nx workspace configuration
   - Configure proper tsconfig and project.json

4. For each entity, create:
   - Schema extending BaseSchema
   - Service extending BaseService
   - Controller with modern pattern
   - DTOs for Create/Update operations
   - Full CRUD endpoints

**Start by creating the service structure, then implement entities one by one.**

Please confirm you understand the requirements before proceeding.
```

---

## 📝 Detailed Prompt (For Complex Services)

Use this extended version for more complex services with specific requirements:

```
I need you to create a new production-ready microservice for [BUSINESS_DOMAIN].

**Service Specification:**
- **Name:** [SERVICE_NAME]
- **Port:** [PORT]
- **Database:** MongoDB with database name `hydra_[SERVICE_NAME]`
- **Primary Entities:** [ENTITY_1], [ENTITY_2], [ENTITY_3]

**Entity Details:**

1. **[ENTITY_1]** (e.g., Product)
   - Fields: [LIST_FIELDS_AND_TYPES]
   - Relationships: [DESCRIBE_RELATIONSHIPS]
   - Validation: [SPECIAL_VALIDATION_RULES]

2. **[ENTITY_2]** (e.g., Category)
   - Fields: [LIST_FIELDS_AND_TYPES]
   - Relationships: [DESCRIBE_RELATIONSHIPS]

[Repeat for each entity]

**Special Requirements:**
- [Any event-driven requirements]
- [Any queue/async processing needs]
- [Any special integrations]

**Reference Implementation:**
Use Template Service as the blueprint:
- Location: services/template/
- Review: services/template/README.md
- All Template features are mandatory

**Production Checklist (All Required):**
- [ ] Health check with database monitoring
- [ ] GlobalExceptionFilter for errors
- [ ] CorrelationIdMiddleware for tracking
- [ ] JwtStrategy + PassportModule for auth
- [ ] BaseService extension for all entities
- [ ] BaseSchema extension for all schemas
- [ ] Modern controller pattern (no BaseController)
- [ ] @CurrentUser() decorator usage
- [ ] Swagger error decorators (@ApiCreateErrors, etc.)
- [ ] PaginationQueryDto for list endpoints
- [ ] Full Swagger/OpenAPI documentation
- [ ] Soft delete functionality
- [ ] Audit trail (createdBy/updatedBy)
- [ ] RBAC permission checks
- [ ] Comprehensive README.md

**Implementation Steps:**
1. Copy `services/template/` → `services/[SERVICE_NAME]/`, rename project.json, .env, main.ts, app.module.ts
2. Xoá modules mẫu (category, product, report) và queues/ nếu không cần
3. Set up app.module.ts with all required modules
4. Create schemas (extend BaseSchema)
5. Create services (extend BaseService)
6. Create controllers (modern pattern)
7. Create DTOs with validation
8. Add Swagger documentation
9. Create README with API examples
10. Build and test the service

**Deliverables:**
- Fully functional service
- README with curl examples
- All files follow Template pattern
- Service builds without errors
- No TypeScript warnings

Please start by confirming your understanding and outlining the structure you'll create.
```

---

## 🎯 Example: Real Service Creation

### Example 1: Inventory Service

```
I need you to create a new microservice called "inventory" in the hydra-services monorepo.

Follow the exact pattern of Template Service with these requirements:

**Service Details:**
- Service Name: inventory
- Port: 3003
- Entities: Warehouse, Product, StockMovement

**Requirements:**
1. Use Template Service as the reference implementation
2. Include ALL production-ready features (health check, error handling, RBAC, etc.)
3. Follow the monorepo structure at services/inventory/

**Entity Specifications:**

**Warehouse:**
- name: string (required)
- code: string (required, unique)
- address: string
- capacity: number
- isActive: boolean (default: true)

**Product:**
- sku: string (required, unique)
- name: string (required)
- description: string
- unit: string (e.g., "pieces", "kg")
- minimumStock: number (default: 0)
- isActive: boolean (default: true)

**StockMovement:**
- warehouseId: ObjectId (required, ref to Warehouse)
- productId: ObjectId (required, ref to Product)
- type: enum ["IN", "OUT", "ADJUSTMENT"]
- quantity: number (required)
- reason: string
- referenceNumber: string

For each entity, create full CRUD endpoints with:
- Create (POST) - with validation
- Get all (GET) - with pagination
- Get by ID (GET)
- Update (PUT)
- Delete (DELETE) - soft delete

Please confirm you understand and outline the structure before proceeding.
```

### Example 2: Notification Service

```
I need you to create a new microservice called "notification" in the hydra-services monorepo.

Follow the exact pattern of Template Service.

**Service Details:**
- Service Name: notification
- Port: 3004
- Entities: NotificationTemplate, Notification, NotificationChannel

**Special Requirements:**
- Include BullMQ queue for async notification sending (like Template's report queue)
- Support multiple channels (email, SMS, push notification)

**Entity Specifications:**

**NotificationTemplate:**
- code: string (required, unique)
- name: string (required)
- subject: string
- bodyTemplate: string (required)
- channel: enum ["email", "sms", "push"]
- variables: string[] (array of template variable names)
- isActive: boolean (default: true)

**Notification:**
- templateId: ObjectId (ref to NotificationTemplate)
- recipientId: string (user ID)
- recipientEmail: string
- recipientPhone: string
- subject: string
- body: string
- channel: enum ["email", "sms", "push"]
- status: enum ["pending", "sent", "failed"]
- sentAt: Date
- failureReason: string

**NotificationChannel:**
- name: string (required, unique)
- type: enum ["email", "sms", "push"]
- configuration: object (JSON config)
- isActive: boolean (default: true)

**Queue Integration:**
- Create notification-queue using BullMQ
- Producer: NotificationProducer (emit notification events)
- Consumer: NotificationConsumer (send notifications)
- Processor: ProcessorsModule (handle notification jobs)

Follow Template Service's queue pattern exactly (see services/template/src/queues/).

Please start and create this service step by step.
```

---

## 📚 Reference Documentation

When creating a new service, reference these files:

### Core Files to Review:
1. **services/template/src/main.ts** - Service bootstrap with all filters
2. **services/template/src/app/app.module.ts** - Module configuration
3. **services/template/src/modules/category/** - Entity example (simple)
4. **services/template/src/modules/product/** - Entity example (with relationships)
5. **services/template/README.md** - API documentation examples

### Key Patterns:
1. **Schema Pattern:** `libs/base/src/lib/base.schema.ts`
2. **Service Pattern:** `libs/base/src/lib/base.service.ts`
3. **Controller Pattern:** `services/template/src/modules/category/category.controller.ts`
4. **DTO Pattern:** `services/template/src/modules/category/category.dto.ts`

### Libraries to Use:
- `@hydrabyte/base` - BaseService, BaseSchema, decorators, filters
- `@hydrabyte/shared` - RequestContext, constants, utilities

---

## ✅ Verification Checklist

After Agent creates the service, verify:

```bash
# 1. Build succeeds
npx nx build [SERVICE_NAME]

# 2. No TypeScript errors
npx tsc --noEmit -p services/[SERVICE_NAME]/tsconfig.app.json

# 3. Service starts
npx nx serve [SERVICE_NAME]

# 4. Health check works
curl http://localhost:[PORT]/health

# 5. API docs available
open http://localhost:[PORT]/api-docs
```

---

## 🚫 Common Mistakes to Avoid

When prompting the Agent, ensure they DON'T:

❌ **Don't use BaseController** - Use modern pattern instead
❌ **Don't use @Req() req** - Use @CurrentUser() context
❌ **Don't use FindAllQuery** - Use PaginationQueryDto
❌ **Don't write manual @ApiResponse()** - Use @ApiCreateErrors(), etc.
❌ **Don't forget GlobalExceptionFilter** - Always include in main.ts
❌ **Don't forget CorrelationIdMiddleware** - Always include in AppModule
❌ **Don't forget HealthModule** - Always include in AppModule
❌ **Don't forget JwtStrategy** - Always add to providers
❌ **Don't forget PassportModule** - Always import
❌ **Don't use `as any`** - Use `as unknown as ObjectId`

---

## 💡 Pro Tips

### For Agent:
1. **Always ask for confirmation** before starting major work
2. **Work incrementally** - Create structure first, then entities one by one
3. **Build frequently** - Run `npx nx build [SERVICE_NAME]` after each entity
4. **Reference Template Service** - Copy patterns, don't invent new ones
5. **Create comprehensive README** - Include curl examples for all endpoints

### For User:
1. **Be specific about entities** - Provide field names and types
2. **Mention relationships** - Clarify foreign keys and references
3. **Specify business rules** - Validation, constraints, defaults
4. **Request README** - Always ask for documentation with examples
5. **Test immediately** - Verify health check and one endpoint before continuing

---

## 📞 Support

If Agent has questions, they should:
1. **Review Template Service** - `services/template/`
2. **Check documentation** - `docs/TEMPLATE-SERVICE-UPGRADE.md`
3. **Ask clarifying questions** - Don't assume or guess
4. **Follow patterns exactly** - Template is the source of truth

---

**Document End**

---

## Quick Reference Commands

### Tạo service mới bằng cách copy từ Template

Cách tạo service mới là **copy thư mục `services/template/`** rồi rename lại:

```bash
# 1. Copy thư mục template
cp -r services/template services/[SERVICE_NAME]

# 2. Rename trong project.json: đổi tên project
#    "name": "template" → "name": "[SERVICE_NAME]"

# 3. Rename trong .env: đổi port và database name
#    PORT=3000 → PORT=[PORT]

# 4. Rename trong main.ts: đổi title Swagger, description

# 5. Rename trong app.module.ts:
#    - dbName: 'core_template' → 'core_[SERVICE_NAME]'
#    - envFilePath: 'services/template/.env' → 'services/[SERVICE_NAME]/.env'

# 6. Xoá các module mẫu (category, product, report) trong src/modules/
#    và tạo module mới theo entities của service

# 7. Xoá queues/ nếu service không cần BullMQ

# 8. Cập nhật README.md cho service mới

# 9. Đăng ký service trong root tsconfig.base.json (nếu cần path alias)

# 10. Build verify
npx nx build [SERVICE_NAME]
```

### Các file cần rename/sửa sau khi copy

| File | Sửa gì |
|------|--------|
| `project.json` | `name`, `sourceRoot`, `targets` paths |
| `.env` | `PORT`, database config |
| `src/main.ts` | Swagger title, description, tags, port |
| `src/app/app.module.ts` | `dbName`, `envFilePath`, import modules mới |
| `src/modules/*` | Xoá modules mẫu, tạo modules mới |
| `src/queues/*` | Xoá nếu không cần, hoặc rename cho phù hợp |
| `tsconfig.app.json` | Verify paths đúng |
| `README.md` | Viết lại cho service mới |

### Các lệnh thường dùng

```bash
# Build service
npx nx build [SERVICE_NAME]

# Serve service
npx nx serve [SERVICE_NAME]

# Test service
npx nx test [SERVICE_NAME]

# Lint service
npx nx lint [SERVICE_NAME]
```
