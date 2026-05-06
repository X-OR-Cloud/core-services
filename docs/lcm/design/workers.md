# LCM — Workers (BullMQ)

LCM có 3 BullMQ jobs chạy ở `APP_MODE=wrk`. Thay thế hoàn toàn RabbitMQ consumer và custom polling workers của lcm cũ.

## 1. Tổng quan

| Job | Queue | Trigger | Interval |
|-----|-------|---------|----------|
| `ImportProcessorJob` | `lcm:import` | API call (manual) | On-demand |
| `PaymentSyncJob` | `lcm:payment-sync` | Cron | Mỗi 30 giây |
| `DataSyncJob` | `lcm:data-sync` | Cron | Mỗi 5 phút |

Tất cả jobs dùng Redis instance chung của monorepo.

---

## 2. ImportProcessorJob

### Mục đích

Xử lý file Excel/CSV do đối tác gửi. Đọc từng sheet, validate và upsert dữ liệu vào các collections tương ứng.

### Trigger

```
PUT /import-data/:id/process
```

API set `status = 'queued'` và enqueue job vào `lcm:import`.

### Flow

```
1. Load ImportData document từ MongoDB (theo id trong job data)
2. Validate: status phải là 'queued', file phải tồn tại
3. Set status = 'processing'
4. Đọc file từ storage (theo fileId)
5. Parse từng sheet theo settings.sheets:
   ├── sheet → 'customers'   → upsert lcm_customers (key: code)
   ├── sheet → 'contracts'   → upsert lcm_contracts (key: code)
   ├── sheet → 'transactions'→ upsert lcm_transactions (key: externalRef)
   ├── sheet → 'investigations' → insert lcm_investigations
   ├── sheet → 'references'  → upsert lcm_references
   └── sheet → 'activities'  → insert lcm_activities
6. Nếu settings.closeAll = true: đóng contracts cũ không có trong file
7. Cập nhật processResult (totalRows, successRows, failedRows, errors)
8. Set status = 'done' hoặc 'failed'
9. Cập nhật cached fields trên Customer (lovdd, contractCodes, nextOVDDate, ...)
```

### Job Config

```typescript
@Processor('lcm:import')
export class ImportProcessorJob {
  // Concurrency = 1 per partner để tránh race condition
  // attempts = 3, backoff = 5000ms
  // removeOnComplete = { age: 86400 }  // giữ 24h để debug
  // removeOnFail = false               // giữ lại failed jobs để investigate
}
```

### Idempotency

- Dùng `upsert` (không `insert`) cho customers, contracts để tránh duplicate khi retry
- Transactions dùng `externalRef` làm unique key
- Activities không upsert (có thể duplicate nếu retry) — cần idempotency key riêng nếu cần

### Error Handling

- Row-level errors: ghi vào `processResult.errors`, không dừng toàn bộ job
- Critical errors (file không đọc được, DB không connect): throw → BullMQ retry
- Sau 3 lần fail: status = 'failed', ghi error vào ImportData document

---

## 3. PaymentSyncJob

### Mục đích

Đồng bộ giao dịch thanh toán từ MSSQL (hệ thống legacy của đối tác) sang MongoDB `lcm_transactions`. Giữ lại logic từ `payment-migration.worker.ts` của lcm cũ.

### Trigger

Cron mỗi 30 giây (dùng `@nestjs/schedule`):

```typescript
@Cron('*/30 * * * * *')
async schedulePaymentSync() {
  await this.paymentSyncQueue.add('sync', {}, {
    jobId: 'payment-sync-singleton',  // Đảm bảo chỉ có 1 job tại một thời điểm
    removeOnComplete: true,
    removeOnFail: false,
  });
}
```

### Flow

```
1. Kết nối MSSQL (connection pool)
2. Query records chưa sync:
   SELECT TOP 100 * FROM REPAY
   WHERE SYNCED_AT IS NULL
   ORDER BY PAYMENT_DATE ASC
3. Với mỗi record:
   a. Map sang Transaction document
   b. Upsert vào lcm_transactions (key: externalRef)
   c. UPDATE REPAY SET SYNCED_AT = NOW() WHERE ID = ?
4. Nếu processed < 100: log "sync complete"
   Nếu processed = 100: log "more records pending"
```

