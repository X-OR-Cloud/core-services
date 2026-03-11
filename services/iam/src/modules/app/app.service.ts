import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { App, AppStatus } from './app.schema';

@Injectable()
export class AppService extends BaseService<App> {
  constructor(
    @InjectModel(App.name) AppModel: Model<App>,
  ) {
    super(AppModel);
  }

  /**
   * Find an active App that allows a given email domain for SSO
   * @param appId - App ID from OAuth state
   * @param email - Google email to check domain against
   * @returns App if found and domain allowed, or error string
   */
  async validateSsoAccess(
    appId: string,
    email: string,
  ): Promise<{ app: App } | { error: string }> {
    const app = await this.model.findOne({
      _id: appId,
      isDeleted: false,
    });

    if (!app) {
      return { error: 'app_not_found' };
    }

    if (app.status !== AppStatus.Active) {
      return { error: 'app_not_found' };
    }

    if (!app.ssoEnabled) {
      return { error: 'sso_disabled' };
    }

    // Check email domain against allowedDomains
    if (app.allowedDomains.length > 0) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      const allowed = app.allowedDomains.some(
        (d) => d.toLowerCase() === emailDomain,
      );
      if (!allowed) {
        return { error: 'domain_not_allowed' };
      }
    }

    return { app };
  }
}
