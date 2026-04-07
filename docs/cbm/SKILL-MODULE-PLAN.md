# CBM Skill Module — Plan

**Ngày:** 2026-04-07
**Trạng thái:** Draft — chờ approve

---

## 1. Bối cảnh & Vấn đề

### Kiến trúc hiện tại (AIWM + MCP)

```
Agent → AIWM /connect → { instructions, mcp_server, tools[] }
Agent → AIWM MCP (proxy) → AIWM gọi CBM API → response
```

**Vấn đề:**
- MCP inject toàn bộ tool schema vào context ngay từ đầu (~15,000–20,000 tokens cho 50+ tools)
- Agent phải scan tool list mỗi lần để chọn tool → chậm
- AIWM là middleman → thêm latency, single point of failure
- Khi CBM thêm module mới, AIWM phải update MCP tools thủ công

### Mục tiêu

```
Agent → AIWM /connect → { instructions, skills: [{ name: "cbm", url: "..." }] }
Agent Runner → fetch skill từ CBM trực tiếp → load vào context
Agent → đọc skill → gọi CBM API trực tiếp (không qua AIWM proxy)
```

**Kỳ vọng:**
- Token tiêu thụ giảm ~5x (3,000 vs 15,000+ tokens)
- Tốc độ xử lý nhanh hơn (agent follow recipe thay vì scan tool list)
- CBM tự chủ skill — AIWM chỉ lưu URL, không cần biết nội dung
- Skill tự cập nhật khi API thay đổi (generate động)

---

## 2. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────┐
│                  CBM Service                         │
│                                                      │
│  GET /skill  ←─ SkillModule                          │
│                   ├── đọc OpenAPI spec (Swagger)     │
│                   ├── scan tất cả *.skill.md         │
│                   ├── merge + compress               │
│                   └── cache (TTL 1h, invalidate      │
│                       khi deploy)                    │
│                                                      │
│  src/modules/invoice/invoice.skill.md  ┐             │
│  src/modules/expense/expense.skill.md  ├─ inputs     │
│  src/modules/company/company.skill.md  ┘             │
│  src/cbm.skill.md  (service-level)    ─┘             │
└───────────────────┬─────────────────────────────────┘
                    │ Skill Manifest (JSON)
                    ↓
┌─────────────────────────────────────────────────────┐
│                 AIWM /connect                        │
│                                                      │
│  Không cần biết nội dung skill                       │
│  Chỉ trả về: { skill_url, ttl }                      │
└───────────────────┬─────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────┐
│               Agent Runner                           │
│                                                      │
│  1. Nhận skill_url từ AIWM                           │
│  2. Fetch + cache skill (theo ttl)                   │
│  3. Inject skill instructions vào agent context      │
│  4. Agent gọi CBM API trực tiếp (Bash/curl/fetch)    │
└─────────────────────────────────────────────────────┘
```

---

## 3. Naming Convention

| Thành phần | Tên | Lý do |
|---|---|---|
| NestJS Module | `SkillModule` | Không conflict với `AgentModule` ở AIWM |
| Endpoint | `GET /skill` | Clean, predictable, consistent cross-service |
| Business logic file | `<module>.skill.md` | Nằm cạnh module, developer tự maintain |
| Service-level file | `src/cbm.skill.md` | Workflow liên module |

> **Convention pattern:** Mọi service trong hệ thống (CBM, AIWM, IAM...) đều có thể
> expose `GET /skill` theo cùng format — AIWM chỉ cần lưu URL.

---

## 4. Skill Manifest Format

Response từ `GET /skill`:

```json
{
  "name": "cbm",
  "version": "sha256:<hash của openapi+skill_files>",
  "description": "Core Business Management — Projects, CRM, Finance",
  "generated_at": "2026-04-07T10:00:00.000Z",
  "base_url": "https://cbm.hydrabyte.ai",
  "auth": {
    "type": "bearer",
    "header": "Authorization",
    "note": "Token tự scope theo orgId — không cần truyền orgId thủ công"
  },
  "instructions": "# CBM Skill\n...[merged markdown content]..."
}
```

`instructions` là phần agent thực sự đọc — nội dung dưới đây.

---

## 5. Nguồn nội dung cho `instructions`

### 5a. Từ OpenAPI spec (auto-generate)

SkillModule đọc Swagger spec, compress thành endpoint reference dạng agent-friendly:

```markdown
### Projects
POST   /projects          — Tạo project mới
GET    /projects          — Danh sách (filter: status, search)
GET    /projects/:id      — Chi tiết
PATCH  /projects/:id      — Cập nhật
DELETE /projects/:id      — Xóa mềm
POST   /projects/:id/activate    — [action] draft → active
POST   /projects/:id/complete    — [action] active → completed

