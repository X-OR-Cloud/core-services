import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Query, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './tasks.dto';

@ApiTags('tasks')
@ApiBearerAuth('JWT-auth')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create task', description: 'Create a new task/reminder' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body(ValidationPipe) createTaskDto: CreateTaskDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.tasksService.create(createTaskDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks', description: 'Retrieve list of tasks with optional filters' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  @ApiQuery({ name: 'conversationId', required: false })
  @ApiQuery({ name: 'platformUserId', required: false })
  @ApiQuery({ name: 'soulId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'done', 'cancelled', 'overdue', 'snoozed'] })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto & { conversationId?: string; platformUserId?: string; soulId?: string; status?: string },
    @CurrentUser() context: RequestContext,
  ) {
    const filter: any = {};
    if (query.conversationId) filter.conversationId = query.conversationId;
    if (query.platformUserId) filter.platformUserId = query.platformUserId;
    if (query.soulId) filter.soulId = query.soulId;
    if (query.status) filter.status = query.status;

    return this.tasksService.findAll({ ...query, filter }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: 200, description: 'Task found' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const task = await this.tasksService.findById(new Types.ObjectId(id) as any, context);
    if (!task) throw new NotFoundException(`Task with ID ${id} not found`);
    return task;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateTaskDto: UpdateTaskDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.tasksService.update(new Types.ObjectId(id) as any, updateTaskDto as any, context);
    if (!updated) throw new NotFoundException(`Task with ID ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const deleted = await this.tasksService.softDelete(new Types.ObjectId(id) as any, context);
    if (!deleted) throw new NotFoundException(`Task with ID ${id} not found`);
    return { message: 'Task deleted successfully' };
  }
}
