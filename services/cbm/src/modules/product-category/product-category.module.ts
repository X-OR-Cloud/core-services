import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductCategoryController } from './product-category.controller';
import { ProductCategoryService } from './product-category.service';
import { ProductCategory, ProductCategorySchema } from './product-category.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ProductCategory.name, schema: ProductCategorySchema }]),
  ],
  controllers: [ProductCategoryController],
  providers: [ProductCategoryService],
  exports: [ProductCategoryService, MongooseModule],
})
export class ProductCategoryModule {}
