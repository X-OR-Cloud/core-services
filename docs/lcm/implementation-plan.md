# LCM — Implementation Plan

## 1. Port Allocation

| Thuộc tính | Giá trị |
|-----------|---------|
| Service name | `lcm` |
| Dev port | `3011` |
| Prod API | `3410–3413` |
| Prod reserved | `3414–3419` |
| Database | `core_lcm` |

Cần cập nhật:
- [ ] `docs/PORT-ALLOCATION.md` — thêm LCM vào bảng
- [ ] `CLAUDE.md` — cập nhật services table

---

## 2. Thứ tự triển khai

### Phase 1 — Foundation (ưu tiên cao nhất)

Mục tiêu: service khởi động được, health check pass, auth hoạt động.

| Task | Verify |
|------|--------|
| Scaffold service `lcm` từ template | `nx run lcm:build` thành công |
| Cấu hình MongoDB connection (`core_lcm`) | `/health` trả về `mongodb: connected` |
| Setup JWT auth (dùng chung secret IAM) | `GET /contracts` với token hợp lệ trả về 200, không có token trả về 401 |
| Cấu hình `GlobalExceptionFilter`, `CorrelationIdMiddleware` | Error response có `correlationId` |
| Swagger setup | `/api-docs` load được |

### Phase 2 — Core Data Modules

Mục tiêu: CRUD đủ cho tất cả entities, data model đúng conventions.

Thứ tự implement (theo dependency):

```
1. result        # Lookup table, không phụ thuộc ai
2. partner       # Lookup table
3. team          # Phụ thuộc không có
4. staff         # Phụ thuộc team
5. customer      # Phụ thuộc partner, staff
6. contract      # Phụ thuộc partner, customer
7. activity      # Phụ thuộc contract, customer, staff, result
8. transaction   # Phụ thuộc contract, customer, partner
9. investigation # Phụ thuộc customer, staff
10. reference    # Phụ thuộc customer
11. performance  # Phụ thuộc staff
```

Với mỗi module:

| Task | Verify |
|------|--------|
| Schema (`.schema.ts`) | `tsc --noEmit` pass |
| DTOs (create, update) | Validation đúng |
| Service (kế thừa `BaseService`) | Unit test CRUD |
| Controller | `curl POST/GET/PATCH/DELETE` thành công |

### Phase 3 — Import Pipeline

Mục tiêu: import file Excel end-to-end hoạt động.

| Task | Verify |
|------|--------|
| `ImportData` module (schema + CRUD API) | `POST /import-data` tạo record |
| File storage integration (S3/MinIO) | Upload file thành công, lấy `fileId` |
| `ImportProcessorJob` — parse Excel sheets | Job chạy với file test, status = 'done' |
| Field mapping logic (Excel column → entity field) | Data trong MongoDB đúng |
| `PUT /import-data/:id/process` endpoint | Enqueue job, status chuyển về 'queued' |
| Error handling — row-level errors | `processResult.errors` có đủ thông tin |
| `PUT /import-data/:id/cancel` | Status chuyển về 'cancelled' |

### Phase 4 — Payment Sync

Mục tiêu: giao dịch từ MSSQL đồng bộ tự động vào MongoDB.

| Task | Verify |
|------|--------|
| MSSQL connection service | Connect được, query test pass |
| `PaymentSyncJob` — core sync logic | Transactions xuất hiện trong `lcm_transactions` |
| Cron trigger mỗi 30 giây | Log hiển thị job chạy đúng interval |
| Idempotency (không duplicate) | Chạy job 2 lần với cùng data: không tăng records |
| MSSQL down handling | Job fail gracefully, không crash worker |

### Phase 5 — Export & Report

Mục tiêu: xuất dữ liệu và báo cáo cơ bản.

| Task | Verify |
|------|--------|
| `ExportData` module | `POST /export-data` tạo job |
| Export job — generate Excel/CSV | File download được, data đúng |
| `GET /reports/summary` | Response đúng format |
| `GET /reports/activity-stats` | Aggregation query chạy được |
| `GET /reports/staff-performance` | KPI data đúng |

### Phase 6 — Notification & Polish

| Task | Verify |
|------|--------|
| Gửi notification khi import done/fail | NOTI service nhận event |
| Staff-IAM lookup với Redis cache | Latency giảm so với per-request lookup |
| PM2 config trong `ecosystem.config.js` | `pm2 start` thành công |
| Cập nhật `docs/PORT-ALLOCATION.md` | Đồng nhất |

---

## 3. Những quyết định cần confirm trước khi code

Các câu hỏi mở từ design docs — cần anh confirm trước để tránh rework:

| # | Câu hỏi | Đề xuất mặc định |
|---|---------|-----------------|
| 1 | File upload: API nhận multipart hay client upload thẳng lên S3? | Client upload S3, API nhận `fileId` |
| 2 | DataSyncJob: cần hay không cần ở v1? | Bỏ v1, inline update trong API |
| 3 | PTP reminder cron: LCM tự làm hay dùng SCHD service? | SCHD service |
| 4 | MSSQL có nhiều đối tác không? Config per-partner? | Để open, thiết kế pluggable |
| 5 | Module `call` (voice DB riêng): scope v1 hay v2? | v2 |
| 6 | Report: on-demand aggregation hay pre-compute? | On-demand aggregation ở v1 |

---

## 4. Effort Estimate (rough)

| Phase | Estimate |
|-------|---------|
| Phase 1 — Foundation | 0.5 ngày |
| Phase 2 — Core Modules (11 modules) | 3–4 ngày |
| Phase 3 — Import Pipeline | 2 ngày |
| Phase 4 — Payment Sync | 1 ngày |
| Phase 5 — Export & Report | 1.5 ngày |
| Phase 6 — Notification & Polish | 0.5 ngày |
| **Tổng** | **~9–10 ngày** |

---

## 5. Checklist trước khi ship v1

```
[ ] nx run lcm:build — zero errors
[ ] tsc --noEmit — zero errors
[ ] All CRUD endpoints tested với Postman/curl
[ ] Import flow: test với file Excel thực từ đối tác
[ ] Payment sync: test với MSSQL staging data
[ ] Health check: /health trả về 200
[ ] Swagger: /api-docs load đủ endpoints
[ ] PM2 config: api00, api01, worker00
[ ] PORT-ALLOCATION.md cập nhật
[ ] CLAUDE.md services table cập nhật
[ ] Changelog v{version} tạo
```
