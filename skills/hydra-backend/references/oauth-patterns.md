# OAuth & Webhook Patterns

## Webhook Endpoint (No Auth)
Webhooks from external platforms (Zalo, Telegram, Stripe) must NOT require JWT:

```typescript
// Controller — no @UseGuards on this method
@Post(':id/webhook')
@HttpCode(HttpStatus.OK)  // Always return 200 to platform
async webhook(@Param('id') id: string, @Body() payload: any) {
  return this.service.processWebhook(new Types.ObjectId(id) as any, payload);
}
```

**In the service**, use `systemContext` for all DB operations:
```typescript
async processWebhook(channelId: ObjectId, payload: any) {
  const channel = await this.findById(channelId, this.systemContext);
  // ... process and respond within 2 seconds
  // Heavy processing → offload to BullMQ queue
}
```

## OAuth v4 + PKCE Flow (Zalo Example)

### Endpoints
```
GET  /channels/:id/oauth          → Redirect to provider auth page
GET  /channels/:id/oauth-callback → Exchange code for token
```

Both endpoints: **no JWT auth** (user browser redirects here).

### Flow
1. **Start**: generate `code_verifier` (random), compute `code_challenge` (SHA256)
2. **Store**: save `code_verifier` keyed by channelId (in-memory Map for MVP, Redis for production)
3. **Redirect**: user → provider authorize URL with `app_id`, `redirect_uri`, `code_challenge`
4. **Callback**: provider redirects back with `?code=xxx`
5. **Exchange**: POST to provider token endpoint with `code`, `app_id`, `code_verifier`, `grant_type=authorization_code`
6. **Save**: store `access_token`, `refresh_token`, `expires_at` in channel credentials
7. **Auto-refresh**: token-refresh processor checks expiry, refreshes before it expires

### PKCE Code Generation
```typescript
import * as crypto from 'crypto';

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
```

### Token Refresh Pattern
- Check all channels with refresh tokens
- If token expires within 1 hour → refresh
- On refresh failure → mark channel status as 'error'
- Run via scheduled BullMQ job or cron

### Credentials Storage
Store in entity (e.g., Channel):
```typescript
@Prop({ type: Object, default: {} })
credentials: {
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;  // ISO date string
};
```

**Security note**: In production, encrypt secrets at rest. For MVP, DB-level access control is sufficient.
