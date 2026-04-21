import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Node, NodeSchema } from '../node/node.schema';
import { Resource, ResourceSchema } from '../resource/resource.schema';
import { Model, ModelSchema } from '../model/model.schema';
import { Deployment, DeploymentSchema } from '../deployment/deployment.schema';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { Execution, ExecutionSchema } from '../execution/execution.schema';
import { ConversationModule } from '../conversation/conversation.module';
import { ActionModule } from '../action/action.module';

/**
 * Reports Module
 *
 * Provides aggregated monitoring and reporting data for dashboards.
 * Aggregates data from multiple entities: Node, Resource, Model, Deployment, Agent, Execution.
 *
 * Endpoints:
 * - GET /reports/overview - Platform overview
 * - GET /reports/system-overview - System infrastructure overview
 * - GET /reports/ai-workload-overview - AI workload overview
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Node.name, schema: NodeSchema },
      { name: Resource.name, schema: ResourceSchema },
      { name: Model.name, schema: ModelSchema },
      { name: Deployment.name, schema: DeploymentSchema },
      { name: Agent.name, schema: AgentSchema },
      { name: Execution.name, schema: ExecutionSchema },
    ]),
    ConversationModule,
    ActionModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
