import { Controller, Get, Post, Body, Put, Patch, Param, Delete, UseGuards, Query, Req, NotFoundException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, PaginationQueryDto, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors, QueryStringParams, parseQueryString } from '@hydrabyte/base';
import { ApiKeyOrJwtGuard } from '../../guards/api-key-or-jwt.guard';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { AgentService } from './agent.service';
import { MetricsGranularity } from '../../core/sla.helper';
import {
  CreateAgentDto,
  UpdateAgentDto,
  AgentConnectDto,
  AgentConnectBodyDto,
  AgentConnectResponseDto,
  AgentHeartbeatDto,
  AgentCredentialsResponseDto,
  AgentDisconnectDto,
  AnonymousTokenDto,
  AnonymousTokenResponseDto,
  AnonymousTokenListResponseDto,
  AddExternalSigningKeyDto,
  ExternalSigningKeyEntryDto,
  ExternalSigningKeyListResponseDto,
  PreviewInstructionQueryDto,
  UpdateAgentInstructionDto,
  AddAgentLogDto,
  AgentLogsResponseDto,
  AgentSleepActionDto,
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
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    return this.agentService.findAll(parseQueryString(query), context);
  }

  @Get('realtime-status')
  @ApiOperation({ summary: 'Realtime status of all agents', description: 'Snapshot of agent status, heartbeat, active conversations. Filter by agentIds (comma-separated).' })
  @ApiResponse({ status: 200, description: 'Realtime agent status' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getRealtimeStatus(
    @Query('agentIds') agentIds: string,
    @CurrentUser() context: RequestContext,
  ) {
    const ids = agentIds ? agentIds.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    return this.agentService.getRealtimeStatus(ids, context);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Agent performance metrics', description: 'SLA metrics aggregated by time range. Supports preset=today|yesterday|7d|30d or custom from/to. Filter by agentIds.' })
  @ApiResponse({ status: 200, description: 'Agent metrics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getMetrics(
    @Query('agentIds') agentIds: string,
    @Query('preset') preset: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: MetricsGranularity,
    @CurrentUser() context: RequestContext,
  ) {
    const ids = agentIds ? agentIds.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    return this.agentService.getAgentMetrics(ids, preset, from, to, granularity, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get agent by ID or code', description: 'Retrieve a single agent by ObjectId or code (e.g. jack-bold). Use ?populate=instruction to include instruction details.' })
  @ApiResponse({ status: 200, description: 'Agent found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @Query() query: any,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    const agent = await this.agentService.findById(new Types.ObjectId(resolvedId), context, query);
    if (!agent) {
      throw new NotFoundException(`Agent not found: ${id}`);
    }
    return agent;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update agent', description: 'Update agent information. Accepts ObjectId or code.' })
  @ApiResponse({ status: 200, description: 'Agent updated successfully' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateAgentDto: UpdateAgentDto,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    const updated = await this.agentService.updateAgent(resolvedId, updateAgentDto, context);
    if (!updated) {
      throw new NotFoundException(`Agent not found: ${id}`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete agent', description: 'Soft delete an agent. Accepts ObjectId or code.' })
  @ApiResponse({ status: 200, description: 'Agent deleted successfully' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    await this.agentService.remove(resolvedId, context);
    return { message: 'Agent deleted successfully' };
  }

  @Get(':id/realtime-status')
  @ApiOperation({ summary: 'Realtime status of a single agent', description: 'Snapshot of agent status including last conversation and unanswered message detection.' })
  @ApiResponse({ status: 200, description: 'Realtime agent status' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getRealtimeStatusById(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.getRealtimeStatusById(resolvedId, context);
  }

  @Get(':id/instruction')
  @ApiOperation({
    summary: 'Preview agent instruction (for users)',
    description: 'Returns the fully rendered instruction for the agent, including @project/@document injection and tool rules. Pass ?systemPrompt=... to preview with an override without modifying the stored instruction.'
  })
  @ApiResponse({ status: 200, description: 'Instruction retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async getInstruction(
    @Param('id') id: string,
    @Query() query: PreviewInstructionQueryDto,
    @CurrentUser() context: RequestContext,
    @Req() req: any,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    const token = req.headers?.authorization?.replace('Bearer ', '') || '';
    return this.agentService.getAgentInstruction(resolvedId, token, query.systemPrompt, query.mode);
  }

  @Patch(':id/instruction')
  @ApiOperation({
    summary: 'Update agent instruction systemPrompt',
    description: "Update the systemPrompt of the agent's current instruction. Pass dryRun=true to preview the fully rendered (injected) result without saving to DB — useful for long prompts that exceed URL length limits."
  })
  @ApiResponse({ status: 200, description: 'Instruction updated successfully (or preview if dryRun=true)' })
  @ApiResponse({ status: 400, description: 'Agent has no instruction configured' })
  @ApiResponse({ status: 404, description: 'Agent or instruction not found' })
  @UseGuards(JwtAuthGuard)
  async updateInstruction(
    @Param('id') id: string,
    @Body() dto: UpdateAgentInstructionDto,
    @CurrentUser() context: RequestContext,
    @Req() req: any,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    const token = req.headers?.authorization?.replace('Bearer ', '') || '';
    return this.agentService.updateAgentInstruction(resolvedId, dto.systemPrompt, context, token, dto.dryRun);
  }

  @Get(':id/config')
  @ApiOperation({
    summary: 'Get agent configuration (for engineer agents)',
    description: 'Get complete configuration for engineer agent including deployment endpoint, MCP tools, and instruction. Requires user JWT token.'
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
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    const token = req.headers?.authorization?.replace('Bearer ', '') || '';
    return this.agentService.getAgentConfig(resolvedId, context, token);
  }

  @Post('connect')
  @ApiOperation({
    summary: 'Agent connection/authentication (for engineer agents)',
    description: 'Public endpoint for engineer agent to connect and authenticate using secret. Returns JWT token + instruction + tools config.',
  })
  @ApiResponse({ status: 200, description: 'Agent connected successfully', type: AgentConnectResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials or agent suspended' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async connectSelf(
    @Body() connectDto: AgentConnectBodyDto,
  ): Promise<AgentConnectResponseDto> {
    return this.agentService.connect(connectDto.id, connectDto);
  }

  // @deprecated Use POST /agents/connect instead. Will be removed in a future release.
  @Post(':id/connect')
  @ApiOperation({
    summary: '[Deprecated] Agent connection/authentication',
    description: 'Deprecated. Use POST /agents/connect instead. Kept for backward compatibility.',
  })
  @ApiResponse({ status: 200, description: 'Agent connected successfully', type: AgentConnectResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials or agent suspended' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async connect(
    @Param('id') id: string,
    @Body() connectDto: AgentConnectDto,
  ): Promise<AgentConnectResponseDto> {
    return this.agentService.connect(id, connectDto);
  }

  @Post('heartbeat')
  @ApiOperation({
    summary: 'Agent heartbeat (token-based)',
    description: 'Update agent heartbeat using JWT token to identify agent. No agentId in URL needed.'
  })
  @ApiResponse({ status: 200, description: 'Heartbeat received, optionally with work assignment' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async heartbeatSelf(
    @Body() heartbeatDto: AgentHeartbeatDto,
    @CurrentUser() context: RequestContext,
    @Req() req: any,
  ) {
    const agentId = context.agentId || context.userId;
    const token = req.headers?.authorization?.replace('Bearer ', '') || '';
    return this.agentService.heartbeat(agentId, heartbeatDto, token);
  }

  @Post(':id/heartbeat')
  @ApiOperation({
    summary: 'Agent heartbeat (deprecated)',
    description: '[Deprecated] Use POST /agents/heartbeat instead. Kept for backward compatibility until all agents are upgraded.'
  })
  @ApiResponse({ status: 200, description: 'Heartbeat received, optionally with work assignment' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async heartbeat(
    @Param('id') id: string,
    @Body() heartbeatDto: AgentHeartbeatDto,
    @Req() req: any,
  ) {
    const token = req.headers?.authorization?.replace('Bearer ', '') || '';
    return this.agentService.heartbeat(id, heartbeatDto, token);
  }

  @Post('disconnect')
  @ApiOperation({
    summary: 'Agent disconnect (token-based)',
    description: 'Gracefully disconnect agent using JWT token to identify agent. No agentId in URL needed.'
  })
  @ApiResponse({ status: 200, description: 'Agent disconnected successfully' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async disconnectSelf(
    @Body() disconnectDto: AgentDisconnectDto,
    @CurrentUser() context: RequestContext,
  ) {
    const agentId = context.agentId || context.userId;
    return this.agentService.disconnect(agentId, disconnectDto);
  }

  @Post(':id/disconnect')
  @ApiOperation({
    summary: 'Agent disconnect (deprecated)',
    description: '[Deprecated] Use POST /agents/disconnect instead. Kept for backward compatibility until all agents are upgraded.'
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

  @Post(':id/anonymous-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate anonymous chat token',
    description: 'Generate a JWT token for anonymous users to connect to the agent chat WebSocket. Used for chatbot widget integration. Requires org.owner or org.editor role. Supports both JWT and API key authentication.',
  })
  @ApiResponse({ status: 200, description: 'Token generated successfully', type: AnonymousTokenResponseDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(ApiKeyOrJwtGuard)
  async generateAnonymousToken(
    @Param('id') id: string,
    @Body() dto: AnonymousTokenDto,
    @CurrentUser() context: RequestContext,
  ): Promise<AnonymousTokenResponseDto> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.generateAnonymousToken(resolvedId, dto, context);
  }

  @Get(':id/anonymous-tokens')
  @ApiOperation({
    summary: 'List anonymous tokens',
    description: 'List all anonymous tokens for an agent. Does not return JWT values.',
  })
  @ApiResponse({ status: 200, description: 'List of tokens', type: AnonymousTokenListResponseDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async listAnonymousTokens(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<AnonymousTokenListResponseDto> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.listAnonymousTokens(resolvedId, context);
  }

  @Delete(':id/anonymous-tokens/:tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke anonymous token',
    description: 'Revoke an anonymous token by tokenId. Revoked tokens can no longer connect.',
  })
  @ApiResponse({ status: 204, description: 'Token revoked successfully' })
  @ApiResponse({ status: 404, description: 'Agent or token not found' })
  @UseGuards(JwtAuthGuard)
  async revokeAnonymousToken(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.revokeAnonymousToken(resolvedId, tokenId, context);
  }

  // ─── External Signing Keys ───────────────────────────────────────────────────

  @Post(':id/signing-keys')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add external signing key',
    description: 'Upload a partner EC public key (PEM, ES256) to enable partner-signed anonymous tokens. Partner holds the private key and signs tokens locally without calling our API.',
  })
  @ApiResponse({ status: 201, description: 'Key added successfully', type: ExternalSigningKeyEntryDto })
  @ApiResponse({ status: 400, description: 'Invalid public key or keyId already exists' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async addExternalSigningKey(
    @Param('id') id: string,
    @Body() dto: AddExternalSigningKeyDto,
    @CurrentUser() context: RequestContext,
  ): Promise<ExternalSigningKeyEntryDto> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.addExternalSigningKey(resolvedId, dto, context);
  }

  @Get(':id/signing-keys')
  @ApiOperation({
    summary: 'List external signing keys',
    description: 'List all external signing keys for an agent. Public key values are not returned.',
  })
  @ApiResponse({ status: 200, description: 'List of signing keys', type: ExternalSigningKeyListResponseDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async listExternalSigningKeys(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<ExternalSigningKeyListResponseDto> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.listExternalSigningKeys(resolvedId, context);
  }

  @Delete(':id/signing-keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke external signing key',
    description: 'Revoke a signing key by keyId. All tokens signed by the corresponding private key will immediately fail verification.',
  })
  @ApiResponse({ status: 204, description: 'Key revoked successfully' })
  @ApiResponse({ status: 404, description: 'Agent or key not found' })
  @UseGuards(JwtAuthGuard)
  async revokeExternalSigningKey(
    @Param('id') id: string,
    @Param('keyId') keyId: string,
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.revokeExternalSigningKey(resolvedId, keyId, context);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop agent',
    description: 'Suspend an agent. Allowed when status is idle or inactive. Returns 400 if agent is busy.',
  })
  @ApiResponse({ status: 200, description: 'Agent suspended successfully' })
  @ApiResponse({ status: 400, description: 'Agent is busy' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async stopAgent(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.stopAgent(resolvedId, context);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start agent',
    description: 'Resume a suspended agent by setting status back to inactive. Only allowed when agent is suspended.',
  })
  @ApiResponse({ status: 200, description: 'Agent set to inactive successfully' })
  @ApiResponse({ status: 400, description: 'Agent is not suspended' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async startAgent(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.startAgent(resolvedId, context);
  }

  @Post(':id/wake')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Wake agent',
    description: 'Wake a sleeping agent by setting status back to idle. Only allowed when agent is sleeping.',
  })
  @ApiResponse({ status: 200, description: 'Agent woken up successfully' })
  @ApiResponse({ status: 400, description: 'Agent is not sleeping' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async wakeAgent(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.wakeAgent(resolvedId, context);
  }

  @Post(':id/sleep')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sleep agent',
    description: 'Put an agent to sleep. Allowed when status is idle or inactive. Returns 400 if agent is busy or suspended.',
  })
  @ApiResponse({ status: 200, description: 'Agent put to sleep successfully' })
  @ApiResponse({ status: 400, description: 'Agent is busy or suspended' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async sleepAgent(
    @Param('id') id: string,
    @Body() sleepDto: AgentSleepActionDto,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.sleepAgent(resolvedId, sleepDto, context);
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restart agent',
    description: 'Force restart an agent to inactive status. Unlike stop, this is allowed when agent is busy. Returns 400 if agent is suspended.',
  })
  @ApiResponse({ status: 200, description: 'Agent restarted successfully' })
  @ApiResponse({ status: 400, description: 'Agent is suspended' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async restartAgent(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.restartAgent(resolvedId, context);
  }

  @Post(':id/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update agent on node',
    description: 'Trigger node to pull latest version and restart agent. Only for engineer agents deployed on a node.',
  })
  @ApiResponse({ status: 200, description: 'Update command sent to node' })
  @ApiResponse({ status: 400, description: 'Agent not deployed on a node' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async updateAgentOnNode(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.updateAgentOnNode(resolvedId, context);
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
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.regenerateCredentials(resolvedId, context);
  }

  // ─── Debug Logs ──────────────────────────────────────────────────────────────

  @Post(':id/logs')
  @ApiOperation({ summary: 'Add agent log', description: 'Append a debug log entry to an agent (max 100, auto-rotate)' })
  @ApiResponse({ status: 201, description: 'Log entry added' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async addLog(
    @Param('id') id: string,
    @Body() dto: AddAgentLogDto,
    @CurrentUser() context: RequestContext,
  ): Promise<{ success: boolean }> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.addLog(resolvedId, dto);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get agent logs', description: 'Retrieve debug logs of an agent (not included in GET /agents or GET /agents/:id)' })
  @ApiResponse({ status: 200, description: 'Agent logs', type: AgentLogsResponseDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @UseGuards(JwtAuthGuard)
  async getLogs(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<AgentLogsResponseDto> {
    const resolvedId = await this.agentService.resolveAgentId(id, context.orgId);
    return this.agentService.getLogs(resolvedId);
  }
}
