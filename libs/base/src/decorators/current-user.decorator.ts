import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '@hydrabyte/shared';
import { UNIVERSE_SCOPE_ONLY_KEY } from './universe-scope-only.decorator';

/**
 * Validates if a string is a valid MongoDB ObjectId format
 * @param id - String to validate
 * @returns true if valid ObjectId format (24 hex characters)
 */
function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Extract RequestContext from the authenticated user in the request
 *
 * This decorator extracts the JWT payload from the request and maps it to RequestContext
 * for use with BaseService methods that require permission checking and ownership enforcement.
 *
 * **Special behavior for universe.* roles:**
 * - Users with `universe.*` roles can override orgId via `X-Organization-Id` header
 * - When orgId is overridden, role is changed to `organization.owner` for scoped behavior
 * - This allows universe admins to operate as if they belong to that organization
 * - The header value must be a valid MongoDB ObjectId format
 * - If header is missing or invalid, falls back to orgId from JWT token
 *
 * **Endpoint-level control:**
 * - Use `@UniverseScopeOnly()` to ignore header and keep universe scope
 * - Use `@RequireUniverseRole()` to restrict access to universe users only
 *
 * @example
 * ```typescript
 * @Post()
 * @UseGuards(JwtAuthGuard)
 * async create(
 *   @Body() dto: CreateCategoryDto,
 *   @CurrentUser() context: RequestContext
 * ) {
 *   return this.service.create(dto, context);
 * }
 * ```
 *
 * @example Universe admin with orgId override
 * ```bash
 * curl -X GET "http://localhost:3000/api/resource" \
 *   -H "Authorization: Bearer <universe-user-token>" \
 *   -H "X-Organization-Id: 507f1f77bcf86cd799439011"
 * # Result: Behaves as organization.owner of that org
 * ```
 *
 * @see UniverseScopeOnly To disable header override for specific endpoints
 * @see RequireUniverseRole To restrict endpoints to universe users only
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // From JWT strategy
    const handler = ctx.getHandler();

    // Create Reflector instance to read metadata
    const reflector = new Reflector();

    // Check if endpoint is marked as universe-scope-only
    const isUniverseScopeOnly = reflector.getAllAndOverride<boolean>(
      UNIVERSE_SCOPE_ONLY_KEY,
      [handler, ctx.getClass()],
    );

    if (!user) {
      // Return empty context if no user (should not happen with auth guard)
      return {
        userId: '',
        roles: [],
        orgId: '',
        groupId: '',
        agentId: '',
        appId: '',
      } as RequestContext;
    }

    // Map JWT payload to RequestContext
    let context: RequestContext = {
      userId: user.type === 'agent' ? '' : (user.sub || user.userId || ''),
      roles: user.roles || [],
      orgId: user.orgId || '',
      groupId: user.groupId || '',
      agentId: user.agentId || '',
      appId: user.appId || '',
      licenses: user.licenses || {}, // License map from JWT
    };

    // 🔐 SECURITY: Only universe.* roles can override orgId
    const hasUniverseRole = context.roles.some((role) =>
      String(role).startsWith('universe.')
    );

    // Only process header override if NOT a universe-scope-only endpoint
    if (hasUniverseRole && !isUniverseScopeOnly) {
      // Check for orgId override from headers (case-insensitive)
      // Support both x-organization-id and X-Organization-Id
      const headers = request.headers;
      const headerOrgId =
        headers['x-organization-id'] || headers['X-Organization-Id'];

      if (headerOrgId && typeof headerOrgId === 'string') {
        // Validate MongoDB ObjectId format
        if (isValidObjectId(headerOrgId)) {
          // TODO: Implement audit log for orgId override events
          // Should include: timestamp, userId, originalOrgId, overrideOrgId, endpoint, method
          console.log('[CurrentUser] Universe user impersonating organization.owner:', {
            userId: context.userId,
            originalRole: context.roles,
            originalOrgId: context.orgId,
            impersonateOrgId: headerOrgId,
            path: request.path,
            method: request.method,
          });

          // Override orgId AND role to behave as organization.owner
          context.orgId = headerOrgId;
          context.roles = ['organization.owner' as any]; // Impersonate org owner
        } else {
          // Invalid ObjectId format - log warning but continue with original orgId
          console.warn('[CurrentUser] Invalid X-Organization-Id format, using token orgId:', {
            userId: context.userId,
            invalidHeader: headerOrgId,
            tokenOrgId: context.orgId,
          });
        }
      }
    } else if (isUniverseScopeOnly) {
      console.log('[CurrentUser] Universe-scope-only endpoint, ignoring X-Organization-Id header:', {
        userId: context.userId,
        path: request.path,
      });
    }

    return context;
  },
);
