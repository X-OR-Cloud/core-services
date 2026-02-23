# Project Module - v1.0 Roadmap

> Last updated: 2026-02-24
> Status: P0 + P1-1 completed — P1-2 needs inter-service communication

## Decisions Made

### Documents Field Removal

Trường `documents: string[]` trong Project schema sẽ bị loại bỏ.

**Lý do:**
- Project không nên quản lý trực tiếp document IDs — đây là quan hệ ngược (document/content thuộc về project, không phải project chứa danh sách document IDs)
- Content module (mới) thay thế Document module (legacy) cho multimedia content
- Liên kết project ↔ content/document nên được quản lý qua `projectId` trên document/content schema (foreign key pattern), không phải array of IDs trên project

**Impact:**
- Schema: Xóa field `documents` khỏi `project.schema.ts`
- DTOs: Xóa `documents` khỏi `CreateProjectDto` và `UpdateProjectDto`
- API: Clients không còn gửi/nhận `documents` array
- Migration: Field sẽ bị bỏ qua (không cần migrate data vì chưa có production data phụ thuộc)

### Rename `dueDate` → `endDate`

Đổi tên field `dueDate` thành `endDate` cho nhất quán với `startDate`.

**Lý do:**
- Cặp `startDate` / `endDate` rõ nghĩa và đối xứng hơn `startDate` / `dueDate`
- `endDate` phổ biến hơn trong project management schemas

**Impact:**
- Schema: Rename `dueDate` → `endDate` trong `project.schema.ts`
- DTOs: Rename trong `CreateProjectDto` và `UpdateProjectDto`
- API: Clients cập nhật field name trong request/response
- Migration: Rename field trong MongoDB (nếu có existing data)

---

## Implementation Plan

### P0 — Schema Cleanup ✅ COMPLETED

#### P0-1: Remove `documents` from Schema ✅
- [x] Xóa `@Prop({ type: [String], default: [] }) documents` khỏi `project.schema.ts`

#### P0-2: Remove `documents` from DTOs ✅
- [x] Xóa `documents` field khỏi `CreateProjectDto` trong `project.dto.ts`
- [x] Xóa `documents` field khỏi `UpdateProjectDto` trong `project.dto.ts`

#### P0-3: Rename `dueDate` → `endDate` in Schema ✅
- [x] Rename `dueDate` → `endDate` trong `project.schema.ts`

#### P0-4: Rename `dueDate` → `endDate` in DTOs ✅
- [x] Rename `dueDate` → `endDate` trong `CreateProjectDto`
- [x] Rename `dueDate` → `endDate` trong `UpdateProjectDto`

#### P0-5: Update Documentation ✅
- [x] Cập nhật `docs/cbm/project-api.md` — loại bỏ `documents`, rename `dueDate` → `endDate`
- [x] Cập nhật `docs/cbm/project/OVERVIEW.md` — loại bỏ `documents`, rename `dueDate` → `endDate`

### P1 — Planned Improvements

#### P1-1: Status Validation on Create ✅
- [x] Force `status: 'draft'` khi create — override `create()` trong `ProjectService`
- [x] Xóa `status` field khỏi `CreateProjectDto` và `UpdateProjectDto` (status chỉ thay đổi qua action endpoints)

#### P1-2: Member Validation
- [ ] Validate member IDs tồn tại trong IAM service
- [ ] Dependency: Inter-service communication (HTTP hoặc message queue)

### P2 — Future

#### P2-1: Project Statistics Enhancement
- [ ] Thêm `byMemberCount` hoặc `byTag` aggregation trong `findAll()`
- [ ] Work count per project trong statistics

#### P2-2: Project Templates
- [ ] Cho phép tạo project từ template (pre-filled fields, default members, tags)
- [ ] Template schema + API

---

## Notes

- Content module sẽ sử dụng `projectId` để liên kết content với project (thay vì `documents` array trên project)
- Sau khi P0 hoàn thành, cập nhật frontend để không gửi `documents` field
