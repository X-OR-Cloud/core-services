import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';
import { TICKET_STATUSES, TicketStatus } from './ticket.schema';

class TicketOutletDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

class TicketSubmitterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;
}

class TicketAssigneeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phonenumber?: string;
}

export class CreateTicketDto {
  @ApiProperty({ example: 'Dịch vụ' })
  @IsString()
  category!: string;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketOutletDto)
  outlet?: TicketOutletDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketSubmitterDto)
  submitter?: TicketSubmitterDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketAssigneeDto)
  assignee?: TicketAssigneeDto;
}

export class UpdateTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketOutletDto)
  outlet?: TicketOutletDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketSubmitterDto)
  submitter?: TicketSubmitterDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketAssigneeDto)
  assignee?: TicketAssigneeDto;

  @ApiPropertyOptional({ enum: TICKET_STATUSES })
  @IsOptional()
  @IsEnum(TICKET_STATUSES)
  status?: TicketStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

export class SubmitTicketDto extends CreateTicketDto {
  @ApiProperty({ description: 'Organization ID — baked into the webapp config' })
  @IsString()
  orgId!: string;
}

export class TicketQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
