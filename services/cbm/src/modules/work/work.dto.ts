import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsDate,
  IsObject,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReporterAssignee } from './work.schema';

/**
 * DTO for reporter/assignee entity reference
 */
export class ReporterAssigneeDto implements ReporterAssignee {
  @ApiProperty({
    description: 'Entity type',
    enum: ['agent', 'user'],
    example: 'user',
  })
  @IsEnum(['agent', 'user'])
  type!: 'agent' | 'user';

  @ApiProperty({
    description: 'Entity ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  id!: string;
}

/**
 * DTO for creating a new work
 * MongoDB _id will be used as the primary identifier
 */
export class CreateWorkDto {
  @ApiProperty({
    description: 'Work title',
    example: 'Implement user authentication',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description: 'Detailed description (markdown)',
    example: '## Requirements\n- JWT tokens\n- Refresh token flow\n- Password hashing',
    maxLength: 10000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiProperty({
    description: 'Work type',
    enum: ['epic', 'task', 'subtask'],
    example: 'task',
  })
  @IsEnum(['epic', 'task', 'subtask'])
  type!: string;

  @ApiPropertyOptional({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({
    description: 'Reporter (who reported the work)',
    type: ReporterAssigneeDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => ReporterAssigneeDto)
  reporter!: ReporterAssigneeDto;

  @ApiPropertyOptional({
    description: 'Assignee (who is assigned to the work)',
    type: ReporterAssigneeDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReporterAssigneeDto)
  assignee?: ReporterAssigneeDto;

  @ApiPropertyOptional({
    description: 'Due date',
    example: '2025-03-31T23:59:59.000Z',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Start time (for agent scheduled execution)',
    example: '2025-01-15T09:00:00.000Z',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startAt?: Date;

  @ApiPropertyOptional({
    description: 'Work status',
    enum: ['backlog', 'todo', 'in_progress', 'blocked', 'cancelled', 'review', 'done'],
    example: 'backlog',
    default: 'backlog',
  })
  @IsOptional()
  @IsEnum(['backlog', 'todo', 'in_progress', 'blocked', 'cancelled', 'review', 'done'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Array of Work IDs that this work depends on',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({
    description: 'Parent Work ID (for subtasks)',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Array of document IDs',
    example: ['doc123', 'doc456'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents?: string[];
}

/**
 * DTO for updating an existing work
 * NOTE: Cannot update type, status, or reason
 * - type: Immutable after creation
 * - status: Use action endpoints instead
 * - reason: Managed by block/unblock actions
 */
export class UpdateWorkDto {
  @ApiPropertyOptional({
    description: 'Work title',
    example: 'Implement user authentication - Updated',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description (markdown)',
    example: 'Updated description...',
    maxLength: 10000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Reporter (who reported the work)',
    type: ReporterAssigneeDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReporterAssigneeDto)
  reporter?: ReporterAssigneeDto;

  @ApiPropertyOptional({
    description: 'Assignee (who is assigned to the work)',
    type: ReporterAssigneeDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReporterAssigneeDto)
  assignee?: ReporterAssigneeDto;

  @ApiPropertyOptional({
    description: 'Due date',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Start time (for agent scheduled execution)',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startAt?: Date;

  @ApiPropertyOptional({
    description: 'Array of Work IDs that this work depends on',
    example: ['507f1f77bcf86cd799439011'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({
    description: 'Parent Work ID (for subtasks)',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Array of document IDs',
    example: ['doc123', 'doc456', 'doc789'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents?: string[];
}

/**
 * DTO for blocking a work
 * Requires reason to explain why the work is being blocked
 */
export class BlockWorkDto {
  @ApiProperty({
    description: 'Reason why the work is being blocked',
    example: 'Waiting for API design to be finalized before implementation can continue',
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

/**
 * DTO for assigning work and moving to todo
 */
export class AssignAndTodoDto {
  @ApiProperty({
    description: 'Assignee to assign the work to',
    type: ReporterAssigneeDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => ReporterAssigneeDto)
  assignee!: ReporterAssigneeDto;
}

/**
 * DTO for rejecting work from review
 */
export class RejectReviewDto {
  @ApiProperty({
    description: 'Feedback explaining why the work was rejected',
    example: 'Implementation does not meet acceptance criteria. Please add unit tests.',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  feedback!: string;
}

/**
 * DTO for unblocking work with optional feedback
 */
export class UnblockWorkDto {
  @ApiPropertyOptional({
    description: 'Feedback explaining how the blocker was resolved',
    example: 'API design finalized. Ready to continue implementation.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}

/**
 * DTO for getting next work for user/agent
 */
export class GetNextWorkQueryDto {
  @ApiProperty({
    description: 'Assignee type',
    enum: ['user', 'agent'],
    example: 'user',
  })
  @IsEnum(['user', 'agent'])
  assigneeType!: 'user' | 'agent';

  @ApiProperty({
    description: 'Assignee ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  assigneeId!: string;
}

/**
 * DTO for internal get next work API (service-to-service)
 * Used by other services to fetch next work for user/agent
 */
export class InternalGetNextWorkDto {
  @ApiProperty({
    description: 'Assignee type',
    enum: ['user', 'agent'],
    example: 'agent',
  })
  @IsEnum(['user', 'agent'])
  assigneeType!: 'user' | 'agent';

  @ApiProperty({
    description: 'Assignee ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  assigneeId!: string;

  @ApiProperty({
    description: 'Organization ID for context filtering',
    example: 'org_001',
  })
  @IsString()
  orgId!: string;
}
