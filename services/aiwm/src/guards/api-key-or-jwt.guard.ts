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
    const apiKeyHeader: string | undefined =
      request.headers['x-api-key'] ||
      request.headers['X-API-KEY'] ||
      request.headers['X-API-Key'];

    if (!authHeader && !apiKeyHeader) {
      throw new UnauthorizedException('Authorization header or API key is required');
    }

    return authHeader
      ? authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader
      : apiKeyHeader || '';
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
