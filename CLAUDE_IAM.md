# CLAUDE_IAM.md

Guidance for AI Agent dedicated to maintaining the **IAM (Identity & Access Management)** service.

---

## Your Role

You are the dedicated maintainer of the IAM service (`services/iam/`). Your scope is limited to this service and its related documentation under `docs/iam/`. You may read (but not modify) shared libraries at `libs/base/` and `libs/shared/` when needed for context.

---

## Development Workflow

1. **Discuss** - Gather requirements, clarify scope
2. **Propose** - Create plan at `docs/iam/<feature>/`
3. **Approve** - Wait for confirmation before coding
4. **Branch** - Create git branch for the change
5. **Implement** - Execute the plan
6. **Verify** - Build, type-check, test

### Task Management

- Break work into micro-tasks (one file, one function per task)
- Mark each task done immediately after completion
- Keep responses concise, focused on current task

---

## Service Overview

| Key | Value |
|-----|-------|
| Path | `services/iam/` |
| Port (dev) | 3001 |
| Port (prod) | 3310–3319 |
| Database | `core_iam` (MongoDB + Mongoose) |
| Mode | `api` (single mode, REST only) |
| Entry | `src/main.ts` |

---

## Commands

```bash
# Build & verify
nx run iam:build
npx tsc --noEmit -p services/iam/tsconfig.app.json
nx lint iam
nx test iam

# Run
nx run iam:api    # REST API server (port 3001)

# Quick health check
curl http://localhost:3001/health
open http://localhost:3001/api-docs
```

---

## Modules

| Module | Path | Description |
|--------|------|-------------|
| **auth** | `src/modules/auth/` | Login, logout, token refresh, profile, node auth, Google OAuth 2.0 SSO |
| **user** | `src/modules/user/` | User CRUD, password management, single RBAC role, Google user provisioning |
| **organization** | `src/modules/organization/` | Organization CRUD, auto-license provisioning |
| **license** | `src/modules/license/` | Per-org per-service license (disabled/limited/full) |
| **app** | `src/modules/app/` | SSO App config: domain whitelist, defaultOrgId, defaultRole for new Google SSO users |
| **setup** | `src/modules/setup/` | Initial data initialization |

---

## Authentication Flows

### Local JWT Flow
- Login: `POST /auth/login` → access token (default 1h) + refresh token (7 days, in-memory)
- Refresh: `POST /auth/refresh` → new access token with updated licenses from DB (passive license sync)
- Logout: access token blacklisted until expiry + refresh token revoked

### Node Authentication
- `POST /auth/node`: apiKey/secret → verify via AIWM `POST /nodes/verify-credentials` → Node JWT (7 days)

### Google SSO Flow
```
Browser → GET /auth/google
  → Passport redirects to Google consent screen (scope: openid, email, profile)
  → Google redirects to GET /auth/google/callback?code=...
  → AuthService.handleGoogleCallback():
      - Lookup by googleId → existing user → login
      - Lookup by email (different googleId) → email_conflict error
      - Not found → auto-create user (password = null, provider = google)
      - Status suspended → account_suspended error
  → Redirect FE: /auth/callback?token=...&refreshToken=...
               or /login?error=<error_code>
```

#### App-Based SSO (appId param)
When FE passes `?appId=<id>` to `GET /auth/google`, IAM encodes `appId` in OAuth state and after callback checks:
1. App exists and `status = active`
2. App has `ssoEnabled = true`
3. User email domain is in `allowedDomains`

If valid and new user: auto-creates with `defaultOrgId` and `defaultRole` from App config.

#### Google SSO Error Codes

| Error Code | Cause |
|------------|-------|
| `csrf_detected` | Invalid or reused state token |
| `google_access_denied` | User denied consent on Google |
| `email_conflict` | Email already exists with local account |
| `account_suspended` | Account is suspended |
| `google_service_unavailable` | Google API timeout or 5xx error |
| `app_not_found` | Invalid appId or App not active |
| `sso_disabled` | App has SSO disabled |
| `domain_not_allowed` | Email domain not in App's allowedDomains |

---

## JWT Payload Structure

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

`provider`: `"local"` (username/password) or `"google"` (Google SSO)

---

## Guards & Decorators

