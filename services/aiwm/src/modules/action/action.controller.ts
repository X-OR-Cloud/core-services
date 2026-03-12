import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiDeleteErrors,
  QueryStringParams,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ActionService } from './action.service';
import { CreateActionDto } from './dto/create-action.dto';
import { Action } from './action.schema';
import { ActorRole } from './action.enum';

@ApiTags('Actions')
@Controller('actions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ActionController {
  constructor(private readonly actionService: ActionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all Actions with pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Actions retrieved successfully',
    type: [Action],
  })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext
  ) {
    return this.actionService.findAll(parseQueryString(query), context);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new action' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Action created successfully',
    type: Action,
  })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateActionDto,
    @CurrentUser() context: RequestContext
  ): Promise<Action> {
    return this.actionService.createAction(dto, context);
  }

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Get actions for a conversation' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Actions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Action' } },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  @ApiReadErrors({ notFound: false })
  async getConversationActions(
    @Param('conversationId') conversationId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @CurrentUser() context: RequestContext
  ): Promise<{ data: Action[]; total: number; page: number; limit: number }> {
    return this.actionService.getConversationActions(
      conversationId,
      Number(page),
      Number(limit),
      context
    );
  }

  @Get('conversation/:conversationId/role/:role')
  @ApiOperation({ summary: 'Get actions by actor role' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Actions retrieved successfully',
    type: [Action],
  })
  @ApiReadErrors({ notFound: false })
  async getActionsByRole(
    @Param('conversationId') conversationId: string,
    @Param('role') role: ActorRole,
    @CurrentUser() context: RequestContext
  ): Promise<Action[]> {
    return this.actionService.getActionsByRole(conversationId, role, context);
  }

  @Get('conversation/:conversationId/last/:count')
  @ApiOperation({ summary: 'Get last N actions from conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Actions retrieved successfully',
    type: [Action],
  })
  @ApiReadErrors({ notFound: false })
  async getLastActions(
    @Param('conversationId') conversationId: string,
    @Param('count') count: number,
    @CurrentUser() context: RequestContext
  ): Promise<Action[]> {
    return this.actionService.getLastActions(
      conversationId,
      Number(count),
      context
    );
  }

  @Get('conversation/:conversationId/statistics')
  @ApiOperation({ summary: 'Get action statistics for a conversation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        byRole: { type: 'object' },
        byType: { type: 'object' },
        totalInputTokens: { type: 'number' },
        totalOutputTokens: { type: 'number' },
      },
    },
  })
  @ApiReadErrors({ notFound: false })
  async getActionStatistics(
    @Param('conversationId') conversationId: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.actionService.getActionStatistics(conversationId, context);
  }

  @Get('thread/:actionId')
  @ApiOperation({ summary: 'Get action thread (parent and children)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Action thread retrieved successfully',
    type: [Action],
  })
  @ApiReadErrors({ notFound: false })
  async getActionThread(
    @Param('actionId') actionId: string,
    @CurrentUser() context: RequestContext
  ): Promise<Action[]> {
    return this.actionService.getActionThread(actionId, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get action by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Action retrieved successfully',
    type: Action,
  })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ): Promise<Partial<Action>> {
    return this.actionService.findById(new Types.ObjectId(id) as any, context);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete action' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Action deleted successfully',
  })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ): Promise<void> {
    await this.actionService.softDelete(new Types.ObjectId(id) as any, context);
  }
}
