import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type LlmProviderDocument = LlmProvider & Document;

export enum LlmProviderSchema {
  OPENAI = 'openai',
  GOOGLE = 'google',
  ANTHROPIC = 'anthropic',
}

export enum LlmProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

@Schema({ _id: false })
class ApiKeyObject {
  @Prop({ required: true })
  maskedValue: string;

  @Prop({ required: true })
  encryptedValue: string;
}

@Schema({ _id: false })
class LlmStats {
  @Prop({ default: 0 }) totalCalls: number;
  @Prop({ default: 0 }) successCalls: number;
  @Prop({ default: 0 }) errorCalls: number;
  @Prop({ default: 0 }) consecutiveErrors: number;
  @Prop({ default: 0 }) avgLatencyMs: number;
  @Prop({ default: 0 }) totalTokensUsed: number;
  @Prop({ default: null }) lastUsedAt: Date | null;
  @Prop({ default: null }) lastErrorAt: Date | null;
  @Prop({ default: null }) lastErrorMessage: string | null;
}

@Schema({ _id: false })
class DefaultParams {
  @Prop() temperature?: number;
  @Prop() max_tokens?: number;
  @Prop() top_p?: number;
}

@Schema({ timestamps: true })
export class LlmProvider extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: LlmProviderSchema })
  schema: string;

  @Prop({ required: true })
  baseUrl: string;

  @Prop({ required: true, type: ApiKeyObject })
  apiKey: ApiKeyObject;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true, enum: LlmProviderStatus, default: LlmProviderStatus.ACTIVE })
  status: string;

  @Prop({ required: true, default: 10 })
  priority: number;

  @Prop({ type: DefaultParams, default: {} })
  defaultParams: DefaultParams;

  @Prop({ type: LlmStats, default: () => ({}) })
  stats: LlmStats;
}

export const LlmProviderSchemaFactory = SchemaFactory.createForClass(LlmProvider);
