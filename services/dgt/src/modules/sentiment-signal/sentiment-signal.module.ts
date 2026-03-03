import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SentimentSignalController } from './sentiment-signal.controller';
import { SentimentSignalService } from './sentiment-signal.service';
import { SentimentSignal, SentimentSignalSchema } from './sentiment-signal.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SentimentSignal.name, schema: SentimentSignalSchema }]),
  ],
  controllers: [SentimentSignalController],
  providers: [SentimentSignalService],
  exports: [SentimentSignalService, MongooseModule],
})
export class SentimentSignalModule {}
