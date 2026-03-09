/**
 * AgentManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeGetAgent,
  executeListAgents,
  executeCreateAgent,
  executeUpdateAgent,
  executeDeleteAgent,
} from './executors';
import {
  GetAgentSchema,
  ListAgentsSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  DeleteAgentSchema,
} from './schemas';

/**
 * All AgentManagement tools
 */
export const AgentManagementTools: ToolDefinition[] = [
  {
    name: 'GetAgent',
    description: 'Get a specific agent by ID with full details including settings, channels, and configuration.',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeGetAgent,
    inputSchema: GetAgentSchema,
  },
  {
    name: 'ListAgents',
    description: 'List agents with pagination and filters (name, tags, description, status, type)',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeListAgents,
    inputSchema: ListAgentsSchema,
  },
  {
    name: 'CreateAgent',
    description:
      'Create a new AI agent. For claude-agent-sdk agents: set settings.claude_model (e.g. "claude-3-5-sonnet-latest"), settings.claude_maxTurns, settings.auth_roles, and channels[] for Discord/Telegram integration. Use type="managed" for system-deployed agents (requires nodeId), type="autonomous" for user-deployed agents.',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeCreateAgent,
    inputSchema: CreateAgentSchema,
  },
  {
    name: 'UpdateAgent',
    description:
      'Update an existing agent by ID. Supports partial updates — only provided fields are changed. channels[] replaces the entire array when provided.',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeUpdateAgent,
    inputSchema: UpdateAgentSchema,
  },
  {
    name: 'DeleteAgent',
    description: 'Soft-delete an agent by ID. The agent will be marked as deleted and excluded from listings.',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeDeleteAgent,
    inputSchema: DeleteAgentSchema,
  },
];
