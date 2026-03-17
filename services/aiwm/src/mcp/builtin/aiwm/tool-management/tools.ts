/**
 * ToolManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import { executeListTools, executeListAvailableFunctions } from './executors';
import { ListToolsSchema, ListAvailableFunctionsSchema } from './schemas';

export const ToolManagementTools: ToolDefinition[] = [
  {
    name: 'ListTools',
    description: 'List available tool sets (id, name, type, description, status). Use the returned IDs for allowedToolIds when creating agents.',
    type: 'builtin',
    category: 'ToolManagement',
    executor: executeListTools,
    inputSchema: ListToolsSchema,
  },
  {
    name: 'ListAvailableFunctions',
    description: 'List all available function names for given tool set IDs and framework. Use this before CreateAssistantAgent to discover valid values for allowedFunctions.',
    type: 'builtin',
    category: 'ToolManagement',
    executor: executeListAvailableFunctions,
    inputSchema: ListAvailableFunctionsSchema,
  },
];
