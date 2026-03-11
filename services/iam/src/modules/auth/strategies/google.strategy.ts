import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL: configService.get<string>('GOOGLE_REDIRECT_URI') || 'http://localhost:3001/auth/google/callback',
      scope: ['openid', 'email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, emails, photos, displayName } = profile;
    const user = {
      googleId: id,
      email: emails?.[0]?.value,
      displayName,
      avatarUrl: photos?.[0]?.value ?? null,
    };
    done(null, user);
  }
}
