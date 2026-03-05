# CBM - Member Management & Access Control

## Overview

Nâng cấp Project entity trong CBM service để hỗ trợ:
1. **Member Management** — quản lý thành viên với role phân cấp
2. **Access Control** — filter nội dung theo membership
3. **Public Summary** — tách `summary` (public) khỏi `description` (private)

---

## 1. Schema Changes

### 1.1 Project Schema

**Thêm mới:**

```typescript
// New embedded type
interface ProjectMember {
  type: 'user' | 'agent';  // agent: validate ObjectId, TODO: cross-validate với AIWM
  id: string;               // ObjectId string
  role: 'project.lead' | 'project.member';
}

// New fields on Project
summary?: string;           // public, max 500 chars — thay thế description trong list response
members: ProjectMember[];   // default []
```

**Giữ nguyên:** `description` (member-only, max 2000)

**Xóa:** field `members: string[]` hiện tại (array of userId string) → thay bằng `members: ProjectMember[]`

**Index mới:**
```
ProjectSchema.index({ 'members.id': 1 });
ProjectSchema.index({ 'members.role': 1 });
```

---

## 2. Access Control Matrix

Áp dụng cho mọi request trong org scope. `universe.owner` bypass tất cả.

| Caller Role | findAll projects | findOne project | documents (by projectId) | works (by projectId) |
|---|---|---|---|---|
| `universe.owner` | Full, all orgs | Full | Full | Full |
| `organization.owner` | Full, own org | Full | Full | Full |
| `project.lead` / `project.member` | title, summary, startDate, endDate, members | Full (incl. description) | Full | Full |
| Authenticated, non-member, same org | title, summary, startDate, endDate, members | title, summary, startDate, endDate, members | `[]` | `[]` |
| Khác org | Không thấy | 403 | 403 | 403 |

**Global filter (không phụ thuộc vào projectId param):**
- Document/Work list API → tự động loại các item thuộc project mà user không phải member
- Logic: lấy danh sách projectId user là member → filter `projectId NOT IN non-member-projects`

---

## 3. Member Management API

### Endpoints mới

```
POST   /projects/:id/members              # Add member
DELETE /projects/:id/members/:memberId    # Remove member
GET    /projects/:id/members              # List members
PATCH  /projects/:id/members/:memberId    # Update member role
```

### Quyền manage members

| Caller | Quyền |
|---|---|
| `universe.owner` | Full |
| `organization.owner` | Full (own org) |
| `project.lead` | Full (own project) |
| `project.member` | Không có |

### DTOs

**AddMemberDto:**
```typescript
{
  type: 'user' | 'agent';  // required
  id: string;               // required, must be valid ObjectId
  role: 'project.lead' | 'project.member';  // required
}
```

**UpdateMemberRoleDto:**
```typescript
{
  role: 'project.lead' | 'project.member';  // required
}
```

---

## 4. Implementation Plan

### Phase 1 — Project Schema & DTOs
- [ ] `project.schema.ts` — thêm `ProjectMember` interface, field `summary`, thay `members`
- [ ] `project.dto.ts` — thêm `ProjectMemberDto`, `AddMemberDto`, `UpdateMemberRoleDto`, cập nhật `CreateProjectDto`/`UpdateProjectDto`

### Phase 2 — Access Control Helper
- [ ] Tạo `project-access.helper.ts` — utility functions:
  - `isSuperAdmin(context)` — check `universe.owner` / `organization.owner`
  - `getMemberRole(project, userId)` — trả về role hoặc null
  - `stripPrivateFields(project)` — xóa `description` khỏi response
  - `getUserMemberProjectIds(projects, userId)` — lấy danh sách projectId user là member

### Phase 3 — ProjectService
- [ ] `findAll()` — apply access filter: strip description cho non-member
- [ ] `findById()` — apply access filter: strip description cho non-member, 403 nếu khác org
- [ ] `addMember()` — validate ObjectId, check duplicate, check org scope
- [ ] `removeMember()` — validate membership exists
- [ ] `updateMemberRole()` — validate membership exists
- [ ] `listMembers()` — return members array
- [ ] `getUserMemberProjectIds()` — helper cho Document/Work filter

### Phase 4 — ProjectController
- [ ] Member endpoints: `POST`, `DELETE`, `GET`, `PATCH /projects/:id/members`
- [ ] Guard: check manage permission trên member endpoints

### Phase 5 — DocumentService
- [ ] `findAll()` — inject membership filter: loại document thuộc non-member projects
- [ ] `findById()` — check membership của project nếu document có `projectId`

### Phase 6 — WorkService
- [ ] `findAll()` — inject membership filter: loại work thuộc non-member projects
- [ ] `findById()` — check membership của project nếu work có `projectId`

---

## 5. Helper Logic Detail

### getMemberRole

```
Input: project, userId, userRole
Output: 'project.lead' | 'project.member' | null | 'super-admin'

Logic:
  if universe.owner → return 'super-admin'
  if organization.owner AND project.owner.orgId === context.orgId → return 'super-admin'
  find member in project.members where id === userId AND type === 'user'
  return member.role or null
```

### Global membership filter (Document/Work findAll)

```
1. Lấy tất cả project trong org: projects = Project.find({ orgId })
2. Phân loại:
   - memberProjectIds = projects mà user là member (hoặc super-admin)
   - nonMemberProjectIds = projects còn lại
3. Inject filter vào query:
   { $or: [
     { projectId: { $exists: false } },       // work/doc không thuộc project nào
     { projectId: { $in: memberProjectIds } }, // thuộc project user là member
   ]}
```

---

## 6. Notes & TODOs

- `// TODO: cross-validate agentId với AIWM service` — khi thêm agent member, chỉ validate ObjectId format, chưa call AIWM API
- `summary` field là optional, nếu không có thì non-member thấy empty string
- Project `members` hiện tại là `string[]` (userId) → migration: field mới replace hoàn toàn, không cần migrate data cũ vì chưa có data production
- Org scope enforcement: dựa vào `context.orgId` từ JWT, không cần query IAM

---

## 7. Files Affected

| File | Thay đổi |
|---|---|
| `modules/project/project.schema.ts` | Thêm `summary`, thay `members` type, thêm index |
| `modules/project/project.dto.ts` | Thêm DTOs cho member management |
| `modules/project/project.service.ts` | Access control, member CRUD methods |
| `modules/project/project.controller.ts` | Member endpoints |
| `modules/project/project-access.helper.ts` | **Mới** — utility functions |
| `modules/document/document.service.ts` | Global membership filter |
| `modules/work/work.service.ts` | Global membership filter |
