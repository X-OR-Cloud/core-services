import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NodeController } from './node.controller';
import { NodeService } from './node.service';
import { Node, NodeSchema } from './node.schema';
import { NodeGateway } from './node.gateway';
import { NodeConnectionService } from './node-connection.service';
import { QueueModule } from '../../queues/queue.module';
import { ConfigurationModule } from '../configuration/configuration.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Node.name, schema: NodeSchema }]),
    QueueModule,
    ConfigurationModule,
    // Use registerAsync to ensure ConfigModule has loaded .env before reading JWT_SECRET
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'hydra-secret-key',
        signOptions: {
          algorithm: 'HS256' as const,
        },
      }),
    }),
  ],
  controllers: [NodeController],
  providers: [
    NodeService,
    NodeGateway,
    NodeConnectionService,
  ],
  exports: [NodeService, NodeGateway, NodeConnectionService, MongooseModule],
})
export class NodeModule {}