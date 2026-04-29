import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AmiClientService } from './ami-client.service';
import { AmiEventHandler } from './ami-event.handler';
import { AmiCommandService } from './ami-command.service';
import { AmiCommandConsumer } from './ami-command.consumer';

@Module({
  imports: [HttpModule],
  providers: [
    AmiClientService,
    AmiEventHandler,
    AmiCommandService,
    AmiCommandConsumer,
  ],
  exports: [AmiClientService],
})
export class AmiModule {}
