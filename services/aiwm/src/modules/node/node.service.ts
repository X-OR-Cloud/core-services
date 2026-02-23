import { Injectable, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Node } from './node.schema';
import { NodeLoginDto, NodeLoginResponseDto, NodeRefreshTokenDto, NodeRefreshTokenResponseDto } from './node.dto';
import { NodeProducer } from '../../queues/producers/node.producer';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

const NODE_TOKEN_EXPIRES_IN = 3600; // 1 hour in seconds
const NODE_TOKEN_REFRESH_GRACE_PERIOD = 300; // Allow refresh within 5 min after expiry

@Injectable()
export class NodeService extends BaseService<Node> {
  constructor(
    @InjectModel(Node.name) nodeModel: Model<Node>,
    private readonly nodeProducer: NodeProducer,
    private readonly jwtService: JwtService
  ) {
    super(nodeModel as any);
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Node>> {
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
   * Create node with auto-generated credentials
   * Returns node AND credentials (credentials shown ONLY ONCE)
   */
  async createWithCredentials(
    createNodeDto: any,
    context: RequestContext
  ): Promise<{
    node: Node;
    credentials: {
      apiKey: string;
      secret: string;
    };
  }> {
    // Generate credentials
    const { apiKey, secret, secretHash } = await this.generateCredentials();

    // Merge credentials into create DTO
    const nodeData = {
      ...createNodeDto,
      apiKey,
      secretHash,
    };

    // BaseService handles permissions, ownership, save, and generic logging
    const saved = await super.create(nodeData, context);

    // Business-specific logging with details
    this.logger.log('Node created with credentials', {
      id: (saved as any)._id,
      name: saved.name,
      role: saved.role,
      status: saved.status,
      createdBy: context.userId,
      hasCredentials: true,
    });

    // Emit event to queue
    await this.nodeProducer.emitNodeCreated(saved);

    // Return credentials ONCE (user must save them)
    return {
      node: saved as Node,
      credentials: {
        apiKey,
        secret, // Only shown once!
      },
    };
  }

  // TODO: Will be analyzed and implemented later
  // async updateNode(
  //   id: string,
  //   updateNodeDto: UpdateNodeDto,
  //   context: RequestContext
  // ): Promise<Node | null> {
  //   // Convert string to ObjectId for BaseService
  //   const objectId = new Types.ObjectId(id);
  //   const updated = await super.update(
  //     objectId as any,
  //     updateNodeDto as any,
  //     context
  //   );

  //   if (updated) {
  //     // Business-specific logging with details
  //     this.logger.log('Node updated with details', {
  //       id: (updated as any)._id,
  //       name: updated.name,
  //       role: updated.role,
  //       status: updated.status,
  //       updatedBy: context.userId,
  //     });

  //     // Emit event to queue
  //     await this.nodeProducer.emitNodeUpdated(updated);
  //   }

  //   return updated as Node;
  // }

  // TODO: Will be analyzed and implemented later
  // async remove(id: string, context: RequestContext): Promise<void> {
  //   // BaseService handles soft delete, permissions, and generic logging
  //   const result = await super.softDelete(
  //     new Types.ObjectId(id) as any,
  //     context
  //   );

  //   if (result) {
  //     // Business-specific logging
  //     this.logger.log('Node soft deleted with details', {
  //       id,
  //       deletedBy: context.userId,
  //     });

  //     // Emit event to queue
  //     await this.nodeProducer.emitNodeDeleted(id);
  //   }
  // }

  // ============= WebSocket & Token Management =============
  // TODO: Will be analyzed and implemented later

  /**
   * Find node by MongoDB _id (used by WebSocket gateway)
   */
  async findByObjectId(id: string | Types.ObjectId): Promise<Node | null> {
    const objectId = typeof id === 'string' ? new Types.ObjectId(id) : id;
    return await this.model.findOne({
      _id: objectId,
      isDeleted: { $ne: true },
    }).exec();
  }

  // TODO: Will be analyzed and implemented later
  // /**
  //  * Generate JWT token for node authentication
  //  */
  // async generateToken(
  //   id: string,
  //   expiresIn = 31536000, // Default: 1 year in seconds
  //   context?: RequestContext
  // ): Promise<{ token: string; expiresAt: Date; installScript: string }> {
  //   // Verify node exists
  //   const node = await this.model
  //     .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
  //     .exec();
  //   if (!node) {
  //     throw new NotFoundException(`Node with ID ${id} not found`);
  //   }

  //   // Generate expiration date
  //   const expiresAt = new Date();
  //   expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

  //   // Create JWT payload with node _id
  //   const payload = {
  //     sub: id,
  //     type: 'node',
  //     nodeId: id, // Include node's MongoDB _id as nodeId in token
  //     iat: Math.floor(Date.now() / 1000),
  //     exp: Math.floor(expiresAt.getTime() / 1000),
  //   };

  //   // Sign token
  //   const token = this.jwtService.sign(payload);

  //   // Update token metadata in database
  //   await this.model.updateOne(
  //     { _id: new Types.ObjectId(id) },
  //     {
  //       $set: {
  //         tokenMetadata: {
  //           tokenGeneratedAt: new Date(),
  //           tokenExpiresAt: expiresAt,
  //         },
  //         updatedAt: new Date(),
  //       },
  //     }
  //   );

  //   // Generate installation script
  //   const installScript = this.generateInstallScript(token, node);

  //   this.logger.log(
  //     `Token generated for node ${id} (expires: ${expiresAt.toISOString()})`
  //   );

  //   return { token, expiresAt, installScript };
  // }

  // TODO: Will be analyzed and implemented later
  // /**
  //  * Generate installation script with embedded token
  //  */
  // private generateInstallScript(token: string, node: any): string {
  //   // TODO: Replace with actual controller endpoint from config
  //   const controllerEndpoint =
  //     process.env.CONTROLLER_WEBSOCKET_URL || 'ws://localhost:3305';

  //   return `#!/bin/bash
  // # Hydra Node Installation Script
  // # Generated: ${new Date().toISOString()}
  // # Node: ${node.name}
  // # Node ID: ${node._id}

  // echo "Installing Hydra Node Daemon..."

  // # Configuration
  // export AIOPS_NODE_TOKEN="${token}"
  // export AIOPS_CONTROLLER_ENDPOINT="${controllerEndpoint}"
  // export AIOPS_NODE_ID="${node._id}"

  // # TODO: Add actual installation steps
  // # 1. Download daemon binary
  // # 2. Install systemd service
  // # 3. Configure daemon with token
  // # 4. Start service

  // echo "Installation complete!"
  // echo "Node ID: ${node._id}"
  // echo "Controller: ${controllerEndpoint}"
  // `;
  // }

  /**
   * Update node status (used by WebSocket gateway)
   */
  async updateStatus(id: string, status: string): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    // Set lastHeartbeat when going online
    if (status === 'online') {
      update.lastHeartbeat = new Date();
    }

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: update },
    );

