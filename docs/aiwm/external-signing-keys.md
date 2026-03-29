# Tích hợp Chat SDK với External Signing Key

Hướng dẫn dành cho đối tác tích hợp **Stack AI Chat SDK** vào hệ thống **đóng** — tức là hệ thống không có khả năng gọi API ra ngoài để lấy anonymous token.

---

## Tổng quan

Với flow **External Signing Key**, đối tác tự ký token bằng private key của mình — không cần gọi API:

```
Đối tác upload public key một lần
           ↓
Hệ thống đối tác ký JWT bằng private key (offline)
           ↓
SDK khởi tạo với token vừa ký
           ↓
Server verify signature bằng public key đã lưu → cho phép kết nối
```

**Yêu cầu kỹ thuật:**
- Thuật toán: **ES256** (ECDSA P-256)
- Token format: JWT chuẩn với header `{ "alg": "ES256", "kid": "<keyId>" }`
- SDK: `@xorcloud/stack-ai-chat-sdk`

---

## Bước 1 — Tạo EC Key Pair

Đối tác tự sinh cặp private/public key. Giữ **private key** bí mật, chỉ chia sẻ **public key** với chúng ta.

**Node.js:**

```js
const { generateKeyPairSync } = require('crypto')

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

console.log(publicKey)   // upload cái này lên AIWM
console.log(privateKey)  // giữ bí mật, dùng để ký token
```

**OpenSSL (CLI):**

```bash
# Sinh private key
openssl ecparam -name prime256v1 -genkey -noout -out private.pem

# Xuất public key
openssl ec -in private.pem -pubout -out public.pem
```

**Java:**

```java
KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
kpg.initialize(new ECGenParameterSpec("secp256r1"));
KeyPair kp = kpg.generateKeyPair();

// Export public key sang PEM
String publicKeyPem = "-----BEGIN PUBLIC KEY-----\n"
    + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(kp.getPublic().getEncoded())
    + "\n-----END PUBLIC KEY-----";
```

---

## Bước 2 — Upload Public Key lên Portal

