import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsNumber,
  IsBoolean,
  IsArray,
  MinLength,
  MaxLength,
  Min,
  Max,
  ValidateNested,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ResourceType, OSImage, GPUMode, IPMode } from './enums';

// ============================================================================
// Config DTOs (Discriminated Union Types)
// ============================================================================

/**
 * GPU Configuration DTO
 */
export class GPUConfigDto {
  @ApiProperty({ description: 'Enable GPU allocation', example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description: 'GPU mode',
    enum: GPUMode,
    example: GPUMode.PASSTHROUGH,
  })
  @IsEnum(GPUMode)
  mode!: string;

  @ApiPropertyOptional({
    description: 'GPU device IDs for passthrough',
    type: [String],
    example: ['GPU-0'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deviceIds?: string[];

  @ApiPropertyOptional({
    description: 'MIG profile (e.g., 1g.5gb, 2g.10gb)',
    example: '1g.5gb',
  })
  @IsOptional()
  @IsString()
  migProfile?: string;
}

/**
 * Network Configuration DTO
 */
export class NetworkConfigDto {
  @ApiProperty({
    description: 'Network mode (fixed for V1)',
    example: 'bridge-vlan',
    default: 'bridge-vlan',
  })
  @IsString()
  mode!: string;

  @ApiProperty({
    description: 'IP address mode',
    enum: IPMode,
    example: IPMode.STATIC,
  })
  @IsEnum(IPMode)
  ipMode!: string;

  @ApiPropertyOptional({
    description: 'Static IP address (required if ipMode=static)',
    example: '192.168.100.10',
  })
  @ValidateIf((o) => o.ipMode === IPMode.STATIC)
  @IsString()
  @IsNotEmpty()
  ipAddress?: string;

  @ApiPropertyOptional({
    description: 'Netmask (required if ipMode=static)',
    example: '255.255.255.0',
  })
  @ValidateIf((o) => o.ipMode === IPMode.STATIC)
  @IsString()
  @IsNotEmpty()
  netmask?: string;

  @ApiPropertyOptional({
    description: 'Gateway (required if ipMode=static)',
    example: '192.168.100.1',
  })
  @ValidateIf((o) => o.ipMode === IPMode.STATIC)
  @IsString()
  @IsNotEmpty()
  gateway?: string;

  @ApiPropertyOptional({
    description: 'VLAN ID (optional)',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  vlanId?: number;
}

/**
 * Cloud-init Configuration DTO
 */
export class CloudInitDto {
  @ApiPropertyOptional({ description: 'Hostname', example: 'dev-vm-01' })
  @IsOptional()
  @IsString()
  hostname?: string;

  @ApiPropertyOptional({
    description: 'SSH public key',
    example: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...',
  })
  @IsOptional()
  @IsString()
  sshPublicKey?: string;

  @ApiPropertyOptional({
    description: 'Username',
    example: 'ubuntu',
    default: 'ubuntu',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'Initial password',
    example: 'initial-password-123',
  })
  @IsOptional()
  @IsString()
  password?: string;
}

/**
 * Port Mapping DTO (for containers)
 */
export class PortMappingDto {
  @ApiProperty({ description: 'Container port', example: 5432 })
  @IsNumber()
  containerPort!: number;

  @ApiPropertyOptional({ description: 'Host port', example: 5432 })
  @IsOptional()
  @IsNumber()
  hostPort?: number;

  @ApiPropertyOptional({
    description: 'Protocol',
    enum: ['tcp', 'udp'],
    default: 'tcp',
  })
  @IsOptional()
  @IsString()
  protocol?: string;
}

/**
 * Volume Mount DTO (for containers)
 */
export class VolumeMountDto {
  @ApiProperty({ description: 'Host path', example: '/data/postgres' })
  @IsString()
  hostPath!: string;

  @ApiProperty({
    description: 'Container path',
    example: '/var/lib/postgresql/data',
  })
  @IsString()
  containerPath!: string;

  @ApiPropertyOptional({ description: 'Read only', default: false })
  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}

/**
 * Inference Container Config DTO
 */
export class InferenceContainerConfigDto {
  @ApiProperty({
    description: 'Config type discriminator',
    example: 'inference-container',
  })
  @IsString()
  type!: 'inference-container';

  @ApiProperty({ description: 'Model ID', example: '67891234abcd5678ef901234' })
  @IsString()
  modelId!: string;

  @ApiProperty({
    description: 'Model path in storage',
    example: 's3://models/whisper-large-v3.tar.gz',
  })
  @IsString()
  modelPath!: string;

  @ApiProperty({
    description: 'Docker image for inference',
    example: 'nvcr.io/nvidia/tritonserver:24.01',
  })
  @IsString()
  dockerImage!: string;

  @ApiProperty({ description: 'Container port', example: 8000 })
  @IsNumber()
  containerPort!: number;

  @ApiProperty({ description: 'GPU device IDs', type: [String], example: ['0'] })
  @IsArray()
  @IsString({ each: true })
  gpuDeviceIds!: string[];

  @ApiPropertyOptional({ description: 'GPU memory limit (MB)', example: 16384 })
  @IsOptional()
  @IsNumber()
  gpuMemoryLimit?: number;

  @ApiPropertyOptional({ description: 'CPU cores', example: 4 })
  @IsOptional()
  @IsNumber()
  cpuCores?: number;

  @ApiPropertyOptional({ description: 'RAM limit (GB)', example: 16 })
  @IsOptional()
  @IsNumber()
  ramLimit?: number;

  @ApiPropertyOptional({
    description: 'Environment variables',
    example: { MODEL_NAME: 'whisper-large-v3' },
  })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Health check path',
    example: '/v2/health/ready',
  })
  @IsOptional()
  @IsString()
  healthCheckPath?: string;
}

/**
 * Application Container Config DTO
 */
export class ApplicationContainerConfigDto {
  @ApiProperty({
    description: 'Config type discriminator',
    example: 'application-container',
  })
  @IsString()
  type!: 'application-container';

  @ApiProperty({
    description: 'Container registry',
    enum: ['docker-hub', 'ghcr', 'private'],
    example: 'docker-hub',
  })
  @IsEnum(['docker-hub', 'ghcr', 'private'])
  registry!: string;

  @ApiProperty({ description: 'Image name', example: 'postgres' })
  @IsString()
  imageName!: string;

  @ApiPropertyOptional({ description: 'Image tag', example: '16-alpine' })
  @IsOptional()
  @IsString()
  imageTag?: string;

  @ApiPropertyOptional({ description: 'Registry authentication' })
  @IsOptional()
  @IsObject()
  registryAuth?: {
    username?: string;
    password?: string;
    token?: string;
  };

  @ApiPropertyOptional({ description: 'Port mappings', type: [PortMappingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortMappingDto)
  containerPorts?: PortMappingDto[];

  @ApiPropertyOptional({ description: 'CPU cores', example: 2 })
  @IsOptional()
  @IsNumber()
  cpuCores?: number;

  @ApiPropertyOptional({ description: 'RAM limit (GB)', example: 4 })
  @IsOptional()
  @IsNumber()
  ramLimit?: number;

  @ApiPropertyOptional({ description: 'GPU device IDs (optional)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gpuDeviceIds?: string[];

  @ApiPropertyOptional({ description: 'Volume mounts', type: [VolumeMountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VolumeMountDto)
  volumes?: VolumeMountDto[];

  @ApiPropertyOptional({
    description: 'Environment variables',
    example: { POSTGRES_USER: 'admin' },
  })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Network mode',
    enum: ['bridge', 'host', 'none'],
    default: 'bridge',
  })
  @IsOptional()
  @IsString()
  networkMode?: string;
}

/**
 * Virtual Machine Config DTO
 */
export class VirtualMachineConfigDto {
  @ApiProperty({
    description: 'Config type discriminator',
    example: 'virtual-machine',
  })
  @IsString()
  type!: 'virtual-machine';

  @ApiProperty({
    description: 'OS Image',
    enum: OSImage,
    example: OSImage.UBUNTU_22_04,
  })
  @IsEnum(OSImage)
  osImage!: string;

  @ApiProperty({ description: 'Number of vCPUs', example: 8 })
  @IsNumber()
  @Min(1)
  @Max(128)
  vcpus!: number;

  @ApiProperty({ description: 'RAM in MB', example: 32768 })
  @IsNumber()
  @Min(512)
  ramMB!: number;

  @ApiProperty({ description: 'Disk size in GB', example: 100 })
  @IsNumber()
  @Min(10)
  diskGB!: number;

  @ApiPropertyOptional({ description: 'GPU configuration', type: GPUConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GPUConfigDto)
  gpuConfig?: GPUConfigDto;

  @ApiProperty({
    description: 'Network configuration',
    type: NetworkConfigDto,
  })
  @ValidateNested()
  @Type(() => NetworkConfigDto)
  networkConfig!: NetworkConfigDto;

  @ApiPropertyOptional({ description: 'Cloud-init configuration', type: CloudInitDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CloudInitDto)
  cloudInit?: CloudInitDto;
}

// ============================================================================
// Main DTOs
// ============================================================================

/**
 * Create Resource DTO
 */
export class CreateResourceDto {
  @ApiProperty({
    description: 'Resource name',
    example: 'Dev VM Ubuntu 22.04',
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Resource description',
    example: 'Development VM with GPU passthrough',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Resource type',
    enum: ResourceType,
    example: ResourceType.VIRTUAL_MACHINE,
  })
  @IsEnum(ResourceType)
  type!: string;

  @ApiProperty({
    description: 'Node ID',
    example: '673e7a1f5c9d8e001234abcd',
  })
  @IsString()
  nodeId!: string;

  @ApiProperty({
    description: 'Resource-specific configuration (discriminated union)',
    oneOf: [
      { $ref: '#/components/schemas/InferenceContainerConfigDto' },
      { $ref: '#/components/schemas/ApplicationContainerConfigDto' },
      { $ref: '#/components/schemas/VirtualMachineConfigDto' },
    ],
  })
  @IsObject()
  @ValidateNested()
  @Type(() => Object, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: InferenceContainerConfigDto, name: 'inference-container' },
        { value: ApplicationContainerConfigDto, name: 'application-container' },
        { value: VirtualMachineConfigDto, name: 'virtual-machine' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  config!: InferenceContainerConfigDto | ApplicationContainerConfigDto | VirtualMachineConfigDto;
}

/**
 * Update Resource DTO
 */
export class UpdateResourceDto {
  @ApiPropertyOptional({ description: 'Resource name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Resource description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Resource status (for manual updates in V1)',
    enum: ['queued', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'error'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Resource configuration' })
  @IsOptional()
  @IsObject()
  config?: Partial<InferenceContainerConfigDto | ApplicationContainerConfigDto | VirtualMachineConfigDto>;

  @ApiPropertyOptional({ description: 'Deployment information' })
  @IsOptional()
  @IsObject()
  deployment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Restart count' })
  @IsOptional()
  @IsNumber()
  restartCount?: number;

  @ApiPropertyOptional({ description: 'Error message' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

/**
 * Create Snapshot DTO
 */
export class CreateSnapshotDto {
  @ApiProperty({
    description: 'Snapshot name',
    example: 'Before GPU Driver Update',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Snapshot description',
    example: 'Snapshot before updating NVIDIA drivers',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/**
 * Execute Command DTO (for containers)
 */
export class ExecCommandDto {
  @ApiProperty({
    description: 'Command to execute',
    example: 'ls -la /var/log',
  })
  @IsString()
  @MinLength(1)
  command!: string;

  @ApiPropertyOptional({
    description: 'Working directory',
    example: '/app',
  })
  @IsOptional()
  @IsString()
  workingDir?: string;
}
