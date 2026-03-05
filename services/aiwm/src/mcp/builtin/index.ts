/**
 * Builtin MCP tools registry
 */

import { ToolDefinition } from '../types';
import {
  DocumentManagementTools,
  WorkManagementTools,
  ProjectManagementTools,
} from './cbm';
import { UserManagementTools } from './iam';
import { AgentManagementTools, InstructionManagementTools } from './aiwm';

/**
 * All builtin tools from all services
 */
export const BuiltInTools: ToolDefinition[] = [
  ...DocumentManagementTools,
  ...WorkManagementTools,
  ...ProjectManagementTools,
  ...UserManagementTools,
  ...AgentManagementTools,
  ...InstructionManagementTools,
];

/**
 * Get builtin tool by name
 */
export function getBuiltInTool(name: string): ToolDefinition | undefined {
  return BuiltInTools.find((tool) => tool.name === name);
}

/**
 * Get all builtin tools by category
 */
export function getBuiltInToolsByCategory(
  category: string
): ToolDefinition[] {
  return BuiltInTools.filter((tool) => tool.category === category);
}
