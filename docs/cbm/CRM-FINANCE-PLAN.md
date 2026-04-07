# CRM & Finance Module — Design & Implementation Plan

> **Status:** Proposed
> **Date:** 2026-04-07
> **Scope:** `services/cbm/src/modules/` — new modules: `company`, `contact`, `interaction`, `invoice`, `expense`, `payment`, `transaction`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entity Design](#2-entity-design)
   - 2.1 [Company](#21-company)
   - 2.2 [Contact](#22-contact)
   - 2.3 [Interaction](#23-interaction)
   - 2.4 [Invoice](#24-invoice)
   - 2.5 [Expense](#25-expense)
   - 2.6 [Payment](#26-payment)
   - 2.7 [Transaction](#27-transaction)
3. [Relationships](#3-relationships)
4. [State Machines](#4-state-machines)
5. [Business Flow](#5-business-flow)
6. [API Endpoints](#6-api-endpoints)
7. [Auto-trigger Logic](#7-auto-trigger-logic)
8. [Implementation Plan](#8-implementation-plan)

---

## 1. Overview

This plan extends CBM with two new domain groups:

| Group | Modules | Purpose |
|-------|---------|---------|
| **CRM** | Company, Contact, Interaction | Manage customers, partners, vendors and interaction history |
| **Finance** | Invoice, Expense, Payment, Transaction | Track income, expenses, payment records and transaction history |

### Design Principles

- All modules extend `BaseSchema` → inherit `owner`, `createdBy`, `updatedBy`, `deletedAt`, timestamps
- All queries are org-scoped via `owner.orgId` from `RequestContext`
- Soft delete only — no hard delete
- State transitions via dedicated action endpoints (same pattern as `work`, `project`)
- `Transaction` is a **derived, read-only** entity — auto-generated from Payment and Expense events
- Monetary amounts stored as `{ currency: string, value: number }` objects throughout

---

## 2. Entity Design

### 2.1 Company

> Represents an external organization: customer, partner, or vendor.
> **Clone from:** `project` → becomes the master template for all other modules

```typescript
// Schema
export interface CompanyAddress {
  street?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
}

@Schema({ timestamps: true })
export class Company extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name: string;

  @Prop({ type: [String], enum: ['customer', 'partner', 'vendor'], default: [] })
  types: string[];                        // multi-value: ['customer', 'vendor']

  @Prop({ maxlength: 20 })
  taxCode?: string;                       // Mã số thuế

  @Prop({ maxlength: 200 })
  website?: string;

  @Prop({ maxlength: 100 })
  industry?: string;

  @Prop({ maxlength: 50 })
  phone?: string;

  @Prop({ maxlength: 200 })
  email?: string;

  @Prop({ type: Object })
  address?: CompanyAddress;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ maxlength: 2000 })
  notes?: string;

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status: string;
}
```

**Indexes:**
```typescript
CompanySchema.index({ status: 1 });
CompanySchema.index({ types: 1 });
CompanySchema.index({ tags: 1 });
CompanySchema.index({ 'owner.orgId': 1 });
CompanySchema.index({ createdAt: -1 });
CompanySchema.index({ name: 'text', taxCode: 'text', notes: 'text' }); // full-text
```

---

### 2.2 Contact

> Represents an individual person: customer, partner contact, or vendor rep.
> **Clone from:** `company` (master template)

```typescript
export interface PlatformLink {
  platform: 'discord' | 'telegram' | 'zalo' | 'slack' | 'whatsapp' | string;
  platformUserId: string;
  platformUsername?: string;
}

@Schema({ timestamps: true })
export class Contact extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name: string;

  @Prop({ maxlength: 200 })
  email?: string;

  @Prop({ maxlength: 50 })
  phone?: string;

  @Prop({ type: [String], enum: ['customer', 'partner', 'vendor'], default: [] })
  types: string[];                        // multi-value

  @Prop({ type: String })
  companyId?: string;                     // ref: Company (optional — freelancer/individual)

  @Prop({ maxlength: 100 })
  jobTitle?: string;

  @Prop({ maxlength: 200 })
  address?: string;

  @Prop({
    type: [{ _id: false, platform: String, platformUserId: String, platformUsername: String }],
    default: [],
  })
  platformLinks: PlatformLink[];          // chat platform identity links

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ maxlength: 2000 })
  notes?: string;

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status: string;
}
```

**Indexes:**
```typescript
ContactSchema.index({ companyId: 1 });
ContactSchema.index({ types: 1 });
ContactSchema.index({ tags: 1 });
ContactSchema.index({ 'platformLinks.platform': 1, 'platformLinks.platformUserId': 1 });
ContactSchema.index({ 'owner.orgId': 1 });
ContactSchema.index({ createdAt: -1 });
ContactSchema.index({ name: 'text', email: 'text', notes: 'text' }); // full-text
```

---

### 2.3 Interaction

> Records a single interaction event with a contact or company.
> **Clone from:** `company` (master template)

```typescript
@Schema({ timestamps: true })
export class Interaction extends BaseSchema {
  @Prop({ required: true })
  contactId: string;                      // ref: Contact (required)

  @Prop({ type: String })
  companyId?: string;                     // ref: Company (optional)

  @Prop({
    required: true,
    enum: ['call', 'email', 'meeting', 'note', 'other'],
  })
  type: string;

  @Prop({ required: true, type: Date })
  date: Date;                             // when the interaction happened

  @Prop({ required: true, maxlength: 5000 })
  summary: string;                        // what was discussed

  @Prop({ maxlength: 2000 })
  outcome?: string;                       // result / next action

  @Prop({ type: [String], default: [] })
  tags: string[];

  // createdBy inherited from BaseSchema
}
```

**Indexes:**
```typescript
InteractionSchema.index({ contactId: 1, date: -1 });
InteractionSchema.index({ companyId: 1, date: -1 });
InteractionSchema.index({ type: 1 });
InteractionSchema.index({ date: -1 });
InteractionSchema.index({ 'owner.orgId': 1 });
```

---

### 2.4 Invoice

> Outbound invoice for billing customers.
> **Clone from:** `company` (master template) — state machine added in Phase 3

```typescript
export interface MoneyAmount {
  currency: string;   // ISO 4217: 'VND', 'USD', 'EUR', ...
  value: number;      // Always store as smallest unit or decimal (e.g., 1500000 for 1,500,000 VND)
}

export interface InvoiceItem {
  description: string;
  qty: number;
  unitPrice: MoneyAmount;
  amount: MoneyAmount;  // = qty × unitPrice.value (same currency)
}

export interface EInvoiceLink {
  provider: string;       // e.g., 'VNPT', 'MISA', 'VIETTEL'
  eInvoiceId: string;     // ID from provider system
  fileUrl?: string;       // PDF/XML download URL
  rawData?: Record<string, any>;  // raw response from provider
  linkedAt: Date;
}

@Schema({ timestamps: true })
export class Invoice extends BaseSchema {
  @Prop({ required: true, maxlength: 50 })
  code: string;                           // auto-gen: INV-2026-0001

  @Prop({ required: true })
  contactId: string;                      // ref: Contact

  @Prop({ type: String })
  companyId?: string;                     // ref: Company (optional)

  @Prop({
    type: [{ _id: false, description: String, qty: Number,
             unitPrice: Object, amount: Object }],
    default: [],
  })
  items: InvoiceItem[];

  @Prop({ required: true, type: Object })
  subtotal: MoneyAmount;

  @Prop({ type: Object })
  tax?: MoneyAmount;

  @Prop({ required: true, type: Object })
  totalAmount: MoneyAmount;

  @Prop({
    required: true,
    enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
  })
  status: string;

  @Prop({ required: true, type: Date })
  issuedDate: Date;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ maxlength: 2000 })
  notes?: string;

  @Prop({ type: Object })
  eInvoice?: EInvoiceLink;               // link to e-invoice provider (future)
}
```

**Indexes:**
```typescript
InvoiceSchema.index({ code: 1, 'owner.orgId': 1 }, { unique: true });
InvoiceSchema.index({ contactId: 1 });
InvoiceSchema.index({ companyId: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ dueDate: 1, status: 1 }); // for overdue detection
InvoiceSchema.index({ issuedDate: -1 });
InvoiceSchema.index({ 'owner.orgId': 1 });
InvoiceSchema.index({ code: 'text', notes: 'text' }); // full-text
```

---

### 2.5 Expense

> Records an internal expense / cost incurred by the business.
> **Clone from:** `company` (master template) — approve/reject logic added in Phase 3

```typescript
@Schema({ timestamps: true })
export class Expense extends BaseSchema {
  @Prop({
    required: true,
    enum: ['salary', 'rent', 'tools', 'travel', 'marketing', 'utilities', 'other'],
  })
  category: string;

  @Prop({ required: true, type: Object })
  amount: MoneyAmount;

  @Prop({ type: String })
  vendorId?: string;                      // ref: Contact or Company (optional)

  @Prop({ maxlength: 200 })
  vendorName?: string;                    // free-text fallback if no vendorId

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true, maxlength: 1000 })
  description: string;

  @Prop({
    required: true,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status: string;

  @Prop({ maxlength: 500 })
  rejectionReason?: string;

  @Prop({ maxlength: 500 })
  receiptUrl?: string;                    // uploaded receipt file URL

  @Prop({ type: [String], default: [] })
  tags: string[];
}
```

**Indexes:**
```typescript
ExpenseSchema.index({ status: 1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ date: -1 });
ExpenseSchema.index({ vendorId: 1 });
ExpenseSchema.index({ 'owner.orgId': 1 });
ExpenseSchema.index({ createdAt: -1 });
ExpenseSchema.index({ description: 'text' }); // full-text
```

---

### 2.6 Payment

> Records a payment received against an Invoice.
> **Clone from:** `company` (master template) — invoice recalc + Transaction trigger added in Phase 3

```typescript
@Schema({ timestamps: true })
export class Payment extends BaseSchema {
  @Prop({ required: true })
  invoiceId: string;                      // ref: Invoice

  @Prop({ required: true, type: Object })
  amount: MoneyAmount;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({
    required: true,
    enum: ['cash', 'bank_transfer', 'card', 'e_wallet', 'other'],
  })
  method: string;

  @Prop({ maxlength: 500 })
  note?: string;

  @Prop({ maxlength: 100 })
  reference?: string;                     // bank ref / receipt number

  // transactionId: auto-set after Transaction is created
  @Prop({ type: String })
  transactionId?: string;
}
```

**Indexes:**
```typescript
PaymentSchema.index({ invoiceId: 1 });
PaymentSchema.index({ date: -1 });
PaymentSchema.index({ 'owner.orgId': 1 });
```

---

### 2.7 Transaction

> **Read-only, auto-generated** ledger record.
> **Clone from:** `company` (master template) — strip write endpoints, add internal creation methods in Phase 3
> Never created or modified directly by API clients.

```typescript
export interface TransactionSnapshot {
  description: string;            // human-readable summary
  contactName?: string;
  companyName?: string;
  invoiceCode?: string;
  expenseCategory?: string;
}

@Schema({ timestamps: true })
export class Transaction extends BaseSchema {
  @Prop({ required: true, enum: ['income', 'expense'] })
  type: string;

  @Prop({ required: true, type: Object })
  amount: MoneyAmount;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true, enum: ['payment', 'expense'] })
  referenceType: string;

  @Prop({ required: true })
  referenceId: string;                    // ObjectId of Payment or Expense

  @Prop({ type: Object })
  snapshot: TransactionSnapshot;          // denormalized info at time of creation
}
```

**Indexes:**
```typescript
TransactionSchema.index({ referenceType: 1, referenceId: 1 }, { unique: true });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ date: -1 });
TransactionSchema.index({ 'owner.orgId': 1 });
```

---

## 3. Relationships

```
Company  1──*  Contact
Contact  1──*  Interaction
Company  1──*  Interaction  (optional)

Contact  1──*  Invoice
Company  1──*  Invoice  (optional)
Invoice  1──*  Payment

Contact/Company  *──*  Expense  (via vendorId)

Payment  1──1  Transaction  (income)
Expense  1──1  Transaction  (expense, on approve)
```

**Cross-reference summary:**

| Entity | References |
|--------|-----------|
| Contact | Company (optional) |
| Interaction | Contact, Company (optional) |
| Invoice | Contact, Company (optional) |
| Payment | Invoice |
| Expense | Contact or Company via vendorId (optional) |
| Transaction | Payment or Expense via referenceId |

---

## 4. State Machines

### Invoice Status

```
draft ──[send]──► sent ──[record partial payment]──► partial
                   │                                     │
                   └──────[record full payment]──────────┤
                                                         ▼
                                                        paid

sent/partial ──[mark overdue]──► overdue  (auto or manual)
draft/sent/partial/overdue ──[cancel]──► cancelled
```

| Action | From | To | Who |
|--------|------|----|-----|
| `send` | draft | sent | lead/admin |
| `record-payment` | sent, partial | partial → paid | lead/admin |
| `mark-overdue` | sent, partial | overdue | system/lead |
| `cancel` | draft, sent, partial, overdue | cancelled | lead/admin |
| `reopen` | cancelled | draft | admin |

### Expense Status

```
pending ──[approve]──► approved
pending ──[reject]──►  rejected  (requires rejectionReason)
rejected ──[resubmit]──► pending
```

| Action | From | To | Who |
|--------|------|----|-----|
| `approve` | pending | approved | lead/admin |
| `reject` | pending | rejected | lead/admin |
| `resubmit` | rejected | pending | creator |

---

## 5. Business Flow

### CRM Flow

```
[Create Company]
      │
      ▼
[Create Contact] ── link to Company (optional)
      │
      ├── Add platformLinks (Discord, Zalo, Telegram...)
      │
      ▼
[Log Interaction] ── call / email / meeting / note
      │                 (append-only timeline per Contact)
      ▼
[Convert to Finance when deal is made]
```

### Finance Flow

```
         [Contact / Company]
                │
     ┌──────────┴──────────┐
     ▼                     ▼
[Create Invoice]       [Create Expense]
  status: draft          status: pending
     │                       │
  [send]                  [approve]
     │                       │
  status: sent            status: approved
     │                       │
  [record Payment]        [AUTO] Transaction created
     │                    type: expense
     │  status: partial/paid
     │
  [AUTO] Transaction created
  type: income
     │
     └─────────┐
               ▼
         [Transaction Log]
         (income / expense)
               │
               ▼
         [Reporting / Dashboard]  ← future
```

### Full Integration Flow

```
Company ──► Contact ──► Interaction (CRM history)
                │
                ▼
            Invoice ──► Payment ──► Transaction (income)
                                          │
Expense ──────────────────────────────────┘
(on approved)                      Transaction (expense)
                                          │
                                          ▼
                                   Financial Timeline
```

---

## 6. API Endpoints

### CRM — Company (`/companies`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/companies` | List (search, filter, paginate) |
| POST | `/companies` | Create |
| GET | `/companies/:id` | Get by ID |
| PATCH | `/companies/:id` | Update |
| DELETE | `/companies/:id` | Soft delete |
| POST | `/companies/:id/deactivate` | Set status → inactive |
| POST | `/companies/:id/activate` | Set status → active |

### CRM — Contact (`/contacts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contacts` | List (search, filter by company/type/tag) |
| POST | `/contacts` | Create |
| GET | `/contacts/:id` | Get by ID |
| PATCH | `/contacts/:id` | Update |
| DELETE | `/contacts/:id` | Soft delete |
| POST | `/contacts/:id/platform-links` | Add platform link |
| DELETE | `/contacts/:id/platform-links/:platform` | Remove platform link |

### CRM — Interaction (`/interactions`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/interactions` | List (filter by contactId / companyId / type / date) |
| POST | `/interactions` | Create |
| GET | `/interactions/:id` | Get by ID |
| PATCH | `/interactions/:id` | Update |
| DELETE | `/interactions/:id` | Soft delete |

### Finance — Invoice (`/invoices`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/invoices` | List (search, filter by status/contact/date) |
| POST | `/invoices` | Create (status forced: `draft`) |
| GET | `/invoices/:id` | Get by ID (include payments summary) |
| PATCH | `/invoices/:id` | Update (only in `draft`) |
| DELETE | `/invoices/:id` | Soft delete (only `draft` or `cancelled`) |
| POST | `/invoices/:id/send` | Transition: draft → sent |
| POST | `/invoices/:id/mark-overdue` | Transition: sent/partial → overdue |
| POST | `/invoices/:id/cancel` | Transition: → cancelled |
| POST | `/invoices/:id/reopen` | Transition: cancelled → draft |
| PATCH | `/invoices/:id/e-invoice` | Link e-invoice data |

### Finance — Payment (`/payments`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payments` | List (filter by invoiceId / date / method) |
| POST | `/payments` | Record a payment (auto-updates invoice status, creates Transaction) |
| GET | `/payments/:id` | Get by ID |
| DELETE | `/payments/:id` | Void/soft-delete (reverses invoice status recalculation) |

### Finance — Expense (`/expenses`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/expenses` | List (filter by category / status / date / vendor) |
| POST | `/expenses` | Create (status forced: `pending`) |
| GET | `/expenses/:id` | Get by ID |
| PATCH | `/expenses/:id` | Update (only `pending` or `rejected`) |
| DELETE | `/expenses/:id` | Soft delete (only `pending` or `rejected`) |
| POST | `/expenses/:id/approve` | Transition: pending → approved (creates Transaction) |
| POST | `/expenses/:id/reject` | Transition: pending → rejected (requires reason) |
| POST | `/expenses/:id/resubmit` | Transition: rejected → pending |

### Finance — Transaction (`/transactions`) — READ ONLY

| Method | Path | Description |
|--------|------|-------------|
| GET | `/transactions` | List (filter by type / date range / referenceType) |
| GET | `/transactions/:id` | Get by ID |
| GET | `/transactions/summary` | Aggregated totals (income vs expense by period/currency) |

---

## 7. Auto-trigger Logic

### On `Payment` created

```typescript
// 1. Create Transaction
await transactionService.createFromPayment(payment, invoice, context);

// 2. Recalculate Invoice status
const totalPaid = await paymentService.sumByInvoice(invoice._id);
if (totalPaid >= invoice.totalAmount.value) {
  invoice.status = 'paid';
} else if (totalPaid > 0) {
  invoice.status = 'partial';
}
await invoice.save();
```

### On `Payment` deleted (voided)

```typescript
// 1. Soft-delete linked Transaction
await transactionService.softDeleteByReference('payment', payment._id);

// 2. Recalculate Invoice status (reverse)
const totalPaid = await paymentService.sumByInvoice(invoice._id);
if (totalPaid === 0) {
  invoice.status = 'sent';   // or 'draft' if never sent
} else {
  invoice.status = 'partial';
}
await invoice.save();
```

### On `Expense` approved

```typescript
// 1. Create Transaction
await transactionService.createFromExpense(expense, context);
```

### On `Invoice.dueDate` passed (background check — future)

```typescript
// Cron / polling: find invoices where dueDate < now AND status IN ['sent', 'partial']
// → auto-set status = 'overdue'
```

---

## 8. Implementation Plan

### Strategy

> **Step 1 — Build `company` as master template** (clone from `project`)
> Step 2 — Clone `company` → all remaining 6 modules
> Step 3 — Complete CRUD for ALL modules first (build ✓ lint ✓ type-check ✓)
> Step 4 — Add module-specific logic one by one (state machines, auto-triggers, etc.)
>
> Rationale: CRUD consistency across all modules before adding complexity.
> Each module cloned from the same source → identical file structure, naming, patterns.

---

### Phase 1 — Build `company` as Master Template

> **Clone from:** `project` module (org-scoped, tags, status, similar CRUD)

```
services/cbm/src/modules/company/
  ├── company.schema.ts
  ├── company.dto.ts
  ├── company.service.ts
  ├── company.controller.ts
  └── company.module.ts
```

**Tasks:**
- [ ] Clone `project/` → `company/`
- [ ] Rename all symbols: `Project` → `Company`, `project` → `company`
- [ ] Schema: remove `members`, `lead`, `startDate`, `endDate`, `description`; add `types[]`, `taxCode`, `website`, `industry`, `address`, `phone`, `email`, `notes`
- [ ] DTO: `CreateCompanyDto`, `UpdateCompanyDto`, `CompanyQueryDto`
- [ ] Service: extend `BaseService<Company>`, keep `findAll` with search + stats
- [ ] Controller: standard CRUD (`GET /companies`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`)
- [ ] Register in `AppModule`
- [ ] Verify: `build ✓` `lint ✓` `tsc ✓` — endpoint appears in Swagger

> ✅ `company` is now the **template** for all other modules.

---

### Phase 2 — Clone `company` → All Remaining Modules (CRUD only)

Clone `company/` as the base for every module below. For each:
1. Copy the entire `company/` directory
2. Rename all files, class names, variables, collection names
3. Adjust schema fields per entity design (Section 2)
4. Keep service/controller structure identical — CRUD only, no special logic yet
5. Register in `AppModule`

---

#### Step 2.1 — `contact` module
> Clone from `company/`

Schema changes from Company:
- Remove: `taxCode`, `website`, `industry`, `address` (object), `phone`, `email` (top-level → keep as Contact fields)
- Add: `companyId?` (string), `jobTitle?`, `platformLinks[]` (embedded array)
- Keep: `types[]`, `tags`, `notes`, `status`

DTO changes:
- Add `PlatformLinkDto` (platform, platformUserId, platformUsername?)
- `CreateContactDto`: include `platformLinks?`

---

#### Step 2.2 — `interaction` module
> Clone from `company/`

Schema changes:
- Remove: `types[]`, `taxCode`, `website`, `industry`, `address`, `tags`, `status`
- Add: `contactId` (required), `companyId?`, `type` (enum), `date`, `summary`, `outcome?`
- Keep: `notes`

No status field → no activate/deactivate endpoints.

---

#### Step 2.3 — `invoice` module
> Clone from `company/`

Schema changes:
- Remove: `types[]`, `taxCode`, `website`, `industry`, `address`
- Add: `code`, `contactId`, `companyId?`, `items[]`, `subtotal`, `tax?`, `totalAmount` (MoneyAmount), `status` (invoice states), `issuedDate`, `dueDate?`, `eInvoice?`
- Add shared interface file: `money-amount.interface.ts` → `MoneyAmount { currency, value }`

DTO changes:
- Add `MoneyAmountDto`, `InvoiceItemDto`
- CRUD only for now — action endpoints (send/cancel/etc.) added in Phase 3

---

#### Step 2.4 — `expense` module
> Clone from `company/`

Schema changes:
- Remove: `types[]`, `taxCode`, `website`, `industry`, `address`
- Add: `category` (enum), `amount` (MoneyAmount), `vendorId?`, `vendorName?`, `date`, `description`, `status` (expense states), `rejectionReason?`, `receiptUrl?`
- Keep: `tags`

DTO changes:
- Add `MoneyAmountDto` (reuse from invoice)
- CRUD only — approve/reject/resubmit added in Phase 3

---

#### Step 2.5 — `payment` module
> Clone from `company/`

Schema changes:
- Remove: `types[]`, `taxCode`, `website`, `industry`, `address`, `tags`, `notes`, `status`
- Add: `invoiceId` (required), `amount` (MoneyAmount), `date`, `method` (enum), `note?`, `reference?`, `transactionId?`

No status field → no activate/deactivate endpoints.
No UPDATE endpoint (payments are immutable — only create or void/delete).

---

#### Step 2.6 — `transaction` module
> Clone from `company/`

Schema changes:
- Remove: `types[]`, `taxCode`, `website`, `industry`, `address`, `tags`, `notes`, `status`
- Add: `type` (income|expense), `amount` (MoneyAmount), `date`, `referenceType` (payment|expense), `referenceId`, `snapshot` (object)

Controller: **READ ONLY** — remove `POST`, `PATCH`, `DELETE` endpoints.
Service: keep `findAll` + `findById`; add internal `createFromPayment()`, `createFromExpense()`, `softDeleteByReference()` methods (not exposed via HTTP).

---

#### After all 6 modules cloned:

```bash
# Verify entire service compiles cleanly
npx tsc --noEmit -p services/cbm/tsconfig.app.json
nx lint cbm
nx run cbm:build

# Check all new endpoints appear
open http://localhost:3004/api-docs
```

> ✅ At this point: 7 modules (company + 6 clones), all CRUD endpoints working, zero module-specific logic.

---

### Phase 3 — Module-specific Logic

Add special logic per module, one at a time. Verify build after each step.

#### Step 3.1 — `company`: activate / deactivate actions
- Add `POST /companies/:id/activate` → status: inactive → active
- Add `POST /companies/:id/deactivate` → status: active → inactive

#### Step 3.2 — `contact`: platform-links sub-endpoints
- Add `POST /contacts/:id/platform-links` → push to `platformLinks[]`
- Add `DELETE /contacts/:id/platform-links/:platform` → pull from array

#### Step 3.3 — `invoice`: state machine + code auto-generation
- Auto-gen `code`: `INV-{YYYY}-{seq:04d}` per org (atomic counter in MongoDB)
- Enforce: update only allowed when `status === 'draft'`
- Enforce: delete only allowed when `status === 'draft'` or `'cancelled'`
- Add action endpoints: `send`, `mark-overdue`, `cancel`, `reopen`
- Add `PATCH /invoices/:id/e-invoice` for linking e-invoice data

#### Step 3.4 — `expense`: approve / reject / resubmit
- Add action endpoints: `approve`, `reject` (requires reason), `resubmit`
- Enforce: update/delete only allowed when `status === 'pending'` or `'rejected'`
- On approve: call `transactionService.createFromExpense()`

#### Step 3.5 — `payment`: invoice recalculation + transaction creation
- On create Payment:
  1. Validate `invoiceId` exists and is not `paid` or `cancelled`
  2. Call `transactionService.createFromPayment()`
  3. Recalculate Invoice total paid → update Invoice status (`partial` / `paid`)
- On delete Payment:
  1. Soft-delete linked Transaction
  2. Reverse Invoice status recalculation

#### Step 3.6 — `transaction`: internal creation methods + summary endpoint
- Implement `createFromPayment(payment, invoice, context)`
- Implement `createFromExpense(expense, context)`
- Implement `softDeleteByReference(referenceType, referenceId)`
- Add `GET /transactions/summary` → aggregate income vs expense by period + currency

---

### Module Dependency Order (Phase 3)

```
company (3.1) → independent
contact (3.2) → independent
transaction (3.6) → must be done BEFORE invoice (3.3), expense (3.4), payment (3.5)
invoice (3.3) → depends on transaction
expense (3.4) → depends on transaction
payment (3.5) → depends on transaction + invoice
```

---

### Verification Checklist (after each phase)

```bash
npx tsc --noEmit -p services/cbm/tsconfig.app.json   # type check
nx lint cbm                                           # lint
nx run cbm:build                                      # build
nx test cbm                                           # unit tests
curl http://localhost:3004/health
open http://localhost:3004/api-docs
```

---

### Estimated Effort

| Phase | Scope | Est. Tasks |
|-------|-------|-----------|
| Phase 1 | Build `company` template | ~8 tasks |
| Phase 2 | Clone → 6 modules CRUD | ~6 × 6 = ~36 tasks |
| Phase 3 | Module-specific logic | ~20 tasks |
| **Total** | | **~64 tasks** |

---

#### Step 2.4 — `transaction` module
> **New module** (read-only, no clone needed — simpler than existing modules)

```
services/cbm/src/modules/transaction/
  ├── transaction.schema.ts
  ├── transaction.dto.ts     ← TransactionQueryDto only (no Create/Update)
  ├── transaction.service.ts ← createFromPayment(), createFromExpense(), softDeleteByReference()
  ├── transaction.controller.ts ← GET list, GET by id, GET summary only
  └── transaction.module.ts
```

Tasks:
- [ ] Implement schema + service (internal creation only)
- [ ] Read-only controller (list, getById, summary aggregation)
- [ ] `summary` endpoint: group by `type` + `currency`, sum `amount.value` per time period
- [ ] Register in `AppModule`

---

### Module Dependency Order

```
Phase 1:  company → contact → interaction
Phase 2:  transaction → invoice → expense → payment
                          ↑ (invoice needs payment service via forward ref or module import)
```

> `transaction` must be initialized before `invoice`, `expense`, `payment` since they all call `TransactionService`.

---

### Verification Checklist (per module)

```bash
# After each module:
npx tsc --noEmit -p services/cbm/tsconfig.app.json   # type check
nx lint cbm                                           # lint
nx run cbm:build                                      # build
nx test cbm                                           # unit tests

# Runtime check:
curl http://localhost:3004/health
open http://localhost:3004/api-docs                   # verify new endpoints appear
```

---

### Estimated Effort

| Module | Complexity | Est. Tasks |
|--------|-----------|-----------|
| company | Low | ~8 micro-tasks |
| contact | Medium | ~10 micro-tasks |
| interaction | Low | ~6 micro-tasks |
| transaction | Medium | ~8 micro-tasks |
| invoice | High | ~15 micro-tasks |
| expense | Medium | ~10 micro-tasks |
| payment | Medium | ~10 micro-tasks |
| **Total** | | **~67 micro-tasks** |

---

*Document maintained by CBM agent `mehr` — last updated 2026-04-07*
