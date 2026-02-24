# User Module - Technical Overview

> Last updated: 2026-02-24

## 1. File Structure

```
services/iam/src/modules/user/
├── user.schema.ts      # MongoDB schema (extends BaseSchema)
├── user.dto.ts         # DTOs: CreateUserData, UpdateUserData, ChangeRoleDto, ChangePasswordDto
├── user.service.ts     # Business logic (extends BaseService)
├── user.controller.ts  # REST API endpoints
└── user.module.ts      # NestJS module (standalone, no external imports)
```

## 2. Schema Fields

```
User extends BaseSchema:
  username: string (required, unique) — email format
  password: {
    hashedValue: string (required) — BCrypt hash
    algorithm: PasswordHashAlgorithms (required) — 'bcrypt'
    ref?: string — Base64-encoded reference (prefixed 'r')
  }
  role: string (required) — scope.role format (e.g. 'universe.owner', 'organization.owner')
  status: 'active' | 'inactive' | 'pending' (default: 'active')
  fullname?: string
  phonenumbers?: string[] — international formats (+84xxx, 0xxx, +1-xxx)
  address?: string
  metadata: UserMetadata (default: {})
    // Predefined: discordUserId, discordUsername, telegramUserId, telegramUsername
    // Extensible: [key: string]: any
  // Inherited from BaseSchema: owner, createdBy, updatedBy, isDeleted, timestamps
```

**Indexes**: Unique index on `username`.

## 3. User Statuses

| Status | Meaning |
|--------|---------|
| `active` | Default. User can login and perform actions |
| `inactive` | User disabled. Login blocked (auth service checks status=active) |
| `pending` | Awaiting activation |

## 4. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/users` | JWT + LicenseGuard (FULL) | Create user with hashed password |
| GET | `/users` | JWT | List users + statistics (byStatus) |
| GET | `/users/:id` | JWT | Get single user |
| PUT | `/users/:id` | JWT | Update user (status, fullname, phonenumbers, address, metadata) |
| DELETE | `/users/:id` | JWT | Soft delete user (with safety checks) |
| PATCH | `/users/:id/change-role` | JWT | Change role (org.owner only, org-level targets only) |
| PATCH | `/users/:id/change-password` | JWT | Change password (org.owner only) |

## 5. DTOs

### CreateUserData
```
username: string (required, email format)
password: string (required, 8-15 chars, uppercase + lowercase + number + special char)
role: string (required) — e.g. 'organization.owner'
status: UserStatuses (optional, default: 'active')
fullname?: string
phonenumbers?: string[] (phone format validation)
address?: string
metadata?: UserMetadata
```

### UpdateUserData
```
status?: UserStatuses
fullname?: string
phonenumbers?: string[]
address?: string
metadata?: UserMetadata
```

> **Lưu ý**: Update **không** cho phép thay đổi `username`, `password`, hoặc `role`.

### ChangeRoleDto
```
role: string (required, regex: ^organization\.(owner|editor|viewer)$)
```

> Chỉ cho phép gán role organization-level. Không thể gán role `universe.*` qua endpoint này.

### ChangePasswordDto
```
newPassword: string (required, same password policy as create)
```

## 6. Business Logic

### Password Handling (create)

```
User.create()
  → hashPasswordWithAlgorithm(password, BCrypt) — 10 salt rounds
  → encodeBase64(password) → prefix 'r' → store as password.ref
  → Set owner context from RequestContext (orgId, groupId, userId)
  → super.create()
```

### Search & Statistics (findAll)

`findAll()` override hỗ trợ:
- **Filter**: `?filter[fullname]=keyword` và `?filter[address]=keyword` → regex case-insensitive
- **Statistics**: Aggregation `byStatus` trả thêm trong response

**Response structure**:
```json
{
  "data": [...],
  "pagination": { "total": 10, "page": 1, "limit": 10 },
  "statistics": {
    "total": 10,
    "byStatus": { "active": 8, "inactive": 1, "pending": 1 }
  }
}
```

