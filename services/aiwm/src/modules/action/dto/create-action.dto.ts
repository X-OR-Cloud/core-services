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

  @ApiProperty()
  @IsString()
  url: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  raw?: any;
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
