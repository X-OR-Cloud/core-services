import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ServerOptions, Server } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

/**
 * WebSocket adapter with JWT authentication
 */
export class WsJwtAdapter extends IoAdapter {
  private readonly logger = new Logger(WsJwtAdapter.name);
  private configService: ConfigService;

  constructor(app: INestApplicationContext) {
    super(app);
    this.configService = app.get(ConfigService);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');

    const serverOptions: ServerOptions = {
      ...options,
      cors: {
        origin: '*', // TODO: Configure proper CORS in production
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    };

    const server: Server = super.createIOServer(port, serverOptions);

    // JWT authentication middleware
    server.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token;

        if (!token) {
          this.logger.warn(
            `Connection rejected: No token provided - ${socket.id}`
          );
          return next(new Error('TOKEN_MISSING'));
        }

        // Verify JWT token
        const decoded = verify(token, jwtSecret) as any;

        // Attach decoded token to socket
        socket.data.user = {
          nodeId: decoded.sub,
          type: decoded.type,
          username: decoded.username,
          status: decoded.status,
          roles: decoded.roles || [],
          orgId: decoded.orgId,
        };

        this.logger.log(
          `Socket authenticated: ${socket.id} - Node: ${decoded.sub}`
        );
        next();
      } catch (error) {
        this.logger.error(
          `Authentication failed for socket ${socket.id}: ${error.message}`
        );

        if (error.name === 'TokenExpiredError') {
          return next(new Error('TOKEN_EXPIRED'));
        } else if (error.name === 'JsonWebTokenError') {
          return next(new Error('TOKEN_INVALID'));
        }

        return next(new Error('AUTH_FAILED'));
      }
    });

    this.logger.log('WebSocket server created with JWT authentication');
    return server;
  }
}
