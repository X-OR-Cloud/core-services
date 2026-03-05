/**
 * Zod schemas for ProjectManagement tools
 */

import * as z from 'zod';

// Project status enum
const ProjectStatusEnum = z.enum([
  'draft',
  'active',
  'on_hold',
  'completed',
  'archived',
]);

// Project member schema
const ProjectMemberSchema = z.object({
  type: z.enum(['user', 'agent']).describe('Whether the member is a user or agent'),
  id: z.string().describe('User ID or Agent ID'),
  role: z.enum(['project.lead', 'project.member']).describe('Member role in the project'),
});

/**
 * Schema for creating a new project
 */
export const CreateProjectSchema = z.object({
  name: z
    .string()
    .max(200)
    .describe('Project name (max 200 characters)'),
  summary: z
    .string()
    .max(500)
    .optional()
    .describe('Public summary (max 500 characters) — visible to all org members'),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe('Private description (max 2000 characters) — visible to project members only'),
  lead: z
    .object({ type: z.enum(['user', 'agent']), id: z.string() })
    .optional()
    .describe('Project lead — format: { type: "user"|"agent", id: "<id>" }. Auto-added as project.lead member'),
  members: z
    .array(ProjectMemberSchema)
    .optional()
    .describe('Initial members list with roles. Each member: { type, id, role }'),
  startDate: z
    .string()
    .optional()
    .describe('Project start date (ISO 8601 format)'),
  endDate: z
    .string()
    .optional()
    .describe('Project end date (ISO 8601 format)'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Tags for categorization'),
});

/**
 * Schema for listing projects
 */
export const ListProjectsSchema = z.object({
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe('Page number (default: 1)'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe('Items per page (max 100, default: 10)'),
  search: z
    .string()
    .optional()
    .describe('Search in name, description, and tags'),
  status: ProjectStatusEnum.optional().describe('Filter by project status'),
});

/**
 * Schema for getting a project by ID
 */
export const GetProjectSchema = z.object({
  id: z.string().describe('Project ID'),
});

/**
 * Schema for updating project metadata
 */
export const UpdateProjectSchema = z.object({
  id: z.string().describe('Project ID'),
  name: z.string().max(200).optional().describe('Updated project name'),
  summary: z
    .string()
    .max(500)
    .optional()
    .describe('Updated public summary (max 500 characters)'),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe('Updated private description (max 2000 characters)'),
  startDate: z
    .string()
    .optional()
    .describe('Updated start date (ISO 8601)'),
  endDate: z
    .string()
    .optional()
    .describe('Updated end date (ISO 8601)'),
  tags: z.array(z.string()).optional().describe('Updated tags'),
});

/**
 * Schema for deleting a project
 */
export const DeleteProjectSchema = z.object({
  id: z
    .string()
    .describe('Project ID (only completed or archived projects can be deleted)'),
});

/**
 * Schema for project action (activate, hold, resume, complete, archive)
 */
export const ProjectActionSchema = z.object({
  id: z.string().describe('Project ID'),
});

/**
 * Schema for listing project members
 */
export const ListProjectMembersSchema = z.object({
  id: z.string().describe('Project ID'),
});

/**
 * Schema for adding a member to a project
 */
export const AddProjectMemberSchema = z.object({
  id: z.string().describe('Project ID'),
  type: z.enum(['user', 'agent']).describe('Whether the member is a user or agent'),
  memberId: z.string().describe('User ID or Agent ID to add'),
  role: z.enum(['project.lead', 'project.member']).describe('Role to assign: project.lead or project.member'),
});

/**
 * Schema for updating a project member's role
 */
export const UpdateProjectMemberSchema = z.object({
  id: z.string().describe('Project ID'),
  memberId: z.string().describe('User ID or Agent ID of the member to update'),
  role: z.enum(['project.lead', 'project.member']).describe('New role: project.lead or project.member'),
});

/**
 * Schema for removing a member from a project
 */
export const RemoveProjectMemberSchema = z.object({
  id: z.string().describe('Project ID'),
  memberId: z.string().describe('User ID or Agent ID of the member to remove'),
});
