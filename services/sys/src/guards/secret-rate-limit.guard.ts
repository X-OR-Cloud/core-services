import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

const DEFAULT_LIMIT = 10; // requests per window
const WINDOW_SEC = 60;

/**
 * SecretRateLimitGuard
 *
 * Rate-limits per (IP + key path param) for the secret-read endpoint.
 * Default 10 reads/minute (configurable via SYS_SECRET_READ_RATE_LIMIT env).
 *
 * Bucketed fixed-window via Redis INCR+EXPIRE — simple, low-overhead.
 *
 * Ref: docs/sys/PROPOSAL.md §7.4
 */
@Injectable()
export class SecretRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(SecretRateLimitGuard.name);
  private readonly limit: number;

  constructor(@InjectRedis() private readonly redis: Redis) {
    const raw = process.env['SYS_SECRET_READ_RATE_LIMIT'];
    this.limit = raw ? parseInt(raw, 10) : DEFAULT_LIMIT;
    if (isNaN(this.limit) || this.limit <= 0) {
      this.logger.warn(`Invalid SYS_SECRET_READ_RATE_LIMIT='${raw}', falling back to default ${DEFAULT_LIMIT}`);
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const ip = (req.ip as string) || 'unknown';
    const key = (req.params?.key as string) || 'unknown';
    const bucket = Math.floor(Date.now() / 1000 / WINDOW_SEC);
    const redisKey = `sys:rate_limit:secret:${ip}:${key}:${bucket}`;

    let count: number;
    try {
      count = await this.redis.incr(redisKey);
      if (count === 1) {
        // first hit in this bucket — set expiry so the key auto-cleans
        await this.redis.expire(redisKey, WINDOW_SEC + 5);
      }
    } catch (error: any) {
      // Redis failure → fail-open (allow request) but log loudly. Alternative
      // would be fail-closed; we choose fail-open because losing read access
      // to all secrets when Redis blips is worse than letting a few extra
      // requests through. CIDR + InternalApiKey guards still apply.
      this.logger.error('Rate limit Redis error — allowing request (fail-open)', {
        error: error.message,
        ip,
        key,
      });
      return true;
    }

    if (count > this.limit) {
      this.logger.warn('Secret rate limit exceeded', { ip, key, count, limit: this.limit });
      // TODO P2: emit audit { resource: 'secret', action: 'rate_limit_exceeded' }
      throw new HttpException(
        { statusCode: 429, message: 'Too many secret read requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
