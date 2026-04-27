# Air-Gap Builder — Thư mục làm việc

Đây là thư mục output của agent đóng gói container images cho môi trường air-gap.

Agent được invoke từ **repo root** và đọc hướng dẫn từ `CLAUDE_AGB.md` tại root. Xem file đó để biết đầy đủ workflow, danh sách images, và quy trình build.

Tất cả artifacts (`.tar.gz`, model weights) được lưu vào `artifacts/` — thư mục này **gitignored**, không commit vào repo.
