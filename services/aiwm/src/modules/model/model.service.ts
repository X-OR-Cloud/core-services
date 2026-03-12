import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, ModelInUseException } from '@hydrabyte/shared';
import { Model as ModelEntity } from './model.schema';
import { Deployment } from '../deployment/deployment.schema';

/**
 * ModelService
 * Manages model entities (self-hosted and API-based models)
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class ModelService extends BaseService<ModelEntity> {
  constructor(
    @InjectModel(ModelEntity.name) private modelModel: Model<ModelEntity>,
    @InjectModel(Deployment.name) private readonly deploymentModel: Model<Deployment>,
  ) {
    super(modelModel);
  }

  async findAll(
      options: FindManyOptions,
      context: RequestContext
    ): Promise<FindManyResult<ModelEntity>> {
      const findResult = await super.findAll(options, context);
      // Aggregate statistics by status
      const statusStats = await super.aggregate(
        [
          { $match: { ...options.filter } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ],
        context
      );

      // Build statistics object
      const statistics: any = {
        total: findResult.pagination.total,
        byStatus: {},
        byType: {},
      };

      // Map status statistics
      statusStats.forEach((stat: any) => {
        statistics.byStatus[stat._id] = stat.count;
      });

      findResult.statistics = statistics;
      return findResult;
    }

  /**
   * Override create method to set initial status based on deploymentType
   * - self-hosted models start with 'queued' (waiting for download)
   * - api-based models start with 'active' (ready immediately, no pre-validation)
   */
  async create(
    createData: Partial<ModelEntity>,
    context: RequestContext
  ): Promise<Partial<ModelEntity>> {
    // Set initial status based on deploymentType
    if (!createData.status) {
      if (createData.deploymentType === 'self-hosted') {
        createData.status = 'queued'; // Will be downloaded by worker later
      } else if (createData.deploymentType === 'api-based') {
        createData.status = 'active'; // Ready immediately (lazy validation at inference time)
      }
    }

    // Call parent create method
    return await super.create(createData, context);
  }

  /**
   * Helper method to check if model is being used by active deployments
   * @param modelId - Model ID to check
   * @returns Array of active deployments using this model
   */
  private async checkActiveDeploymentDependencies(
    modelId: ObjectId
  ): Promise<Array<{ id: string; name: string }>> {
    // Deployment schema has modelId: string field
    const activeDeployments = await this.deploymentModel
      .find({
        modelId: modelId.toString(),
        isDeleted: false, // Not soft-deleted
        status: { $in: ['running', 'deploying', 'starting'] }, // Active states
      })
      .select('_id name')
      .lean()
      .exec();

    return activeDeployments.map((deployment) => ({
      id: deployment._id.toString(),
      name: deployment.name,
    }));
  }

  /**
   * Override update method to validate status changes
   * Prevents deactivating models that are in use by active deployments
   */
  async update(
    id: ObjectId,
    updateData: Partial<ModelEntity>,
    context: RequestContext
  ): Promise<Partial<ModelEntity>> {
    // Check if status is being changed to 'inactive'
    if (updateData.status === 'inactive') {
      const activeDeployments = await this.checkActiveDeploymentDependencies(id);
      if (activeDeployments.length > 0) {
        throw new ModelInUseException(activeDeployments, 'deactivate');
      }
    }

    // Call parent update method
    return super.update(id, updateData, context);
  }

  /**
   * Override softDelete method to validate dependencies
   * Prevents deleting models that are in use by active deployments
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Partial<ModelEntity>> {
    const activeDeployments = await this.checkActiveDeploymentDependencies(id);
    if (activeDeployments.length > 0) {
      throw new ModelInUseException(activeDeployments, 'delete');
    }

    // Call parent softDelete method
    return super.softDelete(id, context);
  }

  /**
   * Activate a model (change status to 'active')
   * Only allowed from specific statuses depending on deploymentType
   */
  async activateModel(
    id: ObjectId,
    context: RequestContext
  ): Promise<Partial<ModelEntity>> {
    const model = await this.modelModel.findOne({
      _id: id,
      isDeleted: false,
    }).lean().exec();

    if (!model) {
      throw new BadRequestException(`Model with ID ${id} not found`);
    }

    // Validate current status allows activation
    const allowedStatuses = ['inactive', 'downloaded', 'deploying'];
    if (!allowedStatuses.includes(model.status)) {
      throw new BadRequestException(
        `Cannot activate model "${model.name}" from status '${model.status}'. Current status must be one of: ${allowedStatuses.join(', ')}`
      );
    }

    // Update status to active
    return this.update(id, { status: 'active' }, context);
  }

  /**
   * Deactivate a model (change status to 'inactive')
   * Prevents deactivating if model is in use by active deployments
   */
  async deactivateModel(
    id: ObjectId,
    context: RequestContext
  ): Promise<Partial<ModelEntity>> {
    const model = await this.modelModel.findOne({
      _id: id,
      isDeleted: false,
    }).lean().exec();

    if (!model) {
      throw new BadRequestException(`Model with ID ${id} not found`);
    }

    // Check if already inactive
    if (model.status === 'inactive') {
      throw new BadRequestException(`Model "${model.name}" is already inactive`);
    }

    // Validate model is not in use
    const activeDeployments = await this.checkActiveDeploymentDependencies(id);
    if (activeDeployments.length > 0) {
      throw new ModelInUseException(activeDeployments, 'deactivate');
    }

    // Update status to inactive
    return this.update(id, { status: 'inactive' }, context);
  }
}
