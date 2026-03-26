import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotFoundException, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AccountService } from './account.service';
import { CreateAccountDto, UpdateAccountDto } from './account.dto';

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
