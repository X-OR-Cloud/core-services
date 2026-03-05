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
import { ProjectService } from './project.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddMemberDto,
  UpdateMemberRoleDto,
} from './project.dto';

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
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.projectService.findAll({ ...options, search }, context);
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

  // =============== Member Management Endpoints ===============

  @Get(':id/members')
  @ApiOperation({ summary: 'List project members' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async listMembers(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.listMembers(id, context);
  }

  @Post(':id/members')
  @ApiOperation({
    summary: 'Add a member to project',
    description: 'Requires project.lead or organization.owner role',
  })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.addMember(id, dto, context);
  }

  @Patch(':id/members/:memberId')
  @ApiOperation({
    summary: 'Update member role',
    description: 'Requires project.lead or organization.owner role',
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async updateMemberRole(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.updateMemberRole(id, memberId, dto, context);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({
    summary: 'Remove a member from project',
    description: 'Requires project.lead or organization.owner role',
  })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.removeMember(id, memberId, context);
  }

  // =============== State Transition Endpoints ===============

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate project', description: 'Transition: draft → active' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.activateProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/hold')
  @ApiOperation({ summary: 'Put project on hold', description: 'Transition: active → on_hold' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async hold(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.holdProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume project', description: 'Transition: on_hold → active' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async resume(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.resumeProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete project', description: 'Transition: active → completed' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async complete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.completeProject(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive project', description: 'Transition: completed → archived' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async archive(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.projectService.archiveProject(new Types.ObjectId(id) as any, context);
  }
}
