import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Ajv from 'ajv';
import { Execution, ExecutionStep } from './execution.schema';
import {
  CreateExecutionDto,
  UpdateExecutionDto,
  UpdateExecutionStepDto,
  ExecutionQueryDto,
} from './execution.dto';
import { WorkflowService } from '../workflow/workflow.service';
import { WorkflowStepService } from '../workflow-step/workflow-step.service';
import { WorkflowExecutionQueue } from './queues/workflow-execution.queue';
import { WORKFLOW_EXECUTION_EVENTS } from './queues/queue.constants';
import { ExecutionOrchestratorService } from './services/execution-orchestrator.service';
import { Workflow } from '../workflow/workflow.schema';
import { WorkflowStep } from '../workflow-step/workflow-step.schema';

@Injectable()
export class ExecutionService extends BaseService<Execution> {
  protected readonly logger = new Logger(ExecutionService.name);
  private readonly ajv: Ajv;

  constructor(
    @InjectModel(Execution.name) private readonly executionModel: Model<Execution>,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<Workflow>,
    @InjectModel(WorkflowStep.name) private readonly workflowStepModel: Model<WorkflowStep>,
    private readonly workflowService: WorkflowService,
    private readonly workflowStepService: WorkflowStepService,
    private readonly workflowQueue: WorkflowExecutionQueue,
    private readonly eventEmitter: EventEmitter2,
    private readonly executionOrchestratorService: ExecutionOrchestratorService,
  ) {
    super(executionModel as any);
    this.ajv = new Ajv({ allErrors: true });
  }

