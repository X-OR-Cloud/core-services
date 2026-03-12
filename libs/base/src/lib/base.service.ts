import { Model, ObjectId, PipelineStage, Types } from 'mongoose';
import {
  RequestContext,
  createRoleBasedPermissions,
  createLogger,
} from '@hydrabyte/shared';
import { ForbiddenException } from '@nestjs/common';

export interface FindManyResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  statistics: {
    total: number;
    [key: string]: any;
  };
}
export interface FindManyOptions {
  filter?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  page?: number;
  limit?: number;
  selectFields?: string[];
  statisticFields?: string[]; // Fields to include in statistics aggregation
}

export class BaseService<Entity> {
  protected readonly logger;

  constructor(protected readonly model: Model<Entity>) {
    // Automatically get service name from child class
    const serviceName = this.constructor.name;
    this.logger = createLogger(serviceName);
  }

  /**
   * Enforce ownership by setting owner fields from context
   */
  private enforceOwnership(data: any, context: RequestContext): any {
    return {
      ...data,
      owner: {
        orgId: context.orgId || '',
        groupId: context.groupId || '',
        userId: context.userId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
    };
  }

  /**
   * Sanitize audit fields to prevent manual tampering
   * Removes createdBy and updatedBy from input data
   */
  private sanitizeAuditFields(data: any): any {
    const sanitized = { ...data };
    delete sanitized.createdBy;
    delete sanitized.updatedBy;
    return sanitized;
  }

  async create(data: any, context: RequestContext): Promise<Partial<Entity>> {
    this.logger.debug('Creating entity', { userId: context.userId });

    const permissions = createRoleBasedPermissions(context);
    if (!permissions.allowWrite) {
      this.logger.warn('Create permission denied', {
        userId: context.userId,
        roles: context.roles,
      });
      throw new ForbiddenException('You do not have permission to create.');
    }

    // Sanitize audit fields (prevent manual setting)
    const sanitized = this.sanitizeAuditFields(data);

    // Enforce ownership and audit trail
    const dataWithOwner = this.enforceOwnership(sanitized, context);
    const dataWithAudit = {
      ...dataWithOwner,
      createdBy: context,
      updatedBy: context,
    };

    delete dataWithAudit.createdBy['licenses'];
    delete dataWithAudit.updatedBy['licenses'];

    const created = new this.model(dataWithAudit);
    const saved = await created.save();

    // Remove internal fields and password from result
    const obj = saved.toObject ? saved.toObject() : saved;
    delete (obj as any).isDeleted;
    delete (obj as any).deletedAt;
    delete (obj as any).password;
    return obj as Entity;
  }

  async findById(
    id: ObjectId | string,
    context: RequestContext
  ): Promise<Partial<Entity>> {
    if (typeof id === 'string') {
      if (!Types.ObjectId.isValid(id)) {
        throw new ForbiddenException(`Invalid ID format ${id}`);
      }
      id = new Types.ObjectId(id) as any; // Convert string to ObjectId if necessary
    }

    const permissions = createRoleBasedPermissions(context);
    if (!permissions.allowRead) {
      this.logger.warn('Read permission denied', {
        userId: context.userId,
        roles: context.roles,
      });
      throw new ForbiddenException('You do not have permission to read.');
    }

    const condition = { _id: id, ...permissions.filter, isDeleted: false };
    const entity = await this.model
      .findOne(condition)
      .select('-isDeleted -deletedAt -password -updatedBy -createdBy')
      .exec();

    if (!entity) {
      throw new ForbiddenException(
        `Entity with ID ${id} not found or access denied`
      );
    }

    return entity;
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Entity>> {
    const notAllowedFilters = [
      'isDeleted',
      'deletedAt',
      'owner',
      'sort',
      'sortOrder',
      'sortBy',
      'page',
      'limit',
    ];
    const notAllowedFields = [
      '-isDeleted',
      '-deletedAt',
      '-password',
      '-createdBy',
      '-updatedBy',
    ];
    const permissions = createRoleBasedPermissions(context);
    if (!permissions.allowRead) {
      this.logger.warn('Read permission denied', {
        userId: context.userId,
        roles: context.roles,
      });
      throw new ForbiddenException('You do not have permission to read.');
    }

    const { sort, page = 1, limit = 10 } = options;
    const filter = options.filter
      ? { ...(options.filter as any) }
      : { ...(options as any) };
    notAllowedFilters.forEach((field) => delete filter[field]); // Ensure removed fields are not set by user filter
    // Loop each filter, delete if "" or null
    for (const key in filter) {
      if (filter[key] === '' || filter[key] === null) {
        delete filter[key];
      }
    }
    // Merge scope-based filter with user filter (user filter takes precedence)
    const finalFilter = { ...permissions.filter, ...filter, isDeleted: false };
    const selectFields = [
      ...notAllowedFields,
      ...(options.selectFields ? options.selectFields : []),
    ];
    const statisticFields = options.statisticFields || [];
    delete finalFilter.selectFields;
    delete finalFilter.statisticFields;
    this.logger.debug('Finding entities with filter', {
      filter: finalFilter,
      userId: context.userId,
      selectFields,
      statisticFields,
    });
    const [data, total] = await Promise.all([
      this.model
        .find(finalFilter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select(selectFields.join(' '))
        .exec(),
      this.model.countDocuments(finalFilter).exec(),
    ]);
    const result: FindManyResult<Entity> = {
      data,
      pagination: { page, limit, total },
      statistics: { total },
    };

    // check if Entity has status field, if yes, aggregate statistics by status
    if (options.statisticFields) {
      await Promise.all(
        options.statisticFields.map(async (field) => {
          result.statistics[
            `by${field.charAt(0).toUpperCase() + field.slice(1)}`
          ] = {};
          const pipeline: PipelineStage[] = [
            { $match: finalFilter },
            {
              $group: {
                _id: `$${field}`,
                count: { $sum: 1 },
              },
            },
          ];
          const fieldStats = await this.aggregate(pipeline, context);
          fieldStats.forEach((stat: any) => {
            result.statistics[
              `by${field.charAt(0).toUpperCase() + field.slice(1)}`
            ][stat._id] = stat.count;
          });
        })
      );
    }

    return result;
  }

  async update(
    id: ObjectId | string,
    updateData: Partial<Entity> | any,
    context: RequestContext
  ): Promise<Partial<Entity>> {
    if (typeof id === 'string') {
      if (!Types.ObjectId.isValid(id)) {
        throw new ForbiddenException(`Invalid ID format ${id}`);
      }
      id = new Types.ObjectId(id) as any; // Convert string to ObjectId if necessary
    }

    const permissions = createRoleBasedPermissions(context);
    if (!permissions.allowWrite) {
      this.logger.warn('Update permission denied', {
        userId: context.userId,
        roles: context.roles,
      });
      throw new ForbiddenException('You do not have permission to update.');
    }

    const condition = { _id: id, ...permissions.filter, isDeleted: false };

    // Prevent updating owner fields, password, and audit fields
    const sanitizedData = { ...updateData };
    delete (sanitizedData as any).owner;
    delete (sanitizedData as any).password;
    delete (sanitizedData as any).createdBy; // Protect createdBy from tampering
    delete (sanitizedData as any).updatedBy; // Will be set automatically below

    // Add audit trail - who updated this record
    const dataWithAudit = {
      ...sanitizedData,
      updatedBy: context,
    };

    const updated = await this.model
      .findOneAndUpdate(condition, dataWithAudit, { new: true })
      .select('-isDeleted -deletedAt -password')
      .exec();

    if (!updated) {
      this.logger.warn('Entity not found for update', { id: id.toString() });
    }

    return updated as Partial<Entity>;
  }

  async hardDelete(
    id: ObjectId | string,
    context: RequestContext
  ): Promise<Entity | null> {
    if (typeof id === 'string') {
      if (!Types.ObjectId.isValid(id)) {
        throw new ForbiddenException(`Invalid ID format ${id}`);
      }
      id = new Types.ObjectId(id) as any; // Convert string to ObjectId if necessary
    }
    const permissions = createRoleBasedPermissions(context);
    if (!permissions.allowAdministrative) {
      throw new ForbiddenException(
        'You do not have administrative permission for hard delete.'
      );
    }

    const condition = { _id: id, ...permissions.filter, isDeleted: false };
    const deleted = await this.model.findOneAndDelete(condition).exec();
    if (!deleted) return null;

    return {
      _id: deleted._id,
      deletedAt: new Date(),
    } as any;
  }

  async softDelete(
    id: ObjectId | string,
    context: RequestContext
  ): Promise<Partial<Entity>> {
    if (typeof id === 'string') {
      if (!Types.ObjectId.isValid(id)) {
        throw new ForbiddenException(`Invalid ID format ${id}`);
      }
      id = new Types.ObjectId(id) as any; // Convert string to ObjectId if necessary
    }

    const permissions = createRoleBasedPermissions(context);
    if (!permissions.allowDelete) {
      throw new ForbiddenException('You do not have permission to delete.');
    }

    const condition = { _id: id, ...permissions.filter, isDeleted: false };

    // Add audit trail - who deleted this record
    const updated = await this.model
      .findOneAndUpdate(
        condition,
        {
          isDeleted: true,
          deletedAt: new Date(),
          updatedBy: context.userId || '', // Track who deleted
        },
        { new: true }
      )
      .exec();

    if (!updated) {
      throw new ForbiddenException(
        `Entity with ID ${id} not found or access denied`
      );
    }

    return {
      _id: updated._id,
      deletedAt: new Date(),
    } as Entity;
  }

  /**
   * Execute MongoDB aggregation pipeline with RBAC and scope filtering
   * @param pipeline - Array of aggregation stages
   * @param context - Request context for permission checks
   * @returns Array of aggregation results, or empty array if error occurs
   */
  async aggregate(
    pipeline: PipelineStage[],
    context: RequestContext
  ): Promise<unknown[]> {
    /* this.logger.debug('Running aggregation pipeline', {
      stageCount: pipeline.length,
      userId: context.userId,
    }); */

    try {
      const permissions = createRoleBasedPermissions(context);
      if (!permissions.allowRead) {
        /* this.logger.warn('Read permission denied for aggregation', {
          userId: context.userId,
          roles: context.roles,
        }); */
        throw new ForbiddenException('You do not have permission to read.');
      }

      // Inject scope filter and soft delete check at the beginning of pipeline
      const scopeFilter = { ...permissions.filter, isDeleted: false };
      const finalPipeline = [{ $match: scopeFilter }, ...pipeline];

      const result = await this.model.aggregate(finalPipeline).exec();
      return result;
    } catch (error) {
      /* this.logger.error('Aggregation failed', {
        error: (error as Error).message,
        userId: context.userId,
      }); */
      return [];
    }
  }
}
