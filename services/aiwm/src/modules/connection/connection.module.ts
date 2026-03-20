import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection, ConnectionSchema } from './connection.schema';
import { ConnectionService } from './connection.service';
import { ConnectionController } from './connection.controller';
import { TeamsWebhookController } from './teams-webhook.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Connection.name, schema: ConnectionSchema }]),
  ],
  controllers: [ConnectionController, TeamsWebhookController],
  providers: [ConnectionService],
  exports: [ConnectionService],
})
export class ConnectionModule {}
