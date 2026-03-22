import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

/**
 * Node connection information
 */
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

/**
 * Service to track and manage node WebSocket connections
 */
@Injectable()
export class NodeConnectionService {
  private readonly logger = new Logger(NodeConnectionService.name);
  private connections: Map<string, NodeConnection> = new Map();

  /**
   * Add a new node connection
   */
  addConnection(
    nodeId: string,
    socket: Socket,
    username: string,
    orgId?: string,
    groupId?: string
  ): void {
    const now = new Date();

    // If node already connected, disconnect old socket
    const existing = this.connections.get(nodeId);
    if (existing) {
      this.logger.warn(
        `Node ${nodeId} already connected. Disconnecting old socket ${existing.socketId}`
      );
      existing.socket.disconnect(true);
    }

    const connection: NodeConnection = {
      nodeId,
      socketId: socket.id,
      socket,
      username,
      connectedAt: now,
      lastHeartbeat: now,
      status: 'online',
      orgId,
      groupId,
    };

    this.connections.set(nodeId, connection);
    this.logger.log(
      `Node ${nodeId} connected (socket: ${socket.id}, user: ${username})`
    );
  }

  /**
   * Remove a node connection, only if the socket ID matches (prevents race condition
   * where a stale disconnect event removes a newly registered connection).
   */
  removeConnection(nodeId: string, socketId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection && connection.socketId === socketId) {
      connection.status = 'offline';
      this.connections.delete(nodeId);
      this.logger.log(`Node ${nodeId} disconnected (socket: ${connection.socketId})`);
    } else if (connection) {
      this.logger.log(
        `Node ${nodeId} disconnect ignored: socket ${socketId} is stale (current: ${connection.socketId})`
      );
    }
  }

  /**
   * Get connection by node ID
   */
  getConnection(nodeId: string): NodeConnection | undefined {
    return this.connections.get(nodeId);
  }

  /**
   * Get connection by socket ID
   */
  getConnectionBySocketId(socketId: string): NodeConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.socketId === socketId) {
        return connection;
      }
    }
    return undefined;
  }

  /**
   * Update last heartbeat time
   */
  updateHeartbeat(nodeId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection) {
      connection.lastHeartbeat = new Date();
    }
  }

  /**
   * Get all online nodes
   */
  getOnlineNodes(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get all connections
   */
  getAllConnections(): NodeConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Check if node is online
   */
  isNodeOnline(nodeId: string): boolean {
    return this.connections.has(nodeId);
  }

  /**
   * Get total online node count
   */
  getOnlineCount(): number {
    return this.connections.size;
  }

  /**
   * Find nodes that haven't sent heartbeat in specified time
   */
  findStaleConnections(timeoutMs: number): NodeConnection[] {
    const now = Date.now();
    const stale: NodeConnection[] = [];

    for (const connection of this.connections.values()) {
      const timeSinceHeartbeat = now - connection.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > timeoutMs) {
        stale.push(connection);
      }
    }

    return stale;
  }
}
