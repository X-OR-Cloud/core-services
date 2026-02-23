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

/**
 * Schema for creating a new project
 */
export const CreateProjectSchema = z.object({
  name: z
    .string()
    .max(200)
    .describe('Project name (max 200 characters)'),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe('Project description (max 2000 characters)'),
  members: z
    .array(z.string())
    .optional()
    .describe('Array of member user IDs'),
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
  description: z
    .string()
    .max(2000)
    .optional()
    .describe('Updated description'),
  members: z
    .array(z.string())
    .optional()
    .describe('Updated member user IDs'),
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
