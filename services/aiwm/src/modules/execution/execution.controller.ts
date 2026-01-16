import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ExecutionService } from './execution.service';
import { ExecutionOrchestrator } from './execution.orchestrator';
import { Execution } from './execution.schema';
import {
  CreateExecutionDto,
  ExecutionQueryDto,
  StartExecutionDto,
  CancelExecutionDto,
  RetryExecutionDto,
  TriggerWorkflowDto,
} from './execution.dto';

@ApiTags('executions')
@ApiBearerAuth()
@Controller('executions')
export class ExecutionController {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly executionOrchestrator: ExecutionOrchestrator
  ) {}

  /**
   * Create a new execution
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new execution' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateExecutionDto,
    @CurrentUser() context: RequestContext
  ): Promise<Execution> {
    return await this.executionService.createExecution(dto, context);
  }

  /**
   * List executions with filters and pagination
   */
  @Get()
  @ApiOperation({ summary: 'List executions with filters' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: ExecutionQueryDto
  ): Promise<{
    data: Execution[];
    total: number;
    page: number;
    limit: number;
  }> {
    return await this.executionService.queryExecutions(query);
  }

  /**
   * Get execution by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get execution by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ): Promise<Execution | null> {
    const { Types } = await import('mongoose');
    return await this.executionService.findById(new Types.ObjectId(id) as any, context);
  }

  /**
   * Start an execution
   */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start an execution' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async start(
    @Param('id') id: string,
    @Body() dto: StartExecutionDto
  ): Promise<Execution> {
    return await this.executionOrchestrator.startExecution(id, dto.force);
  }

  /**
   * Cancel an execution
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an execution' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelExecutionDto
  ): Promise<Execution | null> {
    return await this.executionService.cancelExecution(id, dto.reason);
  }

  /**
   * Retry a failed/timeout execution
   */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed/timeout execution' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async retry(
    @Param('id') id: string,
    @Body() dto: RetryExecutionDto
  ): Promise<Execution | null> {
    // Retry execution
    const execution = await this.executionService.retryExecution(
      id,
      dto.resetSteps
    );

    if (!execution) {
      return null;
    }

    // Resume execution
    await this.executionOrchestrator.resumeExecution(id);

    return execution;
  }

  /**
   * Get execution statistics
   */
  @Get('_statistics/summary')
  @ApiOperation({ summary: 'Get execution statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
  }> {
    return await this.executionService.getStatistics();
  }

  // ============================================================================
  // WORKFLOW EXECUTION ENDPOINTS (Phase 3)
  // ============================================================================

  /**
   * Trigger workflow execution
   * Supports async mode (queue), sync mode (immediate), and step testing
   */
  @Post('workflows/:workflowId/trigger')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger workflow execution' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async triggerWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() dto: TriggerWorkflowDto,
    @CurrentUser() context: RequestContext
  ): Promise<{
    executionId: string;
    status: string;
    message: string;
    output?: any;
    result?: any;
    error?: any;
  }> {
    // Validate: if stepId is provided, sync must be true
    if (dto.stepId && !dto.sync) {
      throw new BadRequestException('Step testing requires sync mode (sync=true)');
    }

    // Async mode (default)
    if (!dto.sync) {
      const execution = await this.executionService.triggerWorkflow(
        workflowId,
        dto.input,
        context
      );

      return {
        executionId: (execution as any)._id.toString(),
        status: 'queued',
        message: 'Workflow execution queued successfully',
      };
    }

    // Sync mode or step testing
    const result = await this.executionService.triggerWorkflowSync(
      workflowId,
      dto.input,
      context,
      dto.stepId
    );

    return result;
  }

  /**
   * Get workflow execution status
   * Returns detailed status including step progress
   */
  @Get(':id/status')
  @ApiOperation({ summary: 'Get workflow execution status' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getWorkflowStatus(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return await this.executionService.getExecutionStatus(id, context);
  }

  /**
   * Get queue status (admin endpoint)
   * Returns BullMQ queue metrics
   */
  @Get('_admin/queue/status')
  @ApiOperation({ summary: 'Get queue status (admin)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getQueueStatus() {
    // TODO: Phase 4 - Inject WorkflowExecutionQueue and return status
    // return await this.workflowQueue.getQueueStatus();

    return {
      message: 'TODO: Phase 4 - Implement queue status endpoint',
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
    };
  }
}
