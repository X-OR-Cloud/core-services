import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { Node, NodeSchema } from '../node/node.schema';
import { NodeGateway } from './node.gateway';
import { NodeConnectionService } from './node-connection.service';
import { NodePersistenceService } from './node-persistence.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.aiwm.name}`),
    ),
    MongooseModule.forFeature([{ name: Node.name, schema: NodeSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'hydra-secret-key',
        signOptions: { algorithm: 'HS256' as const },
      }),
    }),
  ],
  providers: [NodeGateway, NodeConnectionService, NodePersistenceService],
})
export class NodeGatewayModule {}
