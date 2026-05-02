import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseGuards, Query, HttpCode, HttpStatus, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams,
  ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors,
  ServiceAccountPermissionGuard, RequirePermission,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ServiceAccountService } from './service-account.service';
import { CreateServiceAccountDto } from './dto/create-service-account.dto';
import { UpdateServiceAccountDto } from './dto/update-service-account.dto';
import { TokenRequestDto } from './dto/token-request.dto';

@ApiTags('service-accounts')
@Controller('service-accounts')
export class ServiceAccountController {
  constructor(private readonly service: ServiceAccountService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create service account',
    description: 'Creates a new service account. Returns rawSecret once — store it securely.',
  })
  @ApiResponse({ status: 201, description: 'Service account created. rawSecret returned once only.' })
  @ApiCreateErrors()
  async create(@Body() dto: CreateServiceAccountDto, @CurrentUser() context: RequestContext) {
    return this.service.create(dto, context);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List service accounts' })
  @ApiReadErrors({ notFound: false })
  async findAll(@Query() query: QueryStringParams, @CurrentUser() context: RequestContext) {
    return this.service.findAll(parseQueryString(query), context);
  }

  // ─── Test endpoint ────────────────────────────────────────────────────────
  // Yêu cầu SA token với permission: iam / ping / read
  // Dùng để test ServiceAccountPermissionGuard hoạt động đúng
  // IMPORTANT: Must be declared BEFORE GET /:id to avoid route conflict
  @Get('ping')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ServiceAccountPermissionGuard)
  @RequirePermission('iam', 'ping', 'read')
  @ApiOperation({
    summary: '[TEST] Ping — requires SA permission: iam/ping/read',
    description: 'Test endpoint. Requires service account token with permission { service: "iam", resource: "ping", action: "read" }.',
  })
  @ApiResponse({ status: 200, description: 'OK — returns caller identity' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'SA token lacks required permission' })
  ping(@Request() req: any) {
    return {
      message: 'pong',
      caller: {
        sub: req.user?.sub,
        type: req.user?.type,
        orgId: req.user?.orgId,
        permissions: req.user?.permissions,
        roles: req.user?.roles,
      },
    };
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Rotate secret',
    description: 'Generate a new secret for this service account. Returns rawSecret once — store it securely. Old tokens remain valid until they expire.',
  })
  @ApiResponse({ status: 200, description: 'Secret rotated. rawSecret returned once only.' })
  @ApiResponse({ status: 404, description: 'Service account not found' })
  async rotateSecret(@Param('id') id: string) {
    return this.service.rotateSecret(id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get service account by ID' })
  @ApiReadErrors()
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.findById(id as any, context);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update service account (name, description, status, permissions)' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceAccountDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.update(id, dto, context);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete service account (soft delete)' })
  @ApiDeleteErrors()
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.softDelete(id as any, context);
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue access token (OAuth2 client_credentials)',
    description: 'Exchange clientId + secret for a short-lived JWT (default 4h). No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Access token issued', schema: {
    properties: {
      accessToken: { type: 'string' },
      expiresIn: { type: 'number', description: 'Seconds until expiry' },
    },
  }})
  @ApiResponse({ status: 401, description: 'Invalid client credentials' })
  async issueToken(@Body() dto: TokenRequestDto) {
    return this.service.issueToken(dto);
  }
}
