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
  parseQueryString,
  QueryStringParams,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  RequireUniverseRole,
  UniverseRoleGuard,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AppService } from './app.service';
import { App } from './app.schema';
import { CreateAppDTO, UpdateAppDTO } from './app.dto';

@ApiTags('apps')
@ApiBearerAuth('JWT-auth')
@Controller('apps')
@UseGuards(JwtAuthGuard, UniverseRoleGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  @ApiOperation({ summary: 'Create app', description: 'Create a new SSO app configuration' })
  @ApiResponse({ status: 201, description: 'App created successfully' })
  @ApiCreateErrors()
  @RequireUniverseRole()
  async create(
    @Body() createDTO: CreateAppDTO,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<App>> {
    return this.appService.create(createDTO, context);
  }

  @Get()
  @ApiOperation({ summary: 'List apps' })
  @ApiResponse({ status: 200, description: 'Apps retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @RequireUniverseRole()
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    return this.appService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get app by ID' })
  @ApiResponse({ status: 200, description: 'App found' })
  @ApiReadErrors()
  @RequireUniverseRole()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<App>> {
    return this.appService.findById(id, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update app' })
  @ApiResponse({ status: 200, description: 'App updated successfully' })
  @ApiUpdateErrors()
  @RequireUniverseRole()
  async update(
    @Param('id') id: string,
    @Body() updateDTO: UpdateAppDTO,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<App>> {
    return this.appService.update(id, updateDTO, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete app' })
  @ApiResponse({ status: 200, description: 'App deleted successfully' })
  @ApiDeleteErrors()
  @RequireUniverseRole()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.appService.softDelete(id, context);
    return { message: 'App deleted successfully' };
  }
}
