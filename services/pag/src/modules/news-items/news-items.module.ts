import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsItem, NewsItemSchema } from './news-items.schema';
import { NewsItemsService } from './news-items.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: NewsItem.name, schema: NewsItemSchema }])],
  providers: [NewsItemsService],
  exports: [NewsItemsService],
})
export class NewsItemsModule {}
