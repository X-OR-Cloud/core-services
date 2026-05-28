import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { Agent, AgentSchema } from './agent.schema';
import { Instruction, InstructionSchema } from '../instruction/instruction.schema';
import { Tool, ToolSchema } from '../tool/tool.schema';
import { AgentMemory, AgentMemorySchema } from '../memory/memory.schema';
import { QueueModule } from '../../queues/queue.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { DeploymentModule } from '../deployment/deployment.module';
import { NodeModule } from '../node/node.module';
import { ReminderModule } from '../reminder/reminder.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import { ApiKeyOrJwtGuard } from '../../guards/api-key-or-jwt.guard';
import { ConversationModule } from '../conversation/conversation.module';
import { ActionModule } from '../action/action.module';
import { HeartbeatModule } from '../heartbeat/heartbeat.module';
import { InstructionBuilderModule } from '../instruction-builder/instruction-builder.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Agent.name, schema: AgentSchema },
      { name: Instruction.name, schema: InstructionSchema },
      { name: Tool.name, schema: ToolSchema },
      { name: AgentMemory.name, schema: AgentMemorySchema },
    ]),
    // Use registerAsync to ensure ConfigService is loaded before accessing JWT_SECRET
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'R4md0m_S3cr3t',
        signOptions: { expiresIn: '24h' },
      }),
    }),
    HttpModule.register({ timeout: 10000, maxRedirects: 3 }),
    QueueModule,
    ConfigurationModule,
    DeploymentModule, // Import to access DeploymentService
    NodeModule, // Import to access NodeService (node lookup, validation)
    ReminderModule, // Import to access ReminderService for heartbeat reminder injection
    ApiKeyModule,
    ConversationModule,
    ActionModule,
    HeartbeatModule,
    InstructionBuilderModule,
  ],
  controllers: [AgentController],
  providers: [AgentService, ApiKeyOrJwtGuard],
  exports: [AgentService, MongooseModule],
})
export class AgentModule {}