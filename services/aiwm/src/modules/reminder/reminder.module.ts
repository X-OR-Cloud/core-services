import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Reminder, ReminderSchema } from './reminder.schema';
import { ReminderService } from './reminder.service';
import { ReminderController } from './reminder.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Reminder.name, schema: ReminderSchema }]),
  ],
  controllers: [ReminderController],
  providers: [ReminderService],
  exports: [ReminderService],
})
export class ReminderModule {}
