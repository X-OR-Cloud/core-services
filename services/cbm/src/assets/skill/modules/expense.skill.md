## Expense

Internal business expenses requiring approval. On approval, a Transaction record
is automatically created in the financial ledger.

### Categories
`office` | `travel` | `software` | `hardware` | `marketing` | `salary` | `utilities` | `other`

### State Machine
```
pending → approved  (auto-creates Transaction)
   ↓
rejected → pending  (resubmit after fixing)
```

### Workflows

#### Submit and approve an expense
1. `POST /expenses` `{ category, amount: {currency, value}, date, description }` → status: pending
2. Review and approve: `POST /expenses/:id/approve` → status: approved + Transaction created
3. Or reject: `POST /expenses/:id/reject` `{ rejectionReason }` → status: rejected

#### Resubmit after rejection
1. `PATCH /expenses/:id` — update description, amount, etc. (only in pending/rejected)
2. `POST /expenses/:id/resubmit` → status: pending (clears rejectionReason)

### Business Rules
- Can only update or delete in `pending` or `rejected` status
- `vendorId` (Company) is optional — use `vendorName` for one-off vendors
- Transaction is auto-created on approve — do NOT create Transaction manually
- `rejectionReason` is cleared automatically on resubmit
- `receiptUrl` is optional but recommended for audit trail

### Agent Hints
- Error 400 "cannot update approved expense": expense is approved — create a corrective entry instead
- To find all pending expenses: `GET /expenses?filter[status]=pending`
- To get expense summary by category: `GET /transactions/summary?period=month&referenceType=expense`
- After approval, retrieve the transaction: `GET /transactions?filter[referenceId]={expenseId}`
