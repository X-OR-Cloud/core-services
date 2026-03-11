import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FindManyOptions } from '@hydrabyte/base';
import { NewsArticle } from './news-article.schema';
import { SharedDataService } from '../../shared/shared-data.service';

@Injectable()
export class NewsArticleService extends SharedDataService<NewsArticle> {
  constructor(
    @InjectModel(NewsArticle.name) model: Model<NewsArticle>,
  ) {
    super(model);
  }

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

  async findByOptions(
    options: FindManyOptions,
  ): Promise<{ data: NewsArticle[]; total: number }> {
    const { filter = {}, sort = { publishedAt: -1 }, page = 1, limit = 20 } = options;
    return this.findAll(filter, { sort, page, limit });
  }
}
