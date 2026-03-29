import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * Minimal IAM org info returned by the lookup endpoint.
 */
export interface IamOrgInfo {
  _id: string;
  name: string;
  isDeleted: boolean;
}

/**
 * Validates organization existence and active status via IAM service.
 * Uses INTERNAL_API_KEY for service-to-service auth.
 */
@Injectable()
export class IamOrgService {
  private readonly logger = new Logger(IamOrgService.name);
  private readonly iamUrl = process.env.IAM_SERVICE_URL || 'http://localhost:3001';
  private readonly apiKey = process.env.INTERNAL_API_KEY || '';

  /**
   * Returns org info if org exists and is not deleted, null otherwise.
   */
  async findActiveOrg(orgId: string): Promise<IamOrgInfo | null> {
    if (!this.apiKey) {
      this.logger.warn('INTERNAL_API_KEY not configured — skipping org validation');
      return null;
    }

    try {
      const resp = await axios.get<IamOrgInfo>(
        `${this.iamUrl}/organizations/${orgId}`,
        { headers: { 'x-api-key': this.apiKey }, timeout: 5000 },
      );

      const org = resp.data;

      if (org.isDeleted) {
        return null;
      }

      return org;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        return null;
      }
      this.logger.warn(`IAM org lookup failed for orgId=${orgId}: ${(err as Error).message}`);
      return null;
    }
  }
}
