import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Work, RecurrenceConfig } from './work.schema';
import { CreateWorkDto } from './work.dto';
import { NotificationService } from '../notification/notification.service';
import { ProjectService } from '../project/project.service';
import { assertCanManageWork, getWorkCallerRole } from '../project/project-access.helper';

/**
 * WorkService
 * Manages work entities with action-based state transitions and validation
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class WorkService extends BaseService<Work> {
  protected readonly logger = new Logger(WorkService.name);

  constructor(
    @InjectModel(Work.name) private workModel: Model<Work>,
    private readonly notificationService: NotificationService,
    private readonly projectService: ProjectService,
  ) {
    super(workModel);
  }

  /**
   * Assert that the caller is a project lead or super-admin for work's project.
   * No-op if work has no projectId.
   */
  private async assertWorkProjectAccess(projectId: string | undefined, context: RequestContext): Promise<void> {
    if (!projectId) return;
    const project = await this.projectService.getRawProjectById(projectId.toString());
    if (project) {
      assertCanManageWork(project, context);
    }
  }

  /**
   * Override create to validate reporter/assignee and parentId
   * Validates hierarchy rules based on work type:
   * - epic: automatically sets parentId to null (cannot have parent)
   * - task: if has parentId, parent must be epic
   * - subtask: must have parentId, and parent must be task
   */
  async create(data: CreateWorkDto, context: RequestContext): Promise<Work> {
    // Check project lead access if work belongs to a project
    await this.assertWorkProjectAccess((data as any).projectId, context);
    // Validate reporter exists and isDeleted = false
    await this.validateEntityExists(data.reporter.type, data.reporter.id);

    // Validate assignee if provided
    if (data.assignee) {
      await this.validateEntityExists(data.assignee.type, data.assignee.id);
    }

    // Validate and enforce parentId rules based on type
    await this.validateAndSetParentId(data, context);

    // Validate recurrence config if provided
    if (data.recurrence) {
      this.validateRecurrenceConfig(data);
      (data as any).isRecurring = true;

      // Recurrence requires assignee
      if (!data.assignee) {
        throw new BadRequestException(
          'assignee is required when recurrence is set'
        );
      }

      if (data.recurrence.type === 'onetime') {
        // Onetime requires startAt to be provided explicitly
        if (!data.startAt) {
          throw new BadRequestException(
            'startAt is required when recurrence type is onetime'
          );
        }
      } else {
        // Calculate initial startAt if not provided for recurring types
        if (!data.startAt) {
          data.startAt = this.calculateNextStartAt(data.recurrence, new Date());
        }
      }
    }

    // Recurrence works skip backlog, go directly to todo
    data.status = data.recurrence ? 'todo' : 'backlog';
    const work = await super.create(data as CreateWorkDto, context) as Work;

    // Emit notification
    await this.notificationService.notify({
      type: 'work.created',
      workId: (work as any)._id.toString(),
      work,
      actor: context,
    });

    return work;
  }

  /**
   * Override update to validate reporter/assignee and parentId
   * NOTE: type, status, and reason cannot be updated via PATCH
   * - type: Cannot be changed after creation (would break hierarchy)
   * - status: Must use action methods (startWork, blockWork, etc.)
   * - reason: Managed automatically by blockWork/unblockWork actions
   */
  async update(id: ObjectId, data: any, context: RequestContext): Promise<Work | null> {
    // Check project lead access
    const existingWork = await super.findById(id, context);
    if (existingWork) {
      await this.assertWorkProjectAccess((existingWork as any).projectId, context);
    }

    // Block fields that cannot be updated directly
    if (data.type !== undefined) {
      throw new BadRequestException('Cannot update work type. Type is immutable after creation.');
    }

    if (data.status !== undefined) {
      throw new BadRequestException('Cannot update status directly. Use action endpoints: /start, /block, /unblock, /request-review, /complete, /reopen, /cancel');
    }

    if (data.reason !== undefined) {
      throw new BadRequestException('Cannot update reason directly. Reason is managed by block/unblock actions.');
    }

    // Validate reporter if being updated
    if (data.reporter) {
      await this.validateEntityExists(data.reporter.type, data.reporter.id);
    }

    // Validate assignee if being updated
    if (data.assignee) {
      await this.validateEntityExists(data.assignee.type, data.assignee.id);
    }

    // Validate parentId if being updated
    if (data.parentId !== undefined) {
      const work = await this.findById(id, context);
      if (!work) {
        throw new BadRequestException('Work not found');
      }

      // Create a temporary object for validation with existing type
      const tempData = {
        type: work.type, // Use existing type since it cannot be changed
        parentId: data.parentId,
      };

      // Validate using the same rules as create
      await this.validateAndSetParentId(tempData, context);

      // Apply the validated parentId back to data
      data.parentId = tempData.parentId;
    }

    // Validate recurrence if being updated
    if (data.recurrence !== undefined) {
      if (data.recurrence === null) {
        // Removing recurrence
        data.isRecurring = false;
        data.recurrence = null;
      } else {
        const work = await this.findById(id, context);
        if (!work) {
          throw new BadRequestException('Work not found');
        }
        this.validateRecurrenceConfig({ type: work.type, recurrence: data.recurrence });
        data.isRecurring = true;
        // Recalculate startAt if no explicit startAt provided (not for onetime)
        if (data.startAt === undefined && data.recurrence.type !== 'onetime') {
          data.startAt = this.calculateNextStartAt(data.recurrence, new Date());
        }
      }
    }

    return super.update(id, data, context);
  }

  /**
   * Validate that entity (user/agent) exists and isDeleted = false
   * Note: This is a placeholder - actual implementation would query IAM/AIWM services
   */
  private async validateEntityExists(type: 'user' | 'agent', id: string): Promise<void> {
    // TODO: Implement actual validation by calling IAM (for user) or AIWM (for agent) services
    // For now, we just check that id is a valid ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${type} ID format: ${id}`);
    }

    // Placeholder logic - in production, call external service:
    // if (type === 'user') {
    //   const user = await iamService.getUser(id);
    //   if (!user || user.isDeleted) throw new BadRequestException(`User ${id} not found or deleted`);
    // } else {
    //   const agent = await aiwmService.getAgent(id);
    //   if (!agent || agent.isDeleted) throw new BadRequestException(`Agent ${id} not found or deleted`);
    // }
  }

  /**
   * Validate and set parentId based on work type hierarchy rules
   * - epic: must not have parent (automatically set to null)
   * - task: if has parent, parent must be epic
   * - subtask: must have parent, and parent must be task
   */
  private async validateAndSetParentId(data: any, context: RequestContext): Promise<void> {
    const workType = data.type;

    // Rule 1: Epic cannot have parent - force parentId to null
    if (workType === 'epic') {
      if (data.parentId) {
        throw new BadRequestException('Epic cannot have a parent. Remove parentId or change work type.');
      }
      data.parentId = null;
      return;
    }

    // Rule 2: Task can optionally have parent, if provided it must be epic
    if (workType === 'task') {
      if (data.parentId) {
        const parent = await this.findById(new Types.ObjectId(data.parentId) as any, context);
        if (!parent) {
          throw new BadRequestException(`Parent work ${data.parentId} not found`);
        }
        if (parent.type !== 'epic') {
          throw new BadRequestException(`Task can only have epic as parent. Found parent type: ${parent.type}`);
        }
      }
      return;
    }

    // Rule 3: Subtask must have parent, and parent must be task
    if (workType === 'subtask') {
      if (!data.parentId) {
        throw new BadRequestException('Subtask must have a parentId. Provide a task ID as parent.');
      }
      const parent = await this.findById(new Types.ObjectId(data.parentId) as any, context);
      if (!parent) {
        throw new BadRequestException(`Parent work ${data.parentId} not found`);
      }
      if (parent.type !== 'task') {
        throw new BadRequestException(`Subtask can only have task as parent. Found parent type: ${parent.type}`);
      }
      return;
    }
  }

  /**
   * Override findAll to handle statistics aggregation and optimize response
   * Aggregates by status and type
   * Excludes 'description' field to reduce response size
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Work>> {
    // Build membership filter: exclude works from projects where caller is not a member
    const memberIds = await this.projectService.getMemberProjectIds(context);
    if (memberIds !== undefined) {
      const membershipFilter = {
        $or: [
          { projectId: { $exists: false } },
          { projectId: null },
          { projectId: { $in: Array.from(memberIds) } },
        ],
      };
      const existingFilter = options.filter ? { ...options.filter } : {};
      options.filter = Object.keys(existingFilter).length > 0
        ? { $and: [existingFilter, membershipFilter] } as any
        : membershipFilter as any;
    }

    const findResult = await super.findAll(options, context);

    // Build project cache to avoid N+1 queries when computing myRole
    const projectIds = [...new Set(
      findResult.data
        .map((w: any) => (w.toObject ? w.toObject() : w).projectId)
        .filter(Boolean)
    )];
    const projectCache = new Map<string, any>();
    await Promise.all(
      projectIds.map(async (pid: any) => {
        const p = await this.projectService.getRawProjectById(pid.toString());
        if (p) projectCache.set(pid.toString(), p);
      })
    );

    // Exclude description field from results and inject myRole
    findResult.data = findResult.data.map((work: any) => {
      const plainWork = work.toObject ? work.toObject() : work;
      const { description, ...rest } = plainWork;
      const project = plainWork.projectId ? projectCache.get(plainWork.projectId.toString()) ?? null : null;
      const myRole = getWorkCallerRole(plainWork, project, context);
      return { ...rest, myRole } as Work;
    });

    // Aggregate statistics by status and type
    const [statusStats, typeStats] = await Promise.all([
      super.aggregate(
        [{ $match: { ...options.filter } }, { $group: { _id: '$status', count: { $sum: 1 } } }],
        context
      ),
      super.aggregate(
        [{ $match: { ...options.filter } }, { $group: { _id: '$type', count: { $sum: 1 } } }],
        context
      ),
    ]);

    const statistics: any = { total: findResult.pagination.total, byStatus: {}, byType: {} };
    statusStats.forEach((stat: any) => { statistics.byStatus[stat._id] = stat.count; });
    typeStats.forEach((stat: any) => { statistics.byType[stat._id] = stat.count; });

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Override findById to inject myRole into the response.
   */
  async findById(id: ObjectId, context: RequestContext): Promise<any> {
    const work = await super.findById(id, context);
    if (!work) return null;
    const plain = (work as any).toObject ? (work as any).toObject() : work;
    const project = plain.projectId
      ? await this.projectService.getRawProjectById(plain.projectId.toString())
      : null;
    const myRole = getWorkCallerRole(plain, project, context);
    return { ...plain, myRole };
  }

  // =============== Action Methods ===============

  /**
   * Returns next-step hint text based on whether the caller is an agent or user.
   * agent → MCP tool names, user → REST endpoint paths
   */
  private hint(context: RequestContext, agentMsg: string, userMsg: string): string {
    return context.agentId ? agentMsg : userMsg;
  }

  /**
   * Action: Start work
   * Transition: todo → in_progress
   */
  async startWork(
    id: ObjectId,
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status !== 'todo') {
      const nextStep = this.hint(context,
        `To move to todo first: use mcp__Builtin__AssignAndTodoWork (from backlog) or mcp__Builtin__UnblockWork (from blocked).`,
        `To move to todo first: use POST /works/{id}/assign-and-todo (from backlog) or POST /works/{id}/unblock (from blocked).`
      );
      throw new BadRequestException(
        `Cannot start work with status: ${work.status}. Only todo works can be started. ${nextStep}`
      );
    }

    const updated = await super.update(
      id,
      { status: 'in_progress' } as any,
      context
    ) as Work;

    // Trigger epic recalculation if this is a task
    await this.triggerParentEpicRecalculation(updated, context);

    return updated;
  }

  /**
   * Action: Block work
   * Transition: in_progress → blocked
   * @param reason - Explanation of why the work is blocked (required)
   */
  async blockWork(
    id: ObjectId,
    reason: string,
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status !== 'in_progress') {
      const nextStep = this.hint(context,
        `Work must be in_progress to block. Use mcp__Builtin__StartWork to start it first.`,
        `Work must be in_progress to block. Use POST /works/{id}/start to start it first.`
      );
      throw new BadRequestException(
        `Cannot block work with status: ${work.status}. Only in_progress works can be blocked. ${nextStep}`
      );
    }

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Reason is required when blocking work');
    }

    const updated = await super.update(
      id,
      { status: 'blocked', reason } as any,
      context
    ) as Work;

    // Emit notification
    await this.notificationService.notify({
      type: 'work.blocked',
      workId: (updated as any)._id.toString(),
      work: updated,
      actor: context,
    });

    return updated;
  }

  /**
   * Action: Unblock work
   * Transition: blocked → todo (CHANGED from in_progress)
   * Clears the reason field and optionally adds feedback
   */
  async unblockWork(
    id: ObjectId,
    feedback: string | undefined,
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status !== 'blocked') {
      const nextStep = this.hint(context,
        `Work must be blocked first. Use mcp__Builtin__BlockWork to block it, or mcp__Builtin__StartWork if it's in todo.`,
        `Work must be blocked first. Use POST /works/{id}/block to block it, or POST /works/{id}/start if it's in todo.`
      );
      throw new BadRequestException(
        `Cannot unblock work with status: ${work.status}. Only blocked works can be unblocked. ${nextStep}`
      );
    }

    return super.update(
      id,
      {
        status: 'todo',  // CHANGED: was 'in_progress'
        reason: null,    // Clear blocked reason
        feedback         // Optional feedback
      } as any,
      context
    ) as Promise<Work>;
  }

  /**
   * Action: Request review
   * Transition: in_progress → review
   */
  async requestReview(
    id: ObjectId,
    body: { result?: string; documentIds?: string[] },
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status !== 'in_progress') {
      const nextStep = this.hint(context,
        `Work must be in_progress first. Use mcp__Builtin__StartWork to start it (requires todo status).`,
        `Work must be in_progress first. Use POST /works/{id}/start to start it (requires todo status).`
      );
      throw new BadRequestException(
        `Cannot request review for work with status: ${work.status}. Only in_progress works can request review. ${nextStep}`
      );
    }

    const updateData: Record<string, any> = { status: 'review' };
    if (body.result !== undefined) {
      updateData['result'] = body.result;
    }
    if (body.documentIds && body.documentIds.length > 0) {
      const existing: string[] = (work as any).documents ?? [];
      updateData['documents'] = [...new Set([...existing, ...body.documentIds])];
    }

    const updated = await super.update(
      id,
      updateData as any,
      context
    ) as Work;

    // Emit notification
    await this.notificationService.notify({
      type: 'work.review_requested',
      workId: (updated as any)._id.toString(),
      work: updated,
      actor: context,
    });

    return updated;
  }

  /**
   * Action: Complete work
   * Transition: review → done
   * For recurring tasks: resets status to todo and calculates next startAt
   */
  async completeWork(
    id: ObjectId,
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    // Recurring/scheduled tasks can be completed from in_progress (skip review)
    const allowedStatuses = work.isRecurring
      ? ['in_progress', 'review']
      : ['review'];

    if (!allowedStatuses.includes(work.status)) {
      const statusList = allowedStatuses.join(' or ');
      const nextStep = work.isRecurring
        ? this.hint(context,
            `Use mcp__Builtin__StartWork to move it to in_progress first.`,
            `Use POST /works/{id}/start to move it to in_progress first.`
          )
        : this.hint(context,
            `Use mcp__Builtin__RequestReviewForWork to submit for review first, then complete after review is approved.`,
            `Use POST /works/{id}/request-review to submit for review first, then complete after review is approved.`
          );
      throw new BadRequestException(
        `Cannot complete work with status: ${work.status}. Only ${statusList} works can be completed. ${nextStep}`
      );
    }

    // For onetime scheduled works: complete normally + deactivate isRecurring
    if (work.isRecurring && work.recurrence && work.recurrence.type === 'onetime') {
      const updated = await this.workModel.findByIdAndUpdate(
        id,
        {
          status: 'done',
          isRecurring: false,
          reason: null,
          feedback: null,
          updatedBy: context,
        },
        { new: true }
      ).exec() as Work;

      await this.notificationService.notify({
        type: 'work.completed',
        workId: (updated as any)._id.toString(),
        work: updated,
        actor: context,
      });

      await this.triggerParentEpicRecalculation(updated, context);
      return updated;
    }

    // For recurring works: reset to todo with next startAt
    if (work.isRecurring && work.recurrence) {
      // Calculate next occurrence after the LATER of current startAt or now.
      // This ensures we always advance past the current cycle.
      const now = new Date();
      const baseDate = work.startAt && work.startAt >= now ? work.startAt : now;
      const nextStartAt = this.calculateNextStartAt(work.recurrence, baseDate);

      const updated = await this.workModel.findByIdAndUpdate(
        id,
        {
          status: 'todo',
          startAt: nextStartAt,
          reason: null,
          feedback: null,
          updatedBy: context,
        },
        { new: true }
      ).exec() as Work;

      // Emit notification with recurring metadata
      await this.notificationService.notify({
        type: 'work.completed',
        workId: (updated as any)._id.toString(),
        work: updated,
        actor: context,
        metadata: {
          isRecurring: true,
          nextStartAt: nextStartAt.toISOString(),
        },
      });

      await this.triggerParentEpicRecalculation(updated, context);
      return updated;
    }

    // Non-recurring: existing behavior
    const updated = await super.update(
      id,
      { status: 'done' } as any,
      context
    ) as Work;

    // Emit notification
    await this.notificationService.notify({
      type: 'work.completed',
      workId: (updated as any)._id.toString(),
      work: updated,
      actor: context,
    });

    // Trigger epic recalculation if this is a task
    await this.triggerParentEpicRecalculation(updated, context);

    return updated;
  }

  /**
   * Action: Reopen work
   * Transition: done → todo, cancelled → todo
   * For recurring works with recurrence config: restores isRecurring and recalculates startAt
   */
  async reopenWork(
    id: ObjectId,
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status !== 'done' && work.status !== 'cancelled') {
      const nextStep = this.hint(context,
        `To finish work first: use mcp__Builtin__CompleteWork (from review/in_progress) or mcp__Builtin__CancelWork (from any status).`,
        `To finish work first: use POST /works/{id}/complete (from review/in_progress) or POST /works/{id}/cancel (from any status).`
      );
      throw new BadRequestException(
        `Cannot reopen work with status: ${work.status}. Only done or cancelled works can be reopened. ${nextStep}`
      );
    }

    const updateData: any = {
      status: 'todo',
      result: null,
      reason: null,
      feedback: null,
      documents: [],
    };

    // Restore recurrence if config exists
    if (work.recurrence) {
      updateData.isRecurring = true;
      updateData.startAt = this.calculateNextStartAt(work.recurrence, new Date());
    }

    const updated = await super.update(
      id,
      updateData,
      context
    ) as Work;

    // Trigger epic recalculation if this is a task
    await this.triggerParentEpicRecalculation(updated, context);

    return updated;
  }

  /**
   * Action: Cancel work
   * Transition: any → cancelled
   * For recurring works: deactivates recurrence (preserves config for potential reopen)
   */
  async cancelWork(
    id: ObjectId,
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status === 'cancelled') {
      const nextStep = this.hint(context,
        `If you want to restart it, use mcp__Builtin__ReopenWork instead.`,
        `If you want to restart it, use POST /works/{id}/reopen instead.`
      );
      throw new BadRequestException(`Work is already cancelled. ${nextStep}`);
    }

    const updateData: any = { status: 'cancelled' };

    // Deactivate recurrence (preserve config for potential reopen)
    if (work.isRecurring) {
      updateData.isRecurring = false;
    }

    const updated = await super.update(
      id,
      updateData,
      context
    ) as Work;

    // Trigger epic recalculation if this is a task
    await this.triggerParentEpicRecalculation(updated, context);

    return updated;
  }

  /**
   * Action: Assign and move to todo
   * Transition: backlog → todo
   * Requires: assignee must be provided
   */
  async assignAndTodo(
    id: ObjectId,
    assignee: { type: 'user' | 'agent'; id: string },
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status !== 'backlog') {
      const nextStep = this.hint(context,
        `Work is already past backlog (current: ${work.status}). To reassign, update the assignee directly. To unblock, use mcp__Builtin__UnblockWork.`,
        `Work is already past backlog (current: ${work.status}). To reassign, use PATCH /works/{id}. To unblock, use POST /works/{id}/unblock.`
      );
      throw new BadRequestException(
        `Cannot assign-and-todo work with status: ${work.status}. Only backlog works can be moved to todo. ${nextStep}`
      );
    }

    // Validate assignee exists
    await this.validateEntityExists(assignee.type, assignee.id);

    const updated = await super.update(
      id,
      {
        assignee,
        status: 'todo'
      } as any,
      context
    ) as Work;

    // Emit notification
    await this.notificationService.notify({
      type: 'work.assigned',
      workId: (updated as any)._id.toString(),
      work: updated,
      actor: context,
    });

    return updated;
  }

  /**
   * Action: Reject review
   * Transition: review → todo
   * Requires: feedback explaining why work was rejected
   */
  async rejectReview(
    id: ObjectId,
    feedback: string,
    context: RequestContext
  ): Promise<Work> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    if (work.status !== 'review') {
      const nextStep = this.hint(context,
        `Work must be in review status first. Use mcp__Builtin__RequestReviewForWork to submit it for review.`,
        `Work must be in review status first. Use POST /works/{id}/request-review to submit it for review.`
      );
      throw new BadRequestException(
        `Cannot reject work with status: ${work.status}. Only review works can be rejected. ${nextStep}`
      );
    }

    if (!feedback || feedback.trim().length === 0) {
      throw new BadRequestException('Feedback is required when rejecting review');
    }

    return super.update(
      id,
      {
        status: 'todo',
        feedback
      } as any,
      context
    ) as Promise<Work>;
  }

  /**
   * Override softDelete to validate status
   * Only allow deletion when status is 'done' or 'cancelled'
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Work | null> {
    const work = await this.findById(id, context);
    if (!work) {
      throw new BadRequestException('Work not found');
    }

    // Check project lead access
    await this.assertWorkProjectAccess((work as any).projectId, context);

    if (!['done', 'cancelled'].includes(work.status)) {
      const nextStep = this.hint(context,
        `Complete the work first with mcp__Builtin__CompleteWork, or cancel it with mcp__Builtin__CancelWork.`,
        `Complete the work first with POST /works/{id}/complete, or cancel it with POST /works/{id}/cancel.`
      );
      throw new BadRequestException(
        `Cannot delete work with status: ${work.status}. Only done or cancelled works can be deleted. ${nextStep}`
      );
    }

    return super.softDelete(id, context);
  }

  // =============== Epic Status Management ===============

  /**
   * Calculate epic status based on child tasks
   * - in_progress: Default, or when any task is not done/cancelled
   * - done: All tasks are done
   * - cancelled: Only when manually cancelled (not auto-calculated)
   *
   * @param epicId - Epic ID to calculate status for
   * @param context - Request context
   * @returns Calculated status
   */
  async calculateEpicStatus(
    epicId: ObjectId,
    context: RequestContext
  ): Promise<'in_progress' | 'done'> {
    // Verify epic exists and is actually an epic
    const epic = await this.findById(epicId, context);
    if (!epic) {
      throw new BadRequestException('Epic not found');
    }

    if (epic.type !== 'epic') {
      throw new BadRequestException('Work is not an epic');
    }

    // Find all child tasks
    const tasks = await this.workModel.find({
      parentId: epicId.toString(),
      type: 'task',
      isDeleted: false,
    });

    // No tasks yet = in_progress
    if (tasks.length === 0) {
      return 'in_progress';
    }

    // All tasks done = done
    const allDone = tasks.every(t => t.status === 'done');
    if (allDone) {
      return 'done';
    }

    // All tasks done or cancelled, and at least one is done = done
    const allDoneOrCancelled = tasks.every(t =>
      t.status === 'done' || t.status === 'cancelled'
    );
    const someDone = tasks.some(t => t.status === 'done');

    if (allDoneOrCancelled && someDone) {
      return 'done';
    }

    // Default
    return 'in_progress';
  }

  /**
   * Recalculate and update epic status
   * Should be called whenever a child task changes status
   *
   * @param epicId - Epic ID to recalculate
   * @param context - Request context
   */
  async recalculateEpicStatus(
    epicId: ObjectId,
    context: RequestContext
  ): Promise<Work> {
    const newStatus = await this.calculateEpicStatus(epicId, context);

    // Update epic status directly (bypass normal update restrictions)
    const updated = await this.workModel.findByIdAndUpdate(
      epicId,
      {
        status: newStatus,
        updatedBy: context
      },
      { new: true }
    ).exec();

    if (!updated) {
      throw new BadRequestException('Failed to update epic status');
    }

    return updated as Work;
  }

  /**
   * Helper method to trigger epic recalculation if work has parent epic
   * @param work - Work that was updated
   * @param context - Request context
   */
  private async triggerParentEpicRecalculation(
    work: Work,
    context: RequestContext
  ): Promise<void> {
    if (work.type === 'task' && work.parentId) {
      const parent = await this.findById(
        new Types.ObjectId(work.parentId) as any,
        context
      );

      if (parent && parent.type === 'epic') {
        await this.recalculateEpicStatus(
          new Types.ObjectId(work.parentId) as any,
          context
        );
      }
    }
  }

  // =============== Dependency Validation ===============

  /**
   * Validate that all dependencies are resolved (done or cancelled)
   *
   * @param work - Work to validate dependencies for
   * @returns true if all dependencies are resolved or no dependencies exist
   */
  private async validateDependencies(work: Work): Promise<boolean> {
    // No dependencies = always valid
    if (!work.dependencies || work.dependencies.length === 0) {
      return true;
    }

    // Fetch all dependency works
    const dependencyWorks = await this.workModel.find({
      _id: { $in: work.dependencies.map(id => new Types.ObjectId(id)) },
      isDeleted: false,
    });

    // All dependencies must exist (not deleted)
    if (dependencyWorks.length !== work.dependencies.length) {
      return false; // Some dependencies are missing/deleted
    }

    // All dependencies must be in 'done' or 'cancelled' status
    const allResolved = dependencyWorks.every(dep =>
      dep.status === 'done' || dep.status === 'cancelled'
    );

    return allResolved;
  }

  // =============== Get Next Work ===============

  /**
   * Get next work for user/agent based on priority rules
   * See: docs/cbm/NEXT-WORK-PRIORITY-LOGIC.md
   */
  async getNextWork(
    assigneeType: 'user' | 'agent',
    assigneeId: string,
    context: RequestContext
  ): Promise<{
    work: Work | null;
    metadata: {
      priorityLevel: number;
      priorityDescription: string;
      matchedCriteria: string[];
    };
  }> {
    const now = new Date();
    this.logger.debug(`[getNextWork] assigneeType=${assigneeType} assigneeId=${assigneeId} now=${now.toISOString()}`);

    // Priority 1: Recurring tasks with startAt reached
    const p1Filter = {
      type: 'task',
      isRecurring: true,
      'assignee.type': assigneeType,
      'assignee.id': assigneeId,
      status: 'todo',
      startAt: { $lte: now },
      isDeleted: false,
    };
    this.logger.debug(`[getNextWork] P1 filter: ${JSON.stringify(p1Filter)}`);
    const recurringTasks = await this.workModel.find(p1Filter).sort({ startAt: 1 });
    this.logger.debug(`[getNextWork] P1 candidates: ${recurringTasks.length}`);

    for (const task of recurringTasks) {
      const hasSubtasks = await this.workModel.exists({
        type: 'subtask',
        parentId: task._id.toString(),
        isDeleted: false,
      });
      if (hasSubtasks) {
        this.logger.debug(`[getNextWork] P1 skip ${task._id} (has subtasks)`);
        continue;
      }

      if (await this.validateDependencies(task)) {
        this.logger.debug(`[getNextWork] P1 matched: ${task._id}`);
        return {
          work: task,
          metadata: {
            priorityLevel: 1,
            priorityDescription: 'Recurring task with scheduled time reached',
            matchedCriteria: ['assigned_to_me', 'task', 'recurring', 'status_todo', 'startAt_reached', 'no_subtasks', 'dependencies_met']
          }
        };
      } else {
        this.logger.debug(`[getNextWork] P1 skip ${task._id} (dependencies not met)`);
      }
    }

    // Priority 2: Assigned subtasks in todo
    const p2Filter = {
      type: 'subtask',
      'assignee.type': assigneeType,
      'assignee.id': assigneeId,
      status: 'todo',
      isDeleted: false,
    };
    this.logger.debug(`[getNextWork] P2 filter: ${JSON.stringify(p2Filter)}`);
    const subtasks = await this.workModel.find(p2Filter).sort({ createdAt: 1 });
    this.logger.debug(`[getNextWork] P2 candidates: ${subtasks.length}`);

    for (const subtask of subtasks) {
      if (await this.validateDependencies(subtask)) {
        this.logger.debug(`[getNextWork] P2 matched: ${subtask._id}`);
        return {
          work: subtask,
          metadata: {
            priorityLevel: 2,
            priorityDescription: 'Assigned subtask in todo status',
            matchedCriteria: ['assigned_to_me', 'subtask', 'status_todo', 'dependencies_met']
          }
        };
      } else {
        this.logger.debug(`[getNextWork] P2 skip ${subtask._id} (dependencies not met)`);
      }
    }

    // Priority 3: Assigned tasks without subtasks in todo
    // Exclude scheduled/recurring tasks whose startAt hasn't been reached yet
    const p3Filter = {
      type: 'task',
      'assignee.type': assigneeType,
      'assignee.id': assigneeId,
      status: 'todo',
      isDeleted: false,
      $or: [
        { startAt: { $exists: false } },
        { startAt: null },
        { startAt: { $lte: now } },
      ],
    };
    this.logger.debug(`[getNextWork] P3 filter: ${JSON.stringify(p3Filter)}`);
    const tasks = await this.workModel.find(p3Filter).sort({ createdAt: 1 });
    this.logger.debug(`[getNextWork] P3 candidates: ${tasks.length}`);

    for (const task of tasks) {
      // Check if task has subtasks
      const hasSubtasks = await this.workModel.exists({
        type: 'subtask',
        parentId: task._id.toString(),
        isDeleted: false
      });

      if (hasSubtasks) {
        this.logger.debug(`[getNextWork] P3 skip ${task._id} (has subtasks)`);
        continue;
      }

      // Check dependencies
      if (await this.validateDependencies(task)) {
        this.logger.debug(`[getNextWork] P3 matched: ${task._id}`);
        return {
          work: task,
          metadata: {
            priorityLevel: 3,
            priorityDescription: 'Assigned task without subtasks in todo status',
            matchedCriteria: ['assigned_to_me', 'task', 'status_todo', 'no_subtasks', 'dependencies_met']
          }
        };
      } else {
        this.logger.debug(`[getNextWork] P3 skip ${task._id} (dependencies not met)`);
      }
    }

    // Priority 4: Reported works in blocked status
    const p4Filter = {
      type: { $in: ['task', 'subtask'] },
      'reporter.type': assigneeType,
      'reporter.id': assigneeId,
      status: 'blocked',
      isDeleted: false,
    };
    this.logger.debug(`[getNextWork] P4 filter: ${JSON.stringify(p4Filter)}`);
    const blockedWork = await this.workModel.findOne(p4Filter).sort({ createdAt: 1 });
    this.logger.debug(`[getNextWork] P4 result: ${blockedWork?._id ?? 'none'}`);

    if (blockedWork) {
      return {
        work: blockedWork,
        metadata: {
          priorityLevel: 4,
          priorityDescription: 'Reported work in blocked status requiring resolution',
          matchedCriteria: ['reported_by_me', 'status_blocked']
        }
      };
    }

    // Priority 5: Reported works in review status
    const p5Filter = {
      type: { $in: ['task', 'subtask'] },
      'reporter.type': assigneeType,
      'reporter.id': assigneeId,
      status: 'review',
      isDeleted: false,
    };
    this.logger.debug(`[getNextWork] P5 filter: ${JSON.stringify(p5Filter)}`);
    const reviewWork = await this.workModel.findOne(p5Filter).sort({ createdAt: 1 });
    this.logger.debug(`[getNextWork] P5 result: ${reviewWork?._id ?? 'none'}`);

    if (reviewWork) {
      return {
        work: reviewWork,
        metadata: {
          priorityLevel: 5,
          priorityDescription: 'Reported work in review status awaiting approval',
          matchedCriteria: ['reported_by_me', 'status_review']
        }
      };
    }

    this.logger.debug(`[getNextWork] No work found for assigneeType=${assigneeType} assigneeId=${assigneeId}`);
    // No work found
    return {
      work: null,
      metadata: {
        priorityLevel: 0,
        priorityDescription: 'No work available',
        matchedCriteria: []
      }
    };
  }

  // =============== Internal Service-to-Service API ===============

  /**
   * Get next work for user/agent (Internal API - service-to-service)
   * Similar to getNextWork but uses orgId for context filtering
   *
   * @param assigneeType - 'user' or 'agent'
   * @param assigneeId - ID of the assignee
   * @param orgId - Organization ID for filtering
   */
  async getNextWorkInternal(
    assigneeType: 'user' | 'agent',
    assigneeId: string,
    orgId: string
  ): Promise<{
    work: Work | null;
    metadata: {
      priorityLevel: number;
      priorityDescription: string;
      matchedCriteria: string[];
    };
  }> {
    const orgFilter = { 'owner.orgId': orgId, isDeleted: false };
    const now = new Date();

    // Priority 1: Recurring tasks with startAt reached
    const recurringTasks = await this.workModel.find({
      ...orgFilter,
      type: 'task',
      isRecurring: true,
      'assignee.type': assigneeType,
      'assignee.id': assigneeId,
      status: 'todo',
      startAt: { $lte: now },
    }).sort({ startAt: 1 });

    for (const task of recurringTasks) {
      const hasSubtasks = await this.workModel.exists({
        type: 'subtask',
        parentId: task._id.toString(),
        isDeleted: false,
      });
      if (hasSubtasks) continue;

      if (await this.validateDependencies(task)) {
        return {
          work: task,
          metadata: {
            priorityLevel: 1,
            priorityDescription: 'Recurring task with scheduled time reached',
            matchedCriteria: ['assigned_to_me', 'task', 'recurring', 'status_todo', 'startAt_reached', 'no_subtasks', 'dependencies_met']
          }
        };
      }
    }

    // Priority 2: Assigned subtasks in todo
    const subtasks = await this.workModel.find({
      ...orgFilter,
      type: 'subtask',
      'assignee.type': assigneeType,
      'assignee.id': assigneeId,
      status: 'todo',
    }).sort({ createdAt: 1 });

    for (const subtask of subtasks) {
      if (await this.validateDependencies(subtask)) {
        return {
          work: subtask,
          metadata: {
            priorityLevel: 2,
            priorityDescription: 'Assigned subtask in todo status',
            matchedCriteria: ['assigned_to_me', 'subtask', 'status_todo', 'dependencies_met']
          }
        };
      }
    }

    // Priority 3: Assigned tasks without subtasks in todo
    // Exclude scheduled/recurring tasks whose startAt hasn't been reached yet
    const tasks = await this.workModel.find({
      ...orgFilter,
      type: 'task',
      'assignee.type': assigneeType,
      'assignee.id': assigneeId,
      status: 'todo',
      $or: [
        { startAt: { $exists: false } },
        { startAt: null },
        { startAt: { $lte: now } },
      ],
    }).sort({ createdAt: 1 });

    for (const task of tasks) {
      // Check if task has subtasks
      const hasSubtasks = await this.workModel.exists({
        type: 'subtask',
        parentId: task._id.toString(),
        isDeleted: false
      });

      if (hasSubtasks) continue; // Skip tasks with subtasks

      // Check dependencies
      if (await this.validateDependencies(task)) {
        return {
          work: task,
          metadata: {
            priorityLevel: 3,
            priorityDescription: 'Assigned task without subtasks in todo status',
            matchedCriteria: ['assigned_to_me', 'task', 'status_todo', 'no_subtasks', 'dependencies_met']
          }
        };
      }
    }

    // Priority 4: Reported works in blocked status
    const blockedWork = await this.workModel.findOne({
      ...orgFilter,
      type: { $in: ['task', 'subtask'] },
      'reporter.type': assigneeType,
      'reporter.id': assigneeId,
      status: 'blocked',
    }).sort({ createdAt: 1 });

    if (blockedWork) {
      return {
        work: blockedWork,
        metadata: {
          priorityLevel: 4,
          priorityDescription: 'Reported work in blocked status requiring resolution',
          matchedCriteria: ['reported_by_me', 'status_blocked']
        }
      };
    }

    // Priority 5: Reported works in review status
    const reviewWork = await this.workModel.findOne({
      ...orgFilter,
      type: { $in: ['task', 'subtask'] },
      'reporter.type': assigneeType,
      'reporter.id': assigneeId,
      status: 'review',
    }).sort({ createdAt: 1 });

    if (reviewWork) {
      return {
        work: reviewWork,
        metadata: {
          priorityLevel: 5,
          priorityDescription: 'Reported work in review status awaiting approval',
          matchedCriteria: ['reported_by_me', 'status_review']
        }
      };
    }

    // No work found
    return {
      work: null,
      metadata: {
        priorityLevel: 0,
        priorityDescription: 'No work available',
        matchedCriteria: []
      }
    };
  }

  // =============== Agent Triggering ===============

  /**
   * Check if work can trigger agent execution
   * A work can trigger agent when:
   * 1. Assignee is an agent (not a user)
   * 2. Work has startAt date/time set
   * 3. Current time >= startAt time
   * 4. Status is 'todo' or 'in_progress'
   * 5. Work has no dependencies (dependencies array is empty)
   */
  async canTriggerAgent(
    id: ObjectId,
    context: RequestContext
  ): Promise<{
    canTrigger: boolean;
    reason: string;
    work: Work | null;
  }> {
    const work = await this.findById(id, context);

    if (!work) {
      return {
        canTrigger: false,
        reason: 'Work not found',
        work: null,
      };
    }

    // Check 1: Assignee must be an agent
    if (!work.assignee || work.assignee.type !== 'agent') {
      return {
        canTrigger: false,
        reason: 'Work is not assigned to an agent',
        work,
      };
    }

    // Check 2: Must have startAt date
    if (!work.startAt) {
      return {
        canTrigger: false,
        reason: 'Work does not have a startAt date/time',
        work,
      };
    }

    // Check 3: Current time must be >= startAt
    const now = new Date();
    const startAt = new Date(work.startAt);
    if (now < startAt) {
      return {
        canTrigger: false,
        reason: `Work is scheduled to start at ${startAt.toISOString()}, current time is ${now.toISOString()}`,
        work,
      };
    }

    // Check 4: Status must be todo or in_progress
    if (!['todo', 'in_progress'].includes(work.status)) {
      return {
        canTrigger: false,
        reason: `Work status is '${work.status}', must be 'todo' or 'in_progress'`,
        work,
      };
    }

    // Check 5: Must have no dependencies
    if (work.dependencies && work.dependencies.length > 0) {
      return {
        canTrigger: false,
        reason: `Work has ${work.dependencies.length} dependency/dependencies: ${work.dependencies.join(', ')}`,
        work,
      };
    }

    // All conditions met
    return {
      canTrigger: true,
      reason: 'All conditions met: assigned to agent, startAt time reached, status is ready, no dependencies',
      work,
    };
  }

  // =============== Recurrence Logic ===============

  /**
   * Validate recurrence configuration
   * Only type=task can have recurrence. Validates required fields per recurrence type.
   */
  private validateRecurrenceConfig(data: { type?: string; recurrence?: RecurrenceConfig }): void {
    if (data.type !== 'task') {
      throw new BadRequestException(
        'Recurrence is only allowed for type=task. Epic and subtask cannot be recurring.'
      );
    }

    const config = data.recurrence!;

    switch (config.type) {
      case 'onetime':
        // No additional fields required — startAt is validated in create()
        break;

      case 'interval':
        if (!config.intervalMinutes || config.intervalMinutes < 1) {
          throw new BadRequestException(
            'intervalMinutes is required and must be >= 1 when recurrence type is interval'
          );
        }
        break;

      case 'daily':
        if (!config.timesOfDay || config.timesOfDay.length === 0) {
          throw new BadRequestException(
            'timesOfDay is required and must have at least 1 entry when recurrence type is daily'
          );
        }
        break;

      case 'weekly':
        if (!config.daysOfWeek || config.daysOfWeek.length === 0) {
          throw new BadRequestException(
            'daysOfWeek is required when recurrence type is weekly'
          );
        }
        if (!config.timesOfDay || config.timesOfDay.length === 0) {
          throw new BadRequestException(
            'timesOfDay is required when recurrence type is weekly'
          );
        }
        break;

      case 'monthly':
        if (!config.daysOfMonth || config.daysOfMonth.length === 0) {
          throw new BadRequestException(
            'daysOfMonth is required when recurrence type is monthly'
          );
        }
        if (!config.timesOfDay || config.timesOfDay.length === 0) {
          throw new BadRequestException(
            'timesOfDay is required when recurrence type is monthly'
          );
        }
        break;
    }

    if (config.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: config.timezone });
      } catch {
        throw new BadRequestException(`Invalid timezone: ${config.timezone}`);
      }
    }
  }

  /**
   * Calculate the next startAt date based on recurrence config
   * @param config - RecurrenceConfig
   * @param fromDate - Reference date (usually current time when completing)
   * @returns Next scheduled Date (UTC)
   */
  calculateNextStartAt(config: RecurrenceConfig, fromDate: Date): Date {
    switch (config.type) {
      case 'onetime':
        // Onetime does not calculate next startAt — return fromDate as fallback
        return fromDate;

      case 'interval':
        return new Date(fromDate.getTime() + config.intervalMinutes! * 60 * 1000);

      case 'daily':
        return this.findNextDailyOccurrence(config.timesOfDay!, config.timezone || 'UTC', fromDate);

      case 'weekly':
        return this.findNextWeeklyOccurrence(
          config.daysOfWeek!, config.timesOfDay!, config.timezone || 'UTC', fromDate
        );

      case 'monthly':
        return this.findNextMonthlyOccurrence(
          config.daysOfMonth!, config.timesOfDay!, config.timezone || 'UTC', fromDate
        );
    }
  }

  /**
   * Find next daily occurrence from sorted timesOfDay after fromDate
   */
  private findNextDailyOccurrence(timesOfDay: string[], tz: string, from: Date): Date {
    const sortedTimes = [...timesOfDay].sort();

    // Check up to 2 days (today + tomorrow)
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      for (const time of sortedTimes) {
        const candidate = this.buildDateInTimezone(from, dayOffset, time, tz);
        if (candidate > from) {
          return candidate;
        }
      }
    }

    // Fallback: first time tomorrow (should not reach here)
    return this.buildDateInTimezone(from, 1, sortedTimes[0], tz);
  }

  /**
   * Find next weekly occurrence on specified daysOfWeek at specified times
   */
  private findNextWeeklyOccurrence(
    daysOfWeek: number[], timesOfDay: string[], tz: string, from: Date
  ): Date {
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    const sortedTimes = [...timesOfDay].sort();

    // Scan up to 8 days forward (covers full week + today)
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const candidateDate = new Date(from.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayOfWeek = this.getDayOfWeekInTimezone(candidateDate, tz);

      if (sortedDays.includes(dayOfWeek)) {
        for (const time of sortedTimes) {
          const candidate = this.buildDateInTimezone(from, dayOffset, time, tz);
          if (candidate > from) {
            return candidate;
          }
        }
      }
    }

    // Fallback: first matching day next week
    return this.buildDateInTimezone(from, 7, sortedTimes[0], tz);
  }

  /**
   * Find next monthly occurrence on specified daysOfMonth at specified times
   */
  private findNextMonthlyOccurrence(
    daysOfMonth: number[], timesOfDay: string[], tz: string, from: Date
  ): Date {
    const sortedDays = [...daysOfMonth].sort((a, b) => a - b);
    const sortedTimes = [...timesOfDay].sort();

    // Check current month and next month
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const refDate = new Date(from);
      refDate.setMonth(refDate.getMonth() + monthOffset);

      const year = this.getYearInTimezone(monthOffset === 0 ? from : refDate, tz);
      const month = this.getMonthInTimezone(monthOffset === 0 ? from : refDate, tz);
      const lastDay = new Date(year, month + 1, 0).getDate();

      for (const day of sortedDays) {
        const actualDay = Math.min(day, lastDay); // Clamp to last day of month

        for (const time of sortedTimes) {
          const candidate = this.buildDateFromParts(year, month, actualDay, time, tz);
          if (candidate > from) {
            return candidate;
          }
        }
      }
    }

    // Fallback: first configured day, 2 months ahead
    const fallbackDate = new Date(from);
    fallbackDate.setMonth(fallbackDate.getMonth() + 2);
    const year = this.getYearInTimezone(fallbackDate, tz);
    const month = this.getMonthInTimezone(fallbackDate, tz);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const actualDay = Math.min(sortedDays[0], lastDay);
    return this.buildDateFromParts(year, month, actualDay, sortedTimes[0], tz);
  }

  /**
   * Build a UTC Date from a reference date + day offset + time string in the given timezone
   */
  private buildDateInTimezone(refDate: Date, dayOffset: number, time: string, tz: string): Date {
    const offsetDate = new Date(refDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const year = this.getYearInTimezone(offsetDate, tz);
    const month = this.getMonthInTimezone(offsetDate, tz);
    const day = this.getDayInTimezone(offsetDate, tz);
    return this.buildDateFromParts(year, month, day, time, tz);
  }

  /**
   * Build a UTC Date from explicit year/month/day + time string in a timezone
   */
  private buildDateFromParts(year: number, month: number, day: number, time: string, tz: string): Date {
    const [hours, minutes] = time.split(':').map(Number);

    // Create a date string in the target timezone and convert to UTC
    // Use a temporary date to find the UTC offset for the target timezone
    const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time}:00`;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });

    // Binary search approach: create UTC date and adjust by timezone offset
    const utcGuess = new Date(`${localDateStr}Z`);
    const parts = formatter.formatToParts(utcGuess);
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');

    // Calculate offset: what UTC time gives us the desired local time
    const offsetMs = (
      (tzHour - hours) * 60 * 60 * 1000 +
      (tzMinute - minutes) * 60 * 1000 +
      (tzDay - day) * 24 * 60 * 60 * 1000
    );

    return new Date(utcGuess.getTime() - offsetMs);
  }

  private getYearInTimezone(date: Date, tz: string): number {
    return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(date));
  }

  private getMonthInTimezone(date: Date, tz: string): number {
    return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(date)) - 1;
  }

  private getDayInTimezone(date: Date, tz: string): number {
    return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(date));
  }

  private getDayOfWeekInTimezone(date: Date, tz: string): number {
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return dayMap[dayName] ?? 0;
  }
}
