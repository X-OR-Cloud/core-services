import { Injectable, NotFoundException, BadRequestException, HttpException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Agent } from '../agent/agent.schema';
import { Tool } from '../tool/tool.schema';
import {
  McpToolsListResponse,
  McpToolCallRequest,
  McpToolCallResponse,
  McpTool,
} from './mcp.dto';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    @InjectModel(Agent.name) private agentModel: Model<Agent>,
    @InjectModel(Tool.name) private toolModel: Model<Tool>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * List available tools for an agent (filtered by allowedToolIds)
   * Returns tools in MCP protocol format
   */
  async listTools(agentId: string): Promise<McpToolsListResponse> {
    // Load agent with allowedToolIds
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    if (!agent.allowedToolIds || agent.allowedToolIds.length === 0) {
      this.logger.debug(`Agent ${agentId} has no allowed tools`);
      return { tools: [] };
    }

    // Query tools: _id IN allowedToolIds AND type='api' AND status='active'
    const allowedObjectIds = agent.allowedToolIds.map(id => new Types.ObjectId(id));
    const tools = await this.toolModel
      .find({
        _id: { $in: allowedObjectIds },
        type: 'api',
        status: 'active',
        isDeleted: false,
      })
      .exec();

    // Transform to MCP format (name, description, inputSchema only)
    const mcpTools: McpTool[] = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema?.inputSchema || {},
    }));

    this.logger.log(`Listed ${mcpTools.length} tools for agent ${agentId}`);

    return { tools: mcpTools };
  }

  /**
   * Execute a tool by proxying to CBM service
   * Uses agent's JWT directly (no user JWT generation needed)
   */
  async executeTool(
    agentId: string,
    agentToken: string,
    request: McpToolCallRequest,
  ): Promise<McpToolCallResponse> {
    // Load agent
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    // Find tool by name
    const tool = await this.toolModel
      .findOne({
        name: request.name,
        type: 'api',
        status: 'active',
        isDeleted: false,
      })
      .exec();

    if (!tool) {
      throw new NotFoundException(`Tool '${request.name}' not found or inactive`);
    }

    // Validate tool is in allowedToolIds
    const toolIdStr = tool._id.toString();
    if (!agent.allowedToolIds || !agent.allowedToolIds.includes(toolIdStr)) {
      throw new BadRequestException(
        `Tool '${request.name}' is not in agent's allowed tools list`
      );
    }

    // Build HTTP request
    const httpRequest = this.buildHttpRequest(tool, request.arguments);

    this.logger.log(`Executing tool ${request.name} for agent ${agentId}`);

    try {
      // Execute HTTP request to CBM with agent JWT
      const response = await firstValueFrom(
        this.httpService.request({
          method: httpRequest.method,
          url: httpRequest.url,
          headers: {
            ...httpRequest.headers,
            Authorization: `Bearer ${agentToken}`, // Use agent JWT directly
          },
          data: httpRequest.body,
          params: httpRequest.queryParams,
          timeout: tool.execution?.timeout || 30000,
        })
      );

      // Transform CBM response to MCP format
      return this.transformToMcpResponse((response as any).data);
    } catch (error: any) {
      this.logger.error(`Tool execution failed`, {
        agentId,
        toolName: request.name,
        error: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data,
      });

      // Handle HTTP errors from CBM
      if (error.response) {
        throw new HttpException(
          {
            error: {
              code: 'TOOL_EXECUTION_FAILED',
              message: `Failed to execute tool: ${request.name}`,
              details: {
                statusCode: error.response.status,
                message: error.response.data?.message || error.message,
                data: error.response.data,
              },
            },
          },
          error.response.status
        );
      }

      // Handle network/timeout errors
      throw new HttpException(
        {
          error: {
            code: 'TOOL_EXECUTION_ERROR',
            message: `Error executing tool: ${request.name}`,
            details: {
              message: error.message,
            },
          },
        },
        500
      );
    }
  }

  /**
   * Build HTTP request from tool execution config and arguments
   */
  private buildHttpRequest(
    tool: Tool,
    args: Record<string, any>
  ): {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
    queryParams?: Record<string, any>;
  } {
    // New model: functions[] — use first function (MCP server-side execution path)
    // New api tools should use client-side toolDefinitions instead; this is legacy fallback.
    const fn = tool.functions?.[0];
    const execAny = tool.execution as any;

    const method: string | undefined = fn?.method ?? execAny?.method;
    const baseUrl: string | undefined = (tool.execution as any)?.baseUrl ?? execAny?.baseUrl;
    const path: string | undefined = fn?.path ?? execAny?.path;
    const headers: Record<string, string> | undefined = {
      ...(execAny?.headers ?? {}),
      ...(fn?.headers ?? {}),
    };

    if (!method || !baseUrl || !path) {
      throw new BadRequestException(
        `Tool '${tool.name}' has incomplete execution config (missing method, baseUrl, or path)`
      );
    }

    // Replace path parameters: /documents/{id} → /documents/12345
    let finalPath = path;
    const pathParams = path.match(/\{([^}]+)\}/g);
    if (pathParams) {
      for (const param of pathParams) {
        const paramName = param.slice(1, -1); // Remove { }
        const paramValue = args[paramName];
        if (!paramValue) {
          throw new BadRequestException(
            `Missing required path parameter: ${paramName}`
          );
        }
        finalPath = finalPath.replace(param, paramValue);
        // Remove from args so it's not sent as body/query param
        delete args[paramName];
      }
    }

    // Build full URL
    const url = `${baseUrl}${finalPath}`;

    // Prepare headers
    const finalHeaders = {
      'Content-Type': 'application/json',
      ...(headers || {}),
    };

    // For GET/DELETE: args become query parameters
    // For POST/PATCH/PUT: args become request body
    const upperMethod = method.toUpperCase();
    let body: any = undefined;
    let queryParams: Record<string, any> | undefined = undefined;

    if (upperMethod === 'GET' || upperMethod === 'DELETE') {
      queryParams = args;
    } else if (upperMethod === 'POST' || upperMethod === 'PATCH' || upperMethod === 'PUT') {
      body = args;
    }

    return {
      method: upperMethod,
      url,
      headers: finalHeaders,
      body,
      queryParams,
    };
  }

  /**
   * Transform CBM response to MCP content format
   */
  private transformToMcpResponse(data: any): McpToolCallResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
}
