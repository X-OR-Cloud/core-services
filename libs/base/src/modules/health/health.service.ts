import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getLicenseExpiry } from '../../guards/license.guard';

@Injectable()
export class HealthService {
  getHealth() {
    const expiry = getLicenseExpiry();
    const license = expiry
      ? { expiresAt: expiry.toISOString().split('T')[0], expired: Date.now() > expiry.getTime() }
      : { permanent: true };

    return {
      status: 'ok',
      info: {
        version: this.getVersion(),
        gitCommit: process.env['GIT_COMMIT_SHA'] || 'unknown',
        uptime: process.uptime(),
        environment: process.env['NODE_ENV'] || 'development',
      },
      license,
    };
  }

  private getVersion(): string {
    try {
      const packageJsonPath = path.resolve(__dirname, '../../../../../package.json');
      if (fs.existsSync(packageJsonPath)) {
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')).version || '1.0.0';
      }
    } catch {
      // ignore
    }
    return '1.0.0';
  }
}