### MSSQL → Transaction field mapping

| MSSQL Column | Transaction Field | Ghi chú |
|-------------|------------------|---------|
| `CONTRACT_NO` | `contractCode` | |
| `CUSTOMER_ID` | `customerCode` | Cần lookup nếu format khác |
| `PAYMENT_AMOUNT` | `amount` | |
| `PAYMENT_DATE` | `date` | |
| `PARTNER_CODE` | `partnerCode` | |
| `TRANSACTION_ID` | `externalRef` | Unique key để tránh duplicate |

### Config

```typescript
// Concurrency = 1 (singleton job)
// attempts = 1 (nếu fail, cron sẽ trigger lại sau 30s)
// Không retry ngay — tránh thundering herd nếu MSSQL down
```

### Lưu ý

- Giữ MSSQL connection pool riêng, không reuse với MongoDB connection
- Nếu MSSQL down: job fail, cron trigger lại sau 30s, không ảnh hưởng API mode
- `SYNCED_AT` update trên MSSQL là xác nhận "đã sync" — không rollback nếu MongoDB write fail (eventual consistency)

---

## 4. DataSyncJob

### Mục đích

Cập nhật các cached/computed fields trên Customer sau khi có thay đổi ở contracts hoặc transactions. Thay thế cơ chế `queuedAt`/`syncedAt` flag polling của lcm cũ.

> Đây là job tùy chọn (optional) ở v1. Nếu API tự cập nhật inline khi tạo/sửa activity và transaction, job này có thể bỏ.

### Trigger

Cron mỗi 5 phút:

```typescript
@Cron('0 */5 * * * *')
async scheduleDataSync() {
  await this.dataSyncQueue.add('sync', {});
}
```

Hoặc được enqueue inline khi có batch import xong (từ `ImportProcessorJob`).

### Flow

```
1. Lấy danh sách customers có dấu hiệu cần recompute:
   - updatedAt > lastSyncedAt
   - Hoặc contracts/transactions cập nhật trong vòng 5 phút qua
2. Với mỗi customer:
   a. Tính lại lovdd (max ovdDays trong tất cả active contracts)
   b. Tính lại tpaim / tpafpim (tổng thanh toán trong tháng)
   c. Cập nhật lastPaidDate, lastPaidAmount
   d. Cập nhật nextOVDDate
3. Bulk update lcm_customers
```

### Quyết định thiết kế

**Option A — Inline update (đơn giản hơn)**:
Mỗi khi tạo activity hoặc transaction → cập nhật customer ngay trong cùng request. Không cần DataSyncJob.

**Option B — Deferred via job (lcm cũ đang dùng)**:
Cập nhật async, eventual consistency.

→ **Đề xuất**: dùng Option A cho v1. Chỉ tạo DataSyncJob nếu volume import lớn gây bottleneck.

---

## 5. Worker Module Structure

```
workers/
├── workers.module.ts          # Import tất cả job processors
├── import-processor/
│   ├── import-processor.module.ts
│   ├── import-processor.job.ts   # @Processor('lcm:import')
│   └── import-processor.service.ts  # Business logic, inject các services
├── payment-sync/
│   ├── payment-sync.module.ts
│   ├── payment-sync.job.ts       # @Processor('lcm:payment-sync')
│   ├── payment-sync.scheduler.ts # @Cron trigger
│   └── mssql.service.ts          # MSSQL connection & queries
└── data-sync/
    ├── data-sync.module.ts
    └── data-sync.job.ts          # Optional, xem quyết định thiết kế
```

## 6. BullMQ Dashboard

Monorepo đang dùng Bull Board (hoặc tương đương) cho các service khác — LCM nên mount dashboard tại `/queues` (chỉ accessible nội bộ / với admin role).
