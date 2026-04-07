## Interaction

Log of interactions with contacts/companies — calls, emails, meetings, demos, etc.
No state machine — interactions are immutable records after creation (except notes/outcome).

### Interaction Types
`call` | `email` | `meeting` | `demo` | `follow_up` | `other`

### Workflows

#### Log an interaction
1. `POST /interactions` `{ contactId, type, date, summary }`
2. Optional: `{ companyId, outcome, tags, notes }`
3. `contactId` and `companyId` are immutable after creation

#### Review interaction history
- By contact: `GET /interactions?filter[contactId]={id}&sort=-date`
- By company: `GET /interactions?filter[companyId]={id}&sort=-date`
- By type: `GET /interactions?filter[type]=meeting`

### Business Rules
- `contactId` is required (at minimum one party must be identified)
- `companyId` is optional — can log interaction at company level without specific contact
- `contactId` and `companyId` cannot be changed after creation — delete and re-create if wrong
- `date` field is the actual interaction date (can be past dates)

### Agent Hints
- Error 400 "contactId is immutable": cannot change contact on an existing interaction — soft-delete and create a new one
- To search by summary or outcome: `GET /interactions?search={keyword}`
- To find all interactions this month: `GET /interactions?filter[date][gte]={firstDayOfMonth}`
