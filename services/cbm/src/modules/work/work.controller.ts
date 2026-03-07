import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  ApiKeyGuard,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { WorkService } from './work.service';
import {
  CreateWorkDto,
  UpdateWorkDto,
  BlockWorkDto,
  AssignAndTodoDto,
  RejectReviewDto,
  UnblockWorkDto,
  RequestReviewDto,
  GetNextWorkQueryDto,
  InternalGetNextWorkDto,
} from './work.dto';

@ApiTags('Works')
@ApiBearerAuth()
@Controller('works')
export class WorkController {
  constructor(private readonly workService: WorkService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new work' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createWorkDto: CreateWorkDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.create(createWorkDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all works with pagination and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const options = parseQueryString(query);
    return this.workService.findAll(options, context);
  }

  @Get('next-work')
  @ApiOperation({
    summary: 'Get next work for user/agent',
    description: 'Returns the next work item based on priority rules. See docs/cbm/NEXT-WORK-PRIORITY-LOGIC.md'
  })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getNextWork(
    @Query() query: GetNextWorkQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.getNextWork(
      query.assigneeType,
      query.assigneeId,
      context
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get work by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update work by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateWorkDto: UpdateWorkDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.update(new Types.ObjectId(id) as any, updateWorkDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete work by ID (only done/cancelled)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // =============== Action Endpoints ===============

  @Post(':id/start')
  @ApiOperation({
    summary: 'Start work',
    description: 'Transition work from todo to in_progress status'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async start(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.startWork(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/block')
  @ApiOperation({
    summary: 'Block work',
    description: 'Transition work from in_progress to blocked status. Requires a reason explaining why the work is blocked.'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async block(
    @Param('id') id: string,
    @Body() blockWorkDto: BlockWorkDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.blockWork(
      new Types.ObjectId(id) as any,
      blockWorkDto.reason,
      context
    );
  }

  @Post(':id/unblock')
  @ApiOperation({
    summary: 'Unblock work',
    description: 'Transition work from blocked to todo status with optional feedback'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async unblock(
    @Param('id') id: string,
    @Body() unblockWorkDto: UnblockWorkDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.unblockWork(
      new Types.ObjectId(id) as any,
      unblockWorkDto.feedback,
      context
    );
  }

  @Post(':id/request-review')
  @ApiOperation({
    summary: 'Request review',
    description: 'Transition work from in_progress to review status. Optionally attach a result summary and document IDs.'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async requestReview(
    @Param('id') id: string,
    @Body() body: RequestReviewDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.requestReview(new Types.ObjectId(id) as any, body, context);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Complete work',
    description: 'Transition work from review to done status. For recurring tasks: resets status to todo and calculates next startAt automatically.'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async complete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.completeWork(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/reopen')
  @ApiOperation({
    summary: 'Reopen work',
    description: 'Transition work from done or cancelled to in_progress status. For works with recurrence config: restores isRecurring and recalculates startAt.'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async reopen(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.reopenWork(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel work',
    description: 'Transition work from any status to cancelled. For recurring works: deactivates recurrence (preserves config for potential reopen).'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.cancelWork(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/assign-and-todo')
  @ApiOperation({
    summary: 'Assign and move to todo',
    description: 'Assign work to user/agent and transition from backlog to todo status'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async assignAndTodo(
    @Param('id') id: string,
    @Body() assignAndTodoDto: AssignAndTodoDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.assignAndTodo(
      new Types.ObjectId(id) as any,
      assignAndTodoDto.assignee,
      context
    );
  }

  @Post(':id/reject-review')
  @ApiOperation({
    summary: 'Reject review',
    description: 'Reject work from review status and move back to todo with feedback'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async rejectReview(
    @Param('id') id: string,
    @Body() rejectReviewDto: RejectReviewDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.rejectReview(
      new Types.ObjectId(id) as any,
      rejectReviewDto.feedback,
      context
    );
  }

  @Post(':id/recalculate-status')
  @ApiOperation({
    summary: 'Recalculate epic status',
    description: 'Manually recalculate epic status based on child tasks. Only applies to epics.'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async recalculateStatus(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.recalculateEpicStatus(
      new Types.ObjectId(id) as any,
      context
    );
  }

  @Get(':id/can-trigger')
  @ApiOperation({
    summary: 'Check if work can trigger agent execution',
    description: 'Validates if work meets all conditions to trigger agent: assigned to agent, startAt time reached, status ready, not blocked'
  })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async canTrigger(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workService.canTriggerAgent(new Types.ObjectId(id) as any, context);
  }

  // =============== Internal Service-to-Service Endpoints ===============

  @Post('internal/next-work')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get next work for user/agent (Internal API)',
    description: 'Internal API for service-to-service communication. Returns the next work item based on priority rules. Protected by API Key authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Next work retrieved successfully',
    schema: {
      example: {
        work: {
          _id: '507f1f77bcf86cd799439011',
          title: 'Implement user authentication',
          type: 'task',
          status: 'todo',
          assignee: { type: 'agent', id: '507f1f77bcf86cd799439012' },
          reporter: { type: 'user', id: '507f1f77bcf86cd799439013' },
        },
        metadata: {
          priorityLevel: 2,
          priorityDescription: 'Assigned task without subtasks in todo status',
          matchedCriteria: ['assigned_to_me', 'task', 'status_todo', 'no_subtasks', 'dependencies_met'],
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid API key',
  })
  @UseGuards(ApiKeyGuard)
  async getNextWorkInternal(
    @Body() dto: InternalGetNextWorkDto
  ) {
    return this.workService.getNextWorkInternal(
      dto.assigneeType,
      dto.assigneeId,
      dto.orgId
    );
  }
}
