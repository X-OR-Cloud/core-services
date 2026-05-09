import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ProductCategory } from './product-category.schema';
import { Product } from '../product/product.schema';
import { isSuperAdmin } from '../project/project-access.helper';

@Injectable()
export class ProductCategoryService extends BaseService<ProductCategory> {
  constructor(
    @InjectModel(ProductCategory.name) private categoryModel: Model<ProductCategory>,
    @InjectModel(Product.name) private productModel: Model<Product>
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

  async create(data: any, context: RequestContext): Promise<Partial<ProductCategory>> {
    if (!isSuperAdmin(context)) {
      throw new ForbiddenException('Only organization owners can manage product categories');
    }
    return super.create(data, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<ProductCategory>> {
    const category = await super.findById(id, context);
    if (!category) throw new NotFoundException('Product category not found');
    return category;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<ProductCategory>> {
    if (!isSuperAdmin(context)) {
      throw new ForbiddenException('Only organization owners can manage product categories');
    }
    const category = await super.findById(id, context);
    if (!category) throw new NotFoundException('Product category not found');
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<ProductCategory>> {
    if (!isSuperAdmin(context)) {
      throw new ForbiddenException('Only organization owners can manage product categories');
    }
    const category = await super.findById(id, context);
    if (!category) throw new NotFoundException('Product category not found');

    // OQ-01: Block delete if category has active products
    const productCount = await this.productModel.countDocuments({
      categoryId: String(id),
      'owner.orgId': context.orgId,
      isDeleted: { $ne: true },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${productCount} product(s). Remove or reassign products first.`
      );
    }

    return super.softDelete(id, context);
  }
}
