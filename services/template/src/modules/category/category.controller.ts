import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @ApiOperation({ summary: 'Create category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiCreateErrors()
  async create(@Body() createDto: CreateCategoryDto, @CurrentUser() context: RequestContext) {
    return this.categoryService.create(createDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List categories' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  async findAll(@Query() query: QueryStringParams, @CurrentUser() context: RequestContext) {
    return this.categoryService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiResponse({ status: 200, description: 'Category found' })
  @ApiReadErrors()
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.categoryService.findById(id as any, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update category' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiUpdateErrors()
  async update(@Param('id') id: string, @Body() updateDto: UpdateCategoryDto, @CurrentUser() context: RequestContext) {
    return this.categoryService.update(id, updateDto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete category' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiDeleteErrors()
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.categoryService.softDelete(id, context);
  }
}
