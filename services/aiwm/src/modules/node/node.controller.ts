import { Controller, Get, Post, Delete, Param, Body, UseGuards, Query, NotFoundException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { NodeService } from './node.service';
import { CreateNodeDto, NodeLoginDto, NodeLoginResponseDto, NodeRefreshTokenDto, NodeRefreshTokenResponseDto, SetupGuideDto, SetupGuideResponseDto, NodeBootstrapDto, NodeBootstrapResponseDto } from './node.dto';

@ApiTags('nodes')
@ApiBearerAuth('JWT-auth')
@Controller('nodes')
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  @Post()
  @ApiOperation({
    summary: 'Create node',
    description: 'Create a new node. org.owner → status: pending. Others → status: awaiting-approval (requires approval before setup).',
  })
  @ApiResponse({ status: 201, description: 'Node created successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createNodeDto: CreateNodeDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.nodeService.createNode(createNodeDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all nodes', description: 'Retrieve list of all GPU nodes with pagination' })
  @ApiResponse({ status: 200, description: 'Nodes retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    // Call BaseService.findAll directly
    return this.nodeService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get node by ID', description: 'Retrieve a single node by ID' })
  @ApiResponse({ status: 200, description: 'Node found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    // Call BaseService.findById directly
    const node = await this.nodeService.findById(new Types.ObjectId(id) as any, context);
    if (!node) {
      throw new NotFoundException(`Node with ID ${id} not found`);
    }
    return node;
  }

  // TODO: Will be analyzed and implemented later
  // @Put(':id')
  // @ApiOperation({ summary: 'Update node', description: 'Update node information' })
  // @ApiResponse({ status: 200, description: 'Node updated successfully' })
  // @ApiUpdateErrors()
  // @RequireUniverseRole()
  // @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  // async update(
  //   @Param('id') id: string,
  //   @Body() updateNodeDto: UpdateNodeDto,
  //   @CurrentUser() context: RequestContext,
  // ) {
  //   const updated = await this.nodeService.updateNode(id, updateNodeDto, context);
  //   if (!updated) {
  //     throw new NotFoundException(`Node with ID ${id} not found`);
  //   }
  //   return updated;
  // }

  // TODO: Will be analyzed and implemented later
  // @Post(':id/token')
  // @ApiOperation({
  //   summary: 'Generate JWT token for node',
  //   description: 'Generate authentication token and installation script for worker node'
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Token generated successfully',
  //   type: GenerateTokenResponseDto
  // })
  // @ApiReadErrors()
  // @UseGuards(JwtAuthGuard)
  // @RequireUniverseRole()
  // async generateToken(
  //   @Param('id') id: string,
  //   @Body() body: GenerateTokenDto,
  //   @CurrentUser() context: RequestContext,
  // ) {
  //   return this.nodeService.generateToken(id, body.expiresIn, context);
  // }

  // TODO: Will be analyzed and implemented later
  // @Delete(':id')
  // @ApiOperation({ summary: 'Delete node', description: 'Soft delete a node' })
  // @ApiResponse({ status: 200, description: 'Node deleted successfully' })
  // @ApiDeleteErrors()
  // @RequireUniverseRole()
  //   @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  // async remove(
  //   @Param('id') id: string,
  //   @CurrentUser() context: RequestContext,
  // ) {
  //   await this.nodeService.remove(id, context);
  //   return { message: 'Node deleted successfully' };
  // }

  // ============= Approval =============

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve node',
    description: 'Approve a node in awaiting-approval status → pending. Only organization owner.',
  })
  @ApiResponse({ status: 200, description: 'Node approved' })
  @ApiResponse({ status: 400, description: 'Node is not awaiting approval' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @UseGuards(JwtAuthGuard)
  async approve(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.nodeService.approveNode(id, context);
  }

  // ============= Maintenance & Deletion =============

  @Post(':id/maintenance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set node to maintenance',
    description: 'Transition node to maintenance mode. Accessible by org.owner or node creator. Guard: critical roles (controller, proxy, storage) must have at least one other online node covering them.',
  })
  @ApiResponse({ status: 200, description: 'Node set to maintenance' })
  @ApiResponse({ status: 400, description: 'No online node covers a critical role, or already in maintenance' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @UseGuards(JwtAuthGuard)
  async setMaintenance(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.nodeService.setMaintenance(id, context);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete node',
    description: 'Soft delete a node. Node must be in maintenance status. Accessible by org.owner or node creator.',
  })
  @ApiResponse({ status: 200, description: 'Node deleted successfully' })
  @ApiResponse({ status: 400, description: 'Node is not in maintenance status' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.nodeService.deleteNode(id, context);
    return { message: 'Node deleted successfully' };
  }

  // ============= Setup Guide =============

  @Post(':id/setup-guide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get node setup guide',
    description: 'Generate a setup token (24h) and return install instructions. Node must be in pending status. Accessible by org.owner or node creator.',
  })
  @ApiResponse({ status: 200, description: 'Setup guide generated', type: SetupGuideResponseDto })
  @ApiResponse({ status: 400, description: 'Node not in pending status' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @UseGuards(JwtAuthGuard)
  async getSetupGuide(
    @Param('id') id: string,
    @Body() dto: SetupGuideDto,
    @CurrentUser() context: RequestContext,
  ): Promise<SetupGuideResponseDto> {
    return this.nodeService.getSetupGuide(id, dto.os, context);
  }

  // ============= Credential Management =============

  @Post(':id/regenerate-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate node secret',
    description: 'Generate a new secret for a node (online or offline). Old secret invalidated immediately. WARNING: Online nodes will disconnect. Accessible by org.owner or node creator.',
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials regenerated successfully',
    schema: {
      example: {
        nodeId: '507f1f77bcf86cd799439011',
        credentials: { secret: 'b8c3d4e5-f6g7-5h8i-9j0k-1l2m3n4o5p6q' },
        warning: 'WARNING: This node is currently ONLINE. Resetting the secret will immediately disconnect the running node.',
        affectedStatus: 'online',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Node is not online or offline' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  @UseGuards(JwtAuthGuard)
  async regenerateCredentials(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const result = await this.nodeService.regenerateCredentials(id, context);
    return {
      nodeId: (result.node as any)._id.toString(),
      credentials: result.credentials,
      warning: result.warning,
      affectedStatus: result.affectedStatus,
    };
  }

  // ============= Node Authentication =============

  @Post('auth/bootstrap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Node bootstrap',
    description: 'Called by install script with setup token. Generates and returns the node secret (shown ONCE). Node status → installing.',
  })
  @ApiResponse({ status: 200, description: 'Bootstrap successful', type: NodeBootstrapResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or already-used setup token' })
  @ApiResponse({ status: 403, description: 'Node not yet approved (status: awaiting-approval)' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async bootstrap(
    @Body() dto: NodeBootstrapDto,
  ): Promise<NodeBootstrapResponseDto> {
    return this.nodeService.bootstrap(dto.setupToken);
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Node login',
    description: 'Authenticate node using id + secret. id can be ObjectId (new nodes) or UUID apiKey (legacy nodes). Returns JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: NodeLoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: NodeLoginDto,
  ): Promise<NodeLoginResponseDto> {
    return this.nodeService.login(dto);
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh node token',
    description: 'Refresh an existing JWT token before it expires. Returns a new token with extended expiration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: NodeRefreshTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async refreshToken(
    @Body() dto: NodeRefreshTokenDto,
  ): Promise<NodeRefreshTokenResponseDto> {
    return this.nodeService.refreshToken(dto);
  }
}
