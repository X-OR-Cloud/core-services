# License Management

Thư mục này chứa các script quản lý license key cho từng org (khách hàng).

---

## Files

| File | Mô tả |
|------|-------|
| `orgs.json` | Danh sách org và secret — **KHÔNG commit** |
| `orgs.example.json` | Ví dụ format của `orgs.json` |
| `add-org.js` | Thêm org mới với secret tự sinh vào `orgs.json` |
| `gen-license.js` | Tạo file `.license` cho org theo ngày hết hạn |
| `output/` | Chứa các file `.license` đã tạo |

---

## Workflow

### Bước 1 — Thêm org mới

```bash
node licenses/add-org.js <slug> [name]
```

**Ví dụ:**
```bash
node licenses/add-org.js mb-bank "MB Bank"
node licenses/add-org.js hdbank "HD Bank"
node licenses/add-org.js dev
```

- `slug`: định danh duy nhất, chỉ dùng chữ thường, số và dấu `-`
- `name`: tên hiển thị (nếu bỏ qua thì dùng slug)
- Secret 32-byte hex được tự sinh và lưu vào `orgs.json`

---

### Bước 2 — Tạo file license

```bash
node licenses/gen-license.js <slug> <expiry YYYY-MM-DD>
```

**Ví dụ:**
```bash
node licenses/gen-license.js mb-bank 2027-04-25
```

Output:
- **`LICENSE_SECRET`** — env var dùng khi build service
- **`output/<slug>.license`** — file deploy lên server khách

---

### Bước 3 — Build & deploy

```bash
# Build với secret của org đó
LICENSE_SECRET=<secret> nx run aiwm:build

# Deploy file .license lên server khách
scp output/mb-bank.license user@server:/path/to/.license
```

---

## Bảo mật

- `orgs.json` đã được thêm vào `.gitignore` — không bao giờ commit file này
- Backup `orgs.json` ở nơi an toàn (password manager, vault)
- Mỗi org có secret riêng — nếu lộ, chỉ cần tạo lại secret cho org đó
