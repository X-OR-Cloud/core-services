import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsSource, NewsSourceSchema } from './news-sources.schema';
import { NewsSourcesService } from './news-sources.service';
import { NewsSourcesController } from './news-sources.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: NewsSource.name, schema: NewsSourceSchema }])],
  providers: [NewsSourcesService],
  controllers: [NewsSourcesController],
  exports: [NewsSourcesService],
})
export class NewsSourcesModule {}
