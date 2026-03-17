/**
 * NodeManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import { executeListNodes, executeGetNode } from './executors';
import { ListNodesSchema, GetNodeSchema } from './schemas';

export const NodeManagementTools: ToolDefinition[] = [
  {
    name: 'ListNodes',
    description:
      'List worker nodes. Filter by status="online" to find nodes available for use as nodeId in engineer agents.',
    type: 'builtin',
    category: 'NodeManagement',
    executor: executeListNodes,
    inputSchema: ListNodesSchema,
  },
  {
    name: 'GetNode',
    description: 'Get full details of a node by ID including status, capabilities, and connection info.',
    type: 'builtin',
    category: 'NodeManagement',
    executor: executeGetNode,
    inputSchema: GetNodeSchema,
  },
];
