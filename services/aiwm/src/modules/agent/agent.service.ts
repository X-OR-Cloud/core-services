import {
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import {
  AgentWorkerCmdEvent,
  REDIS_CHANNEL_AGENT_WORKER_CMD,
  REDIS_CHANNEL_INSTRUCTION_UPDATED,
  InstructionUpdatedEvent,
  buildRedisConfig,
} from '../../config/redis.config';
import {
  BaseService,
  FindManyOptions,
  FindManyResult,
  PaginationQueryDto,
} from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Agent, AgentDocument } from './agent.schema';
import { AGENT_CODE_ADJS, AGENT_CODE_NAMES } from './agent.const';
import { Instruction } from '../instruction/instruction.schema';
import { Tool } from '../tool/tool.schema';
import { AgentMemory, MemoryCategory } from '../memory/memory.schema';
import {
  CreateAgentDto,
  UpdateAgentDto,
  AgentConnectDto,
  AgentConnectResponseDto,
  AgentHeartbeatDto,
  AgentCredentialsResponseDto,
  AnonymousTokenDto,
  AnonymousTokenResponseDto,
  AnonymousTokenEntryDto,
  AnonymousTokenListResponseDto,
  AddAgentLogDto,
  AgentLogsResponseDto,
  AddExternalSigningKeyDto,
  ExternalSigningKeyEntryDto,
  ExternalSigningKeyListResponseDto,
} from './agent.dto';
import { AgentProducer } from '../../queues/producers/agent.producer';
import { ConfigurationService } from '../configuration/configuration.service';
import { ConfigKey } from '../configuration/enums/config-key.enum';
import { HeartbeatService } from '../heartbeat/heartbeat.service';
import { DeploymentService } from '../deployment/deployment.service';
import { NodeService } from '../node/node.service';
import { MessageType } from '@hydrabyte/shared';
import { ConversationService } from '../conversation/conversation.service';
import { ActionService } from '../action/action.service';
import {
  computeFrt,
  computeResponseDeltas,
  computeAvg,
  computeP90,
  getPeriodKey,
  resolveTimeRange,
  defaultGranularity,
  SLA_FRT_THRESHOLD_MS,
  SlaAction,
  MetricsGranularity,
} from '../../core/sla.helper';
import { ActionType } from '../action/action.enum';

@Injectable()
export class AgentService extends BaseService<Agent> implements OnModuleDestroy {
  private redisPub: Redis | null = null;

  constructor(
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
    @InjectModel(Instruction.name) private instructionModel: Model<Instruction>,
    @InjectModel(Tool.name) private toolModel: Model<Tool>,
    @InjectModel(AgentMemory.name) private memoryModel: Model<AgentMemory>,
    private readonly jwtService: JwtService,
    private readonly agentProducer: AgentProducer,
    private readonly configurationService: ConfigurationService,
    private readonly deploymentService: DeploymentService,
    private readonly nodeService: NodeService,
    private readonly httpService: HttpService,
    private readonly conversationService: ConversationService,
    private readonly actionService: ActionService,
    private readonly heartbeatService: HeartbeatService,
  ) {
    super(agentModel as any);
  }

  onModuleDestroy() {
    this.redisPub?.disconnect();
    this.redisPub = null;
  }

  private getRedisPub(): Redis {
    if (!this.redisPub) {
      this.redisPub = new Redis(buildRedisConfig());
    }
    return this.redisPub;
  }

  private async publishNodeCommand(
    nodeId: string,
    commandType: string,
    resource: { type: string; id: string },
    data: Record<string, any>,
  ): Promise<string> {
    const messageId = uuidv4();
    const payload = {
      type: commandType,
      messageId,
      timestamp: new Date().toISOString(),
      resource,
      data,
      metadata: { priority: 'normal' },
    };
    await this.getRedisPub().publish(`node:cmd:${nodeId}`, JSON.stringify(payload));
    return messageId;
  }

  private isOrgOwner(context: RequestContext): boolean {
    return !!context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
  }

