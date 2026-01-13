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
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './workflow.dto';

@ApiTags('Workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workflow template' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createWorkflowDto: CreateWorkflowDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.create(createWorkflowDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all workflows with pagination' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.findAll(query, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.findById(new Types.ObjectId(id) as any, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update workflow by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.update(
      new Types.ObjectId(id) as any,
      updateWorkflowDto as any,
      context
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive workflow by ID (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.softDelete(new Types.ObjectId(id) as any, context);
  }

  @Put(':id/activate')
  @ApiOperation({ summary: 'Activate workflow (change status to active)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.activate(new Types.ObjectId(id) as any, context);
  }

  @Put(':id/archive')
  @ApiOperation({ summary: 'Archive workflow (change status to archived)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async archive(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.archive(new Types.ObjectId(id) as any, context);
  }
}
