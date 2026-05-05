# IAM App Config Upgrade — allowOrigins + Webhook

**Date:** 2026-05-05
**Scope:** `services/iam` — App module + SSO flow

---

## Mục tiêu

Nâng cấp `App` entity với 3 trường mới:

| Trường | Mục đích |
|--------|---------|
| `allowOrigins` | Whitelist frontend origins được phép khởi tạo SSO với app này |
| `webhookUrl` | URL IAM sẽ POST đến khi có SSO user mới được tạo |
| `webhookSecret` | Secret để ký HMAC-SHA256 trên webhook payload — receiver tự verify |

---

## Phân tích hiện trạng

### `callbackUrl` flow hiện tại

```
FE → GET /auth/google?appId=<id>&callbackUrl=https://app.example.com/auth/callback
  → IAM encode {appId, callbackUrl} vào base64 state
  → Redirect Google
  → Google callback → IAM decode state
  → Redirect về callbackUrl?token=...&refreshToken=...
```

**Vấn đề:** Hiện tại không có validation nào trên `callbackUrl` — bất kỳ origin nào cũng có thể pass `callbackUrl` tùy ý, IAM sẽ redirect token về đó. Đây là open redirect vulnerability tiềm ẩn.

### `allowOrigins` giải quyết vấn đề gì

`allowOrigins` là danh sách origin hợp lệ của FE được phép dùng app này để SSO. Validation xảy ra tại `GET /auth/google` — trước khi redirect Google:

```
callbackUrl = "https://app.example.com/auth/callback"
origin(callbackUrl) = "https://app.example.com"

allowOrigins = ["https://app.example.com", "https://staging.example.com"]
→ OK

allowOrigins = ["https://other.com"]
→ REJECT — redirect về error page
```

Nếu `allowOrigins` rỗng → không restrict (backward compatible với apps hiện tại).

---

## Thay đổi cần thực hiện

### 1. Schema — `app.schema.ts`

Thêm 3 trường:

```typescript
@Prop({ type: [String], default: [] })
allowOrigins: string[];          // e.g. ["https://app.example.com"]

@Prop({ type: String, default: null })
webhookUrl: string | null;       // e.g. "https://dgt.example.com/iam/webhook"

@Prop({ type: String, default: null })
webhookSecret: string | null;    // raw secret, stored plaintext (không sensitive như password)
```

**Lý do không encrypt `webhookSecret`:** Secret này chỉ dùng để tạo HMAC — IAM cần raw value để sign. Receiver cũng giữ raw value để verify. Lưu plaintext trong DB là standard practice (tương tự GitHub webhook secret).

---

### 2. DTO — `app.dto.ts`

Thêm vào `CreateAppDTO` và `UpdateAppDTO`:

```typescript
@IsOptional()
@IsArray()
@IsUrl({}, { each: true })
allowOrigins?: string[];

@IsOptional()
@IsUrl()
webhookUrl?: string;

@IsOptional()
@IsString()
webhookSecret?: string;
```

---

### 3. SSO Origin Validation — `app.service.ts`

Mở rộng `validateSsoAccess()` nhận thêm `callbackOrigin`:

```typescript
async validateSsoAccess(
  appId: string,
  email: string,
  callbackOrigin?: string,    // origin extracted từ callbackUrl
): Promise<{ app: App } | { error: string }>
```

Logic thêm vào sau domain check:

```typescript
if (callbackOrigin && app.allowOrigins.length > 0) {
  const allowed = app.allowOrigins.some(o => o === callbackOrigin);
  if (!allowed) return { error: 'origin_not_allowed' };
}
```

---

### 4. Auth Controller — `auth.controller.ts`

Tại `GET /auth/google`, extract origin từ `callbackUrl` trước khi redirect và pass vào state:

