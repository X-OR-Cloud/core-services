import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { NodeService } from './node.service';
import { NodeConnectionService } from './node-connection.service';
import {
  MessageType,
  NodeRegisterDto,
  NodeHeartbeatDto,
  NodeMetricsDto,
  CommandAckDto,
  CommandResultDto,
  DeploymentStatusDto,
  DeploymentLogsDto,
  ConnectionAckDto,
  RegisterAckDto,
  AuthErrorCode,
} from '@hydrabyte/shared';
import { v4 as uuidv4 } from 'uuid';
import type { ExecutionOrchestrator } from '../execution/execution.orchestrator';

/**
 * WebSocket Gateway for Node (Worker) connections
 * Namespace: /ws/node
 */
@WebSocketGateway({
  namespace: '/ws/node',
  cors: {
    origin: '*', // TODO: Configure proper CORS in production
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class NodeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NodeGateway.name);

  constructor(
    private readonly nodeService: NodeService,
    private readonly connectionService: NodeConnectionService,
    private readonly configService: ConfigService,
  ) {}

  // ExecutionOrchestrator injected via setter to avoid circular dependency
  private executionOrchestrator?: ExecutionOrchestrator;

  setExecutionOrchestrator(orchestrator: ExecutionOrchestrator) {
    this.executionOrchestrator = orchestrator;
  }

  /**
   * Gateway initialization - apply JWT middleware for /ws/node namespace
   */
  afterInit(server: Server) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const masked = jwtSecret && jwtSecret.length > 4
      ? jwtSecret.substring(0, 2) + '***' + jwtSecret.substring(jwtSecret.length - 2)
      : '****';
    this.logger.log(`WebSocket JWT_SECRET: ${masked} (len=${jwtSecret?.length || 0})`);

    server.use((socket, next) => {
      try {
        // Support multiple token sources: auth object, Authorization header, query param
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
          (socket.handshake.query?.token as string);
        if (!token) {
          this.logger.warn(`Connection rejected: No token - ${socket.id}`);
          return next(new Error('TOKEN_MISSING'));
        }

        const decoded = verify(token, jwtSecret as string) as Record<string, unknown>;
        socket.data.user = {
          nodeId: decoded.sub,
          type: decoded.type,
          username: decoded.username,
          status: decoded.status,
          roles: (decoded.roles as string[]) || [],
          orgId: decoded.orgId,
        };

        this.logger.log(`Socket authenticated: ${socket.id} - Node: ${decoded.sub}`);
        next();
      } catch (err: unknown) {
        const error = err as Error & { name?: string };
        this.logger.error(`Auth failed for socket ${socket.id}: ${error.message} | JWT_SECRET: ${masked} (len=${jwtSecret?.length || 0})`);
        if (error.name === 'TokenExpiredError') {
          return next(new Error('TOKEN_EXPIRED'));
        }
        return next(new Error('TOKEN_INVALID'));
      }
    });

    this.logger.log('Node WebSocket Gateway initialized on /ws/node');
  }

  /**
   * Handle new client connection
   */
  async handleConnection(client: Socket) {
    const nodeId = client.data.user?.nodeId; // This is the MongoDB _id from JWT token
    const username = client.data.user?.username;

    this.logger.log(
      `Client attempting to connect: ${client.id} - Node: ${nodeId}`
    );

    try {
      // Validate node exists
      const node = await this.nodeService.findByObjectId(nodeId);

      if (!node) {
        this.logger.warn(`Node not found in database: ${nodeId}`);
        this.sendConnectionAck(client, 'error', {
          code: AuthErrorCode.NODE_NOT_FOUND,
          message: 'Node ID not found in database',
          timestamp: new Date().toISOString(),
        });
        client.disconnect(true);
        return;
      }

      // Only block explicitly disabled nodes
      if (node.status === 'inactive' || node.status === 'banned') {
        this.logger.warn(`Node is disabled: ${nodeId} - status: ${node.status}`);
        this.sendConnectionAck(client, 'error', {
          code: AuthErrorCode.NODE_INACTIVE,
          message: 'Node is disabled',
          timestamp: new Date().toISOString(),
        });
        client.disconnect(true);
        return;
      }

      // Add connection to tracking
      this.connectionService.addConnection(
        nodeId,
        client,
        username,
        client.data.user?.orgId,
        client.data.user?.groupId
      );

      // Send success acknowledgment
      this.sendConnectionAck(client, 'success', undefined, {
        nodeId,
        controllerId: 'controller-main', // TODO: Get from config
        serverVersion: '1.0.0', // TODO: Get from package.json
      });

      // Update node status to online
      await this.nodeService.updateStatus(nodeId, 'online');

      this.logger.log(`Node ${nodeId} successfully connected (socket: ${client.id})`);
    } catch (error) {
      this.logger.error(`Connection error for node ${nodeId}: ${error.message}`);
      this.sendConnectionAck(client, 'error', {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error during connection',
        timestamp: new Date().toISOString(),
      });
      client.disconnect(true);
    }
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: Socket) {
    const nodeId = client.data.user?.nodeId;

    if (nodeId) {
      this.logger.log(`Node ${nodeId} disconnecting (socket: ${client.id})`);

      // Remove from connection tracking
      this.connectionService.removeConnection(nodeId);

      // Update node status to offline
      try {
        await this.nodeService.updateStatus(nodeId, 'offline');
      } catch (error) {
        this.logger.error(
          `Failed to update node status on disconnect: ${error.message}`
        );
      }

      this.logger.log(`Node ${nodeId} disconnected`);
    }
  }

  /**
   * Handle node registration
   * Accepts both new systemInfo format and legacy flat fields
   */
  @SubscribeMessage(MessageType.NODE_REGISTER)
  async handleNodeRegister(
    @MessageBody() data: NodeRegisterDto,
    @ConnectedSocket() client: Socket
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(`Node registration received from ${nodeId}`);

    try {
      const registerData = data.data;

      // Support both systemInfo (new) and flat fields (legacy)
      if ((registerData as any).systemInfo) {
        // New format: Node Agent sends systemInfo directly
        await this.nodeService.updateNodeInfo(nodeId, {
          systemInfo: (registerData as any).systemInfo,
          status: 'online',
        });
      } else {
        // Legacy format: map flat fields to systemInfo
        await this.nodeService.updateNodeInfo(nodeId, {
          systemInfo: {
            os: registerData.os ? {
              name: registerData.os.distro,
              version: registerData.os.version,
              kernel: registerData.os.kernel,
              platform: registerData.os.platform,
            } : undefined,
            architecture: {
              cpu: registerData.os?.arch || 'x86_64',
              bits: 64,
              endianness: 'LE',
            },
            hardware: {
              cpu: {
                model: registerData.cpuModel,
                vendor: registerData.cpuModel?.split(' ')[0] || 'Unknown',
                totalCores: registerData.cpuCores,
                frequency: 0,
              },
              memory: { total: registerData.ramTotal * 1024 * 1024 },
              disk: { total: registerData.diskTotal * 1024 * 1024 },
              network: {
                publicIp: registerData.publicIpAddress,
                clusterIp: registerData.ipAddress,
                ports: {},
                interfaces: [],
              },
              gpu: registerData.gpuDevices?.map((g: any) => ({
                deviceId: g.deviceId,
                model: g.model,
                vendor: 'NVIDIA',
                memoryTotal: g.memoryTotal * 1024 * 1024,
              })),
            },
            containerRuntime: registerData.containerRuntime ? {
              type: registerData.containerRuntime.type,
              version: registerData.containerRuntime.version,
              storage: { driver: '', filesystem: '' },
            } : undefined,
          },
          daemonVersion: registerData.daemonVersion,
          status: 'online',
        });
      }

      this.sendRegisterAck(client, nodeId);
      this.logger.log(`Node ${nodeId} registered successfully`);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Node registration failed for ${nodeId}: ${error.message}`);
      client.emit('error', {
        type: 'error',
        error: { code: 'REGISTRATION_FAILED', message: error.message },
      });
    }
  }

  /**
   * Handle heartbeat
   */
  @SubscribeMessage(MessageType.TELEMETRY_HEARTBEAT)
  async handleHeartbeat(
    @MessageBody() data: NodeHeartbeatDto,
    @ConnectedSocket() client: Socket
  ) {
    const nodeId = client.data.user?.nodeId;

    // Update last heartbeat time
    this.connectionService.updateHeartbeat(nodeId);

    // Update node status in database (optional - can be done periodically instead)
    try {
      await this.nodeService.updateHeartbeat(nodeId, {
        status: data.data.status,
        uptimeSeconds: data.data.uptimeSeconds,
        cpuUsage: data.data.cpuUsage,
        ramUsage: data.data.ramUsage,
        activeDeployments: data.data.activeDeployments,
        gpuStatus: data.data.gpuStatus,
      });
    } catch (error) {
      this.logger.error(`Failed to update heartbeat for ${nodeId}: ${error.message}`);
    }
  }

  /**
   * Handle metrics
   */
  @SubscribeMessage(MessageType.TELEMETRY_METRICS)
  async handleMetrics(
    @MessageBody() data: NodeMetricsDto,
    @ConnectedSocket() client: Socket
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.debug(`Metrics received from ${nodeId}`);

    try {
      // Store metrics in database
      await this.nodeService.storeMetrics(nodeId, data.data);
    } catch (error) {
      this.logger.error(`Failed to store metrics for ${nodeId}: ${error.message}`);
    }
  }

  /**
   * Handle command acknowledgment
   */
  @SubscribeMessage(MessageType.COMMAND_ACK)
  async handleCommandAck(
    @MessageBody() data: CommandAckDto,
    @ConnectedSocket() client: Socket
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(
      `Command ACK received from ${nodeId} for message ${data.data.originalMessageId}`
    );

    // Update execution tracking if executionId is present
    const metadata = (data as any).metadata;
    if (this.executionOrchestrator && metadata?.executionId !== undefined) {
      try {
        await this.executionOrchestrator.handleCommandAck(
          metadata.executionId,
          metadata.stepIndex,
          data.messageId
        );
      } catch (error) {
        this.logger.error(
          `Failed to update execution tracking for ACK: ${error.message}`
        );
      }
    }
  }

  /**
   * Handle command result
   */
  @SubscribeMessage(MessageType.COMMAND_RESULT)
  async handleCommandResult(
    @MessageBody() data: CommandResultDto,
    @ConnectedSocket() client: Socket
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(
      `Command result received from ${nodeId} for message ${data.data.originalMessageId}: ${data.data.status}`
    );

    // Update execution tracking if executionId is present
    const metadata = (data as any).metadata;
    if (this.executionOrchestrator && metadata?.executionId !== undefined) {
      try {
        await this.executionOrchestrator.handleCommandResult(
          metadata.executionId,
          metadata.stepIndex,
          {
            success: data.data.status === 'success',
            data: data.data.result,
            error: data.data.error,
            progress: data.data.progress,
          }
        );
      } catch (error) {
        this.logger.error(
          `Failed to update execution tracking for result: ${error.message}`
        );
      }
    }
  }

  /**
   * Handle deployment status update
   */
  @SubscribeMessage(MessageType.DEPLOYMENT_STATUS)
  async handleDeploymentStatus(
    @MessageBody() data: DeploymentStatusDto,
    @ConnectedSocket() client: Socket
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(
      `Deployment status update from ${nodeId}: ${data.data.deploymentId} -> ${data.data.status}`
    );

    // TODO: Update deployment status in database
    // This will be implemented when Deployment entity is created
  }

  /**
   * Handle deployment logs
   */
  @SubscribeMessage(MessageType.DEPLOYMENT_LOGS)
  async handleDeploymentLogs(
    @MessageBody() data: DeploymentLogsDto,
    @ConnectedSocket() client: Socket
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.debug(
      `Deployment logs from ${nodeId}: ${data.data.deploymentId} - ${data.data.logs.length} entries`
    );

    // TODO: Store logs in database or forward to log aggregation system
    // This will be implemented when Deployment entity is created
  }

  /**
   * Send a command to a specific node
   */
  async sendCommandToNode(
    nodeId: string,
    commandType: string,
    resource: { type: string; id: string },
    data: Record<string, any>,
    metadata?: {
      executionId?: string;
      stepIndex?: number;
      timeout?: number;
      priority?: 'low' | 'normal' | 'high';
    }
  ): Promise<string> {
    const connection = this.connectionService.getConnection(nodeId);

    if (!connection) {
      this.logger.warn(`Cannot send command: Node ${nodeId} is not connected`);
      throw new Error(`Node ${nodeId} is not connected`);
    }

    const messageId = uuidv4();
    const message = {
      type: commandType,
      messageId,
      timestamp: new Date().toISOString(),
      resource,
      data,
      metadata: {
        priority: metadata?.priority || 'normal',
        ...(metadata?.executionId && { executionId: metadata.executionId }),
        ...(metadata?.stepIndex !== undefined && { stepIndex: metadata.stepIndex }),
        ...(metadata?.timeout && { timeout: metadata.timeout }),
      },
    };

    connection.socket.emit(commandType, message);
    this.logger.log(
      `Command sent to ${nodeId}: ${commandType} (${resource.id}) - messageId: ${messageId}`
    );

    return messageId;
  }

  /**
   * Broadcast a message to all connected nodes
   */
  broadcastToAllNodes(messageType: string, data: any): void {
    const onlineCount = this.connectionService.getOnlineCount();
    this.server.emit(messageType, data);
    this.logger.log(`Broadcast message to ${onlineCount} nodes: ${messageType}`);
  }

  /**
   * Send connection acknowledgment
   */
  private sendConnectionAck(
    client: Socket,
    status: 'success' | 'error',
    error?: { code: string; message: string; timestamp: string },
    successData?: { nodeId: string; controllerId: string; serverVersion: string }
  ): void {
    const ack: ConnectionAckDto = {
      type: MessageType.CONNECTION_ACK,
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      status,
      ...(status === 'success' ? successData : {}),
      ...(status === 'error' ? { error } : {}),
    };

    client.emit(MessageType.CONNECTION_ACK, ack);
  }

  /**
   * Send registration acknowledgment
   */
  private sendRegisterAck(client: Socket, nodeId: string): void {
    const ack: RegisterAckDto = {
      type: MessageType.REGISTER_ACK,
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      data: {
        status: 'success',
        nodeId,
        registeredAt: new Date().toISOString(),
        controllerInfo: {
          controllerId: 'controller-main', // TODO: Get from config
          heartbeatInterval: 30000, // 30 seconds
          metricsInterval: 60000, // 60 seconds
          timezone: 'UTC',
        },
        pendingCommands: [], // TODO: Fetch pending commands from database
      },
    };

    client.emit(MessageType.REGISTER_ACK, ack);
  }

  /**
   * Get online node IDs
   */
  getOnlineNodes(): string[] {
    return this.connectionService.getOnlineNodes();
  }

  /**
   * Check if node is online
   */
  isNodeOnline(nodeId: string): boolean {
    return this.connectionService.isNodeOnline(nodeId);
  }

  /**
   * Get online node count
   */
  getOnlineCount(): number {
    return this.connectionService.getOnlineCount();
  }
}
