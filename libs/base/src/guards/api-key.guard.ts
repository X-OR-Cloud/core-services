import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ApiKeyGuard - Service-to-service authentication guard
 *
 * Validates X-API-Key header against INTERNAL_API_KEY environment variable
 * Used for internal API endpoints that should only be called by other services
 *
 * Usage:
 * @UseGuards(ApiKeyGuard)
 * async internalEndpoint() { }
 *
 * Environment variable required:
 * INTERNAL_API_KEY=your-secure-random-key-here
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const expectedApiKey = this.configService.get('INTERNAL_API_KEY');

    if (!apiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
