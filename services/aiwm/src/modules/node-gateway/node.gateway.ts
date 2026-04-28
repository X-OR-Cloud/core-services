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
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Namespace, Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import Redis from 'ioredis';
import { NodePersistenceService } from './node-persistence.service';
import { NodeConnectionService } from './node-connection.service';
import {
  MessageType,
  NodeRegisterDto,
  NodeHeartbeatDto,
  NodeMetricsDto,
  CommandAckDto,
  CommandResultDto,
  DeploymentStatusDto,
  ConnectionAckDto,
  RegisterAckDto,
  AuthErrorCode,
} from '@hydrabyte/shared';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class NodeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NodeGateway.name);
  private redisSub: Redis | null = null;
  private _aliasNs: Namespace | null = null;

  constructor(
    private readonly nodeService: NodePersistenceService,
    private readonly connectionService: NodeConnectionService,
  ) {}

  async onModuleInit() {
    const cfg = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      enableReadyCheck: false,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    };

    this.redisSub = new Redis(cfg);

    await this.redisSub.psubscribe('node:cmd:*');

    this.redisSub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const nodeId = channel.replace('node:cmd:', '');
      try {
        const payload = JSON.parse(message);
        this.forwardToNode(nodeId, payload);
      } catch (err) {
        this.logger.error(`Failed to parse Redis message on ${channel}: ${(err as Error).message}`);
      }
    });

    this.logger.log('NodeGateway subscribed to node:cmd:* on Redis');
  }

  onModuleDestroy() {
    this.redisSub?.disconnect();
    this.redisSub = null;
  }

  afterInit(server: Server) {
    server.use(this._authMiddleware());
    this.logger.log('Node WebSocket Gateway initialized on /');

    // TODO: REMOVE after all old xnode clients are upgraded to connect namespace "/" instead of "/ws/node".
    // Context: old nginx forwarded / to node ws backend, so old xnode clients explicitly connect to
    // namespace /ws/node. New clients use namespace / via nginx path /ws/node/socket.io.
    // @SubscribeMessage decorators only bind to the primary namespace (/), so auth middleware and
    // message handlers must be registered manually on each alias namespace socket.
    this._aliasNs = (server as any).server.of('/ws/node') as Namespace;
    this._aliasNs.use(this._authMiddleware());
    this._aliasNs.on('connection', async (socket: Socket) => {
      await this.handleConnection(socket);
      this._registerAliasHandlers(socket);
    });
    this.logger.log('Node WebSocket Gateway alias registered: /ws/node');
    // END TODO
  }

  private _authMiddleware() {
    const jwtSecret = process.env.JWT_SECRET || 'hydra-secret-key';
    return (socket: Socket, next: (err?: Error) => void) => {
      try {
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
        this.logger.error(`Auth failed for socket ${socket.id}: ${error.message}`);
        if (error.name === 'TokenExpiredError') {
          return next(new Error('TOKEN_EXPIRED'));
        }
        return next(new Error('TOKEN_INVALID'));
      }
    };
  }

  // TODO: REMOVE together with afterInit alias block above once old xnode clients are fully migrated.
  private _registerAliasHandlers(socket: Socket): void {
    const wrap = (handler: (data: any, socket: Socket) => any) =>
      (data: any, callback: ((res: any) => void) | undefined) => {
        Promise.resolve(handler(data, socket))
          .then((res) => { if (typeof callback === 'function') callback(res); })
          .catch((err: Error) => { if (typeof callback === 'function') callback({ error: err.message }); });
      };

    socket.on(MessageType.NODE_REGISTER,      wrap((d, s) => this.handleNodeRegister(d, s)));
    socket.on(MessageType.TELEMETRY_HEARTBEAT, wrap((d, s) => this.handleHeartbeat(d, s)));
    socket.on(MessageType.TELEMETRY_METRICS,   wrap((d, s) => this.handleMetrics(d, s)));
    socket.on(MessageType.COMMAND_ACK,         wrap((d, s) => this.handleCommandAck(d, s)));
    socket.on(MessageType.COMMAND_RESULT,      wrap((d, s) => this.handleCommandResult(d, s)));
    socket.on(MessageType.DEPLOYMENT_STATUS,   wrap((d, s) => this.handleDeploymentStatus(d, s)));
  }
  // END TODO

  async handleConnection(client: Socket) {
    const nodeId = client.data.user?.nodeId;
    const username = client.data.user?.username;

    this.logger.log(`Client attempting to connect: ${client.id} - Node: ${nodeId}`);

    try {
      const node = await this.nodeService.findById(nodeId);

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

      this.connectionService.addConnection(
        nodeId,
        client,
        username,
        client.data.user?.orgId,
        client.data.user?.groupId,
      );

      await client.join(`node:${nodeId}`);

      this.sendConnectionAck(client, 'success', undefined, {
        nodeId,
        controllerId: 'controller-main',
        serverVersion: '1.0.0',
      });

      await this.nodeService.updateStatus(nodeId, 'online');

      this.logger.log(`Node ${nodeId} successfully connected (socket: ${client.id})`);
    } catch (error) {
      this.logger.error(`Connection error for node ${nodeId}: ${(error as Error).message}`);
      this.sendConnectionAck(client, 'error', {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error during connection',
        timestamp: new Date().toISOString(),
      });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const nodeId = client.data.user?.nodeId;

    if (nodeId) {
      this.logger.log(`Node ${nodeId} disconnecting (socket: ${client.id})`);

      this.connectionService.removeConnection(nodeId, client.id);

      if (!this.connectionService.isNodeOnline(nodeId)) {
        try {
          await this.nodeService.updateStatus(nodeId, 'offline');
        } catch (error) {
          this.logger.error(
            `Failed to update node status on disconnect: ${(error as Error).message}`,
          );
        }
      }

      this.logger.log(`Node ${nodeId} disconnected`);
    }
  }

  @SubscribeMessage(MessageType.NODE_REGISTER)
  async handleNodeRegister(
    @MessageBody() data: NodeRegisterDto,
    @ConnectedSocket() client: Socket,
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(`Node registration received from ${nodeId}`);

    try {
      const registerData = data.data;

      if ((registerData as any).systemInfo) {
        await this.nodeService.updateNodeInfo(nodeId, {
          systemInfo: (registerData as any).systemInfo,
          daemonVersion: (registerData as any).daemonVersion,
          status: 'online',
        });
      } else {
        await this.nodeService.updateNodeInfo(nodeId, {
          systemInfo: {
            os: registerData.os
              ? {
                  name: registerData.os.distro,
                  version: registerData.os.version,
                  kernel: registerData.os.kernel,
                  platform: registerData.os.platform,
                }
              : undefined,
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
            containerRuntime: registerData.containerRuntime
              ? {
                  type: registerData.containerRuntime.type,
                  version: registerData.containerRuntime.version,
                  storage: { driver: '', filesystem: '' },
                }
              : undefined,
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

  @SubscribeMessage(MessageType.TELEMETRY_HEARTBEAT)
  async handleHeartbeat(
    @MessageBody() data: NodeHeartbeatDto,
    @ConnectedSocket() client: Socket,
  ) {
    const nodeId = client.data.user?.nodeId;

    this.connectionService.updateHeartbeat(nodeId);

    try {
      await this.nodeService.updateHeartbeat(nodeId, {
        status: data.data.status,
        uptimeSeconds: data.data.uptimeSeconds,
        cpuUsage: data.data.cpuUsage,
        ramUsage: data.data.ramUsage,
        activeDeployments: data.data.activeDeployments,
        gpuStatus: data.data.gpuStatus,
        daemonVersion: data.data.daemonVersion,
      });
    } catch (error) {
      this.logger.error(`Failed to update heartbeat for ${nodeId}: ${(error as Error).message}`);
    }
  }

  @SubscribeMessage(MessageType.TELEMETRY_METRICS)
  async handleMetrics(@MessageBody() data: NodeMetricsDto, @ConnectedSocket() client: Socket) {
    const nodeId = client.data.user?.nodeId;
    this.logger.debug(`Metrics received from ${nodeId}`);

    try {
      await this.nodeService.storeMetrics(nodeId, data.data);
    } catch (error) {
      this.logger.error(`Failed to store metrics for ${nodeId}: ${(error as Error).message}`);
    }
  }

  @SubscribeMessage(MessageType.COMMAND_ACK)
  handleCommandAck(@MessageBody() data: CommandAckDto, @ConnectedSocket() client: Socket) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(
      `Command ACK from ${nodeId} for message ${data.data.originalMessageId}`,
    );
  }

  @SubscribeMessage(MessageType.COMMAND_RESULT)
  handleCommandResult(@MessageBody() data: CommandResultDto, @ConnectedSocket() client: Socket) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(
      `Command result from ${nodeId} for message ${data.data.originalMessageId}: ${data.data.status}`,
    );
  }

  @SubscribeMessage(MessageType.DEPLOYMENT_STATUS)
  handleDeploymentStatus(
    @MessageBody() data: DeploymentStatusDto,
    @ConnectedSocket() client: Socket,
  ) {
    const nodeId = client.data.user?.nodeId;
    this.logger.log(
      `Deployment status from ${nodeId}: ${data.data.deploymentId} → ${data.data.status}`,
    );
  }

  private forwardToNode(nodeId: string, payload: any) {
    const connection = this.connectionService.getConnection(nodeId);
    if (!connection) {
      return;
    }
    connection.socket.emit(payload.type, payload);
    this.logger.log(
      `Forwarded command ${payload.type} to node ${nodeId} (${payload.messageId})`,
    );
  }

  private sendConnectionAck(
    client: Socket,
    status: 'success' | 'error',
    error?: { code: string; message: string; timestamp: string },
    successData?: { nodeId: string; controllerId: string; serverVersion: string },
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
          controllerId: 'controller-main',
          heartbeatInterval: 30000,
          metricsInterval: 60000,
          timezone: 'UTC',
        },
        pendingCommands: [],
      },
    };
    client.emit(MessageType.REGISTER_ACK, ack);
  }
}
