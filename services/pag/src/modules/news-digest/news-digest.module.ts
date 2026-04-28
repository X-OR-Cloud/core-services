import { Module } from '@nestjs/common';
import { NewsDigestService } from './news-digest.service';
import { NewsDigestController } from './news-digest.controller';
import { UserNewsPrefsModule } from '../user-news-prefs/user-news-prefs.module';
import { NewsItemsModule } from '../news-items/news-items.module';
import { MemoriesModule } from '../memories/memories.module';
import { UserPlansModule } from '../user-plans/user-plans.module';

@Module({
  imports: [UserNewsPrefsModule, NewsItemsModule, MemoriesModule, UserPlansModule],
  controllers: [NewsDigestController],
  providers: [NewsDigestService],
  exports: [NewsDigestService],
})
export class NewsDigestModule {}
