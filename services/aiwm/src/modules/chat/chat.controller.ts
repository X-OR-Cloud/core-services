import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';

/**
 * ChatController - HTTP endpoints for WebSocket service
 *
 * Provides health check and info endpoints for WebSocket gateway
 */
@ApiTags('WebSocket')
@Controller('ws')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}
  /**
   * Health check endpoint for WebSocket service
   * Used to verify WebSocket gateway is running and accessible
   */
  @Get()
  @ApiOperation({
    summary: 'WebSocket service info',
    description: 'Returns information about the WebSocket service. Useful for Nginx proxy verification.'
  })
  @ApiResponse({
    status: 200,
    description: 'WebSocket service is running',
    schema: {
      type: 'object',
      properties: {
        service: { type: 'string', example: 'AIWM WebSocket Gateway' },
        status: { type: 'string', example: 'running' },
        namespace: { type: 'string', example: '/ws' },
        endpoint: { type: 'string', example: 'ws://localhost:3305/ws' },
        socketPath: { type: 'string', example: '/ws/socket.io/' },
        timestamp: { type: 'string', example: '2025-12-30T12:00:00.000Z' },
      }
    }
  })
  getInfo() {
    return {
      service: 'AIWM WebSocket Gateway',
      status: 'running',
      namespace: '/ws',
      endpoint: 'Connect via Socket.IO client',
      socketPath: '/ws/socket.io/',
      features: [
        'Real-time chat',
        'Agent auto-join',
        'Typing indicators',
        'Presence tracking',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detailed health check
   */
  @Get('health')
  @ApiOperation({ summary: 'WebSocket health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return {
      status: 'healthy',
      service: 'websocket-gateway',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Monitor: snapshot of all active conversations with socket/presence/agent status.
   * Intended for internal debug tooling; FE polls every 10s.
   */
  @Get('monitor')
  @ApiOperation({
    summary: 'Active conversations monitor',
    description: 'Returns active conversations with participant socket sessions, online status, agent heartbeat state, and last sent/received messages. Internal debug tool — no auth required.',
  })
  @ApiQuery({ name: 'agentId', required: false, description: 'Filter by agent ID' })
  @ApiQuery({ name: 'connectionId', required: false, description: 'Filter by connection ID' })
  @ApiResponse({ status: 200, description: 'Monitor snapshot' })
  async getMonitor(
    @Query('agentId') agentId?: string,
    @Query('connectionId') connectionId?: string,
  ) {
    return this.chatService.getMonitorData({
      ...(agentId && { agentId }),
      ...(connectionId && { connectionId }),
    });
  }
}
