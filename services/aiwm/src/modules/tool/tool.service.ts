import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, ToolInUseException } from '@hydrabyte/shared';
import { Tool } from './tool.schema';
import { Agent } from '../agent/agent.schema';
import { LookupToolFunctionsDto, ToolFunctionsResponseDto } from './tool.dto';

/**
 * Hardcoded framework functions by agent framework
 */
const BUILTIN_FUNCTIONS: Record<string, string[]> = {
  'builtin': [
    'mcp__OfficeParser__ParseOfficeFile',
  ],
}
const FRAMEWORK_FUNCTIONS: Record<string, string[]> = {
  'claude-agent-sdk': [
    'Task',
    'Bash',
    'Glob',
    'Grep',
    'ExitPlanMode',
    'Read',
    'Edit',
    'MultiEdit',
    'Write',
    'NotebookEdit',
    'WebFetch',
    'TodoWrite',
    'WebSearch',
    'BashOutput',
    'KillShell',
  ],
};

/**
 * Hardcoded builtin tool functions by category name
 */
const BUILTIN_TOOL_FUNCTIONS: Record<string, string[]> = {
  DocumentManagement: [
    'mcp__Builtin__CreateDocument',
    'mcp__Builtin__ListDocuments',
    'mcp__Builtin__GetDocument',
    'mcp__Builtin__GetDocumentContent',
    'mcp__Builtin__ShareDocument',
    'mcp__Builtin__UpdateDocument',
    'mcp__Builtin__UpdateDocumentContent',
    'mcp__Builtin__DeleteDocument',
    'mcp__Builtin__ReplaceDocumentContent',
    'mcp__Builtin__SearchAndReplaceTextInDocument',
    'mcp__Builtin__SearchAndReplaceRegexInDocument',
    'mcp__Builtin__ReplaceMarkdownSectionInDocument',
    'mcp__Builtin__AppendToDocument',
    'mcp__Builtin__AppendAfterTextInDocument',
    'mcp__Builtin__AppendToMarkdownSectionInDocument',
  ],
  WorkManagement: [
    'mcp__Builtin__CreateWork',
    'mcp__Builtin__ScheduleWork',
    'mcp__Builtin__CreateRecurringWork',
    'mcp__Builtin__ListWorks',
    'mcp__Builtin__GetWork',
    'mcp__Builtin__UpdateWork',
    'mcp__Builtin__DeleteWork',
    'mcp__Builtin__StartWork',
    'mcp__Builtin__BlockWork',
    'mcp__Builtin__UnblockWork',
    'mcp__Builtin__RequestReviewForWork',
    'mcp__Builtin__CompleteWork',
    'mcp__Builtin__ReopenWork',
    'mcp__Builtin__CancelWork',
    'mcp__Builtin__AssignAndTodoWork',
    'mcp__Builtin__RejectReviewForWork',
    'mcp__Builtin__GetNextWork',
    'mcp__Builtin__RecalculateEpicStatus',
  ],
  ProjectManagement: [
    'mcp__Builtin__CreateProject',
    'mcp__Builtin__ListProjects',
    'mcp__Builtin__GetProject',
    'mcp__Builtin__UpdateProject',
    'mcp__Builtin__DeleteProject',
    'mcp__Builtin__ActivateProject',
    'mcp__Builtin__HoldProject',
    'mcp__Builtin__ResumeProject',
    'mcp__Builtin__CompleteProject',
    'mcp__Builtin__ArchiveProject',
    'mcp__Builtin__ListProjectMembers',
    'mcp__Builtin__AddProjectMember',
    'mcp__Builtin__UpdateProjectMember',
    'mcp__Builtin__RemoveProjectMember',
  ],
  AgentManagement: [
    'mcp__Builtin__ListAgents',
    'mcp__Builtin__CreateAgent',
    'mcp__Builtin__UpdateAgent',
    'mcp__Builtin__DeleteAgent',
  ],
  InstructionManagement: [
    'mcp__Builtin__ListInstructions',
    'mcp__Builtin__CreateInstruction',
    'mcp__Builtin__UpdateInstruction',
    'mcp__Builtin__DeleteInstruction',
  ],
  UserManagement: [
    'mcp__Builtin__ListUsers',
  ],
  MemoryManagement: [
    'mcp__Builtin__SearchMemory',
    'mcp__Builtin__UpsertMemory',
    'mcp__Builtin__ListMemoryKeys',
    'mcp__Builtin__DeleteMemory',
  ],
};

