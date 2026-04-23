import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserNewsPreference, UserNewsPreferenceSchema } from './user-news-prefs.schema';
import { UserNewsPrefsService } from './user-news-prefs.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserNewsPreference.name, schema: UserNewsPreferenceSchema }])],
  providers: [UserNewsPrefsService],
  exports: [UserNewsPrefsService],
})
export class UserNewsPrefsModule {}
