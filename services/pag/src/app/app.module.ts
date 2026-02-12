import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HealthModule, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueModule } from '../queues/queue.module';
import { ProcessorsModule } from '../queues/processors.module';

// Entity modules
import { ChannelsModule } from '../modules/channels/channels.module';
import { SoulsModule } from '../modules/souls/souls.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { MemoriesModule } from '../modules/memories/memories.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'services/pag/.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017/hydra-pag'
    ),
    PassportModule,
    HealthModule,
    QueueModule,
    ProcessorsModule,
    // Entity modules
    ChannelsModule,
    SoulsModule,
    ConversationsModule,
    MessagesModule,
    MemoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
