## Company

CRM records for companies — customers, vendors, partners, or any combination.
A company can have multiple types simultaneously (e.g. both customer and vendor).

### Types (multi-value)
`customer` | `vendor` | `partner` | `investor` | `other`
A company can have multiple types: `types: ["customer", "vendor"]`

### State Machine
```
active ↔ inactive
```
Simple toggle — no restricted transitions.

### Workflows

#### Create a company
1. `POST /companies` `{ name, types: ["customer"], taxCode, email, phone }`
2. Link contacts: `POST /contacts` `{ companyId }`

#### Deactivate a dormant company
1. `POST /companies/:id/deactivate` → status: inactive
2. Reactivate: `POST /companies/:id/activate`

### Business Rules
- `types[]` must have at least one value
- `taxCode` should be unique per org (validated at app level)
- Inactive companies cannot receive new Invoices
- Deleting a company does not delete linked Contacts or Invoices

### Agent Hints
- Error 400 "already active/inactive": company is already in that state — no action needed
- To find all vendors: `GET /companies?filter[types]=vendor`
- To search by name or tax code: `GET /companies?search={query}`
