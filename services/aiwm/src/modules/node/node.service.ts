import { Injectable, NotFoundException, ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Node } from './node.schema';
import { NodeLoginDto, NodeLoginResponseDto, NodeRefreshTokenDto, NodeRefreshTokenResponseDto, SetupGuideResponseDto, NodeBootstrapResponseDto } from './node.dto';
import { NodeProducer } from '../../queues/producers/node.producer';
import { ConfigService } from '../configuration/config.service';
import { ConfigKey } from '@hydrabyte/shared';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

const NODE_TOKEN_EXPIRES_IN = 3600; // 1 hour in seconds
const NODE_TOKEN_REFRESH_GRACE_PERIOD = 300; // Allow refresh within 5 min after expiry
const SETUP_TOKEN_EXPIRES_IN = 86400; // 24 hours in seconds
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
const SETUP_SCRIPT_URL = 'http://releases.x-or.cloud/xor-stack-ai-xnode-install.sh';
const DOCKER_IMAGE = 'xorcloud/xnode-agent-base:1.2.1';
const RELEASES_URL = 'http://releases.x-or.cloud';

@Injectable()
export class NodeService extends BaseService<Node> {
  constructor(
    @InjectModel(Node.name) nodeModel: Model<Node>,
    private readonly nodeProducer: NodeProducer,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super(nodeModel as any);
  }

