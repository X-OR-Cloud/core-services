import { Model, FilterQuery, SortOrder } from 'mongoose';
import { createLogger } from '@hydrabyte/shared';

export interface FindRangeOptions {
  sort?: Record<string, SortOrder>;
  page?: number;
  limit?: number;
}

export class SharedDataService<T> {
  protected readonly logger;

  constructor(protected readonly model: Model<T>) {
    const serviceName = this.constructor.name;
    this.logger = createLogger(serviceName);
  }

  async insert(data: Partial<T>): Promise<T> {
    const created = new this.model(data);
    const saved = await created.save();
    this.logger.debug('Shared data inserted', { id: (saved as any)._id });
    return saved as T;
  }

  async insertMany(data: Partial<T>[]): Promise<T[]> {
    const result = await this.model.insertMany(data, { ordered: false });
    this.logger.debug('Shared data bulk inserted', { count: result.length });
    return result as T[];
  }

  async upsert(filter: FilterQuery<T>, data: Partial<T>): Promise<T> {
    const result = await this.model
      .findOneAndUpdate(filter, { $set: data }, { upsert: true, new: true })
      .exec();
    return result as T;
  }

  async findLatest(filter: FilterQuery<T>): Promise<T | null> {
    return this.model
      .findOne(filter)
      .sort({ timestamp: -1 })
      .exec();
  }

  async findByRange(
    filter: FilterQuery<T>,
    from: Date,
    to: Date,
    options?: FindRangeOptions,
  ): Promise<{ data: T[]; total: number }> {
    const { sort = { timestamp: -1 }, page = 1, limit = 100 } = options || {};

    const rangeFilter = {
      ...filter,
      timestamp: { $gte: from, $lte: to },
    } as FilterQuery<T>;

    const [data, total] = await Promise.all([
      this.model
        .find(rangeFilter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(rangeFilter).exec(),
    ]);

    return { data: data as T[], total };
  }

  async findAll(
    filter: FilterQuery<T>,
    options?: FindRangeOptions,
  ): Promise<{ data: T[]; total: number }> {
    const { sort = { timestamp: -1 }, page = 1, limit = 100 } = options || {};

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { data: data as T[], total };
  }
}
