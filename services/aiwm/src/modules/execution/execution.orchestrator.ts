import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { Execution, ExecutionStep } from './execution.schema';
import { ExecutionService } from './execution.service';
import { NodeGateway } from '../node/node.gateway';

/**
 * ExecutionOrchestrator - Core workflow engine
 *
 * Responsibilities:
 * - Start and manage execution lifecycle
 * - Process steps based on dependencies
 * - Send commands to worker nodes via WebSocket
 * - Handle command acknowledgments and results
 * - Determine next steps and execution completion
 * - Pure event-based orchestration (no BullMQ)
 */
@Injectable()
export class ExecutionOrchestrator implements OnModuleInit {
  private readonly logger = new Logger(ExecutionOrchestrator.name);

  constructor(
    private readonly executionService: ExecutionService,
    private readonly nodeGateway: NodeGateway
  ) {}

  onModuleInit() {
    // Register this orchestrator with NodeGateway to handle command results
    this.nodeGateway.setExecutionOrchestrator(this);
    this.logger.log('ExecutionOrchestrator registered with NodeGateway');
  }

  /**
   * Start an execution
   * - Transitions from 'pending' to 'running'
   * - Begins processing ready steps
   */
  async startExecution(id: string, force: boolean = false): Promise<Execution> {
    const { Types } = await import('mongoose');
    const execution = await this.executionService.findById(new Types.ObjectId(id) as any, {} as any);

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    // Check if already running
    if (execution.status === 'running' && !force) {
      throw new BadRequestException(
        `Execution ${id} is already running. Use force=true to restart.`
      );
    }

    // Check if already completed
    if (['completed', 'failed', 'cancelled'].includes(execution.status) && !force) {
      throw new BadRequestException(
        `Execution ${id} is already ${execution.status}. Use retry endpoint instead.`
      );
    }

    // Update status to running
    const updated = await this.executionService.updateExecutionStatus(
      id,
      'running',
      0
    );

    if (!updated) {
      throw new NotFoundException(`Failed to update execution ${id}`);
    }

    this.logger.log(`Execution ${id} started`);

    // Process ready steps asynchronously
    setImmediate(() => this.processReadySteps(id));

    return updated;
  }

  /**
   * Process all ready steps in an execution
   * - Finds steps with satisfied dependencies
   * - Executes them in parallel (if possible)
   */
  async processReadySteps(id: string): Promise<void> {
    const { Types } = await import('mongoose');
    const execution = await this.executionService.findById(new Types.ObjectId(id) as any, {} as any);

    if (!execution) {
      this.logger.warn(`Execution ${id} not found, skipping step processing`);
      return;
    }

    // Skip if not running
    if (execution.status !== 'running') {
      this.logger.debug(`Execution ${id} is ${execution.status}, skipping step processing`);
      return;
    }

    // Get ready steps
    const readySteps = this.executionService.getReadySteps(execution);

    if (readySteps.length === 0) {
      this.logger.debug(`No ready steps for execution ${id}`);

      // Check if execution is complete
      await this.checkAndFinalizeExecution(id);
      return;
    }

    this.logger.log(
      `Processing ${readySteps.length} ready steps for execution ${id}: ` +
      `[${readySteps.map((s) => s.index).join(', ')}]`
    );

    // Execute ready steps in parallel
    await Promise.all(
      readySteps.map((step) => this.executeStep(execution, step))
    );
  }

