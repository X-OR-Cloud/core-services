import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Execution, ExecutionStep } from './execution.schema';
import {
  CreateExecutionDto,
  UpdateExecutionDto,
  UpdateExecutionStepDto,
  ExecutionQueryDto,
} from './execution.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ExecutionService extends BaseService<Execution> {
  protected readonly logger = new Logger(ExecutionService.name);

  constructor(
    @InjectModel(Execution.name) executionModel: Model<Execution>,
    // TODO: Phase 4 - Inject dependencies for workflow execution
    // private readonly workflowService: WorkflowService,
    // private readonly workflowStepService: WorkflowStepService,
    // private readonly workflowQueue: WorkflowExecutionQueue,
    // private readonly eventEmitter: EventEmitter2,
  ) {
    super(executionModel as any);
  }

  /**
   * Create a new execution
   */
  async createExecution(
    dto: CreateExecutionDto,
    context: RequestContext
  ): Promise<Execution> {
    const executionId = uuidv4();

    // Calculate timeout deadline
    const timeoutAt = new Date(Date.now() + dto.timeoutSeconds * 1000);

    const execution = await super.create(
      {
        ...dto,
        executionId,
        status: 'pending',
        progress: 0,
        timeoutAt,
        maxRetries: dto.maxRetries || 3,
        steps: dto.steps.map((step, index) => ({
          ...step,
          index,
          status: 'pending',
          progress: 0,
          dependsOn: step.dependsOn || [],
          optional: step.optional || false,
        })),
      } as any,
      context
    );

    this.logger.log(`Execution created: ${executionId} - ${dto.name}`);

    return execution as Execution;
  }

  /**
   * Find execution by executionId
   */
  async findByExecutionId(executionId: string): Promise<Execution | null> {
    return await this.model.findOne({ executionId }).exec();
  }

  /**
   * Query executions with filters
   */
  async queryExecutions(query: ExecutionQueryDto): Promise<{
    data: Execution[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter: any = {};

    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.type) filter.type = query.type;
    if (query.resourceType) filter.resourceType = query.resourceType;
    if (query.resourceId) filter.resourceId = query.resourceId;
    if (query.nodeId) filter.nodeId = query.nodeId;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { data: data as Execution[], total, page, limit };
  }

  /**
   * Update execution status and progress
   */
  async updateExecutionStatus(
    executionId: string,
    status: string,
    progress?: number,
    result?: any,
    error?: any
  ): Promise<Execution | null> {
    const update: any = { status };

    if (progress !== undefined) update.progress = progress;
    if (result) update.result = result;
    if (error) update.error = error;

    // Set timestamps based on status
    if (status === 'running' && !update.startedAt) {
      update.startedAt = new Date();
    }

    if (['completed', 'failed', 'cancelled', 'timeout'].includes(status)) {
      update.completedAt = new Date();
    }

    const execution = await this.model
      .findOneAndUpdate({ executionId }, { $set: update }, { new: true })
      .exec();

    if (execution) {
      this.logger.log(`Execution ${executionId} status updated: ${status}`);
    }

    return execution as Execution | null;
  }

  /**
   * Update execution step
   */
  async updateExecutionStep(
    executionId: string,
    stepIndex: number,
    dto: UpdateExecutionStepDto
  ): Promise<Execution | null> {
    const execution = await this.findByExecutionId(executionId);

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (!execution.steps[stepIndex]) {
      throw new BadRequestException(`Step ${stepIndex} not found in execution ${executionId}`);
    }

    // Update step fields
    const step = execution.steps[stepIndex];

    if (dto.status) {
      step.status = dto.status;

      // Set timestamps
      if (dto.status === 'running' && !step.startedAt) {
        step.startedAt = new Date();
      }
      if (['completed', 'failed', 'skipped'].includes(dto.status)) {
        step.completedAt = new Date();
      }
    }

    if (dto.progress !== undefined) step.progress = dto.progress;
    if (dto.result) step.result = dto.result;
    if (dto.error) step.error = dto.error;
    if (dto.sentMessageId) step.sentMessageId = dto.sentMessageId;
    if (dto.receivedMessageId) step.receivedMessageId = dto.receivedMessageId;

    // Save execution
    const updated = await this.model
      .findOneAndUpdate(
        { executionId },
        { $set: { steps: execution.steps } },
        { new: true }
      )
      .exec();

    // Recalculate execution progress
    if (updated) {
      await this.recalculateProgress(executionId);
    }

    this.logger.log(`Step ${stepIndex} updated in execution ${executionId}: ${dto.status}`);

    return updated as Execution | null;
  }

  /**
   * Add message ID to tracking
   */
  async trackSentMessage(executionId: string, messageId: string): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { executionId },
        { $push: { sentMessageIds: messageId } }
      )
      .exec();
  }

  async trackReceivedMessage(executionId: string, messageId: string): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { executionId },
        { $push: { receivedMessageIds: messageId } }
      )
      .exec();
  }

  /**
   * Recalculate execution progress based on step progress
   */
  async recalculateProgress(executionId: string): Promise<void> {
    const execution = await this.findByExecutionId(executionId);

    if (!execution || execution.steps.length === 0) return;

    // Calculate average progress of all steps
    const totalProgress = execution.steps.reduce((sum, step) => sum + step.progress, 0);
    const progress = Math.round(totalProgress / execution.steps.length);

    await this.model
      .findOneAndUpdate({ executionId }, { $set: { progress } })
      .exec();
  }

  /**
   * Check if all step dependencies are satisfied
   */
  canExecuteStep(execution: Execution, stepIndex: number): boolean {
    const step = execution.steps[stepIndex];

    if (!step) return false;

    // Check if all dependencies are completed
    for (const depIndex of step.dependsOn) {
      const depStep = execution.steps[depIndex];

      if (!depStep) return false;

      // If dependency failed and is not optional, this step cannot execute
      if (depStep.status === 'failed' && !depStep.optional) {
        return false;
      }

      // Dependency must be completed or skipped (or failed if optional)
      if (depStep.status !== 'completed' && depStep.status !== 'skipped' && depStep.status !== 'failed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get ready steps (pending steps with satisfied dependencies)
   */
  getReadySteps(execution: Execution): ExecutionStep[] {
    return execution.steps.filter(
      (step) => step.status === 'pending' && this.canExecuteStep(execution, step.index)
    );
  }

  /**
   * Check if execution is complete
   */
  isExecutionComplete(execution: Execution): boolean {
    // All steps must be in final state (completed, failed, skipped)
    return execution.steps.every((step) =>
      ['completed', 'failed', 'skipped'].includes(step.status)
    );
  }

  /**
   * Check if execution has failed
   */
  hasExecutionFailed(execution: Execution): boolean {
    // Check if any required (non-optional) step has failed
    return execution.steps.some((step) => step.status === 'failed' && !step.optional);
  }

  /**
   * Cancel execution
   */
  async cancelExecution(
    executionId: string,
    reason?: string
  ): Promise<Execution | null> {
    const execution = await this.findByExecutionId(executionId);

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
      throw new BadRequestException(
        `Cannot cancel execution in ${execution.status} state`
      );
    }

    // Cancel all pending and running steps
    for (const step of execution.steps) {
      if (['pending', 'running'].includes(step.status)) {
        step.status = 'skipped';
      }
    }

    const updated = await this.model
      .findOneAndUpdate(
        { executionId },
        {
          $set: {
            status: 'cancelled',
            completedAt: new Date(),
            steps: execution.steps,
            error: {
              code: 'CANCELLED',
              message: reason || 'Execution cancelled by user',
            },
          },
        },
        { new: true }
      )
      .exec();

    this.logger.log(`Execution ${executionId} cancelled: ${reason}`);

    return updated as Execution | null;
  }

  /**
   * Retry execution
   */
  async retryExecution(
    executionId: string,
    resetSteps: boolean = false
  ): Promise<Execution | null> {
    const execution = await this.findByExecutionId(executionId);

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (!['failed', 'timeout'].includes(execution.status)) {
      throw new BadRequestException(
        `Cannot retry execution in ${execution.status} state`
      );
    }

    if (execution.retryCount >= execution.maxRetries) {
      throw new BadRequestException(
        `Maximum retry attempts (${execution.maxRetries}) reached`
      );
    }

    // Reset execution state
    const update: any = {
      status: 'pending',
      progress: 0,
      retryCount: execution.retryCount + 1,
      $push: { retryAttempts: new Date() },
      startedAt: null,
      completedAt: null,
      error: null,
    };

    // Reset steps if requested or reset failed steps
    if (resetSteps) {
      update.steps = execution.steps.map((step) => ({
        ...step,
        status: 'pending',
        progress: 0,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
        sentMessageId: undefined,
        receivedMessageId: undefined,
      }));
    } else {
      // Only reset failed steps
      update.steps = execution.steps.map((step) => {
        if (step.status === 'failed') {
          return {
            ...step,
            status: 'pending',
            progress: 0,
            startedAt: undefined,
            completedAt: undefined,
            error: undefined,
          };
        }
        return step;
      });
    }

    const updated = await this.model
      .findOneAndUpdate({ executionId }, update, { new: true })
      .exec();

    this.logger.log(
      `Execution ${executionId} retry attempt ${execution.retryCount + 1}`
    );

    return updated as Execution | null;
  }

  /**
   * Find executions that have timed out
   */
  async findTimedOutExecutions(): Promise<Execution[]> {
    const now = new Date();

    return (await this.model
      .find({
        status: 'running',
        timeoutAt: { $lte: now },
      })
      .exec()) as Execution[];
  }

  /**
   * Get execution statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
  }> {
    const [total, byStatus, byCategory] = await Promise.all([
      this.model.countDocuments().exec(),
      this.model.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      this.model.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]).exec(),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byCategory: byCategory.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    };
  }

  // ============================================================================
  // WORKFLOW EXECUTION METHODS (Phase 3)
  // ============================================================================

  /**
   * Trigger a workflow execution
   * Creates execution record and pushes to BullMQ queue
   * @param workflowId - Workflow ID to execute
   * @param input - Initial input data
   * @param context - Request context
   * @returns Created execution
   */
  async triggerWorkflow(
    workflowId: string,
    input: any,
    context: RequestContext
  ): Promise<Execution> {
    // TODO: Phase 4 - Implement full workflow trigger logic
    // 1. Get workflow and validate status
    // const workflow = await this.workflowService.findById(workflowId, context);
    // if (workflow.status !== 'active') {
    //   throw new BadRequestException('Workflow is not active');
    // }

    // 2. Get workflow steps
    // const steps = await this.workflowStepService.findByWorkflow(workflowId, context);
    // if (steps.length === 0) {
    //   throw new BadRequestException('Workflow has no steps');
    // }

    // 3. Create workflow snapshot
    // const workflowSnapshot = {
    //   name: workflow.name,
    //   description: workflow.description,
    //   version: workflow.version,
    //   steps: steps.map((step, index) => ({
    //     index,
    //     name: step.name,
    //     orderIndex: step.orderIndex,
    //     type: step.type,
    //     llmConfig: step.llmConfig,
    //     inputSchema: step.inputSchema,
    //     outputSchema: step.outputSchema,
    //     dependencies: step.dependencies,
    //   })),
    // };

    // 4. Create execution steps
    // const executionSteps: ExecutionStep[] = steps.map((step, index) => ({
    //   index,
    //   name: step.name,
    //   status: 'pending',
    //   progress: 0,
    //   type: 'llm',
    //   llmConfig: step.llmConfig,
    //   dependencies: step.dependencies,
    //   errorHandling: step.errorHandling,
    //   input: null,
    //   output: null,
    // }));

    // 5. Create execution
    const executionId = uuidv4();
    const execution = await this.model.create({
      executionId,
      name: `Workflow Execution - ${workflowId}`,
      executionType: 'workflow',
      workflowId: new Types.ObjectId(workflowId),
      // workflowVersion: workflow.version,
      // workflowSnapshot,
      input,
      // steps: executionSteps,
      steps: [], // TODO: Add actual steps in Phase 4
      status: 'pending',
      progress: 0,
      timeoutSeconds: 3600, // Default 1 hour
      owner: context,
      createdBy: context.userId,
      updatedBy: context.userId,
    });

    // 6. Emit workflow:triggered event
    // this.eventEmitter.emit(WORKFLOW_EVENTS.TRIGGERED, {
    //   workflowId,
    //   executionId: execution.executionId,
    //   triggeredBy: context.userId,
    // });

    // 7. Push to BullMQ queue
    // await this.workflowQueue.addExecutionJob(execution.executionId);

    // 8. Emit workflow-execution:queued event
    // this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.QUEUED, {
    //   executionId: execution.executionId,
    //   workflowId,
    // });

    this.logger.log(`Workflow execution triggered: ${execution.executionId}`);
    this.logger.warn(`TODO: Phase 4 - Complete triggerWorkflow() implementation`);

    return execution as Execution;
  }

  /**
   * Get workflow execution status with detailed step information
   * @param executionId - Execution ID
   * @param context - Request context
   * @returns Execution status details
   */
  async getExecutionStatus(executionId: string, context: RequestContext): Promise<any> {
    const execution = await this.findByExecutionId(executionId);

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    // Verify ownership
    if (execution.owner.orgId !== context.orgId) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    return {
      executionId: execution.executionId,
      workflowId: execution.workflowId?.toString(),
      name: execution.name,
      status: execution.status,
      progress: execution.progress,
      steps: execution.steps.map((step) => ({
        index: step.index,
        name: step.name,
        status: step.status,
        progress: step.progress,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        error: step.error,
      })),
      result: execution.result,
      error: execution.error,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      createdAt: execution.createdAt,
    };
  }
}
