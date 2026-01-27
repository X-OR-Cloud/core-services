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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
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
import { Types } from 'mongoose';
import { ResourceService } from './resource.service';
import { CreateResourceDto, UpdateResourceDto, CreateSnapshotDto, ExecCommandDto } from './resource.dto';

@ApiTags('Resources')
@ApiBearerAuth()
@Controller('resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  // ========================================================================
  // CRUD Operations (Fully functional with DB)
  // ========================================================================

  @Post()
  @ApiOperation({
    summary: 'Create a new resource',
    description: 'Create VM, Container, or Inference Container resource. V1: Saves metadata to DB only.',
  })
  @ApiCreateErrors()
  @RequireUniverseRole()
    @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async create(
    @Body() createResourceDto: CreateResourceDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.resourceService.create(createResourceDto, context);
  }

  @Get()
  @ApiOperation({
    summary: 'List all resources with pagination',
    description: 'Query resources with filters (type, status, nodeId).',
  })
  @ApiReadErrors({ notFound: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by resource type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'nodeId', required: false, description: 'Filter by node ID' })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: any,
    @CurrentUser() context: RequestContext
  ) {
    console.log('Controller received query:', query);

    // Extract custom filters and pagination from raw query
    const { type, status, nodeId, page, limit, ...otherParams } = query;

    console.log('Extracted params:', { type, status, nodeId, page, limit });

    // Build filter object
    const filter: any = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (nodeId) filter.nodeId = new Types.ObjectId(nodeId);

    console.log('Final filter to service:', filter);

    // Build pagination query
    const paginationQuery = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    console.log('Pagination query:', paginationQuery);

    return this.resourceService.findAll(
      { filter, ...paginationQuery },
      context
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get resource by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.resourceService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update resource by ID',
    description: 'Update resource config or status. V1: Manual status updates for demo purposes.',
  })
  @ApiUpdateErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async update(
    @Param('id') id: string,
    @Body() updateResourceDto: UpdateResourceDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.resourceService.update(new Types.ObjectId(id) as any, updateResourceDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete resource by ID' })
  @ApiDeleteErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.resourceService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // ========================================================================
  // Lifecycle Operations (V1: Mock responses)
  // ========================================================================

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start resource',
    description: 'V1: Returns mock success response. V2: Sends command to worker for actual deployment.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID' })
  @UseGuards(JwtAuthGuard)
  async start(@Param('id') id: string) {
    return this.resourceService.start(id);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop resource',
    description: 'V1: Returns mock success response. V2: Sends stop command to worker.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID' })
  @UseGuards(JwtAuthGuard)
  async stop(@Param('id') id: string) {
    return this.resourceService.stop(id);
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restart resource',
    description: 'V1: Returns mock success response. V2: Sends restart command to worker.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID' })
  @UseGuards(JwtAuthGuard)
  async restart(@Param('id') id: string) {
    return this.resourceService.restart(id);
  }

  // ========================================================================
  // Monitoring Operations (V1: Mock data)
  // ========================================================================

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get resource status',
    description: 'V1: Returns status from DB. V2: Real-time status from worker.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID' })
  @UseGuards(JwtAuthGuard)
  async getStatus(@Param('id') id: string) {
    return this.resourceService.getStatus(id);
  }

  @Get(':id/logs')
  @ApiOperation({
    summary: 'Get resource logs',
    description: 'V1: Returns mock logs. V2: Streams actual logs from container/VM.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID' })
  @UseGuards(JwtAuthGuard)
  async getLogs(@Param('id') id: string) {
    return this.resourceService.getLogs(id);
  }

  @Get(':id/metrics')
  @ApiOperation({
    summary: 'Get resource metrics',
    description: 'V1: Returns mock CPU/RAM/GPU/Network metrics. V2: Real metrics from worker.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID' })
  @UseGuards(JwtAuthGuard)
  async getMetrics(@Param('id') id: string) {
    return this.resourceService.getMetrics(id);
  }

  @Get(':id/console')
  @ApiOperation({
    summary: 'Get console access (VMs only)',
    description: 'V1: Returns mock VNC URL. V2: Actual VNC/console access via libvirt.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID (must be a VM)' })
  @UseGuards(JwtAuthGuard)
  async getConsole(@Param('id') id: string) {
    return this.resourceService.getConsole(id);
  }

  // ========================================================================
  // Snapshot Operations (V1: Mock responses, VMs only)
  // ========================================================================

  @Post(':id/snapshots')
  @ApiOperation({
    summary: 'Create VM snapshot',
    description: 'V1: Returns mock snapshot. V2: Creates actual libvirt snapshot.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID (must be a VM)' })
  @UseGuards(JwtAuthGuard)
  async createSnapshot(
    @Param('id') id: string,
    @Body() createSnapshotDto: CreateSnapshotDto
  ) {
    return this.resourceService.createSnapshot(
      id,
      createSnapshotDto.name,
      createSnapshotDto.description
    );
  }

  @Get(':id/snapshots')
  @ApiOperation({
    summary: 'List VM snapshots',
    description: 'V1: Returns mock snapshots array. V2: Lists actual libvirt snapshots.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID (must be a VM)' })
  @UseGuards(JwtAuthGuard)
  async listSnapshots(@Param('id') id: string) {
    return this.resourceService.listSnapshots(id);
  }

  @Post(':id/snapshots/:snapshotId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore VM snapshot',
    description: 'V1: Returns mock success. V2: Restores actual libvirt snapshot.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID (must be a VM)' })
  @ApiParam({ name: 'snapshotId', description: 'Snapshot ID' })
  @UseGuards(JwtAuthGuard)
  async restoreSnapshot(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string
  ) {
    return this.resourceService.restoreSnapshot(id, snapshotId);
  }

  @Delete(':id/snapshots/:snapshotId')
  @ApiOperation({
    summary: 'Delete VM snapshot',
    description: 'V1: Returns mock success. V2: Deletes actual libvirt snapshot.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID (must be a VM)' })
  @ApiParam({ name: 'snapshotId', description: 'Snapshot ID' })
  @UseGuards(JwtAuthGuard)
  async deleteSnapshot(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string
  ) {
    return this.resourceService.deleteSnapshot(id, snapshotId);
  }

  // ========================================================================
  // Container-specific Operations (V1: Mock response)
  // ========================================================================

  @Post(':id/exec')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute command in container',
    description: 'V1: Returns mock command output. V2: Executes actual command via docker exec.',
  })
  @ApiParam({ name: 'id', description: 'Resource ID (must be a container)' })
  @UseGuards(JwtAuthGuard)
  async execCommand(
    @Param('id') id: string,
    @Body() execCommandDto: ExecCommandDto
  ) {
    return this.resourceService.execCommand(
      id,
      execCommandDto.command,
      execCommandDto.workingDir
    );
  }
}
