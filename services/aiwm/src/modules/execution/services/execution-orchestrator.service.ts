import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, HydratedDocument } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Handlebars from 'handlebars';
import Ajv from 'ajv';
import { Execution, ExecutionStep, ExecutionErrorType } from '../execution.schema';
import { WORKFLOW_EXECUTION_EVENTS } from '../queues/queue.constants';

/**
 * ExecutionOrchestratorService
 * Core orchestration logic for workflow execution
 * Handles:
 * - Step sequencing based on dependencies
 * - Parallel execution of independent steps
 * - LLM step execution via deployments
 * - Input/output validation
 * - Error handling and retry logic
 */
@Injectable()
export class ExecutionOrchestratorService {
  private readonly logger = new Logger(ExecutionOrchestratorService.name);
  private readonly ajv: Ajv;

  constructor(
    @InjectModel(Execution.name) private executionModel: Model<Execution>,
    private readonly eventEmitter: EventEmitter2,
    // TODO: Phase 4 - Inject DeploymentService for LLM calls
    // private readonly deploymentService: DeploymentService,
  ) {
    this.ajv = new Ajv({ allErrors: true });
  }

  /**
   * Main entry point for workflow execution
   * Called by BullMQ worker
   * @param executionId - Unique execution ID
   */
  async executeWorkflow(executionId: string): Promise<void> {
    const execution = await this.executionModel.findOne({ executionId }).exec();

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    // Emit: workflow-execution:started
    this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STARTED, {
      executionId,
      workflowId: execution.workflowId?.toString(),
    });

