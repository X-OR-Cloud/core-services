import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Project } from './project.schema';

/**
 * ProjectService
 * Manages project entities with action-based state transitions
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class ProjectService extends BaseService<Project> {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<Project>
  ) {
    super(projectModel);
  }

  /**
   * Override create to force status as 'draft'
   */
  async create(data: any, context: RequestContext): Promise<Partial<Project>> {
    data.status = 'draft';
    return super.create(data, context);
  }

  /**
   * Override findAll to handle statistics aggregation and optimize response
   * Aggregates by status only
   * Excludes 'description' field to reduce response size
   * Supports search query for name, description, and tags
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Project>> {

    // Handle search parameter - convert to MongoDB filter
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');

      // Build search conditions
      const searchConditions = [
        { name: searchRegex },
        { description: searchRegex },
        { tags: searchQuery }, // Exact match for tags array
      ];

      // Get existing filter fields (excluding search)
      const existingFilter: any = {};
      if (options) {
        Object.keys(options).forEach(key => {
          if (key !== 'search') {
            existingFilter[key] = (options as any)[key];
          }
        });
      }

      options = {
        ...existingFilter,
        $or: searchConditions,
      };

      // Clean up search parameter
      delete options.search;
    }

    const findResult = await super.findAll(options, context);

    // Exclude description field from results to reduce response size
    findResult.data = findResult.data.map((project: any) => {
      // Convert Mongoose document to plain object
      const plainProject = project.toObject ? project.toObject() : project;
      const { description, ...rest } = plainProject;
      return rest as Project;
    });

    // Build base match filter for aggregation
    const baseMatch: any = {
      isDeleted: false,
    };

    if (context.orgId) {
      baseMatch['owner.orgId'] = context.orgId;
    }

    // Merge with search filters if any
    let matchFilter: any;
    if (options.filter && Object.keys(options.filter).length > 0) {
      matchFilter = {
        $and: [baseMatch, options.filter]
      };
    } else {
      matchFilter = baseMatch;
    }

    // Aggregate statistics by status
    const statusStats = await super.aggregate(
      [
        { $match: matchFilter },
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
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Action: Activate project
   * Transition: draft → active
   */
  async activateProject(
    id: ObjectId,
    context: RequestContext
  ): Promise<Project> {
    const project = await this.findById(id, context);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.status !== 'draft') {
      throw new BadRequestException(
        `Cannot activate project with status: ${project.status}. Only draft projects can be activated.`
      );
    }

    return this.update(
      id,
      { status: 'active' } as any,
      context
    ) as Promise<Project>;
  }

  /**
   * Action: Hold project
   * Transition: active → on_hold
   */
  async holdProject(
    id: ObjectId,
    context: RequestContext
  ): Promise<Project> {
    const project = await this.findById(id, context);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.status !== 'active') {
      throw new BadRequestException(
        `Cannot hold project with status: ${project.status}. Only active projects can be put on hold.`
      );
    }

    return this.update(
      id,
      { status: 'on_hold' } as any,
      context
    ) as Promise<Project>;
  }

  /**
   * Action: Resume project
   * Transition: on_hold → active
   */
  async resumeProject(
    id: ObjectId,
    context: RequestContext
  ): Promise<Project> {
    const project = await this.findById(id, context);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.status !== 'on_hold') {
      throw new BadRequestException(
        `Cannot resume project with status: ${project.status}. Only on_hold projects can be resumed.`
      );
    }

    return this.update(
      id,
      { status: 'active' } as any,
      context
    ) as Promise<Project>;
  }

  /**
   * Action: Complete project
   * Transition: active → completed
   */
  async completeProject(
    id: ObjectId,
    context: RequestContext
  ): Promise<Project> {
    const project = await this.findById(id, context);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.status !== 'active') {
      throw new BadRequestException(
        `Cannot complete project with status: ${project.status}. Only active projects can be completed.`
      );
    }

    return this.update(
      id,
      { status: 'completed' } as any,
      context
    ) as Promise<Project>;
  }

  /**
   * Action: Archive project
   * Transition: completed → archived
   */
  async archiveProject(
    id: ObjectId,
    context: RequestContext
  ): Promise<Project> {
    const project = await this.findById(id, context);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.status !== 'completed') {
      throw new BadRequestException(
        `Cannot archive project with status: ${project.status}. Only completed projects can be archived.`
      );
    }

    return this.update(
      id,
      { status: 'archived' } as any,
      context
    ) as Promise<Project>;
  }

  /**
   * Override softDelete to validate status
   * Only allow deletion when status is 'completed' or 'archived'
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Project | null> {
    const project = await this.findById(id, context);
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (!['completed', 'archived'].includes(project.status)) {
      throw new BadRequestException(
        `Cannot delete project with status: ${project.status}. Only completed or archived projects can be deleted.`
      );
    }

    return super.softDelete(id, context);
  }
}
