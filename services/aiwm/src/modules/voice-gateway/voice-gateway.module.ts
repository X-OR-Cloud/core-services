import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { VoiceGateway } from './voice.gateway';
import { Deployment, DeploymentSchema } from '../deployment/deployment.schema';
import { Model as ModelEntity, ModelSchema } from '../model/model.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.aiwm.name}`),
    ),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is required');
        return { secret, signOptions: { expiresIn: '1h' } };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Deployment.name, schema: DeploymentSchema },
      { name: ModelEntity.name, schema: ModelSchema },
    ]),
  ],
  providers: [VoiceGateway],
})
export class VoiceGatewayModule {}
