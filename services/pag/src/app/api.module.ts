/**
 * API Module - HTTP endpoints only, no queue processors
 * Used by api.main.ts for API-only instances
 */
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HealthModule, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueModule } from '../queues/queue.module';

// Entity modules (with controllers)
import { ChannelsModule } from '../modules/channels/channels.module';
import { SoulsModule } from '../modules/souls/souls.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { MemoriesModule } from '../modules/memories/memories.module';
import { TasksModule } from '../modules/tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'services/pag/.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core_pag' },
    ),
    PassportModule,
    HealthModule,
    QueueModule, // Producers only (for enqueuing from webhook)
    // Entity modules with controllers
    ChannelsModule,
    SoulsModule,
    ConversationsModule,
    MessagesModule,
    MemoriesModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
