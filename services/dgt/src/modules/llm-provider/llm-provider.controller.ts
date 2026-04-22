import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { LlmProviderService } from './llm-provider.service';
import { CreateLlmProviderDto, UpdateLlmProviderDto, UpdateStatusDto } from './llm-provider.dto';

@ApiTags('llm-providers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('llm-providers')
export class LlmProviderController {
  constructor(private readonly service: LlmProviderService) {}

  @Post()
  @ApiOperation({ summary: '[Owner] Tạo LLM provider (tự test connection trước)' })
  async create(@Body() dto: CreateLlmProviderDto, @CurrentUser() context: RequestContext) {
    return this.service.createProvider(dto, context);
  }

  @Get()
  @ApiOperation({ summary: '[Owner] Danh sách tất cả LLM providers' })
  async findAll(@CurrentUser() context: RequestContext) {
    return this.service.listProviders(context);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Owner] Chi tiết LLM provider' })
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.getProvider(id, context);
  }

  @Put(':id')
  @ApiOperation({ summary: '[Owner] Cập nhật LLM provider (tự test lại nếu đổi connection info)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLlmProviderDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.updateProvider(id, dto, context);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '[Owner] Bật/tắt LLM provider' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.updateStatus(id, dto, context);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '[Owner] Xóa LLM provider' })
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    await this.service.deleteProvider(id, context);
  }
}
