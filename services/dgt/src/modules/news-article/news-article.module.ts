import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsArticleController } from './news-article.controller';
import { NewsArticleService } from './news-article.service';
import { NewsArticle, NewsArticleSchema } from './news-article.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: NewsArticle.name, schema: NewsArticleSchema }]),
  ],
  controllers: [NewsArticleController],
  providers: [NewsArticleService],
  exports: [NewsArticleService, MongooseModule],
})
export class NewsArticleModule {}
