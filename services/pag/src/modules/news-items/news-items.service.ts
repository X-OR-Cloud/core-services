import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NewsItem, NewsItemDocument } from './news-items.schema';

@Injectable()
export class NewsItemsService {
  constructor(@InjectModel(NewsItem.name) private readonly model: Model<NewsItemDocument>) {}

  async upsert(data: {
    urlHash: string;
    url: string;
    title: string;
    summary: string | null;
    sourceId: string;
    sourceName: string;
    categories: string[];
    language: string;
    publishedAt: Date;
  }): Promise<boolean> {
    const result = await this.model.findOneAndUpdate(
      { urlHash: data.urlHash },
      { $setOnInsert: { ...data, fetchedAt: new Date() } },
      { upsert: true, new: false }, // new: false → returns null if inserted (new doc)
    ).exec();
    return result === null; // null means it was inserted (new)
  }

  async findRecent(options: {
    categories?: string[];
    language?: string;
    sourceIds?: string[];
    limitPerSource?: number;
    sinceHours?: number;
  }): Promise<NewsItemDocument[]> {
    const filter: Record<string, any> = {};
    if (options.categories?.length) filter['categories'] = { $in: options.categories };
    if (options.language) filter['language'] = options.language;
    if (options.sourceIds?.length) filter['sourceId'] = { $in: options.sourceIds };
    if (options.sinceHours) {
      filter['publishedAt'] = { $gte: new Date(Date.now() - options.sinceHours * 60 * 60 * 1000) };
    }
    return this.model.find(filter).sort({ publishedAt: -1 }).limit(options.limitPerSource ?? 50).exec();
  }

  async countBySource(sourceId: string): Promise<number> {
    return this.model.countDocuments({ sourceId }).exec();
  }
}
