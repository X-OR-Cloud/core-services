import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotFoundException, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AccountService } from './account.service';
import { CreateAccountDto, UpdateAccountDto, TestApiKeyDto } from './account.dto';

@ApiTags('accounts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @ApiOperation({ summary: 'Create account' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.accountService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all accounts' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    return this.accountService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const account = await this.accountService.findById(id, context);
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update account' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.accountService.update(id, dto, context);
    if (!updated) throw new NotFoundException(`Account ${id} not found`);
    return updated;
  }

  @Post('test-key')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Test API key trước khi tạo account',
    description: 'Kiểm tra kết nối API key với exchange. Nếu thành công, trả về testToken (TTL 10 phút, one-time use) để dùng trong POST /accounts.',
  })
  @ApiBody({ type: TestApiKeyDto })
  @ApiResponse({ status: 200, description: 'Key hợp lệ — trả về testToken', schema: { example: { testToken: 'uuid', expiresIn: 600, status: 'valid', permissions: ['SPOT'], balance: 1000.5, currency: 'USDT' } } })
  @ApiResponse({ status: 400, description: 'Key không hợp lệ hoặc exchange từ chối kết nối' })
  async testKeyBeforeCreate(
    @Body() dto: TestApiKeyDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.accountService.testKeyBeforeCreate(dto, context.userId);
  }

  @Post(':id/test-connection')
  @HttpCode(200)
  @ApiOperation({ summary: 'Test API key connection (LIVE hoặc SANDBOX/Demo account)' })
  async testConnection(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.accountService.testConnection(id, context);
  }

  @Post(':id/sync-balance')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync balance từ exchange về DB' })
  async syncBalance(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.accountService.syncBalance(id, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete account' })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.accountService.softDelete(id, context);
    return { message: 'Account deleted successfully' };
  }
}
