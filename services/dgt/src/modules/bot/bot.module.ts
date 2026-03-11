import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { Bot, BotSchema } from './bot.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bot.name, schema: BotSchema }]),
  ],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService, MongooseModule],
})
export class BotModule {}
