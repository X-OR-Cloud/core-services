import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { COMMON_CONFIG, SERVICE_CONFIG } from '@hydrabyte/shared';

// Import only modules needed for worker
import { ExecutionModule } from './modules/execution/execution.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { WorkflowStepModule } from './modules/workflow-step/workflow-step.module';
import { DeploymentModule } from './modules/deployment/deployment.module';
import { InstructionModule } from './modules/instruction/instruction.module';

/**
 * Worker Module - Only includes worker-related functionality
 * No HTTP controllers, only BullMQ workers
 */
@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    MongooseModule.forRoot(
      `${process.env.MONGODB_URI}/${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.aiwm.name}`,
      {
        connectionFactory: (connection) => {
          console.log('MongoDB connected for Worker');
          return connection;
        },
      }
    ),

    // Event Emitter
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: ':',
      maxListeners: 20,
    }),

    // Modules (only services, no controllers)
    ExecutionModule,
    WorkflowModule,
    WorkflowStepModule,
    DeploymentModule,
    InstructionModule,
  ],
})
export class WorkerModule {}
