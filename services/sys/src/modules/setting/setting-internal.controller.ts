import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigKey } from '@hydrabyte/shared';
import {
  CidrAllowlistGuard,
  InternalApiKeyGuard,
  SecretRateLimitGuard,
} from '../../guards';
import { SettingService } from './setting.service';
import { SETTING_METADATA } from './constants';

/**
 * Setting Internal Controller — service-to-service consumption.
 *
 * NOT exposed in Swagger (UI tools shouldn't call these).
 *
 * Auth chain (PROPOSAL §7):
 *   CidrAllowlistGuard → InternalApiKeyGuard → [SecretRateLimitGuard for /secret/*]
 *
 * Two endpoints:
 *   - GET /settings/internal/:key            — non-sensitive fallback (lib normally
 *                                              reads Mongo directly; this is a
 *                                              defensive fallback for cold-start
 *                                              or Mongo read failure)
 *   - GET /settings/internal/secret/:key     — sensitive read (lib MUST use this
 *                                              path, never Mongo direct)
 *
 * Both endpoints accept `?orgId=` query for org-scoped lookup; when omitted, only
 * global scope is consulted.
 */
@ApiExcludeController()
@Controller('settings/internal')
@UseGuards(CidrAllowlistGuard, InternalApiKeyGuard)
export class SettingInternalController {
  constructor(private readonly service: SettingService) {}

  /**
   * Non-sensitive read. Returns 404 if the metadata says the key is sensitive
   * (caller must use /secret/:key instead — prevents accidental sensitive reads
   * via the wrong route).
   */
  @Get(':key')
  async read(
    @Param('key') key: ConfigKey,
    @Query('orgId') orgId?: string,
  ): Promise<{ key: string; value: string; scope: string; sensitive: boolean }> {
    const metadata = SETTING_METADATA[key];
    if (!metadata) {
      throw new NotFoundException(`Unknown setting key '${key}'`);
    }
    if (metadata.sensitive) {
      throw new NotFoundException(`Key '${key}' is sensitive — use /settings/internal/secret/${key}`);
    }

    return this.lookup(key, orgId);
  }

  /**
   * Sensitive read. Returns plaintext after CIDR + APIKey + RateLimit checks.
   * Each successful read should be audited (P2 — audit-log integration).
   */
  @Get('secret/:key')
  @UseGuards(SecretRateLimitGuard)
  async readSecret(
    @Param('key') key: ConfigKey,
    @Query('orgId') orgId?: string,
  ): Promise<{ key: string; value: string; scope: string; sensitive: boolean; readAt: string }> {
    const metadata = SETTING_METADATA[key];
    if (!metadata) {
      throw new NotFoundException(`Unknown setting key '${key}'`);
    }
    if (!metadata.sensitive) {
      throw new NotFoundException(`Key '${key}' is not sensitive — use /settings/internal/${key}`);
    }

    const result = await this.lookup(key, orgId);
    // TODO P2: emit audit { resource: 'secret', action: 'read', actor: { service, ipAddress }, resourceId: key, keyType: 'sensitive_setting' }
    return { ...result, readAt: new Date().toISOString() };
  }

  /**
   * Org → global fallback lookup, returns canonical { key, value, scope, sensitive }.
   * Throws 404 if neither org-specific nor global setting exists.
   */
  private async lookup(
    key: ConfigKey,
    orgId?: string,
  ): Promise<{ key: string; value: string; scope: string; sensitive: boolean }> {
    // Reuse SettingService.findByKey by injecting a minimal context. The service
    // method only uses context.orgId for the org-specific lookup branch.
    const fakeContext = {
      orgId: orgId ?? '',
      groupId: '',
      userId: '',
      agentId: '',
      appId: '',
      roles: [],
    } as any;
    const setting = await this.service.findByKey(key, fakeContext);
    if (!setting) {
      throw new NotFoundException(`Setting '${key}' not found (orgId=${orgId ?? '<none>'}, no global fallback)`);
    }
    return {
      key: setting.key,
      value: setting.value,
      scope: setting.scope,
      sensitive: setting.sensitive,
    };
  }
}
