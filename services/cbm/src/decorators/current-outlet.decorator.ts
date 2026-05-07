import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts outletId from the request (set by OutletContextMiddleware via x-outlet-id header).
 * Returns undefined if no outlet context is present.
 *
 * Usage:
 *   async myHandler(@CurrentOutlet() outletId: string | undefined) { ... }
 */
export const CurrentOutlet = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ outletId?: string }>();
    return request.outletId;
  },
);
