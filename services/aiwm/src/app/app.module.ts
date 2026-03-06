import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  HealthModule,
  JwtStrategy,
  CorrelationIdMiddleware,
} from '@hydrabyte/base';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NodeModule } from '../modules/node/node.module';
import { ModelModule } from '../modules/model/model.module';
import { InstructionModule } from '../modules/instruction/instruction.module';
import { ToolModule } from '../modules/tool/tool.module';
import { PiiModule } from '../modules/pii/pii.module';
import { GuardrailModule } from '../modules/guardrail/guardrail.module';
import { DeploymentModule } from '../modules/deployment/deployment.module';
import { ResourceModule } from '../modules/resource/resource.module';
import { ConfigurationModule } from '../modules/configuration/configuration.module';
import { AgentModule } from '../modules/agent/agent.module';
import { ExecutionModule } from '../modules/execution/execution.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { McpModule } from '../modules/mcp/mcp.module';
import { UtilModule } from '../modules/util/util.module';
import { ConversationModule } from '../modules/conversation/conversation.module';
import { MessageModule } from '../modules/message/message.module';
import { ChatModule } from '../modules/chat/chat.module';
import { MemoryModule } from '../modules/memory/memory.module';
import { WorkflowModule } from '../modules/workflow/workflow.module';
import { WorkflowStepModule } from '../modules/workflow-step/workflow-step.module';
import { QueueModule } from '../queues/queue.module';
import { ProcessorsModule } from '../queues/processors.module';
import { COMMON_CONFIG, SERVICE_CONFIG } from '@hydrabyte/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(`${process.env.MONGODB_URI}/${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.aiwm.name}`),
    PassportModule,
    EventEmitterModule.forRoot(), // NEW: Enable event emitter for workflow events
    HealthModule,
    QueueModule,
    NodeModule,
    ModelModule,
    InstructionModule,
    ToolModule,
    PiiModule,
    GuardrailModule,
    DeploymentModule,
    ResourceModule,
    ConfigurationModule,
    AgentModule,
    WorkflowModule, // NEW: Workflow template management
    WorkflowStepModule, // NEW: Workflow step management
    ExecutionModule,
    ReportsModule,
    McpModule,
    UtilModule,
    ConversationModule,
    MessageModule,
    ChatModule,
    MemoryModule,
    ProcessorsModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
