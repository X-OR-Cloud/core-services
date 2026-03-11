import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SentimentSignalController } from './sentiment-signal.controller';
import { SentimentSignalService } from './sentiment-signal.service';
import { SentimentSignal, SentimentSignalSchema } from './sentiment-signal.schema';
import { NewsapiCollector } from '../../collectors/newsapi.collector';
import { NewsArticleModule } from '../news-article/news-article.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SentimentSignal.name, schema: SentimentSignalSchema }]),
    NewsArticleModule,
  ],
  controllers: [SentimentSignalController],
  providers: [SentimentSignalService, NewsapiCollector],
  exports: [SentimentSignalService, MongooseModule],
})
export class SentimentSignalModule {}
