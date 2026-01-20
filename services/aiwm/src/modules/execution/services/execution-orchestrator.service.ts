import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, HydratedDocument } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Handlebars from 'handlebars';
import Ajv from 'ajv';
import axios from 'axios';
import { Execution, ExecutionStep, ExecutionErrorType } from '../execution.schema';
import { WORKFLOW_EXECUTION_EVENTS } from '../queues/queue.constants';
import { DeploymentService } from '../../deployment/deployment.service';
import { Deployment } from '../../deployment/deployment.schema';
import { Model as ModelEntity } from '../../model/model.schema';

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
    @InjectModel(Deployment.name) private deploymentModel: Model<Deployment>,
    @InjectModel(ModelEntity.name) private modelModel: Model<ModelEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly deploymentService: DeploymentService,
  ) {
    this.ajv = new Ajv({ allErrors: true });
  }

  /**
   * Main entry point for workflow execution
   * Called by BullMQ worker
   * @param id - Unique execution ID (_id)
   */
  async executeWorkflow(id: string): Promise<void> {
    const execution = await this.executionModel.findById(id).exec();

    if (!execution) {
      throw new Error(`Execution ${id} not found`);
    }

    // Emit: workflow-execution:started
    this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STARTED, {
      executionId: id,
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
        executionId: id,
        result,
      });

      this.logger.log(`Workflow execution ${id} completed successfully`);
    } catch (error) {
      await this.handleExecutionError(execution, error);

      // Emit: workflow-execution:failed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.FAILED, {
        executionId: id,
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
      const updated = await this.executionModel.findById((execution as any)._id).exec();
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

      // Check if all dependencies are completed (using step IDs)
      return step.dependencies.every((depStepId) => {
        const depStep = execution.steps.find(s => s.workflowStepId === depStepId);
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
      executionId: (execution as any)._id.toString(),
      stepIndex,
      stepName: step.name,
    });

    try {
      // Update step status to running
      await this.executionModel.updateOne(
        { _id: (execution as any)._id },
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
        output = await this.executeLLMStep(execution, step, input);
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
        { _id: (execution as any)._id },
        {
          $set: {
            [`steps.${stepIndex}.status`]: 'completed',
            [`steps.${stepIndex}.progress`]: 100,
            [`steps.${stepIndex}.output`]: output,
            [`steps.${stepIndex}.reasoning`]: output.reasoning || null, // Store reasoning for debugging
            [`steps.${stepIndex}.completedAt`]: completedAt,
            [`steps.${stepIndex}.result`]: {
              success: true,
              tokensUsed: output.tokensUsed || 0,
              inputTokens: output.inputTokens || 0,
              outputTokens: output.outputTokens || 0,
              cost: output.cost || 0,
              duration: output.duration || durationMs,
            },
          },
        }
      );

      // Update execution progress
      await this.updateExecutionProgress(execution);

      // Emit: workflow-execution:step-completed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_COMPLETED, {
        executionId: (execution as any)._id.toString(),
        stepIndex,
        output,
      });

      this.logger.log(`Step ${stepIndex} completed in ${durationMs}ms`);
    } catch (error) {
      await this.handleStepError(execution, step, error);

      // Emit: workflow-execution:step-failed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_FAILED, {
        executionId: (execution as any)._id.toString(),
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
      // Layer 0 step: extract input from workflow input using step's workflowStep ID
      // execution.input format: { "<stepId>": { ...stepInput }, ... }

      // Find the step in workflowSnapshot to get its _id
      const stepIndex = step.index;
      const workflowStep = execution.workflowSnapshot?.steps[stepIndex];

      if (!workflowStep) {
        this.logger.warn(`Workflow step not found in snapshot for step index ${stepIndex}, using execution.input directly`);
        return execution.input || {};
      }

      // If execution.input is an object with potential stepId keys
      if (execution.input && typeof execution.input === 'object' && !Array.isArray(execution.input)) {
        const inputKeys = Object.keys(execution.input);

        // Check if input follows new format (has ObjectId-like keys)
        const hasStepIdKeys = inputKeys.some(key => /^[0-9a-fA-F]{24}$/.test(key));

        if (hasStepIdKeys && (workflowStep as any)._id) {
          // New format: { "<stepId>": {...} }
          // Extract input using the step's _id from workflowSnapshot
          const stepIdString = (workflowStep as any)._id.toString();

          if (execution.input[stepIdString]) {
            this.logger.debug(`Found input for step ${stepIdString}: ${JSON.stringify(execution.input[stepIdString])}`);
            return execution.input[stepIdString];
          } else {
            this.logger.warn(`No input found for step ${stepIdString}, available keys: ${inputKeys.join(', ')}`);
            // Fallback: if single input, use it
            if (inputKeys.length === 1) {
              return execution.input[inputKeys[0]];
            }
            return {};
          }
        }
      }

      // Old format or fallback: use execution.input directly
      return execution.input || {};
    } else {
      // Has dependencies: merge outputs from all dependency steps
      // Hybrid approach: flat merge + trace metadata
      const mergedInput: Record<string, any> = {};
      const dependenciesTrace: Array<{ stepId: string; stepName: string; output: any }> = [];
      const conflicts: string[] = [];

      // Process each dependency in order
      for (const depStepId of step.dependencies) {
        // Find the dependency step by workflowStepId
        const depStep = execution.steps.find(s => s.workflowStepId === depStepId);

        if (!depStep) {
          this.logger.warn(`Dependency step with workflowStepId ${depStepId} not found for step ${step.name}`);
          continue;
        }

        // Extract content from output (assuming output = { content: {...}, tokensUsed, cost, ... })
        const depOutput = depStep.output?.content || depStep.output || {};

        // Track conflicts before merging
        for (const key of Object.keys(depOutput)) {
          if (key !== '_dependencies' && Object.prototype.hasOwnProperty.call(mergedInput, key)) {
            conflicts.push(`Property "${key}" overridden by step "${depStep.name}" (previous value from earlier dependency)`);
          }
        }

        // Merge into flat structure (later steps override earlier)
        Object.assign(mergedInput, depOutput);

        // Build trace metadata
        dependenciesTrace.push({
          stepId: depStep.workflowStepId,
          stepName: depStep.name,
          output: depOutput
        });
      }

      // Log conflicts if any
      if (conflicts.length > 0) {
        this.logger.warn(`Input merge conflicts detected for step "${step.name}":\n  - ${conflicts.join('\n  - ')}`);
      }

      // Add trace metadata
      mergedInput._dependencies = dependenciesTrace;

      this.logger.debug(`Built merged input for step "${step.name}" from ${step.dependencies.length} dependencies`);

      return mergedInput;
    }
  }

  /**
   * Execute LLM step with automatic outputSchema injection
   * @param execution - Execution document (can be null for standalone step testing)
   * @param step - Step to execute
   * @param input - Input data
   * @returns LLM output with content, tokensUsed, cost
   */
  private async executeLLMStep(
    execution: HydratedDocument<Execution> | null,
    step: ExecutionStep,
    input: any
  ): Promise<any> {
    if (!step.llmConfig) {
      throw new Error('LLM config is missing for LLM step');
    }

    const { deploymentId, systemPrompt, userPromptTemplate, parameters } = step.llmConfig;
    const stepIndex = step.index;

    // 1. Get deployment and validate
    const deployment = await this.deploymentModel
      .findById(deploymentId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} not found`);
    }

    if (deployment.status !== 'running') {
      throw new BadRequestException(
        `Deployment "${deployment.name}" is not running. Current status: ${deployment.status}`
      );
    }

    // 2. Get outputSchema and prepare context with schema injection (Hybrid approach)
    const outputSchema = this.getOutputSchemaForStep(execution, stepIndex);
    let finalSystemPrompt = systemPrompt || '';
    let contextForPrompts = { ...input };

    if (outputSchema) {
      const outputSchemaJson = JSON.stringify(outputSchema, null, 2);

      // Check if systemPrompt has {{outputSchema}} placeholder
      if (systemPrompt?.includes('{{outputSchema}}')) {
        // User explicitly wants to control placement - add to context for Handlebars
        this.logger.debug('Found {{outputSchema}} placeholder in systemPrompt - rendering with Handlebars');
        contextForPrompts = { ...input, outputSchema: outputSchemaJson };
        finalSystemPrompt = this.buildPromptFromTemplate(systemPrompt, contextForPrompts);
      } else {
        // Auto-inject at the end of systemPrompt
        this.logger.debug('No {{outputSchema}} placeholder found - auto-injecting at end of systemPrompt');
        finalSystemPrompt = systemPrompt
          ? `${systemPrompt}\n\nIMPORTANT: Your response must be valid JSON matching this exact schema:\n\`\`\`json\n${outputSchemaJson}\n\`\`\``
          : `Return valid JSON matching this schema:\n\`\`\`json\n${outputSchemaJson}\n\`\`\``;
      }
    }

    // 3. Build user prompt from template
    const userPrompt = this.buildUserPrompt(userPromptTemplate, contextForPrompts);

    this.logger.log(`Calling LLM via deployment ${deploymentId}`);
    this.logger.log(`System Prompt: ${finalSystemPrompt?.substring(0, 100) || 'None'}...`);
    this.logger.log(`User Prompt: ${userPrompt.substring(0, 100)}...`);
    this.logger.debug(`Deployment details: ${JSON.stringify({
      _id: (deployment as any)._id,
      name: deployment.name,
      resourceId: deployment.resourceId,
      nodeId: deployment.nodeId,
      status: deployment.status
    })}`);

    // 3. Get deployment endpoint
    const endpoint = await this.deploymentService.getDeploymentEndpoint(deploymentId);

    // 4. Get model for API-based deployments (for API key and model identifier)
    const model = await this.modelModel
      .findById(deployment.modelId)
      .where('isDeleted')
      .equals(false)
      .lean()
      .exec();

    if (!model) {
      throw new NotFoundException(`Model ${deployment.modelId} not found`);
    }

    // 5. Build request body (OpenAI-compatible format)
    const requestBody: any = {
      messages: [
        ...(finalSystemPrompt ? [{ role: 'system', content: finalSystemPrompt }] : []),
        { role: 'user', content: userPrompt },
      ],
      ...(parameters || {}), // temperature, max_tokens, etc. - must match provider format
    };

    // Add model identifier for API-based deployments
    if ((model as any).deploymentType === 'api-based' && (model as any).modelIdentifier) {
      requestBody.model = (model as any).modelIdentifier;
    }

    // 6. Build headers
    const headers: any = {
      'Content-Type': 'application/json',
    };

    // Add API key for API-based deployments
    if ((model as any).deploymentType === 'api-based' && (model as any).apiConfig?.apiKey) {
      headers['Authorization'] = `Bearer ${(model as any).apiConfig.apiKey}`;
    }

    try {
      const startTime = Date.now();

      this.logger.debug(`LLM request body: ${JSON.stringify(requestBody)}`);
      // 7. Call LLM endpoint
      const response = await axios.post(`${endpoint}/v1/chat/completions`, requestBody, {
        headers,
        timeout: 300000, // 5 minutes
      });


      const duration = Date.now() - startTime;

      // 8. Extract response data
      const responseData = response.data;
      const choice = responseData.choices?.[0];
      const message = choice?.message || {};

      // Handle thinking models (Kimi K2, o1, DeepSeek-R1) that return content in different fields
      // Priority: content > reasoning_content > reasoning
      const rawContent = message.content || message.reasoning_content || message.reasoning || '';

      // Extract reasoning/thinking process for debugging (thinking models only)
      const reasoning = message.reasoning || message.reasoning_content || null;

      // Fail if output was truncated due to max_tokens limit
      if (choice?.finish_reason === 'length') {
        this.logger.error(`LLM response truncated (finish_reason: length)`);
        throw new BadRequestException({
          message: 'LLM response truncated due to max_tokens limit',
          type: ExecutionErrorType.CONFIGURATION_ERROR,
          details: {
            finish_reason: 'length',
            suggestion: 'Increase max_tokens in llmConfig.parameters. Recommended: thinking models 4000-8000 tokens, standard models 2000-4000 tokens'
          }
        });
      }

      const usage = responseData.usage || {};
      const totalTokens = usage.total_tokens || 0;
      const inputTokens = usage.prompt_tokens || 0;
      const outputTokens = usage.completion_tokens || 0;

      // 9. Parse JSON from content (handle markdown wrappers)
      const parsedContent = this.extractAndParseJSON(rawContent);

      // 10. Calculate cost (placeholder - should be configurable per deployment)
      const cost = this.calculateCost(inputTokens, outputTokens, deployment);

      this.logger.log(
        `LLM call completed in ${duration}ms - Tokens: ${totalTokens} (in: ${inputTokens}, out: ${outputTokens})`
      );
      this.logger.debug(`LLM response data: ${JSON.stringify(responseData)}`);

      // 11. Return structured output with parsed content and reasoning
      return {
        content: parsedContent, // Parsed JSON if available, otherwise raw string
        reasoning, // Thinking process for debugging (null for standard models)
        tokensUsed: totalTokens,
        inputTokens,
        outputTokens,
        cost,
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`LLM call failed: ${error.message}`);

      // Classify error
      if (error.code === 'ECONNREFUSED') {
        throw new BadRequestException(
          `LLM deployment at ${endpoint} is unreachable. Please check deployment status.`
        );
      } else if (error.code === 'ETIMEDOUT') {
        throw new BadRequestException(
          `LLM call timed out after 5 minutes. Consider reducing input size or increasing timeout.`
        );
      } else if (error.response) {
        // LLM API returned error
        const status = error.response.status;
        const errorData = error.response.data;
        throw new BadRequestException(
          `LLM API error (${status}): ${errorData?.error?.message || error.message}`
        );
      } else {
        throw new BadRequestException(`LLM call failed: ${error.message}`);
      }
    }
  }

  /**
   * Calculate cost based on token usage
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @param _deployment - Deployment object (unused for now, reserved for future pricing config)
   * @returns Cost in USD (placeholder implementation)
   */
  private calculateCost(
    inputTokens: number,
    outputTokens: number,
    _deployment: any
  ): number {
    // TODO Phase 5: Get pricing from deployment config or model pricing table
    // For now, use placeholder pricing similar to GPT-3.5
    const inputCostPer1M = 0.5; // $0.50 per 1M input tokens
    const outputCostPer1M = 1.5; // $1.50 per 1M output tokens

    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;

    return inputCost + outputCost;
  }

  /**
   * Build prompt from template using Handlebars
   * @param template - Handlebars template string
   * @param context - Context data for template
   * @returns Rendered prompt
   */
  private buildPromptFromTemplate(template: string, context: any): string {
    try {
      const compiledTemplate = Handlebars.compile(template);
      return compiledTemplate(context);
    } catch (error) {
      this.logger.error(`Handlebars template error: ${error.message}`);
      throw new Error(`Failed to render prompt template: ${error.message}`);
    }
  }

  /**
   * Build user prompt from template
   * @param template - Handlebars template string
   * @param input - Input data
   * @returns Rendered prompt
   */
  private buildUserPrompt(template: string | undefined, input: any): string {
    if (template) {
      return this.buildPromptFromTemplate(template, input);
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
   * Get outputSchema for a step from workflowSnapshot
   * @param execution - Execution document
   * @param stepIndex - Step index
   * @returns Output schema or null
   */
  private getOutputSchemaForStep(
    execution: HydratedDocument<Execution> | null,
    stepIndex: number
  ): any | null {
    if (!execution?.workflowSnapshot?.steps?.[stepIndex]) {
      return null;
    }
    return execution.workflowSnapshot.steps[stepIndex].outputSchema || null;
  }

  /**
   * Extract and parse JSON from LLM response content
   * Handles responses with markdown code blocks (```json ... ```)
   * @param content - Raw LLM response content
   * @returns Parsed JSON object or original content if not JSON
   */
  private extractAndParseJSON(content: string): any {
    if (!content || typeof content !== 'string') {
      return content;
    }

    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      const jsonString = jsonMatch[1].trim();
      try {
        return JSON.parse(jsonString);
      } catch (error) {
        this.logger.warn(`Failed to parse JSON from markdown block: ${error.message}`);
      }
    }

    // Try to parse as direct JSON
    const trimmed = content.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        this.logger.debug(`Content looks like JSON but failed to parse: ${error.message}`);
      }
    }

    // Return original if not parseable
    return content;
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
      { _id: (execution as any)._id },
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

    // Update progress based on completed steps before failure
    await this.updateExecutionProgress(execution);

    // Calculate partial result (for completed steps before failure)
    const result = this.calculateResult(execution);
    execution.result = result;

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

    this.logger.error(`Execution ${(execution as any)._id} failed: ${error.message}`);
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
    const updates: Record<string, string> = {};

    // Get the workflowStepId of the failed step
    const failedStep = execution.steps[failedStepIndex];
    const failedStepId = failedStep?.workflowStepId;

    if (!failedStepId) {
      this.logger.warn(`Failed step at index ${failedStepIndex} has no workflowStepId, cannot mark dependent steps as skipped`);
      return;
    }

    execution.steps.forEach((step, index) => {
      // Check if this step depends on the failed step (by step ID)
      if (step.dependencies.includes(failedStepId) && step.status === 'pending') {
        updates[`steps.${index}.status`] = 'skipped';
      }
    });

    if (Object.keys(updates).length > 0) {
      await this.executionModel.updateOne(
        { _id: (execution as any)._id },
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
      { _id: (execution as any)._id },
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

    // Aggregate token usage
    const totalTokens = completedSteps.reduce(
      (sum, step) => sum + (step.result?.tokensUsed || 0),
      0
    );

    const totalInputTokens = completedSteps.reduce(
      (sum, step) => sum + (step.result?.inputTokens || 0),
      0
    );

    const totalOutputTokens = completedSteps.reduce(
      (sum, step) => sum + (step.result?.outputTokens || 0),
      0
    );

    // Aggregate cost
    const totalCost = completedSteps.reduce(
      (sum, step) => sum + (step.result?.cost || 0),
      0
    );

    // Calculate total duration from steps
    const totalDurationMs = completedSteps.reduce(
      (sum, step) => sum + (step.result?.duration || 0),
      0
    );

    return {
      success: failedSteps.length === 0,
      summary: {
        stepsCompleted: completedSteps.length,
        stepsFailed: failedSteps.length,
        stepsSkipped: skippedSteps.length,
        totalTokensUsed: totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCost,
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
