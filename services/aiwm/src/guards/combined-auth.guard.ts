import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeyService } from '../modules/api-key/api-key.service';

const API_KEY_PREFIX = 'xai_';

/**
 * CombinedAuthGuard
 *
 * Supports two authentication methods for inference endpoints:
 * 1. API Key  — Authorization header starts with "Bearer xai_"
 * 2. JWT      — All other Bearer tokens (existing behavior)
 *
 * In both cases, `request.user` is populated with a compatible object
 * so that @CurrentUser() decorator works transparently downstream.
 */
@Injectable()
export class CombinedAuthGuard extends AuthGuard('jwt-auth') implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    reflector: Reflector,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const apiKeyHeader: string | undefined = request.headers['x-api-key'] || request.headers['X-API-KEY'] || request.headers['X-API-Key'];

    if (!authHeader && !apiKeyHeader) {
      throw new UnauthorizedException('Authorization header or API key is required');
    }

    const token = authHeader ?  (authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader) : apiKeyHeader || '';

    // ── API Key path ──────────────────────────────────────────────────────────
    if (token!== '' && token.startsWith(API_KEY_PREFIX)) {
      // Extract deploymentId from URL param :id
      const deploymentId: string | undefined = request.params?.id;

      // validateKey throws UnauthorizedException / ForbiddenException on failure
      const requestContext = await this.apiKeyService.validateKey(token, deploymentId);

      // Attach to request so @CurrentUser() can read it
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
