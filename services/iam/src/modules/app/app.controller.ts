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
  RequireUniverseRole,
  UniverseRoleGuard,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types, ObjectId } from 'mongoose';
import { AppService } from './app.service';
import { App } from './app.schema';
import { CreateAppDTO, UpdateAppDTO } from './app.dto';

@ApiTags('apps')
@ApiBearerAuth('JWT-auth')
@Controller('apps')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  @ApiOperation({ summary: 'Create app', description: 'Create a new SSO app configuration' })
  @ApiResponse({ status: 201, description: 'App created successfully' })
  @ApiCreateErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async create(
    @Body() createDTO: CreateAppDTO,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<App>> {
    return this.appService.create(createDTO, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all apps' })
  @ApiResponse({ status: 200, description: 'Apps retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.appService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get app by ID' })
  @ApiResponse({ status: 200, description: 'App found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<App>> {
    const app = await this.appService.findById(new Types.ObjectId(id) as unknown as ObjectId, context);
    if (!app) throw new NotFoundException(`App with ID ${id} not found`);
    return app;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update app' })
  @ApiResponse({ status: 200, description: 'App updated successfully' })
  @ApiUpdateErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDTO: UpdateAppDTO,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<App>> {
    const updated = await this.appService.update(new Types.ObjectId(id) as unknown as ObjectId, updateDTO, context);
    if (!updated) throw new NotFoundException(`App with ID ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete app' })
  @ApiResponse({ status: 200, description: 'App deleted successfully' })
  @ApiDeleteErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.appService.softDelete(new Types.ObjectId(id) as unknown as ObjectId, context);
    return { message: 'App deleted successfully' };
  }
}
