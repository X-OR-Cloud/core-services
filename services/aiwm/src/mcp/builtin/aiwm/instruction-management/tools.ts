/**
 * InstructionManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeListInstructions,
  executeCreateInstruction,
  executeUpdateInstruction,
  executeDeleteInstruction,
} from './executors';
import {
  ListInstructionsSchema,
  CreateInstructionSchema,
  UpdateInstructionSchema,
  DeleteInstructionSchema,
} from './schemas';

/**
 * All InstructionManagement tools
 */
export const InstructionManagementTools: ToolDefinition[] = [
  {
    name: 'ListInstructions',
    description: 'List agent instructions (system prompts) with pagination and filters (name, tags, status)',
    type: 'builtin',
    category: 'InstructionManagement',
    executor: executeListInstructions,
    inputSchema: ListInstructionsSchema,
  },
  {
    name: 'CreateInstruction',
    description:
      'Create a new instruction (system prompt) to assign to agents. ' +
      'systemPrompt supports @project:<id> and @document:<id> context references that are resolved at agent connect time.',
    type: 'builtin',
    category: 'InstructionManagement',
    executor: executeCreateInstruction,
    inputSchema: CreateInstructionSchema,
  },
  {
    name: 'UpdateInstruction',
    description:
      'Update an existing instruction by ID. Supports partial updates — only provided fields are changed. ' +
      'tags[] replaces the entire array when provided.',
    type: 'builtin',
    category: 'InstructionManagement',
    executor: executeUpdateInstruction,
    inputSchema: UpdateInstructionSchema,
  },
  {
    name: 'DeleteInstruction',
    description:
      'Soft-delete an instruction by ID. Will fail if active agents are currently using this instruction.',
    type: 'builtin',
    category: 'InstructionManagement',
    executor: executeDeleteInstruction,
    inputSchema: DeleteInstructionSchema,
  },
];