/**
 * ToolService
 * Manages tool entities (MCP and built-in tools)
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class ToolService extends BaseService<Tool> {
  constructor(
    @InjectModel(Tool.name) private toolModel: Model<Tool>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>
  ) {
    super(toolModel);
  }

  /**
   * Helper method to check if tool is being used by active agents
   * @param toolId - Tool ID to check
   * @returns Array of active agents using this tool
   */
  private async checkActiveAgentDependencies(
    toolId: ObjectId
  ): Promise<Array<{ id: string; name: string }>> {
    // Agent schema has toolIds: string[] field
    const activeAgents = await this.agentModel
      .find({
        toolIds: toolId.toString(),
        isDeleted: false,
      })
      .select('_id name')
      .lean()
      .exec();

    return activeAgents.map((agent) => ({
      id: agent._id.toString(),
      name: agent.name,
    }));
  }

  /**
   * Override update method to validate status changes
   * Prevents deactivating tools that are in use by active agents
   */
  async update(
    id: ObjectId,
    updateData: Partial<Tool>,
    context: RequestContext
  ): Promise<Tool | null> {
    // Check if status is being changed to 'inactive'
    if (updateData.status === 'inactive') {
      const activeAgents = await this.checkActiveAgentDependencies(id);
      if (activeAgents.length > 0) {
        throw new ToolInUseException(activeAgents, 'deactivate');
      }
    }

    // Call parent update method
    return super.update(id, updateData, context);
  }

  /**
   * Override softDelete method to validate dependencies
   * Prevents deleting tools that are in use by active agents
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Tool | null> {
    const activeAgents = await this.checkActiveAgentDependencies(id);
    if (activeAgents.length > 0) {
      throw new ToolInUseException(activeAgents, 'delete');
    }

    // Call parent softDelete method
    return super.softDelete(id, context);
  }

  /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Tool>> {
    const findResult = await super.findAll(options, context);
    // Aggregate statistics by status
    const statusStats = await super.aggregate(
      [
        {
          $match: {
            ...options.filter,
            'owner.orgId': context.orgId,
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Build statistics object
    const statistics: any = {
      total: findResult.pagination.total,
      byStatus: {},
      byType: {},
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Lookup available functions by agent framework and tool IDs
   * Returns framework functions + builtin tool functions
   */
  async lookupFunctions(
    dto: LookupToolFunctionsDto,
    context: RequestContext
  ): Promise<ToolFunctionsResponseDto[]> {
    const result: ToolFunctionsResponseDto[] = [];

    result.push({ tool: 'Builtin', functions: BUILTIN_FUNCTIONS['builtin'] });

    // 1. Add framework functions
    const frameworkFunctions = FRAMEWORK_FUNCTIONS[dto.framework];
    if (frameworkFunctions) {
      result.push({ tool: 'Framework', functions: frameworkFunctions });
    }

    // 2. Lookup builtin tool functions from toolIds
    if (dto.toolIds.length > 0) {
      const objectIds = dto.toolIds.map((id) => new Types.ObjectId(id));
      const tools = await this.toolModel
        .find({
          _id: { $in: objectIds },
          type: 'builtin',
          isDeleted: false,
        })
        .select('name')
        .lean()
        .exec();

      for (const tool of tools) {
        const functions = BUILTIN_TOOL_FUNCTIONS[tool.name];
        if (functions) {
          result.push({ tool: tool.name, functions });
        }
      }
    }

    return result;
  }
}
