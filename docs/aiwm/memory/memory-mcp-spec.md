# Memory Management MCP - Specification

## Tổng quan

MCP server cung cấp persistent memory cho agent, scoped theo `agentId`.
Storage phía AIWM backend (MongoDB), agent truy cập qua MCP tools.

---

## DB Entity: `AgentMemory`

```typescript
interface AgentMemory {
  // Identity
  _id: ObjectId;
  agentId: string;           // Agent instance (vd: "multi-platform-agent")
  category: MemoryCategory;  // Enum: xem bên dưới
  key: string;               // Unique identifier trong category, slug-style
                             // vd: "dung-report-preference", "decision-jumpserver"

  // Content
  content: string;           // Plain text, tối đa ~2000 chars
                             // Ngắn gọn, factual - không phải transcript

  tags: string[];            // Optional tags để filter thêm, vd: ["long", "infra"]

  // Timestamps
  createdAt: Date;
  updatedAt: Date;           // Sort mặc định theo updatedAt DESC

  // Soft delete
  deletedAt: Date | null;    // null = active
}

type MemoryCategory = "user-preferences" | "decisions" | "notes" | "lessons";
```

**Index:**
```
{ agentId: 1, category: 1, key: 1 }  → unique (upsert target)
{ agentId: 1, category: 1, updatedAt: -1 }  → list/search
{ agentId: 1, content: "text" }  → text search index
```

---

## MCP Tools

### 1. `memory_search`

Tìm kiếm memory theo keyword. Category là optional filter.

**Input:**
```typescript
{
  keyword: string;            // Required. Full-text search trong content + key
  category?: MemoryCategory;  // Optional. Nếu không có → search toàn bộ
  limit?: number;             // Default: 5, max: 20
}
```

**Output:**
```typescript
{
  results: Array<{
    category: MemoryCategory;
    key: string;
    content: string;
    updatedAt: string;        // ISO 8601
  }>;
  total: number;              // Tổng số kết quả (trước limit)
}
```

**Ví dụ agent dùng:**
```
memory_search({ keyword: "dung", category: "user-preferences" })
→ tìm preference của Dũng

memory_search({ keyword: "jumpserver" })
→ tìm mọi thứ liên quan jumpserver (decision, notes, lessons)
```

---

### 2. `memory_upsert`

Thêm mới hoặc cập nhật memory. Match theo `(agentId, category, key)`.

**Input:**
```typescript
{
  category: MemoryCategory;   // Required
  key: string;                // Required. slug-style, vd: "dung-report-style"
                              // Convention: {subject}-{topic} hoặc {date}-{topic}
  content: string;            // Required. Ngắn gọn, factual
  tags?: string[];            // Optional
}
```

**Output:**
```typescript
{
  action: "created" | "updated";
  key: string;
  updatedAt: string;
}
```

**Ví dụ agent dùng:**
```
memory_upsert({
  category: "decisions",
  key: "2026-03-05-jumpserver-selected",
  content: "Chọn JumpServer thay Flowcase. Lý do: cost thấp hơn 40%, đủ feature cho phase 1. Người quyết định: Dũng. Approve: Tony.",
  tags: ["infra", "jumpserver", "flowcase"]
})

memory_upsert({
  category: "user-preferences",
  key: "dung-communication-style",
  content: "Dũng thích báo cáo ngắn gọn, bullet points. Không thích dài dòng. Prefer tiếng Việt."
})

memory_upsert({
  category: "notes",
  key: "client-demo-date",
  content: "Client muốn demo vào 20/3, không phải 30/3 như trong timeline. Confirm qua Discord ngày 2026-03-06."
})

memory_upsert({
  category: "lessons",
  key: "infra-estimation-risk",
  content: "Không estimate task infra dưới 3 ngày khi chưa có spec rõ ràng. Bài học từ JumpServer setup delay."
})
```

---

### 3. `memory_list_keys`

Liệt kê tất cả keys đang có, để agent biết mình đang lưu gì và tránh duplicate.

**Input:**
```typescript
{
  category?: MemoryCategory;  // Optional. Nếu không có → list toàn bộ
}
```

**Output:**
```typescript
{
  keys: Array<{
    category: MemoryCategory;
    key: string;
    updatedAt: string;
    tags: string[];
  }>;
  total: number;
}
```

**Ví dụ agent dùng:**
```
memory_list_keys({ category: "decisions" })
→ Xem đã lưu những quyết định nào, tránh duplicate

memory_list_keys()
→ Audit toàn bộ memory, trả lời user "em đang nhớ gì?"
```

---

### 4. `memory_delete`

Xóa memory entry cụ thể (soft delete).

**Input:**
```typescript
{
  category: MemoryCategory;   // Required
  key: string;                // Required
}
```

**Output:**
```typescript
{
  deleted: boolean;
  key: string;
}
```

**Ví dụ agent dùng:**
```
memory_delete({ category: "notes", key: "client-demo-date" })
→ Sau khi demo xong, thông tin không còn relevance
```

---

## Key Naming Convention

Agent cần follow convention nhất quán để search hiệu quả:

| Category | Convention | Ví dụ |
|----------|-----------|-------|
| `user-preferences` | `{name}-{topic}` | `dung-report-style`, `long-timezone` |
| `decisions` | `{YYYY-MM-DD}-{topic}` | `2026-03-05-jumpserver-selected` |
| `notes` | `{subject}-{topic}` | `client-demo-date`, `team-long-onleave` |
| `lessons` | `{domain}-{topic}` | `infra-estimation-risk`, `deploy-checklist` |

---

## Content Guidelines cho agent

```
VIẾT content ngắn gọn, factual:
✓ "Dũng thích báo cáo bullet points, không thích dài dòng"
✓ "Chọn JumpServer vì cost -40%, approved by Tony ngày 2026-03-05"
✓ "Long nghỉ phép 10-14/3, liên hệ Sơn thay thế"

KHÔNG viết:
✗ Transcript cuộc hội thoại
✗ Thông tin đã có trong project context (members list, timeline...)
✗ Suy đoán chưa được confirm
✗ Content quá dài (>300 chars/entry) → nên tách thành nhiều keys
```

---

## Instruction inject vào system prompt

Đây là đoạn thêm vào `<system>` block trong AIWM instruction template:

```
MEMORY RULES:
- Trước khi trả lời về: quyết định đã đưa ra, preferences của ai đó, thông tin đặc biệt
  → gọi memory_search trước, không tự suy đoán
- Sau cuộc trò chuyện có thông tin mới:
  → gọi memory_upsert ngay, không để quên
- Muốn biết đang lưu gì / tránh duplicate key:
  → gọi memory_list_keys
- Thông tin hết relevance (task xong, member rời team...):
  → gọi memory_delete

MEMORY CATEGORIES:
- user-preferences: cách làm việc, style, preferences của từng người
- decisions: quyết định đã được approve (ghi ngày, người quyết, lý do)
- notes: thông tin team/dự án không có trong tài liệu chính thức
- lessons: bài học rút ra, điều cần tránh lặp lại

KEY CONVENTION: {subject}-{topic} hoặc {YYYY-MM-DD}-{topic}
CONTENT: ngắn gọn, factual, tối đa ~300 chars mỗi entry
```

---
