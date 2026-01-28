import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsNumber, IsDate, IsObject, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SystemInfo } from './node.interface';

// ============= Deprecated DTOs (Backward Compatibility) =============

/**
 * @deprecated Use SystemInfo DTOs instead
 */
export class GPUDevice {
  @ApiProperty({ description: 'GPU device identifier' })
  @IsString()
  deviceId: string;

  @ApiProperty({ description: 'GPU model name' })
  @IsString()
  model: string;

  @ApiProperty({ description: 'Total memory in GB' })
  @IsNumber()
  memoryTotal: number;

  @ApiProperty({ description: 'Free memory in GB' })
  @IsNumber()
  memoryFree: number;

  @ApiProperty({ description: 'GPU utilization percentage' })
  @IsNumber()
  utilization: number;

  @ApiProperty({ description: 'GPU temperature in Celsius' })
  @IsNumber()
  temperature: number;
}

/**
 * @deprecated Not used anymore
 */
export class NodeConfig {
  @ApiProperty({ description: 'Controller endpoint URL' })
  @IsString()
  controllerEndpoint: string;

  @ApiProperty({ description: 'Working directory path' })
  @IsString()
  workingDirectory: string;
}

// ============= SystemInfo DTOs (NEW) =============

export class SystemInfoDto {
  @ApiProperty({
    description: 'System information including hardware specs, network config, and runtime info',
    required: false,
    example: {
      os: { name: 'Ubuntu', version: '22.04 LTS', kernel: '5.15.0-91', platform: 'linux' },
      architecture: { cpu: 'x86_64', bits: 64, endianness: 'LE' },
      hardware: {
        cpu: { model: 'Intel Xeon Gold 6348', vendor: 'Intel', sockets: 2, coresPerSocket: 32, threadsPerCore: 1, totalCores: 64, frequency: 2600 },
        memory: { total: 137438953472 },
        disk: { total: 2199023255552 },
        network: {
          publicIp: '203.0.113.45',
          clusterIp: '10.8.0.5',
          ports: { ssh: 22, websocket: 8080, api: 9090 },
          interfaces: []
        }
      }
    }
  })
  @IsOptional()
  @IsObject()
  systemInfo?: SystemInfo;
}

export class CreateNodeDto {
  @ApiProperty({ description: 'Node name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Node roles', enum: ['controller', 'worker', 'proxy', 'storage'] })
  @IsArray()
  @IsEnum(['controller', 'worker', 'proxy', 'storage'], { each: true })
  role: string[];
}

export class UpdateNodeDto {
  @ApiProperty({ description: 'Node name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Node roles', enum: ['controller', 'worker', 'proxy', 'storage'], required: false })
  @IsOptional()
  @IsArray()
  @IsEnum(['controller', 'worker', 'proxy', 'storage'], { each: true })
  role?: string[];

  @ApiProperty({ description: 'Node status', enum: ['pending', 'installing', 'online', 'offline', 'maintenance'], required: false })
  @IsOptional()
  @IsEnum(['pending', 'installing', 'online', 'offline', 'maintenance'])
  status?: string;

  @ApiProperty({ description: 'WebSocket connection status', required: false })
  @IsOptional()
  @IsBoolean()
  websocketConnected?: boolean;

  @ApiProperty({ description: 'Last heartbeat timestamp', required: false })
  @IsOptional()
  @IsDate()
  lastHeartbeat?: Date;

  // ============= NEW: SystemInfo =============

  @ApiProperty({
    description: 'System information (hardware, network, runtime)',
    required: false
  })
  @IsOptional()
  @IsObject()
  systemInfo?: SystemInfo;

  // ============= Deprecated Fields (Backward Compatibility) =============

  /**
   * @deprecated Use systemInfo.hardware.cpu.totalCores instead
   */
  @ApiProperty({ description: 'CPU cores count (deprecated)', required: false })
  @IsOptional()
  @IsNumber()
  cpuCores?: number;

  /**
   * @deprecated Use systemInfo.hardware.memory.total instead
   */
  @ApiProperty({ description: 'Total RAM in GB (deprecated)', required: false })
  @IsOptional()
  @IsNumber()
  ramTotal?: number;

  /**
   * @deprecated This is dynamic data, should be in MetricData
   */
  @ApiProperty({ description: 'Free RAM in GB (deprecated)', required: false })
  @IsOptional()
  @IsNumber()
  ramFree?: number;

  /**
   * @deprecated Use systemInfo.hardware.gpu instead
   */
  @ApiProperty({ description: 'GPU devices (deprecated)', required: false, type: [GPUDevice] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  gpuDevices?: GPUDevice[];

  /**
   * @deprecated Not used anymore
   */
  @ApiProperty({ description: 'Node configuration (deprecated)', required: false })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  config?: NodeConfig;
}

export class GenerateTokenDto {
  @ApiProperty({ description: 'Token expiration time in seconds', required: false, default: 31536000, example: 31536000 })
  @IsOptional()
  @IsNumber()
  expiresIn?: number;
}

export class GenerateTokenResponseDto {
  @ApiProperty({ description: 'Generated JWT token' })
  token: string;

  @ApiProperty({ description: 'Token expiration timestamp' })
  expiresAt: Date;

  @ApiProperty({ description: 'Installation script with embedded token' })
  installScript: string;
}

// ============= Node Authentication DTOs =============

export class VerifyNodeCredentialsDto {
  @ApiProperty({
    description: 'Node API key (unique identifier)',
    example: 'a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p'
  })
  @IsString()
  apiKey: string;

  @ApiProperty({
    description: 'Node secret (private credential)',
    example: 'b8c3d4e5-f6g7-5h8i-9j0k-1l2m3n4o5p6q'
  })
  @IsString()
  secret: string;
}

export class VerifyNodeCredentialsResponseDto {
  @ApiProperty({ description: 'Success status', example: true })
  success: boolean;

  @ApiProperty({
    description: 'Verification result data',
    example: {
      valid: true,
      node: {
        _id: '65a0000000000000000000001',
        name: 'gpu-worker-01',
        role: ['worker'],
        owner: {
          orgId: 'org_001'
        }
      }
    }
  })
  data: {
    valid: boolean;
    node?: {
      _id: string;
      name: string;
      role: string[];
      owner: {
        orgId: string;
      };
    };
  };
}