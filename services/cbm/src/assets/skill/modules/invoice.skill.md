## Invoice

Manages outgoing sales invoices. Code auto-generated as INV-YYYY-NNNN.
Integrates with Payment (auto-updates status) and supports e-invoice provider linking.

### State Machine
```
draft → sent → partial → paid
           ↓         ↓
        overdue   overdue
(any except paid) → cancelled
cancelled → draft  (reopen)
```

### Monetary Fields
All amounts use `MoneyAmount` format: `{ currency: "VND", value: 1500000 }`

### Workflows

#### Create and send invoice
1. `POST /invoices` `{ contactId, items: [{name, quantity, unitPrice}] }` → status: draft, code: INV-2026-0001
2. `POST /invoices/:id/send` → status: sent
3. Customer pays → `POST /payments` → invoice status auto-updates to partial or paid

#### Handle overdue invoice
1. `POST /invoices/:id/mark-overdue` → only when status = sent or partial
2. To reopen after cancel: `POST /invoices/:id/reopen` → back to draft

#### Link e-invoice (VNPT, MISA, Viettel...)
1. `PATCH /invoices/:id/e-invoice` `{ provider, providerInvoiceId, issuedAt, verifyUrl }`

### Business Rules
- `items[]` must not be empty
- `code` is auto-generated — do not set manually
- Cannot update invoice after status = sent (only action endpoints allowed)
- Cannot delete when status = sent, partial, paid, or overdue
- Payment `currency` must match invoice items currency
- `subtotal`, `tax`, `totalAmount` are calculated fields — do not set manually if using items[]

### Agent Hints
- Error 400 "invalid status transition": check `allowedActions[]` in error response
- Error 409 on payment: invoice already fully paid
- Error 400 "items empty": add at least one item with valid unitPrice before sending
- To find unpaid invoices: `GET /invoices?filter[status][in]=sent,partial,overdue`
- To find invoices for a contact: `GET /invoices?filter[contactId]={id}`
