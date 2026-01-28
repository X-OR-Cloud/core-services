import { Logger } from '@nestjs/common';

const logger = new Logger('EnvValidator');

interface EnvVariable {
  key: string;
  required: boolean;
  description: string;
  sensitive?: boolean; // Don't log actual value
}

/**
 * Required environment variables for IAM service
 */
const REQUIRED_ENV_VARS: EnvVariable[] = [
  {
    key: 'MONGODB_URI',
    required: true,
    description: 'MongoDB connection URI',
    sensitive: true,
  },
  {
    key: 'JWT_SECRET',
    required: true,
    description: 'JWT signing secret',
    sensitive: true,
  },
  {
    key: 'JWT_EXPIRES_IN',
    required: false,
    description: 'JWT token expiration time (default: 1h)',
  },
  {
    key: 'PORT',
    required: false,
    description: 'Service port (default: 3000)',
  },
  {
    key: 'NODE_ENV',
    required: false,
    description: 'Environment mode (development/production)',
  },
  {
    key: 'AIWM_SERVICE_URL',
    required: false,
    description: 'AIWM service URL for node authentication',
  },
  {
    key: 'INTERNAL_API_KEY',
    required: false,
    description: 'Internal API key for service-to-service communication',
    sensitive: true,
  },
];

/**
 * Validate and log environment variables
 * @throws Error if required env vars are missing or invalid
 */
export function validateEnvironment(): void {
  logger.log('🔍 Validating environment variables...');

  const missingVars: string[] = [];
  const loadedVars: string[] = [];
  const optionalVars: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.key];
    const isLoaded = value && value.length > 0;

    if (envVar.required) {
      if (!isLoaded) {
        missingVars.push(`${envVar.key} (${envVar.description})`);
      } else {
        loadedVars.push(envVar.key);
        logEnvVar(envVar, value);
      }
    } else {
      if (isLoaded) {
        optionalVars.push(envVar.key);
        logEnvVar(envVar, value);
      } else {
        logger.warn(
          `⚠️  Optional env var not set: ${envVar.key} - ${envVar.description}`
        );
      }
    }
  }

  // Log summary
  if (missingVars.length > 0) {
    logger.error('❌ Missing required environment variables:');
    missingVars.forEach((varInfo) => logger.error(`   - ${varInfo}`));
    throw new Error(
      `Missing required environment variables: ${missingVars.map((v) => v.split(' ')[0]).join(', ')}`
    );
  }

  logger.log(`✅ All required environment variables loaded (${loadedVars.length})`);
  if (optionalVars.length > 0) {
    logger.log(`✅ Optional environment variables loaded (${optionalVars.length})`);
  }
  logger.log('');
}

/**
 * Log environment variable with masking for sensitive values
 */
function logEnvVar(envVar: EnvVariable, value: string): void {
  if (envVar.sensitive) {
    // Show only first 4 and last 4 characters for sensitive values
    const masked = maskSensitiveValue(value);
    logger.log(`   ✓ ${envVar.key}: ${masked} (${envVar.description})`);
  } else {
    logger.log(`   ✓ ${envVar.key}: ${value} (${envVar.description})`);
  }
}

/**
 * Mask sensitive values for logging
 */
function maskSensitiveValue(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  const firstPart = value.substring(0, 4);
  const lastPart = value.substring(value.length - 4);
  const maskedLength = value.length - 8;
  return `${firstPart}${'*'.repeat(Math.min(maskedLength, 20))}${lastPart}`;
}
