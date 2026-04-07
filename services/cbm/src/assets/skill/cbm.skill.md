---
name: cbm
description: Core Business Management — Projects, Work Items, CRM, and Finance for your organization.
triggers:
  - create project
  - create invoice
  - manage expense
  - record payment
  - add company
  - add contact
  - cbm
  - business management
---

# CBM Skill

Manage Projects, Work Items, Documents, CRM (Company/Contact/Interaction),
and Finance (Invoice/Expense/Payment/Transaction) for your organization.

## Authentication
All requests require: `Authorization: Bearer {jwt_token}`
Data is automatically scoped to your organization (orgId from token).
Do NOT pass orgId manually — it is derived from the token.
Base URL: {CBM_BASE_URL}

## How to Use This Skill

Read the relevant reference file before calling an endpoint:
- Projects → references/project.md
- Work items → references/work.md
- Documents → references/document.md
- Companies → references/company.md
- Contacts → references/contact.md
- Interactions → references/interaction.md
- Invoices → references/invoice.md
- Expenses → references/expense.md
- Payments → references/payment.md
- Transactions → references/transaction.md
- Full endpoint list → references/api-reference.md
- Error troubleshooting → references/error-guide.md

## Cross-Module Workflows

### Full Sales Cycle
1. Create Company (if new): `POST /companies`
2. Create Contact linked to Company: `POST /contacts` `{ companyId }`
3. Create Invoice: `POST /invoices` `{ contactId, companyId, items[] }`
4. Send Invoice to customer: `POST /invoices/:id/send`
5. Record payment received: `POST /payments` `{ invoiceId, amount, method }`
   → Invoice status auto-updates to partial or paid

### Expense Management
1. Create Expense: `POST /expenses` (status auto-set to pending)
2. Approve: `POST /expenses/:id/approve` → auto-creates Transaction record
3. View transaction ledger: `GET /transactions`
4. Summarize by period: `GET /transactions/summary?period=month`

### Project-Work Hierarchy
1. Create Project: `POST /projects`
2. Activate: `POST /projects/:id/activate`
3. Create Epics: `POST /works` `{ projectId, type: "epic" }`
4. Create Tasks under Epic: `POST /works` `{ projectId, parentId, type: "task" }`
5. Track progress: `GET /works?filter[projectId]={id}&filter[status]=in_progress`

## Module Relationships
```
Company ←── Contact (optional link)
Contact ←── Invoice (required)
Company ←── Invoice (optional)
Invoice ←── Payment (required)
Expense ──→ Transaction (auto-created on approve)
Payment ──→ Transaction (auto-created on create)
Project ←── Work (required)
Work    ←── Work (parentId for subtasks)
```

## Important Rules
- Transaction is read-only — never create/update/delete manually
- Invoice code is auto-generated (INV-YYYY-NNNN) — do not set manually
- All deletes are soft-delete (isDeleted flag) — data is never permanently removed
- Status transitions only via action endpoints — never PATCH status directly
