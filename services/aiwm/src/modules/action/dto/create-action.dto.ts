import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsNumber,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ActionType, ActorRole, ActionStatus } from '../action.enum';

export class ActorDto {
  @ApiProperty({ enum: ActorRole })
  @IsEnum(ActorRole)
  role: ActorRole;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalProvider?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalUsername?: string;
}

export class ActionAttachmentDto {
  @ApiProperty({ enum: ['file', 'image', 'video', 'audio', 'document'] })
  @IsEnum(['file', 'image', 'video', 'audio', 'document'])
  type: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fileId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  size?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class ActionReferenceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  app?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiProperty({ enum: ['agent', 'document', 'project', 'work', 'instruction', 'user', 'text'] })
  @IsEnum(['agent', 'document', 'project', 'work', 'instruction', 'user', 'text'])
  resourceType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty()
  @IsString()
  label: string;
}

export class ActionMetadataDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  toolName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  toolInput?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  toolUseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  toolResult?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  toolResultId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  thinkingContent?: string;

  @ApiProperty({ required: false, type: [ActionAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionAttachmentDto)
  attachments?: ActionAttachmentDto[];

  @ApiProperty({ required: false, type: [ActionReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionReferenceDto)
  references?: ActionReferenceDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  raw?: any;

  // /ignore flag — agent skips processing this message
  @ApiProperty({ required: false })
  @IsOptional()
  skipAgent?: boolean;

  // command metadata — for ActionType.COMMAND records
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commandName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetConversationId?: string;
}

export class ActionUsageDto {
  @ApiProperty()
  @IsNumber()
  inputTokens: number;

  @ApiProperty()
  @IsNumber()
  outputTokens: number;

  @ApiProperty()
  @IsNumber()
  duration: number;
}

export class CreateActionDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsString()
  conversationId: string;

  @ApiProperty({ description: 'Connection ID (if from external provider)', required: false })
  @IsOptional()
  @IsString()
  connectionId?: string;

  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  type: ActionType;

  @ApiProperty({ type: ActorDto })
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty({ type: ActionMetadataDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActionMetadataDto)
  metadata?: ActionMetadataDto;

  @ApiProperty({ type: ActionUsageDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActionUsageDto)
  usage?: ActionUsageDto;

  @ApiProperty({ enum: ActionStatus, required: false })
  @IsOptional()
  @IsEnum(ActionStatus)
  status?: ActionStatus;

  @ApiProperty({ description: 'Parent action ID for threading', required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}
