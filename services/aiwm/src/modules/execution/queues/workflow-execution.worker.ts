import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { ExecutionOrchestratorService } from '../services/execution-orchestrator.service';

/**
 * WorkflowExecutionWorker
 * BullMQ worker (consumer) for workflow executions
 * Processes workflow execution jobs from the queue
 */
@Injectable()
export class WorkflowExecutionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowExecutionWorker.name);
  private worker: Worker;

  constructor(
    private readonly orchestrator: ExecutionOrchestratorService,
  ) {}

  onModuleInit() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    this.worker = new Worker(
      QUEUE_NAMES.WORKFLOW_EXECUTION,
      async (job: Job) => {
        this.logger.log(`Processing job ${job.id}: ${job.name}`);
        const { executionId } = job.data;

        try {
          // Call orchestrator to execute workflow
          await this.orchestrator.executeWorkflow(executionId);
          this.logger.log(`Workflow execution ${executionId} completed`);
        } catch (error) {
          this.logger.error(
            `Workflow execution ${executionId} failed: ${error.message}`,
            error.stack
          );
          throw error; // Re-throw to trigger BullMQ retry
        }
      },
      {
        connection: {
          host: redisHost,
          port: redisPort,
        },
        concurrency: parseInt(process.env.WORKFLOW_WORKER_CONCURRENCY || '5'),
      }
    );

    this.worker.on('ready', () => {
      this.logger.log('✅ Worker is ready and waiting for jobs');
    });

    this.worker.on('active', (job) => {
      this.logger.log(`🔄 Worker picked up job ${job.id}`);
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`✅ Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`❌ Job ${job?.id} failed: ${err.message}`);
    });

    this.worker.on('error', (err) => {
      this.logger.error(`Worker error: ${err.message}`, err.stack);
    });

    this.logger.log('Workflow execution worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.logger.log('Workflow execution worker stopped');
  }
}
