import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { Socket } from 'socket.io';
import { Deployment } from '../deployment/deployment.schema';
import { Model as ModelEntity } from '../model/model.schema';
import { VoiceSession } from './voice-session';

@WebSocketGateway({ cors: { origin: '*' } })
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(VoiceGateway.name);
  private readonly sessions = new Map<string, VoiceSession>();

  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Deployment.name) private readonly deploymentModel: Model<Deployment>,
    @InjectModel(ModelEntity.name) private readonly modelModel: Model<ModelEntity>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        client.handshake.query?.token;

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token as string);

      // VWS is user-only
      if (payload.type === 'agent' || payload.type === 'anonymous' || payload.agentId) {
        client.disconnect();
        return;
      }

      client.data.userId = payload.sub;
      client.data.orgId = payload.orgId;
      client.data.token = token;
      this.logger.log(`[VWS] connected: ${client.id} userId=${payload.sub}`);
    } catch (err) {
      this.logger.warn(`[VWS] auth failed ${client.id}: ${(err as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const session = this.sessions.get(client.id);
    if (session) {
      session.close();
      this.sessions.delete(client.id);
    }
    this.logger.log(`[VWS] disconnected: ${client.id}`);
  }

  @SubscribeMessage('start')
  async handleStart(
    @MessageBody() dto: { deploymentId: string; toolSchemas: any[]; systemInstruction: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (this.sessions.has(client.id)) {
      return { success: false, error: 'Session already active' };
    }

    try {
      const deployment = await this.deploymentModel
        .findOne({ _id: dto.deploymentId, isDeleted: { $ne: true } })
        .lean()
        .exec();

      if (!deployment) {
        return { success: false, error: 'Deployment not found' };
      }

      const model = await this.modelModel
        .findOne({ _id: (deployment as any).modelId, isDeleted: { $ne: true } })
        .lean()
        .exec();

      if (!model) {
        return { success: false, error: 'Model not found' };
      }

      if ((model as any).type !== 'voice' || (model as any).protocol !== 'ws') {
        return { success: false, error: 'Deployment does not support voice WS' };
      }

      const apiKey = (model as any).apiConfig?.apiKey;
      if (!apiKey) {
        return { success: false, error: 'Model has no API key configured' };
      }

      const session = new VoiceSession(client, {
        apiKey,
        modelIdentifier: (model as any).modelIdentifier || 'gemini-2.0-flash-live',
        systemInstruction: dto.systemInstruction || '',
        tools: dto.toolSchemas || [],
      });

      await session.init();
      this.sessions.set(client.id, session);

      this.logger.log(`[VWS] session started: ${client.id} deployment=${dto.deploymentId}`);
      return { success: true };
    } catch (err) {
      this.logger.error(`[VWS] start failed ${client.id}: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('audio')
  handleAudio(
    @MessageBody() dto: { data: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.sessions.get(client.id)?.sendAudio(dto.data);
  }

  @SubscribeMessage('tool_result')
  handleToolResult(
    @MessageBody() dto: { callId: string; result: unknown },
    @ConnectedSocket() client: Socket,
  ) {
    this.sessions.get(client.id)?.sendToolResult(dto.callId, dto.result);
  }

  @SubscribeMessage('interrupt')
  handleInterrupt(@ConnectedSocket() client: Socket) {
    this.sessions.get(client.id)?.interrupt();
  }
}
