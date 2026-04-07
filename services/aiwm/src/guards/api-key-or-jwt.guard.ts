import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeyService } from '../modules/api-key/api-key.service';

export const API_KEY_PREFIX = 'xai_';

/**
 * ApiKeyOrJwtGuard
 *
 * Supports two authentication methods for any endpoint:
 * 1. API Key  — Authorization header starts with "Bearer xai_" or "x-api-key" header
 * 2. JWT      — All other Bearer tokens (existing behavior)
 *
 * In both cases, `request.user` is populated with a compatible object
 * so that @CurrentUser() decorator works transparently downstream.
 *
 * Unlike CombinedAuthGuard, this guard does NOT extract deploymentId from URL params.
 * Suitable for general-purpose endpoints like anonymous token generation.
 */
@Injectable()
export class ApiKeyOrJwtGuard extends AuthGuard('jwt-auth') implements CanActivate {
  constructor(protected readonly apiKeyService: ApiKeyService) {
    super();
  }

  protected extractToken(request: any): string {
    const authHeader: string | undefined = request.headers['authorization'];
    // Case-insensitive: Express normalizes headers to lowercase,
    // but check common casings for safety
    const apiKeyHeader: string | undefined =
      request.headers['x-api-key'];

    if (!authHeader && !apiKeyHeader) {
      throw new UnauthorizedException('Authorization header or API key is required');
    }

    if (authHeader) {
      return authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;
    }

    // x-api-key header present — inject as Authorization for Passport JWT fallback
    if (apiKeyHeader && !apiKeyHeader.startsWith(API_KEY_PREFIX)) {
      request.headers['authorization'] = `Bearer ${apiKeyHeader}`;
    }

    return apiKeyHeader || '';
  }

  /** Override in subclasses to pass additional context (e.g. deploymentId) to validateKey */
  protected getDeploymentId(_request: any): string | undefined {
    return undefined;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    // ── API Key path ──────────────────────────────────────────────────────────
    if (token !== '' && token.startsWith(API_KEY_PREFIX)) {
      const deploymentId = this.getDeploymentId(request);
      const requestContext = await this.apiKeyService.validateKey(token, deploymentId);

      request.user = {
        sub: requestContext.userId,
        userId: requestContext.userId,
        orgId: requestContext.orgId,
        groupId: requestContext.groupId,
        agentId: requestContext.agentId,
        appId: requestContext.appId,
        roles: requestContext.roles,
        type: 'api-key',
      };

      return true;
    }

    // ── JWT path (existing behavior) ──────────────────────────────────────────
    return super.canActivate(context) as Promise<boolean>;
  }
}
