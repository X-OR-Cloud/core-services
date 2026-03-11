import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { App, AppSchema } from './app.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: App.name, schema: AppSchema }]),
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [AppService],
})
export class IamAppModule {}
