import { Controller, Get, Post, Body, Put, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto } from './product.dto';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @ApiOperation({ summary: 'Create product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiCreateErrors()
  async create(@Body() createDto: CreateProductDto, @CurrentUser() context: RequestContext) {
    return this.productService.create(createDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List products' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category ID' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @Query('categoryId') categoryId: string | undefined,
    @CurrentUser() context: RequestContext,
  ) {
    if (categoryId) {
      return this.productService.findByCategory(categoryId, parseQueryString(query), context);
    }
    return this.productService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product found' })
  @ApiReadErrors()
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.productService.findById(id as any, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiUpdateErrors()
  async update(@Param('id') id: string, @Body() updateDto: UpdateProductDto, @CurrentUser() context: RequestContext) {
    return this.productService.update(id, updateDto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete product' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiDeleteErrors()
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.productService.softDelete(id, context);
  }
}
