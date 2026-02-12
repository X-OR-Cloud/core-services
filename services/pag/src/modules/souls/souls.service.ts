import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Soul } from './souls.schema';

@Injectable()
export class SoulsService extends BaseService<Soul> {

  constructor(@InjectModel(Soul.name) soulModel: Model<Soul>) {
    super(soulModel as any);
  }

  /**
   * Find soul by slug (unique identifier)
   * @param slug - Soul slug (e.g., 'transgpt')
   * @returns Soul or null
   */
  async findBySlug(slug: string): Promise<Soul | null> {
    this.logger.debug(`Finding soul by slug: ${slug}`);

    const soul = await this.model
      .findOne({
        slug,
        isDeleted: false
      })
      .select('-isDeleted -deletedAt -password')
      .exec();

    if (soul) {
      this.logger.debug(`Soul found with slug: ${slug}`);
    } else {
      this.logger.debug(`Soul not found with slug: ${slug}`);
    }

    return soul;
  }
}