```typescript
// Validate origin trước khi redirect sang Google
if (appId && callbackUrl) {
  const callbackOrigin = new URL(callbackUrl).origin;
  const appResult = await this.appService.validateSsoAccess(appId, '', callbackOrigin);
  // chỉ check origin, không check email (chưa có user)
  if ('error' in appResult && appResult.error === 'origin_not_allowed') {
    return res.redirect(`${callbackUrl}?error=origin_not_allowed`) as any;
  }
}
```

> **Lưu ý:** Validation email domain vẫn xảy ra tại callback (như hiện tại). Origin validation xảy ra sớm hơn — tại bước khởi tạo — để không redirect sang Google nếu origin không hợp lệ.

Thêm error code `origin_not_allowed` vào docs và Swagger.

---

### 5. Webhook Service — file mới `app-webhook.service.ts`

```typescript
@Injectable()
export class AppWebhookService {
  async fireUserCreated(app: App, payload: IamUserCreatedEvent['data']): Promise<void>
}
```

**Cơ chế:**
- POST `app.webhookUrl` với JSON body
- Header `X-IAM-Signature: sha256=<hmac>` — HMAC-SHA256 của JSON body với `app.webhookSecret`
- Header `X-IAM-Event: user.created`
- Timeout: 5 giây
- **Fire-and-forget** — không retry, không throw (dùng `.catch(logger.warn)`)
- Nếu `webhookUrl` null → skip

**Payload:**
```json
{
  "event": "user.created",
  "timestamp": "2026-05-05T10:00:00.000Z",
  "data": {
    "userId": "...",
    "username": "user@example.com",
    "orgId": "...",
    "role": "organization.viewer",
    "provider": "google",
    "fullname": "..."
  }
}
```

**HMAC verification phía receiver (DGT hoặc bất kỳ service nào):**
```typescript
const sig = crypto.createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');
const expected = `sha256=${sig}`;
if (!crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
  throw new UnauthorizedException('Invalid webhook signature');
}
```

---

### 6. Auth Service — `auth.service.ts`

Sau khi tạo user mới thành công, thay vì chỉ emit queue event, thêm webhook call:

```typescript
// Emit BullMQ event (noti service)
await this.iamEventProducer?.emitUserCreated({ ... });

// Fire webhook nếu app config có webhookUrl
if (appId && 'app' in appResult) {
  this.appWebhookService.fireUserCreated(appResult.app, { ... }); // no await
}
```

---

### 7. App Module — `app.module.ts`

Đăng ký `AppWebhookService` và inject `HttpModule` (axios).

---

## Error Codes mới

| Code | Trigger |
|------|---------|
| `origin_not_allowed` | `callbackUrl` origin không có trong `allowOrigins` |

---

## Backward Compatibility

| Trường | Default | Behavior khi không set |
|--------|---------|----------------------|
| `allowOrigins` | `[]` | Không restrict — mọi origin đều được |
| `webhookUrl` | `null` | Không gọi webhook |
| `webhookSecret` | `null` | Không ký — gửi không có signature header |

Apps hiện có không bị ảnh hưởng.

---

## Files cần thay đổi

| File | Loại thay đổi |
|------|--------------|
| `src/modules/app/app.schema.ts` | Thêm 3 trường |
| `src/modules/app/app.dto.ts` | Thêm 3 trường vào Create + Update DTO |
| `src/modules/app/app.service.ts` | Thêm `callbackOrigin` param vào `validateSsoAccess()` |
| `src/modules/app/app-webhook.service.ts` | **File mới** |
| `src/modules/app/app.module.ts` | Import `HttpModule`, register `AppWebhookService` |
| `src/modules/auth/auth.controller.ts` | Validate origin trước khi redirect Google |
| `src/modules/auth/auth.service.ts` | Gọi `fireUserCreated` sau tạo user |
| `services/iam/CLAUDE.md` | Cập nhật error codes + env vars |

---

## Verify

```bash
# Build
nx run iam:build

# Typescript check
npx tsc --noEmit -p services/iam/tsconfig.app.json

# Smoke test
curl http://localhost:3001/health
# → Swagger: http://localhost:3001/api-docs (kiểm tra App schema có 3 trường mới)
```
