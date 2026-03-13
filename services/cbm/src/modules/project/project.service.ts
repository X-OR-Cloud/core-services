import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Project, ProjectMember } from './project.schema';
import { AddMemberDto, UpdateMemberRoleDto } from './project.dto';
import {
  applyProjectAccess,
  applyProjectListAccess,
  assertCanManageMembers,
  assertCanManageProject,
  getMemberProjectIds,
  isSuperAdmin,
} from './project-access.helper';

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
   * Override create to force status as 'draft' and inject lead as first member.
   * If `lead` is provided, it is prepended to members with role 'project.lead'.
   */
  async create(data: any, context: RequestContext): Promise<Partial<Project>> {
    data.status = 'draft';

    if (data.lead) {
      const leadMember: ProjectMember = {
        type: data.lead.type,
        id: data.lead.id,
        role: 'project.lead',
      };
      // Prepend lead, avoid duplicate
      const existingMembers: ProjectMember[] = data.members || [];
      const alreadyPresent = existingMembers.some(
        (m) => m.type === leadMember.type && m.id === leadMember.id,
      );
      data.members = alreadyPresent ? existingMembers : [leadMember, ...existingMembers];
      delete data.lead;
    }

    return super.create(data, context);
  }

  /**
   * Override findAll with access control and statistics aggregation.
   * - super-admin: sees all projects in org (universe.owner sees all orgs)
   * - members: full project data
   * - non-members same org: public summary view (no description)
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Project>> {
    // Handle search parameter - convert to MongoDB filter
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      const searchConditions = [
        { name: searchRegex },
        { summary: searchRegex },
        { description: searchRegex },
        { tags: searchQuery },
      ];
      const existingFilter: any = {};
      if (options) {
        Object.keys(options).forEach(key => {
          if (key !== 'search') existingFilter[key] = (options as any)[key];
        });
      }
      options = { ...existingFilter, $or: searchConditions };
      delete options.search;
    }

    const findResult = await super.findAll(options, context);

    // Apply access control to each project in the result
    findResult.data = applyProjectListAccess(findResult.data as any[], context) as any[];

    // Build base match filter for aggregation
    const baseMatch: any = { isDeleted: false };
    if (context.orgId && !isSuperAdmin(context)) {
      baseMatch['owner.orgId'] = context.orgId;
    }

    let matchFilter: any;
    if (options.filter && Object.keys(options.filter).length > 0) {
      matchFilter = { $and: [baseMatch, options.filter] };
    } else {
      matchFilter = baseMatch;
    }

    // Aggregate statistics by status
    const statusStats = await super.aggregate(
      [
        { $match: matchFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ],
      context
    );

    const statistics: any = { total: findResult.pagination.total, byStatus: {} };
    statusStats.forEach((stat: any) => { statistics.byStatus[stat._id] = stat.count; });

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Override findById with access control.
   * - super-admin / member: full project
   * - non-member same org: public summary view
   * - different org: 403
   */
  async findById(id: ObjectId, context: RequestContext): Promise<any> {
    const project = await super.findById(id, context);
    if (!project) throw new NotFoundException('Project not found');
    return applyProjectAccess(project, context);
  }

  /**
   * Get a raw project document by ID (no access control) for internal use.
   * Used by Document/Work services to check project lead access.
   */
  async getRawProjectById(projectId: string): Promise<any | null> {
    const { Types } = await import('mongoose');
    return this.projectModel.findOne({
      _id: new Types.ObjectId(projectId),
      isDeleted: false,
    }).lean();
  }

  /**
   * Override update to restrict to project.lead and super-admin only.
   */
  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Project>> {
    const project = await super.findById(id, context);
    if (!project) throw new NotFoundException('Project not found');
    assertCanManageProject(project, context);
    return super.update(id, data, context);
  }

  /**
   * Override softDelete to validate status and restrict to super-admin only.
   * Only allow deletion when status is 'completed' or 'archived'.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Project>> {
    const project = await super.findById(id, context);
    if (!project) throw new BadRequestException('Project not found');
    assertCanManageProject(project, context);
    if (!['completed', 'archived'].includes(project.status as string)) {
      throw new BadRequestException(`Cannot delete project with status: ${project.status}. Only completed or archived projects can be deleted.`);
    }
    return super.softDelete(id, context);
  }

  /**
   * Get all projectIds in the org where the caller is a member.
   * Used by Document and Work services to build membership filter.
   * Returns undefined if caller is super-admin (no filter needed).
   */
  async getMemberProjectIds(context: RequestContext): Promise<Set<string> | undefined> {
    if (isSuperAdmin(context)) return undefined;

    const filter: any = { isDeleted: false };
    if (context.orgId) filter['owner.orgId'] = context.orgId;

    const allProjects = await this.projectModel.find(filter).select('_id members owner').lean();
    return getMemberProjectIds(allProjects, context);
  }

  // =============== Member Management ===============

  private async getProjectForMemberOp(id: string, context: RequestContext): Promise<any> {
    const project = await this.projectModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });
    if (!project) throw new NotFoundException('Project not found');
    assertCanManageMembers(project, context);
    return project;
  }

  async listMembers(id: string, context: RequestContext): Promise<ProjectMember[]> {
    // Readable by any authenticated org member — use findById for access check
    const project = await this.findById(new Types.ObjectId(id) as any, context);
    return (project as any).members ?? [];
  }

  async addMember(id: string, dto: AddMemberDto, context: RequestContext): Promise<ProjectMember[]> {
    const project = await this.getProjectForMemberOp(id, context);

    // TODO: For type === 'agent', cross-validate id with AIWM service
    const duplicate = project.members.find(
      (m: ProjectMember) => m.type === dto.type && m.id === dto.id
    );
    if (duplicate) {
      throw new ConflictException('Member already exists in this project');
    }

    project.members.push({ type: dto.type, id: dto.id, role: dto.role });
    await project.save();
    return project.members;
  }

  async updateMemberRole(
    id: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
    context: RequestContext
  ): Promise<ProjectMember[]> {
    const project = await this.getProjectForMemberOp(id, context);

    const member = project.members.find((m: ProjectMember) => m.id === memberId);
    if (!member) throw new NotFoundException('Member not found in this project');

    member.role = dto.role;
    await project.save();
    return project.members;
  }

  async removeMember(id: string, memberId: string, context: RequestContext): Promise<ProjectMember[]> {
    const project = await this.getProjectForMemberOp(id, context);

    const index = project.members.findIndex((m: ProjectMember) => m.id === memberId);
    if (index === -1) throw new NotFoundException('Member not found in this project');

    project.members.splice(index, 1);
    await project.save();
    return project.members;
  }

  // =============== State Transitions ===============

  async activateProject(id: ObjectId, context: RequestContext): Promise<Project> {
    const project = await super.findById(id, context);
    if (!project) throw new BadRequestException('Project not found');
    if (project.status !== 'draft') {
      throw new BadRequestException(`Cannot activate project with status: ${project.status}. Only draft projects can be activated.`);
    }
    return this.update(id, { status: 'active' } as any, context) as Promise<Project>;
  }

  async holdProject(id: ObjectId, context: RequestContext): Promise<Project> {
    const project = await super.findById(id, context);
    if (!project) throw new BadRequestException('Project not found');
    if (project.status !== 'active') {
      throw new BadRequestException(`Cannot hold project with status: ${project.status}. Only active projects can be put on hold.`);
    }
    return this.update(id, { status: 'on_hold' } as any, context) as Promise<Project>;
  }

  async resumeProject(id: ObjectId, context: RequestContext): Promise<Project> {
    const project = await super.findById(id, context);
    if (!project) throw new BadRequestException('Project not found');
    if (project.status !== 'on_hold') {
      throw new BadRequestException(`Cannot resume project with status: ${project.status}. Only on_hold projects can be resumed.`);
    }
    return this.update(id, { status: 'active' } as any, context) as Promise<Project>;
  }

  async completeProject(id: ObjectId, context: RequestContext): Promise<Project> {
    const project = await super.findById(id, context);
    if (!project) throw new BadRequestException('Project not found');
    if (project.status !== 'active') {
      throw new BadRequestException(`Cannot complete project with status: ${project.status}. Only active projects can be completed.`);
    }
    return this.update(id, { status: 'completed' } as any, context) as Promise<Project>;
  }

  async archiveProject(id: ObjectId, context: RequestContext): Promise<Project> {
    const project = await super.findById(id, context);
    if (!project) throw new BadRequestException('Project not found');
    if (project.status !== 'completed') {
      throw new BadRequestException(`Cannot archive project with status: ${project.status}. Only completed projects can be archived.`);
    }
    return this.update(id, { status: 'archived' } as any, context) as Promise<Project>;
  }

}
