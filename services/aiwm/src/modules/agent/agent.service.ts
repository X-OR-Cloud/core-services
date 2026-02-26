import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  BaseService,
  FindManyOptions,
  FindManyResult,
  PaginationQueryDto,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Agent, AgentDocument } from './agent.schema';
import { Instruction } from '../instruction/instruction.schema';
import { Tool } from '../tool/tool.schema';
import {
  CreateAgentDto,
  UpdateAgentDto,
  AgentConnectDto,
  AgentConnectResponseDto,
  AgentHeartbeatDto,
  AgentCredentialsResponseDto,
} from './agent.dto';
import { AgentProducer } from '../../queues/producers/agent.producer';
import { ConfigurationService } from '../configuration/configuration.service';
import { ConfigKey } from '../configuration/enums/config-key.enum';
import { DeploymentService } from '../deployment/deployment.service';
import { NodeGateway } from '../node/node.gateway';
import { NodeService } from '../node/node.service';
import { MessageType } from '@hydrabyte/shared';

@Injectable()
export class AgentService extends BaseService<Agent> {
  constructor(
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
    @InjectModel(Instruction.name) private instructionModel: Model<Instruction>,
    @InjectModel(Tool.name) private toolModel: Model<Tool>,
    private readonly jwtService: JwtService,
    private readonly agentProducer: AgentProducer,
    private readonly configurationService: ConfigurationService,
    private readonly deploymentService: DeploymentService,
    private readonly nodeGateway: NodeGateway,
    private readonly nodeService: NodeService,
    private readonly httpService: HttpService
  ) {
    super(agentModel as any);
  }

  /**
   * Override findById to support populate
   * If query has 'populate=instruction', populate the instructionId field
   */
  async findById(
    id: any,
    context: RequestContext,
    query?: any
  ): Promise<Agent | null> {
    const shouldPopulate = query?.populate === 'instruction';

    if (shouldPopulate) {
      const agent = await this.agentModel
        .findOne({ _id: id, isDeleted: false })
        .populate('instructionId')
        .exec();
      return agent as Agent;
    }

    return super.findById(id, context);
  }