Request: POST /projects
{ name*, description, memberIds[], tags[] }
→ 201: { id, name, status: "draft", ... }
→ 400: validation error
→ 403: không có quyền
```

Swagger cho biết **what** (structure, method, path, schema).

### 5b. Từ `*.skill.md` (authored by developer)

Mỗi module có 1 file `.skill.md` mô tả **why & how**:

```markdown
## Invoice

Quản lý hóa đơn bán hàng.

### State Machine
draft → sent → partial → paid
           ↓         ↓
        overdue   overdue
(any non-paid) → cancelled

### Workflows
#### Tạo và gửi hóa đơn
1. POST /invoices — tạo draft, nhận code INV-YYYY-NNNN
2. POST /invoices/:id/send — gửi cho khách
3. POST /payments — ghi nhận thanh toán (tự cập nhật invoice status)

#### Xử lý hóa đơn quá hạn
POST /invoices/:id/mark-overdue
→ Chỉ khi status = sent hoặc partial

### Business Rules
- Không update invoice sau khi sent
- Không xóa invoice ở trạng thái sent/paid
- items[] không được rỗng
- currency của payment phải khớp invoice

### Agent Hints
- Lỗi 400 "invalid status transition": kiểm tra status trước khi gọi action
- Lỗi 409 khi tạo payment: invoice đã thanh toán đủ
- Muốn reopen invoice đã cancel: POST /invoices/:id/reopen
```

### 5c. Từ `cbm.skill.md` (service-level)

```markdown
## CBM — Core Business Management

Quản lý Projects, CRM (Company/Contact/Interaction), Finance (Invoice/Expense/Payment/Transaction).

### Auth
Authorization: Bearer {jwt_token}
Tất cả data tự động scope theo orgId của token — không cần truyền thêm.

### Cross-module Workflows

#### Quy trình bán hàng đầy đủ
1. Tạo Company nếu chưa có: POST /companies
2. Tạo Contact liên kết Company: POST /contacts { companyId }
3. Tạo Invoice: POST /invoices { contactId, companyId, items[] }
4. Gửi Invoice: POST /invoices/:id/send
5. Ghi nhận thanh toán: POST /payments { invoiceId, amount, method }

#### Quy trình quản lý chi phí
1. Tạo Expense: POST /expenses (status: pending)
2. Duyệt: POST /expenses/:id/approve → tự tạo Transaction
3. Xem lịch sử giao dịch: GET /transactions
4. Tổng hợp theo kỳ: GET /transactions/summary?period=month

### Thứ tự tham chiếu giữa modules
Contact → có thể liên kết Company (optional)
Invoice → yêu cầu Contact, optional Company
Payment → yêu cầu Invoice
Expense → optional vendor (Company/Contact)
Transaction → auto-generated, không tạo thủ công
```

---

## 6. SkillModule — Implementation Plan

### File structure

```
src/
  skill/
    skill.module.ts
    skill.controller.ts
    skill.service.ts         ← core logic: generate + cache
    skill-generator.service.ts  ← merge OpenAPI + *.skill.md
  cbm.skill.md               ← service-level workflow

src/modules/
  project/project.skill.md
  work/work.skill.md
  document/document.skill.md
  company/company.skill.md
  contact/contact.skill.md
  interaction/interaction.skill.md
  invoice/invoice.skill.md
  expense/expense.skill.md
  payment/payment.skill.md
  transaction/transaction.skill.md
```

### `GET /skill` endpoint

```typescript
@Controller('skill')
export class SkillController {
  @Get()
  // Public endpoint — không cần JWT
  // (Skill manifest không chứa sensitive data)
  // Hoặc dùng internal API key nếu muốn restrict
  async getSkill(): Promise<SkillManifest> {
    return this.skillService.getSkill();
  }
}
```

### SkillService — caching

```typescript
@Injectable()
export class SkillService {
  private cache: { manifest: SkillManifest; generatedAt: number } | null = null;
  private readonly TTL_MS = 60 * 60 * 1000; // 1 giờ

  async getSkill(): Promise<SkillManifest> {
    if (this.cache && Date.now() - this.cache.generatedAt < this.TTL_MS) {
      return this.cache.manifest;
    }
    const manifest = await this.skillGeneratorService.generate();
    this.cache = { manifest, generatedAt: Date.now() };
    return manifest;
  }

