import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Extension } from './extensions.schema';

@Injectable()
export class ExtensionsService extends BaseService<Extension> {
  constructor(@InjectModel(Extension.name) model: Model<Extension>) {
    super(model as any);
  }

  /**
   * Find active extension that allows this caller number.
   * Supports exact match and glob patterns (e.g., "84909*").
   */
  async findByCallerNumber(callerNumber: string): Promise<Extension | null> {
    const activeExtensions = await this.model
      .find({ status: 'active', type: 'ai', isDeleted: false })
      .exec();

    for (const ext of activeExtensions) {
      if (this.matchesCaller(callerNumber, ext.allowedCallers || [])) {
        return ext;
      }
    }
    return null;
  }

  /**
   * Find extension by number (e.g., "1001")
   */
  async findByNumber(number: string): Promise<Extension | null> {
    return this.model
      .findOne({ number, isDeleted: false })
      .exec();
  }

  private matchesCaller(caller: string, patterns: string[]): boolean {
    if (patterns.length === 0) return false;
    
    // Normalize: remove leading + or 0, ensure starts with 84
    const normalized = caller.replace(/^\+/, '').replace(/^0/, '84');

    for (const pattern of patterns) {
      const normalizedPattern = pattern.replace(/^\+/, '').replace(/^0/, '84');
      
      if (normalizedPattern.includes('*')) {
        // Glob pattern: "84909*" matches "84909123456"
        const prefix = normalizedPattern.replace('*', '');
        if (normalized.startsWith(prefix)) return true;
      } else {
        // Exact match
        if (normalized === normalizedPattern) return true;
      }
    }
    return false;
  }
}
