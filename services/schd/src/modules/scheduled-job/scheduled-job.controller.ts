import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Query,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  PaginationQueryDto,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { ScheduledJobService } from './scheduled-job.service';
import {
  CreateScheduledJobDto,
  UpdateScheduledJobDto,
  TriggerJobResponseDto,
  NextRunsQueryDto,
  NextRunsResponseDto,
} from './scheduled-job.dto';

@ApiTags('jobs')
@ApiBearerAuth('JWT-auth')
@Controller('jobs')
export class ScheduledJobController {
  constructor(private readonly scheduledJobService: ScheduledJobService) {}

  @Post()
  @ApiOperation({ summary: 'Create scheduled job', description: 'Create a new scheduled job' })
  @ApiResponse({ status: 201, description: 'Scheduled job created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateScheduledJobDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.scheduledJobService.create(createDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all scheduled jobs', description: 'Retrieve list of all scheduled jobs with pagination' })
  @ApiResponse({ status: 200, description: 'Scheduled jobs retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.scheduledJobService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get scheduled job by ID', description: 'Retrieve a single scheduled job by ID' })
  @ApiResponse({ status: 200, description: 'Scheduled job found' })
  @ApiReadErrors()
  @ApiParam({ name: 'id', description: 'Scheduled job ID' })
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const job = await this.scheduledJobService.findById(new Types.ObjectId(id) as any, context);
    if (!job) {
      throw new NotFoundException(`Scheduled job with ID ${id} not found`);
    }
    return job;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update scheduled job', description: 'Update scheduled job information' })
  @ApiResponse({ status: 200, description: 'Scheduled job updated successfully' })
  @ApiUpdateErrors()
  @ApiParam({ name: 'id', description: 'Scheduled job ID' })
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateScheduledJobDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.scheduledJobService.updateJob(id, updateDto, context);
    if (!updated) {
      throw new NotFoundException(`Scheduled job with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete scheduled job', description: 'Soft delete a scheduled job' })
  @ApiResponse({ status: 200, description: 'Scheduled job deleted successfully' })
  @ApiDeleteErrors()
  @ApiParam({ name: 'id', description: 'Scheduled job ID' })
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.scheduledJobService.remove(id, context);
    return { message: 'Scheduled job deleted successfully' };
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable scheduled job', description: 'Enable a scheduled job' })
  @ApiResponse({ status: 200, description: 'Scheduled job enabled successfully' })
  @ApiUpdateErrors()
  @ApiParam({ name: 'id', description: 'Scheduled job ID' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async enable(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const job = await this.scheduledJobService.enable(id, context);
    if (!job) {
      throw new NotFoundException(`Scheduled job with ID ${id} not found`);
    }
    return { message: 'Scheduled job enabled successfully', job };
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable scheduled job', description: 'Disable a scheduled job' })
  @ApiResponse({ status: 200, description: 'Scheduled job disabled successfully' })
  @ApiUpdateErrors()
  @ApiParam({ name: 'id', description: 'Scheduled job ID' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async disable(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const job = await this.scheduledJobService.disable(id, context);
    if (!job) {
      throw new NotFoundException(`Scheduled job with ID ${id} not found`);
    }
    return { message: 'Scheduled job disabled successfully', job };
  }

  @Post(':id/trigger')
  @ApiOperation({ summary: 'Manually trigger job', description: 'Manually trigger a scheduled job execution' })
  @ApiResponse({ status: 200, description: 'Job triggered successfully', type: TriggerJobResponseDto })
  @ApiUpdateErrors()
  @ApiParam({ name: 'id', description: 'Scheduled job ID' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async trigger(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<TriggerJobResponseDto> {
    const job = await this.scheduledJobService.findById(new Types.ObjectId(id) as any, context);
    if (!job) {
      throw new NotFoundException(`Scheduled job with ID ${id} not found`);
    }

    // TODO: Integrate with JobExecutionService to create execution and trigger
    // For now, return placeholder response
    return {
      executionId: 'pending-implementation',
      jobId: id,
      status: 'triggered',
      message: 'Job trigger will be implemented with JobExecution module',
    };
  }

  @Get(':id/next-runs')
  @ApiOperation({ summary: 'Preview next run times', description: 'Get the next N scheduled run times for a job' })
  @ApiResponse({ status: 200, description: 'Next runs retrieved successfully', type: NextRunsResponseDto })
  @ApiReadErrors()
  @ApiParam({ name: 'id', description: 'Scheduled job ID' })
  @UseGuards(JwtAuthGuard)
  async getNextRuns(
    @Param('id') id: string,
    @Query() query: NextRunsQueryDto,
    @CurrentUser() context: RequestContext,
  ): Promise<NextRunsResponseDto> {
    const job = await this.scheduledJobService.findById(new Types.ObjectId(id) as any, context);
    if (!job) {
      throw new NotFoundException(`Scheduled job with ID ${id} not found`);
    }

    const count = query.count || 5;
    const nextRuns = this.scheduledJobService.getNextRuns(
      job.cronExpression,
      job.timezone,
      count,
    );

    return { nextRuns };
  }
}