### Privilege Escalation Guard

Helper `assertNotEscalatingPrivilege()` áp dụng cho update, softDelete, changeRole, changePassword:

> Caller có role `organization.*` (và **không** có `universe.*`) → không được tác động user có role `universe.*`.

### Update (update)

`update()` override thêm privilege check:

```
update(id, data, context)
  → Find target user by ID
  → assertNotEscalatingPrivilege(context.roles, target.role)
  → super.update()
```

### Soft Delete Safety (softDelete)

`softDelete()` override với 3 safety checks:

1. **Self-deletion prevention**: User không thể xoá chính mình → `ForbiddenException`
2. **Privilege escalation guard**: Org-level user không thể xoá universe-level user
3. **Last org owner protection**: Nếu target user có `role === 'organization.owner'` và là owner cuối cùng trong org → `ForbiddenException` ("Please assign another owner first")

```
softDelete(id, context)
  → Check: id !== context.userId (self-deletion)
  → assertNotEscalatingPrivilege(context.roles, target.role)
  → Check: if target.role === 'organization.owner'
    → Count org owners in same org (owner.orgId, role: 'organization.owner', isDeleted: false)
    → If count <= 1 → block deletion
  → super.softDelete()
```

### Change Role (changeRole)

Chỉ `organization.owner` hoặc `universe.owner` có thể đổi role cho user khác:

```
changeRole(userId, dto, context)
  → Check: context.roles includes 'organization.owner' or 'universe.owner'
  → Find target user by ID
  → assertNotEscalatingPrivilege(context.roles, target.role)
  → Check: target user.owner.orgId === context.orgId (same org)
  → Check: userId !== context.userId (cannot change own role)
  → DTO validates: role must match organization.(owner|editor|viewer)
  → Update user.role
  → Save
```

### Change Password (changePassword)

Chỉ `organization.owner` hoặc `universe.owner` có thể change password cho user khác:

```
changePassword(userId, dto, context)
  → Check: context.roles includes 'organization.owner' or 'universe.owner'
  → Find target user by ID
  → assertNotEscalatingPrivilege(context.roles, target.role)
  → Check: target user.owner.orgId === context.orgId (same org)
  → Hash new password (BCrypt)
  → Update password object (hashedValue + ref)
  → Save
```

## 7. Password Policy

```
Regex: ^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@.#$!%*?&_-])[A-Za-z\d@.#$!%*?&_-]{8,15}$

Rules:
  - Length: 8-15 characters
  - Must contain: lowercase + uppercase + digit + special char
  - Allowed special chars: @ . # $ ! % * ? & _ -
```

## 8. Dependencies

- **BaseService**: Kế thừa CRUD, pagination, soft delete, audit trail, aggregate
- **Encryption utilities**: `hashPasswordWithAlgorithm()`, `encodeBase64()` từ `core/utils/`
- **LicenseGuard**: User creation yêu cầu `FULL` license type

## 9. Related Modules

- **Auth module** (`src/modules/auth/`): Login/logout dùng User model trực tiếp. Profile endpoints (get/update) query user collection. Auth service có riêng `changePassword()` cho self-change (yêu cầu old password).
- **Organization module** (`src/modules/organization/`): Users thuộc org qua `owner.orgId`. Org context xác định scope operations.
- **License module** (`src/modules/license/`): User creation bị gate bởi `LicenseGuard` — org phải có license `type: full` cho service IAM.

## 10. Auth Module — Change Password Comparison

Có 2 cách change password trong IAM:

| Feature | Auth: `POST /auth/change-password` | User: `PATCH /users/:id/change-password` |
|---------|-------------------------------------|------------------------------------------|
| Who calls | User tự đổi password cho mình | Org owner đổi password cho user khác |
| Old password required | Yes | No |
| Role required | Any authenticated user | `organization.owner` or `universe.owner` |
| Same-org check | N/A (self) | Yes — target must be in same org |
