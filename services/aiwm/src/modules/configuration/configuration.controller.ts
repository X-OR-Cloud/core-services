import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  UniverseScopeOnly,
} from '@hydrabyte/base';
import { RequestContext, ConfigKey } from '@hydrabyte/shared';
import { ConfigurationService } from './configuration.service';
import {
  CreateConfigurationDto,
  UpdateConfigurationDto,
  ConfigurationQueryDto,
  ConfigurationListResponseDto,
  ConfigurationDetailResponseDto,
  InitializeConfigurationsDto,
  InitializeConfigurationsResponseDto,
} from './configuration.dto';
import { CONFIG_METADATA } from './constants';

/**
 * Configuration Controller
 *
 * REST API for managing system configurations.
 * V2: Strict RBAC - only organization.owner can access.
 *
 * Endpoints:
 * - GET /configurations - List configs (NO values)
 * - GET /configurations/:key - Get config (WITH value)
 * - POST /configurations - Create/Update config
 * - DELETE /configurations/:key - Delete config
 * - GET /configurations-metadata - Get all metadata (public)
 * - GET /configurations-metadata/:key - Get key metadata (public)
 */
@ApiTags('Configuration Management')
@Controller('configurations')
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  // =========================================================================
  // Configuration CRUD (organization.owner only)
  // =========================================================================

  /**
   * List all configurations (WITHOUT values - metadata only)
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all configurations',
    description:
      'Returns list of configurations WITHOUT values (metadata only). Only organization.owner can access.',
  })
  @ApiResponse({
    status: 200,
    description: 'Configurations retrieved successfully',
    type: [ConfigurationListResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - organization.owner only' })
  async findAll(
    @Query() query: ConfigurationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    const options = {
      page: query.page || 1,
      limit: query.limit || 50,
    };

    const result = await this.configurationService.findAll(options, context);

    // Transform data to exclude values
    const dataWithoutValues = result.data.map((config: any) => {
      const metadata = CONFIG_METADATA[config.key as ConfigKey];
      return {
        _id: config._id,
        key: config.key,
        metadata,
        notes: config.notes,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      };
    });

    return {
      data: dataWithoutValues,
      pagination: result.pagination,
      statistics: result.statistics,
    };
  }

  /**
   * Get configuration by key (WITH value)
   */
  @Get(':key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get configuration by key',
    description:
      'Returns configuration WITH value. Only organization.owner can access.',
  })
  @ApiParam({
    name: 'key',
    enum: ConfigKey,
    description: 'Configuration key',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuration retrieved successfully',
    type: ConfigurationDetailResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - organization.owner only' })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async findByKey(
    @Param('key') key: ConfigKey,
    @CurrentUser() context: RequestContext
  ) {
    const config = await this.configurationService.findByKey(key, context);

    if (!config) {
      return {
        statusCode: 404,
        message: `Configuration with key '${key}' not found`,
      };
    }

    const metadata = CONFIG_METADATA[key];

    return {
      _id: (config as any)._id,
      key: config.key,
      value: config.value, // ✅ Value included in detail response
      metadata,
      notes: config.notes,
      createdBy: config.createdBy,
      updatedBy: config.updatedBy,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Initialize all configuration keys with empty values.
   * - universe.owner: can seed global or any org (with optional orgId)
   * - organization.owner: can only seed their own org
   */
  @UniverseScopeOnly() // Allow orgId override for universe.owner, but not for organization.owner
  @Post('initialize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initialize all configuration keys',
    description:
      'Creates all configuration keys with empty values for the given scope/org. ' +
      'Skips keys that already exist. ' +
      'universe.owner can seed global or any org. ' +
      'organization.owner can only seed their own org.',
  })
  @ApiResponse({
    status: 201,
    description: 'Configurations initialized successfully',
    type: InitializeConfigurationsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or org not found/inactive' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires universe.owner or organization.owner' })
  async initialize(
    @Body() dto: InitializeConfigurationsDto,
    @CurrentUser() context: RequestContext,
  ) {
    const result = await this.configurationService.initializeAll(dto, context);

    return {
      success: true,
      total: result.total,
      created: result.created,
      skipped: result.skipped,
    };
  }

  /**
   * Create or update configuration
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or update configuration',
    description:
      'Creates new configuration or updates existing one. Only organization.owner can access.',
  })
  @ApiResponse({
    status: 201,
    description: 'Configuration created/updated successfully',
    type: ConfigurationDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - organization.owner only' })
  async createOrUpdate(
    @Body() dto: CreateConfigurationDto,
    @CurrentUser() context: RequestContext
  ) {
    const config = await this.configurationService.createOrUpdate(
      dto,
      context
    );

    const metadata = CONFIG_METADATA[dto.key];

    return {
      _id: (config as any)._id,
      key: config.key,
      value: config.value,
      metadata,
      notes: config.notes,
      createdBy: config.createdBy,
      updatedBy: config.updatedBy,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Update configuration by key
   */
  @Patch(':key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update configuration by key',
    description:
      'Updates existing configuration. Only organization.owner can access.',
  })
  @ApiParam({
    name: 'key',
    enum: ConfigKey,
    description: 'Configuration key',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
    type: ConfigurationDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - organization.owner only' })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async updateByKey(
    @Param('key') key: ConfigKey,
    @Body() dto: UpdateConfigurationDto,
    @CurrentUser() context: RequestContext
  ) {
    const config = await this.configurationService.updateByKey(
      key,
      dto,
      context
    );

    const metadata = CONFIG_METADATA[key];

    return {
      _id: (config as any)._id,
      key: config.key,
      value: config.value,
      metadata,
      notes: config.notes,
      createdBy: config.createdBy,
      updatedBy: config.updatedBy,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Delete configuration by key (soft delete)
   */
  @Delete(':key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete configuration',
    description:
      'Soft deletes configuration. Only organization.owner can access.',
  })
  @ApiParam({
    name: 'key',
    enum: ConfigKey,
    description: 'Configuration key',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuration deleted successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - organization.owner only' })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async deleteByKey(
    @Param('key') key: ConfigKey,
    @CurrentUser() context: RequestContext
  ) {
    await this.configurationService.deleteByKey(key, context);

    return {
      success: true,
      message: 'Configuration deleted successfully',
      key,
    };
  }

  // =========================================================================
  // Metadata Endpoints (Public - no auth required)
  // =========================================================================

  /**
   * Get all configuration metadata
   * Public endpoint - returns metadata for all 23 config keys
   */
  @Get('metadata/all')
  @ApiOperation({
    summary: 'Get all configuration metadata',
    description:
      'Returns metadata for all 23 configuration keys. Public endpoint (no auth required).',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadata retrieved successfully',
  })
  async getAllMetadata() {
    const metadata = this.configurationService.getAllMetadata();

    return {
      data: metadata,
      total: metadata.length,
    };
  }

  /**
   * Get metadata for specific key
   * Public endpoint
   */
  @Get('metadata/:key')
  @ApiOperation({
    summary: 'Get metadata for specific configuration key',
    description:
      'Returns metadata for a specific configuration key. Public endpoint (no auth required).',
  })
  @ApiParam({
    name: 'key',
    enum: ConfigKey,
    description: 'Configuration key',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadata retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Metadata not found' })
  async getMetadataByKey(@Param('key') key: ConfigKey) {
    const metadata = this.configurationService.getMetadataByKey(key);
    return metadata;
  }
}
