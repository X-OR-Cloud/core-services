import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NodesModule } from '../modules/nodes/nodes.module';
import { AccountsModule } from '../modules/accounts/accounts.module';
import { TrunksModule } from '../modules/trunks/trunks.module';
import { PhoneNumbersModule } from '../modules/phone-numbers/phone-numbers.module';
import { DialplansModule } from '../modules/dialplans/dialplans.module';
import { RoutesModule } from '../modules/routes/routes.module';
import { CallsModule } from '../modules/calls/calls.module';
import { WebhooksModule } from '../modules/webhooks/webhooks.module';
import { QueueModule } from '../queues/queue.module';
import { CommonModule } from '../common/common.module';

/**
 * API mode module — HTTP server + BullMQ producers.
 * Run with: MODE=api nx run vsm:api
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      {
        dbName: 'core_vsm',
        authSource: process.env['MONGODB_AUTH_SOURCE'] || 'admin',
      },
    ),
    PassportModule,
    BullModule.forRoot({ connection: redisConfig }),
    BullModule.registerQueue({ name: QUEUE_NAMES.AMI_COMMANDS }),
    HealthModule,
    CommonModule,
    QueueModule,
    NodesModule,
    AccountsModule,
    TrunksModule,
    PhoneNumbersModule,
    DialplansModule,
    RoutesModule,
    CallsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
