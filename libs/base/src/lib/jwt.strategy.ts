import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt-auth') {
  constructor(configService: ConfigService) {
    // Use ConfigService to get JWT_SECRET from environment
    const jwtSecret = configService.get<string>('JWT_SECRET') || 'R4md0m_S3cr3t';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    // Validate payload structure
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      sub: payload.sub,
      username: payload.username,
      status: payload.status,
      roles: payload.roles || [],
      orgId: payload.orgId || '',
      groupId: payload.groupId || '',
      agentId: payload.agentId || '',
      appId: payload.appId || '',
      userId: payload.userId || '',
      type: payload.type || 'user',
      licenses: payload.licenses || {}, // License map from JWT payload
      permissions: payload.permissions || [], // Service account permissions
    };
  }
}