  private publishWorkerRestart(agentId: string, requestedBy: string, reason?: string) {
    const payload: AgentWorkerCmdEvent = {
      type: 'restart',
      agentId,
      requestedBy,
      reason,
      ts: Date.now(),
    };
    this.getRedisPub()
      .publish(REDIS_CHANNEL_AGENT_WORKER_CMD, JSON.stringify(payload))
      .catch((err) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.logger as any)?.warn?.(`Failed to publish agent restart event: ${(err as Error).message}`);
      });
  }

  /**
   * Override findById to support populate
   * If query has 'populate=instruction', populate the instructionId field
   */
  async findById(
    id: any,
    context: RequestContext,
    query?: any
  ): Promise<Partial<Agent> | null> {
    const shouldPopulate = query?.populate === 'instruction';

    if (shouldPopulate) {
      const agent = await this.agentModel
        .findOne({ _id: id, isDeleted: false })
        .populate('instructionId')
        .exec();
      if (!agent) return null;
      if (!this.isOrgOwner(context) && agent.owner?.userId !== context.userId) {
        throw new ForbiddenException('You can only access agents you created');
      }
      return agent as Agent;
    }

    const agent = await super.findById(id, context);
    if (!this.isOrgOwner(context) && (agent as any)?.owner?.userId !== context.userId) {
      throw new ForbiddenException('You can only access agents you created');
    }
    return agent;
  }

  /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Agent>> {
    const andConditions: any[] = [];

    // Handle search
    const searchQuery = options.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      andConditions.push({
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { labels: searchRegex },
        ],
      });
      delete options.search;
    }
    options.selectFields = ['-secret', '-settings'];
    options.statisticFields = ['type','status','framework'];
    if (!this.isOrgOwner(context)) {
      options.filter = { ...options.filter, 'owner.userId': context.userId };
    }
    const findResult = await super.findAll(options, context);
    return findResult;
  }

  async create(
    createAgentDto: CreateAgentDto,
    context: RequestContext
  ): Promise<Agent> {
    // Both assistant and engineer agents have secrets for authentication
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

    // Validate deploymentId for assistant agents and pi-agent-sdk framework
    if (createAgentDto.type === 'assistant') {
      await this.validateHostedDeployment(createAgentDto.deploymentId);
    }
    if (createAgentDto.framework === 'pi-agent-sdk') {
      if (createAgentDto.type !== 'engineer') {
        throw new BadRequestException('pi-agent-sdk framework is only available for engineer agents');
      }
      await this.validateHostedDeployment(createAgentDto.deploymentId);
    }

    // Validate nodeId for engineer agents with nodeId (system-managed via node)
    if (createAgentDto.type === 'engineer' && createAgentDto.nodeId) {
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

    // Generate unique code for this org
    (createAgentDto as any).code = await this.generateCode(context.orgId);

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

    // For engineer agents with nodeId, send agent.start command to the target node via WebSocket
    if (saved.type === 'engineer' && saved.nodeId) {
      try {
        await this.publishNodeCommand(
          saved.nodeId,
          MessageType.AGENT_START,
          { type: 'agent', id: (saved as any)._id.toString() },
          {
            agentId: (saved as any)._id.toString(),
            code: saved.code,
            name: saved.name,
            description: saved.description,
            status: saved.status,
            type: saved.type,
            framework: saved.framework,
            secret: plaintextSecret,
            instructionId: saved.instructionId,
            guardrailId: saved.guardrailId,
            deploymentId: saved.deploymentId,
            settings: await this.buildSettingsWithOAuthToken(
              (saved.settings as Record<string, unknown>) || {},
              saved.framework,
              context.orgId
            ),
          },
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
   * Used by agent to refresh instruction without reconnecting.
   * Pass systemPromptOverride to preview a different systemPrompt without saving.
   */
  async getAgentInstruction(
    agentId: string,
    accessToken: string,
    systemPromptOverride?: string,
    mode?: 'rendered' | 'raw'
  ): Promise<{
    id: string;
    systemPrompt: string;
    isPreview?: boolean;
    mode?: string;
  }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    if (mode === 'raw') {
      return this.buildRawInstructionForAgent(agent);
    }

    return this.buildInstructionObjectForAgent(
      agent,
      accessToken,
      systemPromptOverride
    );
  }

  /**
   * Update the systemPrompt of the agent's current instruction.
   * Throws if agent has no instruction configured.
   */
  async updateAgentInstruction(
    agentId: string,
    systemPrompt: string,
    context: RequestContext,
    accessToken?: string,
    dryRun?: boolean
  ): Promise<{
    id: string;
    name?: string;
    systemPrompt: string;
    isPreview?: boolean;
  }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    if (!agent.instructionId) {
      throw new BadRequestException('Agent has no instruction configured');
    }

    if (dryRun) {
      return this.buildInstructionObjectForAgent(
        agent,
        accessToken,
        systemPrompt
      );
    }

    const updated = await this.instructionModel
      .findOneAndUpdate(
        { _id: agent.instructionId, isDeleted: false },
        { $set: { systemPrompt, updatedBy: context.userId } },
        { new: true }
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Instruction not found');
    }

    const payload: InstructionUpdatedEvent = {
      instructionId: (updated._id as Types.ObjectId).toString(),
      updatedAt: ((updated as any).updatedAt instanceof Date ? (updated as any).updatedAt.toISOString() : (updated as any).updatedAt) ?? new Date().toISOString(),
    };
    this.getRedisPub()
      .publish(REDIS_CHANNEL_INSTRUCTION_UPDATED, JSON.stringify(payload))
      .catch((err) => {
        this.logger.warn(`Failed to publish instruction-updated event: ${(err as Error).message}`);
      });

    return {
      id: (updated._id as Types.ObjectId).toString(),
      name: updated.name,
      systemPrompt: updated.systemPrompt,
    };
  }

  /**
   * Get agent configuration for engineer agents
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

    // Prepare response (no accessToken for engineer agents - they use user's JWT)
    const response: AgentConnectResponseDto = {
      id: agentId,
      name: agent.name,
      accessToken: '', // Empty - engineer agents use user's JWT token
      expiresIn: 0,
      refreshToken: null,
      refreshExpiresIn: 0,
      tokenType: 'bearer',
      mcpServers,
      instruction,
      tools,
      allowedFunctions: agent.allowedFunctions || [],
      framework: agent.framework,
      settings: agent.settings || {},
      channels: agent.channels || [],
      ragEnabled: agent.ragEnabled ?? false,
      ragCollections: (agent.ragCollectionIds || []).map((id) => ({
        collectionId: id.toString(),
        topK: agent.ragSettings?.topK ?? 5,
        minScore: agent.ragSettings?.minScore ?? 0.7,
      })),
      ragConfig: agent.ragConfig ?? null,
    };

    // For autonomous and hosted agents, populate deployment info
    if (
      (agent.type === 'assistant' || agent.type === 'engineer') &&
      agent.deploymentId
    ) {
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
              multimodal: (deployment.metadata as any)?.multimodal === true,
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
   * For engineer agents with nodeId (system-managed via node WebSocket)
   */
  /**
   * Internal connect for assistant agents spawned by AgentWorkerService.
   * Bypasses secret verification — caller is trusted (same process).
   */
  async connectInternal(agentId: string): Promise<AgentConnectResponseDto> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }
    if (agent.status === 'suspended') {
      throw new UnauthorizedException('Agent is suspended');
    }

    return this.buildConnectResponse(agent);
  }

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

    return this.buildConnectResponse(agent, connectDto.version);
  }

  private async buildConnectResponse(
    agent: AgentDocument,
    version?: string
  ): Promise<AgentConnectResponseDto> {
    const agentId = (agent as any)._id.toString();

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

    // Token lifetime configurable via AGENT_TOKEN_EXPIRES_IN_SECONDS (default 24h)
    const expiresInSeconds = parseInt(process.env.AGENT_TOKEN_EXPIRES_IN_SECONDS || '86400', 10);
    const token = this.jwtService.sign(payload, { expiresIn: expiresInSeconds });

    // Build instruction object (with context injection using agent token)
    const instruction = await this.buildInstructionObjectForAgent(agent, token);

    const tools = await this.getAllowedTools(agent);
    const allowedFunctions = agent.allowedFunctions || [];

    // Update connection tracking + set status to idle
    const connectionUpdate: Record<string, any> = { lastConnectedAt: new Date(), status: 'idle' };
    if (version !== undefined) {
      connectionUpdate.version = version;
    }
    await this.agentModel.updateOne(
      { _id: agent._id },
      {
        $set: connectionUpdate,
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
    // Build RAG collections config
    const ragCollections = (agent.ragCollectionIds || []).map((id) => ({
      collectionId: id.toString(),
      topK: agent.ragSettings?.topK ?? 5,
      minScore: agent.ragSettings?.minScore ?? 0.7,
    }));

    // Build settings, injecting claude_oauthToken for claude-agent-sdk framework
    const agentSettings = await this.buildSettingsWithOAuthToken(
      (agent.settings as Record<string, unknown>) || {},
      agent.framework,
      agent.owner.orgId
    );

    const response: AgentConnectResponseDto = {
      id: agentId,
      name: agent.name,
      accessToken: token,
      expiresIn: expiresInSeconds,
      refreshToken: null, // Not implemented for agents
      refreshExpiresIn: 0,
      tokenType: 'bearer',
      mcpServers, // MCP server configurations
      instruction,
      tools,
      allowedFunctions,
      framework: agent.framework,
      settings: agentSettings,
      channels: agent.channels || [],
      ragEnabled: agent.ragEnabled ?? false,
      ragCollections,
      ragConfig: agent.ragConfig ?? null,
      agentCode: agent.code || undefined,
      browserApiUrl: (await this.configurationService.findByKey(
        ConfigKey.PINCHTAB_API_URL as any,
        { orgId: agent.owner.orgId } as RequestContext
      ))?.value ?? null,
      browserApiKey: (await this.configurationService.findByKey(
        ConfigKey.PINCHTAB_API_KEY as any,
        { orgId: agent.owner.orgId } as RequestContext
      ))?.value ?? null,
    };

    // For autonomous and hosted agents, populate deployment info
    if (
      (agent.type === 'assistant' || agent.type === 'engineer') &&
      agent.deploymentId
    ) {
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
              multimodal: (deployment.metadata as any)?.multimodal === true,
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
   * Build agent settings, injecting claude_oauthToken when framework is claude-agent-sdk.
   */
  private async buildSettingsWithOAuthToken(
    baseSettings: Record<string, unknown>,
    framework: string,
    orgId: string
  ): Promise<Record<string, unknown>> {
    const settings = { ...baseSettings };
    if (framework === 'claude-agent-sdk') {
      try {
        const config = await this.configurationService.findByKey(
          ConfigKey.ANTHROPIC_OAUTH_TOKEN as any,
          { orgId } as RequestContext
        );
        if (config?.value) {
          settings.claude_oauthToken = config.value;
        }
      } catch (error) {
        this.logger.warn('Failed to fetch anthropic oauth token from configuration', {
          error: error.message,
        });
      }
    }
    return settings;
  }

  /**
   * Build instruction object for agent (new format)
   * Returns structured instruction with id and systemPrompt.
   * Pass systemPromptOverride to render with a different core prompt (preview only).
   */
  private async buildInstructionObjectForAgent(
    agent: Agent,
    accessToken?: string,
    systemPromptOverride?: string
  ): Promise<{
    id: string;
    systemPrompt: string;
    isPreview?: boolean;
  }> {
    if (!agent.instructionId) {
      return {
        id: '',
        systemPrompt: 'No instruction configured for this agent.',
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
      };
    }

    // Use override for preview if provided, otherwise use stored systemPrompt
    const corePrompt = systemPromptOverride ?? instruction.systemPrompt;

    // Resolve @project:<id> and @document:<id> references if token available
    let contextBlocks: string[] = [];
    if (accessToken) {
      contextBlocks = await this.resolveContextReferences(
        corePrompt,
        accessToken,
        agent.owner.orgId
      );
    }

    const tools = await this.getAllowedTools(agent);
    const agentId = (agent as any)._id.toString();

    const hasMemory = tools.some((t) => t.name === 'MemoryManagement');
    const memorySummaries = hasMemory
      ? await this.fetchMemorySummaries(agentId)
      : [];

    const result: { id: string; systemPrompt: string; isPreview?: boolean } = {
      id: agentId,
      systemPrompt: this.buildFinalSystemPrompt(
        corePrompt,
        contextBlocks,
        tools,
        agentId,
        memorySummaries,
        agent.code || undefined,
        agent.instructionId?.toString(),
        agent.owner?.orgId
      ),
    };

    if (systemPromptOverride !== undefined) {
      result.isPreview = true;
    }

    return result;
  }

  /**
   * Return the raw (non-injected) systemPrompt of the agent's instruction.
   */
  private async buildRawInstructionForAgent(
    agent: Agent
  ): Promise<{ id: string; systemPrompt: string; mode: string }> {
    if (!agent.instructionId) {
      return {
        id: '',
        systemPrompt: 'No instruction configured for this agent.',
        mode: 'raw',
      };
    }

    const instruction = await this.instructionModel
      .findOne({ _id: agent.instructionId, isDeleted: false })
      .exec();

    if (!instruction) {
      return { id: '', systemPrompt: 'Instruction not found.', mode: 'raw' };
    }

    return {
      id: (instruction._id as Types.ObjectId).toString(),
      systemPrompt: instruction.systemPrompt,
      mode: 'raw',
    };
  }

  /**
   * Resolve @project:<id> and @document:<id> references in systemPrompt
   * Returns context blocks as string[] — caller assembles the final prompt
   */
  private async resolveContextReferences(
    systemPrompt: string,
    accessToken: string,
    orgId: string
  ): Promise<string[]> {
    // Scan for @project:<id> and @document:<id> patterns
    const refPattern = /@(project|document):([a-f0-9]{24})/g;
    const matches = [...systemPrompt.matchAll(refPattern)];

    if (matches.length === 0) {
      return [];
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
          // Fetch related documents (published) for this project
          let documentsBlock = '';
          try {
            const docsUrl = `${cbmBaseUrl}/documents?projectId=${refId}&status=published&limit=100`;
            this.logger.debug(
              `Fetching documents for project ${refId} from ${docsUrl}`
            );
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
              documentsBlock = `\n- Published Documents** (${docs.length}):\n${docsList}`;
            }
          } catch (docError: any) {
            this.logger.warn(
              `Failed to fetch documents for project ${refId}: ${docError.message}`
            );
          }

          // Build members block
          let membersBlock = '';
          const members: Array<{ type: string; id: string; role: string }> =
            data.members || [];
          if (members.length > 0) {
            const memberLines: string[] = [];
            for (const member of members) {
              if (member.type === 'agent') {
                try {
                  const agentData = await this.agentModel
                    .findById(member.id)
                    .select('code name instructionId')
                    .lean();
                  memberLines.push(
                    `  - [agent] id=${member.id} code=${agentData?.code || 'N/A'} name=${agentData?.name || 'N/A'} instructionId=${agentData?.instructionId || 'N/A'} role=${member.role}`
                  );
                } catch {
                  memberLines.push(
                    `  - [agent] id=${member.id} role=${member.role}`
                  );
                }
              } else {
                memberLines.push(
                  `  - [user] userId=${member.id} role=${member.role}`
                );
              }
            }
            membersBlock = `\n- Members (${members.length}):\n${memberLines.join('\n')}`;
          }

          contextBlocks.push(
            `Project: ${data.name}\n` +
              `-ID: ${refId}\n` +
              `-Status: ${data.status || 'N/A'}\n` +
              `-Timeline: ${startDate} → ${endDate}\n` +
              `-Description: ${data.description || 'N/A'}\n` +
              `-Tags: ${(data.tags || []).join(', ') || 'N/A'}` +
              membersBlock +
              documentsBlock
          );
        } else if (refType === 'document') {
          const lines = [
            `Document: ${data.summary}`,
            `- ID: ${refId}`,
            `- Type: ${data.type || 'N/A'}`,
            `- Status: ${data.status || 'N/A'}`,
            `- Share Mode: ${data.shareMode || 'N/A'}`,
          ];
          if (data.projectId) {
            lines.push(`- Project ID: ${data.projectId}`);
          }
          contextBlocks.push(lines.join('\n'));
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

    return contextBlocks;
  }

  /**
   * Build final systemPrompt string with structured sections:
   * <system>...</system>
   * <context>...</context>   (only if context blocks exist)
   * <runtime>...</runtime>
   */
  private buildFinalSystemPrompt(
    corePrompt: string,
    contextBlocks: string[],
    tools: Tool[],
    agentId: string,
    memorySummaries: { category: MemoryCategory; key: string; summary: string }[],
    agentCode?: string,
    instructionId?: string,
    orgId?: string
  ): string {
    const toolNames = new Set(tools.map((t) => t.name));

    const ruleBlocks: string[] = [];

    if (toolNames.has('MemoryManagement')) {
      const snapshotLines: string[] = [];
      if (memorySummaries.length > 0) {
        const byCategory = new Map<string, typeof memorySummaries>();
        for (const m of memorySummaries) {
          if (!byCategory.has(m.category)) byCategory.set(m.category, []);
          byCategory.get(m.category)!.push(m);
        }
        for (const [cat, entries] of byCategory) {
          snapshotLines.push(`[${cat}]`);
          for (const e of entries) snapshotLines.push(`- ${e.key}: ${e.summary}`);
        }
      }

      const snapshotBlock =
        snapshotLines.length > 0
          ? `MEMORY SNAPSHOT (at session start):\n${snapshotLines.join('\n')}\n\n`
          : '';

      ruleBlocks.push(
        `${snapshotBlock}MEMORY RULES:
- Trước khi trả lời về quyết định đã đưa ra, preferences của ai đó, notes đặc biệt:
  gọi mcp__Builtin__SearchMemory với category và keyword phù hợp trước
- Sau cuộc trò chuyện có thông tin mới thuộc 1 trong 4 categories:
  gọi mcp__Builtin__UpsertMemory để lưu lại ngay, không để quên
- Nếu muốn biết đang lưu gì hoặc tránh duplicate key:
  gọi mcp__Builtin__ListMemoryKeys

MEMORY CATEGORIES:
- user-preferences: cách làm việc, style giao tiếp, preferences của từng người
- decisions: quyết định quan trọng đã được approve (ghi rõ ngày, người quyết định, lý do)
- notes: thông tin team, ngữ cảnh dự án, thông tin không có trong tài liệu chính thức
- lessons: bài học rút ra, điều cần tránh lặp lại`
      );
    }

    if (toolNames.has('WorkManagement')) {
      ruleBlocks.push(
        `SCHEDULING RULES:
- Khi user yêu cầu báo cáo định kỳ, nhắc nhở, hoặc task lặp lại:
  chủ động tạo scheduled/recurring task qua WorkManagement tool, không chờ user nhắc lại
- Ví dụ triggers: "nhắc anh", "hàng tuần", "mỗi sáng thứ 2", "trước deadline 2 ngày"`
      );
    }

    const systemContent =
      ruleBlocks.length > 0
        ? `${corePrompt}\n\n${ruleBlocks.join('\n\n')}`
        : corePrompt;

    const parts: string[] = [`<system>\n${systemContent}\n</system>`];

    if (contextBlocks.length > 0) {
      parts.push(`<context>\n${contextBlocks.join('\n\n')}\n</context>`);
    }

    const runtimeLines = [
      `Datetime: ${new Date().toISOString()}`,
      `Agent ID: ${agentId}`,
    ];
    if (agentCode) runtimeLines.push(`Agent Code: ${agentCode}`);
    if (instructionId) runtimeLines.push(`Instruction ID: ${instructionId}`);
    if (orgId) runtimeLines.push(`Organization ID: ${orgId}`);
    parts.push(`<runtime>\n${runtimeLines.join('\n')}\n</runtime>`);

    parts.push(
      `<message_format>
User messages may contain optional metadata blocks prepended before the actual message content:

- <user_info>: Identity metadata of the sender (User ID, Username, Discord ID, Channel ID, etc.).
  → Read silently for context. Do NOT acknowledge, quote, or explain this block to the user.

- <references>: Resources or text snippets the user selected in the UI (documents, notes, etc.).
  → Treat as context the user wants you to use when answering. Do NOT describe or explain the XML structure itself — just use the referenced content naturally in your response.

- <knowledge_context>: Relevant knowledge chunks retrieved from the knowledge base.
  → Use as supporting information when formulating your answer. Please mention <knowledge_context> as part of your reasoning if it helps you answer the question, but do NOT quote the XML tags or explain the structure to the user.

These blocks are system metadata, not questions. Never explain them. Never repeat them back. Focus solely on the user's actual message after the blocks.
</message_format>`
    );

    return parts.join('\n\n---\n\n');
  }

  private async fetchMemorySummaries(
    agentId: string
  ): Promise<{ category: MemoryCategory; key: string; summary: string }[]> {
    const entries = await this.memoryModel
      .find({ agentId, isDeleted: false })
      .sort({ category: 1, updatedAt: -1 })
      .select('category key summary content')
      .lean()
      .exec();

    return entries.map((e) => ({
      category: e.category as MemoryCategory,
      key: e.key,
      summary: (e as any).summary || (e.content as string).substring(0, 100),
    }));
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

  async heartbeat(
    agentId: string,
    heartbeatDto: AgentHeartbeatDto,
    accessToken?: string,
  ) {
    return this.heartbeatService.heartbeat(agentId, heartbeatDto, accessToken);
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
   * Stop agent — transitions status to suspended.
   * Allowed from: idle, inactive. Blocked if busy.
   */
  /**
   * Send a lifecycle command to the node managing this agent.
   * Only applicable for engineer agents with nodeId.
   */
  private async sendLifecycleCommandToNode(
    agent: AgentDocument,
    commandType: string,
    fullConfig: boolean,
    context: RequestContext
  ): Promise<void> {
    if (agent.type !== 'engineer' || !agent.nodeId) return;

    const agentId = (agent as any)._id.toString();
    const data: Record<string, any> = { agentId, code: agent.code, name: agent.name };

    if (fullConfig) {
      Object.assign(data, {
        description: agent.description,
        status: agent.status,
        type: agent.type,
        framework: agent.framework,
        instructionId: agent.instructionId,
        guardrailId: agent.guardrailId,
        deploymentId: agent.deploymentId,
        settings: await this.buildSettingsWithOAuthToken(
          (agent.settings as Record<string, unknown>) || {},
          agent.framework,
          context.orgId
        ),
      });
    }

    try {
      await this.publishNodeCommand(
        agent.nodeId,
        commandType,
        { type: 'agent', id: agentId },
        data,
      );
      this.logger.log(`${commandType} sent to node ${agent.nodeId} for agent ${agentId}`);
    } catch (error: any) {
      this.logger.warn(`Could not send ${commandType} to node ${agent.nodeId}: ${error.message}`);
    }
  }

  async stopAgent(
    agentId: string,
    context: RequestContext
  ): Promise<{ success: boolean; status: string }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    if (agent.status === 'busy') {
      throw new BadRequestException('Agent is busy. Please try again later.');
    }

    if (agent.status === 'suspended') {
      return { success: true, status: 'suspended' };
    }

    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: { status: 'suspended', updatedBy: context.userId } }
    );

    this.logger.log('Agent stopped (suspended)', {
      agentId,
      name: agent.name,
      previousStatus: agent.status,
      by: context.userId,
    });

    // Notify node to stop agent process
    await this.sendLifecycleCommandToNode(agent, MessageType.AGENT_STOP, false, context);
    // TODO: handle non-nodeId agents (self-deployed engineer / assistant)

    return { success: true, status: 'suspended' };
  }

  /**
   * Start agent — transitions status from suspended back to inactive.
   * Only allowed when agent is suspended.
   */
  async startAgent(
    agentId: string,
    context: RequestContext
  ): Promise<{ success: boolean; status: string }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    if (agent.status !== 'suspended') {
      throw new BadRequestException(
        `Agent is not suspended (current status: ${agent.status})`
      );
    }

    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: { status: 'inactive', updatedBy: context.userId } }
    );

    this.logger.log('Agent started (inactive)', {
      agentId,
      name: agent.name,
      by: context.userId,
    });

    // Notify node to start agent process (full config needed)
    await this.sendLifecycleCommandToNode(agent, MessageType.AGENT_START, true, context);
    // TODO: handle non-nodeId agents (self-deployed engineer / assistant)

    return { success: true, status: 'inactive' };
  }

  /**
   * Wake agent — transitions status from sleep back to idle.
   * Clears sleep metadata fields.
   */
  async wakeAgent(
    agentId: string,
    context: RequestContext
  ): Promise<{ success: boolean; status: string }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    if (agent.status !== 'sleep') {
      throw new BadRequestException(
        `Agent is not sleeping (current status: ${agent.status})`
      );
    }

    await this.agentModel.updateOne(
      { _id: agent._id },
      {
        $set: {
          status: 'idle',
          sleepReason: null,
          sleepSince: null,
          sleepUntil: null,
          currentTask: null,
          updatedBy: context.userId,
        },
      }
    );

    this.logger.log('Agent woken up', {
      agentId,
      name: agent.name,
      previousSleepReason: agent.sleepReason,
      by: context.userId,
    });
    return { success: true, status: 'idle' };
  }

  /**
   * Sleep agent — admin-initiated sleep.
   * Allowed from idle or inactive status.
   */
  async sleepAgent(
    agentId: string,
    sleepDto: { reason: string; until?: string | null },
    context: RequestContext
  ): Promise<{ success: boolean; status: string }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    if (agent.status === 'busy') {
      throw new BadRequestException('Agent is busy. Use stop or restart instead.');
    }

    if (agent.status === 'suspended') {
      throw new BadRequestException('Agent is suspended. Use start first.');
    }

    if (agent.status === 'sleep') {
      return { success: true, status: 'sleep' };
    }

    await this.agentModel.updateOne(
      { _id: agent._id },
      {
        $set: {
          status: 'sleep',
          sleepReason: sleepDto.reason,
          sleepSince: new Date(),
          sleepUntil: sleepDto.until ? new Date(sleepDto.until) : null,
          updatedBy: context.userId,
        },
      }
    );

    this.logger.log('Agent put to sleep', {
      agentId,
      name: agent.name,
      reason: sleepDto.reason,
      until: sleepDto.until ?? 'indefinite',
      previousStatus: agent.status,
      by: context.userId,
    });
    return { success: true, status: 'sleep' };
  }

  /**
   * Restart agent — force reset to inactive from any non-suspended status.
   * Unlike stop, this is allowed when agent is busy.
   */
  async restartAgent(
    agentId: string,
    context: RequestContext
  ): Promise<{ success: boolean; status: string; previousStatus: string }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    if (agent.status === 'suspended') {
      throw new BadRequestException(
        'Agent is suspended. Use start instead of restart.'
      );
    }

    const isNodeAgent = agent.type === 'engineer' && !!agent.nodeId;
    if (agent.status === 'inactive' && !isNodeAgent) {
      return { success: true, status: 'inactive', previousStatus: 'inactive' };
    }

    const previousStatus = agent.status;
    const updateFields: Record<string, any> = {
      status: 'inactive',
      updatedBy: context.userId,
    };

    if (agent.status === 'sleep') {
      updateFields.sleepReason = null;
      updateFields.sleepSince = null;
      updateFields.sleepUntil = null;
    }

    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: updateFields }
    );

    this.logger.log('Agent restarted', {
      agentId,
      name: agent.name,
      previousStatus,
      by: context.userId,
    });

    if (agent.type === 'assistant') {
      // In-process assistant agents are managed by the `agt` worker. Broadcast
      // a restart command on Redis pub/sub — the instance currently holding the
      // lock for this agent will tear down its AgentRunner and respawn from DB.
      this.publishWorkerRestart(agentId, context.userId);
    } else {
      // Engineer agents: notify node to restart agent process (full config needed)
      await this.sendLifecycleCommandToNode(agent, MessageType.AGENT_RESTART, true, context);
    }

    return { success: true, status: 'inactive', previousStatus };
  }

  /**
   * Update agent on node — trigger node to pull latest version and restart agent.
   * Does not change agent status in DB.
   */
  async updateAgentOnNode(
    agentId: string,
    context: RequestContext
  ): Promise<{ success: boolean }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    if (agent.type !== 'engineer' || !agent.nodeId) {
      // TODO: handle non-nodeId agents
      throw new BadRequestException(
        'Update action is only supported for engineer agents deployed on a node.'
      );
    }

    await this.sendLifecycleCommandToNode(agent, MessageType.AGENT_UPDATE, true, context);

    this.logger.log('Agent update triggered', {
      agentId,
      name: agent.name,
      nodeId: agent.nodeId,
      by: context.userId,
    });
    return { success: true };
  }

  /**
   * Regenerate agent credentials (admin only)
   * Returns new secret + env config + install script
   * Works for both assistant and engineer agents
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

    // For engineer agents with nodeId, notify node via WebSocket with new secret
    if (agent.type === 'engineer' && agent.nodeId) {
      try {
        await this.publishNodeCommand(
          agent.nodeId,
          MessageType.AGENT_UPDATE,
          { type: 'agent', id: agentId },
          {
            agentId,
            code: agent.code,
            name: agent.name,
            description: agent.description,
            status: agent.status,
            type: agent.type,
            framework: agent.framework,
            secret: newSecret,
            instructionId: agent.instructionId,
            guardrailId: agent.guardrailId,
            deploymentId: agent.deploymentId,
            settings: await this.buildSettingsWithOAuthToken(
              (agent.settings as Record<string, unknown>) || {},
              agent.framework ?? '',
              context.orgId
            ),
          },
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

    // Platform connections are now managed via Connection module (not agent-level)
    envConfig += `# DISCORD_TOKEN=your_discord_token\n# DISCORD_CHANNEL_ID=your_channel_id\n`;
    envConfig += `# TELEGRAM_BOT_TOKEN=your_telegram_token\n# TELEGRAM_GROUP_ID=your_group_id\n`;

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

  /**
   * Resolve an agent identifier (ObjectId or code) to a MongoDB ObjectId string.
   * Code format: [a-z-]+ (only lowercase letters and hyphens)
   */
  async resolveAgentId(idOrCode: string, orgId: string): Promise<string> {
    if (/^[a-f0-9]{24}$/.test(idOrCode)) {
      return idOrCode;
    }
    const agent = await this.agentModel
      .findOne({ code: idOrCode, 'owner.orgId': orgId, isDeleted: false })
      .select('_id')
      .lean();
    if (!agent) {
      throw new NotFoundException(`Agent not found: ${idOrCode}`);
    }
    return (agent as any)._id.toString();
  }

  /**
   * Generate a unique agent code for the given org using Fisher-Yates shuffle.
   * Format: [name]-[adjective], e.g. "jack-bold"
   */
  private async generateCode(orgId: string): Promise<string> {
    const NAMES = AGENT_CODE_NAMES;
    const ADJS = AGENT_CODE_ADJS;

    const existing = await this.agentModel
      .find({ 'owner.orgId': orgId, isDeleted: false })
      .select('code')
      .lean();
    const usedSet = new Set(existing.map((a: any) => a.code).filter(Boolean));

    // Shuffle helper (Fisher-Yates)
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Phase 1: single names
    const singlePool = shuffle(NAMES);
    const single = singlePool.find((c) => !usedSet.has(c));
    if (single) return single;

    // Phase 2: name-adj combinations
    const combos: string[] = [];
    for (const n of NAMES) for (const a of ADJS) combos.push(`${n}-${a}`);
    const comboPool = shuffle(combos);
    const combo = comboPool.find((c) => !usedSet.has(c));
    if (combo) return combo;

    throw new BadRequestException(
      'Organization has reached the maximum number of agents'
    );
  }

  async updateAgent(
    id: string,
    updateAgentDto: UpdateAgentDto,
    context: RequestContext
  ): Promise<Partial<Agent> | null> {
    if (!this.isOrgOwner(context)) {
      const existing = await this.agentModel.findOne({ _id: id, isDeleted: false }).lean().exec();
      if (!existing || (existing as any).owner?.userId !== context.userId) {
        throw new ForbiddenException('You can only update agents you created');
      }
    }

    // Only organization.owner or universe.owner can set role to organization.owner
    if (updateAgentDto.role === 'organization.owner') {
      const isOrgOwner =
        context.roles?.includes(PredefinedRole.OrganizationOwner) ||
        context.roles?.includes(PredefinedRole.UniverseOwner);
      if (!isOrgOwner) {
        throw new ForbiddenException(
          'Only organization.owner can assign organization.owner role to an agent'
        );
      }
    }

    // Prevent type changes (assistant <-> engineer)
    if (updateAgentDto.type) {
      const existingAgent = await this.agentModel.findById(id).exec();
      if (existingAgent && existingAgent.type !== updateAgentDto.type) {
        throw new BadRequestException(
          `Cannot change agent type from '${existingAgent.type}' to '${updateAgentDto.type}'. ` +
            'Please delete and recreate the agent with the desired type.'
        );
      }
    }

    // Validate deploymentId for assistant agents and pi-agent-sdk framework
    if (updateAgentDto.deploymentId || updateAgentDto.framework === 'pi-agent-sdk') {
      const existingAgent = await this.agentModel.findById(id).exec();
      const effectiveType = updateAgentDto.type ?? existingAgent?.type;
      const effectiveFramework = updateAgentDto.framework ?? existingAgent?.framework;
      const effectiveDeploymentId = updateAgentDto.deploymentId ?? existingAgent?.deploymentId;

      if (effectiveType === 'assistant') {
        await this.validateHostedDeployment(effectiveDeploymentId);
      }
      if (effectiveFramework === 'pi-agent-sdk') {
        if (effectiveType !== 'engineer') {
          throw new BadRequestException('pi-agent-sdk framework is only available for engineer agents');
        }
        await this.validateHostedDeployment(effectiveDeploymentId);
      }
    }

    // Strip code — immutable after creation
    delete (updateAgentDto as any).code;
    // Strip status updates from this endpoint — status is managed by the agent itself and heartbeat
    delete (updateAgentDto as any).status;
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

      // Send agent.restart to node via WebSocket if engineer agent with nodeId
      // Node will restart the agent process with the updated config
      if (updated.type === 'engineer' && updated.nodeId) {
        await this.sendLifecycleCommandToNode(
          updated as AgentDocument,
          MessageType.AGENT_RESTART,
          true,
          context
        );
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

    if (!this.isOrgOwner(context) && agent?.owner?.userId !== context.userId) {
      throw new ForbiddenException('You can only delete agents you created');
    }

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

      // For engineer agents with nodeId, send agent.delete command to the node via WebSocket
      if (agent && agent.type === 'engineer' && agent.nodeId) {
        try {
          await this.publishNodeCommand(
            agent.nodeId,
            MessageType.AGENT_DELETE,
            { type: 'agent', id },
            {
              agentId: id,
              code: agent.code,
              name: agent.name,
            },
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

  /**
   * Generate an anonymous JWT token for chatbot widget integration.
   * Token allows anonymous users to connect to the agent's chat WebSocket.
   */
  async generateAnonymousToken(
    agentId: string,
    dto: AnonymousTokenDto,
    context: RequestContext
  ): Promise<AnonymousTokenResponseDto> {
    const agent = await this.findById(
      new Types.ObjectId(agentId) as any,
      context
    );
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    const anonymousId = dto.anonymousId || uuidv4();
    const expiresIn =
      dto.expiresIn && dto.expiresIn > 0 ? dto.expiresIn : 86400;
    const tokenId = uuidv4();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const payload = {
      type: 'anonymous',
      agentId,
      orgId: (agent as any).owner?.orgId || context.orgId,
      anonymousId,
      userId: '',
      tokenId,
    };

    const token = this.jwtService.sign(payload, { expiresIn });

    await this.model.updateOne(
      { _id: agentId },
      {
        $push: {
          anonymousTokens: {
            tokenId,
            createdAt: new Date(),
            expiresAt,
          },
        },
      }
    );

    this.logger.log(
      `Generated anonymous token for agent ${agentId}, tokenId=${tokenId}, anonymousId=${anonymousId}, expiresIn=${expiresIn}s`
    );

    return {
      token,
      anonymousId,
      expiresIn,
      expiresAt: expiresAt.toISOString(),
      tokenId,
    };
  }

  /**
   * List all anonymous tokens for an agent (without JWT values).
   */
  async listAnonymousTokens(
    agentId: string,
    context: RequestContext
  ): Promise<AnonymousTokenListResponseDto> {
    const agent = await this.findById(
      new Types.ObjectId(agentId) as any,
      context
    );
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    const agentWithTokens = await this.model
      .findById(agentId)
      .select('anonymousTokens')
      .lean();

    const tokens: AnonymousTokenEntryDto[] = (
      (agentWithTokens as any)?.anonymousTokens || []
    ).map((t: any) => ({
      tokenId: t.tokenId,
      createdAt: t.createdAt,
      lastConnectedAt: t.lastConnectedAt,
      expiresAt: t.expiresAt,
      revokedAt: t.revokedAt,
      isActive: !t.revokedAt && new Date(t.expiresAt) > new Date(),
    }));

    return { items: tokens, total: tokens.length };
  }

  /**
   * Revoke an anonymous token by setting revokedAt.
   */
  async revokeAnonymousToken(
    agentId: string,
    tokenId: string,
    context: RequestContext
  ): Promise<void> {
    const agent = await this.findById(
      new Types.ObjectId(agentId) as any,
      context
    );
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    const result = await this.model.updateOne(
      {
        _id: agentId,
        'anonymousTokens.tokenId': tokenId,
        'anonymousTokens.revokedAt': { $exists: false },
      },
      { $set: { 'anonymousTokens.$.revokedAt': new Date() } }
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException(
        `Token ${tokenId} not found or already revoked`
      );
    }

    this.logger.log(`Revoked anonymous token ${tokenId} for agent ${agentId}`);
  }

  /**
   * Validate an anonymous token is active (not revoked) and update lastConnectedAt.
   * Returns false if token is revoked or not found.
   */
  async validateAndTouchAnonymousToken(
    agentId: string,
    tokenId: string
  ): Promise<boolean> {
    const agentWithToken = await this.agentModel
      .findOne({ _id: agentId, 'anonymousTokens.tokenId': tokenId })
      .select('anonymousTokens.$')
      .lean();

    const tokenEntry = (agentWithToken as any)?.anonymousTokens?.[0];
    if (!tokenEntry || tokenEntry.revokedAt) {
      return false;
    }

    await this.agentModel.updateOne(
      { _id: agentId, 'anonymousTokens.tokenId': tokenId },
      { $set: { 'anonymousTokens.$.lastConnectedAt': new Date() } }
    );

    return true;
  }

  /**
   * Fetch agent by id without RBAC — for internal/system use only (e.g. anonymous WS connect).
   */
  async findByIdInternal(agentId: string): Promise<any> {
    return this.agentModel
      .findOne({ _id: agentId, isDeleted: false })
      .lean();
  }

  /**
   * Append a debug log entry to an agent (max 100, auto-rotate)
   */
  async addLog(
    agentId: string,
    dto: AddAgentLogDto
  ): Promise<{ success: boolean }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    await this.agentModel.updateOne(
      { _id: new Types.ObjectId(agentId) },
      {
        $push: {
          logs: {
            $each: [
              {
                level: dto.level ?? 'info',
                message: dto.message,
                time: new Date(),
                data: dto.data,
              },
            ],
            $slice: -100,
          },
        },
      }
    );

    return { success: true };
  }

  /**
   * Get all debug logs of an agent
   */
  async getLogs(agentId: string): Promise<AgentLogsResponseDto> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .select('+logs')
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return { logs: agent.logs ?? [] };
  }

  // ---------------------------------------------------------------------------
  // External signing keys (partner ES256 public keys)
  // ---------------------------------------------------------------------------

  /**
   * Add an external signing public key to an agent.
   * Partner holds the private key; we store the public key (PEM) to verify tokens.
   */
  async addExternalSigningKey(
    agentId: string,
    dto: AddExternalSigningKeyDto,
    context: RequestContext
  ): Promise<ExternalSigningKeyEntryDto> {
    const agent = await this.findById(new Types.ObjectId(agentId) as any, context);
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    // Validate PEM is a valid EC public key
    try {
      crypto.createPublicKey({ key: dto.publicKey, format: 'pem' });
    } catch {
      throw new BadRequestException('Invalid public key: must be a valid EC public key in PEM format');
    }

    // Check keyId uniqueness within agent
    const agentWithKeys = await this.agentModel
      .findById(agentId)
      .select('+externalSigningKeys')
      .lean();
    const existingKeys: any[] = (agentWithKeys as any)?.externalSigningKeys ?? [];
    if (existingKeys.some((k: any) => k.keyId === dto.keyId && !k.revokedAt)) {
      throw new BadRequestException(`Key with keyId "${dto.keyId}" already exists and is active`);
    }

    const entry = {
      keyId: dto.keyId,
      publicKey: dto.publicKey,
      algorithm: 'ES256' as const,
      label: dto.label,
      createdAt: new Date(),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    };

    await this.agentModel.updateOne(
      { _id: agentId },
      { $push: { externalSigningKeys: entry } }
    );

    this.logger.log(`Added external signing key keyId=${dto.keyId} for agent ${agentId}`);

    return {
      keyId: entry.keyId,
      algorithm: entry.algorithm,
      label: entry.label,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      isActive: true,
    };
  }

  /**
   * List all external signing keys for an agent (public key value not returned).
   */
  async listExternalSigningKeys(
    agentId: string,
    context: RequestContext
  ): Promise<ExternalSigningKeyListResponseDto> {
    const agent = await this.findById(new Types.ObjectId(agentId) as any, context);
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    const agentWithKeys = await this.agentModel
      .findById(agentId)
      .select('+externalSigningKeys')
      .lean();

    const now = new Date();
    const items: ExternalSigningKeyEntryDto[] = (
      (agentWithKeys as any)?.externalSigningKeys ?? []
    ).map((k: any) => ({
      keyId: k.keyId,
      algorithm: k.algorithm,
      label: k.label,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      isActive: !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now),
    }));

    return { items, total: items.length };
  }

  /**
   * Revoke an external signing key by keyId.
   */
  async revokeExternalSigningKey(
    agentId: string,
    keyId: string,
    context: RequestContext
  ): Promise<void> {
    const agent = await this.findById(new Types.ObjectId(agentId) as any, context);
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    const result = await this.agentModel.updateOne(
      {
        _id: agentId,
        'externalSigningKeys.keyId': keyId,
        'externalSigningKeys.revokedAt': { $exists: false },
      },
      { $set: { 'externalSigningKeys.$.revokedAt': new Date() } }
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException(`Signing key "${keyId}" not found or already revoked`);
    }

    this.logger.log(`Revoked external signing key keyId=${keyId} for agent ${agentId}`);
  }

  /**
   * Verify a partner-signed ES256 JWT using the agent's stored external signing keys.
   * Returns the decoded payload if valid, throws UnauthorizedException otherwise.
   * Internal use by ChatGateway only.
   */
  async verifyExternalSignedToken(agentId: string, token: string): Promise<any> {
    // Decode header to get kid
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token format');
    }

    let header: any;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid token header');
    }

    if (header.alg !== 'ES256') {
      throw new UnauthorizedException('Token must use ES256 algorithm');
    }

    const kid = header.kid;

    // Load agent's signing keys (select: false field)
    const agentWithKeys = await this.agentModel
      .findOne({ _id: agentId, isDeleted: false })
      .select('+externalSigningKeys')
      .lean();

    if (!agentWithKeys) {
      throw new UnauthorizedException('Agent not found');
    }

    const keys: any[] = (agentWithKeys as any).externalSigningKeys ?? [];
    const now = new Date();

    // Find matching active key
    const candidates = kid
      ? keys.filter((k) => k.keyId === kid)
      : keys; // fallback: try all if no kid

    const activeKey = candidates.find(
      (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now)
    );

    if (!activeKey) {
      throw new UnauthorizedException(
        kid ? `No active signing key found for kid="${kid}"` : 'No active signing keys configured for this agent'
      );
    }

    // Verify signature with Node.js crypto
    let payload: any;
    try {
      const pubKey = crypto.createPublicKey({ key: activeKey.publicKey, format: 'pem' });
      const verify = crypto.createVerify('SHA256');
      verify.update(`${parts[0]}.${parts[1]}`);
      const sig = Buffer.from(parts[2], 'base64url');
      // ES256 signatures from jsonwebtoken are DER-encoded (IEEE P1363 format)
      if (!verify.verify({ key: pubKey, dsaEncoding: 'ieee-p1363' }, sig)) {
        throw new Error('Signature mismatch');
      }
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (err: any) {
      throw new UnauthorizedException(`Token signature verification failed: ${err.message}`);
    }

    // Validate expiry
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      throw new UnauthorizedException('Token has expired');
    }

    // Validate agentId claim matches
    if (payload.agentId && payload.agentId !== agentId) {
      throw new UnauthorizedException('Token agentId does not match');
    }

    return payload;
  }

  async getRealtimeStatus(agentIds: string[] | undefined, context: RequestContext): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = { isDeleted: false, 'owner.orgId': context.orgId };
    if (agentIds && agentIds.length > 0) {
      filter['_id'] = { $in: agentIds };
    }

    const agents = await this.agentModel.find(filter).lean().exec();
    const now = Date.now();

    const items = await Promise.all(
      agents.map(async (agent: any) => {
        const activeConversations = await (this.conversationService as any).model
          .countDocuments({ agentId: String(agent._id), status: 'active', isDeleted: false })
          .exec();

        const heartbeatAgeSeconds = agent.lastHeartbeatAt
          ? Math.round((now - new Date(agent.lastHeartbeatAt).getTime()) / 1000)
          : null;

        return {
          agentId: String(agent._id),
          name: agent.name,
          status: agent.status,
          heartbeatAgeSeconds,
          isOnline: heartbeatAgeSeconds !== null && heartbeatAgeSeconds < 60,
          activeConversations,
          connectionCount: agent.connectionCount ?? 0,
          circuitBreaker: {
            sleeping: agent.status === 'sleep',
            sleepReason: agent.sleepReason ?? null,
            sleepUntil: agent.sleepUntil ?? null,
          },
          currentTask: agent.currentTask ?? null,
        };
      }),
    );

    return { generatedAt: new Date().toISOString(), agents: items };
  }

  async getRealtimeStatusById(id: string, context: RequestContext): Promise<Record<string, unknown>> {
    const result = await this.getRealtimeStatus([id], context);
    const agents = (result as any).agents as any[];
    if (!agents || agents.length === 0) {
      throw new NotFoundException(`Agent ${id} not found`);
    }

    const agentData = agents[0];

    // Find the most recently updated active conversation for this agent
    const lastConv = await (this.conversationService as any).model
      .findOne({ agentId: id, isDeleted: false })
      .sort({ updatedAt: -1 })
      .lean()
      .exec() as any;

    let lastConversation: Record<string, unknown> | null = null;
    if (lastConv) {
      const lastMsg = lastConv.lastMessage;
      let unansweredSince: string | null = null;
      if (lastMsg?.role === 'user') {
        unansweredSince = new Date(lastMsg.createdAt).toISOString();
      }
      lastConversation = {
        conversationId: String(lastConv._id),
        lastMessage: lastMsg
          ? {
              role: lastMsg.role,
              content: lastMsg.content,
              createdAt: new Date(lastMsg.createdAt).toISOString(),
            }
          : null,
        unansweredSince,
      };
    }

    return { ...agentData, lastConversation };
  }

  async getAgentMetrics(
    agentIds: string[] | undefined,
    preset: string | undefined,
    from: string | undefined,
    to: string | undefined,
    granularity: MetricsGranularity | undefined,
    context: RequestContext,
  ): Promise<Record<string, unknown>> {
    const timeRange = resolveTimeRange(preset, from, to);
    const gran: MetricsGranularity = granularity ?? defaultGranularity(timeRange.preset);

    const agentFilter: Record<string, unknown> = { isDeleted: false, 'owner.orgId': context.orgId };
    if (agentIds && agentIds.length > 0) agentFilter['_id'] = { $in: agentIds };
    const agents = await this.agentModel.find(agentFilter).lean().exec();

    const agentResults = await Promise.all(
      agents.map(async (agent: any) => {
        const conversations = await (this.conversationService as any).model
          .find({
            agentId: String(agent._id),
            isDeleted: false,
            createdAt: { $gte: timeRange.from, $lte: timeRange.to },
          })
          .lean()
          .exec() as any[];

        const convIds = conversations.map((c: any) => String(c._id));

        // Fetch all actions for these conversations in one query
        const allActions = convIds.length > 0
          ? await (this.actionService as any).model
              .find({ conversationId: { $in: convIds }, isDeleted: false, type: ActionType.MESSAGE })
              .sort({ createdAt: 1 })
              .lean()
              .exec() as any[]
          : [];

        // Group actions by conversationId
        const actionsByConv = new Map<string, any[]>();
        for (const a of allActions) {
          const cid = String(a.conversationId);
          if (!actionsByConv.has(cid)) actionsByConv.set(cid, []);
          actionsByConv.get(cid)!.push(a);
        }

        const frtValues: number[] = [];
        let slaBreachCount = 0;
        const allDeltas: number[] = [];
        let errorConvCount = 0;
        let resolvedCount = 0;
        let totalDurationSeconds = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        // Time-series buckets
        const buckets = new Map<string, { conversations: number; frtValues: number[]; slaBreaches: number; errors: number }>();

        for (const conv of conversations) {
          const cid = String(conv._id);
          const actions = actionsByConv.get(cid) ?? [];

          const slaActions: SlaAction[] = actions.map((a: any) => ({
            type: a.type,
            actor: { role: a.actor?.role },
            createdAt: new Date(a.createdAt),
          }));

          const frt = computeFrt(slaActions);
          if (frt.ms !== null) {
            frtValues.push(frt.ms);
            if (frt.slaBreached) slaBreachCount++;
          }

          const deltas = computeResponseDeltas(slaActions);
          allDeltas.push(...deltas);

          if (conv.status === 'closed') resolvedCount++;

          const createdAt = new Date(conv.createdAt);
          const endAt = conv.status === 'active' ? new Date() : new Date(conv.updatedAt);
          totalDurationSeconds += Math.round((endAt.getTime() - createdAt.getTime()) / 1000);

          // Token usage from conversation totals
          totalInputTokens += 0; // Actions-level token not aggregated here (use conversation totals)
          totalOutputTokens += 0;

          // Check errors via action count
          const hasError = actions.some((a: any) => a.type === ActionType.ERROR);
          if (hasError) errorConvCount++;

          // Bucket
          const bucketKey = getPeriodKey(createdAt, gran);
          if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, { conversations: 0, frtValues: [], slaBreaches: 0, errors: 0 });
          }
          const bucket = buckets.get(bucketKey)!;
          bucket.conversations++;
          if (frt.ms !== null) bucket.frtValues.push(frt.ms);
          if (frt.slaBreached) bucket.slaBreaches++;
          if (hasError) bucket.errors++;
        }

        const total = conversations.length;

        const summary = {
          totalConversations: total,
          resolvedConversations: resolvedCount,
          resolutionRate: total > 0 ? Math.round((resolvedCount / total) * 1000) / 10 : 0,
          avgFirstResponseTimeMs: computeAvg(frtValues),
          p90FirstResponseTimeMs: computeP90(frtValues),
          slaBreachCount,
          slaBreachRate: total > 0 ? Math.round((slaBreachCount / total) * 1000) / 10 : 0,
          avgResponseTimeMs: computeAvg(allDeltas),
          avgConversationDurationSeconds: total > 0 ? Math.round(totalDurationSeconds / total) : 0,
          errorRate: total > 0 ? Math.round((errorConvCount / total) * 1000) / 10 : 0,
          totalInputTokens,
          totalOutputTokens,
        };

        const timeSeries = Array.from(buckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, b]) => ({
            period,
            conversations: b.conversations,
            avgFrtMs: computeAvg(b.frtValues),
            slaBreaches: b.slaBreaches,
            errors: b.errors,
          }));

        return { agentId: String(agent._id), name: agent.name, summary, timeSeries };
      }),
    );

    return {
      period: { from: timeRange.from, to: timeRange.to, preset: timeRange.preset, granularity: gran },
      agents: agentResults,
    };
  }

  /**
   * Validate that a deployment exists, is not deleted, and has status=running.
   * Used for assistant agent create/update operations.
   */
  private async validateHostedDeployment(
    deploymentId: string | undefined
  ): Promise<void> {
    if (!deploymentId) {
      throw new BadRequestException(
        'deploymentId is required for assistant agents'
      );
    }

    const deployment = await this.deploymentService.findByObjectId(
      deploymentId
    );

    if (!deployment) {
      throw new BadRequestException(
        `Deployment with ID ${deploymentId} not found`
      );
    }

    if (deployment.status !== 'running') {
      throw new BadRequestException(
        `Deployment ${deploymentId} must be in 'running' status (current: '${deployment.status}')`
      );
    }
  }
}
