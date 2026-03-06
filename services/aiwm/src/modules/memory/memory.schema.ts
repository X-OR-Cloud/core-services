import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MemoryCategory = 'user-preferences' | 'decisions' | 'notes' | 'lessons';

export type AgentMemoryDocument = AgentMemory & Document;

/**
 * AgentMemory - Persistent memory for AI agents, scoped by agentId
 * Stores factual, concise information across sessions
 */
@Schema({ timestamps: true })
export class AgentMemory {
  @Prop({ required: true })
  agentId: string;

  @Prop({ required: true, enum: ['user-preferences', 'decisions', 'notes', 'lessons'] })
  category: MemoryCategory;

  @Prop({ required: true })
  key: string; // slug-style, e.g. "dung-report-style", unique within (agentId, category)

  @Prop({ required: true, maxlength: 2000 })
  content: string; // Short, factual text

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Date, default: null })
  deletedAt: Date | null; // null = active (soft delete)
}

export const AgentMemorySchema = SchemaFactory.createForClass(AgentMemory);

// Unique compound index — upsert target
AgentMemorySchema.index({ agentId: 1, category: 1, key: 1 }, { unique: true });

// List/search index
AgentMemorySchema.index({ agentId: 1, category: 1, updatedAt: -1 });

// Full-text search index
AgentMemorySchema.index({ agentId: 1, content: 'text', key: 'text' });