  invalidateCache(): void {
    this.cache = null; // gọi khi deploy / health check
  }
}
```

### SkillGeneratorService — merge logic

```typescript
@Injectable()
export class SkillGeneratorService {
  async generate(): Promise<SkillManifest> {
    // 1. Đọc OpenAPI spec từ Swagger (đã có sẵn qua NestJS)
    const openApiSpec = await this.getOpenApiSpec();
    const endpointRef = this.compressOpenApi(openApiSpec);

    // 2. Đọc tất cả *.skill.md
    const skillFiles = await this.loadSkillFiles(); // glob src/**/*.skill.md

    // 3. Merge thành instructions
    const instructions = this.mergeInstructions(endpointRef, skillFiles);

    // 4. Build manifest
    return {
      name: 'cbm',
      version: this.computeHash(openApiSpec, skillFiles),
      description: 'Core Business Management — Projects, CRM, Finance',
      generated_at: new Date().toISOString(),
      base_url: process.env.CBM_BASE_URL,
      auth: { type: 'bearer', header: 'Authorization' },
      instructions,
    };
  }
}
```

---

## 7. `*.skill.md` Convention

### Cấu trúc file

```markdown
## <Module Name>

<1–2 dòng mô tả module>

### State Machine (nếu có)
<ASCII state diagram>

### Workflows (nếu có)
#### <Tên workflow>
<Numbered steps>

### Business Rules
- <Rule 1>
- <Rule 2>

### Agent Hints
- Lỗi <code>: <giải thích + cách xử lý>
```

### Quy tắc viết

1. **Ngắn gọn** — agent đọc, không phải human doc
2. **Action-oriented** — dùng động từ: "Tạo", "Gửi", "Duyệt"
3. **Lỗi thường gặp** — luôn có Agent Hints cho common errors
4. **Không duplicate** với Swagger — Swagger lo endpoint/schema, `.skill.md` lo nghiệp vụ

---

## 8. Nâng cấp API Error Response

Để agent hiểu lỗi tốt hơn, nâng cấp format error response:

**Hiện tại:**
```json
{ "statusCode": 400, "message": "Invalid status transition" }
```

**Đề xuất thêm `agentHint`:**
```json
{
  "statusCode": 400,
  "message": "Invalid status transition",
  "agentHint": "Invoice đang ở trạng thái 'sent', không thể gửi lại. Nếu muốn cancel: POST /invoices/:id/cancel",
  "currentStatus": "sent",
  "allowedActions": ["mark-overdue", "cancel", "link-e-invoice"]
}
```

→ Agent không cần đọc skill để xử lý lỗi — lỗi tự giải thích được.

---

## 9. AIWM Integration (minimal change)

AIWM `/connect` chỉ cần thêm `skills` field:

```json
{
  "instructions": "...",
  "mcp": { ... },        // giữ nguyên cho backward compat
  "skills": [
    {
      "name": "cbm",
      "url": "https://cbm.internal/skill",
      "ttl": 3600,
      "version": "sha256:abc123"  // để Agent Runner cache theo version
    }
  ]
}
```

Không breaking change — agent cũ vẫn dùng MCP, agent mới dùng skill.

---

## 10. Token Efficiency — Ước tính

| | MCP (hiện tại) | Skill approach |
|---|---|---|
| Load lúc khởi động | ~15,000–20,000 tokens | ~2,000–4,000 tokens |
| Mỗi lần gọi API | ~500 tokens (tool invocation) | ~50–100 tokens (curl) |
| 10 operations | **~25,000 tokens** | **~5,000 tokens** |
| **Tiết kiệm** | — | **~5x** |

---

## 11. Implementation Phases

### Phase 1 — CBM SkillModule (core)
- [ ] Tạo `src/skill/` module
- [ ] `SkillGeneratorService` — compress OpenAPI + load `*.skill.md`
- [ ] `SkillService` — caching với TTL
- [ ] `SkillController` — `GET /skill`
- [ ] Register trong `AppModule`

### Phase 2 — Viết `*.skill.md` cho từng module
- [ ] `src/cbm.skill.md` — service overview + cross-module workflows
- [ ] `project.skill.md`, `work.skill.md`, `document.skill.md`
- [ ] `company.skill.md`, `contact.skill.md`, `interaction.skill.md`
- [ ] `invoice.skill.md`, `expense.skill.md`, `payment.skill.md`, `transaction.skill.md`

### Phase 3 — Nâng cấp Error Response
- [ ] Thêm `agentHint` vào các error trong service layer
- [ ] Thêm `allowedActions` cho state machine errors

### Phase 4 — AIWM Integration
- [ ] AIWM `/connect` trả thêm `skills[]`
- [ ] Agent Runner hỗ trợ fetch + cache remote skill
- [ ] Test end-to-end với agent thực tế

---

## 12. Decisions cần confirm

| # | Quyết định | Options |
|---|---|---|
| 1 | Auth cho `GET /skill` | Public (không sensitive) vs Internal API key |
| 2 | Cache invalidation | TTL only vs webhook trigger khi deploy |
| 3 | Migration MCP → Skill | Song song (backward compat) vs Replace dần |
| 4 | `agentHint` language | Tiếng Việt (team hiểu) vs English (agent universal) |
