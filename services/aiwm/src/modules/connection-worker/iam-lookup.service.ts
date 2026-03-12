import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface IamUserInfo {
  id: string;
  username: string;
  fullname: string;
}

@Injectable()
export class IamLookupService {
  private readonly logger = new Logger(IamLookupService.name);
  private readonly iamUrl = process.env.IAM_SERVICE_URL || 'http://localhost:3001';
  private readonly apiKey = process.env.INTERNAL_API_KEY || '';

  async findByDiscordId(discordUserId: string): Promise<IamUserInfo | null> {
    if (!this.apiKey) return null;
    try {
      const resp = await axios.get(
        `${this.iamUrl}/users/lookup/discord/${discordUserId}`,
        { headers: { 'x-api-key': this.apiKey }, timeout: 3000 },
      );
      return resp.data as IamUserInfo;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status !== 404) {
        this.logger.warn(`IAM Discord lookup failed for ${discordUserId}: ${(err as Error).message}`);
      }
      return null;
    }
  }
}
