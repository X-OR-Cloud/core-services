/**
 * ProjectManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeCreateProject,
  executeListProjects,
  executeGetProject,
  executeUpdateProject,
  executeDeleteProject,
  executeActivateProject,
  executeHoldProject,
  executeResumeProject,
  executeCompleteProject,
  executeArchiveProject,
} from './executors';
import {
  CreateProjectSchema,
  ListProjectsSchema,
  GetProjectSchema,
  UpdateProjectSchema,
  DeleteProjectSchema,
  ProjectActionSchema,
} from './schemas';

/**
 * All ProjectManagement tools
 */
export const ProjectManagementTools: ToolDefinition[] = [
  {
    name: 'CreateProject',
    description:
      'Create a new project with name, and optional description, members, dates, tags. Status is auto-set to draft.',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeCreateProject,
    inputSchema: CreateProjectSchema,
  },
  {
    name: 'ListProjects',
    description:
      'List projects with pagination, search (name, description, tags), and filter by status',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeListProjects,
    inputSchema: ListProjectsSchema,
  },
  {
    name: 'GetProject',
    description: 'Get a specific project by ID with full details including description',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeGetProject,
    inputSchema: GetProjectSchema,
  },
  {
    name: 'UpdateProject',
    description:
      'Update project metadata (name, description, members, dates, tags). Status cannot be changed here — use action tools instead.',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeUpdateProject,
    inputSchema: UpdateProjectSchema,
  },
  {
    name: 'DeleteProject',
    description:
      'Soft delete a project by ID. Only projects with status completed or archived can be deleted.',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeDeleteProject,
    inputSchema: DeleteProjectSchema,
  },
  {
    name: 'ActivateProject',
    description:
      'Activate a project (transition from draft to active)',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeActivateProject,
    inputSchema: ProjectActionSchema,
  },
  {
    name: 'HoldProject',
    description:
      'Put a project on hold (transition from active to on_hold)',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeHoldProject,
    inputSchema: ProjectActionSchema,
  },
  {
    name: 'ResumeProject',
    description:
      'Resume a project (transition from on_hold to active)',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeResumeProject,
    inputSchema: ProjectActionSchema,
  },
  {
    name: 'CompleteProject',
    description:
      'Complete a project (transition from active to completed)',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeCompleteProject,
    inputSchema: ProjectActionSchema,
  },
  {
    name: 'ArchiveProject',
    description:
      'Archive a project (transition from completed to archived)',
    type: 'builtin',
    category: 'ProjectManagement',
    executor: executeArchiveProject,
    inputSchema: ProjectActionSchema,
  },
];
