import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';

/**
 * Guard that validates service account permissions.
 * Must be used AFTER JwtAuthGuard (which populates request.user).
 *
 * - If request.user.type !== 'service_account' → bypass (user JWT not affected)
 * - If no @RequirePermission annotation → allow
 * - Otherwise → check request.user.permissions[] with wildcard support
 *
 * @example
 * @UseGuards(JwtAuthGuard, ServiceAccountPermissionGuard)
 * @RequirePermission('cbm', 'payment', 'createOne')
 */
@Injectable()
export class ServiceAccountPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Not a service account token → bypass completely, user JWT flow unaffected
    if (!user || user.type !== 'service_account') {
      return true;
    }

    const required = this.reflector.get<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );

    // No @RequirePermission on handler → allow
    if (!required) return true;

    return this.hasPermission(user.permissions || [], required);
  }

  private hasPermission(
    permissions: RequiredPermission[],
    required: RequiredPermission,
  ): boolean {
    return permissions.some((p) => {
      const serviceMatch = p.service === '*' || p.service === required.service;
      const resourceMatch = p.resource === '*' || p.resource === required.resource;
      const actionMatch = p.action === '*' || p.action === required.action;
      return serviceMatch && resourceMatch && actionMatch;
    });
  }
}
