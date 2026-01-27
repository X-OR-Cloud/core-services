import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
  IsNotEmpty,
  Min,
  Max,
  IsDateString,
  IsObject,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AggregationInterval } from './metrics.schema';

// ============= Nested DTOs for Node Metrics =============

export class CPUDetailsDto {
  @ApiProperty({ example: 0 })
  @IsNumber()
  socketId!: number;

  @ApiProperty({ example: 'Intel Xeon Gold 6348' })
  @IsString()
  model!: string;

  @ApiProperty({ example: 'Intel' })
  @IsString()
  vendor!: string;

  @ApiProperty({ example: 2600 })
  @IsNumber()
  frequency!: number;

  @ApiPropertyOptional({ example: 42240 })
  @IsOptional()
  @IsNumber()
  cacheSize?: number;

  @ApiProperty({ example: 32 })
  @IsNumber()
  cores!: number;

  @ApiPropertyOptional({ example: 68.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  usage?: number;
}

export class NodeCPUDto {
  @ApiProperty({ example: 45.8 })
  @IsNumber()
  @Min(0)
  @Max(100)
  usage!: number;

  @ApiProperty({ example: 16 })
  @IsNumber()
  @Min(1)
  cores!: number;

  @ApiProperty({ example: [2.5, 2.8, 3.1], type: [Number] })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsNumber({}, { each: true })
  loadAverage!: [number, number, number];

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  sockets?: number;

  @ApiPropertyOptional({ example: 32 })
  @IsOptional()
  @IsNumber()
  coresPerSocket?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  threadsPerCore?: number;

  @ApiPropertyOptional({ type: [CPUDetailsDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CPUDetailsDto)
  details?: CPUDetailsDto[];
}

export class NodeMemoryDto {
  @ApiProperty({ example: 68719476736 })
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiProperty({ example: 34359738368 })
  @IsNumber()
  @Min(0)
  used!: number;

  @ApiProperty({ example: 30359738368 })
  @IsNumber()
  @Min(0)
  free!: number;

  @ApiProperty({ example: 4000000000 })
  @IsNumber()
  @Min(0)
  cached!: number;
}

export class NodeDiskDto {
  @ApiProperty({ example: 1099511627776 })
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiProperty({ example: 549755813888 })
  @IsNumber()
  @Min(0)
  used!: number;

  @ApiProperty({ example: 549755813888 })
  @IsNumber()
  @Min(0)
  free!: number;

  @ApiProperty({ example: 10485760 })
  @IsNumber()
  @Min(0)
  readBytesPerSec!: number;

  @ApiProperty({ example: 5242880 })
  @IsNumber()
  @Min(0)
  writeBytesPerSec!: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  readOpsPerSec?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  writeOpsPerSec?: number;
}

export class NetworkInterfaceDto {
  @ApiProperty({ example: 'eth0' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'ethernet' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ example: '192.168.1.100' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ example: 'fe80::1' })
  @IsOptional()
  @IsString()
  ipv6Address?: string;

  @ApiPropertyOptional({ example: '00:1B:44:11:3A:B7' })
  @IsOptional()
  @IsString()
  macAddress?: string;

  @ApiPropertyOptional({ example: '203.0.113.45' })
  @IsOptional()
  @IsString()
  publicIp?: string;

  @ApiPropertyOptional({ example: '255.255.255.0' })
  @IsOptional()
  @IsString()
  netmask?: string;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsOptional()
  @IsString()
  gateway?: string;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @IsNumber()
  mtu?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ example: 'full' })
  @IsOptional()
  @IsString()
  duplex?: string;

  @ApiProperty({ example: 'up' })
  @IsString()
  state!: string;

  @ApiProperty({ example: 1048576 })
  @IsNumber()
  @Min(0)
  rxBytesPerSec!: number;

  @ApiProperty({ example: 524288 })
  @IsNumber()
  @Min(0)
  txBytesPerSec!: number;
}

export class NodeNetworkDto {
  @ApiProperty({ example: 1048576 })
  @IsNumber()
  @Min(0)
  rxBytesPerSec!: number;

  @ApiProperty({ example: 524288 })
  @IsNumber()
  @Min(0)
  txBytesPerSec!: number;

  @ApiPropertyOptional({ type: [NetworkInterfaceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NetworkInterfaceDto)
  interfaces?: NetworkInterfaceDto[];

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  rxPacketsPerSec?: number;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @IsNumber()
  txPacketsPerSec?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  rxDropped?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  txDropped?: number;
}

export class GPUDto {
  @ApiProperty({ example: 'GPU-0' })
  @IsString()
  deviceId!: string;

  @ApiProperty({ example: 'NVIDIA A100' })
  @IsString()
  model!: string;

  @ApiProperty({ example: 85.5 })
  @IsNumber()
  @Min(0)
  @Max(100)
  utilization!: number;

  @ApiProperty({ example: 68719476736 })
  @IsNumber()
  @Min(0)
  memoryUsed!: number;

  @ApiProperty({ example: 85899345920 })
  @IsNumber()
  @Min(0)
  memoryTotal!: number;

  @ApiProperty({ example: 72 })
  @IsNumber()
  temperature!: number;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @IsNumber()
  powerDraw?: number;

  @ApiPropertyOptional({ example: 75 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  fanSpeed?: number;
}

export class SystemInfoDto {
  @ApiProperty({
    example: {
      name: 'Ubuntu',
      version: '22.04 LTS',
      kernel: '5.15.0-91-generic',
      platform: 'linux',
    },
  })
  @IsObject()
  os!: {
    name: string;
    version: string;
    kernel: string;
    platform: string;
  };

  @ApiProperty({
    example: {
      cpu: 'x86_64',
      bits: 64,
      endianness: 'LE',
    },
  })
  @IsObject()
  architecture!: {
    cpu: string;
    bits: number;
    endianness: string;
  };

  @ApiPropertyOptional({
    example: {
      type: 'docker',
      version: '24.0.7',
      apiVersion: '1.43',
      storage: {
        driver: 'overlay2',
        filesystem: 'ext4',
      },
    },
  })
  @IsOptional()
  @IsObject()
  containerRuntime?: {
    type: string;
    version: string;
    apiVersion?: string;
    storage: {
      driver: string;
      filesystem: string;
    };
  };

  @ApiPropertyOptional({
    example: {
      type: 'kvm',
      role: 'guest',
    },
  })
  @IsOptional()
  @IsObject()
  virtualization?: {
    type: string;
    role: string;
  };
}

// ============= Push Node Metrics DTO =============

export class PushNodeMetricsDto {
  @ApiProperty({ example: '65a0000000000000000000001' })
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @ApiProperty({ example: '2026-01-14T10:00:00.000Z' })
  @IsDateString()
  timestamp!: string;

  @ApiPropertyOptional({ example: '1min', enum: AggregationInterval })
  @IsOptional()
  @IsEnum(AggregationInterval)
  interval?: string;

  @ApiProperty({ type: NodeCPUDto })
  @ValidateNested()
  @Type(() => NodeCPUDto)
  cpu!: NodeCPUDto;

  @ApiProperty({ type: NodeMemoryDto })
  @ValidateNested()
  @Type(() => NodeMemoryDto)
  memory!: NodeMemoryDto;

  @ApiProperty({ type: NodeDiskDto })
  @ValidateNested()
  @Type(() => NodeDiskDto)
  disk!: NodeDiskDto;

  @ApiProperty({ type: NodeNetworkDto })
  @ValidateNested()
  @Type(() => NodeNetworkDto)
  network!: NodeNetworkDto;

  @ApiPropertyOptional({ type: [GPUDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GPUDto)
  gpu?: GPUDto[];

  @ApiProperty({ example: 'online', enum: ['online', 'offline', 'maintenance'] })
  @IsEnum(['online', 'offline', 'maintenance'])
  status!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  websocketConnected!: boolean;

  @ApiProperty({ example: 86400 })
  @IsNumber()
  @Min(0)
  uptime!: number;

  @ApiPropertyOptional({ type: SystemInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SystemInfoDto)
  systemInfo?: SystemInfoDto;
}

// ============= Push Resource Metrics DTO =============

export class ResourceCPUDto {
  @ApiProperty({ example: 45.8 })
  @IsNumber()
  @Min(0)
  @Max(100)
  usagePercent!: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(0)
  limitCores!: number;

  @ApiPropertyOptional({ example: 100000000 })
  @IsOptional()
  @IsNumber()
  throttledTime?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  throttledPeriods?: number;
}

export class ResourceMemoryDto {
  @ApiProperty({ example: 2147483648 })
  @IsNumber()
  @Min(0)
  usageBytes!: number;

  @ApiProperty({ example: 4294967296 })
  @IsNumber()
  @Min(0)
  limitBytes!: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  usagePercent!: number;

  @ApiPropertyOptional({ example: 536870912 })
  @IsOptional()
  @IsNumber()
  cacheBytes?: number;

  @ApiPropertyOptional({ example: 1610612736 })
  @IsOptional()
  @IsNumber()
  rssBytes?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  swapBytes?: number;
}

export class ResourceNetworkDto {
  @ApiProperty({ example: 1048576 })
  @IsNumber()
  @Min(0)
  rxBytes!: number;

  @ApiProperty({ example: 524288 })
  @IsNumber()
  @Min(0)
  txBytes!: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  rxPackets?: number;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @IsNumber()
  txPackets?: number;
}

export class ResourceDiskDto {
  @ApiProperty({ example: 10485760 })
  @IsNumber()
  @Min(0)
  readBytes!: number;

  @ApiProperty({ example: 5242880 })
  @IsNumber()
  @Min(0)
  writeBytes!: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  readOps?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  writeOps?: number;
}

export class PushResourceMetricsDto {
  @ApiProperty({ example: '65a0000000000000000000002' })
  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @ApiProperty({ example: '2026-01-14T10:05:00.000Z' })
  @IsDateString()
  timestamp!: string;

  @ApiPropertyOptional({ example: '5min', enum: AggregationInterval })
  @IsOptional()
  @IsEnum(AggregationInterval)
  interval?: string;

  @ApiPropertyOptional({ example: 'abc123def456' })
  @IsOptional()
  @IsString()
  containerId?: string;

  @ApiPropertyOptional({ example: 'vm-12345' })
  @IsOptional()
  @IsString()
  vmId?: string;

  @ApiProperty({
    example: 'inference-container',
    enum: ['inference-container', 'application-container', 'virtual-machine'],
  })
  @IsEnum(['inference-container', 'application-container', 'virtual-machine'])
  resourceType!: string;

  @ApiProperty({ type: ResourceCPUDto })
  @ValidateNested()
  @Type(() => ResourceCPUDto)
  cpu!: ResourceCPUDto;

  @ApiProperty({ type: ResourceMemoryDto })
  @ValidateNested()
  @Type(() => ResourceMemoryDto)
  memory!: ResourceMemoryDto;

  @ApiPropertyOptional({ type: ResourceNetworkDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResourceNetworkDto)
  network?: ResourceNetworkDto;

  @ApiPropertyOptional({ type: ResourceDiskDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResourceDiskDto)
  disk?: ResourceDiskDto;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  restartCount!: number;

  @ApiProperty({ example: 3600 })
  @IsNumber()
  @Min(0)
  uptime!: number;

  @ApiProperty({
    example: 'running',
    enum: ['running', 'stopped', 'restarting', 'error'],
  })
  @IsEnum(['running', 'stopped', 'restarting', 'error'])
  status!: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  exitCode?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  oomKilled?: boolean;
}

// ============= Query DTOs =============

export class QueryMetricsDto {
  @ApiProperty({ example: '2026-01-14T09:00:00.000Z' })
  @IsDateString()
  startTime!: string;

  @ApiProperty({ example: '2026-01-14T10:00:00.000Z' })
  @IsDateString()
  endTime!: string;

  @ApiPropertyOptional({ example: '1min', enum: AggregationInterval })
  @IsOptional()
  @IsEnum(AggregationInterval)
  interval?: string;

  @ApiPropertyOptional({ example: 'cpu,memory,gpu' })
  @IsOptional()
  @IsString()
  fields?: string;
}

export class QueryMultipleMetricsDto extends QueryMetricsDto {
  @ApiProperty({ example: 'node', enum: ['node', 'resource', 'deployment', 'system'] })
  @IsEnum(['node', 'resource', 'deployment', 'system'])
  type!: string;

  @ApiProperty({ example: '65a0001,65a0002' })
  @IsString()
  @IsNotEmpty()
  entityIds!: string;

  @ApiPropertyOptional({ example: 'avg', enum: ['avg', 'min', 'max', 'sum'] })
  @IsOptional()
  @IsEnum(['avg', 'min', 'max', 'sum'])
  aggregation?: string;
}
