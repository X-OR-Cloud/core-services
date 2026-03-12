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
  PaginationQueryDto,
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
  ExecuteWorkflowDto,
  TestWorkflowStepDto,
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
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return await this.executionService.findAll(query, context);
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
  ): Promise<Partial<Execution> | null> {
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
   * Get workflow input schema
   * Returns metadata about required inputs for workflow execution
   */
  @Get('workflows/:workflowId/input-schema')
  @ApiOperation({ summary: 'Get workflow input schema for UI rendering' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getWorkflowInputSchema(
    @Param('workflowId') workflowId: string,
    @CurrentUser() context: RequestContext
  ): Promise<{
    workflowId: string;
    workflowName: string;
    description?: string;
    requiredInputs: Array<{
      stepId: string;
      stepName: string;
      description?: string;
      orderIndex: number;
      inputSchema: any;
      isRequired: boolean;
    }>;
  }> {
    return await this.executionService.getWorkflowInputSchema(workflowId, context);
  }

  /**
   * Execute a complete workflow
   * Input must be object with stepId keys: { "<stepId>": { ...stepInput } }
   */
  @Post('workflows/:workflowId/execute')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Execute complete workflow' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async executeWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() dto: ExecuteWorkflowDto,
    @CurrentUser() context: RequestContext
  ): Promise<{
    executionId: string;
    status: string;
    message: string;
    output?: any;
    result?: any;
    error?: any;
  }> {
    // Async mode (default)
    if (!dto.sync) {
      const execution = await this.executionService.executeWorkflow(
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

    // Sync mode
    const result = await this.executionService.executeWorkflowSync(
      workflowId,
      dto.input,
      context
    );

    return result;
  }

  /**
   * Test a single workflow step
   * Always executes synchronously for immediate feedback
   */
  @Post('workflows/:workflowId/steps/:stepId/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test single workflow step (sync only)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async testWorkflowStep(
    @Param('workflowId') workflowId: string,
    @Param('stepId') stepId: string,
    @Body() dto: TestWorkflowStepDto,
    @CurrentUser() context: RequestContext
  ): Promise<{
    executionId: string;
    status: string;
    message: string;
    output?: any;
    result?: any;
    error?: any;
  }> {
    const result = await this.executionService.testWorkflowStep(
      workflowId,
      stepId,
      dto.input,
      context
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