  private isOrgOwner(context: RequestContext): boolean {
    return !!context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Node>> {
    if (!this.isOrgOwner(context)) {
      options.filter = { ...options.filter, 'owner.userId': context.userId };
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

  async findById(id: string, context: RequestContext): Promise<Partial<Node>> {
    const node = await super.findById(id, context);
    if (!this.isOrgOwner(context) && (node as any)?.owner?.userId !== context.userId) {
      throw new ForbiddenException('You can only access nodes you created');
    }
    return node;
  }

  /**
   * Create node — status depends on caller's role:
   *   org.owner / universe.owner → pending
   *   others                     → awaiting-approval
   * No credentials are generated at creation time.
   */
  async createNode(
    createNodeDto: any,
    context: RequestContext
  ): Promise<Node> {
    const isOwner = context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
    const status = isOwner ? 'pending' : 'awaiting-approval';

    // Non-owner can only assign 'worker' role
    const PRIVILEGED_ROLES = ['controller', 'proxy', 'storage'];
    if (!isOwner && createNodeDto.role?.some((r: string) => PRIVILEGED_ROLES.includes(r))) {
      throw new ForbiddenException(
        `Only organization owner can assign roles: ${PRIVILEGED_ROLES.join(', ')}`
      );
    }

    const nodeData = { ...createNodeDto, status };

    const saved = await super.create(nodeData, context);

    this.logger.log('Node created', {
      id: (saved as any)._id,
      name: saved.name,
      role: saved.role,
      status: saved.status,
      createdBy: context.userId,
    });

    await this.nodeProducer.emitNodeCreated(saved);

    return saved as Node;
  }

  /**
   * Approve a node — moves status from awaiting-approval → pending.
   * Only organization.owner / universe.owner can approve.
   */
  async approveNode(id: string, context: RequestContext): Promise<Node> {
    const isOwner = context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
    if (!isOwner) {
      throw new ForbiddenException('Only organization owner can approve nodes');
    }

    const node = await this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
    if (!node) throw new NotFoundException(`Node with ID ${id} not found`);

    if (node.owner?.orgId !== context.orgId) {
      throw new ForbiddenException('You can only approve nodes in your organization');
    }

    if (node.status !== 'awaiting-approval') {
      throw new BadRequestException(`Node is not awaiting approval (current status: ${node.status})`);
    }

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { status: 'pending', updatedBy: context.userId, updatedAt: new Date() } }
    );

    const updated = await this.model.findOne({ _id: new Types.ObjectId(id) }).exec();

    this.logger.log('Node approved', { nodeId: id, approvedBy: context.userId });

    return updated as Node;
  }

  /**
   * Get setup guide with a new setup token (valid 24h).
   * Accessible by org.owner OR the user who created the node (owner.userId).
   * Node must be in pending status.
   */
  async getSetupGuide(id: string, os: string, context: RequestContext): Promise<SetupGuideResponseDto> {
    const node = await this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
    if (!node) throw new NotFoundException(`Node with ID ${id} not found`);

    const isOwner = context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
    const isNodeCreator = node.owner?.userId === context.userId;

    if (!isOwner && !isNodeCreator) {
      throw new ForbiddenException('Only organization owner or node creator can get setup guide');
    }

    if (node.owner?.orgId !== context.orgId) {
      throw new ForbiddenException('Node does not belong to your organization');
    }

    if (node.status !== 'pending' && node.status !== 'maintenance') {
      throw new BadRequestException(`Node must be in pending or maintenance status to get setup guide (current: ${node.status})`);
    }

    // Generate setup token JWT (24h)
    const nodeId = (node as any)._id.toString();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_EXPIRES_IN * 1000);

    // Resolve URLs from config with fallbacks (org-specific → global → default)
    const orgId = context.orgId;
    const [baseApiUrl, baseWsUrl, monaBaseUrl] = await Promise.all([
      this.configService.getOrDefaultFromDb(ConfigKey.AIWM_BASE_API_URL, orgId, 'http://localhost:3003'),
      this.configService.getOrDefaultFromDb(ConfigKey.AIWM_BASE_WS_URL, orgId, 'ws://localhost:3003'),
      this.configService.getOrDefaultFromDb(ConfigKey.MONA_BASE_API_URL, orgId, 'http://localhost:3005'),
    ]);

    const bootstrapUrl = `${baseApiUrl}/nodes/auth/bootstrap`;

    const setupToken = this.jwtService.sign(
      {
        sub: nodeId,
        type: 'node-setup',
        nodeId,
        bootstrapUrl,
        apiBaseUrl: baseApiUrl,
        wsBaseUrl: baseWsUrl,
        wsPath: '/node/socket.io',
        monaBaseUrl,
      },
      { expiresIn: SETUP_TOKEN_EXPIRES_IN }
    );

    // Store sha256 hash of token (never store plain token)
    const setupTokenHash = createHash('sha256').update(setupToken).digest('hex');

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { setupTokenHash, setupTokenExpiresAt: expiresAt, updatedAt: new Date() } }
    );

    if (os === 'docker') {
      const scriptContent = this.generateDockerScript(setupToken, baseApiUrl, baseWsUrl, monaBaseUrl);
      const installCommand = `chmod +x start-xnode.sh && ./start-xnode.sh`;
      const instructions = [
        `1. Save the script content below to a file named "start-xnode.sh" on your Docker host.`,
        `2. Run: ${installCommand}`,
        `3. The script will bootstrap the node and start the Docker container automatically.`,
        `4. For subsequent restarts, use: docker restart xnode`,
        `5. Setup token is valid for 24 hours and single-use. If the container is deleted, generate a new setup guide.`,
      ];
      this.logger.log('Setup guide generated (docker)', { nodeId: id, requestedBy: context.userId, expiresAt });
      return { os, installCommand, instructions, setupTokenExpiresAt: expiresAt, fileName: 'start-xnode.sh', scriptContent };
    }

    const installCommand = `curl -fsSL ${SETUP_SCRIPT_URL} | bash -s -- ${setupToken}`;

    const instructions = [
      `1. Download and run the install script on your Ubuntu node:`,
      `   ${installCommand}`,
      `2. The script will automatically register the node with the platform.`,
      `3. After installation, the node will appear as "installing" and then "online".`,
      `4. Setup token is valid for 24 hours. After use it is invalidated.`,
    ];

    this.logger.log('Setup guide generated', { nodeId: id, requestedBy: context.userId, expiresAt });

    return { os, installCommand, instructions, setupTokenExpiresAt: expiresAt };
  }

  private generateDockerScript(setupToken: string, apiBaseUrl: string, wsBaseUrl: string, monaBaseUrl: string): string {
    return `#!/bin/bash
# =============================================================================
# start-xnode.sh — Khởi động XNode (Docker)
# Generated by AIWM — do not edit manually
# =============================================================================
# Usage (lần đầu):
#   chmod +x start-xnode.sh && ./start-xnode.sh
#
# Restart sau này:
#   docker restart xnode
#
# Yêu cầu: Docker, curl, jq
# =============================================================================

set -e

SETUP_TOKEN="${setupToken}"
CONTAINER_NAME="xnode"
IMAGE="${DOCKER_IMAGE}"

AIWM_API_BASE_URL="${apiBaseUrl}"
AIWM_WS_BASE_URL="${wsBaseUrl}"
MONA_API_BASE_URL="${monaBaseUrl}"
RELEASES_URL="${RELEASES_URL}"
LOG_LEVEL="info"

# Kiểm tra container đã tồn tại
if docker ps -aq -f name="^\${CONTAINER_NAME}$" | grep -q .; then
  echo "⚠️  Container '\${CONTAINER_NAME}' đã tồn tại."
  echo "   Dùng 'docker restart \${CONTAINER_NAME}' để khởi động lại."
  echo "   Hoặc xóa trước: docker rm -f \${CONTAINER_NAME}"
  exit 1
fi

# Kiểm tra jq
if ! command -v jq &>/dev/null; then
  echo "❌ 'jq' chưa được cài. Cài bằng: apt-get install -y jq"
  exit 1
fi

# Bootstrap — lấy credentials từ AIWM
echo "🔐 Đang đăng ký node..."
BOOTSTRAP_RESP=\$(curl -sf -X POST "\${AIWM_API_BASE_URL}/nodes/auth/bootstrap" \\
  -H "Content-Type: application/json" \\
  -d "{\\"setupToken\\":\\"\${SETUP_TOKEN}\\"}" || true)

if [ -z "\$BOOTSTRAP_RESP" ]; then
  echo "❌ Bootstrap thất bại. Setup token có thể đã hết hạn hoặc đã dùng rồi."
  echo "   Vui lòng generate setup guide mới từ Portal."
  exit 1
fi

NODE_API_KEY=\$(echo "\$BOOTSTRAP_RESP" | jq -r '.nodeId // empty')
NODE_SECRET=\$(echo "\$BOOTSTRAP_RESP" | jq -r '.secret // empty')

if [ -z "\$NODE_API_KEY" ] || [ -z "\$NODE_SECRET" ]; then
  echo "❌ Bootstrap thất bại: \$(echo "\$BOOTSTRAP_RESP" | jq -r '.message // "Unknown error"')"
  exit 1
fi

echo "✅ Bootstrap thành công"

# Khởi động container
echo "🚀 Khởi động XNode container..."

docker run -d \\
  --name "\$CONTAINER_NAME" \\
  --restart unless-stopped \\
  --user root \\
  -e AIWM_API_BASE_URL="\$AIWM_API_BASE_URL" \\
  -e AIWM_WS_BASE_URL="\$AIWM_WS_BASE_URL" \\
  -e MONA_API_BASE_URL="\$MONA_API_BASE_URL" \\
  -e NODE_API_KEY="\$NODE_API_KEY" \\
  -e NODE_SECRET="\$NODE_SECRET" \\
  -e XNODE_RUNTIME=process \\
  -e NODE_ENV=production \\
  -e LOG_LEVEL="\$LOG_LEVEL" \\
  -e RELEASES_URL="\$RELEASES_URL" \\
  -e XNODE_AGENTS_DIR=/usr/agents \\
  -e XNODE_DATA_DIR=/var/lib/xnode \\
  "\$IMAGE" \\
  bash -c '
    set -e
    echo "[start] Node.js: \$(node -v)"
    echo "[start] Downloading xnode from \$RELEASES_URL..."
    wget -q "\$RELEASES_URL/xnode-latest.tar.gz" -O /tmp/xnode.tar.gz
    mkdir -p /opt/xnode
    tar -xzf /tmp/xnode.tar.gz -C /opt/xnode
    XNODE_VER=\$(node -e "console.log(require(\\"/opt/xnode/package.json\\").version)" 2>/dev/null || echo "unknown")
    echo "[start] xnode v\$XNODE_VER downloaded"
    echo "[start] Downloading any-agent-pi from \$RELEASES_URL..."
    wget -q "\$RELEASES_URL/any-agent-pi-latest.tar.gz" -O /tmp/any-agent.tar.gz
    mkdir -p /opt/any-agent-pi
    tar -xzf /tmp/any-agent.tar.gz -C /opt/any-agent-pi --strip-components=1
    echo "[start] any-agent-pi downloaded"
    mkdir -p /usr/agents /var/log/xnode /var/lib/xnode /etc/xnode
    echo "[start] Starting XNode..."
    exec node /opt/xnode/dist/cli.js
  '

echo ""
echo "⏳ Chờ khởi động (15s)..."
sleep 15

STATUS=\$(docker inspect "\$CONTAINER_NAME" --format='{{.State.Status}}' 2>/dev/null || echo "unknown")
echo ""

if [ "\$STATUS" = "running" ]; then
  echo "✅ Container đang chạy: \$CONTAINER_NAME"
  echo ""
  echo "📋 Logs gần nhất:"
  echo "──────────────────────────────────────────"
  docker logs "\$CONTAINER_NAME" 2>&1 | tail -20
  echo "──────────────────────────────────────────"
  echo ""
  echo "📌 Lệnh hữu ích:"
  echo "   Xem logs:      docker logs -f \$CONTAINER_NAME"
  echo "   Dừng:          docker stop \$CONTAINER_NAME"
  echo "   Khởi động lại: docker restart \$CONTAINER_NAME"
  echo "   Xóa:           docker rm -f \$CONTAINER_NAME"
else
  echo "❌ Container không chạy (status: \$STATUS)"
  echo ""
  echo "📋 Logs lỗi:"
  docker logs "\$CONTAINER_NAME" 2>&1 | tail -30
  exit 1
fi
`;
  }

  /**
   * Bootstrap — called by the install script with setup token.
   * Verifies token, generates new secret, returns { nodeId, secret } once.
   * Node status → installing.
   */
  async bootstrap(setupToken: string): Promise<NodeBootstrapResponseDto> {
    let decoded: any;
    try {
      decoded = this.jwtService.verify(setupToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired setup token');
    }

    if (decoded.type !== 'node-setup') {
      throw new UnauthorizedException('Invalid token type');
    }

    const nodeId = decoded.nodeId;
    const node = await this.model
      .findOne({ _id: new Types.ObjectId(nodeId), isDeleted: false })
      .select('+setupTokenHash')
      .exec();

    if (!node) throw new NotFoundException('Node not found');

    // Guard: node must be approved (pending) before bootstrap
    if (node.status === 'awaiting-approval') {
      throw new ForbiddenException('Node has not been approved yet. Please contact your organization owner to approve this node before installation.');
    }

    // Verify token hash matches stored hash
    const tokenHash = createHash('sha256').update(setupToken).digest('hex');
    if (node.setupTokenHash !== tokenHash) {
      throw new UnauthorizedException('Setup token has already been used or is invalid');
    }

    // Check expiry
    if (node.setupTokenExpiresAt && node.setupTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Setup token has expired. Please generate a new setup guide.');
    }

    // Generate new secret
    const secret = randomUUID();
    const secretHash = await bcrypt.hash(secret, 10);

    // Update node: set secretHash, clear setupToken, status → installing
    await this.model.updateOne(
      { _id: new Types.ObjectId(nodeId) },
      {
        $set: {
          secretHash,
          status: 'installing',
          setupTokenHash: null,
          setupTokenExpiresAt: null,
          updatedAt: new Date(),
        },
      }
    );

    this.logger.log('Node bootstrapped successfully', { nodeId, status: 'installing' });

    return {
      nodeId,
      secret,
      warning: 'Save this secret now. It will not be shown again.',
      wsBaseUrl: decoded.wsBaseUrl,
      wsPath: decoded.wsPath,
    };
  }

  /**
   * @deprecated Use createNode instead
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
    const { apiKey, secret, secretHash } = await this.generateCredentials();
    const nodeData = { ...createNodeDto, apiKey, secretHash };
    const saved = await super.create(nodeData, context);
    this.logger.log('Node created with credentials (legacy)', { id: (saved as any)._id });
    await this.nodeProducer.emitNodeCreated(saved);
    return { node: saved as Node, credentials: { apiKey, secret } };
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

  // ============= Maintenance & Deletion =============

  /**
   * Set node to maintenance mode.
   * Only org.owner or node creator can trigger this.
   * Guard: for each critical role (controller, proxy, storage) that the node holds,
   * there must be at least one OTHER online node with that role.
   */
  async setMaintenance(id: string, context: RequestContext): Promise<Node> {
    const node = await this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
    if (!node) throw new NotFoundException(`Node with ID ${id} not found`);

    const isOwner = context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
    const isNodeCreator = node.owner?.userId === context.userId;

    if (!isOwner && !isNodeCreator) {
      throw new ForbiddenException('Only organization owner or node creator can set node to maintenance');
    }

    if (node.owner?.orgId !== context.orgId) {
      throw new ForbiddenException('Node does not belong to your organization');
    }

    if (node.status === 'maintenance') {
      throw new BadRequestException('Node is already in maintenance mode');
    }

    // Guard: check critical roles
    const CRITICAL_ROLES = ['controller', 'proxy', 'storage'];
    const nodeId = (node as any)._id.toString();
    const criticalRolesOnNode = (node.role || []).filter(r => CRITICAL_ROLES.includes(r));

    if (criticalRolesOnNode.length > 0) {
      const missingCoverage: string[] = [];

      for (const role of criticalRolesOnNode) {
        const onlineCount = await this.model.countDocuments({
          _id: { $ne: new Types.ObjectId(nodeId) },
          role: role,
          status: 'online',
          isDeleted: false,
        }).exec();

        if (onlineCount === 0) {
          missingCoverage.push(role);
        }
      }

      if (missingCoverage.length > 0) {
        throw new BadRequestException(
          `Cannot set node to maintenance: no other online node covers role(s): ${missingCoverage.join(', ')}. ` +
          `Ensure at least one other online node has these roles before proceeding.`
        );
      }
    }

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { status: 'maintenance', updatedBy: context.userId, updatedAt: new Date() } }
    );

    const updated = await this.model.findOne({ _id: new Types.ObjectId(id) }).exec();

    this.logger.log('Node set to maintenance', { nodeId: id, by: context.userId });

    return updated as Node;
  }

  /**
   * Soft delete a node.
   * Node must be in 'maintenance' status.
   * Only org.owner or node creator can delete.
   */
  async deleteNode(id: string, context: RequestContext): Promise<void> {
    const node = await this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
    if (!node) throw new NotFoundException(`Node with ID ${id} not found`);

    const isOwner = context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
    const isNodeCreator = node.owner?.userId === context.userId;

    if (!isOwner && !isNodeCreator) {
      throw new ForbiddenException('Only organization owner or node creator can delete a node');
    }

    if (node.owner?.orgId !== context.orgId) {
      throw new ForbiddenException('Node does not belong to your organization');
    }

    const deletableStatuses = ['maintenance', 'awaiting-approval', 'pending'];
    if (!deletableStatuses.includes(node.status)) {
      throw new BadRequestException(
        `Node must be in maintenance, awaiting-approval, or pending status before deletion (current: ${node.status}). ` +
        `Use POST /nodes/${id}/maintenance first.`
      );
    }

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { isDeleted: true, updatedBy: context.userId, updatedAt: new Date() } }
    );

    this.logger.log('Node soft deleted', { nodeId: id, deletedBy: context.userId });

    await this.nodeProducer.emitNodeDeleted(id);
  }

  // ============= Remote Update =============

  /**
   * Validate that a node can receive a remote update command.
   * Returns the node if valid; throws otherwise.
   * Only org.owner or node creator can trigger.
   * Node must be online (WebSocket connected).
   */
  async validateUpdateRequest(id: string, context: RequestContext): Promise<Node> {
    const node = await this.model.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).exec();
    if (!node) throw new NotFoundException(`Node with ID ${id} not found`);

    const isOwner = context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
    const isNodeCreator = node.owner?.userId === context.userId;

    if (!isOwner && !isNodeCreator) {
      throw new ForbiddenException('Only organization owner or node creator can trigger node update');
    }

    if (node.owner?.orgId !== context.orgId) {
      throw new ForbiddenException('Node does not belong to your organization');
    }

    if (node.status !== 'online') {
      throw new BadRequestException(
        `Node must be online to receive update command (current: ${node.status})`
      );
    }

    return node as Node;
  }

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
    const update: Record<string, unknown> = {
      status: heartbeatData.status,
      uptimeSeconds: heartbeatData.uptimeSeconds,
      cpuUsage: heartbeatData.cpuUsage,
      ramUsage: heartbeatData.ramUsage,
      lastHeartbeat: new Date(),
      updatedAt: new Date(),
    };

    if (heartbeatData.daemonVersion) {
      update.daemonVersion = heartbeatData.daemonVersion;
    }

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: update },
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
   * Regenerate secret for an existing node.
   * Allowed: org.owner OR the user who created the node (owner.userId).
   * Only allowed when node is online or offline (has been bootstrapped).
   * Returns warning severity based on current status.
   */
  async regenerateCredentials(
    id: string,
    context: RequestContext
  ): Promise<{
    node: Node;
    credentials: { secret: string };
    warning: string;
    affectedStatus: string;
  }> {
    const node = await this.model
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!node) throw new NotFoundException(`Node with ID ${id} not found`);

    const isOwner = context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
    const isNodeCreator = node.owner?.userId === context.userId;

    if (!isOwner && !isNodeCreator) {
      this.logger.warn('Unauthorized attempt to regenerate credentials', {
        nodeId: id, userId: context.userId, userRoles: context.roles,
      });
      throw new ForbiddenException('Only organization owner or node creator can regenerate credentials');
    }

    if (node.owner?.orgId !== context.orgId) {
      throw new ForbiddenException('Node does not belong to your organization');
    }

    const allowedStatuses = ['online', 'offline'];
    if (!allowedStatuses.includes(node.status)) {
      throw new BadRequestException(
        `Credentials can only be regenerated for online or offline nodes (current: ${node.status}). Use setup guide for pending nodes.`
      );
    }

    const secret = randomUUID();
    const secretHash = await bcrypt.hash(secret, 10);

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          secretHash,
          setupTokenHash: null,
          setupTokenExpiresAt: null,
          lastAuthAt: null,
          updatedAt: new Date(),
          updatedBy: context.userId,
        },
      }
    );

    const updatedNode = await this.model.findOne({ _id: new Types.ObjectId(id) }).exec();

    const warning = node.status === 'online'
      ? 'WARNING: This node is currently ONLINE. Resetting the secret will immediately disconnect the running node. It must be reconfigured with the new secret to reconnect.'
      : 'Node is offline. The new secret must be applied before the node can reconnect.';

    this.logger.log('Credentials regenerated', {
      nodeId: id, regeneratedBy: context.userId, nodeStatus: node.status,
    });

    return {
      node: updatedNode as Node,
      credentials: { secret },
      warning,
      affectedStatus: node.status,
    };
  }

  /**
   * Node login - verify credentials and return JWT token.
   * Priority: apiKey (legacy field) > id field.
   * id field: UUID format → legacy apiKey lookup, ObjectId → _id lookup.
   */
  async login(dto: NodeLoginDto): Promise<NodeLoginResponseDto> {
    // apiKey field takes priority for full backward compat with old node agents
    const identifier = dto.apiKey ?? dto.id;
    if (!identifier) {
      throw new UnauthorizedException('Either id or apiKey is required');
    }
    const node = await this.verifyNodeCredentials(identifier, dto.secret);

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

    this.logger.log(`Node login successful: ${node.name} (${(node as any)._id})`);

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
   * Verify node credentials (internal helper).
   * Dual-mode: UUID → legacy apiKey lookup, ObjectId → _id lookup.
   */
  private async verifyNodeCredentials(id: string, secret: string): Promise<Node> {
    let node: Node | null = null;

    if (UUID_REGEX.test(id)) {
      // Legacy: lookup by apiKey
      node = await this.model
        .findOne({ apiKey: id, isDeleted: false })
        .select('+secretHash')
        .exec();
    } else if (OBJECT_ID_REGEX.test(id)) {
      // New: lookup by _id
      node = await this.model
        .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
        .select('+secretHash')
        .exec();
    } else {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!node) {
      this.logger.warn('Node not found', { id: id.substring(0, 8) + '...' });
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
