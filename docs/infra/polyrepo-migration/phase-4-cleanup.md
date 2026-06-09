# Phase 4 — Cleanup & Decommission Monorepo

Thực hiện sau khi tất cả service repos đã migrate xong và chạy ổn định trên production ít nhất **1 tuần**.

## 4.1 — Cập nhật pm2 ecosystem trên server

**Server:** `root@10.10.0.80`, path: `/opt/core-services`

Mỗi service giờ có repo riêng. Cập nhật deploy path trong `ecosystem.config.js`:

```js
// TRƯỚC
{ name: 'aiwm-api', cwd: '/opt/core-services', script: 'dist/services/aiwm/main.js' }

// SAU — mỗi service deploy độc lập vào folder riêng
{ name: 'aiwm-api', cwd: '/opt/core-aiwm', script: 'dist/services/aiwm/main.js' }
```

Cấu trúc thư mục mới trên server:

```
/opt/
├── core-aiwm/
├── core-iam/
├── core-cbm/
├── core-noti/
├── core-schd/
├── core-sys/
└── core-mona/
```

## 4.2 — Cập nhật deploy scripts

Nếu có shell script deploy, cập nhật path và git remote:

```bash
# Ví dụ deploy script mới cho từng service
cd /opt/core-<service>
git pull origin main
GITHUB_TOKEN=<token> npm ci
npm run build
pm2 restart <service>-api
```

## 4.3 — Cập nhật `.env` files

Mỗi service repo có `.env` riêng trên server. Copy từ monorepo và xóa các biến không dùng:

```bash
cp /opt/core-services/.env /opt/core-<service>/.env
# Giữ lại chỉ những biến service đó cần
```

## 4.4 — Archive monorepo

**Không xóa** — giữ lại để tham khảo lịch sử.

```bash
# Trên GitHub: Settings → Archive this repository
# Tên repo gốc: hydra-services → thêm note "ARCHIVED - migrated to polyrepo"
```

Hoặc đổi tên:

```bash
gh repo rename hydra-services hydra-services-archived
```

Thêm `ARCHIVED.md` vào root:

```markdown
# ARCHIVED

Repo này đã được migrate sang polyrepo. Xem:
- Libs: github.com/<org>/core-libs
- Services: github.com/<org>/core-aiwm, core-iam, core-cbm, ...

Archive date: <date>
```

## 4.5 — Dọn dẹp server

Sau khi tất cả service chạy ổn từ repo mới:

```bash
# Backup trước khi xóa
tar -czf /backup/core-services-$(date +%Y%m%d).tar.gz /opt/core-services

# Xóa monorepo deploy cũ
rm -rf /opt/core-services
```

## 4.6 — Checklist hoàn thành Phase 4

- [ ] Tất cả 7 service repos chạy ổn trên production ≥ 1 tuần
- [ ] pm2 ecosystem cập nhật và reload
- [ ] `.env` từng service copy sang repo mới
- [ ] Deploy scripts cập nhật
- [ ] Monorepo archived trên GitHub
- [ ] Server `/opt/core-services` backup + xóa
- [ ] Tất cả agents được thông báo về repo mới
