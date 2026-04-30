import { SetMetadata } from '@nestjs/common';

export interface RequiredPermission {
  service: string;
  resource: string;
  action: string;
}

export const REQUIRE_PERMISSION_KEY = 'sa_permission';

/**
 * Annotate an endpoint with a required service-account permission.
 * Used together with ServiceAccountPermissionGuard.
 *
 * @example
 * @UseGuards(JwtAuthGuard, ServiceAccountPermissionGuard)
 * @RequirePermission('cbm', 'payment', 'createOne')
 */
export const RequirePermission = (service: string, resource: string, action: string) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { service, resource, action });