  /**
   * Create a new execution
   */
  async createExecution(
    dto: CreateExecutionDto,
    context: RequestContext
  ): Promise<Execution> {
    // Calculate timeout deadline
    const timeoutAt = new Date(Date.now() + dto.timeoutSeconds * 1000);

    const execution = await super.create(
      {
        ...dto,
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

    this.logger.log(`Execution created: ${(execution as any)._id} - ${dto.name}`);

    return execution as Execution;
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
    id: string,
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
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .exec();

    if (execution) {
      this.logger.log(`Execution ${id} status updated: ${status}`);
    }

    return execution as Execution | null;
  }

  /**
   * Update execution step
   */
  async updateExecutionStep(
    id: string,
    stepIndex: number,
    dto: UpdateExecutionStepDto
  ): Promise<Execution | null> {
    const execution = await this.findById(new Types.ObjectId(id) as any, {} as RequestContext);

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    if (!execution.steps[stepIndex]) {
      throw new BadRequestException(`Step ${stepIndex} not found in execution ${id}`);
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
      .findByIdAndUpdate(
        id,
        { $set: { steps: execution.steps } },
        { new: true }
      )
      .exec();

    // Recalculate execution progress
    if (updated) {
      await this.recalculateProgress(id);
    }

    this.logger.log(`Step ${stepIndex} updated in execution ${id}: ${dto.status}`);

    return updated as Execution | null;
  }

  /**
   * Add message ID to tracking
   */
  async trackSentMessage(id: string, messageId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(
        id,
        { $push: { sentMessageIds: messageId } }
      )
      .exec();
  }

  async trackReceivedMessage(id: string, messageId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(
        id,
        { $push: { receivedMessageIds: messageId } }
      )
      .exec();
  }

  /**
   * Recalculate execution progress based on step progress
   */
  async recalculateProgress(id: string): Promise<void> {
    const execution = await this.findById(new Types.ObjectId(id) as any, {} as RequestContext);

    if (!execution || execution.steps.length === 0) return;

    // Calculate average progress of all steps
    const totalProgress = execution.steps.reduce((sum, step) => sum + step.progress, 0);
    const progress = Math.round(totalProgress / execution.steps.length);

    await this.model
      .findByIdAndUpdate(id, { $set: { progress } })
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
    id: string,
    reason?: string
  ): Promise<Execution | null> {
    const execution = await this.findById(new Types.ObjectId(id) as any, {} as RequestContext);

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
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
      .findByIdAndUpdate(
        id,
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

    this.logger.log(`Execution ${id} cancelled: ${reason}`);

    return updated as Execution | null;
  }

  /**
   * Retry execution
   */
  async retryExecution(
    id: string,
    resetSteps: boolean = false
  ): Promise<Execution | null> {
    const execution = await this.findById(new Types.ObjectId(id) as any, {} as RequestContext);

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
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
      .findByIdAndUpdate(id, update, { new: true })
      .exec();

    this.logger.log(
      `Execution ${id} retry attempt ${execution.retryCount + 1}`
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
  // WORKFLOW EXECUTION METHODS (Phase 3 - Refactored)
  // ============================================================================

  /**
   * Execute a complete workflow (async mode)
   * Creates execution record and pushes to BullMQ queue
   * Input must be object with stepId keys: { "<stepId>": { ...stepInput } }
   * @param workflowId - Workflow ID to execute
   * @param input - Input object with stepId keys
   * @param context - Request context
   * @returns Created execution
   */
  async executeWorkflow(
    workflowId: string,
    input: Record<string, any>,
    context: RequestContext
  ): Promise<Execution> {
    // 1. Get workflow and validate status
    const workflow = await this.workflowService.findById(new Types.ObjectId(workflowId) as any, context);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    // Allow draft workflows for testing, but log warning
    if (workflow.status !== 'active' && workflow.status !== 'draft') {
      throw new BadRequestException(`Workflow is ${workflow.status}. Only active or draft workflows can be executed.`);
    }

    // 2. Get workflow steps
    const steps = await this.workflowStepService.findByWorkflow(workflowId, context);
    if (steps.length === 0) {
      throw new BadRequestException('Workflow has no steps');
    }

    // 3. Detect layer 0 steps (orderIndex = 0, no dependencies)
    const layer0Steps = steps.filter(
      (step) => step.orderIndex === 0 && (!step.dependencies || step.dependencies.length === 0)
    );

    if (layer0Steps.length === 0) {
      throw new BadRequestException('Workflow has no layer 0 steps (steps with orderIndex=0 and no dependencies)');
    }

    // 4. Validate input: must have all layer 0 steps with correct input
    this.validateLayer0Input(input, layer0Steps);

    // 3. Create workflow snapshot with step IDs for input mapping
    const workflowSnapshot = {
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      steps: steps.map((step) => ({
        _id: (step as any)._id, // Include step ID for input mapping
        name: step.name,
        orderIndex: step.orderIndex,
        type: step.type,
        llmConfig: step.llmConfig,
        inputSchema: step.inputSchema,
        outputSchema: step.outputSchema,
        dependencies: step.dependencies,
      })),
    };

    // 4. Create execution steps
    const executionSteps: ExecutionStep[] = steps.map((step) => ({
      index: step.orderIndex,
      name: step.name,
      workflowStepId: (step as any)._id.toString(), // WorkflowStep._id for analytics
      status: 'pending',
      progress: 0,
      type: 'llm',
      llmConfig: step.llmConfig,
      dependencies: step.dependencies,
      dependsOn: [], // Not used for workflow steps
      optional: false,
    }));

    // 5. Create execution
    const execution = await this.model.create({
      name: `${workflow.name} - Execution`,
      type: 'workflow',
      workflowId: workflowId,
      workflowVersion: workflow.version,
      workflowSnapshot,
      input,
      steps: executionSteps,
      status: 'pending',
      progress: 0,
      timeoutSeconds: 3600, // Default 1 hour
      timeoutAt: new Date(Date.now() + 3600 * 1000),
      maxRetries: 0,
      retryCount: 0,
      retryAttempts: [],
      owner: {
        orgId: context.orgId,
        groupId: context.groupId || '',
        userId: context.userId,
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      createdBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      updatedBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
    });

    // 6. Push to BullMQ queue
    await this.workflowQueue.addExecutionJob((execution as any)._id.toString());

    // 7. Emit workflow-execution:triggered event
    this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.TRIGGERED, {
      executionId: (execution as any)._id.toString(),
      workflowId,
      triggeredBy: context.userId,
    });

    this.logger.log(`Workflow execution triggered: ${(execution as any)._id} for workflow ${workflowId}`);

    return execution as Execution;
  }

  /**
   * Get workflow execution status with detailed step information
   * @param id - Execution ID
   * @param context - Request context
   * @returns Execution status details
   */
  async getExecutionStatus(id: string, context: RequestContext): Promise<any> {
    const execution = await this.findById(new Types.ObjectId(id) as any, context);

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    // Verify ownership
    if (execution.owner.orgId !== context.orgId) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    return {
      executionId: (execution as any)._id.toString(),
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

  /**
   * Validate workflow input against JSON Schema
   * @param input - Input data to validate
   * @param schema - JSON Schema for validation
   * @param stepName - Name of the step (for error message)
   */
  private validateWorkflowInput(input: any, schema: any, stepName: string): void {
    // Special handling: if input is undefined and schema expects an object with required fields,
    // report the required fields instead of type error
    if ((input === undefined || input === null) && schema.type === 'object' && schema.required && schema.required.length > 0) {
      const missingFields = schema.required.map((field: string) => ({
        field,
        message: `Field '${field}' is required`,
        value: undefined,
      }));

      const errorMessage = missingFields.length === 1
        ? missingFields[0].message
        : `${missingFields.length} validation errors`;

      throw new BadRequestException({
        message: `Invalid workflow input for step "${stepName}": ${errorMessage}`,
        step: stepName,
        errors: missingFields,
      });
    }

    const validate = this.ajv.compile(schema);
    const valid = validate(input);

    if (!valid) {
      const errors = validate.errors || [];

      // Format errors for better readability
      const formattedErrors = errors.map((err) => {
        const field = err.instancePath ? err.instancePath.replace(/^\//, '') : 'input';
        const message = err.message || 'validation failed';

        // Build user-friendly error message
        if (err.keyword === 'required') {
          const missingField = err.params?.missingProperty;
          return {
            field: missingField,
            message: `Field '${missingField}' is required`,
            value: undefined,
          };
        } else if (err.keyword === 'type') {
          return {
            field,
            message: `Field '${field}' must be of type '${err.params?.type}'`,
            value: err.data,
          };
        } else if (err.keyword === 'minLength') {
          return {
            field,
            message: `Field '${field}' must be at least ${err.params?.limit} characters`,
            value: err.data,
          };
        } else {
          return {
            field,
            message: `Field '${field}' ${message}`,
            value: err.data,
          };
        }
      });

      this.logger.error(`Workflow input validation failed for step "${stepName}": ${JSON.stringify(formattedErrors)}`);

      // Throw with detailed error information
      const errorMessage = formattedErrors.length === 1
        ? formattedErrors[0].message
        : `${formattedErrors.length} validation errors`;

      throw new BadRequestException({
        message: `Invalid workflow input for step "${stepName}": ${errorMessage}`,
        step: stepName,
        errors: formattedErrors,
      });
    }
  }

  /**
   * Trigger workflow execution synchronously (sync mode or step testing)
   * @param workflowId - Workflow ID
   * @param input - Input data
   * @param context - Request context
   * @param stepId - Optional WorkflowStep._id for testing single step
   * @returns Execution result
   */
  async triggerWorkflowSync(
    workflowId: string,
    input: any,
    context: RequestContext,
    stepId?: string
  ): Promise<{
    executionId: string;
    status: string;
    message: string;
    output?: any;
    result?: any;
    error?: any;
  }> {
    const { Types } = await import('mongoose');

    // 1. Load workflow
    const workflow = await this.workflowModel
      .findById(new Types.ObjectId(workflowId))
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    // Verify ownership
    if (workflow.owner.orgId !== context.orgId) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    // Check workflow status
    if (workflow.status !== 'active') {
      throw new BadRequestException(`Workflow "${workflow.name}" is not active. Current status: ${workflow.status}`);
    }

    // 2. Load workflow steps
    const workflowSteps = await this.workflowStepModel
      .find({
        workflowId: workflowId,
        $or: [
          { isDeleted: false },
        ]
      })
      .sort({ orderIndex: 1 })
      .lean()
      .exec();

    this.logger.debug(`Found ${workflowSteps?.length || 0} workflow steps for workflow ${workflowId}`);

    if (!workflowSteps || workflowSteps.length === 0) {
      throw new BadRequestException(`Workflow "${workflow.name}" has no steps defined`);
    }

    // 3. Handle step testing mode
    if (stepId) {
      return await this.executeStepTest(stepId, workflowSteps, input, context, workflowId);
    }

    // 4. Sync mode - full workflow execution
    // 4.1 Validate input against first step
    const firstStep = workflowSteps[0];
    if (firstStep.inputSchema) {
      this.validateWorkflowInput(input, firstStep.inputSchema, firstStep.name);
    }

    // 4.2 Create execution record (similar to async mode)
    const executionSteps = workflowSteps.map((step, index) => ({
      index,
      name: step.name,
      description: step.description,
      status: 'pending',
      progress: 0,
      type: step.type,
      llmConfig: step.llmConfig,
      dependencies: step.dependencies || [],
    }));

    const execution = await this.executionModel.create({
      workflowId: new Types.ObjectId(workflowId),
      name: workflow.name,
      description: workflow.description,
      type: 'workflow',
      status: 'running',
      progress: 0,
      steps: executionSteps,
      input,
      timeoutSeconds: 3600, // Default 1 hour for sync execution
      owner: {
        orgId: context.orgId,
        userId: context.userId,
      },
      createdBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      updatedBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
    });

    const executionId = (execution as any)._id.toString();

    try {
      // 4.3 Execute workflow synchronously
      await this.executionOrchestratorService.executeWorkflow(executionId);

      // 4.4 Reload execution to get final result
      const completedExecution = await this.executionModel
        .findById(new Types.ObjectId(executionId))
        .lean()
        .exec();

      if (!completedExecution) {
        throw new Error('Execution not found after completion');
      }

      // 4.5 Return success response
      return {
        executionId,
        status: completedExecution.status,
        message: 'Workflow execution completed successfully',
        output: this.extractFinalOutput(completedExecution),
        result: completedExecution.result,
      };
    } catch (error: any) {
      this.logger.error(`Sync workflow execution failed: ${error.message}`);

      // Reload execution to get error details
      const failedExecution = await this.executionModel
        .findById(new Types.ObjectId(executionId))
        .lean()
        .exec();

      return {
        executionId,
        status: failedExecution?.status || 'failed',
        message: 'Workflow execution failed',
        error: {
          type: 'execution_error',
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          failedStepIndex: failedExecution?.steps.findIndex((s) => s.status === 'failed') ?? -1,
          details: failedExecution?.error || {},
        },
      };
    }
  }

  /**
   * Execute single step test
   * @param stepId - WorkflowStep._id
   * @param workflowSteps - All workflow steps
   * @param input - Input data
   * @param context - Request context
   * @param workflowId - Workflow ID
   * @returns Step execution result
   */
  private async executeStepTest(
    stepId: string,
    workflowSteps: any[],
    input: any,
    context: RequestContext,
    workflowId: string
  ): Promise<{
    executionId: string;
    status: string;
    message: string;
    output?: any;
  }> {
    const { Types } = await import('mongoose');

    // 1. Find step by _id
    const step = workflowSteps.find((s) => (s as any)._id.toString() === stepId);

    if (!step) {
      throw new NotFoundException(`Step ${stepId} not found in workflow`);
    }

    // 2. Validate input against step's inputSchema
    if (step.inputSchema) {
      this.validateWorkflowInput(input, step.inputSchema, step.name);
    }

    // 3. Create minimal execution record (optional - for tracking)
    const execution = await this.executionModel.create({
      workflowId: new Types.ObjectId(workflowId),
      name: `Test Step: ${step.name}`,
      description: `Testing step ${step.name}`,
      type: 'workflow',
      status: 'running',
      progress: 0,
      steps: [
        {
          index: 0,
          name: step.name,
          description: step.description,
          status: 'running',
          progress: 0,
          type: step.type,
          llmConfig: step.llmConfig,
          dependencies: [],
        },
      ],
      input,
      timeoutSeconds: 600, // 10 minutes for step testing
      owner: {
        orgId: context.orgId,
        userId: context.userId,
      },
      createdBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      updatedBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
    });

    const executionId = (execution as any)._id.toString();

    try {
      // 4. Execute step directly
      const executionStep = execution.steps[0];
      this.logger.debug(`Executing step test for step: ${step.name}`);
      this.logger.debug(`Step llmConfig: ${JSON.stringify(step.llmConfig)}`);
      this.logger.debug(`Execution step llmConfig: ${JSON.stringify(executionStep.llmConfig)}`);

      const output = await this.executionOrchestratorService['executeLLMStep'](
        executionStep,
        input
      );

      // 5. Update execution status
      await this.executionModel.updateOne(
        { _id: new Types.ObjectId(executionId) },
        {
          $set: {
            status: 'completed',
            progress: 100,
            'steps.0.status': 'completed',
            'steps.0.progress': 100,
            'steps.0.output': output,
            'steps.0.completedAt': new Date(),
            completedAt: new Date(),
          },
        }
      );

      // 6. Return step output
      return {
        executionId,
        status: 'completed',
        message: 'Step execution completed successfully',
        output,
      };
    } catch (error: any) {
      this.logger.error(`Step test failed: ${error.message}`);

      // Update execution to failed status
      await this.executionModel.updateOne(
        { _id: new Types.ObjectId(executionId) },
        {
          $set: {
            status: 'failed',
            'steps.0.status': 'failed',
            'steps.0.error': {
              code: error.code || 'UNKNOWN_ERROR',
              message: error.message,
            },
            error: {
              code: error.code || 'UNKNOWN_ERROR',
              message: error.message,
            },
          },
        }
      );

      throw error;
    }
  }

  /**
   * Extract final output from execution
   * @param execution - Execution document
   * @returns Final output
   */
  private extractFinalOutput(execution: any): any {
    const completedSteps = execution.steps.filter((s: any) => s.status === 'completed');
    if (completedSteps.length === 0) {
      return null;
    }

    // Return output from last completed step
    const lastStep = completedSteps[completedSteps.length - 1];
    return lastStep.output || null;
  }

  /**
   * Get workflow input schema for UI rendering
   * Returns metadata about required inputs for workflow execution
   * @param workflowId - Workflow ID
   * @param context - Request context
   * @returns Workflow input schema metadata
   */
  async getWorkflowInputSchema(
    workflowId: string,
    context: RequestContext
  ): Promise<{
    workflowId: string;
    workflowName: string;
    description?: string;
    requiredInputs: Array<{
      stepId: string;
      stepName: string;
      description?: string;
      orderIndex: number;
      inputSchema: any;
      isRequired: boolean;
    }>;
  }> {
    // 1. Get workflow
    const workflow = await this.workflowService.findById(new Types.ObjectId(workflowId) as any, context);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    // 2. Get workflow steps
    const steps = await this.workflowStepService.findByWorkflow(workflowId, context);
    if (steps.length === 0) {
      throw new BadRequestException('Workflow has no steps');
    }

    // 3. Detect layer 0 steps (orderIndex = 0, no dependencies)
    const layer0Steps = steps.filter(
      (step) => step.orderIndex === 0 && (!step.dependencies || step.dependencies.length === 0)
    );

    if (layer0Steps.length === 0) {
      throw new BadRequestException('Workflow has no layer 0 steps (steps with orderIndex=0 and no dependencies)');
    }

    // 4. Build required inputs metadata
    const requiredInputs = layer0Steps.map((step) => ({
      stepId: (step as any)._id.toString(),
      stepName: step.name,
      description: step.description,
      orderIndex: step.orderIndex,
      inputSchema: step.inputSchema || {},
      isRequired: true, // All layer 0 steps are required
    }));

    // 5. Sort by orderIndex (though they should all be 0, but just in case)
    requiredInputs.sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      workflowId: workflowId,
      workflowName: workflow.name,
      description: workflow.description,
      requiredInputs,
    };
  }

  /**
   * Validate layer 0 input
   * Input must be object with stepId keys: { "<stepId>": { ...stepInput } }
   * All layer 0 steps must have corresponding input with valid schema
   * @param input - Input object with stepId keys
   * @param layer0Steps - Array of layer 0 WorkflowStep
   */
  private validateLayer0Input(input: Record<string, any>, layer0Steps: WorkflowStep[]): void {
    // 1. Input must be an object
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new BadRequestException({
        message: 'Input must be an object with stepId keys',
        expectedFormat: '{ "<stepId>": { ...stepInput }, ... }',
        received: typeof input,
      });
    }

    // 2. Create map of valid step IDs
    const stepIdMap = new Map<string, WorkflowStep>();
    layer0Steps.forEach(step => {
      stepIdMap.set((step as any)._id.toString(), step);
    });

    const validStepIds = Array.from(stepIdMap.keys());
    const providedStepIds = Object.keys(input);

    // 3. Check for invalid stepIds in input
    const invalidStepIds = providedStepIds.filter(id => !stepIdMap.has(id));
    if (invalidStepIds.length > 0) {
      throw new BadRequestException({
        message: `Input contains invalid stepIds: ${invalidStepIds.join(', ')}`,
        invalidStepIds,
        validStepIds,
      });
    }

    // 4. Check for missing layer 0 steps
    const missingStepIds = validStepIds.filter(id => !providedStepIds.includes(id));
    if (missingStepIds.length > 0) {
      const missingSteps = missingStepIds.map(id => {
        const step = stepIdMap.get(id)!;
        return {
          stepId: id,
          stepName: step.name,
          orderIndex: step.orderIndex,
        };
      });

      throw new BadRequestException({
        message: `Missing input for ${missingSteps.length} layer 0 step(s)`,
        missingSteps,
        hint: 'All layer 0 steps must have corresponding input',
      });
    }

    // 5. Validate each step's input against its inputSchema
    const validationErrors: any[] = [];

    for (const [stepId, stepInput] of Object.entries(input)) {
      const step = stepIdMap.get(stepId)!;

      if (step.inputSchema) {
        try {
          this.validateWorkflowInput(stepInput, step.inputSchema, step.name);
        } catch (error: any) {
          validationErrors.push({
            stepId,
            stepName: step.name,
            error: error.response || error.message,
          });
        }
      }
    }

    // 6. If there are validation errors, throw aggregated error
    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: `Input validation failed for ${validationErrors.length} step(s)`,
        validationErrors,
      });
    }
  }

  /**
   * Execute workflow synchronously (sync mode)
   * Waits for workflow execution to complete and returns result
   * Input must be object with stepId keys: { "<stepId>": { ...stepInput } }
   * @param workflowId - Workflow ID to execute
   * @param input - Input object with stepId keys
   * @param context - Request context
   * @returns Execution result
   */
  async executeWorkflowSync(
    workflowId: string,
    input: Record<string, any>,
    context: RequestContext
  ): Promise<{
    executionId: string;
    status: string;
    message: string;
    output?: any;
    result?: any;
    error?: any;
  }> {
    // 1. Get workflow and validate status
    const workflow = await this.workflowService.findById(new Types.ObjectId(workflowId) as any, context);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    // Allow draft workflows for testing, but log warning
    if (workflow.status !== 'active' && workflow.status !== 'draft') {
      throw new BadRequestException(`Workflow is ${workflow.status}. Only active or draft workflows can be executed.`);
    }

    // 2. Get workflow steps
    const steps = await this.workflowStepService.findByWorkflow(workflowId, context);
    if (steps.length === 0) {
      throw new BadRequestException('Workflow has no steps');
    }

    // 3. Detect layer 0 steps (orderIndex = 0, no dependencies)
    const layer0Steps = steps.filter(
      (step) => step.orderIndex === 0 && (!step.dependencies || step.dependencies.length === 0)
    );

    if (layer0Steps.length === 0) {
      throw new BadRequestException('Workflow has no layer 0 steps (steps with orderIndex=0 and no dependencies)');
    }

    // 4. Validate input: must have all layer 0 steps with correct input
    this.validateLayer0Input(input, layer0Steps);

    // 5. Create workflow snapshot with step IDs for input mapping
    const workflowSnapshot = {
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      steps: steps.map((step) => ({
        _id: (step as any)._id, // Include step ID for input mapping
        name: step.name,
        orderIndex: step.orderIndex,
        type: step.type,
        llmConfig: step.llmConfig,
        inputSchema: step.inputSchema,
        outputSchema: step.outputSchema,
        dependencies: step.dependencies,
      })),
    };

    // 6. Create execution steps
    const executionSteps: ExecutionStep[] = steps.map((step) => ({
      index: step.orderIndex,
      name: step.name,
      workflowStepId: (step as any)._id.toString(), // WorkflowStep._id for analytics
      status: 'pending',
      progress: 0,
      type: 'llm',
      llmConfig: step.llmConfig,
      dependencies: step.dependencies,
      dependsOn: [], // Not used for workflow steps
      optional: false,
    }));

    // 7. Create execution
    const execution = await this.model.create({
      name: `${workflow.name} - Sync Execution`,
      type: 'workflow',
      workflowId: workflowId,
      workflowVersion: workflow.version,
      workflowSnapshot,
      input,
      steps: executionSteps,
      status: 'running',
      progress: 0,
      startedAt: new Date(),
      timeoutSeconds: 3600, // Default 1 hour
      timeoutAt: new Date(Date.now() + 3600 * 1000),
      maxRetries: 0,
      retryCount: 0,
      retryAttempts: [],
      owner: {
        orgId: context.orgId,
        groupId: context.groupId || '',
        userId: context.userId,
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      createdBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      updatedBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
    });

    const executionId = (execution as any)._id.toString();

    try {
      // 8. Execute workflow synchronously
      await this.executionOrchestratorService.executeWorkflow(executionId);

      // 9. Reload execution to get final result
      const completedExecution = await this.model
        .findById(new Types.ObjectId(executionId))
        .lean()
        .exec();

      if (!completedExecution) {
        throw new Error('Execution not found after completion');
      }

      // 10. Return success response
      return {
        executionId,
        status: completedExecution.status,
        message: 'Workflow execution completed successfully',
        output: this.extractFinalOutput(completedExecution),
        result: completedExecution.result,
      };
    } catch (error: any) {
      this.logger.error(`Sync workflow execution failed: ${error.message}`);

      // Reload execution to get error details
      const failedExecution = await this.model
        .findById(new Types.ObjectId(executionId))
        .lean()
        .exec();

      return {
        executionId,
        status: failedExecution?.status || 'failed',
        message: 'Workflow execution failed',
        error: {
          type: 'execution_error',
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          failedStepIndex: failedExecution?.steps.findIndex((s) => s.status === 'failed') ?? -1,
          details: failedExecution?.error || {},
        },
      };
    }
  }

  /**
   * Test a single workflow step
   * Always executes synchronously for immediate feedback
   * @param workflowId - Workflow ID
   * @param stepId - WorkflowStep._id to test
   * @param input - Input data for the step (direct input, not wrapped in stepId)
   * @param context - Request context
   * @returns Step execution result
   */
  async testWorkflowStep(
    workflowId: string,
    stepId: string,
    input: any,
    context: RequestContext
  ): Promise<{
    executionId: string;
    status: string;
    message: string;
    output?: any;
    result?: any;
    error?: any;
  }> {
    // 1. Get workflow
    const workflow = await this.workflowService.findById(new Types.ObjectId(workflowId) as any, context);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    // 2. Get all workflow steps
    const steps = await this.workflowStepService.findByWorkflow(workflowId, context);
    if (steps.length === 0) {
      throw new BadRequestException('Workflow has no steps');
    }

    // 3. Find the specific step to test
    const step = steps.find((s) => (s as any)._id.toString() === stepId);
    if (!step) {
      throw new NotFoundException(`Step ${stepId} not found in workflow`);
    }

    // 4. Validate input against step's inputSchema
    if (step.inputSchema) {
      this.validateWorkflowInput(input, step.inputSchema, step.name);
    }

    // 5. Create minimal execution record for tracking
    const execution = await this.model.create({
      name: `Test Step: ${step.name}`,
      description: `Testing step ${step.name}`,
      type: 'workflow',
      workflowId: workflowId,
      workflowVersion: workflow.version,
      input,
      steps: [
        {
          index: 0,
          name: step.name,
          description: step.description,
          workflowStepId: stepId, // WorkflowStep._id for analytics
          status: 'running',
          progress: 0,
          startedAt: new Date(),
          type: step.type,
          llmConfig: step.llmConfig,
          dependencies: [],
          dependsOn: [],
          optional: false,
        },
      ],
      status: 'running',
      progress: 0,
      startedAt: new Date(),
      timeoutSeconds: 600, // 10 minutes for step testing
      timeoutAt: new Date(Date.now() + 600 * 1000),
      maxRetries: 0,
      retryCount: 0,
      retryAttempts: [],
      owner: {
        orgId: context.orgId,
        groupId: context.groupId || '',
        userId: context.userId,
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      createdBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      updatedBy: {
        userId: context.userId,
        roles: context.roles,
        orgId: context.orgId,
        groupId: context.groupId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
    });

    const executionId = (execution as any)._id.toString();

    try {
      // 6. Execute step directly using orchestrator
      const executionStep = execution.steps[0];
      this.logger.debug(`Executing step test for step: ${step.name}`);
      this.logger.debug(`Step llmConfig: ${JSON.stringify(step.llmConfig)}`);

      const output = await this.executionOrchestratorService['executeLLMStep'](
        executionStep,
        input
      );

      // 7. Update execution to completed status
      await this.model.updateOne(
        { _id: new Types.ObjectId(executionId) },
        {
          $set: {
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
            'steps.0.status': 'completed',
            'steps.0.progress': 100,
            'steps.0.output': output,
            'steps.0.completedAt': new Date(),
          },
        }
      );

      // 8. Return success response
      return {
        executionId,
        status: 'completed',
        message: 'Step execution completed successfully',
        output,
        result: output,
      };
    } catch (error: any) {
      this.logger.error(`Step test failed: ${error.message}`);

      // Update execution to failed status
      await this.model.updateOne(
        { _id: new Types.ObjectId(executionId) },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            'steps.0.status': 'failed',
            'steps.0.completedAt': new Date(),
            'steps.0.error': {
              code: error.code || 'UNKNOWN_ERROR',
              message: error.message,
            },
            error: {
              code: error.code || 'UNKNOWN_ERROR',
              message: error.message,
            },
          },
        }
      );

      return {
        executionId,
        status: 'failed',
        message: 'Step execution failed',
        error: {
          type: 'step_execution_error',
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          stepName: step.name,
          stepId,
        },
      };
    }
  }
}
