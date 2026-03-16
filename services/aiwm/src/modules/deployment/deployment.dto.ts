import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsMongoId,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsDateString,
  IsObject,
} from 'class-validator';

/**
 * DTO for creating a new deployment
 * MongoDB _id will be used as the primary identifier
 */
export class CreateDeploymentDto {
  @ApiProperty({
    description: 'Deployment name',
    example: 'Llama 3.1 8B - Production',
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Deployment description',
    example: 'Production deployment of Llama 3.1 8B model on GPU node 1',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({
    description: 'Model ID to deploy (MongoDB ObjectId as string)',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  modelId!: string;

  @ApiPropertyOptional({
    description:
      'Node ID to deploy on (MongoDB ObjectId as string). ' +
      'Required for self-hosted deployments, should NOT be provided for API-based deployments.',
    example: '507f1f77bcf86cd799439012',
  })
  @IsOptional()
  @IsMongoId()
  nodeId?: string;

  @ApiPropertyOptional({
    description:
      'Resource ID of inference container (MongoDB ObjectId as string). ' +
      'Required for self-hosted deployments, should NOT be provided for API-based deployments.',
    example: '507f1f77bcf86cd799439013',
  })
  @IsOptional()
  @IsMongoId()
  resourceId?: string;

  @ApiPropertyOptional({
    description: 'Deployment status',
    enum: ['queued', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'error'],
    example: 'queued',
    default: 'queued',
  })
  @IsOptional()
  @IsEnum(['queued', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'error'])
  status?: string;
}

/**
 * DTO for updating an existing deployment
 * All fields are optional
 */
export class UpdateDeploymentDto {
  @ApiPropertyOptional({
    description: 'Deployment name',
    example: 'Llama 3.1 8B - Production Updated',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Deployment description',
    example: 'Updated description',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Deployment status',
    enum: ['queued', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'error'],
    example: 'running',
  })
  @IsOptional()
  @IsEnum(['queued', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'error'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Error message',
    example: 'Failed to allocate GPU memory',
  })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({
    description: 'Last health check timestamp',
    example: '2025-01-20T10:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  lastHealthCheck?: Date;

  // Note: Container info (containerId, containerName, dockerImage, containerPort, endpoint, gpuDevice)
  // are retrieved from the linked Resource via resourceId and should not be updated directly
}

/**
 * DTO for endpoint integration information (virtual field)
 * Provides integration details for calling the deployment inference endpoint
 */
export class EndpointInfoDto {
  @ApiProperty({
    description: 'Full inference endpoint URL',
    example: 'https://api.x-or.cloud/dev/aiwm-v2/deployments/507f1f77bcf86cd799439011/inference/v1/chat/completions',
  })
  url!: string;

  @ApiProperty({
    description: 'Required HTTP headers for the request',
    example: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <ACCESS_TOKEN>',
    },
  })
  headers!: Record<string, string>;

  @ApiProperty({
    description: 'Sample request body (provider-specific format)',
    example: {
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
      temperature: 0.7,
    },
  })
  body!: Record<string, any>;

  @ApiProperty({
    description: 'Integration guide in markdown format',
    example:
      '## Integration Guide\n\n' +
      'This deployment uses **OpenAI** provider with model `gpt-4-turbo`.\n\n' +
      '### Authentication\n' +
      '- Use `ACCESS_TOKEN` which can be either:\n' +
      '  - **USER_ACCESS_TOKEN**: Personal user token from IAM login\n' +
      '  - **APP_ACCESS_TOKEN**: Application service token\n\n' +
      '### Provider Documentation\n' +
      'For detailed API specifications and examples, visit the official [OpenAI API Documentation](https://platform.openai.com/docs).\n\n' +
      '### Example Request\n' +
      '```bash\n' +
      'curl -X POST \\\n' +
      '  https://api.x-or.cloud/dev/aiwm-v2/deployments/507f1f77bcf86cd799439011/inference/v1/chat/completions \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      '  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\\n' +
      '  -d \'{"messages":[{"role":"user","content":"Hello!"}]}\'\n' +
      '```',
  })
  description!: string;
}
