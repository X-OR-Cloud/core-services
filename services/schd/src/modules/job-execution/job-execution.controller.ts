import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Query,
  NotFoundException,
  HttpCode,
  HttpStatus,
  BadRequestException,
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
  ApiReadErrors,
  ApiUpdateErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { JobExecutionService } from './job-execution.service';
import {
  ExecutionStatsQueryDto,
  ExecutionStatsResponseDto,
  RetryExecutionResponseDto,
  JobExecutionFilterDto,
} from './job-execution.dto';
import { EXECUTION_STATUS } from '../../config/scheduler.config';

@ApiTags('executions')
@ApiBearerAuth('JWT-auth')
@Controller('executions')
export class JobExecutionController {
  constructor(private readonly executionService: JobExecutionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all executions', description: 'Retrieve list of all job executions with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Executions retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.executionService.findAll(query, context);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get execution statistics', description: 'Get aggregated statistics for job executions' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully', type: ExecutionStatsResponseDto })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getStats(
    @Query() query: ExecutionStatsQueryDto,
    @CurrentUser() context: RequestContext,
  ): Promise<ExecutionStatsResponseDto> {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return this.executionService.getStats(
      query.jobId,
      startDate,
      endDate,
      context,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get execution by ID', description: 'Retrieve a single job execution by ID' })
  @ApiResponse({ status: 200, description: 'Execution found' })
  @ApiReadErrors()
  @ApiParam({ name: 'id', description: 'Execution ID' })
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const execution = await this.executionService.findById(new Types.ObjectId(id) as any, context);
    if (!execution) {
      throw new NotFoundException(`Execution with ID ${id} not found`);
    }
    return execution;
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry failed execution', description: 'Manually retry a failed or timed out execution' })
  @ApiResponse({ status: 200, description: 'Retry initiated successfully', type: RetryExecutionResponseDto })
  @ApiUpdateErrors()
  @ApiParam({ name: 'id', description: 'Execution ID' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async retry(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<RetryExecutionResponseDto> {
    const execution = await this.executionService.findById(new Types.ObjectId(id) as any, context);
    if (!execution) {
      throw new NotFoundException(`Execution with ID ${id} not found`);
    }

    // Only allow retry for failed or timeout executions
    if (![EXECUTION_STATUS.FAILED, EXECUTION_STATUS.TIMEOUT].includes(execution.status as any)) {
      throw new BadRequestException(
        `Cannot retry execution with status "${execution.status}". Only failed or timeout executions can be retried.`,
      );
    }

    // TODO: Integrate with ScheduledJobService and trigger new execution
    // For now, return placeholder response
    return {
      executionId: 'pending-implementation',
      retryOf: id,
      retryCount: execution.retryCount + 1,
      status: 'pending',
      message: 'Manual retry will be implemented with Queue system',
    };
  }
}

@ApiTags('jobs')
@ApiBearerAuth('JWT-auth')
@Controller('jobs/:jobId/executions')
export class JobExecutionsController {
  constructor(private readonly executionService: JobExecutionService) {}

  @Get()
  @ApiOperation({ summary: 'Get executions for a job', description: 'Retrieve execution history for a specific job' })
  @ApiResponse({ status: 200, description: 'Executions retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @ApiParam({ name: 'jobId', description: 'Scheduled job ID' })
  @UseGuards(JwtAuthGuard)
  async findByJob(
    @Param('jobId') jobId: string,
    @Query() query: JobExecutionFilterDto,
    @CurrentUser() context: RequestContext,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 10;

    return this.executionService.findByJobId(jobId, page, limit, context);
  }
}
