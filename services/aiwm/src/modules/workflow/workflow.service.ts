import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Workflow } from './workflow.schema';

/**
 * WorkflowService
 * Manages workflow template entities
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class WorkflowService extends BaseService<Workflow> {
  constructor(@InjectModel(Workflow.name) private workflowModel: Model<Workflow>) {
    super(workflowModel);
  }

  /**
   * Find workflows by status
   * @param status - Workflow status (draft, active, archived)
   * @param context - Request context
   * @returns Array of workflows
   */
  async findByStatus(status: string, context: RequestContext): Promise<Workflow[]> {
    return this.workflowModel
      .find({
        status,
        'owner.orgId': context.orgId,
        isDeleted: false,
      })
      .exec();
  }

  /**
   * Activate workflow (change status from draft to active)
   * @param id - Workflow ID
   * @param context - Request context
   * @returns Updated workflow
   */
  async activate(id: ObjectId, context: RequestContext): Promise<Partial<Workflow>> {
    // TODO: Validate workflow has at least 1 step before activating
    return this.update(id, { status: 'active' }, context);
  }

  /**
   * Archive workflow (change status to archived)
   * @param id - Workflow ID
   * @param context - Request context
   * @returns Updated workflow
   */
  async archive(id: ObjectId, context: RequestContext): Promise<Partial<Workflow>> {
    return this.update(id, { status: 'archived' }, context);
  }
}
