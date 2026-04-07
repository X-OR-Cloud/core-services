## Contact

Individual person records for CRM. Can be linked to a Company (optional).
Supports multiple contact types and platform identity links (Discord, Zalo, etc.).

### Types (multi-value)
`customer` | `vendor` | `partner` | `employee` | `other`

### Platform Links
Each contact can have identities on external platforms:
```json
{ "platform": "discord", "platformUserId": "123456789", "username": "user#1234" }
```
Supported platforms: `discord` | `zalo` | `telegram` | `slack` | `other`

### Workflows

#### Create a contact
1. `POST /contacts` `{ name, types: ["customer"], email, phone, companyId }`

#### Add platform identity
1. `POST /contacts/:id/platform-links` `{ platform, platformUserId, username }`
2. Remove: `DELETE /contacts/:id/platform-links/:platform/:platformUserId`

### Business Rules
- `companyId` is optional — contact can exist without a company
- Each `platform + platformUserId` combination must be unique per contact
- Contact types are independent from Company types
- Deleting a contact does not delete linked Interactions or Invoices

### Agent Hints
- Error 409 on add platform-link: that platform+userId already exists for this contact
- To find contact by Discord ID: `GET /contacts?filter[platformLinks.platformUserId]={discordId}`
- To find all contacts of a company: `GET /contacts?filter[companyId]={id}`
