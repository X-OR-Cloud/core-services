import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { Configuration, ConfigurationSchema } from '../configuration/configuration.schema';
import { ConfigurationService } from '../configuration/configuration.service';
import { IamOrgService } from '../configuration/iam-org.service';
import { HeartbeatService } from './heartbeat.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Agent.name, schema: AgentSchema },
      { name: Configuration.name, schema: ConfigurationSchema },
    ]),
    HttpModule.register({ timeout: 10000, maxRedirects: 3 }),
  ],
  providers: [HeartbeatService, ConfigurationService, IamOrgService],
  exports: [HeartbeatService],
})
export class HeartbeatModule {}
