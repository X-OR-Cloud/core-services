import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { WorkflowStep } from './workflow-step.schema';
import { WorkflowService } from '../workflow/workflow.service';
import { CreateWorkflowStepDto } from './workflow-step.dto';

/**
 * WorkflowStepService
 * Manages workflow step entities
 * Extends BaseService for automatic CRUD operations with additional workflow-specific methods
 */
@Injectable()
export class WorkflowStepService extends BaseService<WorkflowStep> {
  constructor(
    @InjectModel(WorkflowStep.name) private stepModel: Model<WorkflowStep>,
    private readonly workflowService: WorkflowService
  ) {
    super(stepModel);
  }

  /**
   * Find all steps for a specific workflow, sorted by orderIndex
   * @param workflowId - Workflow ID to get steps for
   * @param context - Request context
   * @returns Array of workflow steps
   */
  async findByWorkflow(workflowId: string, context: RequestContext): Promise<WorkflowStep[]> {
    // Verify workflow exists and user has access
    await this.workflowService.findById(new Types.ObjectId(workflowId) as any, context);
    const condition = {
        workflowId: workflowId,
        'owner.orgId': context.orgId,
        isDeleted: false ,
      };
    // Return steps sorted by orderIndex
    return this.stepModel
      .find(condition)
      .sort({ orderIndex: 1 })
      .exec();
  }

  /**
   * Validate that dependencies array references valid step indices
   * @param workflowId - Workflow ID to validate against
   * @param dependencies - Array of step indices
   * @param context - Request context for orgId filtering
   * @returns true if all dependencies are valid
   */
  async validateDependencies(
    workflowId: string,
    dependencies: number[],
    context: RequestContext
  ): Promise<boolean> {
    if (!dependencies || dependencies.length === 0) {
      return true; // Empty dependencies array is valid
    }

    const steps = await this.stepModel.find({
      workflowId: workflowId,
      'owner.orgId': context.orgId,
      isDeleted: false
    }).exec();

    // Get all existing orderIndex values
    const existingOrderIndices = steps.map(s => s.orderIndex).sort((a, b) => a - b);

    if (existingOrderIndices.length === 0) {
      throw new BadRequestException(
        `No existing steps found in workflow. Cannot create step with dependencies.`
      );
    }

    const maxOrderIndex = Math.max(...existingOrderIndices);

    // Check all dependencies reference valid orderIndex values
    for (const dep of dependencies) {
      if (dep < 0 || dep > maxOrderIndex) {
        throw new BadRequestException(
          `Invalid dependency orderIndex: ${dep}. Valid range is 0-${maxOrderIndex}. Existing orderIndices: ${existingOrderIndices.join(', ')}`
        );
      }

      // Verify the orderIndex actually exists
      if (!existingOrderIndices.includes(dep)) {
        throw new BadRequestException(
          `Dependency orderIndex ${dep} does not exist. Existing orderIndices: ${existingOrderIndices.join(', ')}`
        );
      }
    }

    return true;
  }

  /**
   * Validate that deployment exists and is accessible
   * @param deploymentId - Deployment ID to validate
   * @param orgId - Organization ID
   * @returns true if deployment is valid
   */
  async validateDeployment(deploymentId: string, orgId: string): Promise<boolean> {
    // TODO: Call DeploymentService to verify deployment exists and is active
    // For now, just validate the ID format
    if (!deploymentId || deploymentId.trim() === '') {
      throw new BadRequestException('deploymentId cannot be empty');
    }

    // In Phase 4, we'll integrate with DeploymentModule:
    // const deployment = await this.deploymentService.findById(deploymentId, context);
    // if (!deployment || deployment.status !== 'running') {
    //   throw new NotFoundException(`Deployment ${deploymentId} not found or not running`);
    // }

    return true;
  }

  /**
   * Override create method to validate workflow, deployment, and dependencies
   */
  async create(
    dto: CreateWorkflowStepDto,
    context: RequestContext
  ): Promise<WorkflowStep> {
    // 1. Validate workflow exists
    const workflow = await this.workflowService.findById(
      new Types.ObjectId(dto.workflowId) as any,
      context
    );

    if (!workflow) {
      throw new NotFoundException(`Workflow ${dto.workflowId} not found`);
    }

    // 2. Validate deployment exists
    await this.validateDeployment(dto.llmConfig.deploymentId, context.orgId);

    // 3. Validate dependencies (if provided)
    if (dto.dependencies && dto.dependencies.length > 0) {
      await this.validateDependencies(dto.workflowId, dto.dependencies, context);
    }

    // 4. Create step using parent method
    const result = await super.create(dto as any, context);
    return result as WorkflowStep;
  }

  /**
   * Reorder steps within a workflow
   * @param workflowId - Workflow ID
   * @param stepOrders - Array of {stepId, orderIndex} pairs
   * @param context - Request context
   */
  async reorder(
    workflowId: string,
    stepOrders: Array<{ stepId: string; orderIndex: number }>,
    context: RequestContext
  ): Promise<{ message: string; updated: number }> {
    // Validate workflow exists
    await this.workflowService.findById(new Types.ObjectId(workflowId) as any, context);

    let updated = 0;

    // Update each step's orderIndex
    for (const { stepId, orderIndex } of stepOrders) {
      const result = await this.update(
        new Types.ObjectId(stepId) as any,
        { orderIndex } as any,
        context
      );

      if (result) {
        updated++;
      }
    }

    return {
      message: `Successfully reordered ${updated} steps`,
      updated,
    };
  }

  /**
   * Delete all steps for a workflow (used when deleting workflow)
   * @param workflowId - Workflow ID
   * @param context - Request context
   */
  async deleteByWorkflow(workflowId: string, context: RequestContext): Promise<number> {
    const result = await this.stepModel.updateMany(
      {
        workflowId: new Types.ObjectId(workflowId),
        'owner.orgId': context.orgId,
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: context.userId,
        },
      }
    );

    return result.modifiedCount;
  }
}
