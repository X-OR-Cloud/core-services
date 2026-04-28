import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create SIP/WebRTC account' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateAccountDto, @CurrentUser() ctx: RequestContext) {
    return this.service.create(dto, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List accounts' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryStringParams, @CurrentUser() ctx: RequestContext) {
    return this.service.findAll(parseQueryString(query), ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.findById(id as any, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update account' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto, @CurrentUser() ctx: RequestContext) {
    return this.service.update(id, dto, ctx);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Force sync account config to Asterisk' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async sync(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    const account = await this.service.findById(id as any, ctx);
    return account;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete account (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.softDelete(id, ctx);
  }
}