    this.logger.log(`Node ${id} status updated to ${status}`);
  }

  /**
   * Update node information from registration
   * TODO: Will be refactored to properly populate systemInfo
   */
  async updateNodeInfo(id: string, info: any): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          ...info,
          updatedAt: new Date(),
        },
      }
    );

    this.logger.log(`Node ${id} information updated`);
  }

  /**
   * Update heartbeat data
   * TODO: Will be refactored to store dynamic data in MetricData collection
   */
  async updateHeartbeat(id: string, heartbeatData: any): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          status: heartbeatData.status,
          uptimeSeconds: heartbeatData.uptimeSeconds,
          cpuUsage: heartbeatData.cpuUsage,
          ramUsage: heartbeatData.ramUsage,
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Store metrics data
   * TODO: Will be refactored to store in MetricData collection (time-series)
   */
  async storeMetrics(id: string, metrics: any): Promise<void> {
    // TODO: Store metrics in a time-series collection or forward to monitoring system
    // For now, just update the last metrics timestamp
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          lastMetricsAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    this.logger.debug(`Metrics stored for node ${id}`);
  }

  // ============= Node Authentication (Credential Management) =============

  /**
   * Generate credentials (apiKey + secret) for node authentication
   * Returns plain secret ONCE - must be saved by caller
   */
  async generateCredentials(): Promise<{
    apiKey: string;
    secret: string;
    secretHash: string;
  }> {
    const apiKey = randomUUID(); // e.g., "a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p"
    const secret = randomUUID(); // Generate once, show to user
    const secretHash = await bcrypt.hash(secret, 10);

    return {
      apiKey,
      secret, // Only returned once!
      secretHash,
    };
  }

  /**
   * Regenerate credentials for an existing node
   * This invalidates old credentials immediately
   */
  async regenerateCredentials(
    id: string,
    context: RequestContext
  ): Promise<{
    node: Node;
    credentials: {
      apiKey: string;
      secret: string;
    };
  }> {
    // Verify node exists
    const node = await this.model
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!node) {
      throw new NotFoundException(`Node with ID ${id} not found`);
    }

    // Check if current user is organization owner
    const hasOrgOwnerRole = context.roles?.some(role =>
      role === 'organization.owner' || role === 'universe.owner'
    );

    if (!hasOrgOwnerRole) {
      this.logger.warn('Attempted to regenerate credentials without org owner permission', {
        nodeId: id,
        userId: context.userId,
        userRoles: context.roles,
      });
      throw new ForbiddenException('Only organization owner can regenerate node credentials');
    }

    // Check if node belongs to the same organization
    if (node.owner?.orgId !== context.orgId) {
      this.logger.warn('Attempted to regenerate credentials for node in different organization', {
        nodeId: id,
        nodeOrgId: node.owner?.orgId,
        userOrgId: context.orgId,
        userId: context.userId,
      });
      throw new ForbiddenException('You can only regenerate credentials for nodes in your organization');
    }

    // Generate new credentials
    const { apiKey, secret, secretHash } = await this.generateCredentials();

    // Update node with new credentials
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          apiKey,
          secretHash,
          lastAuthAt: null, // Reset last auth
          updatedAt: new Date(),
          updatedBy: context.userId,
        },
      }
    );

    // Fetch updated node
    const updatedNode = await this.model
      .findOne({ _id: new Types.ObjectId(id) })
      .exec();

    this.logger.log(`Credentials regenerated for node ${id}`, {
      nodeId: id,
      regeneratedBy: context.userId,
      nodeOrgId: node.owner?.orgId,
    });

    // Return credentials ONCE (user must save them)
    return {
      node: updatedNode as Node,
      credentials: {
        apiKey,
        secret, // Only shown once!
      },
    };
  }

  /**
   * Node login - verify credentials and return JWT token
   */
  async login(dto: NodeLoginDto): Promise<NodeLoginResponseDto> {
    const node = await this.verifyNodeCredentials(dto.apiKey, dto.secret);

    const payload = {
      sub: (node as any)._id.toString(),
      type: 'node',
      username: node.name,
      status: node.status,
      roles: node.role || [],
      orgId: node.owner?.orgId || '',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: NODE_TOKEN_EXPIRES_IN,
    });

    // Update last auth time and token metadata
    await this.model.updateOne(
      { _id: (node as any)._id },
      {
        $set: {
          lastAuthAt: new Date(),
          tokenMetadata: {
            tokenGeneratedAt: new Date(),
            tokenExpiresAt: new Date(Date.now() + NODE_TOKEN_EXPIRES_IN * 1000),
          },
          updatedAt: new Date(),
        },
      },
    );

    const secret = process.env.JWT_SECRET || '';
    const masked = secret.length > 4
      ? secret.substring(0, 2) + '***' + secret.substring(secret.length - 2)
      : '****';
    const secretHash = createHash('sha256').update(secret).digest('hex').substring(0, 8);

    // Debug: verify token immediately after signing to check if JwtModule uses same secret
    try {
      const { verify: jwtVerify } = require('jsonwebtoken');
      jwtVerify(accessToken, secret);
      this.logger.log('DEBUG: Token self-verify with process.env.JWT_SECRET: OK');
    } catch (e: any) {
      this.logger.error(`DEBUG: Token self-verify FAILED: ${e.message} - JwtModule uses DIFFERENT secret than process.env.JWT_SECRET!`);
    }

    this.logger.log('Node login successful', {
      nodeId: (node as any)._id.toString(),
      name: node.name,
      jwtSecret: masked,
      jwtSecretLength: secret.length,
      jwtSecretSha256: secretHash,
    });

    return {
      accessToken,
      expiresIn: NODE_TOKEN_EXPIRES_IN,
      tokenType: 'Bearer',
      node: {
        _id: (node as any)._id.toString(),
        name: node.name,
        status: node.status,
        roles: node.role || [],
        orgId: node.owner?.orgId || '',
      },
    };
  }

  /**
   * Refresh node JWT token
   */
  async refreshToken(dto: NodeRefreshTokenDto): Promise<NodeRefreshTokenResponseDto> {
    let decoded: any;

    try {
      // Try verifying normally first
      decoded = this.jwtService.verify(dto.token);
    } catch (error) {
      // Allow recently expired tokens (within grace period)
      if (error.name === 'TokenExpiredError') {
        decoded = this.jwtService.decode(dto.token) as any;
        if (!decoded) {
          throw new UnauthorizedException('Invalid token');
        }
        const expiredAt = decoded.exp * 1000;
        const now = Date.now();
        if (now - expiredAt > NODE_TOKEN_REFRESH_GRACE_PERIOD * 1000) {
          throw new UnauthorizedException('Token expired beyond refresh grace period');
        }
      } else {
        throw new UnauthorizedException('Invalid token');
      }
    }

    // Only allow node tokens to be refreshed
    if (decoded.type !== 'node') {
      throw new UnauthorizedException('Only node tokens can be refreshed via this endpoint');
    }

    // Verify node still exists and is not deleted
    const node = await this.model
      .findOne({ _id: new Types.ObjectId(decoded.sub), isDeleted: false })
      .exec();

    if (!node) {
      throw new UnauthorizedException('Node not found');
    }

    const payload = {
      sub: (node as any)._id.toString(),
      type: 'node',
      username: node.name,
      status: node.status,
      roles: node.role || [],
      orgId: node.owner?.orgId || '',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: NODE_TOKEN_EXPIRES_IN,
    });

    // Update token metadata
    await this.model.updateOne(
      { _id: (node as any)._id },
      {
        $set: {
          tokenMetadata: {
            tokenGeneratedAt: new Date(),
            tokenExpiresAt: new Date(Date.now() + NODE_TOKEN_EXPIRES_IN * 1000),
            tokenLastUsed: new Date(),
          },
          updatedAt: new Date(),
        },
      },
    );

    this.logger.log('Node token refreshed', {
      nodeId: (node as any)._id.toString(),
      name: node.name,
    });

    return {
      accessToken,
      expiresIn: NODE_TOKEN_EXPIRES_IN,
      tokenType: 'Bearer',
    };
  }

  /**
   * Verify node credentials (internal helper)
   */
  private async verifyNodeCredentials(apiKey: string, secret: string): Promise<Node> {
    const node = await this.model
      .findOne({ apiKey, isDeleted: false })
      .select('+secretHash')
      .exec();

    if (!node) {
      this.logger.warn('Node not found with provided apiKey', {
        apiKey: apiKey.substring(0, 8) + '...',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!node.secretHash) {
      this.logger.warn('Node has no secretHash configured', {
        nodeId: (node as any)._id.toString(),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(secret, node.secretHash);
    if (!isValid) {
      this.logger.warn('Invalid secret for node', {
        nodeId: (node as any)._id.toString(),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    return node;
  }
}
