import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Product } from './product.schema';
import { CreateProductDto, UpdateProductDto } from './product.dto';
import { ProductProducer } from '../../queues/producers/product.producer';

@Injectable()
export class ProductService extends BaseService<Product> {

  constructor(
    @InjectModel(Product.name) productModel: Model<Product>,
    private readonly productProducer: ProductProducer,
  ) {
    super(productModel as any);
  }

  async create(createData: CreateProductDto, context: RequestContext): Promise<Partial<Product>> {
    const saved = await super.create(createData, context);
    await this.productProducer.emitProductCreated(saved);
    return saved;
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Product>> {
    options.statisticFields = ['isActive', 'categoryId'];
    return super.findAll(options, context);
  }

  async findByCategory(categoryId: string, options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Product>> {
    return super.findAll({ ...options, filter: { ...options.filter, categoryId } }, context);
  }

  async update(id: string, updateData: UpdateProductDto, context: RequestContext): Promise<Partial<Product>> {
    const updated = await super.update(id as any, updateData as any, context);
    if (updated) {
      await this.productProducer.emitProductUpdated(updated);
    }
    return updated;
  }

  async softDelete(id: string, context: RequestContext): Promise<Partial<Product>> {
    const result = await super.softDelete(id as any, context);
    if (result) {
      await this.productProducer.emitProductDeleted(id);
    }
    return result;
  }
}
