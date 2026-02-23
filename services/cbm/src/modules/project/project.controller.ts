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
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { ProjectService } from './project.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './project.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.create(createProjectDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all projects with pagination and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: ProjectQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.findAll(query, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.update(new Types.ObjectId(id) as any, updateProjectDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete project by ID (only completed/archived)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // =============== Action Endpoints ===============

  @Post(':id/activate')
  @ApiOperation({
    summary: 'Activate project',
    description: 'Transition project from draft to active status'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.activateProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/hold')
  @ApiOperation({
    summary: 'Put project on hold',
    description: 'Transition project from active to on_hold status'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async hold(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.holdProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/resume')
  @ApiOperation({
    summary: 'Resume project',
    description: 'Transition project from on_hold to active status'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async resume(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.resumeProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Complete project',
    description: 'Transition project from active to completed status'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async complete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.completeProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/archive')
  @ApiOperation({
    summary: 'Archive project',
    description: 'Transition project from completed to archived status'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async archive(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.archiveProject(new Types.ObjectId(id) as any, context);
  }
}
