/**
 * Seed CBM MCP Tools
 * Populates all 35 new CBM tools into the database
 * Reference: /docs/aiwm/CBM-MCP-TOOLS.md
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://172.16.3.20:27017';
const DATABASE_NAME = 'core_aiwm';
const COLLECTION_NAME = 'tools';

// Base configuration for all CBM API tools
const CBM_BASE_URL = 'https://api.x-or.cloud/dev/cbm';

const tools = [
  // ========================================
  // A. DOCUMENT MANAGEMENT (12 new tools)
  // ========================================

  // CRUD Operations (5 tools)
  {
    name: 'CreateDocument',
    type: 'api',
    description: 'Create a new document with summary, content, type, labels, status, and scope',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['summary', 'content', 'type'],
        properties: {
          summary: { type: 'string', description: 'Document summary' },
          content: { type: 'string', description: 'Document content' },
          type: { type: 'string', enum: ['html', 'text', 'markdown', 'json'], description: 'Content type' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Document labels' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'], description: 'Document status' },
          scope: { type: 'string', enum: ['public', 'org', 'private'], description: 'Access scope' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Created document with ID and metadata',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/documents',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ListDocuments',
    type: 'api',
    description: 'List documents with pagination, search, and filtering. Returns statistics.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Page number (default: 1)' },
          limit: { type: 'number', description: 'Items per page (default: 10)' },
          search: { type: 'string', description: 'Search query' },
          sort: { type: 'string', description: 'Sort field (e.g., -createdAt)' },
          status: { type: 'string', description: 'Filter by status' },
          type: { type: 'string', description: 'Filter by content type' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Paginated list of documents with statistics',
      },
    },
    execution: {
      method: 'GET',
      baseUrl: CBM_BASE_URL,
      path: '/documents',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'GetDocument',
    type: 'api',
    description: 'Get document metadata by ID (excludes content field for token efficiency)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Document metadata without content',
      },
    },
    execution: {
      method: 'GET',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'UpdateDocument',
    type: 'api',
    description: 'Update document metadata (summary, labels, status, scope). Does NOT update content - use ReplaceDocumentContent or Append operations instead.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          summary: { type: 'string', description: 'New summary' },
          labels: { type: 'array', items: { type: 'string' }, description: 'New labels' },
          status: { type: 'string', description: 'New status' },
          scope: { type: 'string', description: 'New scope' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated document metadata',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'DeleteDocument',
    type: 'api',
    description: 'Soft delete a document by ID',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Deletion confirmation',
      },
    },
    execution: {
      method: 'DELETE',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}',
      authRequired: true,
    },
    scope: 'org',
  },

  // Replace Operations (4 tools)
  {
    name: 'ReplaceDocumentContent',
    type: 'api',
    description: 'Replace entire document content',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'content'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          content: { type: 'string', description: 'New content to replace entire document' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Update confirmation',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}/content',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ReplaceDocumentText',
    type: 'api',
    description: 'Find and replace text in document (case-sensitive)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'find', 'replace'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          find: { type: 'string', description: 'Text to find (case-sensitive)' },
          replace: { type: 'string', description: 'Replacement text' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Update confirmation with match count',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}/content',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ReplaceDocumentRegex',
    type: 'api',
    description: 'Find and replace using regex pattern (supports capture groups like $1, $2)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'pattern', 'replace'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          pattern: { type: 'string', description: 'Regex pattern to find' },
          replace: { type: 'string', description: 'Replacement text (can use $1, $2 for capture groups)' },
          flags: { type: 'string', description: 'Regex flags (e.g., "gi" for global case-insensitive)' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Update confirmation with match count',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}/content',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ReplaceDocumentMarkdown',
    type: 'api',
    description: 'Replace entire markdown section by heading',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'section', 'sectionContent'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          section: { type: 'string', description: 'Markdown heading (e.g., "## Features")' },
          sectionContent: { type: 'string', description: 'New content for entire section' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Update confirmation',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}/content',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },

  // Append Operations (3 tools - Token Efficient)
  {
    name: 'AppendToDocument',
    type: 'api',
    description: 'Append content to end of document. Token efficient - saves 95-99% tokens vs GET + replace.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'content'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          content: { type: 'string', description: 'Content to append at end of document' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Update confirmation',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}/content',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'AppendToDocumentAfterText',
    type: 'api',
    description: 'Append content after text match. Token efficient - saves 95-99% tokens vs GET + replace.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'find', 'content'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          find: { type: 'string', description: 'Text to find (case-sensitive)' },
          content: { type: 'string', description: 'Content to append after found text' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Update confirmation',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}/content',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'AppendToDocumentAfterMarkdownSection',
    type: 'api',
    description: 'Append content at end of markdown section. Token efficient - saves 95-99% tokens vs GET + replace.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'section', 'content'],
        properties: {
          id: { type: 'string', description: 'Document ID' },
          section: { type: 'string', description: 'Markdown heading (e.g., "## Features")' },
          content: { type: 'string', description: 'Content to append at end of section' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Update confirmation',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/documents/{id}/content',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },

  // ========================================
  // B. PROJECT MANAGEMENT (10 tools)
  // ========================================

  // CRUD Operations (5 tools)
  {
    name: 'CreateProject',
    type: 'api',
    description: 'Create a new project with name, description, and optional dates',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Project name' },
          description: { type: 'string', description: 'Project description' },
          startDate: { type: 'string', description: 'Start date (ISO format)' },
          endDate: { type: 'string', description: 'End date (ISO format)' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Created project with ID and metadata',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/projects',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ListProjects',
    type: 'api',
    description: 'List projects with pagination, sorting, and filtering. Returns statistics.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Page number (default: 1)' },
          limit: { type: 'number', description: 'Items per page (default: 10)' },
          sort: { type: 'string', description: 'Sort field (e.g., -createdAt)' },
          status: { type: 'string', description: 'Filter by status' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Paginated list of projects with statistics',
      },
    },
    execution: {
      method: 'GET',
      baseUrl: CBM_BASE_URL,
      path: '/projects',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'GetProject',
    type: 'api',
    description: 'Get project details by ID',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Project details',
      },
    },
    execution: {
      method: 'GET',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'UpdateProject',
    type: 'api',
    description: 'Update project information (name, description, dates)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
          name: { type: 'string', description: 'New project name' },
          description: { type: 'string', description: 'New description' },
          startDate: { type: 'string', description: 'New start date (ISO format)' },
          endDate: { type: 'string', description: 'New end date (ISO format)' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated project details',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'DeleteProject',
    type: 'api',
    description: 'Soft delete project (only completed/archived projects)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Deletion confirmation',
      },
    },
    execution: {
      method: 'DELETE',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}',
      authRequired: true,
    },
    scope: 'org',
  },

  // Workflow Actions (5 tools)
  {
    name: 'ActivateProject',
    type: 'api',
    description: 'Activate a project (status: draft → active)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated project with active status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}/activate',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'HoldProject',
    type: 'api',
    description: 'Put project on hold (status: active → on_hold)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated project with on_hold status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}/hold',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ResumeProject',
    type: 'api',
    description: 'Resume a held project (status: on_hold → active)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated project with active status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}/resume',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'CompleteProject',
    type: 'api',
    description: 'Mark project as completed (status: active → completed)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated project with completed status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}/complete',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ArchiveProject',
    type: 'api',
    description: 'Archive a completed project (status: completed → archived)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Project ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated project with archived status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/projects/{id}/archive',
      authRequired: true,
    },
    scope: 'org',
  },

  // ========================================
  // C. WORK MANAGEMENT (13 tools)
  // ========================================

  // CRUD Operations (5 tools)
  {
    name: 'CreateWork',
    type: 'api',
    description: 'Create a new work item with title, description, project, and assignee',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', description: 'Work title' },
          description: { type: 'string', description: 'Work description' },
          projectId: { type: 'string', description: 'Associated project ID' },
          assignedTo: { type: 'string', description: 'Assignee ID (user or agent)' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Created work item with ID and metadata',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ListWorks',
    type: 'api',
    description: 'List work items with pagination, sorting, and filtering. Returns statistics.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Page number (default: 1)' },
          limit: { type: 'number', description: 'Items per page (default: 10)' },
          sort: { type: 'string', description: 'Sort field (e.g., -createdAt)' },
          status: { type: 'string', description: 'Filter by status' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Paginated list of work items with statistics',
      },
    },
    execution: {
      method: 'GET',
      baseUrl: CBM_BASE_URL,
      path: '/works',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'GetWork',
    type: 'api',
    description: 'Get work item details by ID',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Work item details',
      },
    },
    execution: {
      method: 'GET',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'UpdateWork',
    type: 'api',
    description: 'Update work item information (title, description, priority)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
          title: { type: 'string', description: 'New work title' },
          description: { type: 'string', description: 'New description' },
          priority: { type: 'string', description: 'New priority' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item details',
      },
    },
    execution: {
      method: 'PATCH',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'DeleteWork',
    type: 'api',
    description: 'Soft delete work item (only done/cancelled work items)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Deletion confirmation',
      },
    },
    execution: {
      method: 'DELETE',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}',
      authRequired: true,
    },
    scope: 'org',
  },

  // Workflow Actions (7 tools)
  {
    name: 'StartWork',
    type: 'api',
    description: 'Start working on a task (status: todo → in_progress)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item with in_progress status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/start',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'BlockWork',
    type: 'api',
    description: 'Block work item with reason (status: in_progress → blocked)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id', 'reason'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
          reason: { type: 'string', description: 'Reason for blocking (required)' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item with blocked status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/block',
      headers: { 'Content-Type': 'application/json' },
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'UnblockWork',
    type: 'api',
    description: 'Unblock work item (status: blocked → in_progress)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item with in_progress status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/unblock',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'RequestReviewWork',
    type: 'api',
    description: 'Request review for work item (status: in_progress → review)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item with review status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/request-review',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'CompleteWork',
    type: 'api',
    description: 'Mark work item as complete (status: review → done)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item with done status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/complete',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'ReopenWork',
    type: 'api',
    description: 'Reopen completed work item (status: done → in_progress)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item with in_progress status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/reopen',
      authRequired: true,
    },
    scope: 'org',
  },
  {
    name: 'CancelWork',
    type: 'api',
    description: 'Cancel work item (status: any → cancelled)',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Updated work item with cancelled status',
      },
    },
    execution: {
      method: 'POST',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/cancel',
      authRequired: true,
    },
    scope: 'org',
  },

  // Special Operations (1 tool)
  {
    name: 'CanWorkTrigger',
    type: 'api',
    description: 'Check if work can trigger agent execution. Validates: assigned to agent, startAt time reached, status ready, not blocked.',
    category: 'data',
    status: 'active',
    schema: {
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Work ID' },
        },
      },
      outputSchema: {
        type: 'string',
        description: 'Validation result with canTrigger boolean and reason',
      },
    },
    execution: {
      method: 'GET',
      baseUrl: CBM_BASE_URL,
      path: '/works/{id}/can-trigger',
      authRequired: true,
    },
    scope: 'org',
  },
];

async function seedTools() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('=== CBM MCP Tools Seeding ===');
    console.log(`Connecting to: ${MONGODB_URI}`);
    console.log(`Database: ${DATABASE_NAME}`);
    console.log(`Collection: ${COLLECTION_NAME}`);
    console.log('');

    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DATABASE_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Add timestamps and owner info to each tool
    const now = new Date();
    const toolsWithMetadata = tools.map((tool) => ({
      ...tool,
      createdAt: now,
      updatedAt: now,
      owner: {
        userId: '',
        orgId: '',
        agentId: '',
        groupId: '',
        appId: '',
      },
      createdBy: {
        userId: '',
        username: 'system',
        type: 'system',
      },
      updatedBy: {
        userId: '',
        username: 'system',
        type: 'system',
      },
    }));

    console.log(`📝 Seeding ${toolsWithMetadata.length} tools...`);
    console.log('');

    let insertedCount = 0;
    let skippedCount = 0;

    for (const tool of toolsWithMetadata) {
      // Check if tool already exists
      const existing = await collection.findOne({ name: tool.name });

      if (existing) {
        console.log(`⏭️  Skipped: ${tool.name} (already exists)`);
        skippedCount++;
      } else {
        await collection.insertOne(tool);
        console.log(`✅ Inserted: ${tool.name}`);
        insertedCount++;
      }
    }

    console.log('');
    console.log('=== Seeding Summary ===');
    console.log(`✅ Inserted: ${insertedCount} tools`);
    console.log(`⏭️  Skipped: ${skippedCount} tools (already existed)`);
    console.log(`📊 Total tools in specification: ${tools.length}`);
    console.log('');

    // Show tool count by category
    const pipeline = [
      { $match: { deletedAt: { $exists: false } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ];

    const stats = await collection.aggregate(pipeline).toArray();
    console.log('=== Tools by Category ===');
    stats.forEach((stat) => {
      console.log(`${stat._id}: ${stat.count} tools`);
    });

    console.log('');
    console.log('🎉 Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

seedTools();
