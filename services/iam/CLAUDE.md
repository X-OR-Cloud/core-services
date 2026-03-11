# CLAUDE.md - IAM Service

## Service Overview

IAM (Identity & Access Management) is the core authentication and authorization service. Port 3001 (dev), 3310-3319 (prod).

Single mode: API (HTTP REST).

Handles user authentication (local JWT + Google OAuth 2.0 SSO), organization management, license-based access control, and node authentication for cross-service infrastructure.

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Auth | `src/modules/auth/` | Login, logout, token refresh, profile, node auth, Google OAuth 2.0 SSO |
| User | `src/modules/user/` | User CRUD, password management, RBAC role (single), Google user provisioning |
| Organization | `src/modules/organization/` | Organization CRUD, auto-license provisioning |
| License | `src/modules/license/` | Per-org per-service license management (disabled/limited/full) |
| App | `src/modules/app/` | SSO App configuration: domain whitelist, defaultOrgId, defaultRole for new Google SSO users |

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
- **Google SSO**: `GET /auth/google` → redirect Google consent → `GET /auth/google/callback` → JWT + refreshToken issued → redirect FE với token hoặc error code

#### Google SSO Flow
```
Browser → GET /auth/google
  → Passport redirects sang Google consent screen (scope: openid, email, profile)
  → Google redirects về GET /auth/google/callback?code=...
  → Passport validate: lấy googleId, email, displayName, avatarUrl
  → AuthService.handleGoogleCallback():
      - Lookup by googleId → existing user → login
      - Lookup by email (khác googleId) → email_conflict error
      - Không tìm thấy → auto-create user (password = null, provider = google)
      - Status suspended → account_suspended error
      - Google API fail/timeout → google_service_unavailable error
  → Redirect FE: /auth/callback?token=...&refreshToken=...
             hoặc /login?error=<error_code>
```

#### App-Based SSO (appId param)
Khi FE truyền `?appId=<id>` vào `GET /auth/google`, IAM sẽ encode `appId` vào OAuth state param và sau callback kiểm tra:
1. App tồn tại và `status = active`
2. App có `ssoEnabled = true`
3. Email domain của user có trong `allowedDomains`

Nếu hợp lệ và user mới: tự động tạo user với `defaultOrgId` và `defaultRole` từ App config.

#### Google SSO Error Codes
| Error Code | Nguyên nhân |
|------------|-------------|
| `csrf_detected` | State token không hợp lệ hoặc đã dùng |
| `google_access_denied` | User từ chối cấp quyền trên Google |
| `email_conflict` | Email đã tồn tại với local account |
| `account_suspended` | Tài khoản bị suspended |
| `google_service_unavailable` | Google API timeout hoặc lỗi 5xx |
| `app_not_found` | AppId không hợp lệ hoặc App không active |
| `sso_disabled` | App chưa bật SSO |
| `domain_not_allowed` | Email domain không trong allowedDomains của App |

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
  "licenses": { "iam": "full", "aiwm": "limited" },
  "provider": "local"
}
```
> `provider`: `"local"` (username/password) hoặc `"google"` (Google SSO)

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
- **Google OAuth 2.0**: Client credentials từ Google Cloud Console (cho Google SSO)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | No | `1h` | Access token expiration |
| `AIWM_SERVICE_URL` | Yes | — | AIWM service URL for node auth |
| `INTERNAL_API_KEY` | Yes | — | Inter-service API key |
| `GOOGLE_CLIENT_ID` | No* | — | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | No* | — | Google OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | No* | — | Google OAuth2 callback URL (e.g. `https://api.example.com/iam/auth/google/callback`) |
| `FE_BASE_URL` | No* | — | Frontend base URL để redirect sau SSO (e.g. `https://app.example.com`) |

> *Required nếu bật tính năng Google SSO

## Database Schema — User

Các trường mới được thêm cho Google SSO:

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `enum(local,google)` | Auth provider, default `local` |
| `googleId` | `string \| null` | Google account ID (sparse unique index) |
| `avatarUrl` | `string \| null` | Avatar URL từ Google profile |
| `lastLoginAt` | `Date \| null` | Thời điểm login gần nhất |

> `password` là nullable — Google users không có password.

## Commands

```bash
nx run iam:api    # API mode (REST)
nx run iam:build  # Build
```
