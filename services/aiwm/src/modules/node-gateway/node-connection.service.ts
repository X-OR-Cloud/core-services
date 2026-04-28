import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

export interface NodeConnection {
  nodeId: string;
  socketId: string;
  socket: Socket;
  username: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  status: 'online' | 'offline';
  orgId?: string;
  groupId?: string;
}

@Injectable()
export class NodeConnectionService {
  private readonly logger = new Logger(NodeConnectionService.name);
  private connections: Map<string, NodeConnection> = new Map();

  addConnection(
    nodeId: string,
    socket: Socket,
    username: string,
    orgId?: string,
    groupId?: string,
  ): void {
    const now = new Date();

    const existing = this.connections.get(nodeId);
    if (existing) {
      this.logger.warn(
        `Node ${nodeId} already connected. Disconnecting old socket ${existing.socketId}`,
      );
      existing.socket.disconnect(true);
    }

    this.connections.set(nodeId, {
      nodeId,
      socketId: socket.id,
      socket,
      username,
      connectedAt: now,
      lastHeartbeat: now,
      status: 'online',
      orgId,
      groupId,
    });

    this.logger.log(`Node ${nodeId} connected (socket: ${socket.id}, user: ${username})`);
  }

  removeConnection(nodeId: string, socketId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection && connection.socketId === socketId) {
      connection.status = 'offline';
      this.connections.delete(nodeId);
      this.logger.log(`Node ${nodeId} disconnected (socket: ${connection.socketId})`);
    } else if (connection) {
      this.logger.log(
        `Node ${nodeId} disconnect ignored: socket ${socketId} is stale (current: ${connection.socketId})`,
      );
    }
  }

  getConnection(nodeId: string): NodeConnection | undefined {
    return this.connections.get(nodeId);
  }

  updateHeartbeat(nodeId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection) {
      connection.lastHeartbeat = new Date();
    }
  }

  isNodeOnline(nodeId: string): boolean {
    return this.connections.has(nodeId);
  }

  getOnlineNodes(): string[] {
    return Array.from(this.connections.keys());
  }

  getOnlineCount(): number {
    return this.connections.size;
  }
}
