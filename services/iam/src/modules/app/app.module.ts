import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppWebhookService } from './app-webhook.service';
import { App, AppSchema } from './app.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: App.name, schema: AppSchema }]),
    HttpModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppWebhookService],
  exports: [AppService, AppWebhookService],
})
export class IamAppModule {}
