# State Machine Pattern for CBM Modules

Use this when a module has `status` with controlled transitions (not freely editable by client).

---

## Design Principles

1. **Client never sets `status` directly** — they call action endpoints
2. **Each action validates current status** — throw `BadRequestException` if invalid transition
3. **Action endpoints** use `POST /:id/<action>` naming
4. **`update()` and `softDelete()` have status guards** — only allowed in certain statuses

---

## Real Examples from CBM

### Invoice State Machine
```
draft --> sent --> partial --> paid
  |         |          |
  v         v          v
 (edit)   overdue   overdue
            |
            v
         cancelled
```

### Expense State Machine
```
pending --> approved  (creates Transaction)
   |
   v
rejected --> pending  (resubmit)
```

### Company/Contact (simple toggle)
```
active <--> inactive
```

---

## Schema — Status Field

```typescript
@Prop({
  type: String,
  enum: ['pending', 'approved', 'rejected'],
  default: 'pending',
})
status: string;

// Optional: rejection reason
@Prop({ type: String })
rejectionReason?: string;
```

---

## Service — Action Methods Pattern

```typescript
/**
 * State machine: pending → approved
 * Side effect: creates Transaction record
 */
async approve(id: ObjectId, context: RequestContext): Promise<Partial<MyEntity>> {
  const entity = await super.findById(id, context);
  if (!entity) throw new NotFoundException('Entity not found');
  if (entity.status !== 'pending') {
    throw new BadRequestException(
      `Entity must be in pending status to approve (current: ${entity.status})`
    );
  }
  // Do side effects before updating status
  await this.doSideEffect(entity, context);
  return super.update(id, { status: 'approved' }, context);
}

/**
 * State machine: pending → rejected
 */
async reject(
  id: ObjectId,
  rejectionReason: string,
  context: RequestContext
): Promise<Partial<MyEntity>> {
  const entity = await super.findById(id, context);
  if (!entity) throw new NotFoundException('Entity not found');
  if (entity.status !== 'pending') {
    throw new BadRequestException(
      `Entity must be in pending status to reject (current: ${entity.status})`
    );
  }
  return super.update(id, { status: 'rejected', rejectionReason }, context);
}

/**
 * State machine: rejected → pending (resubmit)
 */
async resubmit(id: ObjectId, context: RequestContext): Promise<Partial<MyEntity>> {
  const entity = await super.findById(id, context);
  if (!entity) throw new NotFoundException('Entity not found');
  if (entity.status !== 'rejected') {
    throw new BadRequestException(
      `Entity must be in rejected status to resubmit (current: ${entity.status})`
    );
  }
  return super.update(id, { status: 'pending', rejectionReason: null }, context);
}

/**
 * Override update — restrict to certain statuses
 */
async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<MyEntity>> {
  const entity = await super.findById(id, context);
  if (!entity) throw new NotFoundException('Entity not found');
  if (!['pending', 'rejected'].includes(entity.status)) {
    throw new BadRequestException(
      `Entity can only be updated in pending or rejected status (current: ${entity.status})`
    );
  }
  return super.update(id, data, context);
}

/**
 * Override softDelete — restrict to certain statuses
 */
async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<MyEntity>> {
  const entity = await super.findById(id, context);
  if (!entity) throw new NotFoundException('Entity not found');
  if (!['pending', 'rejected'].includes(entity.status)) {
    throw new BadRequestException(
      `Entity can only be deleted in pending or rejected status (current: ${entity.status})`
    );
  }
  return super.softDelete(id, context);
}
```

---

## Controller — Action Endpoints Pattern

```typescript
// =============== State machine actions ===============

@Post(':id/approve')
@ApiOperation({
  summary: 'Approve entity',
  description: 'Transition: pending → approved. Auto-creates Transaction.',
})
@ApiUpdateErrors()
@UseGuards(JwtAuthGuard)
async approve(@Param('id') id: string, @CurrentUser() context: RequestContext) {
  return this.myEntityService.approve(new Types.ObjectId(id) as any, context);
}

@Post(':id/reject')
@ApiOperation({
  summary: 'Reject entity (requires rejectionReason)',
  description: 'Transition: pending → rejected',
})
@ApiUpdateErrors()
@UseGuards(JwtAuthGuard)
async reject(
  @Param('id') id: string,
  @Body() dto: RejectMyEntityDto,
  @CurrentUser() context: RequestContext
) {
  return this.myEntityService.reject(
    new Types.ObjectId(id) as any,
    dto.rejectionReason,
    context
  );
}

@Post(':id/resubmit')
@ApiOperation({
  summary: 'Resubmit rejected entity',
  description: 'Transition: rejected → pending',
})
@ApiUpdateErrors()
@UseGuards(JwtAuthGuard)
async resubmit(@Param('id') id: string, @CurrentUser() context: RequestContext) {
  return this.myEntityService.resubmit(new Types.ObjectId(id) as any, context);
}
```

---

## DTO — Reject Action DTO

```typescript
export class RejectMyEntityDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}
```

---

## Transaction Integration (when approve creates a Transaction)

When an action should auto-create a Transaction record, inject `TransactionService`:

```typescript
// In module.ts — import TransactionModule
import { TransactionModule } from '../transaction/transaction.module';

// In service constructor
constructor(
  @InjectModel(MyEntity.name) private myEntityModel: Model<MyEntity>,
  private readonly transactionService: TransactionService,
) {
  super(myEntityModel);
}

// In approve() method — call after status update
await this.transactionService.createFromMyEntity(entity, context);
```

You'll also need to add a `createFromMyEntity()` method to `TransactionService` following the existing `createFromExpense()` / `createFromPayment()` patterns.
