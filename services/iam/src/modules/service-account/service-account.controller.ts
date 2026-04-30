import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseGuards, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams,
  ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors,
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
