import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Product } from './product.schema';
import { CreateProductDto } from './product.dto';

@Injectable()
export class ProductService extends BaseService<Product> {
  constructor(
    @InjectModel(Product.name) private productModel: Model<Product>
  ) {
    super(productModel);
  }

  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Product>> {
    if (options.search) {
      const regex = new RegExp(options.search, 'i');
      const { search, ...rest } = options;
      options = { ...rest, $or: [{ name: regex }, { code: regex }] } as any;
    }
    delete (options as any).search;
    return super.findAll(options, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Product>> {
    const product = await super.findById(id, context);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Product>> {
    const product = await super.findById(id, context);
    if (!product) throw new NotFoundException('Product not found');
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Product>> {
    const product = await super.findById(id, context);
    if (!product) throw new NotFoundException('Product not found');
    return super.softDelete(id, context);
  }

  async importProducts(
    items: CreateProductDto[],
    context: RequestContext
  ): Promise<{ created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const existing = await this.productModel.findOne({
          code: item.code,
          'owner.orgId': context.orgId,
          isDeleted: { $ne: true },
        }).lean();

        if (existing) {
          await super.update(existing._id as any, item as any, context);
          updated++;
        } else {
          await super.create({ ...item, status: item.status ?? 'active' }, context);
          created++;
        }
      } catch (err: any) {
        errors.push(`${item.code}: ${err.message}`);
      }
    }

    return { created, updated, errors };
  }
}
