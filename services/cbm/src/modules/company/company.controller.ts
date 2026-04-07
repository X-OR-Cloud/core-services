import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { CompanyService } from './company.service';
import { CreateCompanyDto, UpdateCompanyDto } from './company.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new company' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createCompanyDto: CreateCompanyDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.companyService.create(createCompanyDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all companies with pagination, search and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.companyService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.companyService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update company by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.companyService.update(new Types.ObjectId(id) as any, updateCompanyDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete company by ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.companyService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // =============== Phase 3: Action Endpoints ===============

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate company', description: 'Transition: inactive → active' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.companyService.activate(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate company', description: 'Transition: active → inactive' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.companyService.deactivate(new Types.ObjectId(id) as any, context);
  }
}
