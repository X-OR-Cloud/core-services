# LCM — Integrations

## 1. Internal — IAM Service

### Auth

LCM dùng chung JWT secret với IAM. Không tự issue token.

```
User/Staff → POST /iam/auth/login → JWT token
Staff → GET /lcm/contracts → JwtAuthGuard validates token
```

### Staff ↔ IAM User mapping

Mỗi Staff record có field `iamUserId` link sang IAM user. Khi staff gọi API:

1. `JwtAuthGuard` verify token → lấy `userId` từ payload
2. LCM lookup `staffs.iamUserId = userId` → lấy `staffCode`
3. `staffCode` được inject vào `RequestContext` để dùng trong service layer

```typescript
// Trong StaffService hoặc middleware
async resolveStaffFromContext(context: RequestContext): Promise<string> {
  const staff = await this.staffService.findOne({ iamUserId: context.userId });
  return staff?.code;
}
```

**Lưu ý**: Nếu user là admin (không có staff record), `staffCode` sẽ là `null`. API vẫn hoạt động nhưng activity sẽ không gắn staffCode.

---

## 2. Internal — NOTI Service

### Khi nào LCM gửi notification

| Event | Recipient | Kênh | Nội dung |
|-------|-----------|------|---------|
| Import hoàn thành | Người upload | In-app | "File {fileName} đã xử lý xong: {successRows}/{totalRows} records" |
| Import thất bại | Người upload | In-app | "File {fileName} xử lý lỗi: {error}" |
| PTP đến hạn | Staff được phân công | In-app | "KH {customerCode} hẹn trả {amount} hôm nay" |
| Contract quá hạn mới | Supervisor | In-app | "{N} hợp đồng mới được phân vào nhóm của bạn" |

### Cách gọi NOTI

LCM gọi NOTI qua HTTP (service-to-service), không qua BullMQ:

```typescript
// Trong ImportProcessorJob sau khi xong
await this.httpService.post(`${NOTI_URL}/internal/send`, {
  userId: importData.createdBy.userId,
  type: 'import_complete',
  payload: {
    fileName: importData.fileName,
    successRows: result.successRows,
    totalRows: result.totalRows,
  },
});
```

**Scope v1**: chỉ implement notification cho import complete/fail. PTP reminder để v2.

---

## 3. External — Partner Systems

### File Import (push model)

Đối tác gửi file Excel theo chu kỳ (thường là hàng ngày hoặc hàng tuần). Hai cách:

**Option A — Upload qua API (đang dùng):**
```
Đối tác → POST /lcm/import-data (upload file) → PUT /lcm/import-data/:id/process
```

**Option B — SFTP/S3 polling (nâng cao):**
```
Đối tác upload lên S3/SFTP → LCM poll và auto-import
```
→ Option A đủ cho v1.

### Payment Sync (MSSQL — pull model)

LCM kéo dữ liệu thanh toán từ MSSQL của đối tác (legacy). Chi tiết xem [workers.md](workers.md#3-paymentsynccjob).

Không có webhook từ phía đối tác cho khoản thanh toán — đây là hạn chế của hệ thống cũ.

### Partner API (future)

Một số đối tác hiện đại có REST API riêng. Trong tương lai có thể replace MSSQL sync bằng webhook hoặc API polling trực tiếp. LCM nên thiết kế `PaymentSyncJob` đủ modular để swap implementation.

---

## 4. External — File Storage

File import/export cần được lưu trên object storage, không lưu trong MongoDB.

| Môi trường | Storage |
|-----------|---------|
| Development | MinIO (local Docker) |
| Production | S3-compatible (AWS S3 hoặc Cloudflare R2) |

### Upload flow

```
Client → POST /lcm/import-data
  Body: multipart/form-data (file + metadata)
  LCM → upload file lên S3 → lấy fileId
  LCM → tạo ImportData document với fileId
  Response: { _id, fileId, status: 'new' }
```

Hoặc client tự upload lên S3 trước (presigned URL), sau đó POST chỉ truyền `fileId`. Cách này giảm tải cho API server.

→ **Đề xuất**: dùng presigned URL upload để API server không xử lý binary.

---

## 5. Dependency Map

```
LCM
├── depends on:
│   ├── IAM          (JWT validation, user lookup)
│   ├── Redis        (BullMQ queues)
│   ├── MongoDB      (core_lcm database)
│   ├── MSSQL        (payment source — external legacy)
│   └── S3/MinIO     (file storage)
│
└── notifies:
    └── NOTI         (import events — HTTP call)
```

LCM không phụ thuộc vào CBM, AIWM hay các service nghiệp vụ khác. Đây là service độc lập.

---

## 6. Các điểm cần quyết định

| Câu hỏi | Option | Đề xuất |
|---------|--------|---------|
| File upload: API nhận multipart hay presigned URL? | Multipart / Presigned | Presigned — giảm tải API server |
| PTP reminder: LCM tự cron hay SCHD service? | Self-cron / SCHD | SCHD service nếu đã có, tránh phân tán cron jobs |
| Staff-IAM mapping: lookup mỗi request hay cache? | Per-request / Cache | Cache trong Redis, TTL 5 phút |
| MSSQL: đối tác nào có MSSQL? Có cần config per-partner không? | Single / Multi | Multi — mỗi partner có MSSQL config riêng |
