import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  PaginationQueryDto,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  UniverseScopeOnly,
  RequireUniverseRole,
  UniverseRoleGuard,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types, ObjectId } from 'mongoose';
import { OrganizationsService } from './organization.service';
import { Organization } from './organization.schema';
import {
  CreateOrganizationDTO,
  UpdateOrganizationDTO,
} from './organization.dto';

@ApiTags('organizations')
@ApiBearerAuth('JWT-auth')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create organization', description: 'Create a new organization' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  @ApiCreateErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async create(
    @Body() createDTO: CreateOrganizationDTO,
    @CurrentUser() context: RequestContext
  ): Promise<Partial<Organization>> {
    return this.organizationsService.create(createDTO, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all organizations', description: 'Get list of organizations with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Organizations retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @RequireUniverseRole()
  @UniverseScopeOnly()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.organizationsService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID', description: 'Get a single organization by ID' })
  @ApiResponse({ status: 200, description: 'Organization found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ): Promise<Partial<Organization>> {
    const organization = await this.organizationsService.findById(new Types.ObjectId(id) as unknown as ObjectId, context);
    if (!organization) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return organization;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update organization', description: 'Update organization information' })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  @ApiUpdateErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDTO: UpdateOrganizationDTO,
    @CurrentUser() context: RequestContext
  ): Promise<Partial<Organization>> {
    const updated = await this.organizationsService.update(new Types.ObjectId(id) as unknown as ObjectId, updateDTO, context);
    if (!updated) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete organization', description: 'Soft delete an organization' })
  @ApiResponse({ status: 200, description: 'Organization deleted successfully' })
  @ApiDeleteErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    await this.organizationsService.softDelete(new Types.ObjectId(id) as unknown as ObjectId, context);
    return { message: 'Organization deleted successfully' };
  }
}
