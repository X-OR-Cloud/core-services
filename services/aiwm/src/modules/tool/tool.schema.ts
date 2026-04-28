import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ToolDocument = Tool & Document;

/**
 * Tool - MCP and Built-in Tools
 * Simple MVP version following AIWM.md specification
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true, collection: 'tools' })
export class Tool extends BaseSchema {
  @Prop({ required: true, maxlength: 100 })
  name!: string; // e.g., "webSearch", "listAgents"

  @Prop({ required: true, enum: ['mcp', 'builtin', 'custom', 'api'] })
  type!: string; // "mcp", "builtin", "custom", or "api"

  @Prop({ required: true, maxlength: 500 })
  description!: string;

  @Prop({ required: true, enum: ['productivity', 'data', 'system', 'communication'] })
  category!: string;

  // MCP-specific fields (only if type = "mcp")
  @Prop()
  transport?: string; // "sse" or "http" - required if type="mcp"

  @Prop()
  endpoint?: string; // Tool endpoint URL - for mcp/api types

  @Prop()
  dockerImage?: string; // e.g., "aiops/mcp-web-search:latest" - required if type="mcp"

  @Prop()
  containerId?: string; // Running container ID - set when deployed

  @Prop({ min: 1024, max: 65535 })
  port?: number; // Container port - required if type="mcp"

  @Prop({ type: Object })
  environment?: Record<string, string>; // Environment variables for MCP container

  @Prop()
  healthEndpoint?: string; // Health check URL, e.g., "/health"

  @Prop()
  lastHealthCheck?: Date; // Last health check timestamp

  // Built-in tools are pre-packaged in agent container, no deployment needed
  // API tools call internal HTTP APIs (e.g., CBM services) via AIWM proxy
  // Custom tools are user-defined functions executed by agent client

  // Execution configuration (for api type)
  @Prop({ type: Object })
  execution?: {
    method?: string;          // HTTP method: GET, POST, PUT, DELETE
    baseUrl?: string;         // Base URL of the service (e.g., http://cbm:3001)
    path?: string;            // API path template (e.g., /projects/{id})
    headers?: Record<string, string>; // Additional headers
    authRequired?: boolean;   // Whether to pass user JWT token
    timeout?: number;         // Request timeout in ms
  };

  // Common fields
  @Prop({ required: true, enum: ['active', 'inactive', 'error'], default: 'active' })
  status!: string; // 'active', 'inactive', or 'error'

  @Prop({ required: true, type: Object })
  schema!: {
    inputSchema: object;  // JSON Schema for input
    outputSchema: object; // JSON Schema for output
  };

  // Access control
  @Prop({ required: true, enum: ['public', 'org', 'private'], default: 'public' })
  scope!: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const ToolSchema = SchemaFactory.createForClass(Tool);

// Indexes for performance
ToolSchema.index({ type: 1, status: 1 });
ToolSchema.index({ category: 1 });
ToolSchema.index({ name: 'text', description: 'text' }); // Text search
