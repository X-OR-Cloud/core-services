# Agent Code Feature

## Overview

Thêm trường `code` vào Agent entity — một định danh ngắn, thân thiện, unique per org, được tự động sinh khi tạo agent. Cho phép người dùng mention agent bằng `@code` thay vì nhớ ID.

**Format:** `[name]-[adjective]` (vd: `jack-bold`, `luna-gold`)
**Pattern:** `[a-z-]+` (chỉ chữ thường và dấu gạch ngang)
**Immutable:** Không cho phép sửa sau khi tạo.
**Unique:** Per organization.

---

## Dictionary

### Names (20 từ, 3-4 ký tự, dễ đọc/gõ tiếng Việt)
```
jack, lena, nova, mila, tara, evan, zara, leon, aria, hugo,
vera, niko, ella, omar, adam, kira, theo, yuna, cleo, elia
```

### Adjectives (20 từ, 3-4 ký tự, dễ đọc/gõ tiếng Việt)
```
bold, cool, fast, gold, wild, calm, dark, soft, wise, free,
keen, blue, kind, slim, warm, live, pure, safe, mint, tops
```

**Tổng combinations:** 20 × 20 = 400 unique codes per org.

---

## Thuật toán sinh code (Fisher-Yates Shuffle)

```
1. Load danh sách codes đã tồn tại trong org
2. Tạo toàn bộ 400 combinations = [name]-[adjective]
3. Shuffle array bằng Fisher-Yates
4. Lấy phần tử đầu tiên không có trong existing set
5. Nếu tất cả 400 đã dùng → throw error (org đạt giới hạn)
```

Ưu điểm: Không retry, O(n) một lần, guaranteed unique.

---

## Entity Changes

### agent.schema.ts

Thêm field:

```typescript
@Prop({
  type: String,
  index: true,
})
code?: string;
```

> Index để query nhanh khi resolve `:id` param. Không unique index ở DB level vì scope là per-org (enforce ở service level).

---

## API Changes

### 1. `POST /agents` — Create Agent

- **Không thay đổi request body** (code tự động sinh, không nhận từ client)
- **Response** thêm field `code`

### 2. `GET /agents/:id` — Get Agent by ID or Code

- Nhận `id` có thể là:
  - MongoDB ObjectId (24 hex chars) → query by `_id`
  - Code string (`[a-z-]+`) → query by `code` + `owner` (org)
- Không thay đổi response shape

### 3. `PUT /agents/:id` — Update Agent

- Resolve `:id` giống GET (hỗ trợ cả ObjectId và code)
- `code` field bị ignore nếu có trong request body (immutable)

### 4. `DELETE /agents/:id` — Delete Agent

- Resolve `:id` giống GET (hỗ trợ cả ObjectId và code)

### 5. Các endpoints con (`/:id/instruction`, `/:id/config`, v.v.)

- Resolve `:id` ở service layer → dùng chung helper `resolveAgentId()`

---

## Files Cần Thay Đổi

| File | Thay đổi |
|------|----------|
| `agent.schema.ts` | Thêm field `code: string` |
| `agent.service.ts` | Thêm `generateCode()`, `resolveAgentId()`, gọi `generateCode()` trong `create()`, block update `code` trong `updateAgent()` |
| `agent.controller.ts` | Không đổi route, nhưng các method dùng `resolveAgentId()` thay vì truyền thẳng id |
| `agent.dto.ts` | Thêm `code` vào response DTO; đảm bảo `code` không có trong `UpdateAgentDto` |

---

## Helper: resolveAgentId()

```typescript
// Trong agent.service.ts
private async resolveAgentId(idOrCode: string, orgId: string): Promise<string> {
  if (/^[a-f0-9]{24}$/.test(idOrCode)) {
    return idOrCode; // ObjectId → dùng trực tiếp
  }
  // Code → lookup
  const agent = await this.model.findOne({ code: idOrCode, owner: orgId }).select('_id').lean();
  if (!agent) throw new NotFoundException(`Agent not found: ${idOrCode}`);
  return agent._id.toString();
}
```

---

## Helper: generateCode()

```typescript
private async generateCode(orgId: string): Promise<string> {
  const NAMES = ['jack','lena','nova','mila','tara','evan','zara','leon','aria','hugo',
                 'vera','niko','ella','omar','adam','kira','theo','yuna','cleo','elia'];
  const ADJS  = ['bold','cool','fast','gold','wild','calm','dark','soft','wise','free',
                 'keen','blue','kind','slim','warm','live','pure','safe','mint','tops'];

  // Load existing codes in org
  const existing = await this.model.find({ owner: orgId }).select('code').lean();
  const usedSet = new Set(existing.map(a => a.code).filter(Boolean));

  // Build all combinations
  const all: string[] = [];
  for (const n of NAMES) for (const a of ADJS) all.push(`${n}-${a}`);

  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  const code = all.find(c => !usedSet.has(c));
  if (!code) throw new Error('Organization has reached the maximum number of agents (400)');
  return code;
}
```

---

## Thư viện Thêm

**Không cần thêm thư viện** — implement Fisher-Yates shuffle trực tiếp trong service, không phụ thuộc external package.

---

## Migration

Agents hiện tại không có `code` → field là optional (`code?: string`).
Không cần migration script; agents cũ sẽ có `code = undefined` và vẫn accessible qua ObjectId.

> Nếu sau này cần backfill → chạy script riêng assign code cho agents cũ.
