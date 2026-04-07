## Payment

Records of payments received against an Invoice. Payments are immutable after creation —
to void a payment, soft-delete it (reverses invoice status automatically).
Each payment auto-creates a Transaction record.

### Payment Methods
`bank_transfer` | `cash` | `card` | `e_wallet` | `check` | `other`

### Workflows

#### Record a payment
1. `POST /payments` `{ invoiceId, amount: {currency, value}, date, method }`
2. Invoice status auto-updates: partial (if underpaid) or paid (if fully paid)
3. A Transaction is auto-created and linked via `transactionId`

#### Void (undo) a payment
1. `DELETE /payments/:id`
2. Transaction is automatically voided
3. Invoice status automatically recalculates

### Business Rules
- Payments are IMMUTABLE — no PATCH endpoint exists
- To correct a payment: delete the wrong one, create a new correct one
- Invoice must be in `sent`, `partial`, or `overdue` status to accept payment
- Payment `currency` must match invoice currency
- `reference` field is for external reference numbers (bank transfer ref, etc.)
- `transactionId` is auto-set — do not set manually

### Agent Hints
- Error 400 "invoice not payable": invoice is in draft/cancelled/paid — cannot add payment
- Error 400 "currency mismatch": use the same currency as the invoice
- Error 409 "invoice already fully paid": total payments already cover the invoice amount
- To list all payments for an invoice: `GET /payments?filter[invoiceId]={id}`
- To find the linked transaction: `GET /transactions/{transactionId}` (from payment.transactionId)
