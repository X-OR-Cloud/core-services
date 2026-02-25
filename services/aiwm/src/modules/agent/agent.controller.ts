import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Query, Req, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { AgentService } from './agent.service';
import {
  CreateAgentDto,
  UpdateAgentDto,
  AgentConnectDto,
  AgentConnectResponseDto,
  AgentHeartbeatDto,
  AgentCredentialsResponseDto,
  AgentDisconnectDto,
} from './agent.dto';

@ApiTags('agents')
@ApiBearerAuth('JWT-auth')
@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create agent', description: 'Create a new AI agent' })
  @ApiResponse({ status: 201, description: 'Agent created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createAgentDto: CreateAgentDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.agentService.create(createAgentDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all agents', description: 'Retrieve list of all agents with pagination. Use ?populate=instruction to include instruction details.' })
  @ApiResponse({ status: 200, description: 'Agents retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.agentService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get agent by ID', description: 'Retrieve a single agent by ID. Use ?populate=instruction to include instruction details.' })
  @ApiResponse({ status: 200, description: 'Agent found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @Query() query: any,
    @CurrentUser() context: RequestContext,
  ) {
    const agent = await this.agentService.findById(new Types.ObjectId(id) as any, context, query);
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
    return agent;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update agent', description: 'Update agent information' })
  @ApiResponse({ status: 200, description: 'Agent updated successfully' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateAgentDto: UpdateAgentDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.agentService.updateAgent(id, updateAgentDto, context);
    if (!updated) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete agent', description: 'Soft delete an agent' })
  @ApiResponse({ status: 200, description: 'Agent deleted successfully' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.agentService.remove(id, context);
    return { message: 'Agent deleted successfully' };
  }

  @Get(':id/instruction')
  @ApiOperation({
    summary: 'Preview agent instruction (for users)',
    description: 'Returns the resolved instruction for the specified agent, including injected @project and @document context. For users to verify how the instruction will be built.'
  })
  @ApiResponse({ status: 200, description: 'Instruction retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async getInstruction(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const token = req.headers?.authorization?.replace('Bearer ', '') || '';
    return this.agentService.getAgentInstruction(id, token);
  }

  @Get(':id/config')
  @ApiOperation({
    summary: 'Get agent configuration (for autonomous agents)',
    description: 'Get complete configuration for autonomous agent including deployment endpoint, MCP tools, and instruction. Requires user JWT token.'
  })
  @ApiResponse({
    status: 200,
    description: 'Agent configuration retrieved successfully',
    type: AgentConnectResponseDto
  })
  @ApiResponse({ status: 403, description: 'Not authorized to access this agent' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async getConfig(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
    @Req() req: any,
  ): Promise<AgentConnectResponseDto> {
    const token = req.headers?.authorization?.replace('Bearer ', '') || '';
    return this.agentService.getAgentConfig(id, context, token);
  }

  @Post(':id/connect')
  @ApiOperation({
    summary: 'Agent connection/authentication (for managed agents)',
    description: 'Public endpoint for managed agent to connect and authenticate using secret. Returns JWT token + instruction + tools config.'
  })
  @ApiResponse({
    status: 200,
    description: 'Agent connected successfully',
    type: AgentConnectResponseDto
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials or agent suspended' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async connect(
    @Param('id') id: string,
    @Body() connectDto: AgentConnectDto,
  ): Promise<AgentConnectResponseDto> {
    return this.agentService.connect(id, connectDto);
  }

  @Post(':id/heartbeat')
  @ApiOperation({
    summary: 'Agent heartbeat',
    description: 'Update agent last heartbeat timestamp. Requires agent JWT token.'
  })
  @ApiResponse({ status: 200, description: 'Heartbeat received' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async heartbeat(
    @Param('id') id: string,
    @Body() heartbeatDto: AgentHeartbeatDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.agentService.heartbeat(id, heartbeatDto);
  }

  @Post(':id/disconnect')
  @ApiOperation({
    summary: 'Agent disconnect',
    description: 'Gracefully disconnect agent and log disconnect event. Requires agent JWT token.'
  })
  @ApiResponse({ status: 200, description: 'Agent disconnected successfully' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @Param('id') id: string,
    @Body() disconnectDto: AgentDisconnectDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.agentService.disconnect(id, disconnectDto);
  }

  @Post(':id/credentials/regenerate')
  @ApiOperation({
    summary: 'Regenerate agent credentials',
    description: 'Admin endpoint to regenerate agent secret. Returns new secret + env config + install script.'
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials regenerated successfully',
    type: AgentCredentialsResponseDto
  })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async regenerateCredentials(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<AgentCredentialsResponseDto> {
    return this.agentService.regenerateCredentials(id, context);
  }
}