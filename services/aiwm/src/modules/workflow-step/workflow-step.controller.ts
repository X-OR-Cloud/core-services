import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
import { WorkflowStepService } from './workflow-step.service';
import { CreateWorkflowStepDto, UpdateWorkflowStepDto } from './workflow-step.dto';

@ApiTags('Workflow Steps')
@ApiBearerAuth()
@Controller('workflow-steps')
export class WorkflowStepController {
  constructor(private readonly stepService: WorkflowStepService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow steps with pagination' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.findAll(query, context);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workflow step' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createStepDto: CreateWorkflowStepDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.create(createStepDto, context);
  }

  @Get('workflow/:workflowId')
  @ApiOperation({ summary: 'List all steps for a specific workflow' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findByWorkflow(
    @Param('workflowId') workflowId: string,
    @CurrentUser() context: RequestContext
  ) {
    const steps = await this.stepService.findByWorkflow(workflowId, context);
    return {
      data: steps,
      count: steps.length,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow step by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.findById(new Types.ObjectId(id) as any, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update workflow step by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateStepDto: UpdateWorkflowStepDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.update(
      new Types.ObjectId(id) as any,
      updateStepDto as any,
      context
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete workflow step by ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.softDelete(new Types.ObjectId(id) as any, context);
  }

  @Put('workflow/:workflowId/reorder')
  @ApiOperation({ summary: 'Reorder steps within a workflow' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async reorder(
    @Param('workflowId') workflowId: string,
    @Body() dto: { stepOrders: Array<{ stepId: string; orderIndex: number }> },
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.reorder(workflowId, dto.stepOrders, context);
  }
}
