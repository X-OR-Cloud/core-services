import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Category } from './category.schema';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';
import { CategoryProducer } from '../../queues/producers/category.producer';

@Injectable()
export class CategoryService extends BaseService<Category> {

  constructor(
    @InjectModel(Category.name) categoryModel: Model<Category>,
    private readonly categoryProducer: CategoryProducer,
  ) {
    super(categoryModel as any);
  }

  async create(createData: CreateCategoryDto, context: RequestContext): Promise<Partial<Category>> {
    const saved = await super.create(createData, context);
    await this.categoryProducer.emitCategoryCreated(saved);
    return saved;
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Category>> {
    options.statisticFields = ['isActive'];
    return super.findAll(options, context);
  }

  async update(id: string, updateData: UpdateCategoryDto, context: RequestContext): Promise<Partial<Category>> {
    const updated = await super.update(id as any, updateData, context);
    if (updated) {
      await this.categoryProducer.emitCategoryUpdated(updated);
    }
    return updated;
  }

  async softDelete(id: string, context: RequestContext): Promise<Partial<Category>> {
    const result = await super.softDelete(id as any, context);
    if (result) {
      await this.categoryProducer.emitCategoryDeleted(id);
    }
    return result;
  }
}
