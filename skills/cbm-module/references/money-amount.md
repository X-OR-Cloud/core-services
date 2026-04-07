# MoneyAmount Pattern

For any field representing a monetary value in CBM.

---

## Interface (defined in invoice.schema.ts)

```typescript
export interface MoneyAmount {
  currency: string;  // e.g. "VND", "USD"
  value: number;     // numeric amount
}
```

---

## Schema Usage

```typescript
// Required monetary field
@Prop({ type: Object, required: true })
amount: MoneyAmount;

// Optional monetary field
@Prop({ type: Object })
totalAmount?: MoneyAmount;

// Multiple monetary fields
@Prop({ type: Object, required: true })
subtotal: MoneyAmount;

@Prop({ type: Object })
tax?: MoneyAmount;

@Prop({ type: Object, required: true })
totalAmount: MoneyAmount;
```

---

## DTO Usage

```typescript
// Import from invoice.dto.ts (if already in the module)
import { MoneyAmountDto } from '../invoice/invoice.dto';

// Or redeclare locally
export class MoneyAmountDto {
  @ApiProperty({ example: 'VND' })
  @IsString()
  currency: string;

  @ApiProperty({ example: 1500000 })
  @IsNumber()
  value: number;
}

// Use in Create DTO
export class CreateMyEntityDto {
  @ApiProperty({ type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount: MoneyAmountDto;
}
```

---

## Aggregation Pattern (sum payments)

```typescript
// Sum all active payments for an invoice
const payments = await this.myModel.find({
  invoiceId,
  isDeleted: { $ne: true },
  'amount.currency': currency,
}).lean();

const totalPaid = payments.reduce((sum, p) => sum + (p.amount?.value ?? 0), 0);
```

---

## recalculateStatus Pattern (Invoice)

When totals need to be recalculated after payment:

```typescript
private async recalculateInvoice(invoiceId: string, currency: string, context: RequestContext): Promise<void> {
  const payments = await this.paymentModel.find({
    invoiceId,
    isDeleted: { $ne: true },
    'amount.currency': currency,
  }).lean();

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount?.value ?? 0), 0);
  await this.invoiceService.recalculateStatus(invoiceId, totalPaid, currency);
}
```