  /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Agent>> {
    if (options.filter) {
      if (options.filter['name']) {
        options.filter['name'] = {
          $regex: options.filter['name'],
          $options: 'i',
        };
      }
      if (options.filter['description']) {
        options.filter['description'] = {
          $regex: options.filter['description'],
          $options: 'i',
        };
      }
    }
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

    // Aggregate statistics by type
    const typeStats = await super.aggregate(
      [
        { $match: { ...options.filter } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Aggregate statistics by framework
    const frameworkStats = await super.aggregate(
      [
        { $match: { ...options.filter } },
        {
          $group: {
            _id: '$framework',
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
      byFramework: {},
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    // Map type statistics
    typeStats.forEach((stat: any) => {
      statistics.byType[stat._id] = stat.count;
    });

    // Map framework statistics
    frameworkStats.forEach((stat: any) => {
      statistics.byFramework[stat._id || 'claude-agent-sdk'] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  async create(
    createAgentDto: CreateAgentDto,
    context: RequestContext
  ): Promise<Agent> {
    // Both managed and autonomous agents have secrets for authentication
    let plaintextSecret: string;
    if (createAgentDto.secret) {
      // Hash provided secret, keep plaintext for response/events
      plaintextSecret = createAgentDto.secret;
      createAgentDto.secret = await bcrypt.hash(plaintextSecret, 10);
    } else {
      // Generate random secret
      plaintextSecret = crypto.randomBytes(32).toString('hex');
      createAgentDto.secret = await bcrypt.hash(plaintextSecret, 10);
    }

    // Validate nodeId for managed agents
    if (createAgentDto.type === 'managed') {
      if (!createAgentDto.nodeId) {
        throw new BadRequestException('nodeId is required for managed agents');
      }

      const node = await this.nodeService.findByObjectId(createAgentDto.nodeId);
      if (!node) {
        throw new BadRequestException(
          `Node with ID ${createAgentDto.nodeId} not found`
        );
      }
      if (node.status !== 'online') {
        throw new BadRequestException(
          `Node ${createAgentDto.nodeId} is not online (current status: ${node.status})`
        );
      }

      // Check lastHeartbeat within 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (!node.lastHeartbeat || node.lastHeartbeat < tenMinutesAgo) {
        throw new BadRequestException(
          `Node ${createAgentDto.nodeId} has not sent a heartbeat in the last 10 minutes`
        );
      }
    }

    // Force initial status to inactive (agent must connect to become idle)
    createAgentDto.status = 'inactive';

    // BaseService handles permissions, ownership, save, and generic logging
    const saved = await super.create(createAgentDto, context);

    // Business-specific logging with details
    this.logger.log('Agent created with details', {
      id: (saved as any)._id,
      name: saved.name,
      type: saved.type,
      status: saved.status,
      nodeId: saved.nodeId,
      instructionId: saved.instructionId,
      guardrailId: saved.guardrailId,
      createdBy: context.userId,
    });

    // Emit event to queue
    await this.agentProducer.emitAgentCreated(saved);

    // For managed agents, send agent.start command to the target node via WebSocket
    if (saved.type === 'managed' && saved.nodeId) {
      try {
        await this.nodeGateway.sendCommandToNode(
          saved.nodeId,
          MessageType.AGENT_START,
          { type: 'agent', id: (saved as any)._id.toString() },
          {
            agentId: (saved as any)._id.toString(),
            name: saved.name,
            description: saved.description,
            status: saved.status,
            type: saved.type,
            framework: saved.framework,
            secret: plaintextSecret,
            instructionId: saved.instructionId,
            guardrailId: saved.guardrailId,
            deploymentId: saved.deploymentId,
            settings: saved.settings,
          }
        );
        this.logger.log(
          `agent.start sent to node ${saved.nodeId} for agent ${
            (saved as any)._id
          }`
        );
      } catch (error) {
        this.logger.warn(
          `Could not send agent.start to node ${saved.nodeId}: ${error.message}`
        );
      }
    }

    // Remove secret from response (never expose hashed secret)
    const result = saved as any;
    if (result.secret) delete result.secret;

    return result as Agent;
  }

  /**
   * Get latest instruction for agent (with context injection)
   * Used by agent to refresh instruction without reconnecting
   */
  async getAgentInstruction(
    agentId: string,
    accessToken: string
  ): Promise<{ id: string; systemPrompt: string; guidelines: string[] }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return this.buildInstructionObjectForAgent(agent, accessToken);
  }

  /**
   * Get agent configuration for autonomous agents
   * Requires user authentication, returns config without issuing new JWT
   */
  async getAgentConfig(
    agentId: string,
    context: RequestContext,
    accessToken?: string
  ): Promise<AgentConnectResponseDto> {
    // Find agent
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    // Verify user has access to this agent (same org)
    if (agent.owner.orgId !== context.orgId) {
      throw new UnauthorizedException('Not authorized to access this agent');
    }

    // Build instruction object (with context injection using user token)
    const instruction = await this.buildInstructionObjectForAgent(
      agent,
      accessToken
    );

    // Get allowed tools
    const tools = await this.getAllowedTools(agent);

    // Get AIWM base URL from configuration
    const aiwmBaseUrlConfig = await this.configurationService.findByKey(
      ConfigKey.AIWM_BASE_MCP_URL as any,
      context
    );
    const mcpBaseUrl =
      aiwmBaseUrlConfig?.value ||
      process.env.AIWM_BASE_URL ||
      'http://localhost:3306';

    // Build MCP server configuration (use user's token for MCP calls)
    // Note: Frontend will need to include user's JWT token when calling MCP
    const mcpServers = {
      Builtin: {
        type: 'http',
        url: mcpBaseUrl,
        headers: {
          Authorization: `Bearer <USER_ACCESS_TOKEN>`, // Placeholder - frontend replaces with actual token
        },
      },
    };

    // Prepare response (no accessToken for autonomous agents - they use user's JWT)
    const response: AgentConnectResponseDto = {
      accessToken: '', // Empty - autonomous agents use user's JWT token
      expiresIn: 0,
      refreshToken: null,
      refreshExpiresIn: 0,
      tokenType: 'bearer',
      mcpServers,
      instruction,
      tools,
      allowedFunctions: agent.allowedFunctions || [],
      settings: agent.settings || {},
    };

    // For autonomous agents, populate deployment info
    if (agent.type === 'autonomous' && agent.deploymentId) {
      try {
        // Use DeploymentService to build complete endpoint info
        const endpointInfo = await this.deploymentService.buildEndpointInfo(
          agent.deploymentId,
          context
        );

        // Get deployment and model for provider info
        const deployment = await this.agentModel.db
          .collection('deployments')
          .findOne({
            _id: new Types.ObjectId(agent.deploymentId),
          });

        if (deployment && deployment.modelId) {
          const model = await this.agentModel.db.collection('models').findOne({
            _id: new Types.ObjectId(deployment.modelId),
          });

          if (model && model.deploymentType === 'api-based') {
            // Get base API URL from configuration
            const baseApiUrlConfig = await this.configurationService.findByKey(
              ConfigKey.AIWM_BASE_API_URL as any,
              context
            );
            const baseApiUrl =
              baseApiUrlConfig?.value || 'http://localhost:3003';
            const baseAPIEndpoint = `${baseApiUrl}/deployments/${agent.deploymentId}/inference`;

            response.deployment = {
              id: deployment._id.toString(),
              provider: model.provider,
              model: model.modelIdentifier,
              baseAPIEndpoint, // Base proxy endpoint without provider path
              apiEndpoint: endpointInfo.url, // Full inference endpoint with provider path
            };
          }
        }
      } catch (error) {
        this.logger.warn('Failed to populate deployment info', {
          error: error.message,
        });
        // Continue without deployment info - non-critical
      }
    }

    return response;
  }

  /**
   * Agent connection/authentication endpoint
   * Validates agentId + secret, returns JWT token + config
   * For managed agents only (system-managed agents with secrets)
   */
  async connect(
    agentId: string,
    connectDto: AgentConnectDto
  ): Promise<AgentConnectResponseDto> {
    // Find agent with secret field (normally hidden)
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .select('+secret')
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    // Both managed and autonomous agents can connect
    // managed: system-managed agents (deployed to nodes, background agents)
    // autonomous: user-controlled agents (chat UI)

    // Check if agent is suspended
    if (agent.status === 'suspended') {
      throw new UnauthorizedException('Agent is suspended');
    }

    // Verify secret
    if (!agent.secret) {
      throw new UnauthorizedException('Agent has no secret configured');
    }
    const isSecretValid = await bcrypt.compare(connectDto.secret, agent.secret);
    if (!isSecretValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Extract roles from agent.role field or settings (backward compatibility)
    const agentRoles = agent.role
      ? [agent.role]
      : (agent.settings as any).auth_roles || ['organization.viewer'];

    // Generate JWT token with IAM-compatible payload
    const payload = {
      sub: agentId, // Agent ID as userId
      username: `agent:${agentId}`, // Format: agent:<agentId>
      status: agent.status, // Agent status
      roles: agentRoles, // From agent.role or settings.auth_roles
      orgId: agent.owner.orgId, // Owner organization ID
      groupId: '', // Empty for agents
      agentId: agentId, // Same as sub
      userId: '', // Empty as requested
      type: 'agent', // Marker for agent token
    };

    this.logger.debug('Signing JWT token with payload', {
      agentId,
      username: payload.username,
      roles: payload.roles,
      orgId: payload.orgId,
    });

    const token = this.jwtService.sign(payload); // expiresIn: '24h' set in JwtModule config

    // Calculate expiresIn seconds (24 hours)
    const expiresInSeconds = 24 * 60 * 60;

    // Build instruction object (with context injection using agent token)
    const instruction = await this.buildInstructionObjectForAgent(agent, token);

    // Get allowed tools
    const tools = await this.getAllowedTools(agent);

    // Update connection tracking + set status to idle
    await this.agentModel.updateOne(
      { _id: agent._id },
      {
        $set: { lastConnectedAt: new Date(), status: 'idle' },
        $inc: { connectionCount: 1 },
      }
    );

    this.logger.log('Agent connected successfully', {
      agentId,
      name: agent.name,
      username: payload.username,
      roles: payload.roles,
      connectionCount: agent.connectionCount + 1,
      connectedAt: new Date(),
      expiredAt: new Date(Date.now() + expiresInSeconds * 1000),
      maskedToken: `${token.substring(0, 20)}...${token.substring(
        token.length - 20
      )}`,
      token: token,
    });

    // Get AIWM base URL from configuration
    const aiwmBaseUrlConfig = await this.configurationService.findByKey(
      ConfigKey.AIWM_BASE_MCP_URL as any,
      { orgId: agent.owner.orgId } as RequestContext
    );
    const mcpBaseUrl =
      aiwmBaseUrlConfig?.value ||
      process.env.AIWM_BASE_URL ||
      'http://localhost:3306';

    // Build MCP server configuration (HTTP transport format)
    const mcpServers = {
      Builtin: {
        type: 'http',
        url: mcpBaseUrl,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    };

    // Prepare response
    const response: AgentConnectResponseDto = {
      accessToken: token,
      expiresIn: expiresInSeconds,
      refreshToken: null, // Not implemented for agents
      refreshExpiresIn: 0,
      tokenType: 'bearer',
      mcpServers, // MCP server configurations
      instruction,
      tools,
      allowedFunctions: agent.allowedFunctions || [],
      settings: agent.settings || {},
    };

    // For autonomous agents, populate deployment info
    if (agent.type === 'autonomous' && agent.deploymentId) {
      try {
        // Use DeploymentService to build complete endpoint info
        const endpointInfo = await this.deploymentService.buildEndpointInfo(
          agent.deploymentId,
          { orgId: agent.owner.orgId } as RequestContext
        );

        // Get deployment and model for provider info
        const deployment = await this.agentModel.db
          .collection('deployments')
          .findOne({
            _id: new Types.ObjectId(agent.deploymentId),
          });

        if (deployment && deployment.modelId) {
          const model = await this.agentModel.db.collection('models').findOne({
            _id: new Types.ObjectId(deployment.modelId),
          });

          if (model && model.deploymentType === 'api-based') {
            // Get base API URL from configuration
            const baseApiUrlConfig = await this.configurationService.findByKey(
              ConfigKey.AIWM_BASE_API_URL as any,
              { orgId: agent.owner.orgId } as RequestContext
            );
            const baseApiUrl =
              baseApiUrlConfig?.value || 'http://localhost:3003';
            const baseAPIEndpoint = `${baseApiUrl}/deployments/${agent.deploymentId}/inference`;

            response.deployment = {
              id: deployment._id.toString(),
              provider: model.provider,
              model: model.modelIdentifier,
              baseAPIEndpoint, // Base proxy endpoint without provider path
              apiEndpoint: endpointInfo.url, // Full inference endpoint with provider path
            };
          }
        }
      } catch (error) {
        this.logger.warn('Failed to populate deployment info', {
          error: error.message,
        });
        // Continue without deployment info - non-critical
      }
    }

    return response;
  }

  /**
   * Build instruction object for agent (new format)
   * Returns structured instruction with id, systemPrompt, and guidelines
   */
  private async buildInstructionObjectForAgent(
    agent: Agent,
    accessToken?: string
  ): Promise<{
    id: string;
    systemPrompt: string;
    guidelines: string[];
  }> {
    if (!agent.instructionId) {
      return {
        id: '',
        systemPrompt: 'No instruction configured for this agent.',
        guidelines: [],
      };
    }

    const instruction = await this.instructionModel
      .findOne({ _id: agent.instructionId, isDeleted: false })
      .exec();

    if (!instruction) {
      this.logger.warn('Instruction not found for agent', {
        agentId: (agent as any)._id,
        instructionId: agent.instructionId,
      });
      return {
        id: '',
        systemPrompt: 'Instruction not found.',
        guidelines: [],
      };
    }

    // Check instruction status
    if (instruction.status !== 'active') {
      this.logger.warn('Instruction is inactive for agent', {
        agentId: (agent as any)._id,
        instructionId: agent.instructionId,
        instructionStatus: instruction.status,
      });
      return {
        id: (instruction as any)._id.toString(),
        systemPrompt: 'Instruction is currently inactive.',
        guidelines: [],
      };
    }

    // Resolve @project:<id> and @document:<id> references if token available
    let resolvedPrompt = instruction.systemPrompt;
    if (accessToken) {
      resolvedPrompt = await this.resolveContextReferences(
        instruction.systemPrompt,
        accessToken,
        agent.owner.orgId
      );
    }

    return {
      id: (instruction as any)._id.toString(),
      systemPrompt: resolvedPrompt,
      guidelines: instruction.guidelines || [],
    };
  }

  /**
   * Resolve @project:<id> and @document:<id> references in systemPrompt
   * Fetches data from CBM service via HTTP API and appends context block
   */
  private async resolveContextReferences(
    systemPrompt: string,
    accessToken: string,
    orgId: string
  ): Promise<string> {
    // Scan for @project:<id> and @document:<id> patterns
    const refPattern = /@(project|document):([a-f0-9]{24})/g;
    const matches = [...systemPrompt.matchAll(refPattern)];

    if (matches.length === 0) {
      return systemPrompt;
    }

    // Get CBM base URL from configuration
    let cbmBaseUrl = process.env.CBM_BASE_URL || 'http://localhost:3004';
    try {
      const cbmConfig = await this.configurationService.findByKey(
        ConfigKey.CBM_BASE_API_URL as any,
        { orgId } as RequestContext
      );
      if (cbmConfig?.value) {
        cbmBaseUrl = cbmConfig.value;
      }
    } catch {
      // Fallback to default
    }

    const contextBlocks: string[] = [];

    for (const match of matches) {
      const [, refType, refId] = match;
      try {
        const response = await firstValueFrom(
          this.httpService.get(`${cbmBaseUrl}/${refType}s/${refId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        );
        const data = (response as any).data;

        if (refType === 'project') {
          const startDate = data.startDate
            ? new Date(data.startDate).toISOString().split('T')[0]
            : 'N/A';
          const endDate = data.endDate
            ? new Date(data.endDate).toISOString().split('T')[0]
            : 'N/A';

          // Fetch related documents (draft + published) for this project
          let documentsBlock = '';
          try {
            const docsUrl = `${cbmBaseUrl}/documents?projectId=${refId}&limit=100`;
            this.logger.debug(`Fetching documents for project ${refId} from ${docsUrl}`);
            const docsResponse = await firstValueFrom(
              this.httpService.get(docsUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
              })
            );
            const docsData = (docsResponse as any).data;
            const docs = docsData?.data || docsData?.items || [];
            if (docs.length > 0) {
              const docsList = docs
                .map(
                  (doc: any) =>
                    `  - \`${doc._id || doc.id}\`: ${doc.summary || 'Untitled'}`
                )
                .join('\n');
              documentsBlock = `\n-Documents** (${docs.length}):\n${docsList}`;
            }
          } catch (docError: any) {
            this.logger.warn(
              `Failed to fetch documents for project ${refId}: ${docError.message}`
            );
          }

          contextBlocks.push(
            `Project: ${data.name}\n` +
              `-ID: ${refId}\n` +
              `-Status: ${data.status || 'N/A'}\n` +
              `-Timeline: ${startDate} → ${endDate}\n` +
              `-Description: ${data.description || 'N/A'}\n` +
              `-Tags: ${(data.tags || []).join(', ') || 'N/A'}` +
              documentsBlock
          );
        } else if (refType === 'document') {
          const content =
            data.content?.length > 2000
              ? data.content.substring(0, 2000) + '\n...(truncated)'
              : data.content || '';
          contextBlocks.push(
            `Document: ${data.summary}\n` +
              `- ID: ${refId}\n` +
              `- Type: ${data.type || 'N/A'}\n` +
              `- Status: ${data.status || 'N/A'}\n` +
              `- Labels: ${(data.labels || []).join(', ') || 'N/A'}\n` +
              `- Content:\n${content}`
          );
        }

        this.logger.debug(`Resolved @${refType}:${refId} successfully`);
      } catch (error: any) {
        this.logger.warn(
          `Failed to resolve @${refType}:${refId}: ${error.message}`
        );
        contextBlocks.push(
          `${refType === 'project' ? 'Project' : 'Document'}: ${refId}\n` +
            `-Error: Could not resolve reference (${
              error.response?.status || error.message
            })`
        );
      }
    }

    if (contextBlocks.length === 0) {
      return systemPrompt;
    }

    return (
      systemPrompt +
      '\n\n---\nInjected Context (auto-resolved)\n\n' +
      contextBlocks.join('\n\n') +
      '\n---'
    );
  }

  /**
   * Get allowed tools for agent (whitelist)
   */
  private async getAllowedTools(agent: Agent): Promise<Tool[]> {
    if (!agent.allowedToolIds || agent.allowedToolIds.length === 0) {
      return [];
    }

    const toolIds = agent.allowedToolIds.map((id) => new Types.ObjectId(id));
    const tools = await this.toolModel
      .find({
        _id: { $in: toolIds },
        isDeleted: false,
        status: 'active',
      })
      .exec();

    return tools;
  }

  /**
   * Agent heartbeat endpoint
   * Updates lastHeartbeatAt timestamp
   * When idle, queries CBM for next work assignment
   */
  async heartbeat(
    agentId: string,
    heartbeatDto: AgentHeartbeatDto,
    accessToken?: string,
  ): Promise<{
    success: boolean;
    work?: { id: string; title: string; type: string; status: string; priorityLevel: number };
    systemMessage?: string;
  }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    // Reject heartbeat if agent is suspended
    if (agent.status === 'suspended') {
      throw new BadRequestException('Agent is suspended. Heartbeat rejected.');
    }

    // Update lastHeartbeatAt + status from heartbeat DTO
    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: { lastHeartbeatAt: new Date(), status: heartbeatDto.status } }
    );

    this.logger.debug('Agent heartbeat received', {
      agentId,
      status: heartbeatDto.status,
      previousStatus: agent.status,
      metrics: heartbeatDto.metrics,
    });

    // Query next work when agent is idle
    if (heartbeatDto.status === 'idle' && accessToken) {
      try {
        const workResult = await this.getNextWorkForAgent(agentId, accessToken, agent.owner?.orgId);
        if (workResult) {
          return {
            success: true,
            work: workResult.work,
            systemMessage: workResult.systemMessage,
          };
        }
      } catch (error: any) {
        this.logger.warn(`Failed to query next work for agent ${agentId}: ${error.message}`);
      }
    }

    return { success: true };
  }

  /**
   * Query CBM next-work API and build system message for agent
   */
  private async getNextWorkForAgent(
    agentId: string,
    accessToken: string,
    orgId?: string,
  ): Promise<{
    work: { id: string; title: string; type: string; status: string; priorityLevel: number };
    systemMessage: string;
  } | null> {
    let cbmBaseUrl = process.env.CBM_BASE_URL || 'http://localhost:3004';
    try {
      const cbmConfig = await this.configurationService.findByKey(
        ConfigKey.CBM_BASE_API_URL as any,
        { orgId } as RequestContext,
      );
      if (cbmConfig?.value) {
        cbmBaseUrl = cbmConfig.value;
      }
    } catch {
      // Fallback to default
    }

    const response = await firstValueFrom(
      this.httpService.get(`${cbmBaseUrl}/works/next-work`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { assigneeType: 'agent', assigneeId: agentId },
      }),
    );

    const data = (response as any).data;
    if (!data?.work || data.metadata?.priorityLevel === 0) {
      return null;
    }

    const work = data.work;
    const priorityLevel = data.metadata.priorityLevel;
    const workId = work._id || work.id;
    const title = work.title || 'Untitled';

    const workObj = {
      id: workId,
      title,
      type: work.type,
      status: work.status,
      priorityLevel,
    };

    let systemMessage: string;

    if (priorityLevel <= 3) {
      // Assignee = agent, work in todo → need to execute
      systemMessage =
        `Bạn đang có công việc (Work) @work:${workId} "${title}" cần thực hiện.\n` +
        `- Gọi mcp__Builtin__GetWork để xem chi tiết công việc\n` +
        `- Gọi mcp__Builtin__StartWork để bắt đầu công việc\n` +
        `- Gọi mcp__Builtin__RequestReviewForWork khi hoàn tất\n` +
        `- Gọi mcp__Builtin__BlockWork nếu gặp vướng mắc sau 3 lần cố gắng xử lý (kèm reason)`;
    } else if (priorityLevel === 4) {
      // Reporter = agent, work blocked → need to help resolve
      const reason = work.reason || 'Không rõ lý do';
      systemMessage =
        `Công việc (Work) @work:${workId} "${title}" đang bị block với lý do: "${reason}".\n` +
        `- Hãy xem xét và hỗ trợ xử lý vướng mắc\n` +
        `- Gọi mcp__Builtin__UnblockWork nếu đã giải quyết được (kèm feedback)\n` +
        `- Gọi mcp__Builtin__CancelWork nếu không thể tiếp tục`;
    } else {
      // Priority 5: Reporter = agent, work in review → need to review
      systemMessage =
        `Công việc (Work) @work:${workId} "${title}" đang chờ review.\n` +
        `- Hãy kiểm tra kết quả thực hiện\n` +
        `- Gọi mcp__Builtin__CompleteWork nếu đạt yêu cầu\n` +
        `- Gọi mcp__Builtin__RejectReviewForWork nếu cần làm lại (kèm feedback)`;
    }

    this.logger.debug('Next work found for agent', { agentId, workId, priorityLevel });

    return { work: workObj, systemMessage };
  }

  /**
   * Agent disconnect endpoint
   * Logs disconnect event and clears lastConnectedAt
   */
  async disconnect(
    agentId: string,
    disconnectDto: { reason?: string }
  ): Promise<{ success: boolean }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    // Update agent - set status to inactive and clear lastConnectedAt
    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: { lastConnectedAt: null, status: 'inactive' } }
    );

    this.logger.log('Agent disconnected', {
      agentId,
      name: agent.name,
      reason: disconnectDto.reason || 'No reason provided',
      lastHeartbeat: agent.lastHeartbeatAt,
    });

    return { success: true };
  }

  /**
   * Regenerate agent credentials (admin only)
   * Returns new secret + env config + install script
   * Works for both managed and autonomous agents
   */
  async regenerateCredentials(
    agentId: string,
    context: RequestContext
  ): Promise<AgentCredentialsResponseDto> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    // Generate new secret
    const newSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(newSecret, 10);

    // Update agent
    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: { secret: hashedSecret } }
    );

    this.logger.log('Agent credentials regenerated', {
      agentId,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      nodeId: agent.nodeId,
      regeneratedBy: context.userId,
    });

    // For managed agents, notify node via WebSocket with new secret
    if (agent.type === 'managed' && agent.nodeId) {
      try {
        await this.nodeGateway.sendCommandToNode(
          agent.nodeId,
          MessageType.AGENT_UPDATE,
          { type: 'agent', id: agentId },
          {
            agentId,
            name: agent.name,
            description: agent.description,
            status: agent.status,
            type: agent.type,
            framework: agent.framework,
            secret: newSecret,
            instructionId: agent.instructionId,
            guardrailId: agent.guardrailId,
            deploymentId: agent.deploymentId,
            settings: agent.settings,
          }
        );
        this.logger.log(
          `agent.update sent to node ${agent.nodeId} after credential regeneration for agent ${agentId}`
        );
      } catch (error: any) {
        this.logger.warn(
          `Could not send agent.update to node ${agent.nodeId}: ${error.message}`
        );
      }
    }

    // Build env config snippet
    const envConfig = this.buildEnvConfig(agentId, newSecret, agent);

    // Build install script (async now)
    const installScript = await this.buildInstallScript(
      agentId,
      newSecret,
      agent
    );

    return {
      agentId,
      secret: newSecret,
      envConfig,
      installScript,
    };
  }

  /**
   * Build .env configuration snippet
   */
  private buildEnvConfig(
    agentId: string,
    secret: string,
    agent: Agent
  ): string {
    const baseUrl =
      process.env.AIWM_PUBLIC_URL || 'https://api.x-or.cloud/dev/aiwm';
    const settings = agent.settings || {};

    // Extract common settings with defaults (flat fields with backward compatibility)
    const claudeModel =
      (settings as any).claude_model ||
      (settings as any).claudeModel ||
      'claude-3-5-haiku-latest';
    const maxTurns =
      (settings as any).claude_maxTurns || (settings as any).maxTurns || 100;
    const permissionMode =
      (settings as any).claude_permissionMode ||
      (settings as any).permissionMode ||
      'bypassPermissions';
    const resume =
      (settings as any).claude_resume !== undefined
        ? (settings as any).claude_resume
        : (settings as any).resume !== false; // default true

    let envConfig = `# ===== AIWM Integration =====
AIWM_ENABLED=true
AIWM_BASE_URL=${baseUrl}
AIWM_AGENT_ID=${agentId}
AIWM_AGENT_SECRET=${secret}

# ===== Agent Info =====
AGENT_NAME=${agent.name}
AGENT_FRAMEWORK=${agent.framework || 'claude-agent-sdk'}

# ===== Claude Code SDK Configuration =====
CLAUDE_MODEL=${claudeModel}
CLAUDE_MAX_TURNS=${maxTurns}
CLAUDE_PERMISSION_MODE=${permissionMode}
CLAUDE_RESUME=${resume}
`;

    // Add OAuth token if present (flat field with backward compatibility)
    const claudeOAuthToken =
      (settings as any).claude_oauthToken || (settings as any).claudeOAuthToken;
    if (claudeOAuthToken) {
      envConfig += `CLAUDE_CODE_OAUTH_TOKEN=${claudeOAuthToken}\n`;
    }

    // Add platform configurations
    envConfig += `
# ===== Platform Configuration (Optional) =====
# Configure your platform settings here
`;

    // Discord settings (flat fields with backward compatibility)
    const discordToken =
      (settings as any).discord_token || (settings as any).discord?.token;
    const discordChannelIds =
      (settings as any).discord_channelIds ||
      (settings as any).discord?.channelIds;
    const discordBotId =
      (settings as any).discord_botId || (settings as any).discord?.botId;

    if (discordToken || discordChannelIds || discordBotId) {
      if (discordToken) envConfig += `DISCORD_TOKEN=${discordToken}\n`;
      if (discordChannelIds)
        envConfig += `DISCORD_CHANNEL_ID=${
          Array.isArray(discordChannelIds)
            ? discordChannelIds.join(',')
            : discordChannelIds
        }\n`;
      if (discordBotId) envConfig += `DISCORD_BOT_ID=${discordBotId}\n`;
    } else {
      envConfig += `# DISCORD_TOKEN=your_discord_token\n# DISCORD_CHANNEL_ID=your_channel_id\n`;
    }

    // Telegram settings (flat fields with backward compatibility)
    const telegramToken =
      (settings as any).telegram_token || (settings as any).telegram?.token;
    const telegramGroupIds =
      (settings as any).telegram_groupIds ||
      (settings as any).telegram?.groupIds;
    const telegramBotUsername =
      (settings as any).telegram_botUsername ||
      (settings as any).telegram?.botUsername;

    if (telegramToken || telegramGroupIds || telegramBotUsername) {
      if (telegramToken) envConfig += `TELEGRAM_BOT_TOKEN=${telegramToken}\n`;
      if (telegramGroupIds)
        envConfig += `TELEGRAM_GROUP_ID=${
          Array.isArray(telegramGroupIds)
            ? telegramGroupIds.join(',')
            : telegramGroupIds
        }\n`;
      if (telegramBotUsername)
        envConfig += `TELEGRAM_BOT_USERNAME=${telegramBotUsername}\n`;
    } else {
      envConfig += `# TELEGRAM_BOT_TOKEN=your_telegram_token\n# TELEGRAM_GROUP_ID=your_group_id\n`;
    }

    return envConfig;
  }

  /**
   * Build installation script
   * Full production-ready script with NVM, Node.js, systemd/PM2 setup
   */
  private async buildInstallScript(
    agentId: string,
    secret: string,
    agent: Agent
  ): Promise<string> {
    const baseUrl =
      process.env.AIWM_PUBLIC_URL || 'https://api.x-or.cloud/dev/aiwm';

    // Get download URL from configuration
    let downloadBaseUrl = 'https://cdn.x-or.cloud/agents'; // default
    try {
      const downloadConfig = await this.configurationService.findByKey(
        'agent.download.base_url' as any, // ConfigKey enum might not be built yet
        {
          orgId: agent.owner.orgId || (agent.owner as any),
          userId: agent.createdBy as any,
          agentId: '',
          groupId: '',
          appId: '',
          roles: [],
        } as any
      );
      if (downloadConfig?.value) {
        downloadBaseUrl = downloadConfig.value;
      }
    } catch (error) {
      // Fallback to default if config not found
      this.logger.warn(
        'Failed to load AGENT_DOWNLOAD_BASE_URL config, using default',
        error
      );
    }
    const downloadUrl = `${downloadBaseUrl}/xora-cc-agent-latest.tar.gz`;

    return String.raw`#!/bin/bash
# ============================================
# Agent Installation Script
# ============================================
# Auto-generated for Agent: ${agent.name}
# Framework: ${agent.framework || 'claude-agent-sdk'}
# Generated at: ${new Date().toISOString()}
# AIWM Controller: ${baseUrl}
# ============================================

set -e  # Exit on any error

# ===== CONFIGURATION =====
AGENT_ID="${agentId}"
AGENT_SECRET="${secret}"
CONTROLLER_URL="${baseUrl}"
DOWNLOAD_URL="${downloadUrl}"
INSTALL_DIR="/opt/xora-agent"
SERVICE_NAME="xora-agent"
PROCESS_MANAGER="\${PROCESS_MANAGER:-systemd}"  # systemd or pm2

# ===== COLOR OUTPUT =====
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

print_info() {
    echo -e "\${GREEN}[INFO]\${NC} \$1"
}

print_warn() {
    echo -e "\${YELLOW}[WARN]\${NC} \$1"
}

print_error() {
    echo -e "\${RED}[ERROR]\${NC} \$1"
}

# ===== SYSTEM CHECKS =====
print_info "Checking system requirements..."

# Check OS
if [[ ! -f /etc/lsb-release ]] && [[ ! -f /etc/debian_version ]]; then
    print_error "This script only supports Ubuntu/Debian systems"
    exit 1
fi

# Check if running as root
if [[ \$EUID -eq 0 ]]; then
    print_error "Please do NOT run this script as root"
    exit 1
fi

# ===== INSTALL NVM & NODE.JS =====
print_info "Installing NVM (Node Version Manager)..."

# Check if NVM already installed
if [ -s "\$HOME/.nvm/nvm.sh" ]; then
    print_warn "NVM already installed, skipping..."
else
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

    # Load NVM
    export NVM_DIR="\$HOME/.nvm"
    [ -s "\$NVM_DIR/nvm.sh" ] && \\. "\$NVM_DIR/nvm.sh"
fi

# Install Node.js 24
print_info "Installing Node.js 24..."
nvm install 24
nvm use 24

# Verify installation
NODE_VERSION=\$(node -v)
NPM_VERSION=\$(npm -v)
print_info "Node.js version: \$NODE_VERSION"
print_info "npm version: \$NPM_VERSION"

# ===== CREATE INSTALL DIRECTORY =====
print_info "Creating installation directory: \$INSTALL_DIR"
sudo mkdir -p \$INSTALL_DIR
sudo chown \$USER:\$USER \$INSTALL_DIR

# ===== DOWNLOAD AGENT BINARY =====
print_info "Downloading agent from: \$DOWNLOAD_URL"
cd /tmp
wget -O xora-agent.tar.gz "\$DOWNLOAD_URL"

print_info "Extracting agent files..."
tar -xzf xora-agent.tar.gz -C \$INSTALL_DIR
rm xora-agent.tar.gz

# ===== CREATE .ENV FILE =====
print_info "Creating .env configuration..."

cat > \$INSTALL_DIR/.env <<EOF
# ===== AIWM INTEGRATION =====
AIWM_ENABLED=true
AIWM_BASE_URL=\$CONTROLLER_URL
AIWM_AGENT_ID=\$AGENT_ID
AIWM_AGENT_SECRET=\$AGENT_SECRET

# ===== LOGGING =====
LOG_LEVEL=info
LOG_FILE=./logs/agent.log

# ===== Other configurations will be loaded from AIWM =====
# Instruction, tools, Discord/Telegram settings are managed centrally
EOF

chmod 600 \$INSTALL_DIR/.env

# ===== INSTALL DEPENDENCIES =====
print_info "Installing dependencies..."
cd \$INSTALL_DIR
npm install --production

# ===== SETUP PROCESS MANAGER =====
if [[ "\$PROCESS_MANAGER" == "pm2" ]]; then
    print_info "Setting up PM2 process manager..."

    # Install PM2 globally
    npm install -g pm2

    # Create PM2 ecosystem file
    cat > \$INSTALL_DIR/ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: '\$SERVICE_NAME',
    script: './dist/index.js',
    cwd: '\$INSTALL_DIR',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

    # Start with PM2
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup | tail -n 1 | bash

    print_info "PM2 configured and started"

else
    print_info "Setting up systemd service..."

    # Create systemd service file
    sudo tee /etc/systemd/system/\$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Xora AI Agent
After=network.target

[Service]
Type=simple
User=\$USER
WorkingDirectory=\$INSTALL_DIR
ExecStart=\$(which node) \$INSTALL_DIR/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=\$SERVICE_NAME

# Load NVM environment
Environment="PATH=\$HOME/.nvm/versions/node/v24.*/bin:/usr/local/bin:/usr/bin:/bin"
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd, enable and start service
    sudo systemctl daemon-reload
    sudo systemctl enable \$SERVICE_NAME
    sudo systemctl start \$SERVICE_NAME

    print_info "Systemd service configured and started"
fi

# ===== VERIFY INSTALLATION =====
sleep 5
print_info "Verifying installation..."

if [[ "\$PROCESS_MANAGER" == "pm2" ]]; then
    pm2 status \$SERVICE_NAME
else
    sudo systemctl status \$SERVICE_NAME --no-pager
fi

# ===== INSTALLATION COMPLETE =====
echo ""
echo "============================================"
print_info "✓ Agent installation completed successfully!"
echo "============================================"
echo ""
echo "Agent ID: \$AGENT_ID"
echo "Installation Directory: \$INSTALL_DIR"
echo "Process Manager: \$PROCESS_MANAGER"
echo ""

if [[ "\$PROCESS_MANAGER" == "pm2" ]]; then
    echo "Useful commands:"
    echo "  pm2 status              # View agent status"
    echo "  pm2 logs \$SERVICE_NAME  # View logs"
    echo "  pm2 restart \$SERVICE_NAME  # Restart agent"
    echo "  pm2 stop \$SERVICE_NAME  # Stop agent"
else
    echo "Useful commands:"
    echo "  sudo systemctl status \$SERVICE_NAME   # View agent status"
    echo "  sudo journalctl -u \$SERVICE_NAME -f  # View logs"
    echo "  sudo systemctl restart \$SERVICE_NAME  # Restart agent"
    echo "  sudo systemctl stop \$SERVICE_NAME     # Stop agent"
fi

echo ""
print_warn "IMPORTANT: Agent secret has been saved to \$INSTALL_DIR/.env"
print_warn "Keep this file secure and do NOT share it!"
echo ""
# npm start

echo "Installation script placeholder - implement actual logic"
`;
  }

  async updateAgent(
    id: string,
    updateAgentDto: UpdateAgentDto,
    context: RequestContext
  ): Promise<Agent | null> {
    // Prevent type changes (managed <-> autonomous)
    if (updateAgentDto.type) {
      const existingAgent = await this.agentModel.findById(id).exec();
      if (existingAgent && existingAgent.type !== updateAgentDto.type) {
        throw new BadRequestException(
          `Cannot change agent type from '${existingAgent.type}' to '${updateAgentDto.type}'. ` +
            'Please delete and recreate the agent with the desired type.'
        );
      }
    }

    // Convert string to ObjectId for BaseService
    const objectId = new Types.ObjectId(id);
    const updated = await super.update(
      objectId as any,
      updateAgentDto as any,
      context
    );

    if (updated) {
      // Business-specific logging with details
      this.logger.log('Agent updated with details', {
        id: (updated as any)._id,
        name: updated.name,
        status: updated.status,
        nodeId: updated.nodeId,
        instructionId: updated.instructionId,
        guardrailId: updated.guardrailId,
        updatedBy: context.userId,
      });

      // Emit event to queue
      await this.agentProducer.emitAgentUpdated(updated);

      // Send agent.update to node via WebSocket if managed agent
      if (updated.type === 'managed' && updated.nodeId) {
        try {
          await this.nodeGateway.sendCommandToNode(
            updated.nodeId,
            MessageType.AGENT_UPDATE,
            { type: 'agent', id: (updated as any)._id.toString() },
            {
              agentId: (updated as any)._id.toString(),
              name: updated.name,
              description: updated.description,
              status: updated.status,
              type: updated.type,
              framework: updated.framework,
              instructionId: updated.instructionId,
              guardrailId: updated.guardrailId,
              deploymentId: updated.deploymentId,
              settings: updated.settings,
            }
          );
          this.logger.log(
            `agent.update sent to node ${updated.nodeId} for agent ${
              (updated as any)._id
            }`
          );
        } catch (error: any) {
          this.logger.warn(
            `Could not send agent.update to node ${updated.nodeId}: ${error.message}`
          );
        }
      }
    }

    // Remove secret from response (never expose hashed secret)
    if (updated) {
      const obj = updated as any;
      if (obj.secret) delete obj.secret;
    }

    return updated as Agent;
  }

  async remove(id: string, context: RequestContext): Promise<void> {
    // Read agent before deleting to get type and nodeId for WebSocket notification
    const agent = await this.model.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    // BaseService handles soft delete, permissions, and generic logging
    const result = await super.softDelete(
      new Types.ObjectId(id) as any,
      context
    );

    if (result) {
      // Business-specific logging
      this.logger.log('Agent soft deleted with details', {
        id,
        deletedBy: context.userId,
      });

      // Emit event to queue
      await this.agentProducer.emitAgentDeleted(id);

      // For managed agents, send agent.delete command to the node via WebSocket
      if (agent && agent.type === 'managed' && agent.nodeId) {
        try {
          await this.nodeGateway.sendCommandToNode(
            agent.nodeId,
            MessageType.AGENT_DELETE,
            { type: 'agent', id },
            {
              agentId: id,
              name: agent.name,
            }
          );
          this.logger.log(
            `agent.delete sent to node ${agent.nodeId} for agent ${id}`
          );
        } catch (error: any) {
          this.logger.warn(
            `Could not send agent.delete to node ${agent.nodeId}: ${error.message}`
          );
        }
      }
    }
  }
}
