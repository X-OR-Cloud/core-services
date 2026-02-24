# Organization Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/iam/src/modules/organization/
├── organization.schema.ts      # MongoDB schema (extends BaseSchema)
├── organization.dto.ts         # DTOs: Create, Update
├── organization.service.ts     # Business logic (extends BaseService)
├── organization.controller.ts  # REST API endpoints
└── organization.module.ts      # NestJS module (imports: LicenseModule)
```

## 2. Schema Fields

```
Organization extends BaseSchema:
  name: string (required)
  description: string (optional)
  // Inherited from BaseSchema: status, owner, createdBy, updatedBy, isDeleted, metadata, timestamps
```

> Schema rất đơn giản — chỉ 2 fields riêng. Business logic chính nằm ở auto-license provisioning khi tạo org.

## 3. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/organizations` | JWT + UniverseRoleGuard | Create organization → auto-create default licenses |
| GET | `/organizations` | JWT + UniverseRoleGuard | List organizations + statistics (byStatus, byType) |
| GET | `/organizations/:id` | JWT + UniverseRoleGuard | Get single organization |
| PUT | `/organizations/:id` | JWT + UniverseRoleGuard | Update organization |
| DELETE | `/organizations/:id` | JWT + UniverseRoleGuard | Soft delete organization |

**Access Control**: Tất cả endpoints yêu cầu `universe.owner` role via `@RequireUniverseRole()` + `UniverseRoleGuard`.

## 4. DTOs

### CreateOrganizationDTO
```
name: string (required, pattern: [a-zA-Z0-9-]+)
description: string (optional)
```

### UpdateOrganizationDTO
```
name?: string (pattern: [a-z0-9-]+)
description?: string
```

> **Lưu ý**: Create cho phép uppercase (`[a-zA-Z0-9-]+`), Update chỉ cho phép lowercase (`[a-z0-9-]+`).

## 5. Business Logic

### Auto-License Provisioning (create)

Khi tạo organization mới, service tự động tạo default licenses cho tất cả registered services:

```
Organization.create()
  → super.create() — lưu org vào DB
  → LicenseService.createDefaultLicenses({ orgId, notes })
    → Tạo license type=full cho: iam, cbm, aiwm, noti, mona, template
    → Failure does NOT block org creation (try/catch, log error)
```

### Search & Statistics (findAll)

`findAll()` override hỗ trợ:
- **Search**: `?filter[search]=keyword` → regex match trên `name` và `description` (case-insensitive)
- **Content exclusion**: Loại bỏ `content` field từ response để giảm payload size
- **Statistics aggregation**: Trả thêm `statistics.byStatus` và `statistics.byType` trong response

**Response structure**:
```json
{
  "data": [...],
  "pagination": { "total": 10, "page": 1, "limit": 10 },
  "statistics": {
    "total": 10,
    "byStatus": { "active": 8, "inactive": 2 },
    "byType": { "enterprise": 5, "starter": 5 }
  }
}
```

## 6. Dependencies

- **LicenseModule**: Import trực tiếp — dùng `LicenseService.createDefaultLicenses()` khi tạo org
- **BaseService**: Kế thừa CRUD operations, pagination, soft delete, audit trail
- **UniverseRoleGuard**: Từ `@hydrabyte/base` — restrict tất cả endpoints cho universe.owner

## 7. Related Modules

- **License module** (`src/modules/license/`): Organization tạo ra → auto-provision licenses. License quản lý access control per-service per-org.
- **User module** (`src/modules/user/`): Users thuộc organization thông qua `owner.orgId`. Org context xác định scope của user operations.
- **Auth module** (`src/modules/auth/`): Login flow lấy `orgId` từ user's owner context → fetch licenses cho JWT payload.
