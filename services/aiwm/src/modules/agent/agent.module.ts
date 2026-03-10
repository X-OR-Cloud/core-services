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
import { QueueModule } from '../../queues/queue.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { DeploymentModule } from '../deployment/deployment.module';
import { NodeModule } from '../node/node.module';
import { ReminderModule } from '../reminder/reminder.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Agent.name, schema: AgentSchema },
      { name: Instruction.name, schema: InstructionSchema },
      { name: Tool.name, schema: ToolSchema },
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
    NodeModule, // Import to access NodeGateway for sending agent.start commands
    ReminderModule, // Import to access ReminderService for heartbeat reminder injection
  ],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService, MongooseModule],
})
export class AgentModule {}