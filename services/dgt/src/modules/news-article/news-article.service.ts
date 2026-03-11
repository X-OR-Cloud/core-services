import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NewsArticle } from './news-article.schema';

@Injectable()
export class NewsArticleService {
  constructor(
    @InjectModel(NewsArticle.name) private readonly model: Model<NewsArticle>,
  ) {}

  async upsertByUrl(
    url: string,
    data: Partial<NewsArticle>,
  ): Promise<NewsArticle> {
    return this.model.findOneAndUpdate(
      { url },
      { $set: data },
      { upsert: true, new: true },
    ) as any;
  }

  async findAll(
    filter: Record<string, any> = {},
    options: { sort?: any; limit?: number; page?: number } = {},
  ): Promise<{ data: NewsArticle[]; total: number }> {
    const { sort = { publishedAt: -1 }, limit = 20, page = 1 } = options;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { data: data as any, total };
  }
}
