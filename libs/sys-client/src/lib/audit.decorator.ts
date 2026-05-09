import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'sys-client:audit';

/**
 * Configuration for `@Audit()` decorator.
 *
 * `resource` and `action` are required — they form the fundamental "what
 * happened" filter for audit queries (e.g. resource=user, action=create).
 *
 * Ref: docs/sys/PROPOSAL.md §6.6
 */
export interface AuditConfig {
  /** Entity type acted upon, e.g. 'user', 'agent', 'document'. */
  resource: string;

  /** Verb, e.g. 'create', 'update', 'delete', 'login', 'export'. */
  action: string;

  /** Whether to capture body of request as `requestPayload` (sanitized). Default true. */
  capturePayload?: boolean;

  /** Whether to extract resourceId from response.id / response._id. Default true. */
  captureResourceId?: boolean;

  /** Optional override for keyType (set 'sensitive_setting' for secret reveals). */
  keyType?: 'setting' | 'sensitive_setting';
}

/**
 * Method decorator. Marks a controller route as auditable.
 *
 * Usage:
 *
 *   @Post()
 *   @Audit({ resource: 'user', action: 'create' })
 *   async createUser(@Body() dto, @CurrentUser() ctx) { ... }
 *
 * Combine with `AuditInterceptor` to actually emit events. The interceptor
 * can be applied per-controller (`@UseInterceptors(AuditInterceptor)`) or
 * globally via `app.useGlobalInterceptors(...)`.
 */
export const Audit = (config: AuditConfig) => SetMetadata(AUDIT_METADATA_KEY, config);
