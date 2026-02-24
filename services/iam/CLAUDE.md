# CLAUDE.md - IAM Service

## Service Overview

IAM (Identity & Access Management) is the core authentication and authorization service. Port 3001 (dev), 3310-3319 (prod).

Single mode: API (HTTP REST).

Handles user authentication (JWT), organization management, license-based access control, and node authentication for cross-service infrastructure.

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Auth | `src/modules/auth/` | Login, logout, token refresh, profile, node auth |
| User | `src/modules/user/` | User CRUD, password management, RBAC role (single) |
| Organization | `src/modules/organization/` | Organization CRUD, auto-license provisioning |
| License | `src/modules/license/` | Per-org per-service license management (disabled/limited/full) |

## Module-Specific Documentation

When working on a specific module, read the corresponding docs:

- **User module**: Read `docs/iam/user/OVERVIEW.md`
- **Organization module**: Read `docs/iam/organization/OVERVIEW.md`
- **License module**: Read `docs/iam/LICENSE-API.md`

## Key Architecture Patterns

### Authentication Flow
- **User login**: Username/password → JWT access token (configurable expiry, default 1h) + refresh token (7 days, in-memory storage)
- **Token refresh**: Refresh token → new access token with **updated licenses** from DB (passive license sync)
- **Logout**: Access token blacklisted until expiry + refresh token revoked
- **Node login**: apiKey/secret → verify via AIWM `/nodes/verify-credentials` → JWT (7 days)

### JWT Payload Structure
```json
{
  "sub": "userId",
  "username": "email",
  "status": "active",
  "roles": ["universe.owner"],
  "orgId": "...",
  "groupId": "...",
  "agentId": "...",
  "appId": "...",
  "licenses": { "iam": "full", "aiwm": "limited" }
}
```

### Guards & Decorators
- `JwtAuthGuard` — Validates JWT token
- `UniverseRoleGuard` + `@RequireUniverseRole()` — Restricts to `universe.owner`
- `LicenseGuard` + `@RequireLicense(type)` — Checks org license for service
- `@CurrentUser()` — Injects `RequestContext` (userId, orgId, roles, licenses)
- `@UniverseScopeOnly()` — Restricts to universe-level scope

### Organization → License Auto-Provisioning
Creating an organization auto-creates default licenses (`type: full`) for all registered services (iam, cbm, aiwm, noti, mona, template). License creation failure does **not** block org creation.

### Password Security
- BCrypt (10 salt rounds) for hashing
- Policy: 8-15 chars, uppercase + lowercase + number + special char
- Base64-encoded reference stored alongside hash

## Dependencies

- **AIWM Service** (`AIWM_SERVICE_URL`): Node credential verification for `POST /auth/node`
- **Internal API Key** (`INTERNAL_API_KEY`): Service-to-service authentication header
- **MongoDB** (`MONGODB_URI`): Database `{prefix}iam` with collections: users, organizations, licenses

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | No | `1h` | Access token expiration |
| `AIWM_SERVICE_URL` | Yes | — | AIWM service URL for node auth |
| `INTERNAL_API_KEY` | Yes | — | Inter-service API key |

## Commands

```bash
nx run iam:api    # API mode (REST)
nx run iam:build  # Build
```
