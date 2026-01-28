import { Controller, Get, Post, Param, Body, UseGuards, Query, NotFoundException, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiReadErrors, ApiKeyGuard } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { NodeService } from './node.service';
import { VerifyNodeCredentialsDto, VerifyNodeCredentialsResponseDto } from './node.dto';

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
    description: 'Generate new apiKey and secret for node authentication. Old credentials will be invalidated immediately. Only organization owner can perform this action. WARNING: Secret is shown only ONCE - must be saved!',
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials regenerated successfully',
    schema: {
      example: {
        nodeId: '65a0000000000000000000001',
        credentials: {
          apiKey: 'a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p',
          secret: 'b8c3d4e5-f6g7-5h8i-9j0k-1l2m3n4o5p6q',
        },
        warning: 'Secret shown only ONCE. Save it now!',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only organization owner can regenerate credentials',
  })
  @ApiResponse({
    status: 404,
    description: 'Node not found',
  })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async regenerateCredentials(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const result = await this.nodeService.regenerateCredentials(id, context);
    return {
      nodeId: (result.node as any)._id.toString(),
      credentials: result.credentials,
      warning: 'Secret shown only ONCE. Save it now!',
    };
  }

  @Post('verify-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify node credentials (Internal API)',
    description: 'Internal API for IAM service to verify node credentials using apiKey + secret (industry standard like AWS). Protected by API Key authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials verified successfully',
    type: VerifyNodeCredentialsResponseDto,
    schema: {
      example: {
        success: true,
        data: {
          valid: true,
          node: {
            _id: '65a0000000000000000000001',
            name: 'gpu-worker-01',
            role: ['worker'],
            owner: {
              orgId: 'org_001'
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or API key',
  })
  @UseGuards(ApiKeyGuard)
  async verifyCredentials(
    @Body() dto: VerifyNodeCredentialsDto,
  ): Promise<VerifyNodeCredentialsResponseDto> {
    const node = await this.nodeService.verifyCredentials(dto);

    if (!node) {
      throw new UnauthorizedException('Invalid node credentials');
    }

    return {
      success: true,
      data: {
        valid: true,
        node: {
          _id: (node as any)._id.toString(),
          name: node.name,
          role: node.role,
          owner: {
            orgId: node.owner?.orgId || '',
          },
        },
      },
    };
  }
}
