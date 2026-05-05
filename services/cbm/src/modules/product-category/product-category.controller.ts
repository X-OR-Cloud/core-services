import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { ProductCategoryService } from './product-category.service';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './product-category.dto';

@ApiTags('Product Categories')
@ApiBearerAuth()
@Controller('product-categories')
export class ProductCategoryController {
  constructor(private readonly service: ProductCategoryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product category' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateProductCategoryDto, @CurrentUser() context: RequestContext) {
    return this.service.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List product categories' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    const { search, ...rest } = query;
    return this.service.findAll({ ...parseQueryString(rest), search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product category by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product category' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.service.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete product category' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.softDelete(new Types.ObjectId(id) as any, context);
  }
}
