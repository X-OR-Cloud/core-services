import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Query,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
  Req,
  Res,
  All,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors, SkipLicenseCheck } from '@hydrabyte/base';
import { CombinedAuthGuard } from '../../guards/combined-auth.guard';
import { RequestContext } from '@hydrabyte/shared';
import { Request, Response } from 'express';
import { DeploymentService } from './deployment.service';
import { CreateDeploymentDto, UpdateDeploymentDto } from './deployment.dto';
import { ProxyService } from './proxy.service';

@ApiTags('Deployments')
@ApiBearerAuth()
@Controller('deployments')
export class DeploymentController {
  constructor(
    private readonly deploymentService: DeploymentService,
    private readonly proxyService: ProxyService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new deployment' })
  @ApiResponse({ status: 201, description: 'Deployment created successfully with status "queued"' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateDeploymentDto,
    @CurrentUser() context: RequestContext,
  ) {
    // IDs are now stored as strings, no conversion needed
    return this.deploymentService.create(createDto, context);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all deployments with pagination' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    return this.deploymentService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get deployment by ID',
    description: 'Returns a single deployment with a virtual "endpoint" field containing integration details (URL, headers, sample body, and markdown guide for API integration).'
  })
  @ApiResponse({
    status: 200,
    description: 'Deployment with endpoint integration information',
  })
  @ApiReadErrors()
  async findById(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const deployment = await this.deploymentService.findById(id as any, context);
    if (!deployment) {
      throw new NotFoundException(`Deployment with ID ${id} not found`);
    }

    // Convert Mongoose document to plain object
    const deploymentObj = (deployment as any).toObject ? (deployment as any).toObject() : deployment;

    // Add virtual endpoint field
    let endpointInfo = null;
    if (deploymentObj) {
      delete deploymentObj.endpoint; // Remove existing endpoint if any
      endpointInfo = await this.deploymentService.buildEndpointInfo(id, context);
    }

    return {
      ...deploymentObj,
      endpoint: endpointInfo,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update deployment' })
  @ApiResponse({ status: 200, description: 'Deployment updated successfully. Status transitions are validated.' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateDeploymentDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.deploymentService.update(id as any, updateDto as any, context);
    if (!updated) {
      throw new NotFoundException(`Deployment with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete deployment' })
  @ApiResponse({ status: 200, description: 'Deployment deleted successfully. Cannot delete running/deploying deployments.' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.deploymentService.softDelete(id as any, context);
  }

  @Post(':id/start')
  @SkipLicenseCheck()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Start a deployment' })
  @ApiResponse({ status: 200, description: 'Deployment start initiated. Status changed to "deploying".' })
  @ApiUpdateErrors()
  async start(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.deploymentService.startDeployment(id as any, context);
  }

  @Post(':id/stop')
  @SkipLicenseCheck()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stop a running deployment' })
  @ApiResponse({ status: 200, description: 'Deployment stop initiated. Status changed to "stopping".' })
  @ApiUpdateErrors()
  async stop(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.deploymentService.stopDeployment(id as any, context);
  }

  // ========================================================================
  // Proxy Endpoints
  // ========================================================================

  @Get(':id/api-spec')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get OpenAPI specification from deployment endpoint',
    description: 'Fetches the OpenAPI spec from the model inference endpoint (endpoint/openapi.json)',
  })
  @ApiResponse({ status: 200, description: 'OpenAPI specification returned' })
  @ApiResponse({ status: 400, description: 'Deployment not running or no endpoint configured' })
  @ApiResponse({ status: 404, description: 'Deployment or OpenAPI spec not found' })
  @ApiResponse({ status: 502, description: 'Endpoint unreachable' })
  @ApiResponse({ status: 504, description: 'Request timeout' })
  async getApiSpec(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    // 1. Get deployment details (includes resource, node, and built endpoint)
    const { deployment, endpoint } = await this.deploymentService.getDeploymentDetails(id);

    // 2. Check if deployment is running
    if (deployment.status !== 'running') {
      throw new BadRequestException(
        `Deployment is not running (status: ${deployment.status})`,
      );
    }

    // 3. Fetch OpenAPI spec from endpoint
    try {
      const apiSpec = await this.proxyService.fetchJson(
        `${endpoint}/openapi.json`,
        { timeout: 10000 },
      );

      return apiSpec;
    } catch (error: any) {
      if (error.message === 'ENDPOINT_UNREACHABLE') {
        throw new BadGatewayException('Endpoint is not reachable');
      } else if (error.message === 'ENDPOINT_TIMEOUT') {
        throw new BadGatewayException('Request timeout');
      } else if (error.message === 'RESOURCE_NOT_FOUND') {
        throw new NotFoundException('OpenAPI spec not found at endpoint');
      } else {
        throw new BadGatewayException(
          `Failed to fetch API spec: ${error.message}`,
        );
      }
    }
  }

  @All(':id/inference/*')
  @SkipLicenseCheck()
  @UseGuards(CombinedAuthGuard)
  @ApiOperation({
    summary: 'Unified inference endpoint for both API-based and self-hosted deployments',
    description:
      '**For API-based deployments:**\n' +
      '- Automatically injects model credentials from deployment config\n' +
      '- Forwards request to AI provider (OpenAI, Anthropic, Google, etc.)\n' +
      '- Path is appended to model.apiEndpoint\n\n' +
      '**For self-hosted deployments:**\n' +
      '- Forwards to container endpoint (vLLM, Triton)\n' +
      '- TODO: Will be implemented in Phase 2\n\n' +
      '**Usage Examples:**\n' +
      '```bash\n' +
      '# OpenAI-style chat completion\n' +
      'POST /deployments/{id}/inference/v1/chat/completions\n' +
      'Body: {\n' +
      '  "messages": [{"role": "user", "content": "Hello"}],\n' +
      '  "temperature": 0.7\n' +
      '}\n\n' +
      '# Anthropic-style messages\n' +
      'POST /deployments/{id}/inference/v1/messages\n' +
      'Body: {\n' +
      '  "messages": [{"role": "user", "content": "Hello"}],\n' +
      '  "max_tokens": 1024\n' +
      '}\n' +
      '```\n\n' +
      '**Note:** Request body format depends on the target AI provider.',
  })
  @ApiResponse({ status: 200, description: 'Inference completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or deployment not ready' })
  @ApiResponse({ status: 404, description: 'Deployment not found' })
  @ApiResponse({ status: 502, description: 'AI provider unreachable' })
  @ApiResponse({ status: 504, description: 'Request timeout' })
  async proxyInference(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() context: RequestContext,
  ) {
    // Extract path after /inference
    const basePath = `/deployments/${id}/inference`;
    const originalUrl = req.originalUrl || req.url;
    const pathIndex = originalUrl.indexOf(basePath);

    if (pathIndex === -1) {
      return res.status(500).json({
        statusCode: 500,
        message: 'Failed to extract target path',
        error: 'Internal Server Error',
      });
    }

    const targetPath = originalUrl.substring(pathIndex + basePath.length);

    // Proxy request using new unified service method
    try {
      await this.deploymentService.proxyInference(id, targetPath, req, res, context);
    } catch (error: any) {
      // Handle NestJS exceptions (only if response not already sent)
      if (!res.headersSent) {
        const status = error.status || 500;
        res.status(status).json({
          statusCode: status,
          message: error.message || 'Internal server error',
          error: error.name || 'Error',
        });
      }
    }
  }
}
