/**
 * Worker Module - Queue processors only, no HTTP endpoints
 * Used by worker.main.ts for worker-only instances
 */
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueModule } from '../queues/queue.module';
import { ProcessorsModule } from '../queues/processors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'services/pag/.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017/hydra-pag'
    ),
    QueueModule,
    ProcessorsModule,
  ],
})
export class WorkerModule {
  private readonly logger = new Logger(WorkerModule.name);

  onModuleInit() {
    this.logger.log('🔧 PAG Worker started — processing queues');
  }
}
