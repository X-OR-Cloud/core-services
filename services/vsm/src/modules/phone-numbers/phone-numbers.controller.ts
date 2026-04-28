import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { PhoneNumbersService } from './phone-numbers.service';
import { CreatePhoneNumberDto, UpdatePhoneNumberDto } from './phone-numbers.dto';

@ApiTags('phone-numbers')
@ApiBearerAuth()
@Controller('phone-numbers')
export class PhoneNumbersController {
  constructor(private readonly service: PhoneNumbersService) {}

  @Post()
  @ApiOperation({ summary: 'Add phone number (DID)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreatePhoneNumberDto, @CurrentUser() ctx: RequestContext) {
    return this.service.create(dto, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List phone numbers' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryStringParams, @CurrentUser() ctx: RequestContext) {
    return this.service.findAll(parseQueryString(query), ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get phone number by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.findById(id as any, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update phone number' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdatePhoneNumberDto, @CurrentUser() ctx: RequestContext) {
    return this.service.update(id, dto, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete phone number (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.softDelete(id, ctx);
  }
}
