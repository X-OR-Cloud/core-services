# Document Module - v1.0 Roadmap

> Last updated: 2026-02-24
> Status: P0 + P1-1 completed — P1-2 planned

## Decisions Made

### Scope Field Removal

Trường `scope: 'public' | 'org' | 'private'` sẽ bị loại bỏ.

**Lý do:**
- Access control đã được xử lý bởi `owner.orgId` filter trong mọi query (tenant isolation)
- Trường `scope` không được sử dụng trong bất kỳ logic nào — chỉ lưu trữ nhưng không enforce
- Làm đơn giản schema và giảm nhầm lẫn cho frontend (tưởng rằng scope đang hoạt động)
- Nếu cần access control chi tiết hơn trong tương lai, sẽ thiết kế hệ thống permission riêng

**Impact:**
- Schema: Xóa field `scope` khỏi `document.schema.ts`
- DTOs: Xóa `scope` khỏi `CreateDocumentDto` và `UpdateDocumentDto`
- API: Clients không còn gửi/nhận `scope` field
- Migration: Không cần — field bị bỏ qua, existing data không bị ảnh hưởng

### Add `projectId` Field

Thêm trường `projectId` (optional) để liên kết document với project.

**Lý do:**
- Thay thế cách tiếp cận cũ (project chứa array `documents[]` IDs) bằng foreign key pattern
- Document biết thuộc project nào → dễ query, dễ quản lý
- Phù hợp với pattern đã áp dụng cho Content module (`projectId` trên content schema)
- Optional vì document có thể tồn tại độc lập (không thuộc project nào)

**Impact:**
- Schema: Thêm field `projectId?: string` vào `document.schema.ts` + index
- DTOs: Thêm `projectId` vào `CreateDocumentDto` và `UpdateDocumentDto`
- API: Clients có thể gửi `projectId` khi tạo/cập nhật, filter theo `projectId` khi list
- Service: findAll hỗ trợ `filter[projectId]`

---

## Implementation Plan

### P0 — Schema Cleanup ✅ COMPLETED

#### P0-1: Remove `scope` from Schema ✅
- [x] Xóa `@Prop({ enum: ['public', 'org', 'private'], default: 'private' }) scope` khỏi `document.schema.ts`

#### P0-2: Remove `scope` from DTOs ✅
- [x] Xóa `scope` field khỏi `CreateDocumentDto` trong `document.dto.ts`
- [x] Xóa `scope` field khỏi `UpdateDocumentDto` trong `document.dto.ts`

#### P0-3: Add `projectId` to Schema ✅
- [x] Thêm `@Prop({ type: String }) projectId?: string` vào `document.schema.ts`
- [x] Thêm index `{ projectId: 1 }`

#### P0-4: Add `projectId` to DTOs ✅
- [x] Thêm `projectId` (optional) vào `CreateDocumentDto`
- [x] Thêm `projectId` (optional) vào `UpdateDocumentDto`

#### P0-5: Update Documentation ✅
- [x] Cập nhật `docs/cbm/document/OVERVIEW.md` — remove `scope`, add `projectId`
- [x] Cập nhật `docs/cbm/document/FRONTEND-API.md` — remove `scope`, add `projectId`

### P1 — Planned Improvements

#### P1-1: Status Validation on Create ✅
- [x] Force `status: 'draft'` khi create — override `create()` trong `DocumentService`
- [x] Xóa `status` khỏi `CreateDocumentDto` (status chỉ thay đổi qua PATCH update)

#### P1-2: Statistics Enhancement
- [ ] Thêm `byProject` aggregation trong `findAll()` khi có projectId filter

### P2 — Future

#### P2-1: Content Versioning
- [ ] Lưu history của content changes
- [ ] Cho phép revert về version trước

#### P2-2: Content Size Limit
- [ ] Thêm max size validation cho content field
- [ ] Cảnh báo khi content quá lớn

---

## Notes

- Document module hiện tại là text-based. Content module xử lý multimedia (images, videos, audio)
- Cả Document và Content đều sẽ dùng `projectId` để liên kết với Project (thay vì array on project)
- `scope` field đang default `'private'` nhưng không enforce — safe to remove
