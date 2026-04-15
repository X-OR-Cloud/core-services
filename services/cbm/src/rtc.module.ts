import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { DocumentRtcModule } from './modules/document-rtc/document-rtc.module';

/**
 * RtcModule — standalone NestJS application module for the realtime
 * collaboration server (cbm:rtc mode). Bundled with only the minimum
 * dependencies needed by the Hocuspocus hooks: DocumentRtcService (Redis +
 * Mongo) and JwtService (token verification).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.cbm.name}`),
    ),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'R4md0m_S3cr3t',
      }),
    }),
    DocumentRtcModule,
  ],
})
export class RtcModule {}
