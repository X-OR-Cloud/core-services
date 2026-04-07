## Transaction

Read-only financial ledger. Transactions are auto-created by Payment and Expense events.
Never create, update, or delete transactions manually.

### Transaction Types
- `income` — created when a Payment is recorded
- `expense` — created when an Expense is approved

### Reference Types
- `referenceType: "payment"` → linked to a Payment record
- `referenceType: "expense"` → linked to an Expense record

### Workflows

#### View transaction history
1. `GET /transactions` — full ledger with pagination
2. Filter by type: `GET /transactions?filter[type]=income`
3. Filter by period: `GET /transactions?filter[date][gte]={from}&filter[date][lte]={to}`

#### Summarize by period
1. `GET /transactions/summary?period=month` → grouped totals per month per currency
2. `GET /transactions/summary?period=week&dateFrom=2026-01-01&dateTo=2026-03-31`
3. Available periods: `day` | `week` | `month` | `quarter` | `year`

#### Trace a transaction
- From Payment: `GET /transactions?filter[referenceId]={paymentId}&filter[referenceType]=payment`
- From Expense: `GET /transactions?filter[referenceId]={expenseId}&filter[referenceType]=expense`

### Business Rules
- COMPLETELY READ-ONLY — no POST, PATCH, DELETE
- Soft-deleting a Payment voids its Transaction automatically
- Voided transactions (isDeleted=true) are excluded from summaries
- `snapshot` field contains a copy of source data at time of creation

### Agent Hints
- To get monthly P&L: `GET /transactions/summary?period=month` — compare income vs expense totals
- To reconcile: match `referenceId` on Transaction with Invoice/Expense records
- If a transaction is missing: check if source (Payment/Expense) was voided or still pending
