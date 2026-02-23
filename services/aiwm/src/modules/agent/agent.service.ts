import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
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
    if(options.filter) {
      if (options.filter['name']) {
        options.filter['name'] = { $regex: options.filter['name'], $options: 'i' };
      }
      if (options.filter['description']) {
        options.filter['description'] = { $regex: options.filter['description'], $options: 'i' };
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

    // Map type statistics
    typeStats.forEach((stat: any) => {
      statistics.byType[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  async create(
    createAgentDto: CreateAgentDto,
    context: RequestContext
  ): Promise<Agent> {
    // Only managed agents have secrets (system-managed, deployed to nodes)
    let plaintextSecret: string | undefined;
    if (createAgentDto.type === 'managed') {
      // Hash secret if provided, keep plaintext for agent.start event
      if (createAgentDto.secret) {
        plaintextSecret = createAgentDto.secret;
        createAgentDto.secret = await bcrypt.hash(plaintextSecret, 10);
      } else {
        // Generate random secret if not provided
        plaintextSecret = crypto.randomBytes(32).toString('hex');
        createAgentDto.secret = await bcrypt.hash(plaintextSecret, 10);
      }
    } else {
      // Autonomous agents don't need secrets (user-controlled via UI)
      delete createAgentDto.secret;
    }

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
            secret: plaintextSecret,
            instructionId: saved.instructionId,
            guardrailId: saved.guardrailId,
            deploymentId: saved.deploymentId,
            settings: saved.settings,
          },
        );
        this.logger.log(`agent.start sent to node ${saved.nodeId} for agent ${(saved as any)._id}`);
      } catch (error) {
        this.logger.warn(`Could not send agent.start to node ${saved.nodeId}: ${error.message}`);
      }
    }

    return saved as Agent;
  }

  /**
   * Get agent configuration for autonomous agents
   * Requires user authentication, returns config without issuing new JWT
   */
  async getAgentConfig(
    agentId: string,
    context: RequestContext
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

    // Build instruction object (new format)
    const instruction = await this.buildInstructionObjectForAgent(agent);

    // Get allowed tools
    const tools = await this.getAllowedTools(agent);

    // Get AIWM base URL from configuration
    const aiwmBaseUrlConfig = await this.configurationService.findByKey(
      ConfigKey.AIWM_BASE_MCP_URL as any,
      context
    );
    const mcpBaseUrl = aiwmBaseUrlConfig?.value || process.env.AIWM_BASE_URL || 'http://localhost:3306';

    // Build MCP server configuration (use user's token for MCP calls)
    // Note: Frontend will need to include user's JWT token when calling MCP
    const mcpServers = {
      'Builtin': {
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
        const deployment = await this.agentModel.db.collection('deployments').findOne({
          _id: new Types.ObjectId(agent.deploymentId)
        });

        if (deployment && deployment.modelId) {
          const model = await this.agentModel.db.collection('models').findOne({
            _id: new Types.ObjectId(deployment.modelId)
          });

          if (model && model.deploymentType === 'api-based') {
            // Get base API URL from configuration
            const baseApiUrlConfig = await this.configurationService.findByKey(
              ConfigKey.AIWM_BASE_API_URL as any,
              context
            );
            const baseApiUrl = baseApiUrlConfig?.value || 'http://localhost:3003';
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
        this.logger.warn('Failed to populate deployment info', { error: error.message });
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
    const agentRoles = agent.role ? [agent.role] : ((agent.settings as any).auth_roles || ['organization.viewer']);

    // Generate JWT token with IAM-compatible payload
    const payload = {
      sub: agentId,                          // Agent ID as userId
      username: `agent:${agentId}`,          // Format: agent:<agentId>
      status: agent.status,                  // Agent status
      roles: agentRoles,                     // From agent.role or settings.auth_roles
      orgId: agent.owner.orgId,              // Owner organization ID
      groupId: '',                           // Empty for agents
      agentId: agentId,                      // Same as sub
      userId: '',                            // Empty as requested
      type: 'agent',                         // Marker for agent token
    };

    this.logger.debug('Signing JWT token with payload', {
      agentId,
      username: payload.username,
      roles: payload.roles,
      orgId: payload.orgId
    });

    const token = this.jwtService.sign(payload); // expiresIn: '24h' set in JwtModule config

    // Log first/last chars of token for debugging (never log full token)
    this.logger.debug(`Token generated: ${token.substring(0, 20)}...${token.substring(token.length - 20)}`)

    // Calculate expiresIn seconds (24 hours)
    const expiresInSeconds = 24 * 60 * 60;

    // Build instruction object (new format)
    const instruction = await this.buildInstructionObjectForAgent(agent);

    // Get allowed tools
    const tools = await this.getAllowedTools(agent);

    // Update connection tracking
    await this.agentModel.updateOne(
      { _id: agent._id },
      {
        $set: { lastConnectedAt: new Date() },
        $inc: { connectionCount: 1 },
      }
    );

    this.logger.log('Agent connected successfully', {
      agentId,
      name: agent.name,
      username: payload.username,
      roles: payload.roles,
      connectionCount: agent.connectionCount + 1,
    });

    // Get AIWM base URL from configuration
    const aiwmBaseUrlConfig = await this.configurationService.findByKey(
      ConfigKey.AIWM_BASE_MCP_URL as any,
      { orgId: agent.owner.orgId } as RequestContext
    );
    const mcpBaseUrl = aiwmBaseUrlConfig?.value || process.env.AIWM_BASE_URL || 'http://localhost:3306';

    // Build MCP server configuration (HTTP transport format)
    const mcpServers = {
      'Builtin': {
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
      refreshToken: null,                    // Not implemented for agents
      refreshExpiresIn: 0,
      tokenType: 'bearer',
      mcpServers,                            // MCP server configurations
      instruction,
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
        const deployment = await this.agentModel.db.collection('deployments').findOne({
          _id: new Types.ObjectId(agent.deploymentId)
        });

        if (deployment && deployment.modelId) {
          const model = await this.agentModel.db.collection('models').findOne({
            _id: new Types.ObjectId(deployment.modelId)
          });

          if (model && model.deploymentType === 'api-based') {
            // Get base API URL from configuration
            const baseApiUrlConfig = await this.configurationService.findByKey(
              ConfigKey.AIWM_BASE_API_URL as any,
              { orgId: agent.owner.orgId } as RequestContext
            );
            const baseApiUrl = baseApiUrlConfig?.value || 'http://localhost:3003';
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
        this.logger.warn('Failed to populate deployment info', { error: error.message });
        // Continue without deployment info - non-critical
      }
    }

    return response;
  }

  /**
   * Build instruction object for agent (new format)
   * Returns structured instruction with id, systemPrompt, and guidelines
   */
  private async buildInstructionObjectForAgent(agent: Agent): Promise<{
    id: string;
    systemPrompt: string;
    guidelines: string[];
  }> {
    if (!agent.instructionId) {
      return {
        id: '',
        systemPrompt: 'No instruction configured for this agent.',
        guidelines: []
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
        guidelines: []
      };
    }

    return {
      id: (instruction as any)._id.toString(),
      systemPrompt: instruction.systemPrompt,
      guidelines: instruction.guidelines || []
    };
  }

  /**
   * Build merged instruction for agent (legacy format - for backward compatibility)
   * MVP: Just return agent's instruction content
   * TODO: Future - merge global + agent-specific + context instructions
   */
  private async buildInstructionForAgent(agent: Agent): Promise<string> {
    if (!agent.instructionId) {
      return 'No instruction configured for this agent.';
    }

    const instruction = await this.instructionModel
      .findOne({ _id: agent.instructionId, isDeleted: false })
      .exec();

    if (!instruction) {
      this.logger.warn('Instruction not found for agent', {
        agentId: (agent as any)._id,
        instructionId: agent.instructionId,
      });
      return 'Instruction not found.';
    }

    // MVP: Return systemPrompt + guidelines
    let instructionText = instruction.systemPrompt;

    if (instruction.guidelines && instruction.guidelines.length > 0) {
      instructionText += '\n\n## Guidelines\n';
      instruction.guidelines.forEach((guideline, index) => {
        instructionText += `${index + 1}. ${guideline}\n`;
      });
    }

    // TODO: Merge with global instruction (org-level)
    // TODO: Merge with context instruction (project/feature)

    return instructionText;
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
   */
  async heartbeat(
    agentId: string,
    heartbeatDto: AgentHeartbeatDto
  ): Promise<{ success: boolean }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: { lastHeartbeatAt: new Date() } }
    );

    this.logger.debug('Agent heartbeat received', {
      agentId,
      status: heartbeatDto.status,
      metrics: heartbeatDto.metrics,
    });

    return { success: true };
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

    // Update agent - clear lastConnectedAt to indicate disconnected
    await this.agentModel.updateOne(
      { _id: agent._id },
      { $set: { lastConnectedAt: null } }
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
   * Only works for managed agents (system-managed agents with secrets)
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

    // Only managed agents have credentials
    if (agent.type !== 'managed') {
      throw new BadRequestException('Only managed agents have credentials to regenerate');
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
      regeneratedBy: context.userId,
    });

    // Build env config snippet
    const envConfig = this.buildEnvConfig(agentId, newSecret, agent);

    // Build install script (async now)
    const installScript = await this.buildInstallScript(agentId, newSecret, agent);

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
    const baseUrl = process.env.AIWM_PUBLIC_URL || 'https://api.x-or.cloud/dev/aiwm';
    const settings = agent.settings || {};

    // Extract common settings with defaults (flat fields with backward compatibility)
    const claudeModel = (settings as any).claude_model || (settings as any).claudeModel || 'claude-3-5-haiku-latest';
    const maxTurns = (settings as any).claude_maxTurns || (settings as any).maxTurns || 100;
    const permissionMode = (settings as any).claude_permissionMode || (settings as any).permissionMode || 'bypassPermissions';
    const resume = (settings as any).claude_resume !== undefined ? (settings as any).claude_resume : ((settings as any).resume !== false); // default true

    let envConfig = `# ===== AIWM Integration =====
AIWM_ENABLED=true
AIWM_BASE_URL=${baseUrl}
AIWM_AGENT_ID=${agentId}
AIWM_AGENT_SECRET=${secret}

# ===== Agent Info =====
AGENT_NAME=${agent.name}

# ===== Claude Code SDK Configuration =====
CLAUDE_MODEL=${claudeModel}
CLAUDE_MAX_TURNS=${maxTurns}
CLAUDE_PERMISSION_MODE=${permissionMode}
CLAUDE_RESUME=${resume}
`;

    // Add OAuth token if present (flat field with backward compatibility)
    const claudeOAuthToken = (settings as any).claude_oauthToken || (settings as any).claudeOAuthToken;
    if (claudeOAuthToken) {
      envConfig += `CLAUDE_CODE_OAUTH_TOKEN=${claudeOAuthToken}\n`;
    }

    // Add platform configurations
    envConfig += `
# ===== Platform Configuration (Optional) =====
# Configure your platform settings here
`;

    // Discord settings (flat fields with backward compatibility)
    const discordToken = (settings as any).discord_token || (settings as any).discord?.token;
    const discordChannelIds = (settings as any).discord_channelIds || (settings as any).discord?.channelIds;
    const discordBotId = (settings as any).discord_botId || (settings as any).discord?.botId;

    if (discordToken || discordChannelIds || discordBotId) {
      if (discordToken) envConfig += `DISCORD_TOKEN=${discordToken}\n`;
      if (discordChannelIds) envConfig += `DISCORD_CHANNEL_ID=${Array.isArray(discordChannelIds) ? discordChannelIds.join(',') : discordChannelIds}\n`;
      if (discordBotId) envConfig += `DISCORD_BOT_ID=${discordBotId}\n`;
    } else {
      envConfig += `# DISCORD_TOKEN=your_discord_token\n# DISCORD_CHANNEL_ID=your_channel_id\n`;
    }

    // Telegram settings (flat fields with backward compatibility)
    const telegramToken = (settings as any).telegram_token || (settings as any).telegram?.token;
    const telegramGroupIds = (settings as any).telegram_groupIds || (settings as any).telegram?.groupIds;
    const telegramBotUsername = (settings as any).telegram_botUsername || (settings as any).telegram?.botUsername;

    if (telegramToken || telegramGroupIds || telegramBotUsername) {
      if (telegramToken) envConfig += `TELEGRAM_BOT_TOKEN=${telegramToken}\n`;
      if (telegramGroupIds) envConfig += `TELEGRAM_GROUP_ID=${Array.isArray(telegramGroupIds) ? telegramGroupIds.join(',') : telegramGroupIds}\n`;
      if (telegramBotUsername) envConfig += `TELEGRAM_BOT_USERNAME=${telegramBotUsername}\n`;
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
    const baseUrl = process.env.AIWM_PUBLIC_URL || 'https://api.x-or.cloud/dev/aiwm';

    // Get download URL from configuration
    let downloadBaseUrl = 'https://cdn.x-or.cloud/agents'; // default
    try {
      const downloadConfig = await this.configurationService.findByKey(
        'agent.download.base_url' as any, // ConfigKey enum might not be built yet
        {
          orgId: agent.owner.orgId || agent.owner as any,
          userId: agent.createdBy as any,
          agentId: '',
          groupId: '',
          appId: '',
          roles: []
        } as any
      );
      if (downloadConfig?.value) {
        downloadBaseUrl = downloadConfig.value;
      }
    } catch (error) {
      // Fallback to default if config not found
      this.logger.warn('Failed to load AGENT_DOWNLOAD_BASE_URL config, using default', error);
    }
    const downloadUrl = `${downloadBaseUrl}/xora-cc-agent-latest.tar.gz`;

    return String.raw`#!/bin/bash
# ============================================
# Agent Installation Script
# ============================================
# Auto-generated for Agent: ${agent.name}
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
              instructionId: updated.instructionId,
              guardrailId: updated.guardrailId,
              deploymentId: updated.deploymentId,
              settings: updated.settings,
            },
          );
          this.logger.log(`agent.update sent to node ${updated.nodeId} for agent ${(updated as any)._id}`);
        } catch (error: any) {
          this.logger.warn(`Could not send agent.update to node ${updated.nodeId}: ${error.message}`);
        }
      }
    }

    return updated as Agent;
  }

  async remove(id: string, context: RequestContext): Promise<void> {
    // Read agent before deleting to get type and nodeId for WebSocket notification
    const agent = await this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false });

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
            },
          );
          this.logger.log(`agent.delete sent to node ${agent.nodeId} for agent ${id}`);
        } catch (error: any) {
          this.logger.warn(`Could not send agent.delete to node ${agent.nodeId}: ${error.message}`);
        }
      }
    }
  }
}
