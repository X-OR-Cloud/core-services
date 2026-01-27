import { Controller, Get, Post, Param, UseGuards, Query, NotFoundException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiReadErrors, RequireUniverseRole, UniverseRoleGuard } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { NodeService } from './node.service';

// Commented imports for later use
// import { CreateNodeDto, UpdateNodeDto, GenerateTokenDto, GenerateTokenResponseDto } from './node.dto';

@ApiTags('nodes')
@ApiBearerAuth('JWT-auth')
@Controller('nodes')
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  // TODO: Will be analyzed and implemented later
  // @Post()
  // @ApiOperation({ summary: 'Register node', description: 'Register a new GPU node' })
  // @ApiResponse({ status: 201, description: 'Node registered successfully' })
  // @ApiCreateErrors()
  // @UseGuards(JwtAuthGuard)
  // @RequireUniverseRole()
  // async create(
  //   @Body() createNodeDto: CreateNodeDto,
  //   @CurrentUser() context: RequestContext,
  // ) {
  //   return this.nodeService.create(createNodeDto, context);
  // }

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

  // ============= Credential Management =============

  @Post(':id/regenerate-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate node credentials',
    description: 'Generate new apiKey and secret for node authentication. Old credentials will be invalidated immediately. WARNING: Secret is shown only ONCE - must be saved!',
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials regenerated successfully',
    schema: {
      example: {
        node: {
          _id: '65a0000000000000000000001',
          name: 'gpu-worker-01',
          role: ['worker'],
          status: 'online',
          apiKey: 'a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p',
        },
        credentials: {
          apiKey: 'a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p',
          secret: 'b8c3d4e5-f6g7-5h8i-9j0k-1l2m3n4o5p6q',
        },
        warning: 'Secret shown only ONCE. Save it now!',
      },
    },
  })
  @ApiReadErrors()
  @RequireUniverseRole()
  @UseGuards(JwtAuthGuard, UniverseRoleGuard)
  async regenerateCredentials(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const result = await this.nodeService.regenerateCredentials(id, context);
    return {
      ...result,
      warning: 'Secret shown only ONCE. Save it now!',
    };
  }
}
