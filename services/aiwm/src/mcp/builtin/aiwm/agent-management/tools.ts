/**
 * AgentManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeGetAgent,
  executeListAgents,
  executeCreateAssistantAgent,
  executeUpdateAgent,
  executeDeleteAgent,
} from './executors';
import {
  GetAgentSchema,
  ListAgentsSchema,
  CreateAssistantAgentSchema,
  UpdateAgentSchema,
  DeleteAgentSchema,
} from './schemas';

/**
 * All AgentManagement tools
 */
export const AgentManagementTools: ToolDefinition[] = [
  {
    name: 'GetAgent',
    description:
      'Get a specific agent by ID or code with full details including settings, channels, and configuration. Each agent has a unique `code` (e.g. "jack-bold") that can be used as an alias for its ID.',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeGetAgent,
    inputSchema: GetAgentSchema,
  },
  {
    name: 'ListAgents',
    description:
      'List agents with pagination and filters (name, tags, description, status, type). Each agent has a unique `code` field — a human-readable alias (e.g. "jack-bold") that can be used instead of the ID when referencing agents.',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeListAgents,
    inputSchema: ListAgentsSchema,
  },
  {
    name: 'CreateAssistantAgent',
    description:
      'Create a new assistant agent (in-process, run by AIWM). Requires a running deployment and an instruction. Use allowedToolIds to whitelist MCP tool sets, and allowedFunctions to restrict which functions the agent can call.',
    type: 'builtin',
    category: 'AgentManagement',
    executor: executeCreateAssistantAgent,
    inputSchema: CreateAssistantAgentSchema,
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
