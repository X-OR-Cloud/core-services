import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduledJobModule } from '../modules/scheduled-job/scheduled-job.module';
import { JobExecutionModule } from '../modules/job-execution/job-execution.module';
import { QueueModule } from '../queues/queue.module';
import { ProcessorsModule } from '../queues/processors.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

// Check if running in worker mode
const isWorkerMode = process.argv.includes('--mode=worker');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'services/schd/.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017/hydra-schd'
    ),
    EventEmitterModule.forRoot(),
    PassportModule,
    HealthModule,
    QueueModule,
    ScheduledJobModule,
    JobExecutionModule,
    ProcessorsModule,
    // Only load SchedulerModule in worker mode
    ...(isWorkerMode ? [SchedulerModule] : []),
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
