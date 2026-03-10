import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ReminderService } from './reminder.service';
import { CreateReminderDto, UpdateReminderDto, ListRemindersDto } from './reminder.dto';

@ApiTags('reminders')
@ApiBearerAuth('JWT-auth')
@Controller('agents/reminders')
@UseGuards(JwtAuthGuard)
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Post()
  @ApiOperation({ summary: 'Create reminder', description: 'Create a new reminder for the current agent' })
  @ApiResponse({ status: 201, description: 'Reminder created successfully' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateReminderDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.reminderService.create(dto, context.agentId, context);
  }

  @Get()
  @ApiOperation({ summary: 'List reminders', description: 'List reminders for the current agent' })
  @ApiResponse({ status: 200, description: 'Reminders retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: ListRemindersDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.reminderService.findByAgent(context.agentId, query.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update reminder', description: 'Update content or triggerAt of a reminder' })
  @ApiResponse({ status: 200, description: 'Reminder updated successfully' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.reminderService.update(id, dto, context.agentId);
  }

  @Post(':id/done')
  @ApiOperation({ summary: 'Mark reminder as done', description: 'Mark a reminder as done after acting on it' })
  @ApiResponse({ status: 200, description: 'Reminder marked as done' })
  @ApiUpdateErrors()
  async markDone(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.reminderService.markDone(id, context.agentId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete reminder', description: 'Hard delete a reminder' })
  @ApiResponse({ status: 200, description: 'Reminder deleted successfully' })
  @ApiDeleteErrors()
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.reminderService.delete(id, context.agentId);
  }
}
