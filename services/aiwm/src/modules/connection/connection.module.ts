import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection, ConnectionSchema } from './connection.schema';
import { ConnectionService } from './connection.service';
import { ConnectionController } from './connection.controller';
import { WebhookController } from './webhook.controller';
import { ConfigurationModule } from '../configuration/configuration.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Connection.name, schema: ConnectionSchema }]),
    ConfigurationModule,
  ],
  controllers: [ConnectionController, WebhookController],
  providers: [ConnectionService],
  exports: [ConnectionService],
})
export class ConnectionModule {}
