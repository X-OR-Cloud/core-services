/**
 * Zod schemas for InstructionManagement tools
 */

import * as z from 'zod';

const InstructionStatusEnum = z.enum(['active', 'inactive']);

/**
 * Schema for listing instructions
 */
export const ListInstructionsSchema = z.object({
  page: z.number().int().positive().optional().default(1).describe('Optional: Page number (default: 1)'),
  limit: z.number().int().positive().max(100).optional().default(10).describe('Optional: Items per page (max 100, default: 10)'),
  name: z.string().optional().describe('Optional: Filter by name (partial match)'),
  tags: z.string().optional().describe('Optional: Filter by tags (comma-separated)'),
  status: InstructionStatusEnum.optional().describe('Optional: Filter by status (active, inactive)'),
});

/**
 * Schema for creating an instruction (system prompt for agents)
 *
 * An instruction defines how an agent behaves — its persona, goals, rules,
 * and step-by-step guidelines. Agents are assigned an instruction via instructionId.
 *
 * Tips for writing good system prompts:
 * - Define the agent's role and persona clearly
 * - List explicit rules and constraints
 * - Use guidelines[] for numbered step-by-step behaviors
 * - Reference @project:<id> or @document:<id> in systemPrompt to inject live context
 */
export const CreateInstructionSchema = z.object({
  name: z.string().describe('Instruction name, e.g. "Customer Support v1"'),
  description: z.string().optional().describe('Optional: Short description of this instruction\'s purpose'),
  systemPrompt: z
    .string()
    .describe(
      'Main system prompt content. Supports context references: @project:<id> and @document:<id> will be resolved and injected at agent connect time.',
    ),
  guidelines: z
    .array(z.string())
    .optional()
    .describe('Optional: Step-by-step behavioral rules, e.g. ["Always greet user by name", "Never reveal internal data"]'),
  tags: z.array(z.string()).optional().describe('Optional: Tags for categorization, e.g. ["customer-support", "vietnamese"]'),
  status: InstructionStatusEnum.optional().default('active').describe('Optional: Status (default: active)'),
});

/**
 * Schema for updating an instruction (all fields optional)
 */
export const UpdateInstructionSchema = z.object({
  id: z.string().describe('Instruction ID to update'),
  name: z.string().optional().describe('Optional: New name'),
  description: z.string().optional().describe('Optional: New description'),
  systemPrompt: z.string().optional().describe('Optional: New system prompt content'),
  guidelines: z.array(z.string()).optional().describe('Optional: New guidelines list (replaces existing)'),
  tags: z.array(z.string()).optional().describe('Optional: New tags (replaces existing)'),
  status: InstructionStatusEnum.optional().describe('Optional: New status (active, inactive)'),
});

/**
 * Schema for deleting an instruction
 */
export const DeleteInstructionSchema = z.object({
  id: z.string().describe('Instruction ID to delete (soft delete). Note: cannot delete if active agents are using this instruction.'),
});
