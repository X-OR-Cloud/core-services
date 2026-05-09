import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ipRangeCheck: (ip: string, cidr: string | string[]) => boolean = require('ip-range-check');

/**
 * CidrAllowlistGuard
 *
 * Restricts internal endpoints to source IPs within `SYS_INTERNAL_CIDR_ALLOWLIST`
 * (comma-separated CIDR list, supports IPv4 + IPv6).
 *
 * Fail-secure: empty allowlist → refuse all (logs error so misconfig is loud).
 *
 * Trust proxy must be configured correctly in main.ts so `req.ip` reflects the
 * real client IP, not the load balancer's.
 *
 * Ref: docs/sys/PROPOSAL.md §7.2
 */
@Injectable()
export class CidrAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(CidrAllowlistGuard.name);
  private readonly allowlist: string[];

  constructor() {
    const raw = process.env['SYS_INTERNAL_CIDR_ALLOWLIST'] ?? '';
    this.allowlist = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (this.allowlist.length === 0) {
      this.logger.error(
        'SYS_INTERNAL_CIDR_ALLOWLIST is empty — internal endpoints will refuse ALL requests (fail-secure)',
      );
    } else {
      this.logger.log(`CIDR allowlist loaded: ${this.allowlist.join(', ')}`);
    }
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const clientIp = (req.ip as string) || '';

    if (this.allowlist.length === 0) {
      this.logger.warn('Internal endpoint rejected — allowlist is empty', {
        ip: clientIp,
        path: req.url,
      });
      throw new ForbiddenException();
    }

    if (!ipRangeCheck(clientIp, this.allowlist)) {
      this.logger.warn('Internal endpoint CIDR rejected', {
        ip: clientIp,
        path: req.url,
        userAgent: req.headers?.['user-agent'],
      });
      // TODO P2: emit audit { resource: 'internal_endpoint', action: 'access_denied' }
      throw new ForbiddenException();
    }

    return true;
  }
}
