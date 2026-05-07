import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Reads the `x-outlet-id` header from incoming requests and attaches it to `req.outletId`.
 * Validation (existence, org ownership, active status) is done lazily in the route handler
 * via OutletService.validateOutletAccess() — not here.
 */
@Injectable()
export class OutletContextMiddleware implements NestMiddleware {
  use(req: Request & { outletId?: string }, res: Response, next: NextFunction) {
    const outletId = req.headers['x-outlet-id'];
    if (outletId && typeof outletId === 'string') {
      req.outletId = outletId;
    }
    next();
  }
}
