import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Dialplan, DialplanSchema } from './dialplans.schema';
import { DialplansService } from './dialplans.service';
import { DialplansController } from './dialplans.controller';
import { QueueModule } from '../../queues/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Dialplan.name, schema: DialplanSchema }]),
    QueueModule,
  ],
  providers: [DialplansService],
  controllers: [DialplansController],
  exports: [DialplansService],
})
export class DialplansModule {}
