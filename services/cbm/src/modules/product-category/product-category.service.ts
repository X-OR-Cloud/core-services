import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ProductCategory } from './product-category.schema';

@Injectable()
export class ProductCategoryService extends BaseService<ProductCategory> {
  constructor(
    @InjectModel(ProductCategory.name) private categoryModel: Model<ProductCategory>
  ) {
    super(categoryModel);
  }

  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<ProductCategory>> {
    if (options.search) {
      const regex = new RegExp(options.search, 'i');
      const { search, ...rest } = options;
      options = { ...rest, $or: [{ name: regex }] } as any;
    }
    delete (options as any).search;
    return super.findAll(options, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<ProductCategory>> {
    const category = await super.findById(id, context);
    if (!category) throw new NotFoundException('Product category not found');
    return category;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<ProductCategory>> {
    const category = await super.findById(id, context);
    if (!category) throw new NotFoundException('Product category not found');
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<ProductCategory>> {
    const category = await super.findById(id, context);
    if (!category) throw new NotFoundException('Product category not found');
    return super.softDelete(id, context);
  }
}
