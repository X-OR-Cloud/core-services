import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Trunk, TrunkSchema } from './trunks.schema';
import { TrunksService } from './trunks.service';
import { TrunksController } from './trunks.controller';
import { QueueModule } from '../../queues/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trunk.name, schema: TrunkSchema }]),
    QueueModule,
  ],
  providers: [TrunksService],
  controllers: [TrunksController],
  exports: [TrunksService],
})
export class TrunksModule {}
