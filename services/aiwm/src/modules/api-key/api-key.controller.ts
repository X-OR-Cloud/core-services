import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiDeleteErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ApiKeyService } from './api-key.service';
import {
  CreateApiKeyDto,
  CreateApiKeyResponseDto,
  ApiKeyResponseDto,
} from './api-key.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new API key',
    description:
      'Creates an org-level API key. The full key is returned **once only** — store it securely.\n\n' +
      '**Scopes:**\n' +
      '- `all` — full AIWM API access\n' +
      '- `deployment:<id>` — only `/deployments/<id>/inference/*`',
  })
  @ApiResponse({ status: 201, type: CreateApiKeyResponseDto })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() context: RequestContext,
  ): Promise<CreateApiKeyResponseDto> {
    return this.apiKeyService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for the organization' })
  @ApiResponse({ status: 200, type: [ApiKeyResponseDto] })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @CurrentUser() context: RequestContext,
  ): Promise<ApiKeyResponseDto[]> {
    return this.apiKeyService.findAll(context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'API key revoked successfully' })
  @ApiDeleteErrors()
  async revoke(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<{ message: string }> {
    return this.apiKeyService.revoke(id, context);
  }
}
