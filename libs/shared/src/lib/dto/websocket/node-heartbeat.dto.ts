import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType, NodeStatus } from '../../enum/websocket';
import { IGpuStatus } from '../../interfaces/websocket';

/**
 * Heartbeat data
 */
export class NodeHeartbeatDataDto {
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @IsEnum(NodeStatus)
  status!: NodeStatus;

  @IsNumber()
  @Min(0)
  uptimeSeconds!: number;

  // Quick stats
  @IsNumber()
  @Min(0)
  activeDeployments!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  cpuUsage!: number; // Percent

  @IsNumber()
  @Min(0)
  @Max(100)
  ramUsage!: number; // Percent

  // GPU summary
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  gpuStatus!: IGpuStatus[];

  @IsOptional()
  @IsString()
  daemonVersion?: string;
}

/**
 * Heartbeat message (Worker → Controller)
 */
export class NodeHeartbeatDto {
  @IsEnum(MessageType)
  type!: MessageType.TELEMETRY_HEARTBEAT;

  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  timestamp!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => NodeHeartbeatDataDto)
  data!: NodeHeartbeatDataDto;
}