Truy cập **[https://stack-ai.x-or.cloud](https://stack-ai.x-or.cloud)** → vào **View Details** của Agent → chọn tab **Public Keys** → nhấn **Add Key**.

Điền các thông tin sau:

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `keyId` | string | ✓ | ID tự đặt, dùng trong JWT header (`kid`). Unique trong agent. |
| `publicKey` | string | ✓ | EC public key dạng PEM (SPKI format) |
| `label` | string | — | Nhãn mô tả (VD: "Production Key") |
| `expiresAt` | string (ISO 8601) | — | Thời điểm key hết hạn. Bỏ trống = không hết hạn. |

> **Lưu ý:** Sau khi upload, public key sẽ không được hiển thị lại — chỉ cần lưu lại `keyId` để sử dụng khi ký token.

---

## Bước 3 — Ký JWT Token phía Đối tác

Mỗi khi cần khởi tạo chat session, hệ thống đối tác ký một JWT mới bằng private key.

### Cấu trúc token

**Header:**
```json
{
  "alg": "ES256",
  "kid": "prod-key-001"
}
```

**Payload:**
```json
{
  "type": "anonymous",
  "agentId": "<agentId>",
  "anonymousId": "<uuid định danh user>",
  "iat": 1743160800,
  "exp": 1743247200
}
```

| Claim | Bắt buộc | Mô tả |
|-------|----------|-------|
| `type` | ✓ | Phải là `"anonymous"` |
| `agentId` | ✓ | ID của agent trên AIWM |
| `anonymousId` | ✓ | UUID định danh phiên/người dùng. Mỗi user nên dùng một UUID cố định để lịch sử chat được giữ lại. |
| `iat` | — | Thời điểm tạo token (Unix timestamp giây) |
| `exp` | ✓ | Thời điểm hết hạn (Unix timestamp giây). Khuyến nghị tối đa 24h. |

> `orgId` **không cần** đưa vào payload — server tự derive từ `agentId`.

### Code ký token

**Node.js (`jsonwebtoken`):**

```js
const jwt = require('jsonwebtoken')
const fs  = require('fs')
const { v4: uuidv4 } = require('uuid')

const privateKey = fs.readFileSync('./private.pem')

function generateChatToken(agentId, userId) {
  return jwt.sign(
    {
      type:        'anonymous',
      agentId:     agentId,
      anonymousId: userId || uuidv4(),
    },
    privateKey,
    {
      algorithm: 'ES256',
      expiresIn:  '24h',
      header:     { alg: 'ES256', kid: 'prod-key-001' },
    }
  )
}

// Sử dụng
const token = generateChatToken('683a1f77bcf86cd799439011', 'user-123')
```

**Python (`PyJWT`):**

```python
import jwt, uuid
from datetime import datetime, timedelta, timezone

with open("private.pem", "r") as f:
    private_key = f.read()

def generate_chat_token(agent_id: str, user_id: str = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "type":        "anonymous",
        "agentId":     agent_id,
        "anonymousId": user_id or str(uuid.uuid4()),
        "iat":         int(now.timestamp()),
        "exp":         int((now + timedelta(hours=24)).timestamp()),
    }
    return jwt.encode(
        payload,
        private_key,
        algorithm="ES256",
        headers={"kid": "prod-key-001"},
    )
```

**PHP (`firebase/php-jwt`):**

```php
use Firebase\JWT\JWT;

$privateKey = file_get_contents('/path/to/private.pem');

function generateChatToken(string $agentId, string $userId): string {
    $payload = [
        'type'        => 'anonymous',
        'agentId'     => $agentId,
        'anonymousId' => $userId ?: (string) \Ramsey\Uuid\Uuid::uuid4(),
        'iat'         => time(),
        'exp'         => time() + 86400,
    ];

    return JWT::encode($payload, $GLOBALS['privateKey'], 'ES256', 'prod-key-001');
}
```

---

## Bước 4 — Khởi tạo Chat SDK

Sau khi có token, truyền vào SDK để hiển thị chat widget:

```tsx
import { StackAIChat } from '@xorcloud/stack-ai-chat-sdk'

// token được tạo từ server của đối tác (Bước 3)
const token = await fetchChatTokenFromYourServer()

StackAIChat.init({
  wsUrl: 'wss://skt.x-or.cloud/ws/chat',
  token: token,

  // Tuỳ chọn UI
  title:    'Hỗ trợ khách hàng',
  subtitle: 'Thường phản hồi trong vài phút',
  position: 'bottom-right',
  theme: {
    mode:         'auto',
    primaryColor: '#0066FF',
  },

  // Callbacks
  onConnected:          () => console.log('Đã kết nối'),
  onConversationJoined: (id) => console.log('Conversation:', id),
  onError:              (msg) => console.error('Lỗi:', msg),
})
```

> **Lưu ý:** Không hardcode token trong frontend. Token phải được sinh phía server và truyền xuống client theo mỗi session.

---

## Quản lý Key

Toàn bộ việc quản lý key (xem danh sách, thu hồi, thêm key mới) được thực hiện qua Portal tại **[https://stack-ai.x-or.cloud](https://stack-ai.x-or.cloud)** → **View Details** của Agent → tab **Public Keys**.

Tại đây có thể xem trạng thái từng key (`Active` / `Revoked` / `Expired`), thời điểm tạo, nhãn, và thực hiện thu hồi key khi cần.

> Sau khi thu hồi, **toàn bộ token** đã ký bằng private key tương ứng sẽ **ngay lập tức bị từ chối** khi kết nối WebSocket.

### Key Rotation (Không downtime)

1. Sinh cặp key mới (xem Bước 1)
2. Upload public key mới qua Portal với `keyId` khác (VD: `prod-key-002`)
3. Cập nhật server đối tác để ký token mới bằng private key mới (với `kid: "prod-key-002"`)
4. Đợi tất cả token cũ hết hạn tự nhiên (hoặc thu hồi key cũ ngay nếu cần)
5. Thu hồi key cũ qua Portal

---

## Lưu ý Bảo mật

- **Bảo vệ private key** — Không commit vào source code, không log, không expose qua API. Lưu trong secret manager (AWS Secrets Manager, HashiCorp Vault, v.v.)
- **Đặt `exp` hợp lý** — Khuyến nghị tối đa 24h. Token hết hạn sẽ bị từ chối tự động, không cần revoke thủ công.
- **`anonymousId` cố định per user** — Dùng UUID ổn định cho mỗi user để lịch sử hội thoại được giữ lại giữa các session.
- **Token sinh phía server** — Không bao giờ ký token ở frontend (browser/mobile). Private key phải ở server backend của đối tác.
- **Revoke ngay khi lộ key** — Nếu private key bị lộ, vào Portal thu hồi key ngay lập tức để chặn toàn bộ token từ key đó.
- **Không cần revoke từng token** — Khác với flow server-generated token, external-signed token không có cơ chế revoke từng token riêng lẻ. Đơn vị revoke là **key**, không phải token.
