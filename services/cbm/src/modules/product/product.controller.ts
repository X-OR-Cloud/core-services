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
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto, ImportProductsDto } from './product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateProductDto, @CurrentUser() context: RequestContext) {
    return this.service.create(dto, context);
  }

  @Post('import')
  @ApiOperation({ summary: 'Bulk import/upsert products by code' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async import(@Body() dto: ImportProductsDto, @CurrentUser() context: RequestContext) {
    return this.service.importProducts(dto.items, context);
  }

  @Get()
  @ApiOperation({ summary: 'List products with pagination, search and filter' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    const { search, ...rest } = query;
    return this.service.findAll({ ...parseQueryString(rest), search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.service.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete product' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.softDelete(new Types.ObjectId(id) as any, context);
  }
}