  /**
   * Execute a single step
   * - Updates step status to 'running'
   * - Sends command to worker node via WebSocket
   * - Handles errors
   */
  private async executeStep(execution: Execution, step: ExecutionStep): Promise<void> {
    const executionId = (execution as any)._id.toString();
    try {
      // Update step status to running
      await this.executionService.updateExecutionStep(
        executionId,
        step.index,
        { status: 'running', progress: 0 }
      );

      this.logger.log(
        `Executing step ${step.index} (${step.name}) for execution ${executionId}`
      );

      // Determine target node
      const nodeId = step.nodeId || execution.nodeId;

      if (!nodeId) {
        throw new Error(`No nodeId specified for step ${step.index}`);
      }

      // Send command to worker node
      if (step.command) {
        const messageId = await this.nodeGateway.sendCommandToNode(
          nodeId,
          step.command.type,
          step.command.resource,
          step.command.data,
          {
            executionId: executionId,
            stepIndex: step.index,
            timeout: step.timeoutSeconds,
          }
        );

        // Track sent message
        await this.executionService.updateExecutionStep(
          executionId,
          step.index,
          { sentMessageId: messageId }
        );

        this.logger.log(
          `Command sent to node ${nodeId} for step ${step.index}: ` +
          `messageId=${messageId}, type=${step.command.type}`
        );
      } else {
        // No command to execute, mark as completed immediately
        await this.executionService.updateExecutionStep(
          executionId,
          step.index,
          {
            status: 'completed',
            progress: 100,
            result: { message: 'No command to execute' },
          }
        );

        // Process next ready steps
        setImmediate(() => this.processReadySteps(executionId));
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to execute step ${step.index} for execution ${executionId}: ${error.message}`,
        error.stack
      );

      // Mark step as failed
      await this.executionService.updateExecutionStep(
        executionId,
        step.index,
        {
          status: 'failed',
          error: {
            code: 'STEP_EXECUTION_FAILED',
            message: error.message,
            details: error.stack,
          },
        }
      );

      // Check if execution should fail
      await this.checkAndFinalizeExecution(executionId);
    }
  }

  /**
   * Handle command acknowledgment from worker
   * - Updates step with received message ID
   */
  async handleCommandAck(
    id: string,
    stepIndex: number,
    messageId: string
  ): Promise<void> {
    this.logger.debug(
      `Command acknowledged for execution ${id}, step ${stepIndex}: ${messageId}`
    );

    await this.executionService.updateExecutionStep(id, stepIndex, {
      receivedMessageId: messageId,
    });
  }

  /**
   * Handle command result from worker
   * - Updates step status and result
   * - Processes next ready steps
   */
  async handleCommandResult(
    id: string,
    stepIndex: number,
    result: {
      success: boolean;
      data?: any;
      error?: { code: string; message: string; details?: any };
      progress?: number;
    }
  ): Promise<void> {
    this.logger.log(
      `Command result received for execution ${id}, step ${stepIndex}: ` +
      `success=${result.success}`
    );

    // Update step based on result
    if (result.success) {
      await this.executionService.updateExecutionStep(id, stepIndex, {
        status: 'completed',
        progress: 100,
        result: result.data,
      });

      this.logger.log(`Step ${stepIndex} completed for execution ${id}`);

      // Process next ready steps
      setImmediate(() => this.processReadySteps(id));
    } else {
      await this.executionService.updateExecutionStep(id, stepIndex, {
        status: 'failed',
        error: result.error || {
          code: 'UNKNOWN_ERROR',
          message: 'Command failed with unknown error',
        },
      });

      this.logger.error(
        `Step ${stepIndex} failed for execution ${id}: ${result.error?.message}`
      );

      // Check if execution should fail
      await this.checkAndFinalizeExecution(id);
    }
  }

  /**
   * Handle progress update from worker
   * - Updates step progress
   */
  async handleProgressUpdate(
    id: string,
    stepIndex: number,
    progress: number
  ): Promise<void> {
    this.logger.debug(
      `Progress update for execution ${id}, step ${stepIndex}: ${progress}%`
    );

    await this.executionService.updateExecutionStep(id, stepIndex, {
      progress,
    });
  }

  /**
   * Check if execution is complete and finalize
   * - Determines if all steps are done
   * - Sets final execution status (completed/failed)
   */
  async checkAndFinalizeExecution(id: string): Promise<void> {
    const { Types } = await import('mongoose');
    const execution = await this.executionService.findById(new Types.ObjectId(id) as any, {} as any);

    if (!execution) {
      this.logger.warn(`Execution ${id} not found, skipping finalization`);
      return;
    }

    // Skip if already finalized
    if (['completed', 'failed', 'cancelled', 'timeout'].includes(execution.status)) {
      return;
    }

    // Check if execution is complete
    if (this.executionService.isExecutionComplete(execution)) {
      // Check if execution has failed
      const hasFailed = this.executionService.hasExecutionFailed(execution);

      if (hasFailed) {
        // Mark as failed
        await this.executionService.updateExecutionStatus(
          id,
          'failed',
          execution.progress,
          undefined,
          {
            code: 'EXECUTION_FAILED',
            message: 'One or more required steps failed',
          }
        );

        this.logger.warn(`Execution ${id} failed`);
      } else {
        // Mark as completed
        await this.executionService.updateExecutionStatus(
          id,
          'completed',
          100,
          {
            completedSteps: execution.steps.filter((s) => s.status === 'completed').length,
            totalSteps: execution.steps.length,
            skippedSteps: execution.steps.filter((s) => s.status === 'skipped').length,
          }
        );

        this.logger.log(`Execution ${id} completed successfully`);
      }
    }
  }

  /**
   * Handle execution timeout
   * - Called by ExecutionTimeoutMonitor
   * - Marks execution and running steps as timeout
   */
  async handleExecutionTimeout(id: string): Promise<void> {
    const { Types } = await import('mongoose');
    const execution = await this.executionService.findById(new Types.ObjectId(id) as any, {} as any);

    if (!execution) {
      this.logger.warn(`Execution ${id} not found, skipping timeout handling`);
      return;
    }

    // Skip if already finalized
    if (['completed', 'failed', 'cancelled', 'timeout'].includes(execution.status)) {
      return;
    }

    this.logger.warn(`Execution ${id} timed out`);

    // Mark all running/pending steps as skipped
    for (const step of execution.steps) {
      if (['pending', 'running'].includes(step.status)) {
        await this.executionService.updateExecutionStep(
          id,
          step.index,
          {
            status: 'skipped',
            error: {
              code: 'TIMEOUT',
              message: 'Execution timed out',
            },
          }
        );
      }
    }

    // Mark execution as timeout
    await this.executionService.updateExecutionStatus(
      id,
      'timeout',
      execution.progress,
      undefined,
      {
        code: 'EXECUTION_TIMEOUT',
        message: `Execution timed out after ${execution.timeoutSeconds} seconds`,
      }
    );
  }

  /**
   * Resume execution after retry
   * - Similar to startExecution but for retried executions
   */
  async resumeExecution(id: string): Promise<Execution> {
    const { Types } = await import('mongoose');
    const execution = await this.executionService.findById(new Types.ObjectId(id) as any, {} as any);

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    // Update status to running
    const updated = await this.executionService.updateExecutionStatus(
      id,
      'running',
      execution.progress
    );

    if (!updated) {
      throw new NotFoundException(`Failed to update execution ${id}`);
    }

    this.logger.log(`Execution ${id} resumed (retry attempt ${execution.retryCount})`);

    // Process ready steps asynchronously
    setImmediate(() => this.processReadySteps(id));

    return updated;
  }
}
