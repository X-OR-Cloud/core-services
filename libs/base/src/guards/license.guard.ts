import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Injected by webpack DefinePlugin at build time (LICENSE_SECRET env var during nx build).
// Falls back to empty string in dev — unsigned LICENSE_EXPIRY env var is used instead.
declare const __LICENSE_SECRET__: string;

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Decorator to exclude specific endpoints from license expiry check
export const SKIP_LICENSE_CHECK_KEY = 'license:skip';
export const SkipLicenseCheck = () => SetMetadata(SKIP_LICENSE_CHECK_KEY, true);

// Kept for backwards compatibility — no-op while per-user license check is disabled
export const REQUIRE_LICENSE_KEY = 'license:required';
export const RequireLicense = (_licenseType: unknown) => (_target: unknown, _key?: unknown, _descriptor?: unknown) => _descriptor;

// Cached expiry: undefined = not yet read, null = no expiry (permanent)
let _cachedExpiry: Date | null | undefined = undefined;

export function getLicenseExpiry(): Date | null {
  if (_cachedExpiry !== undefined) return _cachedExpiry;

  _cachedExpiry = readSignedLicense() ?? readEnvExpiry();
  return _cachedExpiry;
}

// Read .license file and verify HMAC signature.
// Returns Date on success, new Date(0) if tampered, null if file absent.
function readSignedLicense(): Date | null | undefined {
  const licensePath = path.resolve(process.cwd(), '.license');
  if (!fs.existsSync(licensePath)) return undefined;

  const lines = fs.readFileSync(licensePath, 'utf-8')
    .trim()
    .split('\n')
    .map((l) => l.trim());

  const expiryLine = lines.find((l) => l.startsWith('expiry='));
  const sigLine = lines.find((l) => l.startsWith('sig='));

  if (!expiryLine || !sigLine) {
    console.error('[LicenseGuard] Invalid .license file format');
    return new Date(0);
  }

  const expiryValue = expiryLine.slice('expiry='.length);
  const sig = sigLine.slice('sig='.length);

  const secret = typeof __LICENSE_SECRET__ !== 'undefined' ? __LICENSE_SECRET__ : '';

  if (!secret) {
    // No secret baked in — cannot verify signed file, fall back to env var
    return undefined;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`expiry=${expiryValue}`)
    .digest('hex');

  if (sig !== expected) {
    console.error('[LicenseGuard] License signature invalid — file may have been tampered');
    return new Date(0);
  }

  const d = new Date(expiryValue);
  return isNaN(d.getTime()) ? null : d;
}

// Fallback for development: plain LICENSE_EXPIRY env var, no signature required.
function readEnvExpiry(): Date | null {
  const val = process.env['LICENSE_EXPIRY'];
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LICENSE_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();

    if (MUTATION_METHODS.has(request.method)) {
      const expiry = getLicenseExpiry();
      if (expiry !== null && Date.now() > expiry.getTime()) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            error: 'License Expired',
            message: expiry.getTime() === 0
              ? 'License file is invalid or has been tampered.'
              : `License expired on ${expiry.toISOString().split('T')[0]}. Write operations are disabled.`,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    return true;
  }
}
