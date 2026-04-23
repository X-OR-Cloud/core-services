import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NewsSource, NewsSourceDocument } from './news-sources.schema';

const NEWS_SOURCE_SEED: Partial<NewsSource>[] = [
  { name: 'VnExpress', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', domain: 'vnexpress.net', categories: ['world', 'politics', 'business', 'technology', 'life'], language: 'vi' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', domain: 'tuoitre.vn', categories: ['world', 'politics', 'business', 'life'], language: 'vi' },
  { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/home.rss', domain: 'dantri.com.vn', categories: ['world', 'politics', 'education', 'life'], language: 'vi' },
  { name: 'VietnamNet', url: 'https://vietnamnet.vn/rss/home.rss', domain: 'vietnamnet.vn', categories: ['world', 'politics', 'business'], language: 'vi' },
  { name: 'Thanh Niên', url: 'https://thanhnien.vn/rss/home.rss', domain: 'thanhnien.vn', categories: ['world', 'politics', 'entertainment'], language: 'vi' },
  { name: 'Zing News', url: 'https://zingnews.vn/rss/home.rss', domain: 'zingnews.vn', categories: ['entertainment', 'sports', 'technology'], language: 'vi' },
  { name: 'Lao Động', url: 'https://laodong.vn/rss/home.rss', domain: 'laodong.vn', categories: ['politics', 'business', 'life'], language: 'vi' },
  { name: 'VietnamPlus', url: 'https://vietnamplus.vn/rss/homepage.rss', domain: 'vietnamplus.vn', categories: ['world', 'politics'], language: 'vi' },
  { name: 'Kenh14', url: 'https://kenh14.vn/rss/home.rss', domain: 'kenh14.vn', categories: ['entertainment', 'life'], language: 'vi' },
  { name: 'CafeF', url: 'https://cafef.vn/rss/home.rss', domain: 'cafef.vn', categories: ['business'], language: 'vi' },
  { name: 'TechZ', url: 'https://techz.vn/rss/all.rss', domain: 'techz.vn', categories: ['technology'], language: 'vi' },
  { name: 'Nhân Dân', url: 'https://nhandan.vn/rss/home.rss', domain: 'nhandan.vn', categories: ['politics'], language: 'vi' },
];

@Injectable()
export class NewsSourcesService implements OnModuleInit {
  private readonly logger = new Logger(NewsSourcesService.name);

  constructor(@InjectModel(NewsSource.name) private readonly model: Model<NewsSourceDocument>) {}

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    for (const data of NEWS_SOURCE_SEED) {
      await this.model.findOneAndUpdate(
        { url: data.url },
        { $setOnInsert: { ...data, active: true, fetchIntervalMinutes: 60, lastFetchedAt: null } },
        { upsert: true, new: true },
      );
    }
    this.logger.log(`News sources seeded (${NEWS_SOURCE_SEED.length} sources)`);
  }

  async findAll(active?: boolean): Promise<NewsSourceDocument[]> {
    const filter: Record<string, any> = { isDeleted: false };
    if (active !== undefined) filter['active'] = active;
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  async findById(id: string): Promise<NewsSourceDocument> {
    const doc = await this.model.findOne({ _id: id, isDeleted: false }).exec();
    if (!doc) throw new NotFoundException(`NewsSource ${id} not found`);
    return doc;
  }

  async create(data: Partial<NewsSource>): Promise<NewsSourceDocument> {
    return this.model.create(data);
  }

  async update(id: string, data: Partial<NewsSource>): Promise<NewsSourceDocument> {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: data },
      { new: true },
    ).exec();
    if (!doc) throw new NotFoundException(`NewsSource ${id} not found`);
    return doc;
  }

  async remove(id: string): Promise<void> {
    await this.model.findOneAndUpdate({ _id: id }, { $set: { isDeleted: true } }).exec();
  }

  async markFetched(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { $set: { lastFetchedAt: new Date() } }).exec();
  }
}
