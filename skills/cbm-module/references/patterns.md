# CBM Module Patterns

CBM-specific conventions for `services/cbm/`. Read this before creating any module.

---

## 1. Schema Pattern

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export interface MyInterface {
  field1: string;
  field2?: number;
}

@Schema({ timestamps: true })
export class MyEntity extends BaseSchema {
  // Required string
  @Prop({ required: true })
  name: string;

  // Optional enum with default
  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;

  // Array of strings
  @Prop({ type: [String], default: [] })
  tags: string[];

  // Optional nested object — always type: Object, never required inside
  @Prop({ type: Object })
  address?: {
    street?: string;
    city?: string;
    country?: string;
  };

  // Array of objects
  @Prop({ type: [Object], default: [] })
  items: MyInterface[];

  // Reference ID — store as string
  @Prop({ type: String })
  relatedEntityId?: string;

  // Monetary amount — always MoneyAmount object
  @Prop({ type: Object })
  amount?: {
    currency: string;
    value: number;
  };

  // Optional date
  @Prop({ type: Date })
  dueDate?: Date;
}

export type MyEntityDocument = MyEntity & Document;
export const MyEntitySchema = SchemaFactory.createForClass(MyEntity);

// Add indexes
MyEntitySchema.index({ 'owner.orgId': 1, createdAt: -1 });
MyEntitySchema.index({ name: 'text', notes: 'text' }); // if search needed
```

**Never redeclare:** `owner`, `isDeleted`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` — inherited from BaseSchema.

---

## 2. DTO Pattern

```typescript
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsArray, IsEnum, IsObject,
  IsNumber, IsDateString, IsBoolean, ValidateNested, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// Nested object DTO
export class AddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() street?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
}

// Create DTO
export class CreateMyEntityDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;

  // Reference ID — always @IsString(), NOT @IsMongoId()
  @ApiPropertyOptional() @IsOptional() @IsString() relatedEntityId?: string;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsObject() @ValidateNested() @Type(() => AddressDto)
  address?: AddressDto;
}

// Update DTO — always PartialType of Create
export class UpdateMyEntityDto extends PartialType(CreateMyEntityDto) {}

// Query DTO (for controller @Query())
export class MyEntityQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
```

**Key rule:** All reference ID fields use `@IsString()` — never `@IsMongoId()`.

---

## 3. Service Pattern

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { MyEntity } from './my-entity.schema';

@Injectable()
export class MyEntityService extends BaseService<MyEntity> {
  constructor(
    @InjectModel(MyEntity.name) private myEntityModel: Model<MyEntity>
  ) {
    super(myEntityModel);
  }

  /**
   * Override findAll — org-scoped + search support + optional statistics.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<MyEntity>> {
    // Apply text search
    if (options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      options = {
        ...options,
        $or: [
          { name: searchRegex },
          { notes: searchRegex },
        ],
      } as any;
    }
    delete options.search;

    const findResult = await super.findAll(options, context);

    // Optional: add statistics
    const baseMatch: any = { isDeleted: false };
    if (context.orgId) baseMatch['owner.orgId'] = context.orgId;

    const statusStats = await super.aggregate(
      [
        { $match: baseMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ],
      context
    );

    const statistics: any = { total: findResult.pagination.total, byStatus: {} };
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });
    findResult.statistics = statistics;

    return findResult;
  }

  /**
   * Always override findById to throw NotFoundException.
   */
  async findById(id: ObjectId, context: RequestContext): Promise<MyEntity> {
    const entity = await super.findById(id, context);
    if (!entity) throw new NotFoundException('MyEntity not found');
    return entity;
  }

  /**
   * Override update with status guard if needed.
   */
  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<MyEntity>> {
    const entity = await super.findById(id, context);
    if (!entity) throw new NotFoundException('MyEntity not found');
    // Add status guard here if needed
    return super.update(id, data, context);
  }

  /**
   * Override softDelete with status guard.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<MyEntity>> {
    const entity = await super.findById(id, context);
    if (!entity) throw new NotFoundException('MyEntity not found');
    // Guard: only allow delete in certain statuses
    // if (!['draft', 'cancelled'].includes(entity.status)) {
    //   throw new BadRequestException(`Cannot delete entity in status: ${entity.status}`);
    // }
    return super.softDelete(id, context);
  }
}
```

---

## 4. Controller Pattern

```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard, CurrentUser,
  ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { MyEntityService } from './my-entity.service';
import { CreateMyEntityDto, UpdateMyEntityDto } from './my-entity.dto';

@ApiTags('MyEntities')
@ApiBearerAuth()
@Controller('my-entities')
export class MyEntityController {
  constructor(private readonly myEntityService: MyEntityService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new MyEntity' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateMyEntityDto, @CurrentUser() context: RequestContext) {
    return this.myEntityService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List MyEntities with pagination and search' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    const { search, ...rest } = query;              // ALWAYS extract search separately
    const options = parseQueryString(rest);
    return this.myEntityService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get MyEntity by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.myEntityService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update MyEntity' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMyEntityDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.myEntityService.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete MyEntity' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.myEntityService.softDelete(new Types.ObjectId(id) as any, context);
  }
}
```

---

## 5. Module Pattern

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MyEntityController } from './my-entity.controller';
import { MyEntityService } from './my-entity.service';
import { MyEntity, MyEntitySchema } from './my-entity.schema';
// import { OtherModule } from '../other/other.module'; // if cross-module dependency

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MyEntity.name, schema: MyEntitySchema }]),
    // OtherModule,
  ],
  controllers: [MyEntityController],
  providers: [MyEntityService],
  exports: [MyEntityService, MongooseModule],
})
export class MyEntityModule {}
```

---

## 6. MoneyAmount Pattern

Reuse the shared `MoneyAmount` interface from `invoice.schema.ts`:
```typescript
import { MoneyAmount } from '../invoice/invoice.schema';
```

Or redeclare locally:
```typescript
export interface MoneyAmount {
  currency: string;
  value: number;
}
```

In schema:
```typescript
@Prop({ type: Object, required: true })
amount: MoneyAmount;
```

In DTO:
```typescript
// Import MoneyAmountDto from invoice.dto.ts or redeclare:
export class MoneyAmountDto {
  @ApiProperty() @IsString() currency: string;
  @ApiProperty() @IsNumber() value: number;
}

// Use in parent DTO:
@ApiProperty() @IsObject() @ValidateNested() @Type(() => MoneyAmountDto)
amount: MoneyAmountDto;
```

---

## 7. AppModule Registration

File: `services/cbm/src/app/app.module.ts`

Add import at top, then add to `imports` array in the correct order:
- If module has no dependencies → add anywhere
- If module depends on TransactionModule → TransactionModule must appear before it
- If module depends on InvoiceModule → InvoiceModule must appear before it

```typescript
import { MyEntityModule } from '../modules/my-entity/my-entity.module';

@Module({
  imports: [
    // ... existing modules
    MyEntityModule,  // add here
  ],
})
```
