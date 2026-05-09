import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

const HEADER_NAME = 'x-internal-api-key';

/**
 * InternalApiKeyGuard
 *
 * Verifies the `X-Internal-API-Key` header against `process.env.INTERNAL_API_KEY`
 * using constant-time comparison (prevents timing attacks).
 *
 * Fail-secure: env not set → refuse all.
 *
 * Ref: docs/sys/PROPOSAL.md §7.3
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);
  private readonly expectedKey: string;
  private readonly expectedKeyBuffer: Buffer;

  constructor() {
    this.expectedKey = process.env['INTERNAL_API_KEY'] ?? '';
    this.expectedKeyBuffer = Buffer.from(this.expectedKey);
    if (!this.expectedKey) {
      this.logger.error(
        'INTERNAL_API_KEY env not set — internal endpoints will refuse ALL requests (fail-secure)',
      );
    }
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.expectedKey) {
      throw new UnauthorizedException();
    }

    const req = ctx.switchToHttp().getRequest();
    const provided = (req.headers?.[HEADER_NAME] as string) ?? '';

    if (provided.length !== this.expectedKey.length) {
      // Length mismatch → fail fast without timing leak (length itself is OK to compare)
      this.logger.warn('Internal endpoint API key length mismatch', { path: req.url });
      throw new UnauthorizedException();
    }

    const providedBuffer = Buffer.from(provided);
    if (!timingSafeEqual(providedBuffer, this.expectedKeyBuffer)) {
      this.logger.warn('Internal endpoint API key invalid', { path: req.url });
      // TODO P2: emit audit { resource: 'internal_endpoint', action: 'access_denied' }
      throw new UnauthorizedException();
    }

    return true;
  }
}