    try {
      // Update status to running
      execution.status = 'running';
      execution.startedAt = new Date();
      await execution.save();

      // Process steps based on dependencies
      await this.processSteps(execution);

      // Calculate final result
      const result = this.calculateResult(execution);
      execution.result = result;
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.progress = 100;
      await execution.save();

      // Emit: workflow-execution:completed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.COMPLETED, {
        executionId,
        result,
      });

      this.logger.log(`Workflow execution ${executionId} completed successfully`);
    } catch (error) {
      await this.handleExecutionError(execution, error);

      // Emit: workflow-execution:failed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.FAILED, {
        executionId,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Process steps in dependency order with parallel execution
   * @param execution - Execution document
   */
  private async processSteps(execution: HydratedDocument<Execution>): Promise<void> {
    let pendingSteps = execution.steps.filter((s) => s.status === 'pending');

    while (pendingSteps.length > 0) {
      // Find steps that are ready to execute
      const readySteps = this.findReadySteps(execution);

      if (readySteps.length === 0) {
        // No steps ready = circular dependency or all remaining steps have failed dependencies
        this.logger.warn(
          `No ready steps found. Marking remaining ${pendingSteps.length} steps as skipped`
        );
        this.markRemainingAsSkipped(execution);
        break;
      }

      // Execute ready steps in parallel
      await Promise.all(readySteps.map((step) => this.executeStep(execution, step)));

      // Reload execution to get updated step statuses
      const updated = await this.executionModel.findOne({ executionId: execution.executionId }).exec();
      if (updated) {
        execution.steps = updated.steps;
      }

      // Update pending steps list
      pendingSteps = execution.steps.filter((s) => s.status === 'pending');
    }
  }

  /**
   * Find steps that are ready to execute (all dependencies completed)
   * @param execution - Execution document
   * @returns Array of ready steps
   */
  private findReadySteps(execution: HydratedDocument<Execution>): ExecutionStep[] {
    return execution.steps.filter((step) => {
      if (step.status !== 'pending') return false;

      // Check if all dependencies are completed
      return step.dependencies.every((depIndex) => {
        const depStep = execution.steps[depIndex];
        return depStep && depStep.status === 'completed';
      });
    });
  }

  /**
   * Execute a single step
   * @param execution - Execution document
   * @param step - Step to execute
   */
  private async executeStep(execution: HydratedDocument<Execution>, step: ExecutionStep): Promise<void> {
    const stepIndex = step.index;

    this.logger.log(`Executing step ${stepIndex}: ${step.name}`);

    // Emit: workflow-execution:step-started
    this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_STARTED, {
      executionId: execution.executionId,
      stepIndex,
      stepName: step.name,
    });

    try {
      // Update step status to running
      await this.executionModel.updateOne(
        { executionId: execution.executionId },
        {
          $set: {
            [`steps.${stepIndex}.status`]: 'running',
            [`steps.${stepIndex}.startedAt`]: new Date(),
          },
        }
      );

      // Build input from dependencies
      const input = this.buildStepInput(execution, step);

      // Validate input against schema
      if (step.llmConfig && execution.workflowSnapshot?.steps[stepIndex]?.inputSchema) {
        this.validateInput(input, execution.workflowSnapshot.steps[stepIndex].inputSchema);
      }

      // Execute based on type
      let output: any;
      if (step.type === 'llm') {
        output = await this.executeLLMStep(step, input);
      } else {
        throw new Error(`Unsupported step type: ${step.type}`);
      }

      // Validate output against schema
      if (step.llmConfig && execution.workflowSnapshot?.steps[stepIndex]?.outputSchema) {
        this.validateOutput(output, execution.workflowSnapshot.steps[stepIndex].outputSchema);
      }

      // Update step with result
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - (step.startedAt?.getTime() || Date.now());

      await this.executionModel.updateOne(
        { executionId: execution.executionId },
        {
          $set: {
            [`steps.${stepIndex}.status`]: 'completed',
            [`steps.${stepIndex}.progress`]: 100,
            [`steps.${stepIndex}.output`]: output,
            [`steps.${stepIndex}.completedAt`]: completedAt,
            [`steps.${stepIndex}.result`]: {
              success: true,
              tokensUsed: output.tokensUsed || 0,
            },
          },
        }
      );

      // Update execution progress
      await this.updateExecutionProgress(execution);

      // Emit: workflow-execution:step-completed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_COMPLETED, {
        executionId: execution.executionId,
        stepIndex,
        output,
      });

      this.logger.log(`Step ${stepIndex} completed in ${durationMs}ms`);
    } catch (error) {
      await this.handleStepError(execution, step, error);

      // Emit: workflow-execution:step-failed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_FAILED, {
        executionId: execution.executionId,
        stepIndex,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Build step input from dependencies
   * @param execution - Execution document
   * @param step - Current step
   * @returns Input data for step
   */
  private buildStepInput(execution: HydratedDocument<Execution>, step: ExecutionStep): any {
    if (step.dependencies.length === 0) {
      // First step: use workflow input
      return execution.input || {};
    } else if (step.dependencies.length === 1) {
      // Single dependency: use previous step output
      const prevStep = execution.steps[step.dependencies[0]];
      return prevStep.output || {};
    } else {
      // Multiple dependencies: combine outputs
      const inputs = step.dependencies.map((depIndex) => {
        return execution.steps[depIndex].output || {};
      });
      return { inputs }; // Wrap in object
    }
  }

  /**
   * Execute LLM step
   * @param step - Step to execute
   * @param input - Input data
   * @returns LLM output
   */
  private async executeLLMStep(step: ExecutionStep, input: any): Promise<any> {
    if (!step.llmConfig) {
      throw new Error('LLM config is missing for LLM step');
    }

    const { deploymentId, systemPrompt, userPromptTemplate, parameters } = step.llmConfig;

    // TODO: Phase 4 - Get deployment and call LLM
    // const deployment = await this.deploymentService.findById(deploymentId);
    // if (!deployment || deployment.status !== 'running') {
    //   throw new Error(`Deployment ${deploymentId} not found or not running`);
    // }

    // Build user prompt
    const userPrompt = this.buildUserPrompt(userPromptTemplate, input);

    // TODO: Phase 4 - Call LLM via deployment
    // For now, return mock response
    this.logger.warn(`TODO Phase 4: Call LLM via deployment ${deploymentId}`);
    this.logger.log(`System Prompt: ${systemPrompt.substring(0, 100)}...`);
    this.logger.log(`User Prompt: ${userPrompt.substring(0, 100)}...`);

    // Mock response
    return {
      content: `Mock LLM response for step with deployment ${deploymentId}`,
      tokensUsed: 150,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Build user prompt from template
   * @param template - Handlebars template string
   * @param input - Input data
   * @returns Rendered prompt
   */
  private buildUserPrompt(template: string | undefined, input: any): string {
    if (template) {
      // Use Handlebars to render template
      try {
        const compiledTemplate = Handlebars.compile(template);
        return compiledTemplate(input);
      } catch (error) {
        this.logger.error(`Handlebars template error: ${error.message}`);
        throw new Error(`Failed to render user prompt template: ${error.message}`);
      }
    } else {
      // Fallback: stringify input
      if (typeof input === 'string') {
        return input;
      } else {
        return JSON.stringify(input, null, 2);
      }
    }
  }

  /**
   * Validate input against JSON Schema
   * @param input - Input data
   * @param schema - JSON Schema
   */
  private validateInput(input: any, schema: any): void {
    const validate = this.ajv.compile(schema);
    const valid = validate(input);

    if (!valid) {
      const errors = validate.errors || [];
      this.logger.error(`Input validation failed: ${JSON.stringify(errors)}`);
      throw new BadRequestException({
        message: 'Input validation failed',
        type: ExecutionErrorType.VALIDATION_ERROR,
        errors,
      });
    }
  }

  /**
   * Validate output against JSON Schema
   * @param output - Output data
   * @param schema - JSON Schema
   */
  private validateOutput(output: any, schema: any): void {
    const validate = this.ajv.compile(schema);
    const valid = validate(output);

    if (!valid) {
      const errors = validate.errors || [];
      this.logger.error(`Output validation failed: ${JSON.stringify(errors)}`);
      throw new BadRequestException({
        message: 'Output validation failed',
        type: ExecutionErrorType.VALIDATION_ERROR,
        errors,
      });
    }
  }

  /**
   * Handle step error
   * @param execution - Execution document
   * @param step - Failed step
   * @param error - Error object
   */
  private async handleStepError(
    execution: HydratedDocument<Execution>,
    step: ExecutionStep,
    error: any
  ): Promise<void> {
    const stepIndex = step.index;
    const errorType = this.classifyError(error);

    this.logger.error(`Step ${stepIndex} failed: ${error.message}`);

    // Update step status to failed
    await this.executionModel.updateOne(
      { executionId: execution.executionId },
      {
        $set: {
          [`steps.${stepIndex}.status`]: 'failed',
          [`steps.${stepIndex}.completedAt`]: new Date(),
          [`steps.${stepIndex}.error`]: {
            type: errorType,
            message: error.message,
            code: error.code,
            details: error.details,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          },
        },
      }
    );

    // Mark dependent steps as skipped
    await this.markDependentStepsAsSkipped(execution, stepIndex);
  }

  /**
   * Handle execution error
   * @param execution - Execution document
   * @param error - Error object
   */
  private async handleExecutionError(execution: HydratedDocument<Execution>, error: any): Promise<void> {
    const errorType = this.classifyError(error);

    execution.status = 'failed';
    execution.completedAt = new Date();
    execution.error = {
      type: errorType,
      message: error.message,
      code: error.code,
      details: error.details,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date(),
    };

    await execution.save();

    this.logger.error(`Execution ${execution.executionId} failed: ${error.message}`);
  }

  /**
   * Mark dependent steps as skipped
   * @param execution - Execution document
   * @param failedStepIndex - Index of failed step
   */
  private async markDependentStepsAsSkipped(
    execution: HydratedDocument<Execution>,
    failedStepIndex: number
  ): Promise<void> {
    const updates: any = {};

    execution.steps.forEach((step, index) => {
      if (step.dependencies.includes(failedStepIndex) && step.status === 'pending') {
        updates[`steps.${index}.status`] = 'skipped';
      }
    });

    if (Object.keys(updates).length > 0) {
      await this.executionModel.updateOne(
        { executionId: execution.executionId },
        { $set: updates }
      );
    }
  }

  /**
   * Mark remaining pending steps as skipped
   * @param execution - Execution document
   */
  private markRemainingAsSkipped(execution: HydratedDocument<Execution>): void {
    execution.steps.forEach((step) => {
      if (step.status === 'pending') {
        step.status = 'skipped';
      }
    });
  }

  /**
   * Update execution progress percentage
   * @param execution - Execution document
   */
  private async updateExecutionProgress(execution: HydratedDocument<Execution>): Promise<void> {
    const totalSteps = execution.steps.length;
    if (totalSteps === 0) return;

    const completedSteps = execution.steps.filter(
      (s) => s.status === 'completed' || s.status === 'skipped'
    ).length;

    const progress = Math.round((completedSteps / totalSteps) * 100);

    await this.executionModel.updateOne(
      { executionId: execution.executionId },
      { $set: { progress } }
    );
  }

  /**
   * Calculate final execution result
   * @param execution - Execution document
   * @returns Result object
   */
  private calculateResult(execution: HydratedDocument<Execution>): any {
    const steps = execution.steps;
    const completedSteps = steps.filter((s) => s.status === 'completed');
    const failedSteps = steps.filter((s) => s.status === 'failed');
    const skippedSteps = steps.filter((s) => s.status === 'skipped');

    const totalTokens = completedSteps.reduce(
      (sum, step) => sum + (step.result?.tokensUsed || 0),
      0
    );

    const totalDurationMs = execution.completedAt && execution.startedAt
      ? execution.completedAt.getTime() - execution.startedAt.getTime()
      : 0;

    return {
      success: failedSteps.length === 0,
      summary: {
        stepsCompleted: completedSteps.length,
        stepsFailed: failedSteps.length,
        stepsSkipped: skippedSteps.length,
        totalTokensUsed: totalTokens,
        totalDurationMs,
      },
      finalOutput: this.getFinalOutput(execution),
    };
  }

  /**
   * Get final output from last completed step
   * @param execution - Execution document
   * @returns Final output
   */
  private getFinalOutput(execution: HydratedDocument<Execution>): any {
    const completedSteps = execution.steps
      .filter((s) => s.status === 'completed')
      .sort((a, b) => b.index - a.index);

    return completedSteps[0]?.output;
  }

  /**
   * Classify error type
   * @param error - Error object
   * @returns ExecutionErrorType
   */
  private classifyError(error: any): ExecutionErrorType {
    if (error.type) return error.type;

    if (error.message?.includes('validation')) {
      return ExecutionErrorType.VALIDATION_ERROR;
    }
    if (error.message?.includes('timeout')) {
      return ExecutionErrorType.TIMEOUT_ERROR;
    }
    if (error.message?.includes('dependency') || error.message?.includes('circular')) {
      return ExecutionErrorType.DEPENDENCY_ERROR;
    }
    if (error.message?.includes('config') || error.message?.includes('deployment')) {
      return ExecutionErrorType.CONFIGURATION_ERROR;
    }
    if (error.message?.includes('LLM') || error.message?.includes('API')) {
      return ExecutionErrorType.EXECUTION_ERROR;
    }

    return ExecutionErrorType.SYSTEM_ERROR;
  }
}
