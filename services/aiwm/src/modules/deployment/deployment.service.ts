import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  NotImplementedException,
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { Request, Response } from 'express';
import axios from 'axios';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Deployment } from './deployment.schema';
import { Model as ModelEntity } from '../model/model.schema';
import { Node } from '../node/node.schema';
import { Resource } from '../resource/resource.schema';
import { ConfigurationService } from '../configuration/configuration.service';
import { ConfigKey } from '@hydrabyte/shared';
import { EndpointInfoDto } from './deployment.dto';

/**
 * DeploymentService
 * Manages deployment entities for both API-based and self-hosted models
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class DeploymentService extends BaseService<Deployment> {
  constructor(
    @InjectModel(Deployment.name) private deploymentModel: Model<Deployment>,
    @InjectModel(ModelEntity.name)
    private readonly modelModel: Model<ModelEntity>,
    @InjectModel(Node.name) private readonly nodeModel: Model<Node>,
    @InjectModel(Resource.name) private readonly resourceModel: Model<Resource>,
    private readonly configurationService: ConfigurationService
  ) {
    super(deploymentModel);
  }

  /**
   * Override create method to validate model, node, and resource before deployment
   * Supports both API-based and self-hosted deployments:
   * - API-based: Only requires modelId (status='active'), no nodeId/resourceId
   * - Self-hosted: Requires modelId (status='active'), nodeId (status='online'), resourceId (type='inference-container')
   */
  async create(
    createData: Partial<Deployment>,
    context: RequestContext
  ): Promise<Deployment | null> {
    const { modelId, nodeId, resourceId } = createData;

    // 1. Validate Model exists and is active
    if (!modelId) {
      throw new BadRequestException('modelId is required');
    }

    const model = await this.modelModel
      .findById(modelId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!model) {
      throw new BadRequestException(`Model with ID ${modelId} not found`);
    }

    if (model.status !== 'active') {
      throw new BadRequestException(
        `Model "${model.name}" must be in 'active' status to create deployment. Current status: ${model.status}`
      );
    }

    // 2. Type-specific validation based on model.deploymentType
    if (model.deploymentType === 'self-hosted') {
      // Self-hosted: Require nodeId + resourceId
      if (!nodeId || !resourceId) {
        throw new BadRequestException(
          'nodeId and resourceId are required for self-hosted deployments'
        );
      }

      // Validate Node exists and is online
      const node = await this.nodeModel
        .findById(nodeId)
        .where('isDeleted')
        .equals(false)
        .lean()
        .exec();

      if (!node) {
        throw new BadRequestException(`Node with ID ${nodeId} not found`);
      }

      if (node.status !== 'online') {
        throw new BadRequestException(
          `Node "${node.name}" must be 'online' to create deployment. Current status: ${node.status}`
        );
      }

      // Validate Resource exists and is inference-container
      const resource = await this.resourceModel
        .findById(resourceId)
        .where('isDeleted')
        .equals(false)
        .lean()
        .exec();

      if (!resource) {
        throw new BadRequestException(
          `Resource with ID ${resourceId} not found`
        );
      }

      if (resource.type !== 'inference-container') {
        throw new BadRequestException(
          `Resource "${resource.name}" must be of type 'inference-container'. Current type: ${resource.type}`
        );
      }

      // Set status to 'queued' (worker will deploy later)
      createData.status = 'queued';

    } else if (model.deploymentType === 'api-based') {
      // API-based: No nodeId/resourceId required
      if (nodeId || resourceId) {
        throw new BadRequestException(
          'nodeId and resourceId should not be provided for API-based deployments'
        );
      }

      // Set status to 'running' immediately (no container deployment needed)
      createData.status = 'running';
    }

    // 3. Create deployment
    const deployment = await super.create(createData, context);

    // 4. Emit event to queue for monitoring/logging
    // TODO: Uncomment when queue processors are ready
    // await this.deploymentProducer.emitDeploymentCreated(deployment);

    return deployment as Deployment;
  }

  /**
   * Find a deployment by ID without permission checks (internal use only)
   */
  async findByObjectId(id: string): Promise<Deployment | null> {
    const objectId = new Types.ObjectId(id);
    return this.deploymentModel.findOne({ _id: objectId, isDeleted: { $ne: true } }).exec();
  }

  /**
   * Override update method to validate status transitions
   * Prevents invalid status changes
   */
  async update(
    id: ObjectId,
    updateData: Partial<Deployment>,
    context: RequestContext
  ): Promise<Deployment | null> {
    // If status is being changed, validate the transition
    if (updateData.status) {
      const currentDeployment = await this.deploymentModel
        .findOne({
          _id: id,
          isDeleted: false,
        })
        .lean()
        .exec();

      if (!currentDeployment) {
        throw new BadRequestException(`Deployment with ID ${id} not found`);
      }

      // Validate status transition
      this.validateStatusTransition(
        currentDeployment.status,
        updateData.status
      );
    }

    // Call parent update method
    const updated = await super.update(id, updateData, context);

    // TODO: Emit event to queue for status change handling
    // if (updateData.status) {
    //   await this.deploymentProducer.emitDeploymentStatusChanged(updated);
    // }

    return updated;
  }

  /**
   * Override softDelete method to validate deployment can be deleted
   * Prevents deleting deployments that are currently running
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Deployment | null> {
    const deployment = await this.deploymentModel
      .findOne({
        _id: id,
        isDeleted: false,
      })
      .lean()
      .exec();

    if (!deployment) {
      throw new BadRequestException(`Deployment with ID ${id} not found`);
    }

    // Check if deployment is running
    if (deployment.status === 'running' || deployment.status === 'deploying') {
      throw new ConflictException(
        `Cannot delete deployment "${deployment.name}". It is currently in '${deployment.status}' status. Please stop it first.`
      );
    }

    // Call parent softDelete method
    const deleted = await super.softDelete(id, context);

    // TODO: Emit event to queue for cleanup
    // await this.deploymentProducer.emitDeploymentDeleted(id);

    return deleted;
  }

  /**
   * Validate status transition is allowed
   * @param currentStatus - Current deployment status
   * @param newStatus - New status to transition to
   */
  private validateStatusTransition(
    currentStatus: string,
    newStatus: string
  ): void {
    const validTransitions: Record<string, string[]> = {
      queued: ['deploying', 'failed', 'stopped'],
      deploying: ['running', 'failed', 'error'],
      running: ['stopping', 'error'],
      stopping: ['stopped', 'error'],
      stopped: ['deploying'], // Can redeploy
      failed: ['deploying'], // Can retry
      error: ['deploying', 'stopped'], // Can retry or stop
    };

    const allowedStatuses = validTransitions[currentStatus] || [];

    if (!allowedStatuses.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedStatuses.join(
          ', '
        )}`
      );
    }
  }

  /**
   * Start a deployment (change status from stopped/failed to deploying)
   * This is a placeholder for future implementation
   */
  async startDeployment(
    id: ObjectId,
    context: RequestContext
  ): Promise<Deployment | null> {
    const deployment = await this.deploymentModel
      .findOne({
        _id: id,
        isDeleted: false,
      })
      .lean()
      .exec();

    if (!deployment) {
      throw new BadRequestException(`Deployment with ID ${id} not found`);
    }

    if (deployment.status === 'running') {
      throw new BadRequestException(
        `Deployment "${deployment.name}" is already running`
      );
    }

    // Update status to deploying
    const updated = await this.update(id, { status: 'deploying' }, context);

    // TODO: Emit event to queue for deployment process
    // await this.deploymentProducer.emitDeploymentStartRequested(id);

    return updated;
  }

  /**
   * Stop a deployment (change status from running to stopping)
   * This is a placeholder for future implementation
   */
  async stopDeployment(
    id: ObjectId,
    context: RequestContext
  ): Promise<Deployment | null> {
    const deployment = await this.deploymentModel
      .findOne({
        _id: id,
        isDeleted: false,
      })
      .lean()
      .exec();

    if (!deployment) {
      throw new BadRequestException(`Deployment with ID ${id} not found`);
    }

    if (deployment.status !== 'running') {
      throw new BadRequestException(
        `Cannot stop deployment "${deployment.name}". Current status: ${deployment.status}`
      );
    }

    // Update status to stopping
    const updated = await this.update(id, { status: 'stopping' }, context);

    // TODO: Emit event to queue for stop process
    // await this.deploymentProducer.emitDeploymentStopRequested(id);

    return updated;
  }

  /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Deployment>> {
    const findResult = await super.findAll(options, context);
    // Aggregate statistics by status
    const statusStats = await super.aggregate(
      [
        { $match: { ...options.filter } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Build statistics object
    const statistics: any = {
      total: findResult.pagination.total,
      byStatus: {},
      byType: {},
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Get deployment endpoint by resolving resource and node
   * Supports both API-based and self-hosted deployments
   * @param deploymentId - Deployment ID (as string)
   * @returns Endpoint URL (e.g., "https://api.openai.com" or "http://172.16.3.20:10060")
   */
  async getDeploymentEndpoint(deploymentId: string): Promise<string> {
    // Get deployment
    const deployment = await this.deploymentModel
      .findById(deploymentId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!deployment) {
      throw new NotFoundException(
        `Deployment with ID ${deploymentId} not found`
      );
    }

    // Get model to check deployment type
    const model = await this.modelModel
      .findById(deployment.modelId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!model) {
      throw new NotFoundException(
        `Model with ID ${deployment.modelId} not found`
      );
    }

    // API-based deployment: return model's apiEndpoint
    if ((model as any).deploymentType === 'api-based') {
      const apiEndpoint = (model as any).apiEndpoint;
      if (!apiEndpoint) {
        throw new BadRequestException(
          `Model "${model.name}" is API-based but has no apiEndpoint configured`
        );
      }
      return apiEndpoint;
    }

    // Self-hosted deployment: build endpoint from resource + node
    if (!deployment.resourceId || !deployment.nodeId) {
      throw new BadRequestException(
        `Self-hosted deployment "${deployment.name}" is missing resourceId or nodeId`
      );
    }

    // Get resource
    const resource = await this.resourceModel
      .findById(deployment.resourceId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!resource) {
      throw new NotFoundException(
        `Resource with ID ${deployment.resourceId} not found`
      );
    }

    // Get node
    const node = await this.nodeModel
      .findById(deployment.nodeId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!node) {
      throw new NotFoundException(
        `Node with ID ${deployment.nodeId} not found`
      );
    }

    // Extract port from resource (first port mapping)
    const containerPorts = resource.config?.containerPorts;
    if (!containerPorts || containerPorts.length === 0) {
      throw new BadRequestException(
        `Resource "${resource.name}" has no container ports configured`
      );
    }

    const hostPort = containerPorts[0].hostPort;

    // Build endpoint URL
    const endpoint = `http://${node.ipAddress}:${hostPort}`;

    return endpoint;
  }

  /**
   * Get resource and node info for a deployment
   * Used by controllers to get container details
   */
  async getDeploymentDetails(deploymentId: string): Promise<{
    deployment: any;
    resource: any;
    node: any;
    endpoint: string;
  }> {
    const deployment = await this.deploymentModel
      .findById(deploymentId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!deployment) {
      throw new NotFoundException(
        `Deployment with ID ${deploymentId} not found`
      );
    }

    const resource = await this.resourceModel
      .findById(deployment.resourceId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!resource) {
      throw new NotFoundException(
        `Resource with ID ${deployment.resourceId} not found`
      );
    }

    const node = await this.nodeModel
      .findById(deployment.nodeId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!node) {
      throw new NotFoundException(
        `Node with ID ${deployment.nodeId} not found`
      );
    }

    const endpoint = await this.getDeploymentEndpoint(deploymentId);

    return { deployment, resource, node, endpoint };
  }

  /**
   * Proxy inference request to appropriate endpoint
   * Supports both API-based and self-hosted deployments
   */
  async proxyInference(
    deploymentId: string,
    path: string,
    req: Request,
    res: Response,
    context: RequestContext
  ): Promise<void> {
    // 1. Get deployment
    const deployment = await this.deploymentModel
      .findById(deploymentId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!deployment) {
      throw new NotFoundException(`Deployment with ID ${deploymentId} not found`);
    }

    if (deployment.status !== 'running') {
      throw new BadRequestException(
        `Deployment is not running. Current status: ${deployment.status}`
      );
    }

    // 2. Get model
    const model = await this.modelModel
      .findById(deployment.modelId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!model) {
      throw new NotFoundException(`Model not found for deployment`);
    }

    // TODO Phase 3: Apply PII redaction
    // const sanitizedBody = await this.piiService.redact(req.body, context);

    // TODO Phase 3: Apply Guardrails validation
    // if (deployment.guardrailId) {
    //   await this.guardrailService.validate(sanitizedBody, deployment.guardrailId, context);
    // }

    // 3. Route based on deployment type
    if (model.deploymentType === 'api-based') {
      await this.proxyToAPIProvider(model, deployment, path, req, res);
    } else if (model.deploymentType === 'self-hosted') {
      await this.proxyToSelfHosted(deployment, path, req, res);
    }
  }

  /**
   * Proxy to AI Provider (OpenAI, Anthropic, Google, etc.)
   */
  private async proxyToAPIProvider(
    model: ModelEntity,
    deployment: any, // Using any to access _id
    path: string,
    req: Request,
    res: Response
  ): Promise<void> {
    const { apiEndpoint, apiConfig, modelIdentifier } = model;

    if (!apiEndpoint || !apiConfig) {
      throw new BadRequestException('Model API configuration is incomplete');
    }

    // Build target URL (provider-specific)
    let targetUrl: string;
    const apiKey = apiConfig.apiKey;

    if (!apiKey) {
      throw new BadRequestException('API key is required in model configuration');
    }

    // Google uses model ID in path
    if (model.provider === 'google') {
      // Path format: /v1beta/models/{modelId}:generateContent
      // User sends: /v1beta/models/gemini-pro:generateContent
      // We inject modelIdentifier into path
      let finalPath = path;

      // If path contains generic model placeholder or doesn't contain model ID
      if (modelIdentifier && !path.includes(modelIdentifier)) {
        // Replace pattern like /models/{model}: or /models/MODEL:
        finalPath = path.replace(/\/models\/[^:\/]+:/i, `/models/${modelIdentifier}:`);
      }

      targetUrl = `${apiEndpoint}${finalPath}`;
    } else {
      // Standard URL building for OpenAI, Anthropic
      targetUrl = `${apiEndpoint}${path}`;
    }

    this.logger.log(
      `Proxying to API provider: ${model.provider} - ${targetUrl}`
    );

    // Build headers with authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add provider-specific authentication (fixed per provider)
    switch (model.provider) {
      case 'openai':
        // OpenAI uses Bearer token authentication
        headers['Authorization'] = `Bearer ${apiKey}`;
        // Optional: Organization header
        if (apiConfig.organization) {
          headers['OpenAI-Organization'] = apiConfig.organization;
        }
        break;

      case 'anthropic':
        // Anthropic uses x-api-key header
        headers['x-api-key'] = apiKey;
        // Required: API version
        headers['anthropic-version'] = apiConfig['anthropic-version'] || '2023-06-01';
        break;

      case 'google':
        // Google uses x-goog-api-key header
        headers['x-goog-api-key'] = apiKey;
        break;

      default:
        // Generic Bearer token for unknown providers
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
    }

    // Add custom headers (prefixed with 'header-')
    Object.keys(apiConfig).forEach(key => {
      if (key.startsWith('header-')) {
        const headerName = key.replace('header-', '');
        headers[headerName] = apiConfig[key];
      }
    });

    // Prepare request body (provider-specific)
    let requestBody = { ...req.body };

    if (model.provider === 'google') {
      // Google doesn't use 'model' field in request body (it's in the URL path)
      delete requestBody.model;
    } else {
      // OpenAI, Anthropic, others use 'model' field in body
      delete requestBody.model; // Remove user-provided model parameter
      if (modelIdentifier) {
        requestBody.model = modelIdentifier;
      }
    }

    try {
      // Make request to AI provider
      const startTime = Date.now();
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: requestBody,
        headers,
        timeout: 300000, // 5 minutes
        validateStatus: () => true, // Accept all status codes (forward errors)
        maxRedirects: 5,
      });

      const duration = Date.now() - startTime;

      // Log success/failure
      this.logger.log(
        `Provider response: ${response.status} - Duration: ${duration}ms`
      );

      // Update usage stats (async, don't block response)
      this.updateUsageStats(deployment._id, response.data).catch(err => {
        this.logger.error(`Failed to update usage stats: ${err.message}`);
      });

      // Forward response to client (transparent)
      res.status(response.status);
      res.json(response.data);

    } catch (error: any) {
      this.logger.error(`Provider request failed: ${error.message}`);

      // Forward error from provider (transparent)
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else if (error.code === 'ECONNREFUSED') {
        throw new BadGatewayException('AI provider is unreachable');
      } else if (error.code === 'ETIMEDOUT') {
        throw new GatewayTimeoutException('Request to AI provider timed out');
      } else {
        throw new BadGatewayException('Failed to connect to AI provider');
      }
    }
  }

  /**
   * Proxy to self-hosted container endpoint
   * TODO Phase 2: Implement with worker integration
   */
  private async proxyToSelfHosted(
    deployment: Deployment,
    path: string,
    req: Request,
    res: Response
  ): Promise<void> {
    // TODO Phase 2: Get container endpoint from Resource + Node
    // const endpoint = await this.getDeploymentEndpoint(deployment._id.toString());
    // const targetUrl = `${endpoint}${path}`;
    // await this.proxyService.proxyRequest(targetUrl, req, res, { timeout: 300000 });

    throw new NotImplementedException(
      'Self-hosted deployment inference is not yet implemented. ' +
      'This will be available in Phase 2 with worker integration.'
    );
  }

  /**
   * Build endpoint integration information for a deployment
   * Returns URL, headers, sample body, and integration guide
   */
  async buildEndpointInfo(
    deploymentId: string,
    context: RequestContext
  ): Promise<EndpointInfoDto> {
    // Get deployment
    const deployment = await this.deploymentModel
      .findById(deploymentId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!deployment) {
      throw new NotFoundException(`Deployment with ID ${deploymentId} not found`);
    }

    // Get model
    const model = await this.modelModel
      .findById(deployment.modelId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!model) {
      throw new NotFoundException(`Model not found for deployment`);
    }

    // Get base API URL from configuration
    const baseApiUrlConfig = await this.configurationService.findByKey(
      ConfigKey.AIWM_BASE_API_URL,
      context
    );
    const baseApiUrl = baseApiUrlConfig?.value || 'http://localhost:3003';

    // Determine the inference path based on provider
    let aiProviderPath = '/v1/chat/completions'; // Default OpenAI-style
    let sampleBody: Record<string, any> = {};
    let providerName = 'AI Provider';
    let providerDocsUrl = '';

    if (model.deploymentType === 'api-based') {
      providerName = this.getProviderDisplayName(model.provider || 'unknown');

      switch (model.provider) {
        case 'openai':
          aiProviderPath = '/v1/chat/completions';
          sampleBody = {
            messages: [{ role: 'user', content: 'Hello, how are you?' }],
            temperature: 0.7,
            max_tokens: 1000,
          };
          providerDocsUrl = 'https://platform.openai.com/docs/api-reference';
          break;

        case 'anthropic':
          aiProviderPath = '/v1/messages';
          sampleBody = {
            messages: [{ role: 'user', content: 'Hello, how are you?' }],
            max_tokens: 1024,
            temperature: 0.7,
          };
          providerDocsUrl = 'https://docs.anthropic.com/en/api/messages';
          break;

        case 'google':
          aiProviderPath = `/v1beta/models/${model.modelIdentifier || 'gemini-pro'}:generateContent`;
          sampleBody = {
            contents: [{
              parts: [{ text: 'Hello, how are you?' }],
            }],
          };
          providerDocsUrl = 'https://ai.google.dev/api/rest';
          break;

        default:
          aiProviderPath = '/v1/chat/completions';
          sampleBody = {
            messages: [{ role: 'user', content: 'Hello, how are you?' }],
          };
          providerDocsUrl = '';
          break;
      }
    } else {
      // Self-hosted deployment
      providerName = 'Self-Hosted';
      aiProviderPath = '/v1/chat/completions'; // vLLM/Triton typically use OpenAI-compatible API
      sampleBody = {
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        temperature: 0.7,
        max_tokens: 1000,
      };
      providerDocsUrl = 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html';
    }

    // Build full URL
    const url = `${baseApiUrl}/deployments/${deploymentId}/inference${aiProviderPath}`;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <ACCESS_TOKEN>',
    };

    // Build integration guide
    const description = this.buildIntegrationGuide(
      model,
      url,
      providerName,
      providerDocsUrl,
      sampleBody
    );

    return {
      url,
      headers,
      body: sampleBody,
      description,
    };
  }

  /**
   * Get display name for provider
   */
  private getProviderDisplayName(provider: string): string {
    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic (Claude)',
      google: 'Google (Gemini)',
      azure: 'Azure OpenAI',
      cohere: 'Cohere',
    };
    return providerNames[provider] || provider;
  }

  /**
   * Build integration guide in markdown format
   */
  private buildIntegrationGuide(
    model: any,
    url: string,
    providerName: string,
    providerDocsUrl: string,
    sampleBody: Record<string, any>
  ): string {
    const modelInfo = model.deploymentType === 'api-based'
      ? `**${providerName}** provider with model \`${model.modelIdentifier || model.name}\``
      : `**Self-Hosted** model \`${model.name}\``;

    let guide = `## Integration Guide\n\n`;
    guide += `This deployment uses ${modelInfo}.\n\n`;

    guide += `### Authentication\n`;
    guide += `- Use \`ACCESS_TOKEN\` which can be either:\n`;
    guide += `  - **USER_ACCESS_TOKEN**: Personal user token from IAM login\n`;
    guide += `  - **APP_ACCESS_TOKEN**: Application service token\n\n`;

    if (providerDocsUrl) {
      guide += `### Provider Documentation\n`;
      guide += `For detailed API specifications and examples, visit the official [${providerName} Documentation](${providerDocsUrl}).\n\n`;
    }

    guide += `### Example Request\n`;
    guide += `\`\`\`bash\n`;
    guide += `curl -X POST \\\n`;
    guide += `  '${url}' \\\n`;
    guide += `  -H 'Content-Type: application/json' \\\n`;
    guide += `  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \\\n`;
    guide += `  -d '${JSON.stringify(sampleBody, null, 2).replace(/\n/g, '\n  ')}'\n`;
    guide += `\`\`\`\n\n`;

    guide += `### Response Format\n`;
    guide += `The response format depends on the AI provider. `;
    guide += `Please refer to the provider documentation for detailed response schemas.\n`;

    return guide;
  }

  /**
   * Update deployment usage statistics
   */
  private async updateUsageStats(
    deploymentId: ObjectId,
    responseData: any
  ): Promise<void> {
    const usage = responseData.usage || {};
    const totalTokens = usage.total_tokens || usage.input_tokens + usage.output_tokens || 0;

    await this.deploymentModel.findByIdAndUpdate(deploymentId, {
      $inc: {
        requestCount: 1,
        totalTokens: totalTokens,
      },
    });
  }
}
