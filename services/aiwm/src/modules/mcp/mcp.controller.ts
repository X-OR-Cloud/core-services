import { Controller, Post, Body, UseGuards, Req, HttpCode, Options, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '@hydrabyte/base';
import { McpService } from './mcp.service';
import {
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
} from './mcp.dto';

@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  /**
   * JSON-RPC 2.0 endpoint for MCP protocol
   * Handles: initialize, tools/list, tools/call
   */
  @Post('')
  @HttpCode(200)
  @ApiOperation({
    summary: 'JSON-RPC 2.0 endpoint for MCP protocol',
    description: 'Handles initialize, tools/list, and tools/call methods via JSON-RPC 2.0',
  })
  @ApiResponse({
    status: 200,
    description: 'Request processed successfully',
    type: JsonRpcSuccessResponse,
  })
  @ApiResponse({
    status: 200,
    description: 'JSON-RPC error response',
    type: JsonRpcErrorResponse,
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async handleJsonRpc(
    @Req() req: any,
    @Body() rpcRequest: JsonRpcRequest,
  ): Promise<JsonRpcSuccessResponse | JsonRpcErrorResponse> {
    const { jsonrpc, id, method, params } = rpcRequest;
    const agentId = req.user?.agentId ?? 'unknown';
    const t0 = Date.now();

    if (!jsonrpc || jsonrpc !== '2.0') {
      this.logger.warn(`[MCP] agentId=${agentId} invalid_jsonrpc body=${JSON.stringify(rpcRequest)}`);
      return {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
          code: -32600,
          message: 'Invalid Request: jsonrpc must be "2.0"',
        },
      };
    }

    try {
      if (!req.user?.agentId) {
        this.logger.warn(`[MCP] agentId=missing method=${method} — JWT has no agentId`);
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: 'Internal error: Agent ID not found in JWT',
          },
        };
      }

      this.logger.log(`[MCP] agentId=${agentId} method=${method}${method === 'tools/call' ? ` tool=${(params as any)?.name}` : ''}`);

      let result: JsonRpcSuccessResponse | JsonRpcErrorResponse;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(id, params, agentId);
          break;

        case 'tools/list':
          result = await this.handleToolsList(id, params, agentId);
          break;

        case 'tools/call':
          result = await this.handleToolsCall(id, params, agentId, req);
          break;

        default:
          this.logger.warn(`[MCP] agentId=${agentId} method_not_found=${method}`);
          result = {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }

      const isError = 'error' in result;
      const durationMs = Date.now() - t0;
      if (isError) {
        this.logger.warn(
          `[MCP] agentId=${agentId} method=${method}${method === 'tools/call' ? ` tool=${(params as any)?.name}` : ''} status=error code=${'error' in result ? result.error.code : ''} msg=${'error' in result ? result.error.message : ''} duration=${durationMs}ms`,
        );
      } else {
        this.logger.debug(`[MCP] agentId=${agentId} method=${method} status=ok duration=${durationMs}ms`);
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[MCP] agentId=${agentId} method=${method}${method === 'tools/call' ? ` tool=${(params as any)?.name}` : ''} status=exception duration=${Date.now() - t0}ms error=${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: errorMessage,
        },
      };
    }
  }

  /**
   * Handle initialize method
   */
  private async handleInitialize(
    id: number | string,
    _params: Record<string, unknown>,
    _agentId: string,
  ): Promise<JsonRpcSuccessResponse> {
    // MCP initialize response
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'aiwm-mcp-server',
          version: '1.0.0',
        },
      },
    };
  }

  /**
   * Handle tools/list method
   */
  private async handleToolsList(
    id: number | string,
    _params: Record<string, unknown>,
    agentId: string,
  ): Promise<JsonRpcSuccessResponse> {
    const toolsResponse = await this.mcpService.listTools(agentId);

    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: toolsResponse.tools,
      },
    };
  }

  /**
   * Handle tools/call method
   */
  private async handleToolsCall(
    id: number | string,
    params: Record<string, unknown>,
    agentId: string,
    req: { headers: { authorization?: string } },
  ): Promise<JsonRpcSuccessResponse | JsonRpcErrorResponse> {
    const { name, arguments: args } = params;

    if (!name || typeof name !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid params: name is required',
        },
      };
    }

    try {
      const authHeader = req.headers.authorization;
      const agentToken = authHeader?.substring(7); // Remove 'Bearer '

      const result = await this.mcpService.executeTool(agentId, agentToken, {
        name,
        arguments: (args as Record<string, unknown>) || {},
      });

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Tool execution failed',
          data: errorMessage,
        },
      };
    }
  }

  /**
   * CORS preflight handler
   */
  @Options('')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Options for MCP endpoint',
    description: 'Handles preflight OPTIONS request for CORS',
  })
  async optionsHandler(@Res() res: Response) {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:6274');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    res.end();
  }
}