| Guard / Decorator | Purpose |
|-------------------|---------|
| `JwtAuthGuard` | Validates JWT token |
| `UniverseRoleGuard` + `@RequireUniverseRole()` | Restricts to `universe.owner` |
| `LicenseGuard` + `@RequireLicense(type)` | Checks org license for a service |
| `@CurrentUser()` | Injects `RequestContext` (userId, orgId, roles, licenses) |

---

## Organization → License Auto-Provisioning

Creating an organization auto-creates default licenses (`type: full`) for all registered services: `iam`, `cbm`, `aiwm`, `noti`, `mona`, `template`. License creation failure does **not** block org creation.

---

## Password Security

- BCrypt (10 salt rounds)
- Policy: 8–15 chars, uppercase + lowercase + number + special char
- Base64-encoded reference stored alongside hash
- Google users have `password = null`

---

## Database Collections

| Collection | Schema | Notes |
|------------|--------|-------|
| `users` | User | `provider`, `googleId` (sparse unique), `avatarUrl`, `lastLoginAt` |
| `organizations` | Organization | Auto-creates licenses on creation |
| `licenses` | License | Per-org per-service |
| `apps` | App | SSO configuration (allowedDomains, defaultOrgId, defaultRole) |

### User Schema — Google SSO Fields

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `enum(local,google)` | Auth provider, default `local` |
| `googleId` | `string \| null` | Google account ID (sparse unique index) |
| `avatarUrl` | `string \| null` | Avatar URL from Google profile |
| `lastLoginAt` | `Date \| null` | Last login timestamp |

---

## External Integrations

| System | Config | Purpose |
|--------|--------|---------|
| MongoDB | `MONGODB_URI` | Database `core_iam` |
| Redis | `REDIS_*` | BullMQ event queue |
| AIWM Service | `AIWM_SERVICE_URL` | Node credential verification |
| Google OAuth 2.0 | `GOOGLE_CLIENT_*` | SSO authentication |

### BullMQ Events Published

| Queue | Events |
|-------|--------|
| `iam.events.noti` | `user.created`, `user.updated`, `user.deleted`, `organization.created`, `organization.updated`, `organization.deleted` |

---

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
| `GOOGLE_REDIRECT_URI` | No* | — | OAuth2 callback URL |
| `FE_BASE_URL` | No* | — | Frontend URL for SSO redirect |
| `REDIS_HOST` | No | — | Redis host |
| `REDIS_PORT` | No | — | Redis port |
| `REDIS_USERNAME` | No | — | Redis username |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_DB` | No | — | Redis database index |
| `PORT` | No | `3001` | HTTP server port |

> *Required when Google SSO feature is enabled

---

## Shared Library Usage

### From `@hydrabyte/base` (`libs/base/`)

- `BaseSchema`, `BaseService` — base classes
- `JwtAuthGuard`, `CombinedAuthGuard` — auth guards
- `@CurrentUser()` — request context decorator
- `parseQueryString` — query string to MongoDB filter
- `GlobalExceptionFilter`, `customQueryParser` — global middleware
- `HealthModule` — health check endpoint
- Swagger decorators: `ApiCreateErrors`, `ApiReadErrors`, etc.

### From `@hydrabyte/shared` (`libs/shared/`)

- `RequestContext` — user context type
- `COMMON_CONFIG.DatabaseNamePrefix` — DB name prefix (`core_`)
- `SERVICE_CONFIG.iam` — IAM-specific config
- `buildMongoUri()` — MongoDB connection builder
- `ServiceName.IAM` — service enum

---

## Documentation Index

| Doc | Path |
|-----|------|
| User overview | `docs/iam/user/OVERVIEW.md` |
| Organization overview | `docs/iam/organization/OVERVIEW.md` |
| License API | `docs/iam/LICENSE-API.md` |

---

## Important Conventions

1. **Refresh token = passive license sync** — every token refresh re-reads licenses from DB
2. **Node JWT is long-lived** (7 days) — issued to AIWM worker nodes, not users
3. **Google users have no password** — never prompt for password, guard update password endpoints
4. **Email uniqueness** is global across `local` and `google` providers
5. **License failures don't block** org creation — log and continue
6. **Blacklist on logout** — access tokens must be invalidated until natural expiry
7. **Soft delete only** — users and orgs use `isDeleted`, never hard delete
