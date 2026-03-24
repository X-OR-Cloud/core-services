import { Injectable, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../modules/api-key/api-key.service';
import { ApiKeyOrJwtGuard } from './api-key-or-jwt.guard';

/**
 * CombinedAuthGuard
 *
 * Extends ApiKeyOrJwtGuard to add deployment-scoped API key validation.
 * Extracts deploymentId from URL param :id and passes it to validateKey
 * for scope checking.
 *
 * Used for: /deployments/:id/inference/* endpoints
 */
@Injectable()
export class CombinedAuthGuard extends ApiKeyOrJwtGuard implements CanActivate {
  constructor(
    apiKeyService: ApiKeyService,
    reflector: Reflector,
  ) {
    super(apiKeyService);
  }

  protected override getDeploymentId(request: any): string | undefined {
    return request.params?.id;
  }
}
