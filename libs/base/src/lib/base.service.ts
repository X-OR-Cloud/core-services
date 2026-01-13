import { Model, ObjectId, PipelineStage } from 'mongoose';
import {
  RequestContext,
  createRoleBasedPermissions,
  createLogger,
  logDebug,
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
    [key: string]: number;
  };
}
export interface FindManyOptions {
  filter?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  page?: number;
  limit?: number;
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

    this.logger.log('Entity created', {
      id: (saved as any)._id,
      userId: context.userId,
    });

    // Remove internal fields and password from result
    const obj = saved.toObject ? saved.toObject() : saved;
    delete (obj as any).isDeleted;
    delete (obj as any).deletedAt;
    delete (obj as any).password;
    return obj as Entity;
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Entity>> {
    this.logger.debug('Finding entities', {
      page: options.page,
      limit: options.limit,
      userId: context.userId,
    });

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
      : {...(options as any)};
    delete filter['isDeleted']; // Ensure isDeleted is not set by user filter
    delete filter['deletedAt']; // Ensure deletedAt is not set by user filter
    delete filter['owner']; // Ensure owner is not set by user filter
    delete filter['sort']; // Ensure sort is not set by user filter
    delete filter['sortOrder']; // Ensure sortOrder is not set by user filter
    delete filter['sortBy']; // Ensure sortBy is not set by user filter
    delete filter['page']; // Ensure page is not set by user filter
    delete filter['limit']; // Ensure limit is not set by user filter
    // Loop each filter, delete if "" or null
    for (const key in filter) {
      console.log('Filter key check', key, filter[key]);
      if (filter[key] === '' || filter[key] === null) {
        delete filter[key];
      }
    }
    // Merge scope-based filter with user filter (user filter takes precedence)
    const finalFilter = { ...permissions.filter, ...filter, isDeleted: false };
    this.logger.debug('Origin filter', filter);
    this.logger.debug('Final query filter', finalFilter);

    const [data, total] = await Promise.all([
      this.model
        .find(finalFilter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-isDeleted -deletedAt -password')
        .exec(),
      this.model.countDocuments(finalFilter).exec(),
    ]);

    this.logger.log('Entities retrieved', {
      count: data.length,
      total,
      page,
      userId: context.userId,
    });

    return { data, pagination: { page, limit, total }, statistics: { total } };
  }

  async findById(
    id: ObjectId,
    context: RequestContext
  ): Promise<Entity | null> {
    this.logger.debug('Finding entity by ID', {
      id: id.toString(),
      userId: context.userId,
    });

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
      .select('-isDeleted -deletedAt -password')
      .exec();

    if (entity) {
      this.logger.debug('Entity found', { id: id.toString() });
    } else {
      this.logger.debug('Entity not found', { id: id.toString() });
    }

    return entity;
  }

  async update(
    id: ObjectId,
    updateData: Partial<Entity>,
    context: RequestContext
  ): Promise<Entity | null> {
    this.logger.debug('Updating entity', {
      id: id.toString(),
      userId: context.userId,
    });

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

    if (updated) {
      this.logger.log('Entity updated', {
        id: id.toString(),
        userId: context.userId,
      });
    } else {
      this.logger.warn('Entity not found for update', { id: id.toString() });
    }

    return updated;
  }

  async hardDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Entity | null> {
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
    id: ObjectId,
    context: RequestContext
  ): Promise<Entity | null> {
    this.logger.debug('Soft deleting entity', {
      id: id.toString(),
      userId: context.userId,
    });

    const permissions = createRoleBasedPermissions(context);
    if (!permissions.allowDelete) {
      this.logger.warn('Delete permission denied', {
        userId: context.userId,
        roles: context.roles,
      });
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

    if (updated) {
      this.logger.log('Entity soft deleted', {
        id: id.toString(),
        userId: context.userId,
      });
    } else {
      this.logger.warn('Entity not found for deletion', { id: id.toString() });
    }

    if (!updated) return null;

    return {
      _id: updated._id,
      deletedAt: new Date(),
    } as any;
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
    this.logger.debug('Running aggregation pipeline', {
      stageCount: pipeline.length,
      userId: context.userId,
    });

    try {
      const permissions = createRoleBasedPermissions(context);
      if (!permissions.allowRead) {
        this.logger.warn('Read permission denied for aggregation', {
          userId: context.userId,
          roles: context.roles,
        });
        throw new ForbiddenException('You do not have permission to read.');
      }

      // Inject scope filter and soft delete check at the beginning of pipeline
      const scopeFilter = { ...permissions.filter, isDeleted: false };
      const finalPipeline = [{ $match: scopeFilter }, ...pipeline];

      const result = await this.model.aggregate(finalPipeline).exec();

      this.logger.log('Aggregation completed', {
        resultCount: result.length,
        userId: context.userId,
      });

      return result;
    } catch (error) {
      this.logger.error('Aggregation failed', {
        error: (error as Error).message,
        userId: context.userId,
      });
      return [];
    }
  }
}
