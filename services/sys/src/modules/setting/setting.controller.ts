import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  parseQueryString,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  FindManyResult,
} from '@hydrabyte/base';
import { RequestContext, ConfigKey } from '@hydrabyte/shared';
import { SettingService } from './setting.service';
import {
  CreateSettingDto,
  UpdateSettingDto,
  InitializeSettingsDto,
  InitializeSettingsResponseDto,
  SettingDetailDto,
  SettingRevealResponseDto,
} from './setting.dto';
import { Setting } from './setting.schema';
import { SETTING_METADATA, SettingKeyMetadata } from './constants';

const MASKED_VALUE = '***';

/**
 * Setting Controller — UI quản trị endpoints.
 * All endpoints require JWT auth.
 *
 * For service-to-service consumption, see `setting-internal.controller.ts` (P1.6).
 *
 * Ref: docs/sys/PROPOSAL.md §4.4
 */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingController {
  constructor(private readonly service: SettingService) {}

  // =========================================================================
  // Public — metadata only (no auth)
  // =========================================================================

  @Get('metadata')
  @ApiOperation({
    summary: 'Get all setting metadata (public, no auth)',
    description: 'Returns the metadata registry for all known setting keys. Used by the sys-client lib to bootstrap routing logic and by the UI to render forms.',
  })
  @ApiResponse({ status: 200, description: 'List of all metadata entries' })
  getAllMetadata(): SettingKeyMetadata[] {
    return Object.values(SETTING_METADATA);
  }

  @Get('metadata/:key')
  @ApiOperation({
    summary: 'Get metadata for a specific key (public, no auth)',
  })
  @ApiResponse({ status: 200, description: 'Metadata entry' })
  @ApiResponse({ status: 404, description: 'Unknown key' })
  getMetadataByKey(@Param('key') key: ConfigKey): SettingKeyMetadata {
    const metadata = SETTING_METADATA[key];
    if (!metadata) {
      // 404 — handled by NotFoundException in service ideally, but metadata is local
      // so throw inline.
      const allowed = Object.values(ConfigKey).join(', ');
      throw new Error(`Unknown setting key '${key}'. Allowed: ${allowed}`);
    }
    return metadata;
  }

  // =========================================================================
  // UI quản trị (JWT)
  // =========================================================================

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List settings (paginated, filterable)' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ): Promise<FindManyResult<SettingDetailDto>> {
    const result = await this.service.findAll(parseQueryString(query), context);
    // Mask sensitive values in list output
    return {
      ...result,
      data: result.data.map((doc) => this.maskIfSensitive(doc)),
    };
  }

  @Get(':key')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get setting by key (org → global fallback). Sensitive values masked.',
  })
  @ApiReadErrors()
  async findByKey(
    @Param('key') key: ConfigKey,
    @CurrentUser() context: RequestContext,
  ): Promise<SettingDetailDto> {
    const setting = await this.service.findByKey(key, context);
    if (!setting) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`Setting with key '${key}' not found`);
    }
    return this.maskIfSensitive(setting);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create or update a setting (upsert)' })
  @ApiCreateErrors()
  async createOrUpdate(
    @Body() dto: CreateSettingDto,
    @CurrentUser() context: RequestContext,
  ): Promise<SettingDetailDto> {
    const setting = await this.service.createOrUpdate(dto, context);
    return this.maskIfSensitive(setting);
  }

  @Patch(':key')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update setting by key (partial)' })
  @ApiUpdateErrors()
  async updateByKey(
    @Param('key') key: ConfigKey,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() context: RequestContext,
  ): Promise<SettingDetailDto> {
    const setting = await this.service.updateByKey(key, dto, context);
    return this.maskIfSensitive(setting);
  }

  @Delete(':key')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete setting by key' })
  @ApiDeleteErrors()
  async deleteByKey(
    @Param('key') key: ConfigKey,
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    await this.service.deleteByKey(key, context);
  }

  @Post(':key/reveal')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Reveal plaintext value of a sensitive setting (universe.owner only)',
    description: 'Returns the plaintext value. The action is recorded in the audit-log (resource=secret, action=reveal).',
  })
  @ApiResponse({ status: 200, type: SettingRevealResponseDto })
  async revealByKey(
    @Param('key') key: ConfigKey,
    @CurrentUser() context: RequestContext,
  ): Promise<SettingRevealResponseDto> {
    const setting = await this.service.revealByKey(key, context);
    // TODO P2: emit audit log { resource: 'secret', action: 'reveal', actor: context, resourceId: key }
    return {
      key: setting.key,
      value: setting.value,
      revealedAt: new Date(),
    };
  }

  @Post('initialize')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk seed missing setting keys with empty values',
    description: 'Only creates keys that don\'t exist yet (no overwrite). Intended for bootstrap of new orgs / global setup.',
  })
  @ApiResponse({ status: 200, type: InitializeSettingsResponseDto })
  async initialize(
    @Body() dto: InitializeSettingsDto,
    @CurrentUser() context: RequestContext,
  ): Promise<InitializeSettingsResponseDto> {
    const result = await this.service.initializeAll(dto, context);
    return { success: true, ...result };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Mask sensitive value in response. Mutates a copy, not the document.
   */
  private maskIfSensitive(setting: any): SettingDetailDto {
    const obj = typeof setting.toObject === 'function' ? setting.toObject() : { ...setting };
    if (obj.sensitive === true) {
      obj.value = MASKED_VALUE;
    }
    return obj as SettingDetailDto;
  }
}
