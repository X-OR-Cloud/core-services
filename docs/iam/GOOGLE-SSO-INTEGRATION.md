# Google SSO Integration Guide

Tài liệu dành cho Frontend team tích hợp Google OAuth 2.0 SSO với IAM Service.

## Endpoints

| Environment | Base URL |
|-------------|----------|
| Production  | `https://api.x-or.cloud/dev/iam-v2` |
| Local dev   | `http://localhost:3001` |

---

## Luồng đăng nhập Google SSO

```
FE                          IAM (BE)                    Google
│                           │                           │
│  1. User click "Login      │                           │
│     with Google"          │                           │
│  ──────────────────────►  │                           │
│  GET /auth/google         │                           │
│                           │  2. Redirect sang Google  │
│                           │  ──────────────────────►  │
│                           │                           │
│                           │  3. User đồng ý consent   │
│                           │  ◄──────────────────────  │
│                           │  callback?code=...        │
│                           │                           │
│                           │  4. IAM xử lý:            │
│                           │  - Lấy profile từ Google  │
│                           │  - Tạo/login user         │
│                           │  - Issue JWT              │
│                           │                           │
│  5. IAM redirect về FE    │                           │
│  ◄──────────────────────  │                           │
│  /auth/callback?token=... │                           │
```

---

## Bước 1 — Khởi tạo SSO

FE redirect trực tiếp trình duyệt sang IAM (không phải AJAX):

```js
// Khi user click nút "Đăng nhập với Google" (không giới hạn domain)
window.location.href = 'https://api.x-or.cloud/dev/iam-v2/auth/google';

// Khi đăng nhập qua App cụ thể (kiểm tra domain whitelist + auto-assign org)
window.location.href = 'https://api.x-or.cloud/dev/iam-v2/auth/google?appId=<appId>';
```

IAM sẽ tự redirect sang Google consent screen.

> **App-based SSO**: Khi truyền `appId`, IAM sẽ kiểm tra email domain của user có trong whitelist của App không. Nếu user mới, sẽ được tự động gán vào `defaultOrgId` và `defaultRole` cấu hình trong App.

---

## Bước 2 — Nhận kết quả callback

Sau khi Google xong, IAM redirect về FE theo một trong hai dạng:

### Thành công → `/auth/callback`

```
https://your-fe.com/auth/callback?token=<accessToken>&refreshToken=<refreshToken>
```

FE cần có route `/auth/callback` để xử lý:

```js
// Ví dụ xử lý trong route /auth/callback
const params = new URLSearchParams(window.location.search);
const accessToken = params.get('token');
const refreshToken = params.get('refreshToken');

if (accessToken) {
  // Lưu token vào storage
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);

  // Decode để lấy thông tin user (không cần gọi API thêm)
  const payload = JSON.parse(atob(accessToken.split('.')[1]));
  // payload.sub       → userId
  // payload.username  → email
  // payload.roles     → ['organization.viewer']
  // payload.orgId     → orgId
  // payload.provider  → 'google'
  // payload.licenses  → { iam: 'full', cbm: 'full', ... }

  // Redirect vào app
  router.push('/dashboard');
}
```

### Thất bại → `/login`

```
https://your-fe.com/login?error=<error_code>
```

| Error Code | Ý nghĩa | Hướng xử lý |
|------------|---------|-------------|
| `email_conflict` | Email đã đăng ký bằng password | Hiển thị: *"Email này đã đăng ký bằng tài khoản thường. Vui lòng đăng nhập bằng email/password."* |
| `account_suspended` | Tài khoản bị khóa | Hiển thị: *"Tài khoản đã bị tạm khóa. Vui lòng liên hệ admin."* |
| `google_service_unavailable` | Google API lỗi | Hiển thị: *"Không thể kết nối Google. Vui lòng thử lại."* |
| `google_access_denied` | User từ chối consent | Hiển thị: *"Bạn chưa cấp quyền cho ứng dụng."* |
| `csrf_detected` | CSRF / session hết hạn | Tự động thử lại hoặc: *"Phiên đăng nhập hết hạn. Vui lòng thử lại."* |
| `app_not_found` | AppId không hợp lệ hoặc App không active | Hiển thị: *"Ứng dụng không tồn tại hoặc đã bị vô hiệu hóa."* |
| `sso_disabled` | App chưa bật SSO | Hiển thị: *"Tính năng SSO chưa được kích hoạt cho ứng dụng này."* |
| `domain_not_allowed` | Email domain không trong whitelist của App | Hiển thị: *"Email của bạn không được phép đăng nhập vào ứng dụng này."* |

```js
// Xử lý error trong route /login
const error = new URLSearchParams(window.location.search).get('error');
const errorMessages = {
  email_conflict: 'Email này đã đăng ký bằng tài khoản thường. Vui lòng đăng nhập bằng email/password.',
  account_suspended: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ admin.',
  google_service_unavailable: 'Không thể kết nối Google. Vui lòng thử lại.',
  google_access_denied: 'Bạn chưa cấp quyền cho ứng dụng.',
  csrf_detected: 'Phiên đăng nhập hết hạn. Vui lòng thử lại.',
};
if (error) showError(errorMessages[error] ?? 'Đăng nhập thất bại.');
```

---

## Bước 3 — Sử dụng token

Tất cả API calls sau khi login đều dùng `accessToken` trong header:

```js
fetch('https://api.x-or.cloud/dev/iam-v2/auth/profile', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
});
```

---

## Bước 4 — Refresh token

`accessToken` hết hạn sau **1 giờ**. Dùng `refreshToken` để lấy token mới (không cần login lại):

```
POST /auth/refresh-token
Content-Type: application/json

{ "refreshToken": "<refreshToken>" }
```

Response:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "ea32db...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

> Lưu ý: `refreshToken` có hiệu lực **7 ngày**. Nếu hết hạn, user phải đăng nhập lại.

---

## Bước 5 — Logout

```
POST /auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "refreshToken": "<refreshToken>" }
```

Response:
```json
{ "success": true, "message": "Logged out successfully" }
```

Sau khi logout, xóa token khỏi storage:
```js
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
```

---

## JWT Payload structure

```json
{
  "sub": "696de04c086778fa30691291",
  "username": "tech@kaisar.io",
  "status": "active",
  "roles": ["organization.viewer"],
  "orgId": "691eb9e6517f917943ae1f9d",
  "groupId": "",
  "agentId": "",
  "appId": "",
  "provider": "google",
  "licenses": {
    "iam": "full",
    "cbm": "full",
    "aiwm": "full",
    "noti": "full",
    "mona": "disabled"
  },
  "iat": 1773197856,
  "exp": 1773201456
}
```

| Field | Mô tả |
|-------|-------|
| `sub` | User ID |
| `username` | Email đăng nhập |
| `roles` | Danh sách role trong org |
| `orgId` | Organization ID |
| `provider` | `"google"` hoặc `"local"` |
| `licenses` | License của org cho từng service |
| `exp` | Unix timestamp hết hạn |

---

## Lưu ý triển khai

**CORS**: IAM cần được cấu hình cho phép origin của FE. Liên hệ BE để thêm nếu gặp lỗi CORS.

**Redirect URI**: Mỗi environment (local, staging, prod) cần được đăng ký riêng trong Google Cloud Console. Liên hệ BE để thêm domain mới.

**Token storage**: Nên dùng `httpOnly cookie` thay vì `localStorage` cho production để tránh XSS. Hiện tại dùng query param là tạm thời cho dev.
