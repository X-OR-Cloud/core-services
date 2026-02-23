# Work Module - v1.0 Roadmap

> Last updated: 2026-02-24
> Status: Planning — P0 planned

## Decisions Made

### Documents Field Removal

Trường `documents: string[]` sẽ bị loại bỏ.

**Lý do:**
- Document module đã có `projectId` để liên kết với project — không cần array IDs trên Work
- Trường `documents` lưu trữ array of document IDs nhưng không có referential integrity (không validate document tồn tại)
- Quan hệ work ↔ document nên được quản lý qua query (filter documents theo context) thay vì embedded array
- Giảm complexity của schema và DTOs
- Phù hợp với pattern đã áp dụng cho Project module (đã loại bỏ `documents[]`)

**Impact:**
- Schema: Xóa field `documents` khỏi `work.schema.ts`
- DTOs: Xóa `documents` khỏi `CreateWorkDto` và `UpdateWorkDto`
- API: Clients không còn gửi/nhận `documents` field
- Migration: Không cần — field bị bỏ qua, existing data không bị ảnh hưởng

### Status Validation on Create

Trường `status` trong `CreateWorkDto` sẽ bị loại bỏ.

**Lý do:**
- Service đã override `create()` để force `status = 'backlog'`
- Cho phép client gửi `status` khi create gây nhầm lẫn (giá trị bị override)
- Phù hợp với pattern đã áp dụng cho Document module và Project module

**Impact:**
- DTOs: Xóa `status` khỏi `CreateWorkDto`
- API: Clients không còn gửi `status` khi tạo work
- Comment giải thích status handling trong DTO

---

## Implementation Plan

### P0 — Schema Cleanup

#### P0-1: Remove `documents` from Schema
- [ ] Xóa `@Prop({ type: [String], default: [] }) documents` khỏi `work.schema.ts`

#### P0-2: Remove `documents` from DTOs
- [ ] Xóa `documents` field khỏi `CreateWorkDto` trong `work.dto.ts`
- [ ] Xóa `documents` field khỏi `UpdateWorkDto` trong `work.dto.ts`

#### P0-3: Update Documentation
- [ ] Cập nhật `docs/cbm/work/OVERVIEW.md` — remove `documents`
- [ ] Cập nhật `docs/cbm/work/FRONTEND-API.md` — remove `documents`

### P1 — Planned Improvements

#### P1-1: Status Validation on Create
- [ ] Xóa `status` khỏi `CreateWorkDto` (status luôn là `backlog` khi create)
- [ ] Thêm comment giải thích trong DTO

#### P1-2: Statistics Enhancement
- [ ] Thêm `byProject` aggregation trong `findAll()` khi có projectId filter

### P2 — Future

#### P2-1: Entity Validation
- [ ] Validate reporter/assignee tồn tại bằng cách gọi IAM/AIWM service (hiện tại chỉ check ObjectId format)

#### P2-2: Dependency Cycle Detection
- [ ] Kiểm tra circular dependencies khi thêm dependency
- [ ] Prevent self-referencing dependency

#### P2-3: Due Date Warnings
- [ ] Notification khi work sắp đến hạn
- [ ] Highlight overdue works trong list response

---

## Notes

- Work module có state machine phức tạp (7 statuses, 9 actions) — thay đổi cần cẩn thận
- Epic status tự động tính dựa trên child tasks — không nên thay đổi logic này
- `documents` field hiện tại chỉ lưu trữ, không có validation hay query logic — safe to remove
- Pattern loại bỏ `documents[]` đã áp dụng thành công cho Project module
