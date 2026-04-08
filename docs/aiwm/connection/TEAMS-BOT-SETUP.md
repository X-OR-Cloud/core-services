# Microsoft Teams Bot Setup Guide

Hướng dẫn tạo Teams Bot và khai báo vào Connection Worker.

---

## Yêu cầu

- Tài khoản **Microsoft 365 Business Basic** (hoặc cao hơn)
- Tài khoản **Azure** (free tier đủ dùng) — để tạo App Registration
- Server có public HTTPS URL (hoặc dùng ngrok khi dev)

---

## Bước 1 — Tạo Azure AD App Registration

1. Đăng nhập [portal.azure.com](https://portal.azure.com)
2. Vào **Azure Active Directory** → **App registrations** → **New registration**
3. Điền:
   - **Name**: tên bot (ví dụ `hydra-bot`)
   - **Supported account types**: _Accounts in any organizational directory (Multitenant)_
   - **Redirect URI**: bỏ trống
4. Nhấn **Register**
5. Copy **Application (client) ID** → đây là `appId`
6. Vào **Certificates & secrets** → **New client secret**
   - Description: `hydra-bot-secret`
   - Expires: 24 months
7. Copy **Value** ngay lập tức (chỉ hiển thị 1 lần) → đây là `appPassword`
8. Copy **Directory (tenant) ID** từ trang Overview → đây là `tenantId`

---

## Bước 2 — Đăng ký Bot tại Azure Bot Service

1. Tại [portal.azure.com](https://portal.azure.com), tìm kiếm **Azure Bot** → **Create**
2. Điền:
   - **Bot handle**: tên định danh bot
   - **Subscription / Resource group**: chọn hoặc tạo mới
   - **Microsoft App ID**: chọn _Use existing app registration_ → nhập `appId` từ Bước 1
3. Nhấn **Review + create** → **Create**
4. Sau khi tạo xong, vào bot resource → **Configuration**
5. Điền **Messaging endpoint**: `https://<your-domain>/connections/<connectionId>/webhook`
6. Nhấn **Apply**

> Khi dev local, thay `<your-domain>` bằng ngrok URL: `ngrok http 3003`

---

## Bước 3 — Thêm Teams Channel

1. Trong bot resource → **Channels** → **Microsoft Teams** → **Apply**
2. Chấp nhận Terms of Service

---

## Bước 4 — Tạo Teams App Manifest

1. Vào [Teams Developer Portal](https://dev.teams.microsoft.com)
2. **Apps** → **New app**
3. Điền thông tin cơ bản (tên, mô tả, icon)
4. Vào **App features** → **Bot**
   - **Select an existing bot** → nhập `appId` từ Bước 1
   - **Scopes**: chọn _Team_ và/hoặc _Personal_
5. **Publish** → **Download app package** (file `.zip`)

---

## Bước 5 — Install Bot vào Teams Channel

1. Mở Microsoft Teams
2. Vào Teams channel cần kết nối
3. **...** → **Manage team** → **Apps** → **Upload a custom app**
4. Upload file `.zip` từ Bước 4
5. Bot xuất hiện trong channel

---

## Bước 6 — Khai báo Connection

Tạo Connection mới qua API hoặc UI với payload:

```json
{
  "name": "My Teams Bot",
  "provider": "teams",
  "status": "active",
  "config": {
    "appId": "<Application (client) ID từ Bước 1>",
    "appPassword": "<Client secret Value từ Bước 1>",
    "tenantId": "<Directory (tenant) ID từ Bước 1>"
  },
  "routes": [
    {
      "serverId": "<Teams teamId — xem hướng dẫn bên dưới>",
      "channelId": "<Teams channelId — xem hướng dẫn bên dưới>",
      "agentId": "<agentId>",
      "requireMention": true
    }
  ]
}
```

### Lấy teamId và channelId

Trong Teams, click chuột phải vào channel → **Get link to channel**.  
URL có dạng: `https://teams.microsoft.com/l/channel/<channelId>/...?groupId=<teamId>&...`

- `groupId` = `teamId` → điền vào `serverId`
- `channelId` (phần đầu URL sau `/channel/`) → URL decode rồi điền vào `channelId`

---

## Lưu ý

| Trường | Bắt buộc | Mô tả |
|--------|----------|-------|
| `appId` | Có | Microsoft App ID (Application client ID) |
| `appPassword` | Có | Azure AD client secret |
| `tenantId` | Có | Azure AD Directory tenant ID |
| `serverId` | Không | teamId — nếu bỏ trống, match mọi team |
| `channelId` | Không | channelId — nếu bỏ trống, match mọi channel |
| `requireMention` | Không | Chỉ reply khi @mention bot (khuyến nghị: `true`) |

---

## Troubleshooting

**Bot không nhận message:**
- Kiểm tra Messaging endpoint URL đúng chưa (phải là HTTPS)
- Kiểm tra `status: active` trong Connection
- Xem log connection runner: `nx run aiwm:con`

**JWT verification failed:**
- Kiểm tra `appId` trong Connection config khớp với App Registration
- Kiểm tra clock skew giữa server và Microsoft (nên sync NTP)

**401 từ Graph API khi gửi message:**
- Kiểm tra `appPassword` còn hiệu lực (client secret chưa expire)
- Kiểm tra Azure Bot Service đã add Teams channel chưa (Bước 3)
